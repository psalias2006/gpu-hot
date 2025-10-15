"""
Configuration settings for GPU Hot
"""

import os
import socket

# Flask Configuration
SECRET_KEY = 'gpu_hot_secret'
HOST = '0.0.0.0'
PORT = 1312
DEBUG = False

# Monitoring Configuration
UPDATE_INTERVAL = 0.5  # Update interval for NVML (sub-second monitoring)
NVIDIA_SMI_INTERVAL = 2.0  # Update interval for nvidia-smi fallback (slower to reduce overhead)

# GPU Monitoring Mode
# Can be set via environment variable: NVIDIA_SMI=true
NVIDIA_SMI = os.getenv('NVIDIA_SMI', 'false').lower() == 'true'

# Multi-Node Configuration
# MODE: standalone (default), agent, hub
MODE = os.getenv('GPU_HOT_MODE', 'standalone')
NODE_NAME = os.getenv('NODE_NAME', socket.gethostname())
# AGENT_URLS: comma-separated WebSocket URLs (e.g., ws://node1:1312,ws://node2:1312)
AGENT_URLS = [url.strip() for url in os.getenv('AGENT_URLS', '').split(',') if url.strip()]

