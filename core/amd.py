"""AMD GPU discovery, sysfs collection, and optional amd-smi enrichment."""

from __future__ import annotations

import json
import logging
import math
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_SYSFS_BYTES = 4096
MAX_AMD_SMI_BYTES = 1024 * 1024
MAX_PCI_IDS_BYTES = 4 * 1024 * 1024
AMD_SMI_TIMEOUT = 5
AMD_SMI_INTERVAL = 10.0
PCI_IDS_PATHS = (Path("/usr/share/misc/pci.ids"), Path("/usr/share/hwdata/pci.ids"))

_CARD_RE = re.compile(r"card(\d+)$")
_PCI_BDF_RE = re.compile(r"^(?:[0-9a-fA-F]{4}:)?[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$")
_AMD_SMI_UUID_RE = re.compile(
    r"^([0-9a-f]{2})0073a1-0000-1000-80([0-9a-f]{2})-([0-9a-f]{12})$"
)
_DPM_RE = re.compile(r"^\s*\d+\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*M(?:Hz|hz)\b")
_PCIE_SPEED_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*GT/s\b", re.IGNORECASE)


@dataclass(frozen=True)
class AMDDevice:
    """A discovered amdgpu DRM card."""

    index: str
    card_path: Path
    device_path: Path
    pci_bus_id: str | None = None
    uuid: str | None = None


def _read_text(path: Path, max_bytes: int = MAX_SYSFS_BYTES) -> str | None:
    """Read a small sysfs value without allowing unbounded input."""
    try:
        with path.open("rb") as handle:
            raw = handle.read(max_bytes + 1)
        if len(raw) > max_bytes:
            logger.warning("AMD metric file is too large: %s", path.name)
            return None
        return raw.decode("utf-8").strip()
    except (OSError, UnicodeDecodeError):
        return None


def _driver_name(device_path: Path) -> str | None:
    driver_path = device_path / "driver"
    try:
        if driver_path.is_symlink():
            return driver_path.resolve().name
        if driver_path.is_file():
            driver_text = _read_text(driver_path)
            return driver_text.split("/")[-1] if driver_text else None
        if driver_path.exists():
            return driver_path.resolve().name
    except OSError:
        return None
    return None


def _normalise_bdf(bdf_text: str | None) -> str | None:
    if not isinstance(bdf_text, str) or not bdf_text:
        return None
    bdf_text = bdf_text.strip()
    if not _PCI_BDF_RE.match(bdf_text):
        return None
    return bdf_text if bdf_text.count(":") == 2 else f"0000:{bdf_text}"


def _normalise_uuid(uuid_text: object) -> str | None:
    if not isinstance(uuid_text, str) or not uuid_text.strip():
        return None
    normalised = uuid_text.strip()
    if normalised.upper().startswith("AMD-"):
        normalised = normalised[4:]
    normalised = normalised.casefold()
    amd_smi_match = _AMD_SMI_UUID_RE.fullmatch(normalised)
    if amd_smi_match:
        return "".join(amd_smi_match.groups())
    return normalised or None


def _pci_bus_id(device_path: Path) -> str | None:
    uevent = _read_text(device_path / "uevent")
    if uevent:
        for line in uevent.splitlines():
            line_key, separator, bdf_text = line.partition("=")
            if separator and line_key == "PCI_SLOT_NAME":
                bdf = _normalise_bdf(bdf_text)
                if bdf:
                    return bdf

    # The resolved sysfs path normally contains the PCI BDF as a component.
    try:
        for component in reversed(device_path.resolve().parts):
            bdf = _normalise_bdf(component)
            if bdf:
                return bdf
    except OSError:
        pass
    return None


def discover_amd_devices(sysfs_root: str | Path = "/sys/class/drm") -> list[AMDDevice]:
    """Find DRM cards whose bound driver is exactly amdgpu."""
    root = Path(sysfs_root)
    try:
        candidates = sorted(root.glob("card*/device"), key=_card_sort_key)
    except OSError:
        return []
    amd_cards = [device_path for device_path in candidates if _is_amd_card(device_path)]
    return [_make_amd_device(index, device_path) for index, device_path in enumerate(amd_cards)]


def _is_amd_card(device_path: Path) -> bool:
    return (
        _CARD_RE.fullmatch(device_path.parent.name) is not None
        and device_path.exists()
        and _driver_name(device_path) == "amdgpu"
    )


