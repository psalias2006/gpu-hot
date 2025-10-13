"""
Agent mode for GPU Hot - exposes HTTP API for GPU data collection
"""

import socket
import logging
import time
from datetime import datetime
from . import config

logger = logging.getLogger(__name__)

__version__ = '1.0.0'


class AgentServer:
    """Agent server that exposes GPU data via HTTP API"""
    
    def __init__(self, monitor):
        """Initialize agent server with a GPUMonitor instance
        
        Args:
            monitor: GPUMonitor instance for collecting GPU data
        """
        self.monitor = monitor
        self.start_time = time.time()
        self.node_id = self._generate_node_id()
        self.hostname = socket.gethostname()
        
        logger.info(f"Agent initialized: {self.node_id} ({self.hostname})")
    
    def _generate_node_id(self):
        """Generate unique node identifier
        
        Returns:
            str: Node identifier (hostname or hostname_ip)
        """
        try:
            hostname = socket.gethostname()
            # Try to get IP address
            try:
                ip = socket.gethostbyname(hostname)
                return f"{hostname}_{ip.replace('.', '_')}"
            except Exception:
                return hostname
        except Exception:
            return f"agent_{int(time.time())}"
    
    def get_uptime(self):
        """Get agent uptime in seconds
        
        Returns:
            float: Uptime in seconds
        """
        return time.time() - self.start_time
    
    def get_node_metadata(self):
        """Get node metadata
        
        Returns:
            dict: Node metadata including node_id, hostname, IP, uptime, version
        """
        try:
            ip_address = socket.gethostbyname(self.hostname)
        except Exception:
            ip_address = 'unknown'
        
        return {
            'node_id': self.node_id,
            'hostname': self.hostname,
            'ip_address': ip_address,
            'uptime': self.get_uptime(),
            'agent_version': __version__,
            'timestamp': datetime.now().isoformat()
        }
    
    def get_agent_data(self):
        """Collect and return GPU data in agent format
        
        Returns:
            dict: Complete agent data including metadata, GPUs, processes, system info
        """
        try:
            # Collect GPU data
            gpu_data = self.monitor.get_gpu_data()
            processes = self.monitor.get_processes()
            
            # Get system info
            import psutil
            system_info = {
                'cpu_percent': psutil.cpu_percent(percpu=False),
                'memory_percent': psutil.virtual_memory().percent,
                'timestamp': datetime.now().isoformat()
            }
            
            # Combine with metadata
            return {
                'metadata': self.get_node_metadata(),
                'gpus': gpu_data,
                'processes': processes,
                'system': system_info,
                'status': 'online'
            }
        except Exception as e:
            logger.error(f"Error collecting agent data: {e}")
            return {
                'metadata': self.get_node_metadata(),
                'gpus': {},
                'processes': [],
                'system': {},
                'status': 'error',
                'error': str(e)
            }
    
    def get_health(self):
        """Get agent health status
        
        Returns:
            dict: Health status with uptime and GPU count
        """
        try:
            gpu_count = len(self.monitor.get_gpu_data())
            return {
                'status': 'healthy',
                'uptime': self.get_uptime(),
                'gpu_count': gpu_count,
                'node_id': self.node_id,
                'hostname': self.hostname,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error getting health status: {e}")
            return {
                'status': 'unhealthy',
                'error': str(e),
                'node_id': self.node_id,
                'hostname': self.hostname,
                'timestamp': datetime.now().isoformat()
            }

