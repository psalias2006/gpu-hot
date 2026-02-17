"""Async WebSocket handlers for real-time monitoring"""

import asyncio
import psutil
import logging
import json
from datetime import datetime
from fastapi import WebSocket
from . import config

logger = logging.getLogger(__name__)

# Global WebSocket connections
websocket_connections = set()

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
            
            # Core system metrics
            vmem = psutil.virtual_memory()
            system_info = {
                'cpu_percent': psutil.cpu_percent(percpu=False),
                'memory_percent': vmem.percent,
                'memory_total_gb': round(vmem.total / (1024 ** 3), 2),
                'memory_used_gb': round(vmem.used / (1024 ** 3), 2),
                'memory_available_gb': round(vmem.available / (1024 ** 3), 2),
                'cpu_count': psutil.cpu_count(),
                'timestamp': datetime.now().isoformat()
            }

            # Swap memory
            try:
                swap = psutil.swap_memory()
                system_info['swap_percent'] = swap.percent
            except Exception:
                pass

            # CPU frequency
            try:
                freq = psutil.cpu_freq()
                if freq:
                    system_info['cpu_freq_current'] = round(freq.current, 0)
                    system_info['cpu_freq_max'] = round(freq.max, 0)
            except Exception:
                pass

            # Load average (Linux/Mac only)
            try:
                load = psutil.getloadavg()
                system_info['load_avg_1'] = round(load[0], 2)
                system_info['load_avg_5'] = round(load[1], 2)
                system_info['load_avg_15'] = round(load[2], 2)
            except (AttributeError, OSError):
                pass

            # Network I/O (cumulative bytes — frontend computes rate)
            try:
                net = psutil.net_io_counters()
                system_info['net_bytes_sent'] = net.bytes_sent
                system_info['net_bytes_recv'] = net.bytes_recv
            except Exception:
                pass

            # Disk I/O (cumulative bytes — frontend computes rate)
            try:
                disk = psutil.disk_io_counters()
                if disk:
                    system_info['disk_read_bytes'] = disk.read_bytes
                    system_info['disk_write_bytes'] = disk.write_bytes
            except Exception:
                pass
            
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

