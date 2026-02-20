#!/usr/bin/env python3
"""GPU Hot - Real-time NVIDIA GPU Monitoring Dashboard (FastAPI + AsyncIO)"""

import asyncio
import logging
import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from core import config

# Cookie for UI preference: "classic" or "new". Default (no cookie) = "new".
UI_COOKIE_NAME = "gpu_hot_ui"
UI_COOKIE_MAX_AGE = 365 * 24 * 60 * 60  # 1 year
from version import __version__

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="GPU Hot", version=__version__)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/classic-static", StaticFiles(directory="classic_design/static"), name="classic_static")

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


def _get_ui_preference(request: Request) -> str:
    return request.cookies.get(UI_COOKIE_NAME, "new").lower()


@app.get("/")
async def index(request: Request):
    """Serve the dashboard. UI (new vs classic) is chosen from cookie preference."""
    ui = _get_ui_preference(request)
    if ui == "classic":
        with open("classic_design/templates/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    with open("templates/index.html", "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/set-ui")
async def set_ui(ui: str = "new"):
    """Set UI preference cookie and redirect to /. ui=classic or ui=new."""
    ui = (ui or "new").lower()
    if ui not in ("classic", "new"):
        ui = "new"
    response = RedirectResponse(url="/", status_code=302)
    response.set_cookie(
        key=UI_COOKIE_NAME,
        value=ui,
        max_age=UI_COOKIE_MAX_AGE,
        path="/",
        samesite="lax",
    )
    return response


@app.get("/classic")
async def classic_redirect():
    """Backwards compatibility: redirect to / with classic preference."""
    response = RedirectResponse(url="/", status_code=302)
    response.set_cookie(
        key=UI_COOKIE_NAME,
        value="classic",
        max_age=UI_COOKIE_MAX_AGE,
        path="/",
        samesite="lax",
    )
    return response


@app.get("/api/gpu-data")
async def api_gpu_data():
    """REST API endpoint for GPU data"""
    if config.MODE == 'hub':
        return {"gpus": {}, "timestamp": "hub_mode"}
    
    if hasattr(monitor_or_hub, 'get_gpu_data'):
        return {"gpus": await monitor_or_hub.get_gpu_data(), "timestamp": "async"}
    
    return {"gpus": {}, "timestamp": "no_data"}


def compare_versions(current, latest):
    """Compare semantic versions. Returns True if latest > current"""
    try:
        current_parts = [int(x) for x in current.split('.')]
        latest_parts = [int(x) for x in latest.split('.')]
        
        # Pad to same length
        max_len = max(len(current_parts), len(latest_parts))
        current_parts += [0] * (max_len - len(current_parts))
        latest_parts += [0] * (max_len - len(latest_parts))
        
        # Compare each part
        for c, l in zip(current_parts, latest_parts):
            if l > c:
                return True
            elif l < c:
                return False
        
        return False  # Versions are equal
    except (ValueError, AttributeError):
        return False


@app.get("/api/version")
async def api_version():
    """Get current version and check for updates from GitHub"""
    current_version = __version__
    
    try:
        # Check GitHub for latest release
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.github.com/repos/psalias2006/gpu-hot/releases/latest",
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    latest_version = data.get("tag_name", "").lstrip("v")
                    
                    # Only show update if latest > current
                    update_available = compare_versions(current_version, latest_version) if latest_version else False
                    
                    return JSONResponse({
                        "current": current_version,
                        "latest": latest_version,
                        "update_available": update_available,
                        "release_url": data.get("html_url", "")
                    })
    except Exception as e:
        logger.debug(f"Failed to check for updates: {e}")
    
    # Return current version even if GitHub check fails
    return JSONResponse({
        "current": current_version,
        "latest": None,
        "update_available": False,
        "release_url": None
    })


if __name__ == '__main__':
    import uvicorn
    try:
        logger.info(f"Server running on {config.HOST}:{config.PORT}")
        uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")
    finally:
        if hasattr(monitor_or_hub, 'shutdown'):
            asyncio.run(monitor_or_hub.shutdown())
