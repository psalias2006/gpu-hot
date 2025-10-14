"""GPU monitoring using NVML"""

import pynvml
import psutil
import logging
from .metrics import MetricsCollector
from .nvidia_smi_fallback import parse_nvidia_smi
from .config import NVIDIA_SMI

logger = logging.getLogger(__name__)


class GPUMonitor:
    """Monitor NVIDIA GPUs using NVML"""
    
    def __init__(self):
        self.running = False
        self.gpu_data = {}
        self.collector = MetricsCollector()
        self.use_smi = {}  # Track which GPUs use nvidia-smi (decided at boot)
        
        try:
            pynvml.nvmlInit()
            self.initialized = True
            version = pynvml.nvmlSystemGetDriverVersion()
            if isinstance(version, bytes):
                version = version.decode('utf-8')
            logger.info(f"NVML initialized - Driver: {version}")
            
            # Detect which GPUs need nvidia-smi (once at boot)
            self._detect_smi_gpus()
            
        except Exception as e:
            logger.error(f"Failed to initialize NVML: {e}")
            self.initialized = False
    
    def _detect_smi_gpus(self):
        """Detect which GPUs need nvidia-smi fallback (called once at boot)"""
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            logger.info(f"Detected {device_count} GPU(s)")
            
            if NVIDIA_SMI:
                logger.warning("NVIDIA_SMI=True - Forcing nvidia-smi for all GPUs")
                for i in range(device_count):
                    self.use_smi[str(i)] = True
                return
            
            # Auto-detect per GPU
            for i in range(device_count):
                gpu_id = str(i)
                try:
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    data = self.collector.collect_all(handle, gpu_id)
                    gpu_name = data.get('name', 'Unknown')
                    
                    if 'utilization' not in data or data.get('utilization') is None:
                        self.use_smi[gpu_id] = True
                        logger.warning(f"GPU {i} ({gpu_name}): Utilization metric not available via NVML")
                        logger.warning(f"GPU {i} ({gpu_name}): Switching to nvidia-smi mode")
                    else:
                        self.use_smi[gpu_id] = False
                        logger.info(f"GPU {i} ({gpu_name}): Using NVML (utilization: {data.get('utilization')}%)")
                        
                except Exception as e:
                    self.use_smi[gpu_id] = True
                    logger.error(f"GPU {i}: NVML detection failed - {e}")
                    logger.warning(f"GPU {i}: Falling back to nvidia-smi")
            
            # Summary
            nvml_count = sum(1 for use_smi in self.use_smi.values() if not use_smi)
            smi_count = sum(1 for use_smi in self.use_smi.values() if use_smi)
            if smi_count > 0:
                logger.info(f"Boot detection complete: {nvml_count} GPU(s) using NVML, {smi_count} GPU(s) using nvidia-smi")
            else:
                logger.info(f"Boot detection complete: All {nvml_count} GPU(s) using NVML")
                    
        except Exception as e:
            logger.error(f"Failed to detect GPUs: {e}")
    
    def get_gpu_data(self):
        """Collect metrics from all detected GPUs"""
        if not self.initialized:
            logger.error("Cannot get GPU data - NVML not initialized")
            return {}
        
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            gpu_data = {}
            
            # Get nvidia-smi data once if any GPU needs it
            smi_data = None
            if any(self.use_smi.values()):
                try:
                    smi_data = parse_nvidia_smi()
                except Exception as e:
                    logger.error(f"nvidia-smi failed: {e}")
            
            for i in range(device_count):
                gpu_id = str(i)
                try:
                    if self.use_smi.get(gpu_id, False):
                        # Use nvidia-smi
                        if smi_data and gpu_id in smi_data:
                            gpu_data[gpu_id] = smi_data[gpu_id]
                        else:
                            logger.warning(f"GPU {i}: No data from nvidia-smi")
                    else:
                        # Use NVML
                        handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                        gpu_data[gpu_id] = self.collector.collect_all(handle, gpu_id)
                        
                except pynvml.NVMLError as e:
                    logger.error(f"GPU {i}: NVML error - {e}")
                    continue
                except Exception as e:
                    logger.error(f"GPU {i}: Unexpected error - {e}")
                    continue
            
            if not gpu_data:
                logger.error("No GPU data collected from any source")
            
            self.gpu_data = gpu_data
            return gpu_data
            
        except Exception as e:
            logger.error(f"Failed to get GPU data: {e}")
            return {}
    
    def get_processes(self):
        """Get GPU process information"""
        if not self.initialized:
            return []
        
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            all_processes = []
            gpu_process_counts = {}
            
            for i in range(device_count):
                try:
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    uuid = pynvml.nvmlDeviceGetUUID(handle)
                    if isinstance(uuid, bytes):
                        uuid = uuid.decode('utf-8')
                    
                    gpu_id = str(i)
                    gpu_process_counts[gpu_id] = {'compute': 0, 'graphics': 0}
                    
                    try:
                        procs = pynvml.nvmlDeviceGetComputeRunningProcesses(handle)
                        gpu_process_counts[gpu_id]['compute'] = len(procs)
                        
                        for proc in procs:
                            # Handle None values for usedGpuMemory
                            memory_used = proc.usedGpuMemory / (1024 ** 2) if proc.usedGpuMemory is not None else 0.0
                            all_processes.append({
                                'pid': str(proc.pid),
                                'name': self._get_process_name(proc.pid),
                                'gpu_uuid': uuid,
                                'memory': float(memory_used)
                            })
                    except pynvml.NVMLError:
                        pass
                
                except pynvml.NVMLError:
                    continue
            
            for gpu_id, counts in gpu_process_counts.items():
                if gpu_id in self.gpu_data:
                    self.gpu_data[gpu_id]['compute_processes_count'] = counts['compute']
                    self.gpu_data[gpu_id]['graphics_processes_count'] = counts['graphics']
            
            return all_processes
            
        except Exception as e:
            logger.error(f"Error getting processes: {e}")
            return []
    
    def _get_process_name(self, pid):
        """Extract readable process name from PID"""
        try:
            p = psutil.Process(pid)
            try:
                cmdline = p.cmdline()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                return p.name() if hasattr(p, 'name') else f'PID:{pid}'
            
            if not cmdline:
                return p.name() if hasattr(p, 'name') else f'PID:{pid}'
            
            if len(cmdline) > 1:
                for arg in cmdline[1:]:
                    if arg and not arg.startswith('-'):
                        filename = arg.split('/')[-1].split('\\')[-1]
                        if filename and filename not in ['python', 'python3', 'node', 'java']:
                            return filename
            
            return cmdline[0].split('/')[-1].split('\\')[-1]
        except Exception:
            return f'PID:{pid}'
    
    def shutdown(self):
        if self.initialized:
            try:
                pynvml.nvmlShutdown()
                self.initialized = False
                logger.info("NVML shutdown")
            except Exception as e:
                logger.error(f"Error shutting down NVML: {e}")
