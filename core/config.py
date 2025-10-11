"""
Configuration settings for GPU Hot
"""

# Flask Configuration
SECRET_KEY = 'gpu_hot_secret'
HOST = '0.0.0.0'
PORT = 1312
DEBUG = False

# Monitoring Configuration
UPDATE_INTERVAL = 0.5  # Update interval for NVML (sub-second monitoring)
NVIDIA_SMI_INTERVAL = 2.0  # Update interval for nvidia-smi fallback (slower to reduce overhead)

# GPU Monitoring Mode
NVIDIA_SMI = True  # Set True to force nvidia-smi mode for all GPUs (for testing)

