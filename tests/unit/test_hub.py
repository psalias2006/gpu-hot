"""Tests for core/hub.py"""

import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime

from core.hub import Hub


class TestHubInit:
    def test_init_state(self):
        hub = Hub(['http://a:1312', 'http://b:1312'])
        assert len(hub.nodes) == 2
        assert hub.running is False
        assert hub._connection_started is False

    def test_nodes_initialized_offline(self):
        hub = Hub(['http://a:1312'])
        node = hub.nodes['http://a:1312']
        assert node['status'] == 'offline'
        assert node['websocket'] is None
        assert node['data'] is None

    def test_url_to_node_mapping(self):
        hub = Hub(['http://a:1312', 'http://b:1312'])
        assert hub.url_to_node['http://a:1312'] == 'http://a:1312'
        assert hub.url_to_node['http://b:1312'] == 'http://b:1312'

    def test_empty_urls(self):
        hub = Hub([])
        assert len(hub.nodes) == 0


class TestConnectNodeWithRetry:
    @pytest.mark.asyncio
    async def test_success_first_try(self):
        hub = Hub(['http://a:1312'])
        hub.running = True

        with patch.object(hub, '_connect_node', new_callable=AsyncMock) as mock_connect:
            await hub._connect_node_with_retry('http://a:1312')
            mock_connect.assert_called_once_with('http://a:1312')

    @pytest.mark.asyncio
    async def test_eventual_success(self):
        hub = Hub(['http://a:1312'])
        hub.running = True

        call_count = [0]

        async def fail_then_succeed(url):
            call_count[0] += 1
            if call_count[0] < 3:
                raise Exception("connection refused")

        with patch.object(hub, '_connect_node', side_effect=fail_then_succeed), \
             patch('asyncio.sleep', new_callable=AsyncMock):
            await hub._connect_node_with_retry('http://a:1312')

        assert call_count[0] == 3

    @pytest.mark.asyncio
    async def test_all_retries_fail(self):
        hub = Hub(['http://a:1312'])
        hub.running = True

        with patch.object(hub, '_connect_node', side_effect=Exception("fail")), \
             patch('asyncio.sleep', new_callable=AsyncMock):
            # Should not raise — just logs error
            await hub._connect_node_with_retry('http://a:1312')


class TestGetClusterData:
    @pytest.mark.asyncio
    async def test_all_online(self):
        hub = Hub(['http://a:1312', 'http://b:1312'])

        hub.nodes['http://a:1312'] = {
            'url': 'http://a:1312',
            'websocket': MagicMock(),
            'data': {
                'gpus': {'0': {'name': 'GPU A'}},
                'processes': [],
                'system': {'cpu_percent': 50}
            },
            'status': 'online',
            'last_update': datetime.now().isoformat()
        }
        hub.nodes['http://b:1312'] = {
            'url': 'http://b:1312',
            'websocket': MagicMock(),
            'data': {
                'gpus': {'0': {'name': 'GPU B'}, '1': {'name': 'GPU B2'}},
                'processes': [],
                'system': {'cpu_percent': 30}
            },
            'status': 'online',
            'last_update': datetime.now().isoformat()
        }

        result = await hub.get_cluster_data()

        assert result['mode'] == 'hub'
        assert result['cluster_stats']['total_nodes'] == 2
        assert result['cluster_stats']['online_nodes'] == 2
        assert result['cluster_stats']['total_gpus'] == 3

    @pytest.mark.asyncio
    async def test_mixed_online_offline(self):
        hub = Hub(['http://a:1312', 'http://b:1312'])

        hub.nodes['http://a:1312'] = {
            'url': 'http://a:1312',
            'websocket': MagicMock(),
            'data': {
                'gpus': {'0': {'name': 'GPU A'}},
                'processes': [],
                'system': {}
            },
            'status': 'online',
            'last_update': datetime.now().isoformat()
        }
        hub.nodes['http://b:1312'] = {
            'url': 'http://b:1312',
            'websocket': None,
            'data': None,
            'status': 'offline',
            'last_update': None
        }

        result = await hub.get_cluster_data()

        assert result['cluster_stats']['online_nodes'] == 1
        assert result['cluster_stats']['total_gpus'] == 1
        assert result['nodes']['http://b:1312']['status'] == 'offline'
        assert result['nodes']['http://b:1312']['gpus'] == {}

    @pytest.mark.asyncio
    async def test_all_offline(self):
        hub = Hub(['http://a:1312'])

        result = await hub.get_cluster_data()

        assert result['cluster_stats']['online_nodes'] == 0
        assert result['cluster_stats']['total_gpus'] == 0
        assert result['cluster_stats']['total_nodes'] == 1


