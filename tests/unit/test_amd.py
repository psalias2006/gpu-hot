"""Tests for AMD discovery, sysfs metrics, and optional amd-smi data."""

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from core.amd import (
    MAX_AMD_SMI_BYTES,
    AMDCollector,
    AMDDevice,
    discover_amd_devices,
    parse_dpm_levels,
    pcie_generation,
)


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures" / "amd"
SYSFS_ROOT = FIXTURE_ROOT / "sys" / "class" / "drm"
COMPAT_SYSFS_ROOT = FIXTURE_ROOT / "compat" / "sys" / "class" / "drm"


def _collector(**kwargs):
    devices = discover_amd_devices(SYSFS_ROOT)
    return AMDCollector(devices, amd_smi_path="", **kwargs)


class TestAMDDiscovery:
    def test_discovers_only_numeric_amdgpu_cards(self):
        devices = discover_amd_devices(SYSFS_ROOT)
        assert [device.index for device in devices] == ["0", "1"]
        assert [device.pci_bus_id for device in devices] == ["0000:17:00.0", "0000:23:00.0"]

    def test_non_amdgpu_card_is_rejected(self, tmp_path):
        card = tmp_path / "card0" / "device"
        card.mkdir(parents=True)
        (card / "driver").write_text("simple-framebuffer\n")
        assert discover_amd_devices(tmp_path) == []

    def test_relative_device_link_is_supported(self, tmp_path):
        target = tmp_path / "0000:17:00.0"
        target.mkdir()
        driver = tmp_path / "amdgpu"
        driver.mkdir()
        (target / "driver").symlink_to(Path("../amdgpu"))
        drm_card = tmp_path / "card0"
        drm_card.mkdir()
        (drm_card / "device").symlink_to(Path("../0000:17:00.0"))
        assert discover_amd_devices(tmp_path)[0].pci_bus_id == "0000:17:00.0"


class TestAMDParsing:
    def test_dpm_active_and_max(self):
        active, maximum = parse_dpm_levels("0: 500Mhz\n1: 2520Mhz *\n2: 2570Mhz\n")
        assert active == 2520
        assert maximum == 2570

    def test_unknown_pcie_speed_is_omitted(self):
        assert pcie_generation("12.0 GT/s PCIe") is None
        assert pcie_generation("16.0 GT/s PCIe") == "4"


