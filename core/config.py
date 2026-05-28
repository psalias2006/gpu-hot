"""
Configuration settings for GPU Hot
"""

import os
import socket

# Server Configuration
SECRET_KEY = 'gpu_hot_secret'
HOST = '0.0.0.0'
PORT = 1312
DEBUG = False

# Monitoring Configuration
# Both intervals are overridable via env vars (seconds, float).
UPDATE_INTERVAL = float(os.getenv('UPDATE_INTERVAL', '0.5'))         # NVML polling interval
NVIDIA_SMI_INTERVAL = float(os.getenv('NVIDIA_SMI_INTERVAL', '2.0')) # nvidia-smi fallback interval

# GPU Monitoring Mode
# Can be set via environment variable: NVIDIA_SMI=true
NVIDIA_SMI = os.getenv('NVIDIA_SMI', 'false').lower() == 'true'

# Multi-Node Configuration
# MODE: default (single node monitoring), hub (aggregate multiple nodes)
MODE = os.getenv('GPU_HOT_MODE', 'default')
NODE_NAME = os.getenv('NODE_NAME', socket.gethostname())
# NODE_URLS: comma-separated URLs for hub mode (e.g., http://node1:1312,http://node2:1312)
NODE_URLS = [url.strip() for url in os.getenv('NODE_URLS', '').split(',') if url.strip()]

