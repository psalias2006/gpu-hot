import os
import tempfile
import unittest
from unittest.mock import patch

import core.alerts as alerts_module
from core.alerts import AlertManager, AlertRule, JSONAlertSettingsStore


class AlertManagerTest(unittest.TestCase):
    class _DummyBackend:
        name = "dummy"

        def send(self, message, context):
            return None

    def setUp(self):
        self.temperature_rule = AlertRule(
            name="temperature",
            label="Temperature",
            unit="°C",
            threshold=80.0,
            extractor=lambda gpu: float(gpu.get("temperature")),
            reset_delta=5.0,
        )
        self.backend = self._DummyBackend()

    def _create_manager(self, **kwargs):
        backend = kwargs.get("backend", self.backend)
        manager = AlertManager(
            thresholds=[kwargs.get("rule", self.temperature_rule)],
            enabled=True,
            cooldown_seconds=kwargs.get("cooldown", 60.0),
            reset_delta=kwargs.get("reset_delta", 5.0),
            backends=[backend],  # Placeholder so manager stays active
            settings_store=kwargs.get("settings_store"),
        )
        manager._dispatch = lambda message, context: self._captured.append((message, context))  # type: ignore
        return manager

    def test_triggers_and_cooldown(self):
        self._captured = []
        manager = self._create_manager()

        gpu_metrics = {"temperature": 90, "name": "RTX 3090", "uuid": "GPU-123"}

        with patch("core.alerts.time.time", return_value=0):
            manager.evaluate("node-1", {"0": gpu_metrics}, [])
        self.assertEqual(len(self._captured), 1)
        self.assertIn("RTX 3090", self._captured[0][0])
        self.assertIn("Temperature", self._captured[0][0])

        # Within cooldown -> no new alert
        with patch("core.alerts.time.time", return_value=10):
            manager.evaluate("node-1", {"0": gpu_metrics}, [])
        self.assertEqual(len(self._captured), 1)

        # After cooldown -> alert again
        with patch("core.alerts.time.time", return_value=65):
            manager.evaluate("node-1", {"0": gpu_metrics}, [])
        self.assertEqual(len(self._captured), 2)

    def test_reset_allows_new_alert_before_cooldown(self):
        self._captured = []
        manager = self._create_manager()

        gpu_metrics = {"temperature": 90, "name": "A100", "uuid": "gpu-a100"}

        with patch("core.alerts.time.time", return_value=0):
            manager.evaluate("host", {"0": gpu_metrics}, [])
        self.assertEqual(len(self._captured), 1)

        # Drop temperature sufficiently to reset alert state
        cooldown_bypass_metrics = {"temperature": 70, "name": "A100", "uuid": "gpu-a100"}
        with patch("core.alerts.time.time", return_value=5):
            manager.evaluate("host", {"0": cooldown_bypass_metrics}, [])
        self.assertEqual(len(self._captured), 1)

        # Immediately spike again -> should alert even though cooldown not elapsed
        with patch("core.alerts.time.time", return_value=6):
            manager.evaluate("host", {"0": gpu_metrics}, [])
        self.assertEqual(len(self._captured), 2)

    def test_update_settings_changes_threshold_and_resets_state(self):
        self._captured = []
        manager = self._create_manager()

        gpu_metrics = {"temperature": 90, "name": "RTX 3090", "uuid": "GPU-123"}

        with patch("core.alerts.time.time", return_value=0):
            manager.evaluate("host", {"0": gpu_metrics}, [])

        self.assertTrue(manager._state)
        updated = manager.update_settings({
            "rules": [{"name": "temperature", "threshold": 75}],
            "cooldown_seconds": 10,
        })

        self.assertEqual(manager.rules[0].threshold, 75.0)
        self.assertEqual(manager.cooldown_seconds, 10.0)
        self.assertFalse(manager._state)  # State cleared after update
        self.assertEqual(updated["rules"][0]["threshold"], 75.0)

    def test_persist_settings_round_trip(self):
        self._captured = []
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "alerts.json")
            store = JSONAlertSettingsStore(settings_path)

            manager = self._create_manager(settings_store=store)
            manager.update_settings({
                "rules": [{"name": "temperature", "threshold": 70}],
                "cooldown_seconds": 45,
            })

            # New manager should pick up persisted settings automatically
            new_rule = AlertRule(
                name="temperature",
                label="Temperature",
                unit="°C",
                threshold=80.0,
                extractor=lambda gpu: float(gpu.get("temperature")),
                reset_delta=5.0,
            )
            new_manager = AlertManager(
                thresholds=[new_rule],
                enabled=True,
                cooldown_seconds=30.0,
                reset_delta=5.0,
                backends=[self.backend],
                settings_store=store,
            )
            snapshot = new_manager.get_settings()

            self.assertEqual(snapshot["rules"][0]["threshold"], 70.0)
            self.assertEqual(new_manager.cooldown_seconds, 45.0)

    def test_update_settings_configures_backends(self):
        self._captured = []
        with tempfile.TemporaryDirectory() as tmpdir, \
                patch.object(alerts_module.config, "DISCORD_WEBHOOK_URL", None), \
                patch.object(alerts_module.config, "TELEGRAM_BOT_TOKEN", None), \
                patch.object(alerts_module.config, "TELEGRAM_CHAT_ID", None):
            settings_path = os.path.join(tmpdir, "alerts.json")
            store = JSONAlertSettingsStore(settings_path)

            manager = AlertManager(
                thresholds=[self.temperature_rule],
                enabled=True,
                cooldown_seconds=60.0,
                reset_delta=5.0,
                settings_store=store,
            )

            snapshot = manager.update_settings({
                "backends": {
                    "discord": {"webhook_url": "https://discord.com/api/webhooks/example"},
                    "telegram": {"bot_token": "123456:ABCdef", "chat_id": "999"},
                }
            })

            names = {backend.name for backend in manager.backends}
            self.assertIn("discord", names)
            self.assertIn("telegram", names)
            self.assertEqual(
                snapshot["backends"]["discord"]["webhook_url"],
                "https://discord.com/api/webhooks/example",
            )

            reloaded = AlertManager(
                thresholds=[self.temperature_rule],
                enabled=True,
                cooldown_seconds=60.0,
                reset_delta=5.0,
                settings_store=store,
            )
            reloaded_names = {backend.name for backend in reloaded.backends}
            self.assertIn("discord", reloaded_names)
            self.assertIn("telegram", reloaded_names)

    def test_update_settings_requires_complete_telegram_config(self):
        self._captured = []
        with patch.object(alerts_module.config, "DISCORD_WEBHOOK_URL", None), \
                patch.object(alerts_module.config, "TELEGRAM_BOT_TOKEN", None), \
                patch.object(alerts_module.config, "TELEGRAM_CHAT_ID", None):
            manager = AlertManager(
                thresholds=[self.temperature_rule],
                enabled=True,
                cooldown_seconds=60.0,
                reset_delta=5.0,
            )
            with self.assertRaises(ValueError):
                manager.update_settings({
                    "backends": {
                        "telegram": {"bot_token": "only-token"}
                    }
                })

    def test_update_settings_can_clear_backends(self):
        self._captured = []
        with patch.object(alerts_module.config, "DISCORD_WEBHOOK_URL", None), \
                patch.object(alerts_module.config, "TELEGRAM_BOT_TOKEN", None), \
                patch.object(alerts_module.config, "TELEGRAM_CHAT_ID", None):
            manager = AlertManager(
                thresholds=[self.temperature_rule],
                enabled=True,
                cooldown_seconds=60.0,
                reset_delta=5.0,
            )
            manager.update_settings({
                "backends": {
                    "discord": {"webhook_url": "https://discord.com/api/webhooks/example"},
                }
            })
            self.assertTrue(any(backend.name == "discord" for backend in manager.backends))

            manager.update_settings({"backends": {"discord": None}})
            self.assertFalse(any(backend.name == "discord" for backend in manager.backends))

    def test_update_settings_validates_threshold(self):
        self._captured = []
        manager = self._create_manager()
        with self.assertRaises(ValueError):
            manager.update_settings({"rules": [{"name": "temperature", "threshold": -5}]})

    def test_send_test_notification_dispatches(self):
        self._captured = []
        manager = self._create_manager()
        manager.send_test_notification("Test message")
        self.assertEqual(len(self._captured), 1)
        message, context = self._captured[0]
        self.assertIn("Test message", message)
        self.assertTrue(context.get("test"))

    def test_send_test_notification_requires_backend(self):
        manager = AlertManager(
            thresholds=[self.temperature_rule],
            enabled=True,
            cooldown_seconds=60.0,
            reset_delta=5.0,
            backends=[],
        )
        with self.assertRaises(ValueError):
            manager.send_test_notification()

    def test_send_test_notification_without_eventlet_tpool(self):
        self._captured = []

        class DummyEventlet:
            @staticmethod
            def spawn_n(func, *args, **kwargs):
                func(*args, **kwargs)

        manager = self._create_manager()

        with patch.object(alerts_module, "eventlet", DummyEventlet()):
            manager.send_test_notification("Fallback test")

        self.assertEqual(len(self._captured), 1)


if __name__ == "__main__":
    unittest.main()
