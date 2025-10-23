#!/usr/bin/env python3
"""
GPU Disconnect/Reconnect Utility for GPU Hot
Simulates GPU disconnect/reconnect on Linux for fault tolerance testing
"""

import asyncio
import os
import subprocess
import logging
import time
from pathlib import Path
from typing import Optional, Dict, List
from enum import Enum
import pynvml

logger = logging.getLogger(__name__)

SYSFS_PCI_DEVICES = Path("/sys/bus/pci/devices")
SYSFS_PCI_SLOTS = Path("/sys/bus/pci/slots")
SYSFS_PCI_RESCAN = Path("/sys/bus/pci/rescan")

# Global state for simulated disconnects
_simulated_offline_gpus = set()


def is_wsl2() -> bool:
    """Detect if running in WSL2"""
    try:
        with open('/proc/version', 'r') as f:
            version = f.read().lower()
            return 'wsl2' in version or 'microsoft' in version
    except Exception:
        return False


def is_gpu_simulated_offline(gpu_index: int) -> bool:
    """Check if GPU is in simulated offline state"""
    return gpu_index in _simulated_offline_gpus


class DisconnectMethod(Enum):
    """Available GPU disconnect methods"""
    AUTO = "auto"
    # Real PCI disconnects (Linux native only)
    SLOT_POWER = "slot"
    HOT_RESET = "hot"
    LOGICAL = "logical"
    # WSL2-compatible methods
    NVIDIA_RESET = "nvidia"
    SIMULATED = "simulated"
    MEMORY_FLOOD = "memory_flood"  # Experimental


class GPUDisconnectError(Exception):
    """Custom exception for GPU disconnect operations"""
    pass


