"""
Alerting and notification utilities for GPU Hot.
Provides threshold evaluation and connectors to external services.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

try:
    import eventlet  # type: ignore
except ImportError:  # pragma: no cover - fallback for environments without eventlet
    eventlet = None  # type: ignore

import requests

from . import config

logger = logging.getLogger(__name__)

_thread_pool: Optional[ThreadPoolExecutor] = None


def _spawn_task(func: Callable, *args) -> None:
    """Spawn helper that works with or without eventlet."""
    global _thread_pool
    if eventlet is not None:
        eventlet.spawn_n(func, *args)
    else:
        if _thread_pool is None:
            _thread_pool = ThreadPoolExecutor(max_workers=4)
        _thread_pool.submit(func, *args)


def _execute_async(func: Callable, *args, **kwargs):
    """Execute potentially blocking call without stalling the main loop."""
    if eventlet is not None:
        return eventlet.tpool.execute(func, *args, **kwargs)
    return func(*args, **kwargs)


@dataclass
class AlertRule:
    """Definition of a single alert rule."""

    name: str
    label: str
    unit: str
    threshold: float
    extractor: Callable[[Dict[str, Any]], Optional[float]]
    reset_delta: Optional[float] = None
    formatter: Optional[Callable[[float], str]] = None

    def is_enabled(self) -> bool:
        return self.threshold > 0

    def format_value(self, value: float) -> str:
        if self.formatter:
            return self.formatter(value)
        if self.unit:
            return f"{value:.1f}{self.unit}"
        return f"{value:.1f}"

    def format_threshold(self) -> str:
        if self.unit:
            return f"{self.threshold:.1f}{self.unit}"
        return f"{self.threshold:.1f}"


class NotificationBackend:
    """Base class for notification backends."""

    name = "base"

    def send(self, message: str, context: Dict[str, Any]) -> None:  # pragma: no cover - interface only
        raise NotImplementedError


class DiscordWebhookBackend(NotificationBackend):
    """Discord webhook integration."""

    name = "discord"

    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    def send(self, message: str, context: Dict[str, Any]) -> None:
        payload = {
            "content": message,
            "allowed_mentions": {"parse": []},
        }
        response = requests.post(self.webhook_url, json=payload, timeout=10)
        response.raise_for_status()


class TelegramBackend(NotificationBackend):
    """Telegram bot API integration."""

    name = "telegram"

    def __init__(self, bot_token: str, chat_id: str):
        self.endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        self.chat_id = chat_id

    def send(self, message: str, context: Dict[str, Any]) -> None:
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "disable_notification": False,
        }
        response = requests.post(self.endpoint, json=payload, timeout=10)
        response.raise_for_status()


class AlertManager:
    """Evaluate GPU metrics against thresholds and dispatch notifications."""

    def __init__(
        self,
        *,
        thresholds: Optional[Sequence[AlertRule]] = None,
        enabled: Optional[bool] = None,
        cooldown_seconds: Optional[float] = None,
        reset_delta: Optional[float] = None,
        backends: Optional[List[NotificationBackend]] = None,
    ):
        self.enabled = config.NOTIFICATIONS_ENABLED if enabled is None else enabled
        self.cooldown_seconds = (
            config.ALERT_COOLDOWN_SECONDS if cooldown_seconds is None else cooldown_seconds
        )
        self.reset_delta = config.ALERT_RESET_DELTA if reset_delta is None else reset_delta

        self.backends = backends if backends is not None else self._build_backends()
        self.rules: List[AlertRule] = list(thresholds) if thresholds is not None else self._default_rules()

        # State: (node_name, gpu_id, rule_name) -> {"active": bool, "last_sent": float}
        self._state: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

        if self.enabled and not self.backends:
            logger.warning("Notifications enabled but no backends configured")

    def _build_backends(self) -> List[NotificationBackend]:
        backends: List[NotificationBackend] = []
        if config.DISCORD_WEBHOOK_URL:
            backends.append(DiscordWebhookBackend(config.DISCORD_WEBHOOK_URL))
        if config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID:
            backends.append(TelegramBackend(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID))
        return backends

    def _default_rules(self) -> List[AlertRule]:
        rules: List[AlertRule] = []
        reset = self.reset_delta

        if config.ALERT_TEMPERATURE_THRESHOLD > 0:
            rules.append(AlertRule(
                name="temperature",
                label="Temperature",
                unit="°C",
                threshold=config.ALERT_TEMPERATURE_THRESHOLD,
                extractor=lambda gpu: _safe_float(gpu.get("temperature")),
                reset_delta=reset,
            ))

        if config.ALERT_MEMORY_PERCENT_THRESHOLD > 0:
            def memory_percent(gpu: Dict[str, Any]) -> Optional[float]:
                used = _safe_float(gpu.get("memory_used"))
                total = _safe_float(gpu.get("memory_total"))
                if used is None or total in (None, 0):
                    return None
                return (used / total) * 100.0

            rules.append(AlertRule(
                name="memory_percent",
                label="Memory Usage",
                unit="%",
                threshold=config.ALERT_MEMORY_PERCENT_THRESHOLD,
                extractor=memory_percent,
                reset_delta=reset,
            ))

        if config.ALERT_UTILIZATION_THRESHOLD > 0:
            rules.append(AlertRule(
                name="utilization",
                label="Utilization",
                unit="%",
                threshold=config.ALERT_UTILIZATION_THRESHOLD,
                extractor=lambda gpu: _safe_float(gpu.get("utilization")),
                reset_delta=reset,
            ))

        if config.ALERT_POWER_THRESHOLD > 0:
            rules.append(AlertRule(
                name="power_draw",
                label="Power Draw",
                unit="W",
                threshold=config.ALERT_POWER_THRESHOLD,
                extractor=lambda gpu: _safe_float(gpu.get("power_draw")),
                reset_delta=reset,
            ))

        return rules

    def is_active(self) -> bool:
        return self.enabled and bool(self.backends) and any(rule.is_enabled() for rule in self.rules)

    def evaluate(
        self,
        node_name: str,
        gpu_data: Dict[str, Dict[str, Any]],
        processes: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> None:
        """Evaluate all GPUs and trigger notifications if needed."""
        if not self.is_active():
            return

        timestamp = time.time()
        for gpu_id, metrics in gpu_data.items():
            triggered = []
            for rule in self.rules:
                if not rule.is_enabled():
                    continue

                value = rule.extractor(metrics)
                if value is None:
                    continue

                state_key = (node_name, str(gpu_id), rule.name)
                state = self._state.setdefault(state_key, {"active": False, "last_sent": 0.0})

                over_threshold = value >= rule.threshold
                reset_delta = rule.reset_delta if rule.reset_delta is not None else self.reset_delta

                if over_threshold:
                    if (
                        not state["active"]
                        or (timestamp - state["last_sent"]) >= self.cooldown_seconds
                    ):
                        triggered.append((rule, value))
                        state["active"] = True
                        state["last_sent"] = timestamp
                else:
                    if state["active"] and reset_delta is not None:
                        reset_threshold = rule.threshold - reset_delta
                        if value <= reset_threshold:
                            state["active"] = False
                    else:
                        state["active"] = False

            if triggered:
                message = self._build_message(node_name, gpu_id, metrics, triggered, processes)
                context = {
                    "node_name": node_name,
                    "gpu_id": gpu_id,
                    "metrics": metrics,
                    "triggered": [(rule.name, value) for rule, value in triggered],
                }
                self._dispatch(message, context)

    def _build_message(
        self,
        node_name: str,
        gpu_id: str,
        metrics: Dict[str, Any],
        triggered: List[Tuple[AlertRule, float]],
        processes: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> str:
        gpu_name = metrics.get("name") or f"GPU {gpu_id}"
        uuid = metrics.get("uuid")
        header = f"🚨 GPU Hot alert on {node_name}"
        lines = [
            header,
            f"{gpu_name} (ID {gpu_id})",
        ]
        if uuid and uuid != "N/A":
            lines.append(f"UUID: {uuid}")

        for rule, value in triggered:
            lines.append(
                f"- {rule.label}: {rule.format_value(value)} (threshold {rule.format_threshold()})"
            )

        process_line = self._format_top_process(metrics, processes)
        if process_line:
            lines.append(process_line)

        return "\n".join(lines)

    def _format_top_process(
        self,
        metrics: Dict[str, Any],
        processes: Optional[Sequence[Dict[str, Any]]],
    ) -> Optional[str]:
        if not processes:
            return None

        gpu_uuid = metrics.get("uuid")
        if not gpu_uuid:
            return None

        matching = [
            proc for proc in processes
            if proc.get("gpu_uuid") == gpu_uuid or str(proc.get("gpu_id")) == str(metrics.get("index"))
        ]
        if not matching:
            return None

        # Prefer process list with memory usage info
        def process_sort_key(proc: Dict[str, Any]):
            mem = _safe_float(proc.get("memory")) or _safe_float(proc.get("gpu_memory")) or 0.0
            return mem

        top_proc = max(matching, key=process_sort_key)
        name = top_proc.get("name") or f"PID {top_proc.get('pid')}"
        pid = top_proc.get("pid")
        mem = _safe_float(top_proc.get("memory")) or _safe_float(top_proc.get("gpu_memory"))
        if mem is not None:
            return f"- Top process: {name} (PID {pid}, {mem:.0f} MiB)"
        return f"- Top process: {name} (PID {pid})"

    def _dispatch(self, message: str, context: Dict[str, Any]) -> None:
        for backend in self.backends:
            _spawn_task(self._send_backend, backend, message, context)

    @staticmethod
    def _send_backend(backend: NotificationBackend, message: str, context: Dict[str, Any]) -> None:
        try:
            _execute_async(backend.send, message, context)
            logger.info("Sent alert via %s for GPU %s", backend.name, context.get("gpu_id"))
        except Exception as exc:
            logger.error("Failed to send alert via %s: %s", backend.name, exc)


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "AlertManager",
    "AlertRule",
    "DiscordWebhookBackend",
    "TelegramBackend",
]
