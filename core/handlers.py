"""Async WebSocket handlers for real-time monitoring and GPU disconnect API endpoints"""

import asyncio
import psutil
import logging
import json
from datetime import datetime
from fastapi import WebSocket, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from . import config
from .gpu_disconnect import disconnect_gpu, disconnect_multiple_gpus, get_available_methods, GPUDisconnectError

logger = logging.getLogger(__name__)

# Global WebSocket connections
websocket_connections = set()


# Pydantic models for API requests
class DisconnectRequest(BaseModel):
    method: str = "auto"
    down_time: float = 5.0


class MultiDisconnectRequest(BaseModel):
    gpu_indices: list[int]
    method: str = "auto"
    down_time: float = 5.0


def register_handlers(app, monitor):
    """Register FastAPI WebSocket handlers"""
    
    @app.websocket("/socket.io/")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        websocket_connections.add(websocket)
        logger.debug('Dashboard client connected')
        
        if not monitor.running:
            monitor.running = True
            asyncio.create_task(monitor_loop(monitor, websocket_connections))
        
        try:
            # Keep connection alive
            while True:
                await websocket.receive_text()
        except Exception as e:
            logger.debug(f'Dashboard client disconnected: {e}')
        finally:
            websocket_connections.discard(websocket)
    
    # GPU Disconnect API Endpoints
    @app.get("/api/gpu/{gpu_id}/disconnect/methods")
    async def get_disconnect_methods(gpu_id: int):
        """Get available disconnect methods for a GPU"""
        try:
            from .gpu_disconnect import is_wsl2
            
            methods = await get_available_methods(gpu_id)
            in_wsl2 = is_wsl2()
            
            return {
                "gpu_id": gpu_id,
                "available_methods": methods,
                "default_method": "auto",
                "environment": {
                    "is_wsl2": in_wsl2,
                    "recommended_method": "simulated" if in_wsl2 else "auto",
                    "pci_available": not in_wsl2
                }
            }
        except Exception as e:
            logger.error(f"Error getting disconnect methods for GPU {gpu_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/gpu/{gpu_id}/disconnect")
    async def disconnect_single_gpu(gpu_id: int, request: DisconnectRequest):
        """Disconnect and reconnect a specific GPU"""
        try:
            logger.info(f"Received disconnect request for GPU {gpu_id}, method: {request.method}, down_time: {request.down_time}s")
            
            result = await disconnect_gpu(
                gpu_index=gpu_id,
                method=request.method,
                down_time=request.down_time
            )
            
            return JSONResponse(content=result)
            
        except GPUDisconnectError as e:
            logger.error(f"GPU disconnect error: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Unexpected error during GPU {gpu_id} disconnect: {e}")
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
    
    @app.post("/api/gpu/disconnect-multiple")
    async def disconnect_multiple(request: MultiDisconnectRequest):
        """Disconnect and reconnect multiple GPUs simultaneously"""
        try:
            logger.info(f"Received multi-disconnect request for GPUs {request.gpu_indices}, method: {request.method}, down_time: {request.down_time}s")
            
            result = await disconnect_multiple_gpus(
                gpu_indices=request.gpu_indices,
                method=request.method,
                down_time=request.down_time
            )
            
            return JSONResponse(content=result)
            
        except GPUDisconnectError as e:
            logger.error(f"Multi-GPU disconnect error: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Unexpected error during multi-GPU disconnect: {e}")
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
    
    @app.get("/api/gpu/verify-disconnect/{gpu_id}")
    async def verify_gpu_disconnect(gpu_id: int):
        """Verify GPU visibility - check if GPU exists via NVML, nvidia-smi, and sysfs"""
        import subprocess
        from pathlib import Path
        
        result = {
            "gpu_id": gpu_id,
            "timestamp": datetime.now().isoformat(),
            "checks": {}
        }
        
        # Check NVML device count
        try:
            import pynvml
            device_count = pynvml.nvmlDeviceGetCount()
            result["checks"]["nvml_total_devices"] = device_count
            result["checks"]["nvml_status"] = "success"
            
            # Try to get handle for specific GPU
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(gpu_id)
                pci_info = pynvml.nvmlDeviceGetPciInfo(handle)
                result["checks"]["nvml_gpu_exists"] = True
                result["checks"]["nvml_pci_bdf"] = pci_info.busId.decode('utf-8')
            except Exception as e:
                result["checks"]["nvml_gpu_exists"] = False
                result["checks"]["nvml_gpu_error"] = str(e)
        except Exception as e:
            result["checks"]["nvml_status"] = f"error: {e}"
        
        # Check nvidia-smi
        try:
            smi_result = subprocess.run(
                ['nvidia-smi', '--query-gpu=index,name,pci.bus_id', '--format=csv,noheader'],
                capture_output=True,
                text=True,
                timeout=5
            )
            result["checks"]["nvidia_smi_success"] = smi_result.returncode == 0
            if smi_result.returncode == 0:
                gpu_lines = [line for line in smi_result.stdout.strip().split('\n') if line.startswith(str(gpu_id))]
                result["checks"]["nvidia_smi_gpu_found"] = len(gpu_lines) > 0
                if gpu_lines:
                    result["checks"]["nvidia_smi_output"] = gpu_lines[0]
            else:
                result["checks"]["nvidia_smi_error"] = smi_result.stderr
        except Exception as e:
            result["checks"]["nvidia_smi_success"] = False
            result["checks"]["nvidia_smi_error"] = str(e)
        
        # Check PCI sysfs path
        if "nvml_pci_bdf" in result["checks"]:
            bdf = result["checks"]["nvml_pci_bdf"]
            pci_path = Path(f"/sys/bus/pci/devices/{bdf}")
            result["checks"]["pci_device_exists"] = pci_path.exists()
            result["checks"]["pci_device_path"] = str(pci_path)
        
        return JSONResponse(content=result)
    
    @app.get("/api/gpu/disconnect/status")
    async def get_disconnect_status():
        """Get current disconnect operation status and system capabilities"""
        try:
            from .gpu_disconnect import is_wsl2
            
            # Check root permissions
            import os
            has_root = os.geteuid() == 0
            
            # Check nvidia-smi availability
            import shutil
            has_nvidia_smi = shutil.which("nvidia-smi") is not None
            
            # Check sysfs access
            from pathlib import Path
            sysfs_accessible = Path("/sys/bus/pci/devices").exists()
            
            # WSL2 detection
            in_wsl2 = is_wsl2()
            
            # Determine readiness based on environment
            if in_wsl2:
                ready = has_nvidia_smi  # WSL2 only needs nvidia-smi for some methods
            else:
                ready = has_root and has_nvidia_smi and sysfs_accessible
            
            warnings = []
            if in_wsl2:
                warnings.append("WSL2 detected - PCI disconnect unavailable, using simulated/soft methods")
            else:
                if not has_root:
                    warnings.append("Root privileges required for PCI operations")
                if not has_nvidia_smi:
                    warnings.append("nvidia-smi not found in PATH")
                if not sysfs_accessible:
                    warnings.append("PCI sysfs interface not accessible")
            
            return {
                "ready": ready,
                "environment": {
                    "is_wsl2": in_wsl2,
                    "platform": "WSL2" if in_wsl2 else "Native Linux"
                },
                "permissions": {
                    "root_access": has_root,
                    "nvidia_smi_available": has_nvidia_smi,
                    "sysfs_accessible": sysfs_accessible
                },
                "capabilities": {
                    "pci_disconnect": not in_wsl2 and sysfs_accessible,
                    "nvidia_reset": has_nvidia_smi,
                    "simulated": True,
                    "memory_flood": True  # Uses ctypes + CUDA Driver API (zero dependencies)
                },
                "warnings": [w for w in warnings if w]
            }
            
        except Exception as e:
            logger.error(f"Error checking disconnect status: {e}")
            raise HTTPException(status_code=500, detail=str(e))


