"""
Configuration settings for GPU Hot
"""

# Flask Configuration
SECRET_KEY = 'gpu_hot_secret'
HOST = '0.0.0.0'
PORT = 1312
DEBUG = False

# Monitoring Configuration
UPDATE_INTERVAL = 0.5  # Update interval in seconds (sub-second monitoring)

# GPU Monitoring Mode
NVIDIA_SMI = False  # Set True to force nvidia-smi mode for all GPUs (for testing)

