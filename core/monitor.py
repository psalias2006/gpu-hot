"""Async GPU monitoring using NVML"""

import asyncio
import pynvml
import psutil
import logging
from .metrics import MetricsCollector
from .nvidia_smi_fallback import parse_nvidia_smi
from .config import NVIDIA_SMI, PLATFORM

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

    async def get_gpu_data(self):
        """Async collect metrics from all detected GPUs"""
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
                    # Run nvidia-smi in thread pool to avoid blocking
                    smi_data = await asyncio.get_event_loop().run_in_executor(
                        None, parse_nvidia_smi
                    )
                except Exception as e:
                    logger.error(f"nvidia-smi failed: {e}")

            # Collect GPU data concurrently
            tasks = []
            for i in range(device_count):
                gpu_id = str(i)
                if self.use_smi.get(gpu_id, False):
                    # Use nvidia-smi data
                    if smi_data and gpu_id in smi_data:
                        gpu_data[gpu_id] = smi_data[gpu_id]
                    else:
                        logger.warning(f"GPU {i}: No data from nvidia-smi")
                else:
                    # Use NVML - run in thread pool to avoid blocking
                    task = asyncio.get_event_loop().run_in_executor(
                        None, self._collect_single_gpu, i
                    )
                    tasks.append((gpu_id, task))

            # Wait for all NVML tasks to complete
            if tasks:
                results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
                for (gpu_id, _), result in zip(tasks, results):
                    if isinstance(result, Exception):
                        logger.error(f"GPU {gpu_id}: Error - {result}")
                    else:
                        gpu_data[gpu_id] = result

            if not gpu_data:
                logger.error("No GPU data collected from any source")

            self.gpu_data = gpu_data
            return gpu_data

        except Exception as e:
            logger.error(f"Failed to get GPU data: {e}")
            return {}

    def _collect_single_gpu(self, gpu_index):
        """Collect data for a single GPU (runs in thread pool)"""
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(gpu_index)
            return self.collector.collect_all(handle, str(gpu_index))
        except Exception as e:
            logger.error(f"GPU {gpu_index}: Error - {e}")
            return {}

    async def get_processes(self):
        """Async get GPU process information"""
        if not self.initialized:
            return []

        try:
            # Run process collection in thread pool
            return await asyncio.get_event_loop().run_in_executor(
                None, self._get_processes_sync
            )
        except Exception as e:
            logger.error(f"Error getting processes: {e}")
            return []

    def _get_processes_sync(self):
        """Synchronous process collection (runs in thread pool)"""
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
                            all_processes.append({
                                'pid': str(proc.pid),
                                'name': self._get_process_name(proc.pid),
                                'gpu_uuid': uuid,
                                'gpu_id': gpu_id,
                                'memory': float(proc.usedGpuMemory / (1024 ** 2))
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
        """Extract readable process name from PID with improved cross-platform logic"""
        try:
            p = psutil.Process(pid)

            # Define platform-specific process filters
            if PLATFORM == 'Windows':
                # Windows-specific interpreters and shells to skip
                skip_processes = ['python.exe', 'python3.exe', 'cmd.exe', 'powershell.exe', 
                                'pwsh.exe', 'conhost.exe', 'wscript.exe', 'cscript.exe']
                skip_names = ['python', 'python3', 'cmd', 'powershell', 'pwsh', 'conhost']
            else:
                # Unix-like systems
                skip_processes = ['python', 'python3', 'sh', 'bash', 'zsh', 'fish', 'dash']
                skip_names = ['python', 'python3', 'sh', 'bash', 'zsh', 'fish', 'dash']

            # First try to get the process name
            try:
                process_name = p.name()
                if process_name and process_name.lower() not in [s.lower() for s in skip_processes]:
                    # Remove .exe extension on Windows for cleaner display
                    if PLATFORM == 'Windows' and process_name.lower().endswith('.exe'):
                        return process_name[:-4]
                    return process_name
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                pass

            # Try to get command line for better name extraction
            try:
                cmdline = p.cmdline()
                if cmdline:
                    # Look for the actual executable or script name
                    for i, arg in enumerate(cmdline):
                        if not arg or arg.startswith('-'):
                            continue

                        # Extract filename from path (handle both / and \ separators)
                        filename = arg.replace('\\', '/').split('/')[-1]
                        
                        # Remove file extensions on Windows for cleaner display
                        if PLATFORM == 'Windows' and '.' in filename:
                            name_without_ext = filename.rsplit('.', 1)[0]
                            # Skip if it's still a generic name
                            if name_without_ext.lower() not in [s.lower() for s in skip_names]:
                                return name_without_ext
                        else:
                            # Skip common interpreters and shells
                            if filename.lower() not in [s.lower() for s in skip_names]:
                                return filename

                    # Fallback to first argument if nothing else worked
                    if cmdline[0]:
                        filename = cmdline[0].replace('\\', '/').split('/')[-1]
                        if PLATFORM == 'Windows' and filename.lower().endswith('.exe'):
                            filename = filename[:-4]
                        return filename

            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                pass

            # Final fallback
            return f'PID:{pid}'

        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return f'PID:{pid}'
        except Exception as e:
            logger.debug(f"Error getting process name for PID {pid}: {e}")
            return f'PID:{pid}'

    async def shutdown(self):
        """Async shutdown"""
        if self.initialized:
            try:
                pynvml.nvmlShutdown()
                self.initialized = False
                logger.info("NVML shutdown")
            except Exception as e:
                logger.error(f"Error shutting down NVML: {e}")

