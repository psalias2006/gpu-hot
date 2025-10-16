"""
Configuration settings for GPU Hot
"""

import os
import socket


def _env_float(name, default):
    """Read float environment variable with fallback on errors."""
    value = os.getenv(name)
    if value is None:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


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

# Notification Configuration
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '').strip() or None
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip() or None
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '').strip() or None

_notifications_setting = os.getenv('GPU_HOT_NOTIFICATIONS', 'auto').strip().lower()
if _notifications_setting == 'true':
    NOTIFICATIONS_ENABLED = True
elif _notifications_setting == 'false':
    NOTIFICATIONS_ENABLED = False
else:
    NOTIFICATIONS_ENABLED = bool(DISCORD_WEBHOOK_URL or (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID))

ALERT_COOLDOWN_SECONDS = _env_float('GPU_HOT_ALERT_COOLDOWN', 300.0)
ALERT_RESET_DELTA = _env_float('GPU_HOT_ALERT_RESET_DELTA', 5.0)

ALERT_TEMPERATURE_THRESHOLD = _env_float('GPU_HOT_ALERT_TEMP', 85.0)
ALERT_MEMORY_PERCENT_THRESHOLD = _env_float('GPU_HOT_ALERT_MEMORY', 90.0)
ALERT_UTILIZATION_THRESHOLD = _env_float('GPU_HOT_ALERT_UTILIZATION', 95.0)
ALERT_POWER_THRESHOLD = _env_float('GPU_HOT_ALERT_POWER', 0.0)  # 0 disables power alerts
