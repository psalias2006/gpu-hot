#!/usr/bin/env python3
"""GPU Hot - Real-time NVIDIA GPU Monitoring Dashboard"""

import eventlet
eventlet.monkey_patch()

import logging
from flask import Flask
from flask_socketio import SocketIO
from core import GPUMonitor, config
from core.routes import register_routes
from core.handlers import register_handlers

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY

# Initialize based on mode
mode = config.MODE
logger.info(f"Starting GPU Hot in {mode.upper()} mode")

if mode == 'agent':
    # Agent mode: minimal HTTP API, no WebSocket
    from core.agent import AgentServer
    
    base_monitor = GPUMonitor()
    monitor = AgentServer(base_monitor)
    socketio = None  # No WebSocket in agent mode
    
    register_routes(app, monitor)
    logger.info("Agent mode: WebSocket disabled, HTTP API only")
    
elif mode == 'hub':
    # Hub mode: poll agents and aggregate data
    from core.hub import HubMonitor
    
    nodes = config.get_nodes()
    if not nodes:
        logger.warning("No nodes configured for hub mode. Set GPU_HOT_NODES or create nodes.yaml")
        logger.warning("Hub will start but will not have any agents to poll")
    
    monitor = HubMonitor(nodes)
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
    
    register_routes(app, monitor)
    register_handlers(socketio, monitor)
    logger.info(f"Hub mode: monitoring {len(nodes)} nodes")
    
else:
    # Standalone mode: original behavior
    monitor = GPUMonitor()
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
    
    register_routes(app, monitor)
    register_handlers(socketio, monitor)
    logger.info("Standalone mode: monitoring local GPUs")


if __name__ == '__main__':
    try:
        print(f"🚀 Starting GPU Hot ({mode.upper()} mode) on {config.HOST}:{config.PORT}")
        
        if socketio:
            # Run with WebSocket support
            socketio.run(app, host=config.HOST, port=config.PORT, 
                        debug=config.DEBUG, use_reloader=False)
        else:
            # Agent mode: run without WebSocket
            app.run(host=config.HOST, port=config.PORT, 
                   debug=config.DEBUG, use_reloader=False)
    finally:
        if hasattr(monitor, 'shutdown'):
            monitor.shutdown()
