"""
Hub mode for GPU Hot - polls multiple agents and aggregates data
"""

import logging
import time
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from . import config

logger = logging.getLogger(__name__)


class HubMonitor:
    """Hub monitor that polls multiple agent nodes and aggregates GPU data"""
    
    def __init__(self, nodes=None):
        """Initialize hub monitor with list of agent nodes
        
        Args:
            nodes: List of node dictionaries with 'url', 'name', 'tags'
        """
        self.nodes = nodes or config.get_nodes()
        self.node_cache = {}  # Cache for node data
        self.node_status = {}  # Track node status
        self.executor = ThreadPoolExecutor(max_workers=50)  # Parallel polling
        
        # Initialize node status
        for node in self.nodes:
            node_url = node['url']
            self.node_status[node_url] = {
                'status': 'unknown',
                'last_seen': None,
                'error_count': 0,
                'last_error': None
            }
        
        logger.info(f"Hub initialized with {len(self.nodes)} nodes")
        for node in self.nodes:
            logger.info(f"  - {node.get('name', 'Unknown')}: {node['url']}")
    
    def poll_agent(self, node):
        """Poll a single agent and return its data
        
        Args:
            node: Node dictionary with 'url', 'name', 'tags'
        
        Returns:
            tuple: (node_url, data_dict or None)
        """
        node_url = node['url']
        node_name = node.get('name', node_url)
        
        try:
            # Make request to agent
            response = requests.get(
                f"{node_url}/api/agent/gpu-data",
                timeout=config.AGENT_TIMEOUT
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Add node configuration metadata
            data['node_config'] = {
                'url': node_url,
                'name': node_name,
                'tags': node.get('tags', [])
            }
            
            # Update status
            self.node_status[node_url]['status'] = 'online'
            self.node_status[node_url]['last_seen'] = time.time()
            self.node_status[node_url]['error_count'] = 0
            self.node_status[node_url]['last_error'] = None
            
            # Cache the data
            self.node_cache[node_url] = {
                'data': data,
                'cached_at': time.time()
            }
            
            logger.debug(f"Successfully polled {node_name} ({node_url})")
            return (node_url, data)
            
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout polling {node_name} ({node_url})")
            self.node_status[node_url]['status'] = 'timeout'
            self.node_status[node_url]['error_count'] += 1
            self.node_status[node_url]['last_error'] = 'Timeout'
            return (node_url, None)
            
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection error polling {node_name} ({node_url})")
            self.node_status[node_url]['status'] = 'offline'
            self.node_status[node_url]['error_count'] += 1
            self.node_status[node_url]['last_error'] = 'Connection refused'
            return (node_url, None)
            
        except Exception as e:
            logger.error(f"Error polling {node_name} ({node_url}): {e}")
            self.node_status[node_url]['status'] = 'error'
            self.node_status[node_url]['error_count'] += 1
            self.node_status[node_url]['last_error'] = str(e)
            return (node_url, None)
    
    def get_cached_data(self, node_url):
        """Get cached data for an offline node
        
        Args:
            node_url: URL of the node
        
        Returns:
            dict or None: Cached data if available and not too old
        """
        if node_url not in self.node_cache:
            return None
        
        cached = self.node_cache[node_url]
        age = time.time() - cached['cached_at']
        
        # Only return cache if not too old
        if age < config.CACHE_OFFLINE_DURATION:
            data = cached['data'].copy()
            data['status'] = 'offline'
            data['cache_age'] = age
            return data
        
        return None
    
    def aggregate_data(self):
        """Poll all agents and aggregate their data
        
        Returns:
            dict: Aggregated data from all nodes
        """
        aggregated = {
            'nodes': {},
            'summary': {
                'total_nodes': len(self.nodes),
                'online_nodes': 0,
                'offline_nodes': 0,
                'total_gpus': 0,
                'timestamp': datetime.now().isoformat()
            }
        }
        
        # Poll all agents in parallel
        futures = {
            self.executor.submit(self.poll_agent, node): node 
            for node in self.nodes
        }
        
        for future in as_completed(futures):
            node = futures[future]
            node_url = node['url']
            node_name = node.get('name', node_url)
            
            try:
                node_url_result, data = future.result()
                
                if data:
                    # Node is online
                    aggregated['nodes'][node_url] = data
                    aggregated['summary']['online_nodes'] += 1
                    aggregated['summary']['total_gpus'] += len(data.get('gpus', {}))
                else:
                    # Node is offline, try to use cached data
                    cached_data = self.get_cached_data(node_url)
                    if cached_data:
                        aggregated['nodes'][node_url] = cached_data
                        aggregated['summary']['offline_nodes'] += 1
                        aggregated['summary']['total_gpus'] += len(cached_data.get('gpus', {}))
                        logger.debug(f"Using cached data for {node_name} (age: {cached_data.get('cache_age', 0):.1f}s)")
                    else:
                        # No cached data available
                        aggregated['nodes'][node_url] = {
                            'metadata': {
                                'node_id': node_url,
                                'hostname': node_name,
                            },
                            'node_config': {
                                'url': node_url,
                                'name': node_name,
                                'tags': node.get('tags', [])
                            },
                            'gpus': {},
                            'processes': [],
                            'system': {},
                            'status': self.node_status[node_url]['status'],
                            'error': self.node_status[node_url].get('last_error', 'Unknown error')
                        }
                        aggregated['summary']['offline_nodes'] += 1
                        
            except Exception as e:
                logger.error(f"Error processing result for {node_name}: {e}")
                aggregated['summary']['offline_nodes'] += 1
        
        # Add status information to summary
        aggregated['summary']['node_status'] = {}
        for node_url, status in self.node_status.items():
            node_name = next((n.get('name', node_url) for n in self.nodes if n['url'] == node_url), node_url)
            aggregated['summary']['node_status'][node_name] = {
                'url': node_url,
                'status': status['status'],
                'last_seen': status['last_seen'],
                'error_count': status['error_count']
            }
        
        return aggregated
    
    def get_gpu_data(self):
        """Get aggregated GPU data from all nodes (hub interface)
        
        This method matches the GPUMonitor interface for compatibility
        
        Returns:
            dict: Aggregated GPU data indexed by "node_url:gpu_id"
        """
        aggregated = self.aggregate_data()
        
        # Flatten structure to match GPUMonitor interface
        flat_gpus = {}
        for node_url, node_data in aggregated['nodes'].items():
            node_name = node_data.get('node_config', {}).get('name', node_url)
            for gpu_id, gpu_info in node_data.get('gpus', {}).items():
                # Create compound key: node_url:gpu_id
                compound_key = f"{node_url}:{gpu_id}"
                gpu_info['_node_url'] = node_url
                gpu_info['_node_name'] = node_name
                gpu_info['_node_status'] = node_data.get('status', 'unknown')
                flat_gpus[compound_key] = gpu_info
        
        return flat_gpus
    
    def get_processes(self):
        """Get aggregated process data from all nodes (hub interface)
        
        Returns:
            list: Combined process list from all nodes
        """
        aggregated = self.aggregate_data()
        
        all_processes = []
        for node_url, node_data in aggregated['nodes'].items():
            node_name = node_data.get('node_config', {}).get('name', node_url)
            for process in node_data.get('processes', []):
                process['_node_url'] = node_url
                process['_node_name'] = node_name
                all_processes.append(process)
        
        return all_processes
    
    def shutdown(self):
        """Shutdown hub monitor"""
        logger.info("Shutting down hub monitor")
        self.executor.shutdown(wait=False)

