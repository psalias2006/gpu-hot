"""
Configuration settings for GPU Hot
"""

import os
import socket
import platform
import sys

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
# MODE: default (single node monitoring), hub (aggregate multiple nodes)
MODE = os.getenv('GPU_HOT_MODE', 'default')
NODE_NAME = os.getenv('NODE_NAME', socket.gethostname())
# NODE_URLS: comma-separated URLs for hub mode (e.g., http://node1:1312,http://node2:1312)
NODE_URLS = [url.strip() for url in os.getenv('NODE_URLS', '').split(',') if url.strip()]

# Platform Detection
PLATFORM = platform.system()  # 'Windows', 'Linux', 'Darwin', etc.

# Platform-specific configurations
PYTHON_EXECUTABLE = 'python' if PLATFORM == 'Windows' else 'python3'

def get_platform_info():
    """Get comprehensive platform information for diagnostics"""
    return {
        'platform': PLATFORM,
        'system': platform.system(),
        'release': platform.release(),
        'version': platform.version(),
        'machine': platform.machine(),
        'processor': platform.processor(),
        'python_version': platform.python_version(),
        'python_executable': sys.executable,
    }

def get_nvidia_smi_command():
    """Get the appropriate nvidia-smi command for the current platform"""
    if PLATFORM == 'Windows':
        # On Windows, nvidia-smi.exe should be in PATH
        return 'nvidia-smi'
    else:
        # On Linux/Unix systems (including Darwin/macOS)
        return 'nvidia-smi'

def is_windows():
    """Check if running on Windows platform"""
    return PLATFORM == 'Windows'

def is_unix_like():
    """Check if running on Unix-like platform (Linux, Darwin, etc.)"""
    return PLATFORM in ['Linux', 'Darwin', 'FreeBSD', 'OpenBSD', 'NetBSD']

