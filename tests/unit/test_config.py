"""Tests for core/config.py"""

import os
import importlib
import pytest


class TestConfig:
    def _reload_config(self, env_overrides=None):
        """Reload config module with optional env var overrides."""
        env = env_overrides or {}
        # Set env vars
        for k, v in env.items():
            os.environ[k] = v
        try:
            import core.config as config_mod
            importlib.reload(config_mod)
            return config_mod
        finally:
            # Clean up env vars
            for k in env:
                os.environ.pop(k, None)

    def test_default_mode(self):
        config = self._reload_config({'GPU_HOT_MODE': 'default'})
        assert config.MODE == 'default'

    def test_hub_mode(self):
        config = self._reload_config({'GPU_HOT_MODE': 'hub'})
        assert config.MODE == 'hub'

    def test_mode_defaults_to_default(self):
        os.environ.pop('GPU_HOT_MODE', None)
        config = self._reload_config()
        assert config.MODE == 'default'

    def test_node_urls_parsing(self):
        config = self._reload_config({
            'NODE_URLS': 'http://a:1312,http://b:1312'
        })
        assert config.NODE_URLS == ['http://a:1312', 'http://b:1312']

    def test_node_urls_empty(self):
        config = self._reload_config({'NODE_URLS': ''})
        assert config.NODE_URLS == []

    def test_node_urls_whitespace(self):
        config = self._reload_config({
            'NODE_URLS': ' http://a:1312 , http://b:1312 '
        })
        assert config.NODE_URLS == ['http://a:1312', 'http://b:1312']

    def test_nvidia_smi_true(self):
        config = self._reload_config({'NVIDIA_SMI': 'true'})
        assert config.NVIDIA_SMI is True

    def test_nvidia_smi_false(self):
        config = self._reload_config({'NVIDIA_SMI': 'false'})
        assert config.NVIDIA_SMI is False

    def test_nvidia_smi_default(self):
        os.environ.pop('NVIDIA_SMI', None)
        config = self._reload_config()
        assert config.NVIDIA_SMI is False

    def test_node_name_default(self):
        import socket
        os.environ.pop('NODE_NAME', None)
        config = self._reload_config()
        assert config.NODE_NAME == socket.gethostname()

    def test_node_name_custom(self):
        config = self._reload_config({'NODE_NAME': 'my-gpu-server'})
        assert config.NODE_NAME == 'my-gpu-server'

    def test_server_constants(self):
        config = self._reload_config()
        assert config.HOST == '0.0.0.0'
        assert config.PORT == 1312
        assert config.UPDATE_INTERVAL == 0.5
        assert config.NVIDIA_SMI_INTERVAL == 2.0
        assert config.HUB_HEALTH_STALE_SECONDS == 30.0
