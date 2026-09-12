"""Tests for the hub Compose health contract."""

from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).parents[2]


def _hub_service():
    compose = yaml.safe_load(
        (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )
    return compose["services"]["gpu-hot"]


def test_base_compose_healthcheck_uses_node_freshness_endpoint():
    service = _hub_service()

    assert service["healthcheck"]["test"] == [
        "CMD", "curl", "-f", "http://localhost:1312/health"
    ]
