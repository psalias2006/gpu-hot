"""
WebSocket event handlers for real-time monitoring
"""

import eventlet
import psutil
from datetime import datetime
from . import config


def register_handlers(socketio, monitor):
    """Register SocketIO event handlers"""
    
    @socketio.on('connect')
    def on_connect():
        print('✓ Client connected')
        if not monitor.running:
            monitor.running = True
            socketio.start_background_task(monitor_loop, socketio, monitor)
    
    @socketio.on('disconnect')
    def on_disconnect():
        print('✗ Client disconnected')


def monitor_loop(socketio, monitor):
    """Background monitoring loop"""
    while monitor.running:
        try:
            # Collect GPU data
            gpu_data = monitor.get_gpu_data()
            processes = monitor.get_processes()
            
            # System info
            system_info = {
                'cpu_percent': psutil.cpu_percent(percpu=False),
                'memory_percent': psutil.virtual_memory().percent,
                'timestamp': datetime.now().isoformat()
            }
            
            # Emit to all clients
            socketio.emit('gpu_data', {
                'gpus': gpu_data,
                'processes': processes,
                'system': system_info
            }, namespace='/')
            
        except Exception as e:
            print(f"Error in monitor loop: {e}")
        
        eventlet.sleep(config.UPDATE_INTERVAL)

