"""Hub mode - aggregates data from multiple agent nodes"""

import logging
import eventlet
from datetime import datetime
from socketio import Client
from . import config

logger = logging.getLogger(__name__)


class Hub:
    """Aggregates GPU data from multiple agent nodes"""
    
    def __init__(self, agent_urls):
        self.agent_urls = agent_urls
        self.agents = {}  # node_name -> {client, data, status, last_update}
        self.url_to_node = {}  # url -> node_name mapping for disconnect handling
        self.running = False
        
        # Initialize agents as offline, will connect in background
        for url in agent_urls:
            self.agents[url] = {
                'url': url,
                'client': None,
                'data': None,
                'status': 'offline',
                'last_update': None
            }
            self.url_to_node[url] = url  # Initially map URL to itself
        
        # Start background connection task
        eventlet.spawn(self._connect_all_agents)
    
    def _connect_all_agents(self):
        """Connect to all agents in background with retries"""
        # Wait a bit for Docker network to be ready
        eventlet.sleep(2)
        
        for url in self.agent_urls:
            eventlet.spawn(self._connect_agent_with_retry, url)
    
    def _connect_agent_with_retry(self, url):
        """Connect to an agent with retry logic"""
        max_retries = 5
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                self._connect_agent(url)
                return  # Success
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f'Connection attempt {attempt + 1}/{max_retries} failed for {url}, retrying in {retry_delay}s...')
                    eventlet.sleep(retry_delay)
                else:
                    logger.error(f'Failed to connect to agent {url} after {max_retries} attempts')
    
    def _connect_agent(self, url):
        """Connect to an agent node"""
        client = Client(reconnection=True, reconnection_attempts=0, reconnection_delay=1)
        
        # Store temporary reference for the closure
        agent_url = url
        
        @client.on('connect')
        def on_connect():
            logger.info(f'Connected to agent: {agent_url}')
        
        @client.on('disconnect')
        def on_disconnect():
            logger.warning(f'Disconnected from agent: {agent_url}')
            # Mark agent as offline using URL to node name mapping
            node_name = self.url_to_node.get(agent_url, agent_url)
            if node_name in self.agents:
                self.agents[node_name]['status'] = 'offline'
                logger.info(f'Marked node {node_name} as offline')
        
        @client.on('gpu_data')
        def on_gpu_data(data):
            # Extract node name from data or use URL as fallback
            node_name = data.get('node_name', agent_url)
            
            # Update URL to node mapping
            self.url_to_node[agent_url] = node_name
            
            # Update or create agent entry
            self.agents[node_name] = {
                'url': agent_url,
                'client': client,
                'data': data,
                'status': 'online',
                'last_update': datetime.now().isoformat()
            }
        
        # Connect to agent (blocking call)
        client.connect(url, wait_timeout=10)
    
    def get_cluster_data(self):
        """Get aggregated data from all agents"""
        nodes = {}
        total_gpus = 0
        online_nodes = 0
        
        for node_name, agent_info in self.agents.items():
            if agent_info['status'] == 'online' and agent_info['data']:
                nodes[node_name] = {
                    'status': 'online',
                    'gpus': agent_info['data'].get('gpus', {}),
                    'processes': agent_info['data'].get('processes', []),
                    'system': agent_info['data'].get('system', {}),
                    'last_update': agent_info['last_update']
                }
                total_gpus += len(agent_info['data'].get('gpus', {}))
                online_nodes += 1
            else:
                nodes[node_name] = {
                    'status': 'offline',
                    'gpus': {},
                    'processes': [],
                    'system': {},
                    'last_update': agent_info.get('last_update')
                }
        
        return {
            'mode': 'hub',
            'nodes': nodes,
            'cluster_stats': {
                'total_nodes': len(self.agents),
                'online_nodes': online_nodes,
                'total_gpus': total_gpus
            }
        }
    
    def shutdown(self):
        """Disconnect from all agents"""
        self.running = False
        for agent_info in self.agents.values():
            if agent_info.get('client'):
                try:
                    agent_info['client'].disconnect()
                except:
                    pass

