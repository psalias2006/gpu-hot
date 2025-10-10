"""
Main metrics collector that orchestrates all metric gathering
"""

import time
import pynvml
from datetime import datetime
from .utils import safe_get, decode_bytes, to_mib, to_watts


class MetricsCollector:
    """Collect GPU metrics using NVML"""
    
    def __init__(self):
        self.previous_samples = {}
        self.last_sample_time = {}
    
    def collect_all(self, handle, gpu_id):
        """Collect all available metrics for a GPU"""
        data = {
            'index': gpu_id,
            'timestamp': datetime.now().isoformat()
        }
        current_time = time.time()
        
        # Basic info
        self._add_basic_info(handle, data)
        
        # Performance
        self._add_performance(handle, data)
        
        # Memory
        self._add_memory(handle, data, gpu_id, current_time)
        
        # Power & Thermal
        self._add_power_thermal(handle, data)
        
        # Clocks
        self._add_clocks(handle, data)
        
        # Connectivity
        self._add_connectivity(handle, data)
        
        # Media engines
        self._add_media_engines(handle, data)
        
        # Health & Status
        self._add_health_status(handle, data)
        
        # Advanced features
        self._add_advanced(handle, data)
        
        # Store for rate calculations
        self.previous_samples[gpu_id] = data.copy()
        self.last_sample_time[gpu_id] = current_time
        
        return data
    
    def _add_basic_info(self, handle, data):
        """Basic GPU information"""
        if name := safe_get(pynvml.nvmlDeviceGetName, handle):
            data['name'] = decode_bytes(name)
        
        if uuid := safe_get(pynvml.nvmlDeviceGetUUID, handle):
            data['uuid'] = decode_bytes(uuid)
        
        if driver := safe_get(pynvml.nvmlSystemGetDriverVersion):
            data['driver_version'] = decode_bytes(driver)
        
        if vbios := safe_get(pynvml.nvmlDeviceGetVbiosVersion, handle):
            data['vbios_version'] = decode_bytes(vbios)
        
        # Brand type
        if brand := safe_get(pynvml.nvmlDeviceGetBrand, handle):
            brand_map = {
                1: 'GeForce', 2: 'Quadro', 3: 'Tesla',
                4: 'NVS', 5: 'GRID', 6: 'Titan'
            }
            data['brand'] = brand_map.get(brand, f'Unknown ({brand})')
        
        # Architecture
        if arch := safe_get(pynvml.nvmlDeviceGetArchitecture, handle):
            arch_map = {0: 'Kepler', 1: 'Maxwell', 2: 'Pascal', 3: 'Volta',
                       4: 'Turing', 5: 'Ampere', 6: 'Ada', 7: 'Hopper'}
            data['architecture'] = arch_map.get(arch, f'Unknown ({arch})')
        
        # CUDA capability
        if cap := safe_get(pynvml.nvmlDeviceGetCudaComputeCapability, handle):
            data['cuda_compute_capability'] = f"{cap[0]}.{cap[1]}"
        
        # Serial number
        if serial := safe_get(pynvml.nvmlDeviceGetSerial, handle):
            data['serial'] = decode_bytes(serial)
    
    def _add_performance(self, handle, data):
        """Performance metrics"""
        # Utilization
        if util := safe_get(pynvml.nvmlDeviceGetUtilizationRates, handle):
            data['utilization'] = float(util.gpu)
            data['memory_utilization'] = float(util.memory)
        
        # Performance state
        if pstate := safe_get(pynvml.nvmlDeviceGetPerformanceState, handle):
            data['performance_state'] = f'P{pstate}'
        
        # Compute mode
        if mode := safe_get(pynvml.nvmlDeviceGetComputeMode, handle):
            modes = {0: 'Default', 1: 'Exclusive Thread', 
                    2: 'Prohibited', 3: 'Exclusive Process'}
            data['compute_mode'] = modes.get(mode, 'Unknown')
    
    def _add_memory(self, handle, data, gpu_id, current_time):
        """Memory metrics"""
        if mem := safe_get(pynvml.nvmlDeviceGetMemoryInfo, handle):
            data['memory_used'] = to_mib(mem.used)
            data['memory_total'] = to_mib(mem.total)
            data['memory_free'] = to_mib(mem.free)
            
            # Calculate change rate
            if gpu_id in self.previous_samples:
                prev = self.previous_samples[gpu_id]
                if 'memory_used' in prev:
                    dt = current_time - self.last_sample_time.get(gpu_id, current_time)
                    if dt > 0:
                        delta = data['memory_used'] - prev['memory_used']
                        data['memory_change_rate'] = float(delta / dt)
        
        # BAR1 memory
        if bar1 := safe_get(pynvml.nvmlDeviceGetBAR1MemoryInfo, handle):
            data['bar1_memory_used'] = to_mib(bar1.bar1Used)
            data['bar1_memory_total'] = to_mib(bar1.bar1Total)
    
    def _add_power_thermal(self, handle, data):
        """Power and thermal metrics"""
        # Temperature
        if temp := safe_get(pynvml.nvmlDeviceGetTemperature, handle, 
                           pynvml.NVML_TEMPERATURE_GPU):
            data['temperature'] = float(temp)
        
        # Memory temperature (try different sensor IDs as fallback)
        try:
            # Try sensor ID 1 for memory temp (not all GPUs support this)
            temp_mem = safe_get(pynvml.nvmlDeviceGetTemperature, handle, 1)
            if temp_mem and temp_mem > 0:
                data['temperature_memory'] = float(temp_mem)
        except:
            pass
        
        # Power
        if power := safe_get(pynvml.nvmlDeviceGetPowerUsage, handle):
            data['power_draw'] = to_watts(power)
        
        if limit := safe_get(pynvml.nvmlDeviceGetPowerManagementLimit, handle):
            data['power_limit'] = to_watts(limit)
        
        # Power constraints (min/max limits)
        if constraints := safe_get(pynvml.nvmlDeviceGetPowerManagementLimitConstraints, handle):
            if isinstance(constraints, tuple) and len(constraints) >= 2:
                data['power_limit_min'] = to_watts(constraints[0])
                data['power_limit_max'] = to_watts(constraints[1])
        
        # Total energy consumption (since driver load)
        if energy := safe_get(pynvml.nvmlDeviceGetTotalEnergyConsumption, handle):
            data['energy_consumption'] = float(energy) / 1000.0  # Convert mJ to J
            data['energy_consumption_wh'] = float(energy) / 3600000.0  # Convert mJ to Wh
        
        # Voltage violation status
        try:
            if hasattr(pynvml, 'nvmlDeviceGetViolationStatus') and hasattr(pynvml, 'NVML_PERF_POLICY_POWER'):
                if violation := safe_get(pynvml.nvmlDeviceGetViolationStatus, handle, 
                                        pynvml.NVML_PERF_POLICY_POWER):
                    if isinstance(violation, tuple) and len(violation) >= 2:
                        data['power_violation_time'] = float(violation[0])
        except:
            pass
        
        # Fan speeds (try multiple fans)
        if fan := safe_get(pynvml.nvmlDeviceGetFanSpeed, handle):
            data['fan_speed'] = float(fan)
        
        # Try to get individual fan speeds for multi-fan GPUs
        try:
            if hasattr(pynvml, 'nvmlDeviceGetNumFans') and hasattr(pynvml, 'nvmlDeviceGetFanSpeed_v2'):
                if num_fans := safe_get(pynvml.nvmlDeviceGetNumFans, handle):
                    fans = []
                    for i in range(num_fans):
                        if speed := safe_get(pynvml.nvmlDeviceGetFanSpeed_v2, handle, i):
                            fans.append(float(speed))
                    if fans:
                        data['fan_speeds'] = fans
        except:
            pass
        
        # Throttling
        if throttle := safe_get(pynvml.nvmlDeviceGetCurrentClocksThrottleReasons, handle):
            reasons = []
            throttle_map = [
                (pynvml.nvmlClocksThrottleReasonGpuIdle, 'GPU Idle'),
                (pynvml.nvmlClocksThrottleReasonApplicationsClocksSetting, 'App Settings'),
                (pynvml.nvmlClocksThrottleReasonSwPowerCap, 'SW Power Cap'),
                (pynvml.nvmlClocksThrottleReasonHwSlowdown, 'HW Slowdown'),
                (pynvml.nvmlClocksThrottleReasonSwThermalSlowdown, 'SW Thermal'),
                (pynvml.nvmlClocksThrottleReasonHwThermalSlowdown, 'HW Thermal'),
                (pynvml.nvmlClocksThrottleReasonHwPowerBrakeSlowdown, 'Power Brake'),
            ]
            reasons = [label for flag, label in throttle_map if throttle & flag]
            data['throttle_reasons'] = ', '.join(reasons) if reasons else 'None'
    
    def _add_clocks(self, handle, data):
        """Clock speed metrics"""
        clock_types = [
            ('clock_graphics', pynvml.NVML_CLOCK_GRAPHICS),
            ('clock_sm', pynvml.NVML_CLOCK_SM),
            ('clock_memory', pynvml.NVML_CLOCK_MEM),
            ('clock_video', pynvml.NVML_CLOCK_VIDEO),
        ]
        
        for key, clock_type in clock_types:
            # Current clocks
            if clock := safe_get(pynvml.nvmlDeviceGetClockInfo, handle, clock_type):
                data[key] = float(clock)
            
            # Max clocks
            if max_clock := safe_get(pynvml.nvmlDeviceGetMaxClockInfo, handle, clock_type):
                data[f'{key}_max'] = float(max_clock)
            
            # Application clocks (target clocks set by user/driver)
            if app_clock := safe_get(pynvml.nvmlDeviceGetApplicationsClock, handle, clock_type):
                data[f'{key}_app'] = float(app_clock)
            
            # Default application clocks
            if default_clock := safe_get(pynvml.nvmlDeviceGetDefaultApplicationsClock, handle, clock_type):
                data[f'{key}_default'] = float(default_clock)
        
        # Supported memory clocks (list of all available clock speeds)
        try:
            if mem_clocks := safe_get(pynvml.nvmlDeviceGetSupportedMemoryClocks, handle):
                if mem_clocks and len(mem_clocks) > 0:
                    data['supported_memory_clocks'] = [float(c) for c in mem_clocks[:10]]  # Limit to first 10
        except:
            pass
    
    def _add_connectivity(self, handle, data):
        """PCIe and interconnect metrics"""
        # PCIe
        pcie_metrics = [
            ('pcie_gen', pynvml.nvmlDeviceGetCurrPcieLinkGeneration),
            ('pcie_gen_max', pynvml.nvmlDeviceGetMaxPcieLinkGeneration),
            ('pcie_width', pynvml.nvmlDeviceGetCurrPcieLinkWidth),
            ('pcie_width_max', pynvml.nvmlDeviceGetMaxPcieLinkWidth),
        ]
        
        for key, func in pcie_metrics:
            if value := safe_get(func, handle):
                data[key] = str(value)
        
        # PCIe throughput
        if tx := safe_get(pynvml.nvmlDeviceGetPcieThroughput, handle,
                         pynvml.NVML_PCIE_UTIL_TX_BYTES):
            data['pcie_tx_throughput'] = float(tx)
        
        if rx := safe_get(pynvml.nvmlDeviceGetPcieThroughput, handle,
                         pynvml.NVML_PCIE_UTIL_RX_BYTES):
            data['pcie_rx_throughput'] = float(rx)
        
        # PCI info
        if pci := safe_get(pynvml.nvmlDeviceGetPciInfo, handle):
            data['pci_bus_id'] = decode_bytes(pci.busId)
    
    def _add_media_engines(self, handle, data):
        """Encoder/decoder metrics"""
        # Encoder
        if enc := safe_get(pynvml.nvmlDeviceGetEncoderUtilization, handle):
            if isinstance(enc, tuple) and len(enc) >= 2:
                data['encoder_utilization'] = float(enc[0])
        
        try:
            if sessions := pynvml.nvmlDeviceGetEncoderSessions(handle):
                data['encoder_sessions'] = len(sessions)
                if fps := [s.averageFps for s in sessions if hasattr(s, 'averageFps')]:
                    data['encoder_fps'] = float(sum(fps) / len(fps))
        except:
            pass
        
        # Decoder
        if dec := safe_get(pynvml.nvmlDeviceGetDecoderUtilization, handle):
            if isinstance(dec, tuple) and len(dec) >= 2:
                data['decoder_utilization'] = float(dec[0])
        
        try:
            if sessions := pynvml.nvmlDeviceGetDecoderSessions(handle):
                data['decoder_sessions'] = len(sessions)
        except:
            pass
    
    def _add_health_status(self, handle, data):
        """ECC and health metrics"""
        try:
            if ecc := pynvml.nvmlDeviceGetEccMode(handle):
                if ecc[0]:
                    data['ecc_enabled'] = True
                    
                    # ECC errors
                    if err := safe_get(pynvml.nvmlDeviceGetTotalEccErrors, handle,
                                      pynvml.NVML_MEMORY_ERROR_TYPE_CORRECTED,
                                      pynvml.NVML_VOLATILE_ECC):
                        data['ecc_errors_corrected'] = int(err)
        except:
            pass
        
        # Retired pages
        try:
            if pages := pynvml.nvmlDeviceGetRetiredPages(handle,
                        pynvml.NVML_PAGE_RETIREMENT_CAUSE_DOUBLE_BIT_ECC_ERROR):
                data['retired_pages'] = len(pages)
        except:
            pass
    
    def _add_advanced(self, handle, data):
        """Advanced features"""
        # Persistence mode
        if mode := safe_get(pynvml.nvmlDeviceGetPersistenceMode, handle):
            data['persistence_mode'] = 'Enabled' if mode else 'Disabled'
        
        # Display
        if display := safe_get(pynvml.nvmlDeviceGetDisplayActive, handle):
            data['display_active'] = bool(display)
        
        # Multi-GPU board
        if multi := safe_get(pynvml.nvmlDeviceGetMultiGpuBoard, handle):
            data['multi_gpu_board'] = bool(multi)
        
        # GPU reset required (not available in all pynvml versions)
        try:
            if hasattr(pynvml, 'nvmlDeviceGetResetRequired'):
                if reset := safe_get(pynvml.nvmlDeviceGetResetRequired, handle):
                    data['reset_required'] = bool(reset)
        except:
            pass
        
        # Graphics processes (in addition to compute processes)
        try:
            if procs := safe_get(pynvml.nvmlDeviceGetGraphicsRunningProcesses, handle, default=[]):
                data['graphics_processes_count'] = len(procs)
        except:
            pass
        
        # MIG mode (Multi-Instance GPU for datacenter GPUs)
        try:
            if hasattr(pynvml, 'nvmlDeviceGetMigMode'):
                if mig := safe_get(pynvml.nvmlDeviceGetMigMode, handle):
                    if isinstance(mig, tuple) and len(mig) >= 2:
                        data['mig_mode_current'] = 'Enabled' if mig[0] else 'Disabled'
                        data['mig_mode_pending'] = 'Enabled' if mig[1] else 'Disabled'
        except:
            pass
        
        # Inforom versions
        try:
            if hasattr(pynvml, 'nvmlDeviceGetInforomVersion'):
                inforom_objects = ['IMG', 'OEM', 'ECC', 'PWR']
                inforom_versions = {}
                for obj in inforom_objects:
                    if ver := safe_get(pynvml.nvmlDeviceGetInforomVersion, handle, obj):
                        inforom_versions[obj.lower()] = decode_bytes(ver)
                if inforom_versions:
                    data['inforom_version'] = inforom_versions
        except:
            pass
        
        # NVLink (if available)
        try:
            if hasattr(pynvml, 'nvmlDeviceGetNvLinkState'):
                nvlinks = []
                nvlink_total_bandwidth = 0
                for link_id in range(6):  # Check up to 6 links
                    try:
                        if state := safe_get(pynvml.nvmlDeviceGetNvLinkState, handle, link_id):
                            link_data = {'id': link_id, 'active': bool(state)}
                            
                            # Get link capabilities
                            if hasattr(pynvml, 'nvmlDeviceGetNvLinkCapability') and hasattr(pynvml, 'NVML_NVLINK_CAP_P2P_SUPPORTED'):
                                if caps := safe_get(pynvml.nvmlDeviceGetNvLinkCapability, handle, link_id, 
                                                  pynvml.NVML_NVLINK_CAP_P2P_SUPPORTED):
                                    link_data['p2p_supported'] = bool(caps)
                            
                            nvlinks.append(link_data)
                            if state:
                                nvlink_total_bandwidth += 1
                        else:
                            break
                    except:
                        break
                
                if nvlinks:
                    data['nvlink_links'] = nvlinks
                    data['nvlink_active_count'] = nvlink_total_bandwidth
        except:
            pass