async def monitor_loop(monitor, connections):
    """Async background loop that collects and emits GPU data"""
    # Determine update interval based on whether any GPU uses nvidia-smi
    uses_nvidia_smi = any(monitor.use_smi.values()) if hasattr(monitor, 'use_smi') else False
    update_interval = config.NVIDIA_SMI_INTERVAL if uses_nvidia_smi else config.UPDATE_INTERVAL
    
    if uses_nvidia_smi:
        logger.info(f"Using nvidia-smi polling interval: {update_interval}s")
    else:
        logger.info(f"Using NVML polling interval: {update_interval}s")
    
    while monitor.running:
        try:
            # Collect data concurrently
            gpu_data, processes = await asyncio.gather(
                monitor.get_gpu_data(),
                monitor.get_processes()
            )
            
            system_info = {
                'cpu_percent': psutil.cpu_percent(percpu=False),
                'memory_percent': psutil.virtual_memory().percent,
                'timestamp': datetime.now().isoformat()
            }
            
            data = {
                'mode': config.MODE,
                'node_name': config.NODE_NAME,
                'gpus': gpu_data,
                'processes': processes,
                'system': system_info
            }
            
            # Send to all connected clients
            if connections:
                disconnected = set()
                for websocket in connections:
                    try:
                        await websocket.send_text(json.dumps(data))
                    except:
                        disconnected.add(websocket)
                
                # Remove disconnected clients
                connections -= disconnected
            
        except Exception as e:
            logger.error(f"Error in monitor loop: {e}")
        
        await asyncio.sleep(update_interval)

