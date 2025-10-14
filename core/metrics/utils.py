"""Utility functions for metrics collection"""

import pynvml


def safe_get(func, *args, default=None):
    """Safely call NVML function, returns default if unsupported"""
    try:
        result = func(*args)
        return result if result is not None else default
    except (pynvml.NVMLError, Exception):
        return default


def decode_bytes(value):
    """Decode bytes to string if necessary"""
    return value.decode("utf-8") if isinstance(value, bytes) else value


def to_mib(bytes_value):
    """Convert bytes to MiB"""
    return float(bytes_value / (1024**2))


def to_watts(milliwatts):
    """Convert milliwatts to watts"""
    return float(milliwatts / 1000.0)
