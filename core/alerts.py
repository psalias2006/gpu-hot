"""
Alerting and notification utilities for GPU Hot.
Provides threshold evaluation and connectors to external services.
"""

import logging
import json
from copy import deepcopy
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple
from uuid import uuid4

try:
    import eventlet  # type: ignore
except ImportError:  # pragma: no cover - fallback for environments without eventlet
    eventlet = None  # type: ignore

import requests

from . import config

logger = logging.getLogger(__name__)

ALERT_EMBED_COLOR = 0xF04747
RECOVERY_EMBED_COLOR = 0x43B581
TEST_EMBED_COLOR = 0x5865F2

EMBED_FOOTER_ICON_URL = "https://cdn-icons-png.flaticon.com/512/481/481073.png"

DISCORD_BOT_NAME = "HOT-GPU"

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
        tpool = getattr(eventlet, "tpool", None)
        if tpool and hasattr(tpool, "execute"):
            return tpool.execute(func, *args, **kwargs)
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
        event = context.get("event") or ("test" if context.get("test") else "alert")
        lines = context.get("lines") or (message.splitlines() or [message])
        embed_payload = context.get("embed") or {}

        color_map = {
            "alert": ALERT_EMBED_COLOR,
            "recovery": RECOVERY_EMBED_COLOR,
            "test": TEST_EMBED_COLOR,
        }

        embed: Dict[str, Any] = {
            "title": embed_payload.get("title") or (lines[0][:256] if lines else "GPU Hot"),
            "color": int(embed_payload.get("color", color_map.get(event, TEST_EMBED_COLOR))),
        }

        description = embed_payload.get("description")
        if not description and len(lines) > 1:
            description = "\n".join(lines[1:])
        if description:
            embed["description"] = description[:2048]

        fields = embed_payload.get("fields") or []
        if fields:
            embed["fields"] = [
                {
                    "name": str(field.get("name", ""))[:256],
                    "value": str(field.get("value", ""))[:1024],
                    "inline": bool(field.get("inline", False)),
                }
                for field in fields
            ]
        else:
            embed.pop("fields", None)

        footer_text = embed_payload.get("footer_text") or f"{context.get('node_name') or 'GPU Hot'} - GPU Monitoring"
        footer: Dict[str, Any] = {"text": footer_text[:2048]}
        footer_icon = embed_payload.get("footer_icon_url") or EMBED_FOOTER_ICON_URL
        if footer_icon:
            footer["icon_url"] = footer_icon
        embed["footer"] = footer

        timestamp = embed_payload.get("timestamp") or context.get("timestamp")
        if timestamp:
            embed["timestamp"] = timestamp

        payload = {
            "content": message if event == "test" else None,
            "username": DISCORD_BOT_NAME,
            "embeds": [embed],
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
        settings_store: Optional["AlertSettingsStore"] = None,
    ):
        self.enabled = config.NOTIFICATIONS_ENABLED if enabled is None else enabled
        self.cooldown_seconds = (
            config.ALERT_COOLDOWN_SECONDS if cooldown_seconds is None else cooldown_seconds
        )
        self.reset_delta = config.ALERT_RESET_DELTA if reset_delta is None else reset_delta

        self.settings_store: Optional["AlertSettingsStore"] = settings_store
        if self.settings_store is None and config.ALERT_SETTINGS_FILE:
            self.settings_store = JSONAlertSettingsStore(config.ALERT_SETTINGS_FILE)

        self._custom_backends: Optional[List[NotificationBackend]] = (
            list(backends) if backends is not None else None
        )
        self.backend_settings: List[Dict[str, Any]] = []

        if self._custom_backends is not None:
            self.backends = list(self._custom_backends)
        else:
            self.backend_settings = self._ensure_channel_ids(self._default_backend_settings())
            self.backends = self._build_backends_from_settings(self.backend_settings)

        self.rules: List[AlertRule] = list(thresholds) if thresholds is not None else self._default_rules()

        # State: (node_name, gpu_id, rule_name) -> {"active": bool, "last_sent": float}
        self._state: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        self._lock = Lock()
        self._defaults = self._build_default_snapshot()

        self._load_persisted_settings()

        if self.enabled and not self.backends:
            logger.warning("Notifications enabled but no backends configured")

    def _default_backend_settings(self) -> List[Dict[str, str]]:
        settings: List[Dict[str, str]] = []
        if config.DISCORD_WEBHOOK_URL:
            settings.append({
                "type": "discord",
                "webhook_url": config.DISCORD_WEBHOOK_URL,
                "enabled": True,
            })
        if config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID:
            settings.append({
                "type": "telegram",
                "bot_token": config.TELEGRAM_BOT_TOKEN,
                "chat_id": config.TELEGRAM_CHAT_ID,
                "enabled": True,
            })
        return settings

    def _build_backends_from_settings(
        self, settings: Optional[Sequence[Dict[str, Any]]]
    ) -> List[NotificationBackend]:
        backends: List[NotificationBackend] = []
        if not settings:
            return backends

        for entry in settings:
            if not isinstance(entry, dict):
                continue
            channel_type = entry.get("type")
            if entry.get("enabled") is False:
                continue
            if channel_type == "discord":
                webhook = str(entry.get("webhook_url", "")).strip()
                if webhook:
                    backends.append(DiscordWebhookBackend(webhook))
            elif channel_type == "telegram":
                token = str(entry.get("bot_token", "")).strip()
                chat_id = str(entry.get("chat_id", "")).strip()
                if token and chat_id:
                    backends.append(TelegramBackend(token, chat_id))

        return backends

    def _normalize_backend_payload(self, payload: Any) -> List[Dict[str, Any]]:
        if payload is None:
            return []

        if isinstance(payload, dict):
            # Backwards compatibility: single discord/telegram objects
            normalized: List[Dict[str, Any]] = []
            discord_cfg = payload.get("discord")
            if discord_cfg:
                if not isinstance(discord_cfg, dict):
                    raise ValueError("discord backend must be provided as an object")
                url = str(discord_cfg.get("webhook_url", "")).strip()
                if url:
                    normalized.append({
                        "type": "discord",
                        "webhook_url": url,
                        "enabled": discord_cfg.get("enabled", True) is not False,
                    })
            telegram_cfg = payload.get("telegram")
            if telegram_cfg:
                if not isinstance(telegram_cfg, dict):
                    raise ValueError("telegram backend must be provided as an object")
                token = str(telegram_cfg.get("bot_token", "")).strip()
                chat_id = str(telegram_cfg.get("chat_id", "")).strip()
                if not token or not chat_id:
                    raise ValueError("telegram backend requires both bot_token and chat_id")
                normalized.append({
                    "type": "telegram",
                    "bot_token": token,
                    "chat_id": chat_id,
                    "enabled": telegram_cfg.get("enabled", True) is not False,
                })
            return normalized

        if not isinstance(payload, (list, tuple)):
            raise ValueError("backends must be provided as a list")

        normalized: List[Dict[str, Any]] = []
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            channel_type = entry.get("type")
            enabled = entry.get("enabled", True) is not False
            if channel_type == "discord":
                url = str(entry.get("webhook_url", "")).strip()
                if not enabled:
                    normalized.append({
                        "type": "discord",
                        "webhook_url": url,
                        "id": entry.get("id"),
                        "enabled": False,
                    })
                    continue
                if not url:
                    raise ValueError("Discord channels require a webhook_url")
                normalized.append({
                    "type": "discord",
                    "webhook_url": url,
                    "id": entry.get("id"),
                    "enabled": True,
                })
            elif channel_type == "telegram":
                token = str(entry.get("bot_token", "")).strip()
                chat_id = str(entry.get("chat_id", "")).strip()
                if not enabled:
                    normalized.append({
                        "type": "telegram",
                        "bot_token": token,
                        "chat_id": chat_id,
                        "id": entry.get("id"),
                        "enabled": False,
                    })
                    continue
                if not token or not chat_id:
                    raise ValueError("Telegram channels require both bot_token and chat_id")
                normalized.append({
                    "type": "telegram",
                    "bot_token": token,
                    "chat_id": chat_id,
                    "id": entry.get("id"),
                    "enabled": True,
                })
            else:
                logger.warning("Ignoring unknown backend type: %s", channel_type)

        return normalized

    @staticmethod
    def _ensure_channel_ids(channels: Optional[Sequence[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        ensured: List[Dict[str, Any]] = []
        for entry in channels or []:
            if not isinstance(entry, dict):
                continue
            channel_type = entry.get("type")
            if not channel_type:
                continue
            channel = dict(entry)
            if not channel.get("id"):
                channel["id"] = uuid4().hex
            channel["enabled"] = channel.get("enabled", True) is not False
            ensured.append(channel)
        return ensured

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

    def get_settings(self) -> Dict[str, Any]:
        """Return current alert settings in a JSON-serializable structure."""
        with self._lock:
            return self._snapshot_for_response_locked()

    def send_test_notification(self, message: Optional[str] = None) -> None:
        """Send a test notification through all configured backends."""
        with self._lock:
            if not self.backends:
                raise ValueError("No notification backends are configured")

            test_message = message or (
                f"GPU Hot test alert on {config.NODE_NAME}\n"
                "This is a test notification to confirm your alerting setup."
            )
            context = {
                "node_name": config.NODE_NAME,
                "gpu_id": "test",
                "metrics": {},
                "triggered": [],
                "test": True,
                "event": "test",
                "embed": {
                    "title": "Test Alert",
                    "description": f"Alerts are configured for **{config.NODE_NAME}**.",
                    "color": TEST_EMBED_COLOR,
                    "fields": [],
                    "footer_text": f"{config.NODE_NAME} - GPU Monitoring",
                    "footer_icon_url": EMBED_FOOTER_ICON_URL,
                },
                "lines": test_message.splitlines() or [test_message],
                "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            }

            logger.info("Dispatching test alert via %d backend(s)", len(self.backends))
            self._dispatch(test_message, context)

    def update_settings(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update alert settings from payload and return the new snapshot.
        Raises ValueError for validation issues or RuntimeError for persistence failures.
        """
        with self._lock:
            self._apply_settings_locked(payload, persist=True)
            return self._snapshot_for_response_locked()

    def is_active(self) -> bool:
        with self._lock:
            return self._is_active_locked()

    def evaluate(
        self,
        node_name: str,
        gpu_data: Dict[str, Dict[str, Any]],
        processes: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> None:
        """Evaluate all GPUs and trigger notifications if needed."""
        with self._lock:
            if not self._is_active_locked():
                return

            timestamp = time.time()
            iso_timestamp = datetime.utcnow().isoformat(timespec="seconds") + "Z"
            for gpu_id, metrics in gpu_data.items():
                triggered: List[Tuple[AlertRule, float]] = []
                recovered: List[Tuple[AlertRule, Optional[float]]] = []
                for rule in self.rules:
                    if not rule.is_enabled():
                        continue

                    value = rule.extractor(metrics)
                    state_key = (node_name, str(gpu_id), rule.name)
                    state = self._state.setdefault(state_key, {"active": False, "last_sent": 0.0})

                    over_threshold = (value is not None) and (value >= rule.threshold)
                    reset_delta = rule.reset_delta if rule.reset_delta is not None else self.reset_delta

                    if over_threshold:
                        if (
                            not state["active"]
                            or (timestamp - state["last_sent"]) >= self.cooldown_seconds
                        ):
                            triggered.append((rule, value if value is not None else 0.0))
                            state["active"] = True
                            state["last_sent"] = timestamp
                    else:
                        was_active = state["active"]
                        state["active"] = False
                        if was_active:
                            recovered_now = False
                            if value is None:
                                recovered_now = True
                            elif reset_delta is None:
                                recovered_now = True
                            else:
                                reset_threshold = rule.threshold - reset_delta
                                if value <= reset_threshold:
                                    recovered_now = True
                            if recovered_now:
                                # Avoid spamming recovery notifications if the alert just fired.
                                cooldown = self.cooldown_seconds or 0.0
                                should_notify = (
                                    cooldown <= 0.0 or (timestamp - state["last_sent"]) >= cooldown
                                )
                                if should_notify:
                                    recovered.append((rule, value))

                if triggered:
                    message, embed = self._build_alert_message(
                        node_name, gpu_id, metrics, triggered, processes
                    )
                    context = {
                        "node_name": node_name,
                        "gpu_id": gpu_id,
                        "metrics": metrics,
                        "triggered": [(rule.name, value) for rule, value in triggered],
                        "event": "alert",
                        "embed": embed,
                        "timestamp": iso_timestamp,
                    }
                    logger.info(
                        "Dispatching alert for node %s GPU %s via %d backend(s)",
                        node_name,
                        gpu_id,
                        len(self.backends),
                    )
                    self._dispatch(message, context)

                if recovered:
                    message, embed = self._build_recovery_message(
                        node_name, gpu_id, metrics, recovered
                    )
                    context = {
                        "node_name": node_name,
                        "gpu_id": gpu_id,
                        "metrics": metrics,
                        "recovered": [(rule.name, value) for rule, value in recovered],
                        "event": "recovery",
                        "embed": embed,
                        "timestamp": iso_timestamp,
                    }
                    logger.info(
                        "Dispatching recovery notice for node %s GPU %s via %d backend(s)",
                        node_name,
                        gpu_id,
                        len(self.backends),
                    )
                    self._dispatch(message, context)

    def _is_active_locked(self) -> bool:
        return self.enabled and bool(self.backends) and any(rule.is_enabled() for rule in self.rules)

    def _build_default_snapshot(self) -> Dict[str, Any]:
        default_channels = self._ensure_channel_ids(self._default_backend_settings())
        return {
            "enabled": bool(self.enabled),
            "cooldown_seconds": float(self.cooldown_seconds),
            "reset_delta": (
                float(self.reset_delta) if self.reset_delta is not None else None
            ),
            "rules": [
                {
                    "name": rule.name,
                    "label": rule.label,
                    "unit": rule.unit,
                    "threshold": float(rule.threshold),
                    "reset_delta": (
                        float(rule.reset_delta) if rule.reset_delta is not None else None
                    ),
                }
                for rule in self.rules
            ],
            "backends": deepcopy(default_channels),
        }

    def _snapshot_for_response_locked(self) -> Dict[str, Any]:
        snapshot = {
            "enabled": bool(self.enabled),
            "cooldown_seconds": float(self.cooldown_seconds),
            "reset_delta": (
                float(self.reset_delta) if self.reset_delta is not None else None
            ),
            "rules": [
                {
                    "name": rule.name,
                    "label": rule.label,
                    "unit": rule.unit,
                    "threshold": float(rule.threshold),
                    "reset_delta": (
                        float(rule.reset_delta) if rule.reset_delta is not None else None
                    ),
                    "is_enabled": rule.is_enabled(),
                }
                for rule in self.rules
            ],
            "backends": deepcopy(self.backend_settings),
            "available_backends": [backend.name for backend in self.backends],
            "notifications_configured": bool(self.backends),
            "active": self._is_active_locked(),
            "persisted": self.settings_store is not None,
        }

        # Provide defaults as deep copy to avoid accidental mutation by callers
        snapshot["defaults"] = json.loads(json.dumps(self._defaults))
        return snapshot

    def _snapshot_for_storage_locked(self) -> Dict[str, Any]:
        return {
            "enabled": bool(self.enabled),
            "cooldown_seconds": float(self.cooldown_seconds),
            "reset_delta": (
                float(self.reset_delta) if self.reset_delta is not None else None
            ),
            "rules": [
                {
                    "name": rule.name,
                    "threshold": float(rule.threshold),
                    "reset_delta": (
                        float(rule.reset_delta) if rule.reset_delta is not None else None
                    ),
                }
                for rule in self.rules
            ],
            "backends": deepcopy(self.backend_settings),
        }

    def _apply_settings_locked(self, payload: Dict[str, Any], *, persist: bool) -> None:
        if payload is None:
            raise ValueError("Settings payload is required")
        if not isinstance(payload, dict):
            raise ValueError("Settings payload must be an object")

        if "enabled" in payload:
            self.enabled = bool(payload["enabled"])

        if "cooldown_seconds" in payload:
            cooldown = _safe_float(payload["cooldown_seconds"])
            if cooldown is None:
                raise ValueError("cooldown_seconds must be a number")
            if cooldown < 0:
                raise ValueError("cooldown_seconds must be greater than or equal to zero")
            self.cooldown_seconds = cooldown

        if "reset_delta" in payload:
            raw_reset = payload["reset_delta"]
            if raw_reset is None:
                self.reset_delta = None
            else:
                reset = _safe_float(raw_reset)
                if reset is None:
                    raise ValueError("reset_delta must be a number or null")
                if reset < 0:
                    raise ValueError("reset_delta must be greater than or equal to zero")
                self.reset_delta = reset

        if "rules" in payload:
            rules_payload = payload["rules"]
            if not isinstance(rules_payload, (list, tuple)):
                raise ValueError("rules must be provided as a list")

            rule_map = {rule.name: rule for rule in self.rules}
            for entry in rules_payload:
                if not isinstance(entry, dict):
                    raise ValueError("Each rule entry must be an object")
                name = entry.get("name")
                if not name or name not in rule_map:
                    continue  # Unknown rules are ignored to maintain forward-compatibility
                rule = rule_map[name]

                if "threshold" in entry:
                    threshold = _safe_float(entry["threshold"])
                    if threshold is None:
                        raise ValueError(f"threshold for rule '{name}' must be a number")
                    if threshold < 0:
                        raise ValueError(f"threshold for rule '{name}' must be >= 0")
                    rule.threshold = threshold

                if "reset_delta" in entry:
                    raw_reset_delta = entry["reset_delta"]
                    if raw_reset_delta is None:
                        rule.reset_delta = None
                    else:
                        reset_delta = _safe_float(raw_reset_delta)
                        if reset_delta is None:
                            raise ValueError(
                                f"reset_delta for rule '{name}' must be a number or null"
                            )
                        if reset_delta < 0:
                            raise ValueError(
                                f"reset_delta for rule '{name}' must be >= 0"
                        )
                        rule.reset_delta = reset_delta

        if "backends" in payload:
            if self._custom_backends is not None:
                logger.debug(
                    "Ignoring backend updates because AlertManager was initialized with custom backends"
                )
            else:
                normalized = self._normalize_backend_payload(payload["backends"])
                self.backend_settings = self._ensure_channel_ids(normalized)
                self.backends = self._build_backends_from_settings(self.backend_settings)
                if self.enabled and not self.backends:
                    logger.warning("Notifications enabled but no backends configured")

        if persist:
            channel_summary = [
                f"{entry.get('type')}:{'on' if entry.get('enabled', True) else 'off'}"
                for entry in self.backend_settings
            ]
            logger.info(
                "Alert settings updated: enabled=%s cooldown=%s reset_delta=%s channels=%s",
                self.enabled,
                self.cooldown_seconds,
                self.reset_delta if self.reset_delta is not None else "auto",
                channel_summary or [],
            )
            for rule in self.rules:
                logger.info(
                    " - Rule %s threshold=%s reset_delta=%s",
                    rule.name,
                    rule.threshold,
                    rule.reset_delta if rule.reset_delta is not None else "global",
                )

        # Reset alert state so new thresholds are respected immediately
        self._state.clear()

        if persist and self.settings_store:
            try:
                self.settings_store.save(self._snapshot_for_storage_locked())
            except Exception as exc:  # pragma: no cover - surface via API response
                logger.error("Failed to persist alert settings: %s", exc)
                raise RuntimeError("Failed to persist alert settings") from exc

    def _load_persisted_settings(self) -> None:
        if not self.settings_store:
            return

        try:
            stored = self.settings_store.load()
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error("Failed to load alert settings: %s", exc)
            return

        if not stored:
            return

        with self._lock:
            try:
                self._apply_settings_locked(stored, persist=False)
                logger.info("Loaded persisted alert settings")
            except ValueError as exc:
                logger.error("Ignoring persisted alert settings: %s", exc)

    def _format_rule_fields(
        self,
        entries: Sequence[Tuple[AlertRule, Optional[float]]], *, recovered: bool = False
    ) -> List[Dict[str, Any]]:
        fields: List[Dict[str, Any]] = []
        for rule, value in entries:
            field_name = rule.label
            threshold_text = rule.format_threshold()

            if recovered:
                if value is not None:
                    value_text = rule.format_value(value)
                    value_line = f"{value_text} | Threshold: {threshold_text}"
                else:
                    value_line = f"Below threshold {threshold_text}"
                status_line = "Status: Recovered"
            else:
                value_text = rule.format_value(value if value is not None else rule.threshold)
                value_line = f"{value_text} | Threshold: {threshold_text}"
                status_line = "Status: Above threshold"

            fields.append({
                "name": field_name,
                "value": f"{value_line}\n{status_line}",
                "inline": False,
            })
        return fields

    def _build_alert_message(
        self,
        node_name: str,
        gpu_id: str,
        metrics: Dict[str, Any],
        triggered: List[Tuple[AlertRule, float]],
        processes: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> Tuple[str, Dict[str, Any]]:
        gpu_name = metrics.get("name") or f"GPU {gpu_id}"
        uuid = metrics.get("uuid")
        header = f"GPU Hot alert on {node_name}"
        lines = [header]
        if uuid and uuid != "N/A":
            lines.append(f"{gpu_name} (UUID: {uuid})")
        else:
            lines.append(f"{gpu_name} (ID {gpu_id})")

        display_time = datetime.now().strftime("%b %d, %Y - %I:%M %p")
        lines.append("")
        lines.append(f"Time: {display_time}")
        lines.append("")

        rule_lines: List[str] = []
        for rule, value in triggered:
            rule_lines.append(
                f"{rule.label}: {rule.format_value(value)} (threshold {rule.format_threshold()})"
            )
        if rule_lines:
            lines.extend(rule_lines)
            lines.append("")

        process_line = self._format_top_process(metrics, processes)
        if process_line:
            lines.append(process_line)
            lines.append("")

        fields = [
            {
                "name": "Time",
                "value": display_time,
                "inline": False,
            }
        ]
        fields.extend(self._format_rule_fields(triggered))
        if process_line:
            fields.append({
                "name": "Top Process",
                "value": process_line.replace("- ", "", 1),
                "inline": False,
            })

        description = f"**{gpu_name}** (UUID: {uuid})" if uuid and uuid != "N/A" else f"**{gpu_name}** (ID {gpu_id})"

        embed = {
            "title": "GPU Overheat Warning",
            "description": description,
            "color": ALERT_EMBED_COLOR,
            "fields": fields,
            "footer_text": f"{node_name} - GPU Monitoring",
            "footer_icon_url": EMBED_FOOTER_ICON_URL,
        }

        return "\n".join(lines), embed

    def _build_recovery_message(
        self,
        node_name: str,
        gpu_id: str,
        metrics: Dict[str, Any],
        recovered: List[Tuple[AlertRule, Optional[float]]],
    ) -> Tuple[str, Dict[str, Any]]:
        gpu_name = metrics.get("name") or f"GPU {gpu_id}"
        uuid = metrics.get("uuid")
        header = f"GPU recovered on {node_name}"
        lines = [header]
        if uuid and uuid != "N/A":
            lines.append(f"{gpu_name} (UUID: {uuid})")
        else:
            lines.append(f"{gpu_name} (ID {gpu_id})")

        display_time = datetime.now().strftime("%b %d, %Y - %I:%M %p")
        lines.append("")
        lines.append(f"Time: {display_time}")
        lines.append("")

        for rule, value in recovered:
            if value is not None:
                value_text = rule.format_value(value)
                lines.append(
                    f"{rule.label}: recovered to {value_text} (threshold {rule.format_threshold()})"
                )
            else:
                lines.append(
                    f"{rule.label}: recovered below threshold {rule.format_threshold()}"
                )
            lines.append("")

        lines.append("All metrics back within safe limits.")
        fields = [
            {
                "name": "Time",
                "value": display_time,
                "inline": False,
            }
        ]
        fields.extend(self._format_rule_fields(recovered, recovered=True))

        description = (
            f"**{gpu_name}** (UUID: {uuid})"
            if uuid and uuid != "N/A"
            else f"**{gpu_name}** (ID {gpu_id})"
        )

        embed = {
            "title": "GPU Recovery",
            "description": f"{description} is back within safe limits.",
            "color": RECOVERY_EMBED_COLOR,
            "fields": fields,
            "footer_text": f"{node_name} - GPU Monitoring",
            "footer_icon_url": EMBED_FOOTER_ICON_URL,
        }

        return "\n".join(lines), embed

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
        payload = dict(context)
        if "lines" not in payload:
            payload["lines"] = message.splitlines() or [message]
        payload.setdefault("event", "alert")
        payload.setdefault("timestamp", datetime.utcnow().isoformat(timespec="seconds") + "Z")

        for backend in self.backends:
            _spawn_task(self._send_backend, backend, message, dict(payload))

    @staticmethod
    def _send_backend(backend: NotificationBackend, message: str, context: Dict[str, Any]) -> None:
        try:
            _execute_async(backend.send, message, context)
            logger.info("Sent alert via %s for GPU %s", backend.name, context.get("gpu_id"))
        except Exception as exc:
            logger.error("Failed to send alert via %s: %s", backend.name, exc)


class AlertSettingsStore:
    """Interface for persisting alert settings."""

    def load(self) -> Optional[Dict[str, Any]]:  # pragma: no cover - interface method
        raise NotImplementedError

    def save(self, data: Dict[str, Any]) -> None:  # pragma: no cover - interface method
        raise NotImplementedError


class JSONAlertSettingsStore(AlertSettingsStore):
    """Persist alert settings to a JSON document on disk."""

    def __init__(self, path: str):
        self.path = Path(path).expanduser()

    def load(self) -> Optional[Dict[str, Any]]:
        try:
            if not self.path.exists():
                return None
            with self.path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception as exc:
            logger.error("Failed to load alert settings from %s: %s", self.path, exc)
            return None

    def save(self, data: Dict[str, Any]) -> None:
        try:
            if self.path.parent and not self.path.parent.exists():
                self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2, sort_keys=True)
        except Exception as exc:
            logger.error("Failed to save alert settings to %s: %s", self.path, exc)
            raise


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
    "AlertSettingsStore",
    "JSONAlertSettingsStore",
]
