"""
GPU Hot - Core Package
Real-time NVIDIA GPU monitoring application
"""

__version__ = '1.0.0'
__author__ = 'GPU Hot Team'

from .monitor import GPUMonitor
from . import config

__all__ = ['GPUMonitor', 'config']

