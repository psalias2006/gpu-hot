import unittest
from unittest.mock import patch

from core.alerts import AlertManager, AlertRule


class AlertManagerTest(unittest.TestCase):
    def setUp(self):
        self.temperature_rule = AlertRule(
            name="temperature",
            label="Temperature",
            unit="°C",
            threshold=80.0,
            extractor=lambda gpu: float(gpu.get("temperature")),
            reset_delta=5.0,
        )

    def _create_manager(self, **kwargs):
        manager = AlertManager(
            thresholds=[kwargs.get("rule", self.temperature_rule)],
            enabled=True,
            cooldown_seconds=kwargs.get("cooldown", 60.0),
            reset_delta=kwargs.get("reset_delta", 5.0),
            backends=["dummy"],  # Placeholder so manager stays active
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


if __name__ == "__main__":
    unittest.main()
