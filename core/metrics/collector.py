"""GPU metrics collector using NVML"""

import time
import pynvml
from datetime import datetime
from .utils import safe_get, decode_bytes, to_mib, to_watts


class MetricsCollector:
    """Collect all available GPU metrics via NVML"""

    def __init__(self):
        self.previous_samples = {}
        self.last_sample_time = {}

    def collect_all(self, handle, gpu_id):
        """Collect all available metrics for a GPU"""
        data = {"index": gpu_id, "timestamp": datetime.now().isoformat()}
        current_time = time.time()

        self._add_basic_info(handle, data)
        self._add_performance(handle, data)
        self._add_memory(handle, data, gpu_id, current_time)
        self._add_power_thermal(handle, data)
        self._add_clocks(handle, data)
        self._add_connectivity(handle, data)
        self._add_media_engines(handle, data)
        self._add_health_status(handle, data)
        self._add_advanced(handle, data)

        self.previous_samples[gpu_id] = data.copy()
        self.last_sample_time[gpu_id] = current_time

        return data

    def _add_basic_info(self, handle, data):
        """Basic GPU information"""
        if name := safe_get(pynvml.nvmlDeviceGetName, handle):
            data["name"] = decode_bytes(name)

        if uuid := safe_get(pynvml.nvmlDeviceGetUUID, handle):
            data["uuid"] = decode_bytes(uuid)

        if driver := safe_get(pynvml.nvmlSystemGetDriverVersion):
            data["driver_version"] = decode_bytes(driver)

        if vbios := safe_get(pynvml.nvmlDeviceGetVbiosVersion, handle):
            data["vbios_version"] = decode_bytes(vbios)

        # Brand and architecture with smart detection
        self._detect_brand(handle, data)
        self._detect_architecture(handle, data)

        # CUDA capability
        if cap := safe_get(pynvml.nvmlDeviceGetCudaComputeCapability, handle):
            data["cuda_compute_capability"] = f"{cap[0]}.{cap[1]}"

        # Serial number
        if serial := safe_get(pynvml.nvmlDeviceGetSerial, handle):
            data["serial"] = decode_bytes(serial)

    def _detect_brand(self, handle, data):
        """Detect GPU brand from NVML"""
        BRAND_MAP = {
            1: "GeForce",
            2: "Quadro",
            3: "Tesla",
            4: "NVS",
            5: "GRID",
            6: "Titan",
            7: "GeForce GTX",
            8: "GeForce RTX",
            9: "Titan RTX",
        }

        if brand := safe_get(pynvml.nvmlDeviceGetBrand, handle):
            brand_name = BRAND_MAP.get(brand, f"Brand {brand}")

            # Enhanced brand detection with comprehensive name-based override
            if "name" in data:
                name = data["name"].upper()

                # Override NVML brand detection if name suggests different brand
                # RTX Series detection (highest priority)
                if any(
                    x in name
                    for x in [
                        "RTX 50",
                        "RTX 5090",
                        "RTX 5080",
                        "RTX 5070",
                        "RTX 5060",
                        "RTX 5050",
                    ]
                ):
                    brand_name = "GeForce RTX"  # RTX 50 series should be GeForce RTX
                elif any(
                    x in name
                    for x in [
                        "RTX 40",
                        "RTX 4090",
                        "RTX 4080",
                        "RTX 4070",
                        "RTX 4060",
                        "RTX 4050",
                    ]
                ):
                    brand_name = "GeForce RTX"  # RTX 40 series should be GeForce RTX
                elif any(
                    x in name
                    for x in [
                        "RTX 30",
                        "RTX 3090",
                        "RTX 3080",
                        "RTX 3070",
                        "RTX 3060",
                        "RTX 3050",
                    ]
                ):
                    brand_name = "GeForce RTX"  # RTX 30 series should be GeForce RTX
                elif any(
                    x in name for x in ["RTX 20", "RTX 2080", "RTX 2070", "RTX 2060"]
                ):
                    brand_name = "GeForce RTX"  # RTX 20 series should be GeForce RTX
                # GTX Series detection
                elif any(
                    x in name for x in ["GTX 16", "GTX 1660", "GTX 1650", "GTX 1630"]
                ):
                    brand_name = "GeForce"  # GTX 16 series should be GeForce
                elif any(
                    x in name for x in ["GTX 10", "GTX 1080", "GTX 1070", "GTX 1060"]
                ):
                    brand_name = "GeForce"  # GTX 10 series should be GeForce
                # Tesla/Data Center GPUs
                elif any(x in name for x in ["TESLA", "T4", "T10", "T40"]):
                    brand_name = "Tesla"  # Tesla GPUs should be Tesla
                elif any(x in name for x in ["A100", "A40", "A30", "A10", "A16", "A2"]):
                    brand_name = "Tesla"  # Ampere-based Tesla
                elif any(x in name for x in ["H100", "H200"]):
                    brand_name = "Tesla"  # Hopper-based Tesla
                elif any(x in name for x in ["L4", "L40", "L40S"]):
                    brand_name = "Tesla"  # Ada-based Tesla
                elif any(x in name for x in ["V100"]):
                    brand_name = "Tesla"  # Volta-based Tesla
                # GRID GPUs that are actually Tesla-based should show as Tesla
                elif brand == 5:
                    if any(x in name for x in ["TESLA", "T4", "T10", "T40"]):
                        brand_name = "Tesla"
                    elif any(
                        x in name for x in ["A100", "A40", "A30", "A10", "A16", "A2"]
                    ):
                        brand_name = "Tesla"  # Ampere-based Tesla
                    elif any(x in name for x in ["H100"]):
                        brand_name = "Tesla"  # Hopper-based Tesla
                    elif any(x in name for x in ["L4", "L40"]):
                        brand_name = "Tesla"  # Ada-based Tesla
                    elif any(x in name for x in ["V100"]):
                        brand_name = "Tesla"  # Volta-based Tesla

            data["brand"] = brand_name

    def _detect_architecture(self, handle, data):
        """Detect GPU architecture with fallback to name-based detection"""
        ARCH_MAP = {
            0: "Kepler",
            1: "Maxwell",
            2: "Pascal",
            3: "Volta",
            4: "Turing",
            5: "Ampere",
            6: "Ada Lovelace",
            7: "Hopper",
            8: "Ada Lovelace",
            9: "Ada Lovelace",  # Driver variations
        }

        # Try NVML first
        if arch := safe_get(pynvml.nvmlDeviceGetArchitecture, handle):
            data["architecture"] = ARCH_MAP.get(
                arch, self._detect_arch_from_name(data.get("name", ""))
            )
        # Fallback to name-based detection
        elif "name" in data:
            data["architecture"] = self._detect_arch_from_name(data["name"])

    def _detect_arch_from_name(self, gpu_name):
        """Detect architecture from GPU model name"""
        name = gpu_name.upper()

        # GRID GPU patterns - these are often Tesla/Ampere based
        grid_patterns = [
            (["V100", "TESLA V100"], "Volta"),
            (["T4", "TESLA T4"], "Turing"),
            (["A100", "TESLA A100"], "Ampere"),
            (["A40", "TESLA A40"], "Ampere"),
            (["A30", "TESLA A30"], "Ampere"),
            (["A10", "TESLA A10"], "Ampere"),
            (["A16", "TESLA A16"], "Ampere"),
            (["A2", "TESLA A2"], "Ampere"),
            (["H100", "TESLA H100"], "Hopper"),
            (["L40", "L40S", "L4"], "Ada Lovelace"),
            (["RTX", "GRTX"], "Ada Lovelace"),  # GRID RTX variants
        ]

        # Check for GRID patterns first
        for patterns, arch in grid_patterns:
            if any(pattern in name for pattern in patterns):
                return arch

        # Standard consumer/professional patterns
        arch_patterns = [
            (
                ["RTX 50", "RTX 5090", "RTX 5080", "RTX 5070", "RTX 5060"],
                "Ada Lovelace",
            ),  # RTX 50 series
            (["RTX 40", "RTX 4", "L40", "L4"], "Ada Lovelace"),
            (["H100", "H200"], "Hopper"),
            (
                [
                    "RTX 30",
                    "RTX 3",
                    "A100",
                    "A40",
                    "A30",
                    "A10",
                    "A6000",
                    "A5000",
                    "A4000",
                    "A2000",
                ],
                "Ampere",
            ),
            (["RTX 20", "RTX 2", "GTX 16", "T1000", "T2000", "T600"], "Turing"),
            (["GTX 10", "TITAN X", "P100", "P40", "P6"], "Pascal"),
            (["GTX 9", "TITAN M", "M60", "M40"], "Maxwell"),
            (["GTX 7", "GTX 6", "K80", "K40"], "Kepler"),
            (["V100"], "Volta"),
        ]

        for patterns, arch in arch_patterns:
            if any(pattern in name for pattern in patterns):
                return arch

        # Additional fallback patterns for GRID GPUs
        if "GRID" in name or "VGRID" in name:
            # GRID GPUs are often based on Tesla/Quadro architectures
            if any(x in name for x in ["K1", "K2", "K520", "K600"]):
                return "Kepler"
            elif any(x in name for x in ["M3", "M4", "M6", "M10", "M40", "M60"]):
                return "Maxwell"
            elif any(x in name for x in ["P4", "P6", "P40", "P100"]):
                return "Pascal"
            elif any(x in name for x in ["T4", "T10"]):
                return "Turing"
            elif any(x in name for x in ["A2", "A10", "A16", "A30", "A40", "A100"]):
                return "Ampere"
            elif any(x in name for x in ["H100"]):
                return "Hopper"
            elif any(x in name for x in ["L4", "L40"]):
                return "Ada Lovelace"

        return "Unknown"

    def _add_performance(self, handle, data):
        """Performance metrics"""
        # Utilization
        if util := safe_get(pynvml.nvmlDeviceGetUtilizationRates, handle):
            data["utilization"] = float(util.gpu)
            data["memory_utilization"] = float(util.memory)

        # Performance state
        if pstate := safe_get(pynvml.nvmlDeviceGetPerformanceState, handle):
            data["performance_state"] = f"P{pstate}"

        # Compute mode
        if mode := safe_get(pynvml.nvmlDeviceGetComputeMode, handle):
            modes = {
                0: "Default",
                1: "Exclusive Thread",
                2: "Prohibited",
                3: "Exclusive Process",
            }
            data["compute_mode"] = modes.get(mode, "Unknown")

    def _add_memory(self, handle, data, gpu_id, current_time):
        """Memory metrics"""
        if mem := safe_get(pynvml.nvmlDeviceGetMemoryInfo, handle):
            data["memory_used"] = to_mib(mem.used)
            data["memory_total"] = to_mib(mem.total)
            data["memory_free"] = to_mib(mem.free)

            # Calculate change rate
            if gpu_id in self.previous_samples:
                prev = self.previous_samples[gpu_id]
                if "memory_used" in prev:
                    dt = current_time - self.last_sample_time.get(gpu_id, current_time)
                    if dt > 0:
                        delta = data["memory_used"] - prev["memory_used"]
                        data["memory_change_rate"] = float(delta / dt)

        # BAR1 memory
        if bar1 := safe_get(pynvml.nvmlDeviceGetBAR1MemoryInfo, handle):
            data["bar1_memory_used"] = to_mib(bar1.bar1Used)
            data["bar1_memory_total"] = to_mib(bar1.bar1Total)

    def _add_power_thermal(self, handle, data):
        """Power and thermal metrics"""
        self._add_temperature(handle, data)
        self._add_power(handle, data)
        self._add_fan_speeds(handle, data)
        self._add_throttling(handle, data)

    def _add_temperature(self, handle, data):
        if temp := safe_get(
            pynvml.nvmlDeviceGetTemperature, handle, pynvml.NVML_TEMPERATURE_GPU
        ):
            data["temperature"] = float(temp)

        if temp_mem := safe_get(pynvml.nvmlDeviceGetTemperature, handle, 1):
            if temp_mem > 0:
                data["temperature_memory"] = float(temp_mem)

    def _add_power(self, handle, data):
        if power := safe_get(pynvml.nvmlDeviceGetPowerUsage, handle):
            data["power_draw"] = to_watts(power)

        if limit := safe_get(pynvml.nvmlDeviceGetPowerManagementLimit, handle):
            data["power_limit"] = to_watts(limit)

        if constraints := safe_get(
            pynvml.nvmlDeviceGetPowerManagementLimitConstraints, handle
        ):
            if isinstance(constraints, tuple) and len(constraints) >= 2:
                data["power_limit_min"] = to_watts(constraints[0])
                data["power_limit_max"] = to_watts(constraints[1])

        if energy := safe_get(pynvml.nvmlDeviceGetTotalEnergyConsumption, handle):
            data["energy_consumption"] = float(energy) / 1000.0
            data["energy_consumption_wh"] = float(energy) / 3600000.0

    def _add_fan_speeds(self, handle, data):
        if fan := safe_get(pynvml.nvmlDeviceGetFanSpeed, handle):
            data["fan_speed"] = float(fan)

        if hasattr(pynvml, "nvmlDeviceGetNumFans") and hasattr(
            pynvml, "nvmlDeviceGetFanSpeed_v2"
        ):
            if num_fans := safe_get(pynvml.nvmlDeviceGetNumFans, handle):
                fans = []
                for i in range(num_fans):
                    if speed := safe_get(pynvml.nvmlDeviceGetFanSpeed_v2, handle, i):
                        fans.append(float(speed))
                if fans:
                    data["fan_speeds"] = fans

    def _add_throttling(self, handle, data):
        if throttle := safe_get(
            pynvml.nvmlDeviceGetCurrentClocksThrottleReasons, handle
        ):
            throttle_map = [
                (pynvml.nvmlClocksThrottleReasonGpuIdle, "GPU Idle"),
                (
                    pynvml.nvmlClocksThrottleReasonApplicationsClocksSetting,
                    "App Settings",
                ),
                (pynvml.nvmlClocksThrottleReasonSwPowerCap, "SW Power Cap"),
                (pynvml.nvmlClocksThrottleReasonHwSlowdown, "HW Slowdown"),
                (pynvml.nvmlClocksThrottleReasonSwThermalSlowdown, "SW Thermal"),
                (pynvml.nvmlClocksThrottleReasonHwThermalSlowdown, "HW Thermal"),
                (pynvml.nvmlClocksThrottleReasonHwPowerBrakeSlowdown, "Power Brake"),
            ]
            reasons = [label for flag, label in throttle_map if throttle & flag]
            data["throttle_reasons"] = ", ".join(reasons) if reasons else "None"

    def _add_clocks(self, handle, data):
        """Clock speed metrics"""
        clock_types = [
            ("clock_graphics", pynvml.NVML_CLOCK_GRAPHICS),
            ("clock_sm", pynvml.NVML_CLOCK_SM),
            ("clock_memory", pynvml.NVML_CLOCK_MEM),
            ("clock_video", pynvml.NVML_CLOCK_VIDEO),
        ]

        for key, clock_type in clock_types:
            # Current clocks
            if clock := safe_get(pynvml.nvmlDeviceGetClockInfo, handle, clock_type):
                data[key] = float(clock)

            # Max clocks
            if max_clock := safe_get(
                pynvml.nvmlDeviceGetMaxClockInfo, handle, clock_type
            ):
                data[f"{key}_max"] = float(max_clock)

            # Application clocks (target clocks set by user/driver)
            if app_clock := safe_get(
                pynvml.nvmlDeviceGetApplicationsClock, handle, clock_type
            ):
                data[f"{key}_app"] = float(app_clock)

            # Default application clocks
            if default_clock := safe_get(
                pynvml.nvmlDeviceGetDefaultApplicationsClock, handle, clock_type
            ):
                data[f"{key}_default"] = float(default_clock)

        # Supported memory clocks (list of all available clock speeds)
        try:
            if mem_clocks := safe_get(
                pynvml.nvmlDeviceGetSupportedMemoryClocks, handle
            ):
                if mem_clocks and len(mem_clocks) > 0:
                    data["supported_memory_clocks"] = [
                        float(c) for c in mem_clocks[:10]
                    ]  # Limit to first 10
        except:
            pass

    def _add_connectivity(self, handle, data):
        """PCIe and interconnect metrics"""
        # PCIe
        pcie_metrics = [
            ("pcie_gen", pynvml.nvmlDeviceGetCurrPcieLinkGeneration),
            ("pcie_gen_max", pynvml.nvmlDeviceGetMaxPcieLinkGeneration),
            ("pcie_width", pynvml.nvmlDeviceGetCurrPcieLinkWidth),
            ("pcie_width_max", pynvml.nvmlDeviceGetMaxPcieLinkWidth),
        ]

        for key, func in pcie_metrics:
            if value := safe_get(func, handle):
                data[key] = str(value)

        # PCIe throughput
        if tx := safe_get(
            pynvml.nvmlDeviceGetPcieThroughput, handle, pynvml.NVML_PCIE_UTIL_TX_BYTES
        ):
            data["pcie_tx_throughput"] = float(tx)

        if rx := safe_get(
            pynvml.nvmlDeviceGetPcieThroughput, handle, pynvml.NVML_PCIE_UTIL_RX_BYTES
        ):
            data["pcie_rx_throughput"] = float(rx)

        # PCI info
        if pci := safe_get(pynvml.nvmlDeviceGetPciInfo, handle):
            data["pci_bus_id"] = decode_bytes(pci.busId)

    def _add_media_engines(self, handle, data):
        """Encoder/decoder metrics"""
        # Encoder
        if enc := safe_get(pynvml.nvmlDeviceGetEncoderUtilization, handle):
            if isinstance(enc, tuple) and len(enc) >= 2:
                data["encoder_utilization"] = float(enc[0])

        try:
            if sessions := pynvml.nvmlDeviceGetEncoderSessions(handle):
                data["encoder_sessions"] = len(sessions)
                if fps := [s.averageFps for s in sessions if hasattr(s, "averageFps")]:
                    data["encoder_fps"] = float(sum(fps) / len(fps))
        except:
            pass

        # Decoder
        if dec := safe_get(pynvml.nvmlDeviceGetDecoderUtilization, handle):
            if isinstance(dec, tuple) and len(dec) >= 2:
                data["decoder_utilization"] = float(dec[0])

        try:
            if sessions := pynvml.nvmlDeviceGetDecoderSessions(handle):
                data["decoder_sessions"] = len(sessions)
        except:
            pass

    def _add_health_status(self, handle, data):
        """ECC and health metrics"""
        try:
            if ecc := pynvml.nvmlDeviceGetEccMode(handle):
                if ecc[0]:
                    data["ecc_enabled"] = True

                    # ECC errors
                    if err := safe_get(
                        pynvml.nvmlDeviceGetTotalEccErrors,
                        handle,
                        pynvml.NVML_MEMORY_ERROR_TYPE_CORRECTED,
                        pynvml.NVML_VOLATILE_ECC,
                    ):
                        data["ecc_errors_corrected"] = int(err)
        except:
            pass

        # Retired pages
        try:
            if pages := pynvml.nvmlDeviceGetRetiredPages(
                handle, pynvml.NVML_PAGE_RETIREMENT_CAUSE_DOUBLE_BIT_ECC_ERROR
            ):
                data["retired_pages"] = len(pages)
        except:
            pass

    def _add_advanced(self, handle, data):
        """Advanced features"""
        if mode := safe_get(pynvml.nvmlDeviceGetPersistenceMode, handle):
            data["persistence_mode"] = "Enabled" if mode else "Disabled"

        if display := safe_get(pynvml.nvmlDeviceGetDisplayActive, handle):
            data["display_active"] = bool(display)

        if multi := safe_get(pynvml.nvmlDeviceGetMultiGpuBoard, handle):
            data["multi_gpu_board"] = bool(multi)

        if procs := safe_get(
            pynvml.nvmlDeviceGetGraphicsRunningProcesses, handle, default=[]
        ):
            data["graphics_processes_count"] = len(procs)

        self._add_mig_mode(handle, data)
        self._add_nvlink(handle, data)

    def _add_mig_mode(self, handle, data):
        if hasattr(pynvml, "nvmlDeviceGetMigMode"):
            if mig := safe_get(pynvml.nvmlDeviceGetMigMode, handle):
                if isinstance(mig, tuple) and len(mig) >= 2:
                    data["mig_mode_current"] = "Enabled" if mig[0] else "Disabled"
                    data["mig_mode_pending"] = "Enabled" if mig[1] else "Disabled"

    def _add_nvlink(self, handle, data):
        if hasattr(pynvml, "nvmlDeviceGetNvLinkState"):
            nvlinks = []
            active_count = 0

            for link_id in range(6):
                if state := safe_get(pynvml.nvmlDeviceGetNvLinkState, handle, link_id):
                    link_data = {"id": link_id, "active": bool(state)}

                    if hasattr(pynvml, "nvmlDeviceGetNvLinkCapability"):
                        if hasattr(pynvml, "NVML_NVLINK_CAP_P2P_SUPPORTED"):
                            if caps := safe_get(
                                pynvml.nvmlDeviceGetNvLinkCapability,
                                handle,
                                link_id,
                                pynvml.NVML_NVLINK_CAP_P2P_SUPPORTED,
                            ):
                                link_data["p2p_supported"] = bool(caps)

                    nvlinks.append(link_data)
                    if state:
                        active_count += 1
                else:
                    break

            if nvlinks:
                data["nvlink_links"] = nvlinks
                data["nvlink_active_count"] = active_count