class TestHealthStatus:
    def test_healthy_with_one_fresh_node(self):
        hub = Hub(['http://a:1312', 'http://b:1312'])
        hub.nodes['http://a:1312'].update({
            'status': 'online',
            'data': {'gpus': {}},
            'last_update_monotonic': 90.0
        })

        with patch('core.hub.config.HUB_HEALTH_STALE_SECONDS', 30):
            health_status = hub.get_health_status(now=100.0)

        assert health_status['status'] == 'healthy'
        assert health_status['reason'] == 'fresh_node_data'
        assert health_status['configured_nodes'] == 2
        assert health_status['fresh_nodes'] == 1
        assert health_status['newest_update_age_seconds'] == 10.0

    def test_unhealthy_when_all_nodes_absent(self):
        hub = Hub(['http://a:1312'])

        health_status = hub.get_health_status(now=100.0)

        assert health_status['status'] == 'unhealthy'
        assert health_status['reason'] == 'no_node_data'
        assert health_status['fresh_nodes'] == 0
        assert health_status['newest_update_age_seconds'] is None

    def test_unhealthy_when_newest_update_is_stale(self):
        hub = Hub(['http://a:1312'])
        hub.nodes['http://a:1312'].update({
            'status': 'online',
            'data': {'gpus': {}},
            'last_update_monotonic': 60.0
        })

        with patch('core.hub.config.HUB_HEALTH_STALE_SECONDS', 30):
            health_status = hub.get_health_status(now=100.0)

        assert health_status['status'] == 'unhealthy'
        assert health_status['reason'] == 'node_data_stale'
        assert health_status['fresh_nodes'] == 0
        assert health_status['newest_update_age_seconds'] == 40.0

    def test_offline_node_history_does_not_count_as_fresh(self):
        hub = Hub(['http://a:1312'])
        hub.nodes['http://a:1312'].update({
            'status': 'offline',
            'data': {'gpus': {}},
            'last_update_monotonic': 99.0
        })

        health_status = hub.get_health_status(now=100.0)

        assert health_status['status'] == 'unhealthy'
        assert health_status['reason'] == 'no_node_data'
        assert health_status['newest_update_age_seconds'] is None


class TestShutdown:
    @pytest.mark.asyncio
    async def test_shutdown_closes_websockets(self):
        hub = Hub(['http://a:1312'])
        mock_ws = AsyncMock()
        hub.nodes['http://a:1312']['websocket'] = mock_ws

        await hub.shutdown()

        assert hub.running is False
        mock_ws.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown_no_websocket(self):
        hub = Hub(['http://a:1312'])
        hub.nodes['http://a:1312']['websocket'] = None

        await hub.shutdown()  # Should not raise
        assert hub.running is False

    @pytest.mark.asyncio
    async def test_shutdown_handles_close_error(self):
        hub = Hub(['http://a:1312'])
        mock_ws = AsyncMock()
        mock_ws.close.side_effect = Exception("already closed")
        hub.nodes['http://a:1312']['websocket'] = mock_ws

        await hub.shutdown()  # Should not raise
        assert hub.running is False
