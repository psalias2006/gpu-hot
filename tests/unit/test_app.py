"""Tests for app.py"""

import sys
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ---------------------------------------------------------------------------
# compare_versions — pure function, no app import side effects
# ---------------------------------------------------------------------------

class TestCompareVersions:
    @pytest.fixture(autouse=True)
    def _import_compare(self):
        """Import compare_versions while mocking pynvml to avoid GPU init."""
        mock_pynvml = MagicMock()
        mock_pynvml.nvmlInit = MagicMock()
        mock_pynvml.nvmlDeviceGetCount = MagicMock(return_value=0)
        mock_pynvml.nvmlSystemGetDriverVersion = MagicMock(return_value=b"535.0")
        mock_pynvml.NVMLError = type('NVMLError', (Exception,), {})

        with patch.dict(sys.modules, {'pynvml': mock_pynvml}):
            # Also mock the collector and monitor to avoid full init
            with patch('core.metrics.collector.MetricsCollector'), \
                 patch('core.monitor.GPUMonitor.__init__', return_value=None):
                import importlib
                if 'app' in sys.modules:
                    importlib.reload(sys.modules['app'])
                else:
                    import app
                self.compare_versions = sys.modules['app'].compare_versions

    def test_newer_major(self):
        assert self.compare_versions("1.0.0", "2.0.0") is True

    def test_newer_minor(self):
        assert self.compare_versions("1.7.0", "1.8.0") is True

    def test_newer_patch(self):
        assert self.compare_versions("1.7.3", "1.7.4") is True

    def test_same_version(self):
        assert self.compare_versions("1.7.3", "1.7.3") is False

    def test_older_version(self):
        assert self.compare_versions("2.0.0", "1.0.0") is False

    def test_different_length_newer(self):
        assert self.compare_versions("1.7", "1.7.1") is True

    def test_different_length_same(self):
        assert self.compare_versions("1.7.0", "1.7") is False

    def test_invalid_version(self):
        assert self.compare_versions("abc", "1.0") is False

    def test_none_version(self):
        assert self.compare_versions(None, "1.0") is False

    def test_empty_string(self):
        assert self.compare_versions("", "1.0") is False


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------

class TestEndpoints:
    @pytest.fixture(autouse=True)
    def _setup_app(self):
        """Import app with mocked GPU subsystem."""
        import os
        # Ensure we're in default mode (not hub)
        os.environ.pop('GPU_HOT_MODE', None)
        os.environ['GPU_HOT_MODE'] = 'default'

        mock_pynvml = MagicMock()
        mock_pynvml.nvmlInit = MagicMock()
        mock_pynvml.nvmlDeviceGetCount = MagicMock(return_value=0)
        mock_pynvml.nvmlSystemGetDriverVersion = MagicMock(return_value=b"535.0")
        mock_pynvml.NVMLError = type('NVMLError', (Exception,), {})
        mock_pynvml.NVML_TEMPERATURE_GPU = 0
        mock_pynvml.NVML_ERROR_NOT_SUPPORTED = 3

        with patch.dict(sys.modules, {'pynvml': mock_pynvml}):
            # Reload config to pick up default mode
            import importlib
            import core.config
            importlib.reload(core.config)

            with patch('core.monitor.GPUMonitor.__init__', return_value=None):
                if 'app' in sys.modules:
                    importlib.reload(sys.modules['app'])
                else:
                    import app
                self.app = sys.modules['app'].app
                self.app_module = sys.modules['app']

        yield
        os.environ.pop('GPU_HOT_MODE', None)

    @pytest.mark.asyncio
    async def test_index_returns_html(self):
        from httpx import AsyncClient, ASGITransport
        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/")
            assert response.status_code == 200
            assert "text/html" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_api_gpu_data(self):
        from httpx import AsyncClient, ASGITransport
        # Mock monitor_or_hub to return data
        self.app_module.monitor_or_hub = MagicMock()
        self.app_module.monitor_or_hub.get_gpu_data = AsyncMock(return_value={'0': {'name': 'Test GPU'}})
        self.app_module.config.MODE = 'default'

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/gpu-data")
            assert response.status_code == 200
            data = response.json()
            assert 'gpus' in data

    @pytest.mark.asyncio
    async def test_api_gpu_data_hub_mode(self):
        from httpx import AsyncClient, ASGITransport
        self.app_module.config.MODE = 'hub'

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/gpu-data")
            assert response.status_code == 200
            data = response.json()
            assert data['gpus'] == {}

    @pytest.mark.asyncio
    async def test_hub_health_is_healthy_with_fresh_node_data(self):
        from httpx import AsyncClient, ASGITransport
        from core.hub import Hub
        import time

        self.app_module.config.MODE = 'hub'
        hub = Hub(['http://a:1312'])
        hub.nodes['http://a:1312'].update({
            'status': 'online',
            'data': {'gpus': {}},
            'last_update_monotonic': time.monotonic()
        })
        self.app_module.monitor_or_hub = hub

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

        assert response.status_code == 200
        assert response.json()['fresh_nodes'] == 1

    @pytest.mark.asyncio
    async def test_hub_health_fails_without_fresh_node_data(self):
        from httpx import AsyncClient, ASGITransport
        from core.hub import Hub

        self.app_module.config.MODE = 'hub'
        hub = Hub(['http://a:1312'])
        hub.nodes['http://a:1312'].update({
            'status': 'online',
            'data': {'gpus': {}},
            'last_update_monotonic': 1.0
        })
        self.app_module.monitor_or_hub = hub

        transport = ASGITransport(app=self.app)
        with patch('core.hub.time.monotonic', return_value=100.0):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/health")

        assert response.status_code == 503
        assert response.json()['reason'] == 'node_data_stale'

    @pytest.mark.asyncio
    async def test_api_version_github_failure(self):
        from httpx import AsyncClient, ASGITransport
        with patch('aiohttp.ClientSession') as mock_session:
            mock_session.return_value.__aenter__ = AsyncMock(side_effect=Exception("network error"))
            mock_session.return_value.__aexit__ = AsyncMock()

            transport = ASGITransport(app=self.app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/version")
                assert response.status_code == 200
                data = response.json()
                assert data['update_available'] is False
                assert 'current' in data
