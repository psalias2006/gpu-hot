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