class TestAMDCollection:
    def test_fixture_values_and_units(self):
        data, processes = _collector().collect()
        assert processes == []
        assert list(data) == ["0", "1"]
        first = data["0"]
        second = data["1"]

        assert first["vendor"] == "amd"
        assert first["name"] == "AMD RADEON PRO V620 Azure"
        assert first["uuid"] == "AMD-0ca417d32a15d25d"
        assert first["utilization"] == 99
        assert first["memory_used"] == pytest.approx(25011068928 / 1024 ** 2)
        assert first["memory_total"] == pytest.approx(32195477504 / 1024 ** 2)
        assert first["memory_free"] == pytest.approx((32195477504 - 25011068928) / 1024 ** 2)
        assert first["temperature"] == 53
        assert first["temperature_memory"] == 68
        assert first["power_draw"] == 196
        assert first["power_limit"] == 250
        assert first["clock_graphics"] == 2494
        assert first["clock_memory"] == 1000
        assert first["clock_graphics_max"] == 2570
        assert first["clock_memory_max"] == 1000
        assert first["pcie_gen"] == "4"
        assert first["pcie_width"] == 16
        assert first["pci_bus_id"] == "0000:17:00.0"
        assert "fan_speed" not in first
        assert "performance_state" not in first

        assert second["utilization"] == 78
        assert second["clock_graphics"] == 2252
        assert second["temperature"] == 60
        assert second["temperature_memory"] == 70
        assert second["power_draw"] == 191
        assert second["pci_bus_id"] == "0000:23:00.0"

    def test_missing_and_malformed_values_are_omitted_individually(self, tmp_path):
        device = tmp_path / "device"
        (device / "hwmon" / "hwmon0").mkdir(parents=True)
        (device / "driver").write_text("amdgpu\n")
        (device / "product_name").write_text("test\n")
        (device / "unique_id").write_text("id\n")
        (device / "gpu_busy_percent").write_text("not-a-number\n")
        (device / "mem_info_vram_used").write_text("10\n")
        (device / "mem_info_vram_total").write_text("20\n")
        (device / "hwmon" / "hwmon0" / "temp1_input").write_text("bad\n")
        (device / "hwmon" / "hwmon0" / "power1_average").write_text("1000000\n")
        devices = [AMDDevice("0", device, device, uuid="id")]
        data, _ = AMDCollector(devices, amd_smi_path="").collect()
        card = data["0"]
        assert "utilization" not in card
        assert card["memory_free"] == pytest.approx(10 / 1024 ** 2)
        assert "temperature" not in card
        assert card["power_draw"] == 1
        assert "power_limit" not in card

    @pytest.mark.parametrize(
        ("average_value", "input_value", "expected_watts"),
        [(None, "1250000", 1.25), ("2000000", "9000000", 2)],
    )
    def test_power_draw_prefers_average_and_falls_back_to_input(
        self, tmp_path, average_value, input_value, expected_watts
    ):
        device = tmp_path / "device"
        hwmon = device / "hwmon" / "hwmon0"
        hwmon.mkdir(parents=True)
        (device / "driver").write_text("amdgpu\n")
        if average_value is not None:
            (hwmon / "power1_average").write_text(f"{average_value}\n")
        (hwmon / "power1_input").write_text(f"{input_value}\n")
        devices = [AMDDevice("0", device, device, pci_bus_id="0000:17:00.0", uuid="id")]

        data, _ = AMDCollector(devices, amd_smi_path="").collect()

        assert data["0"]["power_draw"] == expected_watts

    def test_compat_fixture_uses_input_power_and_stable_pci_key_without_uuid(self):
        devices = discover_amd_devices(COMPAT_SYSFS_ROOT)
        data, _ = AMDCollector(devices, amd_smi_path="").collect()

        assert list(data) == ["0"]
        assert data["0"]["index"] == "0"
        assert data["0"]["power_draw"] == 125
        assert "uuid" not in data["0"]

    def test_active_dpm_is_fallback_when_frequency_is_missing(self, tmp_path):
        device = tmp_path / "device"
        device.mkdir()
        (device / "driver").write_text("amdgpu\n")
        (device / "pp_dpm_sclk").write_text("0: 500Mhz\n1: 2520Mhz *\n2: 2570Mhz\n")
        devices = [AMDDevice("0", device, device, uuid="id")]
        data, _ = AMDCollector(devices, amd_smi_path="").collect()
        assert data["0"]["clock_graphics"] == 2520

    def test_optional_amd_smi_process_and_throttle_mapping(self):
        list_payload = json.loads((FIXTURE_ROOT / "amd-smi-list.json").read_text())
        process_payload = json.loads((FIXTURE_ROOT / "amd-smi-process.json").read_text())
        metric_payload = json.loads((FIXTURE_ROOT / "amd-smi-metric.json").read_text())
        static_payload = json.loads((FIXTURE_ROOT / "amd-smi-static.json").read_text())
        payloads = {
            "list": list_payload,
            "process": process_payload,
            "metric": metric_payload,
            "static": static_payload,
        }

        def result_for(argv, **_kwargs):
            result = MagicMock(returncode=0)
            result.stdout = json.dumps(payloads[argv[1]])
            return result

        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="/usr/bin/amd-smi")
        with patch("core.amd.subprocess.run", side_effect=result_for) as run:
            data, processes = collector.collect()
        assert [call.args[0][1:] for call in run.call_args_list] == [
            ["list", "--json"],
            ["process", "--json"],
            ["metric", "--json"],
            ["static", "--asic", "--json"],
        ]
        assert data["0"]["name"] == "AMD RADEON PRO V620 Azure"
        assert data["0"]["throttle_reasons"] == "UNTHROTTLED"
        assert processes[0]["pid"] == "18679"
        assert processes[0]["name"] == "llama-server"
        assert processes[0]["gpu_id"] == "0"
        assert processes[0]["gpu_uuid"] == "AMD-0ca417d32a15d25d"
        assert processes[0]["memory"] == pytest.approx(24285192000 / 1024 ** 2)

    def test_amd_smi_reordered_list_uses_stable_device_mapping(self):
        list_payload = [
            {"gpu": 0, "uuid": "bd0073a1-0000-1000-802a-6d67d1f015be"},
            {"gpu": 1, "uuid": "0c0073a1-0000-1000-80a4-17d32a15d25d"},
        ]
        process_payload = [
            {
                "gpu": 0,
                "process_list": [{"process_info": {"name": "card-two", "pid": 202}}],
            },
            {
                "gpu": 1,
                "process_list": [{"process_info": {"name": "card-one", "pid": 101}}],
            },
        ]
        metric_payload = {
            "gpu_data": [
                {"gpu": 0, "power": {"throttle_status": "CARD-TWO"}},
                {"gpu": 1, "power": {"throttle_status": "CARD-ONE"}},
            ]
        }
        static_payload = {
            "gpu_data": [
                {"gpu": 0, "asic": {"market_name": "CARD-TWO"}},
                {"gpu": 1, "asic": {"market_name": "CARD-ONE"}},
            ]
        }
        payloads = {
            "list": list_payload,
            "process": process_payload,
            "metric": metric_payload,
            "static": static_payload,
        }

        def result_for(argv, **_kwargs):
            result = MagicMock(returncode=0)
            result.stdout = json.dumps(payloads[argv[1]])
            return result

        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="amd-smi")
        with patch("core.amd.subprocess.run", side_effect=result_for):
            data, processes = collector.collect()

        assert {process["gpu_id"]: process["pid"] for process in processes} == {
            "0": "101",
            "1": "202",
        }
        assert data["0"]["throttle_reasons"] == "CARD-ONE"
        assert data["1"]["throttle_reasons"] == "CARD-TWO"

    def test_empty_product_name_uses_amd_smi_market_name(self, tmp_path):
        device = tmp_path / "device"
        device.mkdir()
        (device / "product_name").write_text("\n")
        amd_device = AMDDevice("0", device, device, pci_bus_id="0000:17:00.0")
        payloads = {
            "list": [{"gpu": 0, "bdf": "0000:17:00.0"}],
            "process": [],
            "metric": {"gpu_data": []},
            "static": {
                "gpu_data": [
                    {"gpu": 0, "asic": {"market_name": "AMD Radeon Pro V620"}}
                ]
            },
        }

        def result_for(argv, **_kwargs):
            command_result = MagicMock(returncode=0)
            command_result.stdout = json.dumps(payloads[argv[1]])
            return command_result

        with patch("core.amd.subprocess.run", side_effect=result_for):
            data, _ = AMDCollector([amd_device], amd_smi_path="amd-smi").collect()

        assert data["0"]["name"] == "AMD Radeon Pro V620"

    def test_empty_product_name_uses_pci_ids_when_amd_smi_is_absent(
        self, tmp_path
    ):
        device = tmp_path / "device"
        device.mkdir()
        (device / "product_name").write_text("\n")
        (device / "vendor").write_text("0x1002\n")
        (device / "device").write_text("0x73a1\n")
        pci_ids = tmp_path / "pci.ids"
        pci_ids.write_text(
            "1002  Advanced Micro Devices, Inc. [AMD/ATI]\n"
            "\t73a1  Navi 21 [Radeon Pro V620]\n"
            "\t\t1002 0e34  Radeon Pro V620\n"
            "10de  NVIDIA Corporation\n"
        )
        amd_device = AMDDevice("0", device, device, pci_bus_id="0000:17:00.0")

        with patch("core.amd.PCI_IDS_PATHS", (pci_ids,)):
            data, _ = AMDCollector([amd_device], amd_smi_path="").collect()

        assert data["0"]["name"] == "Navi 21 [Radeon Pro V620]"

    def test_failed_amd_smi_list_omits_optional_enrichment(self):
        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="amd-smi")
        failed_list = MagicMock(returncode=1, stdout="")
        with patch("core.amd.subprocess.run", return_value=failed_list) as run:
            data, processes = collector.collect()

        assert [call.args[0][1:] for call in run.call_args_list] == [["list", "--json"]]
        assert processes == []
        assert "throttle_reasons" not in data["0"]
        assert data["0"]["memory_total"] > 0

    def test_unknown_amd_smi_list_mapping_omits_optional_enrichment(self):
        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="amd-smi")
        unknown_list = MagicMock(
            returncode=0,
            stdout=json.dumps([{"gpu": 0, "bdf": "0000:99:00.0"}]),
        )
        with patch("core.amd.subprocess.run", return_value=unknown_list) as run:
            data, processes = collector.collect()

        assert [call.args[0][1:] for call in run.call_args_list] == [["list", "--json"]]
        assert processes == []
        assert "throttle_reasons" not in data["0"]
        assert data["0"]["memory_total"] > 0

    def test_absent_amd_smi_executes_no_subprocess(self):
        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="")
        with patch("core.amd.subprocess.run") as run:
            collector.collect()
        run.assert_not_called()

    def test_failed_amd_smi_keeps_core_metrics(self):
        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="/usr/bin/amd-smi")
        with patch("core.amd.subprocess.run", side_effect=subprocess.TimeoutExpired("amd-smi", 5)):
            data, processes = collector.collect()
        assert data["0"]["memory_total"] > 0
        assert processes == []

    def test_oversized_amd_smi_output_keeps_core_metrics(self):
        collector = AMDCollector(discover_amd_devices(SYSFS_ROOT), amd_smi_path="/usr/bin/amd-smi")
        oversized_result = MagicMock(returncode=0, stdout="x" * (MAX_AMD_SMI_BYTES + 1))
        with patch("core.amd.subprocess.run", return_value=oversized_result):
            data, processes = collector.collect()
        assert data["0"]["memory_total"] > 0
        assert processes == []
