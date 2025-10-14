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
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

app = Flask(__name__)
app.config["SECRET_KEY"] = config.SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
monitor = GPUMonitor()

register_routes(app, monitor)
register_handlers(socketio, monitor)


if __name__ == "__main__":
    try:
        print(f"🚀 Starting GPU Hot on {config.HOST}:{config.PORT}")
        socketio.run(
            app,
            host=config.HOST,
            port=config.PORT,
            debug=config.DEBUG,
            use_reloader=False,
        )
    finally:
        monitor.shutdown()
