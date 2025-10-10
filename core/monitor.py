"""
GPU Monitor - Main monitoring class
"""

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
        """Get current GPU data"""
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
            
            # Track process counts per GPU
            gpu_process_counts = {}
            
            for i in range(device_count):
                try:
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    uuid = pynvml.nvmlDeviceGetUUID(handle)
                    if isinstance(uuid, bytes):
                        uuid = uuid.decode('utf-8')
                    
                    # Initialize counters for this GPU
                    gpu_id = str(i)
                    if gpu_id not in gpu_process_counts:
                        gpu_process_counts[gpu_id] = {'compute': 0, 'graphics': 0}
                    
                    # Get compute processes
                    procs = []
                    try:
                        procs = pynvml.nvmlDeviceGetComputeRunningProcesses(handle)
                        gpu_process_counts[gpu_id]['compute'] = len(procs)
                    except pynvml.NVMLError:
                        pass
                    
                    for proc in procs:
                        proc_name = 'Unknown'
                        try:
                            p = psutil.Process(proc.pid)
                            
                            # Try to get the command line for more detail
                            try:
                                cmdline = p.cmdline()
                            except (psutil.AccessDenied, psutil.NoSuchProcess):
                                cmdline = None
                            
                            if cmdline and len(cmdline) > 0:
                                # Strategy 1: Look for script/file in arguments (for python, node, etc.)
                                if len(cmdline) > 1:
                                    for arg in cmdline[1:]:
                                        if arg and not arg.startswith('-'):
                                            # Extract just the filename
                                            filename = arg.split('/')[-1].split('\\')[-1]
                                            if filename and filename not in ['python', 'python3', 'node', 'java']:
                                                proc_name = filename
                                                break
                                
                                # Strategy 2: If no good argument found, use the executable name
                                if proc_name == 'Unknown':
                                    proc_name = cmdline[0].split('/')[-1].split('\\')[-1]
                            
                            # Strategy 3: Fallback to process name
                            if proc_name == 'Unknown' or not proc_name:
                                try:
                                    proc_name = p.name()
                                except:
                                    proc_name = f'PID:{proc.pid}'
                            
                        except Exception as e:
                            # Last resort: show PID
                            proc_name = f'PID:{proc.pid}'
                            print(f"Warning: Could not get name for PID {proc.pid}: {e}")
                        
                        all_processes.append({
                            'pid': str(proc.pid),
                            'name': proc_name,
                            'gpu_uuid': uuid,
                            'memory': float(proc.usedGpuMemory / (1024 ** 2))
                        })
                
                except pynvml.NVMLError:
                    continue
            
            # Update GPU data with process counts
            for gpu_id, counts in gpu_process_counts.items():
                if gpu_id in self.gpu_data:
                    self.gpu_data[gpu_id]['compute_processes_count'] = counts['compute']
                    self.gpu_data[gpu_id]['graphics_processes_count'] = counts['graphics']
            
            return all_processes
            
        except Exception as e:
            print(f"Error getting processes: {e}")
            return []
    
    def shutdown(self):
        """Cleanup NVML"""
        if self.initialized:
            try:
                pynvml.nvmlShutdown()
                self.initialized = False
                print("✓ NVML shutdown")
            except Exception as e:
                print(f"Error shutting down NVML: {e}")

