"""Async WebSocket handlers for hub mode"""

import asyncio
import logging
import json
from fastapi import WebSocket
from . import config

logger = logging.getLogger(__name__)

# Global WebSocket connections
websocket_connections = set()

def register_hub_handlers(app, hub):
    """Register FastAPI WebSocket handlers for hub mode"""

    @app.on_event("startup")
    async def start_hub():
        """Keep node collection active independently of dashboard viewers."""
        if not hub.running:
            hub.running = True
            asyncio.create_task(hub_loop(hub, websocket_connections))

        if not hub._connection_started:
            hub._connection_started = True
            asyncio.create_task(hub._connect_all_nodes())

    @app.on_event("shutdown")
    async def stop_hub():
        await hub.shutdown()

    @app.websocket("/socket.io/")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        websocket_connections.add(websocket)
        logger.debug('Dashboard client connected')
        
        try:
            # Keep connection alive
            while True:
                await websocket.receive_text()
        except Exception as e:
            logger.debug(f'Dashboard client disconnected: {e}')
        finally:
            websocket_connections.discard(websocket)
            if not websocket_connections:
                logger.info("No active dashboard clients")


async def hub_loop(hub, connections):
    """Async background loop that emits aggregated cluster data"""
    logger.info("Hub monitoring loop started")
    
    while hub.running:
        try:
            cluster_data = await hub.get_cluster_data()
            
            # Send to all connected clients
            if connections:
                disconnected = set()
                for websocket in list(connections):
                    try:
                        await websocket.send_text(json.dumps(cluster_data))
                    except Exception:
                        disconnected.add(websocket)
                
                # Remove disconnected clients
                connections.difference_update(disconnected)
                
        except Exception as e:
            logger.error(f"Error in hub loop: {e}")
        
        # Broadcast interval to dashboard clients (configurable, default 0.5s)
        await asyncio.sleep(config.UPDATE_INTERVAL)
