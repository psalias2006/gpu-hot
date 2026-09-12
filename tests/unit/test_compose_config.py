"""Tests for the AMD base and optional amd-smi Compose contracts."""

from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).parents[2]


def _service(compose_name):
    compose = yaml.safe_load((REPO_ROOT / compose_name).read_text(encoding="ascii"))
    return compose["services"]["gpu-hot"]


def test_base_amd_compose_needs_no_optional_device_or_rocm_path():
    service = _service("docker-compose.amd.yml")

    assert "devices" not in service
    assert "group_add" not in service
    assert "volumes" not in service
    assert "cap_add" not in service
    assert "security_opt" not in service
    assert service["init"] is True
    assert service["pid"] == "host"
    assert service["environment"]["NODE_NAME"] == "${NODE_NAME:-gpu-hot-node}"


def test_amd_smi_override_mounts_rocm_read_only_and_adds_devices():
    service = _service("docker-compose.amd-smi.yml")

    assert service["devices"] == [
        "/dev/dri:/dev/dri:rwm",
        "/dev/kfd:/dev/kfd:rwm",
    ]
    assert service["volumes"] == [
        "${ROCM_HOST_PATH:-/opt/rocm/core-7.14}:/opt/rocm/core-7.14:ro"
    ]
    assert service["environment"]["PATH"].startswith("/opt/rocm/core-7.14/bin:")
    assert service["environment"]["LD_LIBRARY_PATH"] == "/opt/rocm/core-7.14/lib"


def test_amd_smi_override_allows_host_process_inspection():
    service = _service("docker-compose.amd-smi.yml")

    assert service["cap_add"] == ["SYS_PTRACE"]
    assert service["security_opt"] == ["apparmor=unconfined"]
