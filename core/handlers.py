"""WebSocket handlers for real-time monitoring"""

import eventlet
import psutil
import logging
from datetime import datetime
from . import config

logger = logging.getLogger(__name__)


def register_handlers(socketio, monitor):
    """Register SocketIO event handlers"""
    
    @socketio.on('connect')
    def on_connect():
        logger.info('Client connected')
        if not monitor.running:
            monitor.running = True
            socketio.start_background_task(monitor_loop, socketio, monitor)
    
    @socketio.on('disconnect')
    def on_disconnect():
        logger.info('Client disconnected')


def monitor_loop(socketio, monitor):
    """Background loop that collects and emits GPU data"""
    # Determine update interval based on whether any GPU uses nvidia-smi
    uses_nvidia_smi = any(monitor.use_smi.values()) if hasattr(monitor, 'use_smi') else False
    update_interval = config.NVIDIA_SMI_INTERVAL if uses_nvidia_smi else config.UPDATE_INTERVAL
    
    if uses_nvidia_smi:
        logger.info(f"Using nvidia-smi polling interval: {update_interval}s")
    else:
        logger.info(f"Using NVML polling interval: {update_interval}s")
    
    while monitor.running:
        try:
            gpu_data = monitor.get_gpu_data()
            processes = monitor.get_processes()
            
            system_info = {
                'cpu_percent': psutil.cpu_percent(percpu=False),
                'memory_percent': psutil.virtual_memory().percent,
                'timestamp': datetime.now().isoformat()
            }
            
            socketio.emit('gpu_data', {
                'mode': config.MODE,
                'node_name': config.NODE_NAME,
                'gpus': gpu_data,
                'processes': processes,
                'system': system_info
            }, namespace='/')
            
        except Exception as e:
            logger.error(f"Error in monitor loop: {e}")
        
        eventlet.sleep(update_interval)

