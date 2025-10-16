#!/usr/bin/env python3
"""GPU Hot - Real-time NVIDIA GPU Monitoring Dashboard"""

import eventlet
# Monkey patch but exclude socket to avoid DNS issues in containers
eventlet.monkey_patch(socket=False)

import logging
from flask import Flask
from flask_socketio import SocketIO
from core import config

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=120,          # Long timeout for stability
    ping_interval=30,           # Ping every 30s (don't interfere with 500ms data flow)
    max_http_buffer_size=10000000,  # 10MB buffer for high-frequency updates
    logger=False,
    engineio_logger=False
)

# Mode selection
if config.MODE == 'hub':
    # Hub mode: aggregate data from multiple nodes
    if not config.NODE_URLS:
        raise ValueError("Hub mode requires NODE_URLS environment variable")
    
    logger.info("Starting GPU Hot in HUB mode")
    logger.info(f"Connecting to {len(config.NODE_URLS)} node(s): {config.NODE_URLS}")
    
    from core.hub import Hub
    from core.hub_handlers import register_hub_handlers
    from core.routes import register_routes
    
    hub = Hub(config.NODE_URLS, socketio)
    register_routes(app, None)  # No local monitor
    register_hub_handlers(socketio, hub)
    monitor_or_hub = hub
    
else:
    # Default mode: monitor local GPUs and serve dashboard
    logger.info("Starting GPU Hot")
    logger.info(f"Node name: {config.NODE_NAME}")
    
    from core import GPUMonitor
    from core.routes import register_routes
    from core.handlers import register_handlers
    
    monitor = GPUMonitor()
    register_routes(app, monitor)
    register_handlers(socketio, monitor)
    monitor_or_hub = monitor


if __name__ == '__main__':
    try:
        logger.info(f"Server running on {config.HOST}:{config.PORT}")
        socketio.run(app, host=config.HOST, port=config.PORT, 
                    debug=config.DEBUG, use_reloader=False)
    finally:
        monitor_or_hub.shutdown()
