"""
Configuration settings for GPU Hot
"""

import os
import yaml
import logging

logger = logging.getLogger(__name__)

# Flask Configuration
SECRET_KEY = 'gpu_hot_secret'
HOST = '0.0.0.0'
PORT = int(os.getenv('PORT', '1312'))
DEBUG = False

# Monitoring Configuration
UPDATE_INTERVAL = 0.5  # Update interval for NVML (sub-second monitoring)
NVIDIA_SMI_INTERVAL = 2.0  # Update interval for nvidia-smi fallback (slower to reduce overhead)

# GPU Monitoring Mode
# Can be set via environment variable: NVIDIA_SMI=true
NVIDIA_SMI = os.getenv('NVIDIA_SMI', 'false').lower() == 'true'

# Cluster Configuration
# MODE: 'standalone', 'agent', or 'hub'
MODE = os.getenv('GPU_HOT_MODE', 'standalone').lower()
AGENT_POLL_INTERVAL = float(os.getenv('AGENT_POLL_INTERVAL', '1.0'))  # Hub polling frequency
AGENT_TIMEOUT = float(os.getenv('AGENT_TIMEOUT', '5.0'))  # Timeout for agent requests
NODE_CONFIG_FILE = os.getenv('NODE_CONFIG_FILE', 'nodes.yaml')
CACHE_OFFLINE_DURATION = int(os.getenv('CACHE_OFFLINE_DURATION', '300'))  # Keep offline node data for 5 min


def parse_nodes_from_env():
    """Parse node URLs from GPU_HOT_NODES environment variable.
    
    Format: comma-separated URLs
    Example: GPU_HOT_NODES=http://node1:1312,http://node2:1312,http://192.168.1.100:1312
    
    Returns:
        list: List of node dictionaries with 'url' and optional 'name'
    """
    nodes_env = os.getenv('GPU_HOT_NODES', '')
    if not nodes_env:
        return []
    
    nodes = []
    for url in nodes_env.split(','):
        url = url.strip()
        if url:
            # Extract hostname from URL for default name
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                hostname = parsed.hostname or 'unknown'
                nodes.append({
                    'url': url,
                    'name': hostname,
                    'tags': []
                })
            except Exception as e:
                logger.warning(f"Failed to parse node URL {url}: {e}")
                nodes.append({
                    'url': url,
                    'name': url,
                    'tags': []
                })
    
    return nodes


def load_node_config(config_file=None):
    """Load node configuration from YAML file.
    
    Args:
        config_file: Path to YAML config file (defaults to NODE_CONFIG_FILE)
    
    Returns:
        list: List of node dictionaries with 'url', 'name', 'tags'
    """
    if config_file is None:
        config_file = NODE_CONFIG_FILE
    
    try:
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
            if config and 'nodes' in config:
                logger.info(f"Loaded {len(config['nodes'])} nodes from {config_file}")
                return config['nodes']
            else:
                logger.warning(f"No 'nodes' key found in {config_file}")
                return []
    except FileNotFoundError:
        logger.debug(f"Node config file {config_file} not found")
        return []
    except Exception as e:
        logger.error(f"Failed to load node config from {config_file}: {e}")
        return []


def get_nodes():
    """Get list of nodes from environment variables and/or config file.
    
    Priority: Environment variables override config file.
    
    Returns:
        list: Combined list of node dictionaries
    """
    nodes = []
    
    # Load from config file first
    file_nodes = load_node_config()
    nodes.extend(file_nodes)
    
    # Load from environment variables (higher priority)
    env_nodes = parse_nodes_from_env()
    if env_nodes:
        # Environment variables take precedence
        nodes = env_nodes
        logger.info(f"Using {len(env_nodes)} nodes from GPU_HOT_NODES environment variable")
    elif file_nodes:
        logger.info(f"Using {len(file_nodes)} nodes from config file")
    
    return nodes

