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
from .gpu_test_workloads import workload_manager, WorkloadType

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


class WorkloadRequest(BaseModel):
    gpu_id: int
    workload_type: str = "compute_intensive"
    duration: float = 10.0


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
            methods = await get_available_methods(gpu_id)
            return {
                "gpu_id": gpu_id,
                "available_methods": methods,
                "default_method": "auto"
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
    
    @app.get("/api/gpu/disconnect/status")
    async def get_disconnect_status():
        """Get current disconnect operation status and system capabilities"""
        try:
            # Check root permissions
            import os
            has_root = os.geteuid() == 0
            
            # Check nvidia-smi availability
            import shutil
            has_nvidia_smi = shutil.which("nvidia-smi") is not None
            
            # Check sysfs access
            from pathlib import Path
            sysfs_accessible = Path("/sys/bus/pci/devices").exists()
            
            return {
                "ready": has_root and has_nvidia_smi and sysfs_accessible,
                "permissions": {
                    "root_access": has_root,
                    "nvidia_smi_available": has_nvidia_smi,
                    "sysfs_accessible": sysfs_accessible
                },
                "warnings": [
                    "Root privileges required for PCI operations" if not has_root else None,
                    "nvidia-smi not found in PATH" if not has_nvidia_smi else None,
                    "PCI sysfs interface not accessible" if not sysfs_accessible else None
                ]
            }
            
        except Exception as e:
            logger.error(f"Error checking disconnect status: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    # GPU Workload Testing API Endpoints
    @app.post("/api/gpu/workload/create")
    async def create_workload(request: WorkloadRequest):
        """Create a new GPU workload for testing"""
        try:
            workload_id = workload_manager.create_workload(
                gpu_id=request.gpu_id,
                workload_type=WorkloadType(request.workload_type),
                duration=request.duration
            )
            
            return {
                "workload_id": workload_id,
                "gpu_id": request.gpu_id,
                "workload_type": request.workload_type,
                "duration": request.duration,
                "status": "created"
            }
            
        except Exception as e:
            logger.error(f"Error creating workload: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/gpu/workload/{workload_id}/start")
    async def start_workload(workload_id: str):
        """Start a GPU workload"""
        try:
            workload_manager.start_workload(workload_id)
            status = workload_manager.get_workload_status(workload_id)
            return status
            
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(f"Error starting workload: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/gpu/workload/{workload_id}/stop")
    async def stop_workload(workload_id: str):
        """Stop a running GPU workload"""
        try:
            workload_manager.stop_workload(workload_id)
            status = workload_manager.get_workload_status(workload_id)
            return status
            
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(f"Error stopping workload: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/gpu/workload/{workload_id}/status")
    async def get_workload_status_api(workload_id: str):
        """Get status of a specific workload"""
        try:
            status = workload_manager.get_workload_status(workload_id)
            return status
            
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(f"Error getting workload status: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/gpu/workloads")
    async def get_all_workloads():
        """Get status of all workloads"""
        try:
            workloads = workload_manager.get_all_workloads()
            active = workload_manager.get_active_workloads()
            
            return {
                "total_workloads": len(workloads),
                "active_workloads": len(active),
                "workloads": workloads,
                "active": active
            }
            
        except Exception as e:
            logger.error(f"Error getting workloads: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.delete("/api/gpu/workloads/cleanup")
    async def cleanup_workloads():
        """Clean up completed workloads"""
        try:
            workload_manager.cleanup_completed()
            return {"status": "ok", "message": "Cleaned up completed workloads"}
            
        except Exception as e:
            logger.error(f"Error cleaning up workloads: {e}")
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

