"""Async Hub mode - aggregates data from multiple nodes"""

import asyncio
import logging
import json
import time
from datetime import datetime

import websockets

from . import config

logger = logging.getLogger(__name__)


class Hub:
    """Aggregates GPU data from multiple nodes"""
    
    def __init__(self, node_urls):
        self.node_urls = node_urls
        self.nodes = {}  # node_name -> {client, data, status, last_update}
        self.url_to_node = {}  # url -> node_name mapping
        self.running = False
        self._connection_started = False
        
        # Initialize nodes as offline
        for url in node_urls:
            self.nodes[url] = {
                'url': url,
                'websocket': None,
                'data': None,
                'status': 'offline',
                'last_update': None,
                'last_update_monotonic': None
            }
            self.url_to_node[url] = url
    
    async def _connect_all_nodes(self):
        """Connect to all nodes in background with retries"""
        # Wait a bit for Docker network to be ready
        await asyncio.sleep(2)
        
        # Connect to all nodes concurrently
        tasks = [self._connect_node_with_retry(url) for url in self.node_urls]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _connect_node_with_retry(self, url):
        """Connect to a node with retry logic"""
        max_retries = 5
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                await self._connect_node(url)
                return  # Success
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f'Connection attempt {attempt + 1}/{max_retries} failed for {url}: {str(e)}, retrying in {retry_delay}s...')
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f'Failed to connect to node {url} after {max_retries} attempts: {str(e)}')
    
    async def _connect_node(self, url):
        """Connect to a node using native WebSocket"""
        while self.running:
            try:
                # Convert HTTP URL to WebSocket URL
                ws_url = url.replace('http://', 'ws://').replace('https://', 'wss://') + '/socket.io/'
                
                logger.info(f'Connecting to node WebSocket: {ws_url}')
                
                async with websockets.connect(ws_url) as websocket:
                    logger.info(f'Connected to node: {url}')
                    
                    # Mark node as online
                    node_name = self.url_to_node.get(url, url)
                    self.nodes[node_name] = {
                        'url': url,
                        'websocket': websocket,
                        'data': None,
                        'status': 'online',
                        'last_update': datetime.now().isoformat(),
                        'last_update_monotonic': None
                    }
                    
                    # Listen for data from the node
                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            
                            # Extract node name from data or use URL as fallback
                            node_name = data.get('node_name', url)
                            
                            # Update URL to node mapping
                            self.url_to_node[url] = node_name
                            
                            # Update node entry with received data
                            self.nodes[node_name] = {
                                'url': url,
                                'websocket': websocket,
                                'data': data,
                                'status': 'online',
                                'last_update': datetime.now().isoformat(),
                                'last_update_monotonic': time.monotonic()
                            }
                            
                        except json.JSONDecodeError as e:
                            logger.error(f'Failed to parse message from {url}: {e}')
                        except Exception as e:
                            logger.error(f'Error processing message from {url}: {e}')
                            
            except websockets.exceptions.ConnectionClosed:
                logger.warning(f'WebSocket connection closed for node: {url}')
                # Mark node as offline
                node_name = self.url_to_node.get(url, url)
                if node_name in self.nodes:
                    self.nodes[node_name]['status'] = 'offline'
                    logger.info(f'Marked node {node_name} as offline')
            except Exception as e:
                logger.error(f'Failed to connect to node {url}: {e}')
                # Mark node as offline
                node_name = self.url_to_node.get(url, url)
                if node_name in self.nodes:
                    self.nodes[node_name]['status'] = 'offline'
                    logger.info(f'Marked node {node_name} as offline')
            
            # Wait before retrying connection
            if self.running:
                await asyncio.sleep(5)
    
    async def get_cluster_data(self):
        """Get aggregated data from all nodes"""
        nodes = {}
        total_gpus = 0
        online_nodes = 0
        
        for node_name, node_info in self.nodes.items():
            if node_info['status'] == 'online' and node_info['data']:
                nodes[node_name] = {
                    'status': 'online',
                    'gpus': node_info['data'].get('gpus', {}),
                    'processes': node_info['data'].get('processes', []),
                    'system': node_info['data'].get('system', {}),
                    'last_update': node_info['last_update']
                }
                total_gpus += len(node_info['data'].get('gpus', {}))
                online_nodes += 1
            else:
                nodes[node_name] = {
                    'status': 'offline',
                    'gpus': {},
                    'processes': [],
                    'system': {},
                    'last_update': node_info.get('last_update')
                }
        
        return {
            'mode': 'hub',
            'nodes': nodes,
            'cluster_stats': {
                'total_nodes': len(self.nodes),
                'online_nodes': online_nodes,
                'total_gpus': total_gpus
            }
        }

    def get_health_status(self, now=None):
        """Report whether at least one configured node has fresh data."""
        current_time = time.monotonic() if now is None else now
        fresh_nodes, newest_age_seconds = self._node_freshness(current_time)

        if fresh_nodes:
            reason = 'fresh_node_data'
        elif newest_age_seconds is not None:
            reason = 'node_data_stale'
        else:
            reason = 'no_node_data'

        return {
            'status': 'healthy' if fresh_nodes else 'unhealthy',
            'mode': 'hub',
            'reason': reason,
            'configured_nodes': len(self.node_urls),
            'fresh_nodes': fresh_nodes,
            'newest_update_age_seconds': (
                round(newest_age_seconds, 3)
                if newest_age_seconds is not None
                else None
            )
        }

    def _node_freshness(self, current_time):
        """Count fresh nodes and find the age of the newest node update."""
        fresh_nodes = 0
        newest_age_seconds = None

        for node_info in self.nodes.values():
            last_update = node_info.get('last_update_monotonic')
            if (
                node_info.get('status') != 'online'
                or node_info.get('data') is None
                or last_update is None
            ):
                continue

            age_seconds = max(0.0, current_time - last_update)
            if newest_age_seconds is None or age_seconds < newest_age_seconds:
                newest_age_seconds = age_seconds

            if age_seconds <= config.HUB_HEALTH_STALE_SECONDS:
                fresh_nodes += 1

        return fresh_nodes, newest_age_seconds
    
    async def shutdown(self):
        """Disconnect from all nodes"""
        self.running = False
        for node_info in self.nodes.values():
            if node_info.get('websocket'):
                try:
                    await node_info['websocket'].close()
                except:
                    pass
