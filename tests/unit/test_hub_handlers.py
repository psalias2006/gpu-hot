"""Tests for core/hub_handlers.py"""

import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from core.hub_handlers import hub_loop


class TestHubLoop:
    @pytest.mark.asyncio
    async def test_broadcasts_cluster_data(self):
        hub = MagicMock()
        hub.running = True

        cluster_data = {
            'mode': 'hub',
            'nodes': {'node1': {'status': 'online', 'gpus': {}}},
            'cluster_stats': {'total_nodes': 1, 'online_nodes': 1, 'total_gpus': 0}
        }
        hub.get_cluster_data = AsyncMock(return_value=cluster_data)

        ws = AsyncMock()
        connections = {ws}

        async def stop_after_one(interval):
            hub.running = False

        with patch('asyncio.sleep', side_effect=stop_after_one):
            await hub_loop(hub, connections)

        ws.send_text.assert_called_once()
        sent = json.loads(ws.send_text.call_args[0][0])
        assert sent['mode'] == 'hub'
        assert 'cluster_stats' in sent

    @pytest.mark.asyncio
    async def test_removes_disconnected_clients(self):
        hub = MagicMock()
        hub.running = True
        hub.get_cluster_data = AsyncMock(return_value={'mode': 'hub', 'nodes': {}, 'cluster_stats': {}})

        good_ws = AsyncMock()
        bad_ws = AsyncMock()
        bad_ws.send_text.side_effect = Exception("disconnected")

        connections = {good_ws, bad_ws}

        async def stop_after_one(interval):
            hub.running = False

        with patch('asyncio.sleep', side_effect=stop_after_one):
            await hub_loop(hub, connections)

        assert bad_ws not in connections
        assert good_ws in connections

    @pytest.mark.asyncio
    async def test_client_can_disconnect_during_broadcast(self, caplog):
        hub = MagicMock()
        hub.running = True
        hub.get_cluster_data = AsyncMock(return_value={'mode': 'hub', 'nodes': {}, 'cluster_stats': {}})
        connections = set()

        class DisconnectingWebSocket:
            async def send_text(self, payload):
                connections.discard(self)

        websocket = DisconnectingWebSocket()
        connections.add(websocket)

        async def stop_after_one(interval):
            hub.running = False

        with patch('asyncio.sleep', side_effect=stop_after_one):
            await hub_loop(hub, connections)

        assert websocket not in connections
        assert 'Set changed size during iteration' not in caplog.text

    @pytest.mark.asyncio
    async def test_sleep_interval(self):
        hub = MagicMock()
        hub.running = True
        hub.get_cluster_data = AsyncMock(return_value={})

        sleep_values = []

        async def capture_sleep(val):
            sleep_values.append(val)
            hub.running = False

        with patch('asyncio.sleep', side_effect=capture_sleep):
            await hub_loop(hub, set())

        assert sleep_values[0] == 0.5