def _make_amd_device(index: int, device_path: Path) -> AMDDevice:
    return AMDDevice(
        index=str(index),
        card_path=device_path.parent,
        device_path=device_path,
        pci_bus_id=_pci_bus_id(device_path),
        uuid=_read_text(device_path / "unique_id"),
    )


def _card_sort_key(device_path: Path) -> tuple[int, str]:
    card_match = _CARD_RE.fullmatch(device_path.parent.name)
    if not card_match:
        return (-1, device_path.parent.name)
    return (int(card_match.group(1)), device_path.parent.name)


def _parse_number(numeric_text: str | None) -> float | None:
    if numeric_text is None:
        return None
    try:
        parsed_value = float(numeric_text.strip())
    except (TypeError, ValueError):
        return None
    return parsed_value if math.isfinite(parsed_value) else None


def _read_number(path: Path) -> float | None:
    return _parse_number(_read_text(path))


def _pci_id(device_path: Path, filename: str) -> str | None:
    identifier = _read_text(device_path / filename)
    if identifier is None:
        return None
    identifier = identifier.casefold().removeprefix("0x")
    return identifier if re.fullmatch(r"[0-9a-f]{4}", identifier) else None


def _name_from_pci_ids(path: Path, vendor_id: str, device_id: str) -> str | None:
    database = _read_text(path, MAX_PCI_IDS_BYTES)
    if database is None:
        return None
    in_vendor = False
    for line in database.splitlines():
        if not line or line.startswith("#"):
            continue
        if not line[0].isspace():
            fields = line.split(None, 1)
            in_vendor = fields[0].casefold() == vendor_id
            continue
        if not in_vendor or not line.startswith("\t") or line.startswith("\t\t"):
            continue
        fields = line.strip().split(None, 1)
        if len(fields) == 2 and fields[0].casefold() == device_id:
            return fields[1].strip() or None
    return None


def _pci_device_name(device_path: Path) -> str | None:
    vendor_id = _pci_id(device_path, "vendor")
    device_id = _pci_id(device_path, "device")
    if vendor_id is None or device_id is None:
        return None
    for pci_ids_path in PCI_IDS_PATHS:
        if device_name := _name_from_pci_ids(pci_ids_path, vendor_id, device_id):
            return device_name
    return None


def _find_hwmon_files(device_path: Path, filename: str) -> list[Path]:
    paths: list[Path] = []
    direct = device_path / filename
    if direct.is_file():
        paths.append(direct)
    try:
        for hwmon_dir in sorted((device_path / "hwmon").glob("hwmon*")):
            candidate = hwmon_dir / filename
            if candidate.is_file():
                paths.append(candidate)
    except OSError:
        pass
    return paths


def _read_hwmon_number(device_path: Path, filename: str) -> float | None:
    for path in _find_hwmon_files(device_path, filename):
        reading = _read_number(path)
        if reading is not None:
            return reading
    return None


def parse_dpm_levels(level_text: str | None) -> tuple[float | None, float | None]:
    """Return the active and highest MHz values from a DPM table."""
    if not level_text:
        return None, None
    active = None
    maximum = None
    for line in level_text.splitlines():
        match = _DPM_RE.match(line)
        if not match:
            continue
        level_mhz = _parse_number(match.group(1))
        if level_mhz is None:
            continue
        maximum = level_mhz if maximum is None else max(maximum, level_mhz)
        if "*" in line:
            active = level_mhz
    return active, maximum


def pcie_generation(speed_text: str | None) -> str | None:
    """Map a PCIe link speed in GT/s to the PCIe generation string."""
    match = _PCIE_SPEED_RE.match(speed_text.strip()) if isinstance(speed_text, str) else None
    speed = _parse_number(match.group(1)) if match else None
    mapping = {2.5: "1", 5.0: "2", 8.0: "3", 16.0: "4", 32.0: "5", 64.0: "6"}
    return mapping.get(speed) if speed is not None else None


def _value_in_mib(raw_value: float | None) -> float | None:
    return raw_value / (1024 ** 2) if raw_value is not None else None


def _value_in_mhz(raw_value: float | None) -> float | None:
    return raw_value / 1_000_000 if raw_value is not None else None


def _value_in_watts(raw_value: float | None) -> float | None:
    return raw_value / 1_000_000 if raw_value is not None else None


def _clock_values(
    clock_name: str,
    current_mhz: float | None,
    active_mhz: float | None,
    maximum_mhz: float | None,
) -> dict[str, float]:
    clock_metrics: dict[str, float] = {}
    if current_mhz is not None:
        clock_metrics[clock_name] = current_mhz
    elif active_mhz is not None:
        clock_metrics[clock_name] = active_mhz
    if maximum_mhz is not None:
        clock_metrics[f"{clock_name}_max"] = maximum_mhz
    return clock_metrics


