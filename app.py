#!/usr/bin/env python3
"""GPU Hot - Real-time NVIDIA GPU Monitoring Dashboard"""

import eventlet
eventlet.monkey_patch()

import logging
from flask import Flask
from flask_socketio import SocketIO
from core import config

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Mode selection
if config.MODE == 'hub':
    # Hub mode: aggregate data from multiple agents
    if not config.AGENT_URLS:
        raise ValueError("Hub mode requires AGENT_URLS environment variable")
    
    logger.info("Starting GPU Hot in HUB mode")
    logger.info(f"Connecting to {len(config.AGENT_URLS)} agent(s): {config.AGENT_URLS}")
    
    from core.hub import Hub
    from core.hub_handlers import register_hub_handlers
    from core.routes import register_routes
    
    hub = Hub(config.AGENT_URLS)
    register_routes(app, None)  # No local monitor
    register_hub_handlers(socketio, hub)
    monitor_or_hub = hub
    
elif config.MODE == 'agent':
    # Agent mode: monitor local GPUs, expose to hub
    logger.info("Starting GPU Hot in AGENT mode")
    logger.info(f"Node name: {config.NODE_NAME}")
    
    from core import GPUMonitor
    from core.routes import register_routes
    from core.handlers import register_handlers
    
    monitor = GPUMonitor()
    register_routes(app, monitor)
    register_handlers(socketio, monitor)
    monitor_or_hub = monitor
    
else:
    # Standalone mode (default): monitor local GPUs, serve dashboard
    logger.info("Starting GPU Hot in STANDALONE mode")
    
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
