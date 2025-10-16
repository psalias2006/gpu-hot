"""Hub mode - aggregates data from multiple nodes"""

import logging
import eventlet
from datetime import datetime
from socketio import Client
from . import config

logger = logging.getLogger(__name__)


class Hub:
    """Aggregates GPU data from multiple nodes"""
    
    def __init__(self, node_urls, socketio=None):
        self.node_urls = node_urls
        self.nodes = {}  # node_name -> {client, data, status, last_update}
        self.url_to_node = {}  # url -> node_name mapping for disconnect handling
        self.running = False
        self.socketio = socketio
        
        # Initialize nodes as offline, will connect in background
        for url in node_urls:
            self.nodes[url] = {
                'url': url,
                'client': None,
                'data': None,
                'status': 'offline',
                'last_update': None
            }
            self.url_to_node[url] = url  # Initially map URL to itself
        
        # Start background connection task
        eventlet.spawn(self._connect_all_nodes)
    
    def _connect_all_nodes(self):
        """Connect to all nodes in background with retries"""
        # Wait a bit for Docker network to be ready
        eventlet.sleep(2)
        
        for url in self.node_urls:
            eventlet.spawn(self._connect_node_with_retry, url)
    
    def _connect_node_with_retry(self, url):
        """Connect to a node with retry logic"""
        max_retries = 5
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                self._connect_node(url)
                return  # Success
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f'Connection attempt {attempt + 1}/{max_retries} failed for {url}: {str(e)}, retrying in {retry_delay}s...')
                    eventlet.sleep(retry_delay)
                else:
                    logger.error(f'Failed to connect to node {url} after {max_retries} attempts: {str(e)}')
    
    def _connect_node(self, url):
        """Connect to a node"""
        # Configure client for real-time data streaming (500ms updates)
        client = Client(
            reconnection=True,
            reconnection_attempts=0,  # Infinite reconnection
            reconnection_delay=2,
            reconnection_delay_max=10,
            request_timeout=30,
            # Optimized for high-frequency real-time data
            engineio_logger=False
        )
        
        # Store temporary reference for the closure
        node_url = url
        
        @client.on('connect')
        def on_connect():
            logger.info(f'Connected to node: {node_url}')
        
        @client.on('disconnect')
        def on_disconnect():
            logger.warning(f'Disconnected from node: {node_url}')
            # Mark node as offline using URL to node name mapping
            node_name = self.url_to_node.get(node_url, node_url)
            if node_name in self.nodes:
                self.nodes[node_name]['status'] = 'offline'
                logger.info(f'Marked node {node_name} as offline')
        
        @client.on('gpu_data')
        def on_gpu_data(data):
            # Extract node name from data or use URL as fallback
            node_name = data.get('node_name', node_url)
            
            # Update URL to node mapping
            self.url_to_node[node_url] = node_name
            
            # Update or create node entry with minimal overhead
            self.nodes[node_name] = {
                'url': node_url,
                'client': client,
                'data': data,
                'status': 'online',
                'last_update': datetime.now().isoformat()
            }
            
            # Immediate emit for real-time sync with standalone
            if self.socketio:
                cluster_data = self.get_cluster_data()
                self.socketio.emit('gpu_data', cluster_data, namespace='/')
        
        # Connect to node
        client.connect(url, 
                      wait_timeout=30, 
                      socketio_path='/socket.io',
                      transports=['websocket'])  # Force WebSocket for lowest latency
    
    def get_cluster_data(self):
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
    
    def shutdown(self):
        """Disconnect from all nodes"""
        self.running = False
        for node_info in self.nodes.values():
            if node_info.get('client'):
                try:
                    node_info['client'].disconnect()
                except:
                    pass