class AMDCollector:
    """Collect AMD metrics from sysfs, with optional amd-smi enrichment."""

    def __init__(
        self,
        devices: list[AMDDevice],
        amd_smi_path: str | None = None,
        smi_interval: float = AMD_SMI_INTERVAL,
    ):
        self.devices = list(devices)
        self.device_by_index = {device.index: device for device in self.devices}
        self.device_by_gpu_id = {
            self._gpu_id_for_device(device): device for device in self.devices
        }
        self.amd_smi_path = amd_smi_path if amd_smi_path is not None else shutil.which("amd-smi")
        self.smi_interval = smi_interval
        self._smi_last_ts = 0.0
        self._smi_processes: list[dict] = []
        self._smi_metrics: dict[str, dict] = {}
        self._smi_names: dict[str, str] = {}
        self._fallback_names: dict[str, str] = {}

    @staticmethod
    def _gpu_id_for_device(device: AMDDevice) -> str:
        """Use the same bare ordinal key shape as the NVML collector."""
        return device.index

    @property
    def has_amd_smi(self) -> bool:
        return bool(self.amd_smi_path)

    def collect(self) -> tuple[dict[str, dict], list[dict]]:
        gpu_payloads = {
            self._gpu_id_for_device(device): self._collect_device(device)
            for device in self.devices
        }
        self._poll_smi()
        self._add_device_names(gpu_payloads)
        self._add_throttle_status(gpu_payloads)
        return gpu_payloads, list(self._smi_processes)

    def _collect_device(self, device: AMDDevice) -> dict:
        device_path = device.device_path
        device_payload = self._identity_metrics(device)
        device_payload.update(self._memory_metrics(device_path))
        device_payload.update(self._thermal_metrics(device_path))
        device_payload.update(self._power_metrics(device_path))
        device_payload.update(self._clock_metrics(device_path))
        device_payload.update(self._pcie_metrics(device_path))
        return device_payload

    @staticmethod
    def _identity_metrics(device: AMDDevice) -> dict[str, object]:
        identity_payload = AMDCollector._base_identity(device)
        identity_payload.update(AMDCollector._named_identity(device))
        return identity_payload

    @staticmethod
    def _base_identity(device: AMDDevice) -> dict[str, object]:
        identity_payload: dict[str, object] = {
            "index": device.index,
            "timestamp": datetime.now().isoformat(),
            "vendor": "amd",
        }
        utilization = _read_number(device.device_path / "gpu_busy_percent")
        if utilization is not None:
            identity_payload["utilization"] = utilization
        return identity_payload

    @staticmethod
    def _named_identity(device: AMDDevice) -> dict[str, object]:
        identity_payload: dict[str, object] = {}
        device_name = _read_text(device.device_path / "product_name")
        device_uuid = device.uuid or _read_text(device.device_path / "unique_id")
        if device_name:
            identity_payload["name"] = device_name
        if device_uuid:
            identity_payload["uuid"] = (
                device_uuid
                if device_uuid.startswith("AMD-")
                else f"AMD-{device_uuid}"
            )
        if device.pci_bus_id:
            identity_payload["pci_bus_id"] = device.pci_bus_id
        return identity_payload

    @staticmethod
    def _memory_metrics(device_path: Path) -> dict[str, float]:
        memory_used = _value_in_mib(_read_number(device_path / "mem_info_vram_used"))
        memory_total = _value_in_mib(_read_number(device_path / "mem_info_vram_total"))
        memory_metrics: dict[str, float] = {}
        if memory_used is not None:
            memory_metrics["memory_used"] = memory_used
        if memory_total is not None:
            memory_metrics["memory_total"] = memory_total
        if memory_used is not None and memory_total is not None:
            memory_metrics["memory_free"] = max(memory_total - memory_used, 0)
        return memory_metrics

    @staticmethod
    def _thermal_metrics(device_path: Path) -> dict[str, float]:
        thermal_metrics: dict[str, float] = {}
        edge_temperature = _read_hwmon_number(device_path, "temp1_input")
        if edge_temperature is not None:
            thermal_metrics["temperature"] = edge_temperature / 1000
        memory_temperature = _read_hwmon_number(device_path, "temp3_input")
        if memory_temperature is not None:
            thermal_metrics["temperature_memory"] = memory_temperature / 1000
        return thermal_metrics

    @staticmethod
    def _power_metrics(device_path: Path) -> dict[str, float]:
        average_power = _read_hwmon_number(device_path, "power1_average")
        if average_power is None:
            average_power = _read_hwmon_number(device_path, "power1_input")
        power_draw = _value_in_watts(average_power)
        power_limit = _value_in_watts(_read_hwmon_number(device_path, "power1_cap"))
        power_metrics: dict[str, float] = {}
        if power_draw is not None:
            power_metrics["power_draw"] = power_draw
        if power_limit is not None:
            power_metrics["power_limit"] = power_limit
        return power_metrics

    @staticmethod
    def _clock_metrics(device_path: Path) -> dict[str, float]:
        clock_metrics: dict[str, float] = {}
        clock_sources = {
            "clock_graphics": ("pp_dpm_sclk", "freq1_input"),
            "clock_memory": ("pp_dpm_mclk", "freq2_input"),
        }
        for clock_name, (dpm_name, frequency_name) in clock_sources.items():
            active_mhz, maximum_mhz = parse_dpm_levels(_read_text(device_path / dpm_name))
            current_mhz = _value_in_mhz(_read_hwmon_number(device_path, frequency_name))
            clock_metrics.update(_clock_values(clock_name, current_mhz, active_mhz, maximum_mhz))
        return clock_metrics

    @staticmethod
    def _pcie_metrics(device_path: Path) -> dict[str, object]:
        pcie_metrics: dict[str, object] = {}
        generation = pcie_generation(_read_text(device_path / "current_link_speed"))
        if generation is not None:
            pcie_metrics["pcie_gen"] = generation
        lane_width = _read_number(device_path / "current_link_width")
        if lane_width is not None and lane_width > 0 and lane_width.is_integer():
            pcie_metrics["pcie_width"] = int(lane_width)
        return pcie_metrics

    def _add_throttle_status(self, gpu_payloads: dict[str, dict]) -> None:
        for gpu_id, gpu_payload in gpu_payloads.items():
            enrichment = self._smi_metrics.get(gpu_id)
            if enrichment and enrichment.get("throttle_reasons"):
                gpu_payload["throttle_reasons"] = enrichment["throttle_reasons"]

    def _add_device_names(self, gpu_payloads: dict[str, dict]) -> None:
        for gpu_id, gpu_payload in gpu_payloads.items():
            if gpu_payload.get("name"):
                continue
            device = self.device_by_gpu_id[gpu_id]
            device_name = self._fallback_names.get(gpu_id)
            if device_name is None:
                device_name = self._smi_names.get(gpu_id) or _pci_device_name(
                    device.device_path
                )
            if device_name:
                self._fallback_names[gpu_id] = device_name
                gpu_payload["name"] = device_name

    def _poll_smi(self) -> None:
        if not self.amd_smi_path:
            return
        now = time.monotonic()
        if self._smi_last_ts and now - self._smi_last_ts < self.smi_interval:
            return
        self._smi_last_ts = now
        list_json = self._run_json([self.amd_smi_path, "list", "--json"])
        ordinal_map = self._smi_ordinal_map(list_json)
        if ordinal_map is None:
            logger.warning("amd-smi list mapping unavailable")
            self._clear_smi_enrichment()
            return
        (
            self._smi_processes,
            self._smi_metrics,
            self._smi_names,
        ) = self._collect_smi_enrichment(ordinal_map)

    def _clear_smi_enrichment(self) -> None:
        self._smi_processes = []
        self._smi_metrics = {}
        self._smi_names = {}

    def _collect_smi_enrichment(
        self, ordinal_map: dict[str, str]
    ) -> tuple[list[dict], dict[str, dict], dict[str, str]]:
        process_json = self._run_json([self.amd_smi_path, "process", "--json"])
        metric_json = self._run_json([self.amd_smi_path, "metric", "--json"])
        static_json = self._run_json(
            [self.amd_smi_path, "static", "--asic", "--json"]
        )
        processes = self._extract_process_records(process_json, ordinal_map)
        metrics = self._extract_metric_records(metric_json, ordinal_map)
        names = self._extract_name_records(static_json, ordinal_map)
        return processes, metrics, names

    def _extract_name_records(
        self, payload: object, ordinal_map: dict[str, str]
    ) -> dict[str, str]:
        if not isinstance(payload, dict) or not isinstance(
            payload.get("gpu_data"), list
        ):
            return {}
        names_by_gpu: dict[str, str] = {}
        for gpu_record in payload["gpu_data"]:
            if not isinstance(gpu_record, dict):
                continue
            gpu_id = self._record_index(gpu_record, ordinal_map)
            asic = gpu_record.get("asic")
            market_name = asic.get("market_name") if isinstance(asic, dict) else None
            if gpu_id and isinstance(market_name, str):
                normalised_name = market_name.strip()
                if normalised_name and normalised_name.upper() not in {
                    "N/A",
                    "UNKNOWN",
                }:
                    names_by_gpu[gpu_id] = normalised_name
        return names_by_gpu

    def _run_json(self, argv: list[str]) -> object | None:
        try:
            command_result = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                timeout=AMD_SMI_TIMEOUT,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            logger.warning("amd-smi %s unavailable: %s", argv[1], type(error).__name__)
            return None
        if command_result.returncode != 0:
            logger.warning(
                "amd-smi %s failed with exit code %s",
                argv[1],
                command_result.returncode,
            )
            return None
        return self._parse_smi_json(argv[1], command_result.stdout)

    @staticmethod
    def _parse_smi_json(command_name: str, command_output: object) -> object | None:
        if not isinstance(command_output, str) or len(command_output) > MAX_AMD_SMI_BYTES:
            logger.warning("amd-smi %s output exceeded limit", command_name)
            return None
        try:
            return json.loads(command_output)
        except (TypeError, ValueError):
            logger.warning("amd-smi %s returned invalid JSON", command_name)
            return None

    @staticmethod
    def _record_ordinal(record: dict) -> str | None:
        ordinal = record.get("gpu", record.get("gpu_index"))
        if isinstance(ordinal, bool):
            return None
        if isinstance(ordinal, int) and ordinal >= 0:
            return str(ordinal)
        if isinstance(ordinal, str) and ordinal.strip().isdigit():
            return str(int(ordinal.strip()))
        return None

    def _stable_device_index(self, record: dict) -> str | None:
        candidates = self._stable_bdf_indices(record) | self._stable_uuid_indices(record)
        if len(candidates) != 1:
            return None
        return next(iter(candidates))

    def _stable_bdf_indices(self, record: dict) -> set[str]:
        bdf = _normalise_bdf(record.get("bdf", record.get("pci_bus_id")))
        if bdf is None:
            return set()
        return {device.index for device in self.devices if device.pci_bus_id == bdf}

    def _stable_uuid_indices(self, record: dict) -> set[str]:
        uuid = _normalise_uuid(record.get("uuid", record.get("gpu_uuid")))
        if uuid is None:
            return set()
        return {
            device.index
            for device in self.devices
            if _normalise_uuid(
                device.uuid or _read_text(device.device_path / "unique_id")
            )
            == uuid
        }

    def _smi_ordinal_map(self, payload: object) -> dict[str, str] | None:
        records = self._smi_list_records(payload)
        if not records:
            return None
        ordinal_map: dict[str, str] = {}
        mapped_devices: set[str] = set()
        for record in records:
            mapping_entry = self._smi_mapping_entry(record, ordinal_map, mapped_devices)
            if mapping_entry is None:
                return None
            ordinal, device_index = mapping_entry
            ordinal_map[ordinal] = self._gpu_id_for_device(self.device_by_index[device_index])
            mapped_devices.add(device_index)
        return ordinal_map

    def _smi_mapping_entry(
        self, record: object, ordinal_map: dict[str, str], mapped_devices: set[str]
    ) -> tuple[str, str] | None:
        if not isinstance(record, dict):
            return None
        ordinal = self._record_ordinal(record)
        device_index = self._stable_device_index(record)
        if ordinal is None or device_index is None:
            return None
        if ordinal in ordinal_map or device_index in mapped_devices:
            return None
        return ordinal, device_index

    @staticmethod
    def _smi_list_records(payload: object) -> list[object] | None:
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return None
        for key in ("gpu_data", "gpus", "devices"):
            records = payload.get(key)
            if isinstance(records, list):
                return records
        return None

    def _record_index(self, record: dict, ordinal_map: dict[str, str]) -> str | None:
        ordinal = self._record_ordinal(record)
        if ordinal is not None:
            return ordinal_map.get(ordinal)
        device_index = self._stable_device_index(record)
        if device_index is None:
            return None
        return self._gpu_id_for_device(self.device_by_index[device_index])

    def _extract_process_records(self, payload: object, ordinal_map: dict[str, str]) -> list[dict]:
        if not isinstance(payload, list):
            return []
        process_records: list[dict] = []
        for gpu_record in payload:
            process_records.extend(self._processes_for_gpu_record(gpu_record, ordinal_map))
        return process_records

    def _processes_for_gpu_record(
        self, gpu_record: object, ordinal_map: dict[str, str]
    ) -> list[dict]:
        if not isinstance(gpu_record, dict):
            return []
        gpu_id = self._record_index(gpu_record, ordinal_map)
        if not gpu_id:
            logger.warning("amd-smi process record has unknown GPU")
            return []
        process_list = gpu_record.get("process_list", gpu_record.get("processes", []))
        if not isinstance(process_list, list):
            return []
        return [
            process_record
            for process_entry in process_list
            if (process_record := self._process_record(process_entry, gpu_id)) is not None
        ]

    def _process_record(self, process_entry: object, gpu_id: str) -> dict | None:
        process_info = (
            process_entry.get("process_info", process_entry)
            if isinstance(process_entry, dict)
            else None
        )
        if not isinstance(process_info, dict):
            return None
        process_id = process_info.get("pid")
        process_name = process_info.get("name")
        if not self._valid_process(process_id, process_name):
            return None
        return self._build_process_record(process_info, gpu_id)

    def _build_process_record(self, process_info: dict, gpu_id: str) -> dict:
        process_record = {
            "pid": str(process_info["pid"]),
            "name": Path(process_info["name"]).name,
            "gpu_id": gpu_id,
        }
        device_uuid = self._device_uuid(gpu_id)
        if device_uuid is not None:
            process_record["gpu_uuid"] = device_uuid
        memory_mib = self._process_memory_mib(process_info)
        if memory_mib is not None:
            process_record["memory"] = memory_mib
        return process_record

    @staticmethod
    def _valid_process(process_id: object, process_name: object) -> bool:
        return (
            isinstance(process_id, (int, str))
            and str(process_id).isdigit()
            and isinstance(process_name, str)
            and bool(process_name.strip())
        )

    def _device_uuid(self, gpu_id: str) -> str | None:
        device = self.device_by_gpu_id.get(gpu_id)
        if device is None:
            return None
        device_uuid = device.uuid or _read_text(device.device_path / "unique_id")
        if not device_uuid:
            return None
        return device_uuid if device_uuid.startswith("AMD-") else f"AMD-{device_uuid}"

    @staticmethod
    def _process_memory_mib(process_info: dict) -> float | None:
        memory_usage = process_info.get("memory_usage", {})
        if not isinstance(memory_usage, dict):
            memory_usage = {}
        memory_descriptor = memory_usage.get("vram_mem")
        if not isinstance(memory_descriptor, dict):
            memory_descriptor = process_info.get("mem_usage")
        if not isinstance(memory_descriptor, dict):
            return None
        amount = _parse_number(str(memory_descriptor.get("value", "")))
        unit = str(memory_descriptor.get("unit", "B")).upper()
        if amount is None:
            return None
        if unit == "B":
            return amount / (1024 ** 2)
        if unit in {"MB", "MIB"}:
            return amount
        if unit in {"GB", "GIB"}:
            return amount * 1024
        return None

    def _extract_metric_records(
        self, payload: object, ordinal_map: dict[str, str]
    ) -> dict[str, dict]:
        if not isinstance(payload, dict):
            return {}
        gpu_records = payload.get("gpu_data", payload.get("metrics", []))
        if not isinstance(gpu_records, list):
            return {}
        metrics_by_gpu: dict[str, dict] = {}
        for gpu_record in gpu_records:
            metric_record = self._metric_record(gpu_record, ordinal_map)
            if metric_record is not None:
                gpu_id, status = metric_record
                metrics_by_gpu[gpu_id] = {"throttle_reasons": status}
        return metrics_by_gpu

    def _metric_record(
        self, gpu_record: object, ordinal_map: dict[str, str]
    ) -> tuple[str, str] | None:
        if not isinstance(gpu_record, dict):
            return None
        gpu_id = self._record_index(gpu_record, ordinal_map)
        if not gpu_id:
            logger.warning("amd-smi metric record has unknown GPU")
            return None
        power_data = gpu_record.get("power", {})
        status = power_data.get("throttle_status") if isinstance(power_data, dict) else None
        if not isinstance(status, str) or not status.strip():
            return None
        if status.strip().upper() in {"N/A", "UNKNOWN"}:
            return None
        return gpu_id, status.strip()