class GPUDisconnector:
    """Manages GPU disconnect/reconnect operations"""

    def __init__(self):
        self._check_root_permissions()

    def _check_root_permissions(self):
        """Check if running with sufficient privileges"""
        if os.geteuid() != 0:
            logger.warning("GPU disconnect requires root privileges. Operations may fail.")
        
        # Log environment detection
        if is_wsl2():
            logger.info("WSL2 environment detected - PCI methods unavailable, will use WSL2-compatible methods")
        else:
            logger.info("Native Linux environment detected - all disconnect methods available")

    async def disconnect_gpu(
        self, 
        gpu_index: int, 
        method: DisconnectMethod = DisconnectMethod.AUTO,
        down_time: float = 5.0
    ) -> Dict[str, any]:
        """
        Disconnect and reconnect a GPU
        
        Args:
            gpu_index: NVIDIA GPU index (0-based)
            method: Disconnect method to use
            down_time: Seconds to keep device disconnected
            
        Returns:
            Dict with operation results
        """
        try:
            # Get GPU PCI bus ID
            bdf = await self._get_gpu_bdf(gpu_index)
            logger.info(f"Disconnecting GPU {gpu_index} (PCI: {bdf}) using method: {method.value}")
            
            # Check for active processes
            processes = await self._check_gpu_processes(gpu_index)
            if processes:
                logger.warning(f"GPU {gpu_index} has {len(processes)} active processes")
            
            # Perform disconnect/reconnect
            result = await self._execute_disconnect(bdf, method, down_time, gpu_index)
            result.update({
                'gpu_index': gpu_index,
                'bdf': bdf,
                'method_used': method.value,
                'down_time': down_time,
                'active_processes': len(processes)
            })
            
            logger.info(f"GPU {gpu_index} disconnect/reconnect completed successfully")
            return result
            
        except Exception as e:
            error_msg = f"Failed to disconnect GPU {gpu_index}: {str(e)}"
            logger.error(error_msg)
            raise GPUDisconnectError(error_msg) from e

    async def disconnect_multiple_gpus(
        self,
        gpu_indices: List[int],
        method: DisconnectMethod = DisconnectMethod.AUTO,
        down_time: float = 5.0
    ) -> Dict[str, any]:
        """
        Disconnect multiple GPUs simultaneously
        
        Args:
            gpu_indices: List of GPU indices to disconnect
            method: Disconnect method to use
            down_time: Seconds to keep devices disconnected
            
        Returns:
            Dict with results for each GPU
        """
        logger.info(f"Disconnecting {len(gpu_indices)} GPUs: {gpu_indices}")
        
        # Create tasks for each GPU
        tasks = []
        for gpu_index in gpu_indices:
            task = asyncio.create_task(
                self.disconnect_gpu(gpu_index, method, down_time),
                name=f"disconnect_gpu_{gpu_index}"
            )
            tasks.append((gpu_index, task))
        
        # Wait for all operations to complete
        results = {}
        errors = {}
        
        for gpu_index, task in tasks:
            try:
                results[gpu_index] = await task
            except Exception as e:
                errors[gpu_index] = str(e)
                logger.error(f"GPU {gpu_index} disconnect failed: {e}")
        
        return {
            'total_gpus': len(gpu_indices),
            'successful': len(results),
            'failed': len(errors),
            'results': results,
            'errors': errors
        }

    async def get_available_methods(self, gpu_index: int) -> List[str]:
        """Get available disconnect methods for a GPU"""
        methods = []
        
        try:
            bdf = await self._get_gpu_bdf(gpu_index)
            
            # Check slot power
            if self._has_slot_power(bdf):
                methods.append(DisconnectMethod.SLOT_POWER.value)
            
            # Check hot reset capability
            if self._has_hot_reset_capability(bdf):
                methods.append(DisconnectMethod.HOT_RESET.value)
            
            # Logical remove always available
            methods.append(DisconnectMethod.LOGICAL.value)
            
            # NVIDIA reset (if nvidia-smi available)
            if await self._has_nvidia_smi():
                methods.append(DisconnectMethod.NVIDIA_RESET.value)
                
        except Exception as e:
            logger.error(f"Error checking methods for GPU {gpu_index}: {e}")
        
        return methods

    async def _get_gpu_bdf(self, gpu_index: int) -> str:
        """Get PCI bus ID for GPU index using nvidia-smi"""
        try:
            result = await asyncio.create_subprocess_exec(
                'nvidia-smi', '--query-gpu=pci.bus_id', '--format=csv,noheader', '-i', str(gpu_index),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                raise GPUDisconnectError(f"nvidia-smi failed: {stderr.decode()}")
            
            bdf = stdout.decode().strip()
            if bdf.startswith("00000000:"):
                bdf = "0000:" + bdf.split(":", 1)[1]
            
            return bdf
            
        except Exception as e:
            raise GPUDisconnectError(f"Failed to get PCI bus ID for GPU {gpu_index}: {e}")

    async def _check_gpu_processes(self, gpu_index: int) -> List[Dict]:
        """Check for active processes on GPU"""
        try:
            result = await asyncio.create_subprocess_exec(
                'nvidia-smi', '--query-compute-apps=pid,process_name', '--format=csv,noheader', '-i', str(gpu_index),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                return []
            
            processes = []
            for line in stdout.decode().strip().splitlines():
                if line.strip() and "No running processes found" not in line:
                    parts = line.split(',', 1)
                    if len(parts) == 2:
                        processes.append({
                            'pid': parts[0].strip(),
                            'name': parts[1].strip()
                        })
            
            return processes
            
        except Exception:
            return []

    async def _execute_disconnect(self, bdf: str, method: DisconnectMethod, down_time: float, gpu_index: int = None) -> Dict:
        """Execute the actual disconnect/reconnect operation"""
        if method == DisconnectMethod.AUTO:
            method = await self._select_best_method(bdf, gpu_index)
        
        start_time = time.time()
        
        try:
            if method == DisconnectMethod.SLOT_POWER:
                await self._slot_power_disconnect(bdf, down_time)
            elif method == DisconnectMethod.HOT_RESET:
                await self._hot_reset_disconnect(bdf, down_time)
            elif method == DisconnectMethod.LOGICAL:
                await self._logical_disconnect(bdf, down_time)
            elif method == DisconnectMethod.NVIDIA_RESET:
                await self._nvidia_reset_disconnect(bdf, down_time, gpu_index)
            elif method == DisconnectMethod.SIMULATED:
                await self._simulated_disconnect(gpu_index, down_time)
            elif method == DisconnectMethod.MEMORY_FLOOD:
                await self._memory_flood_disconnect(gpu_index, down_time)
            else:
                raise GPUDisconnectError(f"Unsupported method: {method}")
            
            duration = time.time() - start_time
            return {
                'success': True,
                'method_executed': method.value,
                'duration_seconds': duration,
                'message': f"Successfully completed {method.value} disconnect/reconnect"
            }
            
        except Exception as e:
            duration = time.time() - start_time
            return {
                'success': False,
                'method_executed': method.value,
                'duration_seconds': duration,
                'error': str(e)
            }

    async def _select_best_method(self, bdf: str, gpu_index: int = None) -> DisconnectMethod:
        """Select the best available method based on environment"""
        
        # WSL2 detection - use soft methods
        if is_wsl2():
            logger.info("WSL2 detected - using SIMULATED disconnect (PCI methods unavailable)")
            return DisconnectMethod.SIMULATED
        
        # Native Linux - check PCI capabilities
        device_path = SYSFS_PCI_DEVICES / bdf
        if not device_path.exists():
            logger.warning(f"PCI device {bdf} not accessible - falling back to SIMULATED")
            return DisconnectMethod.SIMULATED
        
        # Use real PCI methods in order of preference
        if self._has_slot_power(bdf):
            return DisconnectMethod.SLOT_POWER
        elif self._has_hot_reset_capability(bdf):
            return DisconnectMethod.HOT_RESET
        else:
            return DisconnectMethod.LOGICAL

    def _has_slot_power(self, bdf: str) -> bool:
        """Check if slot power control is available"""
        try:
            dev = SYSFS_PCI_DEVICES / bdf
            if not dev.exists():
                return False
            
            # Check for slot symlink
            slot_link = dev / "slot"
            if slot_link.exists():
                power_file = slot_link / "power"
                return power_file.exists()
            
            # Check slots directory
            if SYSFS_PCI_SLOTS.exists():
                target = bdf.split(".")[0]  # Remove function
                for slot in SYSFS_PCI_SLOTS.iterdir():
                    addr_file = slot / "address"
                    power_file = slot / "power"
                    if addr_file.exists() and power_file.exists():
                        try:
                            addr = addr_file.read_text().strip()
                            if addr == target:
                                return True
                        except Exception:
                            continue
            
            return False
            
        except Exception:
            return False

    def _has_hot_reset_capability(self, bdf: str) -> bool:
        """Check if hot reset is available"""
        try:
            # Check for upstream bridge reset capability
            upstream_bdf = self._get_upstream_bdf(bdf)
            if upstream_bdf:
                upstream_dev = SYSFS_PCI_DEVICES / upstream_bdf
                reset_sub = upstream_dev / "reset_subordinate"
                reset_file = upstream_dev / "reset"
                return reset_sub.exists() or reset_file.exists()
            return False
        except Exception:
            return False

    def _get_upstream_bdf(self, bdf: str) -> Optional[str]:
        """Get upstream bridge BDF"""
        try:
            dev_path = SYSFS_PCI_DEVICES / bdf
            parent = dev_path.resolve().parent.name
            if ":" in parent:
                return parent
            return None
        except Exception:
            return None

    async def _has_nvidia_smi(self) -> bool:
        """Check if nvidia-smi is available"""
        try:
            result = await asyncio.create_subprocess_exec(
                'nvidia-smi', '--version',
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            await result.communicate()
            return result.returncode == 0
        except Exception:
            return False

    async def _slot_power_disconnect(self, bdf: str, down_time: float):
        """Execute slot power disconnect"""
        logger.info(f"Executing slot power disconnect for {bdf}")
        
        power_file = self._find_slot_power_file(bdf)
        if not power_file:
            raise GPUDisconnectError(f"Slot power file not found for {bdf}")
        
        # Unbind driver first
        await self._unbind_driver(bdf)
        
        # Power off
        await self._write_sysfs(power_file, "0")
        logger.info(f"Slot powered OFF for {down_time}s")
        
        # Wait for device to disappear
        await self._wait_for_condition(
            lambda: not (SYSFS_PCI_DEVICES / bdf).exists(),
            timeout=10,
            description=f"{bdf} to disappear"
        )
        
        await asyncio.sleep(down_time)
        
        # Power on
        await self._write_sysfs(power_file, "1")
        logger.info("Slot powered ON")
        
        # Rescan and rebind
        await self._write_sysfs(SYSFS_PCI_RESCAN, "1")
        await self._wait_for_condition(
            lambda: (SYSFS_PCI_DEVICES / bdf).exists(),
            timeout=30,
            description=f"{bdf} to reappear"
        )

    async def _hot_reset_disconnect(self, bdf: str, down_time: float):
        """Execute hot reset disconnect"""
        logger.info(f"Executing hot reset for {bdf}")
        
        upstream_bdf = self._get_upstream_bdf(bdf)
        if not upstream_bdf:
            raise GPUDisconnectError(f"Cannot find upstream bridge for {bdf}")
        
        # Unbind and remove
        await self._unbind_driver(bdf)
        await self._write_sysfs(SYSFS_PCI_DEVICES / bdf / "remove", "1")
        
        await asyncio.sleep(0.25)
        
        # Try hot reset
        upstream_dev = SYSFS_PCI_DEVICES / upstream_bdf
        reset_sub = upstream_dev / "reset_subordinate"
        reset_file = upstream_dev / "reset"
        
        if reset_sub.exists():
            await self._write_sysfs(reset_sub, "1")
        elif reset_file.exists():
            await self._write_sysfs(reset_file, "1")
        else:
            raise GPUDisconnectError(f"No reset capability found for upstream {upstream_bdf}")
        
        await asyncio.sleep(down_time)
        
        # Rescan
        await self._write_sysfs(SYSFS_PCI_RESCAN, "1")
        await self._wait_for_condition(
            lambda: (SYSFS_PCI_DEVICES / bdf).exists(),
            timeout=30,
            description=f"{bdf} to reappear"
        )

    async def _logical_disconnect(self, bdf: str, down_time: float):
        """Execute logical disconnect (remove/rescan)"""
        logger.info(f"[DISCONNECT START] GPU {bdf} - target down_time: {down_time}s")
        
        device_path = SYSFS_PCI_DEVICES / bdf
        
        # Log state before removal
        try:
            nvml_count_pre = pynvml.nvmlDeviceGetCount()
        except Exception as e:
            nvml_count_pre = f"Error: {e}"
        
        logger.info(f"[PRE-REMOVE] Device path exists: {device_path.exists()}")
        logger.info(f"[PRE-REMOVE] NVML device count: {nvml_count_pre}")
        
        # Unbind and remove
        await self._unbind_driver(bdf)
        logger.info(f"[REMOVE] Writing '1' to {device_path / 'remove'}")
        await self._write_sysfs(device_path / "remove", "1")
        
        # Wait briefly for removal to take effect, then verify
        await asyncio.sleep(0.5)
        
        try:
            nvml_count_post = pynvml.nvmlDeviceGetCount()
        except Exception as e:
            nvml_count_post = f"Error: {e}"
        
        logger.info(f"[POST-REMOVE] Device path exists: {device_path.exists()}")
        logger.info(f"[POST-REMOVE] NVML device count: {nvml_count_post}")
        
        if device_path.exists():
            logger.warning(f"[POST-REMOVE] WARNING: Device {bdf} still exists after removal!")
        else:
            logger.info(f"[POST-REMOVE] Confirmed: Device {bdf} successfully removed from PCI bus")
        
        # Sleep for down_time
        sleep_start = time.time()
        logger.info(f"[SLEEP START] Sleeping for {down_time}s to simulate disconnect")
        await asyncio.sleep(down_time)
        sleep_duration = time.time() - sleep_start
        logger.info(f"[SLEEP END] Actual sleep duration: {sleep_duration:.2f}s")
        
        # Rescan PCI bus
        logger.info(f"[RESCAN] Triggering PCI bus rescan")
        await self._write_sysfs(SYSFS_PCI_RESCAN, "1")
        
        # Wait for device to reappear
        logger.info(f"[RESCAN] Waiting for {bdf} to reappear (timeout: 30s)")
        await self._wait_for_condition(
            lambda: (SYSFS_PCI_DEVICES / bdf).exists(),
            timeout=30,
            description=f"{bdf} to reappear"
        )
        
        # Verify reconnection
        try:
            nvml_count_final = pynvml.nvmlDeviceGetCount()
        except Exception as e:
            nvml_count_final = f"Error: {e}"
        
        logger.info(f"[POST-RESCAN] Device path exists: {device_path.exists()}")
        logger.info(f"[POST-RESCAN] NVML device count: {nvml_count_final}")
        logger.info(f"[DISCONNECT END] GPU {bdf} reconnected successfully")

    async def _nvidia_reset_disconnect(self, bdf: str, down_time: float, gpu_index: int = None):
        """Execute NVIDIA GPU reset using nvidia-smi"""
        logger.info(f"[NVIDIA-RESET] Resetting GPU {gpu_index if gpu_index is not None else 'unknown'} ({bdf})")
        
        # Find GPU index from BDF
        gpu_index = await self._get_gpu_index_from_bdf(bdf)
        
        result = await asyncio.create_subprocess_exec(
            'nvidia-smi', '--gpu-reset', '-i', str(gpu_index),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await result.communicate()
        
        if result.returncode != 0:
            raise GPUDisconnectError(f"nvidia-smi --gpu-reset failed: {stderr.decode()}")
        
        await asyncio.sleep(down_time)

    async def _get_gpu_index_from_bdf(self, target_bdf: str) -> int:
        """Get GPU index from PCI bus ID"""
        result = await asyncio.create_subprocess_exec(
            'nvidia-smi', '--query-gpu=index,pci.bus_id', '--format=csv,noheader',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await result.communicate()
        
        if result.returncode != 0:
            raise GPUDisconnectError(f"Failed to query GPU indices: {stderr.decode()}")
        
        for line in stdout.decode().strip().splitlines():
            parts = line.split(',')
            if len(parts) >= 2:
                index = int(parts[0].strip())
                bdf = parts[1].strip()
                if bdf.startswith("00000000:"):
                    bdf = "0000:" + bdf.split(":", 1)[1]
                if bdf == target_bdf:
                    return index
        
        raise GPUDisconnectError(f"GPU index not found for BDF {target_bdf}")

    def _find_slot_power_file(self, bdf: str) -> Optional[Path]:
        """Find slot power control file"""
        dev = SYSFS_PCI_DEVICES / bdf
        slot_link = dev / "slot"
        if slot_link.exists():
            power_file = slot_link / "power"
            if power_file.exists():
                return power_file
        
        # Check slots directory
        if SYSFS_PCI_SLOTS.exists():
            target = bdf.split(".")[0]
            for slot in SYSFS_PCI_SLOTS.iterdir():
                addr_file = slot / "address"
                power_file = slot / "power"
                if addr_file.exists() and power_file.exists():
                    try:
                        addr = addr_file.read_text().strip()
                        if addr == target:
                            return power_file
                    except Exception:
                        continue
        
        return None

    async def _unbind_driver(self, bdf: str):
        """Unbind driver from device"""
        try:
            driver_link = SYSFS_PCI_DEVICES / bdf / "driver"
            if driver_link.is_symlink():
                driver_name = driver_link.resolve().name
                unbind_file = Path(f"/sys/bus/pci/drivers/{driver_name}/unbind")
                if unbind_file.exists():
                    await self._write_sysfs(unbind_file, bdf)
                    logger.debug(f"Unbound driver {driver_name} from {bdf}")
        except Exception as e:
            logger.warning(f"Failed to unbind driver for {bdf}: {e}")

    async def _write_sysfs(self, path: Path, value: str):
        """Write to sysfs file with proper error handling"""
        try:
            def write_sync():
                path.write_text(value)
            
            await asyncio.get_event_loop().run_in_executor(None, write_sync)
            logger.debug(f"Wrote '{value}' to {path}")
            
        except Exception as e:
            raise GPUDisconnectError(f"Failed to write to {path}: {e}")

    async def _wait_for_condition(self, condition, timeout: int, description: str):
        """Wait for a condition to be true with timeout"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if condition():
                return
            await asyncio.sleep(0.25)
        
        raise GPUDisconnectError(f"Timeout waiting for {description}")
    
    async def _simulated_disconnect(self, gpu_index: int, down_time: float):
        """Simulate disconnect in software only - WSL2 safe"""
        logger.info(f"[SIMULATED] Marking GPU {gpu_index} as offline for {down_time}s")
        logger.info(f"[SIMULATED] This is a software-only simulation - GPU remains physically available")
        
        # Add to simulated offline set
        _simulated_offline_gpus.add(gpu_index)
        
        try:
            logger.info(f"[SIMULATED] GPU {gpu_index} now appears 'disconnected' to monitor")
            await asyncio.sleep(down_time)
        finally:
            # Remove from offline set
            if gpu_index in _simulated_offline_gpus:
                _simulated_offline_gpus.remove(gpu_index)
            logger.info(f"[SIMULATED] GPU {gpu_index} back online - disconnect simulation complete")
    
    async def _memory_flood_disconnect(self, gpu_index: int, down_time: float):
        """Flood GPU memory to trigger potential OOM/driver reset - EXPERIMENTAL"""
        logger.warning(f"[MEMORY-FLOOD] Starting EXPERIMENTAL memory flood on GPU {gpu_index}")
        logger.warning(f"[MEMORY-FLOOD] This may cause unpredictable behavior or system instability!")
        
        try:
            import torch
        except ImportError:
            raise GPUDisconnectError("PyTorch not available - memory flood requires torch")
        
        try:
            torch.cuda.set_device(gpu_index)
            total_mem = torch.cuda.get_device_properties(gpu_index).total_memory
            logger.info(f"[MEMORY-FLOOD] GPU {gpu_index} total memory: {total_mem / 1e9:.2f}GB")
            
            allocations = []
            allocated_bytes = 0
            chunk_size = 100 * 1024 * 1024  # 100MB chunks
            
            # Phase 1: Allocate until OOM
            logger.info(f"[MEMORY-FLOOD] Phase 1: Allocating memory until OOM...")
            try:
                while allocated_bytes < total_mem * 0.95:  # Don't try to allocate 100%
                    tensor = torch.empty(chunk_size // 4, dtype=torch.float32, device=f'cuda:{gpu_index}')
                    allocations.append(tensor)
                    allocated_bytes += chunk_size
                    
                    if len(allocations) % 10 == 0:
                        logger.debug(f"[MEMORY-FLOOD] Allocated {allocated_bytes / 1e9:.2f}GB")
                        
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    logger.info(f"[MEMORY-FLOOD] OOM reached at {allocated_bytes / 1e9:.2f}GB: {e}")
                else:
                    raise
            
            # Phase 2: Hold memory for down_time
            logger.info(f"[MEMORY-FLOOD] Phase 2: Holding {allocated_bytes / 1e9:.2f}GB for {down_time}s")
            logger.info(f"[MEMORY-FLOOD] GPU {gpu_index} should be unresponsive during this time")
            
            await asyncio.sleep(down_time)
            
        except Exception as e:
            logger.error(f"[MEMORY-FLOOD] Error during memory flood: {e}")
            raise
        finally:
            # Phase 3: Release memory
            logger.info(f"[MEMORY-FLOOD] Phase 3: Releasing memory...")
            allocations.clear()
            
            if 'torch' in dir():
                torch.cuda.empty_cache()
                torch.cuda.synchronize(gpu_index)
            
            logger.info(f"[MEMORY-FLOOD] Memory flood complete - GPU {gpu_index} should recover")


# Global instance
gpu_disconnector = GPUDisconnector()


async def disconnect_gpu(gpu_index: int, method: str = "auto", down_time: float = 5.0) -> Dict:
    """Async wrapper for GPU disconnect operation"""
    method_enum = DisconnectMethod(method)
    return await gpu_disconnector.disconnect_gpu(gpu_index, method_enum, down_time)


async def disconnect_multiple_gpus(gpu_indices: List[int], method: str = "auto", down_time: float = 5.0) -> Dict:
    """Async wrapper for multiple GPU disconnect operation"""
    method_enum = DisconnectMethod(method)
    return await gpu_disconnector.disconnect_multiple_gpus(gpu_indices, method_enum, down_time)


async def get_available_methods(gpu_index: int) -> List[str]:
    """Get available disconnect methods for a GPU"""
    return await gpu_disconnector.get_available_methods(gpu_index)
