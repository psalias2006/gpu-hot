"""GPU monitoring using NVML"""

import pynvml
import psutil
from .metrics import MetricsCollector


class GPUMonitor:
    """Monitor NVIDIA GPUs using NVML"""
    
    def __init__(self):
        self.running = False
        self.gpu_data = {}
        self.collector = MetricsCollector()
        
        try:
            pynvml.nvmlInit()
            self.initialized = True
            version = pynvml.nvmlSystemGetDriverVersion()
            if isinstance(version, bytes):
                version = version.decode('utf-8')
            print(f"✓ NVML initialized - Driver: {version}")
        except Exception as e:
            print(f"✗ Failed to initialize NVML: {e}")
            self.initialized = False
    
    def get_gpu_data(self):
        """Collect metrics from all detected GPUs"""
        if not self.initialized:
            return {}
        
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            gpu_data = {}
            
            for i in range(device_count):
                try:
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    gpu_data[str(i)] = self.collector.collect_all(handle, str(i))
                except pynvml.NVMLError as e:
                    print(f"Error reading GPU {i}: {e}")
                    continue
            
            self.gpu_data = gpu_data
            return gpu_data
            
        except Exception as e:
            print(f"Error getting GPU data: {e}")
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
                            all_processes.append({
                                'pid': str(proc.pid),
                                'name': self._get_process_name(proc.pid),
                                'gpu_uuid': uuid,
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
            print(f"Error getting processes: {e}")
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
                print("✓ NVML shutdown")
            except Exception as e:
                print(f"Error shutting down NVML: {e}")

