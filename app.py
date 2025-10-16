#!/usr/bin/env python3
"""GPU Hot - Real-time NVIDIA GPU Monitoring Dashboard (FastAPI + AsyncIO)"""

import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from core import config

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="GPU Hot", version="2.0")

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mode selection
if config.MODE == 'hub':
    # Hub mode: aggregate data from multiple nodes
    if not config.NODE_URLS:
        raise ValueError("Hub mode requires NODE_URLS environment variable")
    
    logger.info("Starting GPU Hot in HUB mode (FastAPI)")
    logger.info(f"Connecting to {len(config.NODE_URLS)} node(s): {config.NODE_URLS}")
    
    from core.hub import Hub
    from core.hub_handlers import register_hub_handlers
    
    hub = Hub(config.NODE_URLS)
    register_hub_handlers(app, hub)
    monitor_or_hub = hub
    
else:
    # Default mode: monitor local GPUs and serve dashboard
    logger.info("Starting GPU Hot (FastAPI)")
    logger.info(f"Node name: {config.NODE_NAME}")
    
    from core.monitor import GPUMonitor
    from core.handlers import register_handlers
    
    monitor = GPUMonitor()
    register_handlers(app, monitor)
    monitor_or_hub = monitor


@app.get("/")
async def index():
    """Serve the main dashboard"""
    with open("templates/index.html", "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/api/gpu-data")
async def api_gpu_data():
    """REST API endpoint for GPU data"""
    if config.MODE == 'hub':
        return {"gpus": {}, "timestamp": "hub_mode"}
    
    if hasattr(monitor_or_hub, 'get_gpu_data'):
        return {"gpus": await monitor_or_hub.get_gpu_data(), "timestamp": "async"}
    
    return {"gpus": {}, "timestamp": "no_data"}


if __name__ == '__main__':
    import uvicorn
    try:
        logger.info(f"Server running on {config.HOST}:{config.PORT}")
        uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")
    finally:
        if hasattr(monitor_or_hub, 'shutdown'):
            asyncio.run(monitor_or_hub.shutdown())
