"""Async WebSocket handlers for hub mode and GPU disconnect relay endpoints"""

import asyncio
import logging
import json
import aiohttp
from fastapi import WebSocket, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Global WebSocket connections
websocket_connections = set()


# Pydantic models for hub disconnect requests
class HubDisconnectRequest(BaseModel):
    method: str = "auto"
    down_time: float = 5.0


class HubMultiDisconnectRequest(BaseModel):
    targets: list[dict]  # [{"node_name": "node1", "gpu_id": 0}, ...]
    method: str = "auto"
    down_time: float = 5.0


async def forward_to_node(node_url: str, endpoint: str, method: str = "GET", data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Forward API request to a specific node"""
    url = f"{node_url.rstrip('/')}/{endpoint.lstrip('/')}"
    
    try:
        async with aiohttp.ClientSession() as session:
            if method.upper() == "GET":
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    return await response.json()
            elif method.upper() == "POST":
                async with session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    if response.status >= 400:
                        error_text = await response.text()
                        raise Exception(f"Node returned error {response.status}: {error_text}")
                    return await response.json()
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
                
    except asyncio.TimeoutError:
        raise Exception(f"Timeout connecting to node at {node_url}")
    except aiohttp.ClientError as e:
        raise Exception(f"Network error connecting to node at {node_url}: {str(e)}")
    except Exception as e:
        raise Exception(f"Error communicating with node at {node_url}: {str(e)}")


def register_hub_handlers(app, hub):
    """Register FastAPI WebSocket handlers for hub mode"""
    
    @app.websocket("/socket.io/")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        websocket_connections.add(websocket)
        logger.debug('Dashboard client connected')
        
        if not hub.running:
            hub.running = True
            asyncio.create_task(hub_loop(hub, websocket_connections))
        
        # Start node connections if not already started
        if not hub._connection_started:
            hub._connection_started = True
            asyncio.create_task(hub._connect_all_nodes())
        
        try:
            # Keep connection alive
            while True:
                await websocket.receive_text()
        except Exception as e:
            logger.debug(f'Dashboard client disconnected: {e}')
        finally:
            websocket_connections.discard(websocket)
    
    # Hub GPU Disconnect API Endpoints
    @app.get("/api/hub/nodes")
    async def get_hub_nodes():
        """Get list of connected nodes and their status"""
        try:
            nodes_info = {}
            for node_name, node_data in hub.nodes.items():
                nodes_info[node_name] = {
                    'url': node_data['url'],
                    'status': node_data['status'],
                    'last_update': node_data['last_update']
                }
            
            return {
                'total_nodes': len(hub.nodes),
                'online_nodes': sum(1 for n in hub.nodes.values() if n['status'] == 'online'),
                'nodes': nodes_info
            }
            
        except Exception as e:
            logger.error(f"Error getting hub nodes: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/hub/gpu/{node_name}/{gpu_id}/disconnect/methods")
    async def get_node_disconnect_methods(node_name: str, gpu_id: int):
        """Get available disconnect methods for a GPU on a specific node"""
        try:
            if node_name not in hub.nodes:
                raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
            
            node_data = hub.nodes[node_name]
            if node_data['status'] != 'online':
                raise HTTPException(status_code=503, detail=f"Node '{node_name}' is offline")
            
            node_url = node_data['url']
            endpoint = f"api/gpu/{gpu_id}/disconnect/methods"
            
            result = await forward_to_node(node_url, endpoint, "GET")
            result['node_name'] = node_name
            
            return result
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting disconnect methods for {node_name}/GPU {gpu_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/hub/gpu/{node_name}/{gpu_id}/disconnect")
    async def disconnect_node_gpu(node_name: str, gpu_id: int, request: HubDisconnectRequest):
        """Disconnect a GPU on a specific node"""
        try:
            logger.info(f"Hub received disconnect request for {node_name}/GPU {gpu_id}")
            
            if node_name not in hub.nodes:
                raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
            
            node_data = hub.nodes[node_name]
            if node_data['status'] != 'online':
                raise HTTPException(status_code=503, detail=f"Node '{node_name}' is offline")
            
            node_url = node_data['url']
            endpoint = f"api/gpu/{gpu_id}/disconnect"
            request_data = {
                'method': request.method,
                'down_time': request.down_time
            }
            
            result = await forward_to_node(node_url, endpoint, "POST", request_data)
            result['node_name'] = node_name
            result['hub_timestamp'] = datetime.now().isoformat()
            
            logger.info(f"Successfully relayed disconnect request to {node_name}/GPU {gpu_id}")
            return JSONResponse(content=result)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error disconnecting {node_name}/GPU {gpu_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/hub/gpu/disconnect-multiple")
    async def disconnect_multiple_node_gpus(request: HubMultiDisconnectRequest):
        """Disconnect multiple GPUs across multiple nodes"""
        try:
            logger.info(f"Hub received multi-disconnect request for {len(request.targets)} targets")
            
            # Group targets by node
            node_targets = {}
            for target in request.targets:
                node_name = target.get('node_name')
                gpu_id = target.get('gpu_id')
                
                if not node_name or gpu_id is None:
                    raise HTTPException(status_code=400, detail="Each target must have 'node_name' and 'gpu_id'")
                
                if node_name not in hub.nodes:
                    raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
                
                if node_name not in node_targets:
                    node_targets[node_name] = []
                node_targets[node_name].append(gpu_id)
            
            # Check all nodes are online
            for node_name in node_targets:
                if hub.nodes[node_name]['status'] != 'online':
                    raise HTTPException(status_code=503, detail=f"Node '{node_name}' is offline")
            
            # Create tasks for each node
            tasks = []
            for node_name, gpu_ids in node_targets.items():
                node_url = hub.nodes[node_name]['url']
                
                if len(gpu_ids) == 1:
                    # Single GPU disconnect
                    endpoint = f"api/gpu/{gpu_ids[0]}/disconnect"
                    request_data = {
                        'method': request.method,
                        'down_time': request.down_time
                    }
                else:
                    # Multi-GPU disconnect on same node
                    endpoint = "api/gpu/disconnect-multiple"
                    request_data = {
                        'gpu_indices': gpu_ids,
                        'method': request.method,
                        'down_time': request.down_time
                    }
                
                task = asyncio.create_task(
                    forward_to_node(node_url, endpoint, "POST", request_data),
                    name=f"disconnect_{node_name}"
                )
                tasks.append((node_name, task))
            
            # Wait for all tasks to complete
            results = {}
            errors = {}
            
            for node_name, task in tasks:
                try:
                    result = await task
                    result['node_name'] = node_name
                    results[node_name] = result
                except Exception as e:
                    errors[node_name] = str(e)
                    logger.error(f"Error disconnecting GPUs on {node_name}: {e}")
            
            response = {
                'total_nodes': len(node_targets),
                'successful_nodes': len(results),
                'failed_nodes': len(errors),
                'results': results,
                'errors': errors,
                'hub_timestamp': datetime.now().isoformat()
            }
            
            logger.info(f"Multi-disconnect completed: {len(results)} successful, {len(errors)} failed")
            return JSONResponse(content=response)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in hub multi-disconnect: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/hub/gpu/disconnect/status")
    async def get_hub_disconnect_status():
        """Get disconnect capability status for all nodes"""
        try:
            node_status = {}
            
            for node_name, node_data in hub.nodes.items():
                if node_data['status'] == 'online':
                    try:
                        node_url = node_data['url']
                        result = await forward_to_node(node_url, "api/gpu/disconnect/status", "GET")
                        node_status[node_name] = {
                            'status': 'online',
                            'capabilities': result
                        }
                    except Exception as e:
                        node_status[node_name] = {
                            'status': 'error',
                            'error': str(e)
                        }
                else:
                    node_status[node_name] = {
                        'status': 'offline'
                    }
            
            total_ready = sum(1 for status in node_status.values() 
                            if status.get('capabilities', {}).get('ready', False))
            
            return {
                'hub_ready': total_ready > 0,
                'total_nodes': len(hub.nodes),
                'ready_nodes': total_ready,
                'node_status': node_status
            }
            
        except Exception as e:
            logger.error(f"Error getting hub disconnect status: {e}")
            raise HTTPException(status_code=500, detail=str(e))


async def hub_loop(hub, connections):
    """Async background loop that emits aggregated cluster data"""
    logger.info("Hub monitoring loop started")
    
    while hub.running:
        try:
            cluster_data = await hub.get_cluster_data()
            
            # Send to all connected clients
            if connections:
                disconnected = set()
                for websocket in connections:
                    try:
                        await websocket.send_text(json.dumps(cluster_data))
                    except:
                        disconnected.add(websocket)
                
                # Remove disconnected clients
                connections -= disconnected
                
        except Exception as e:
            logger.error(f"Error in hub loop: {e}")
        
        # Match node update rate for real-time responsiveness
        await asyncio.sleep(0.5)

