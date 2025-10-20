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

logger = logging.getLogger(__name__)

SYSFS_PCI_DEVICES = Path("/sys/bus/pci/devices")
SYSFS_PCI_SLOTS = Path("/sys/bus/pci/slots")
SYSFS_PCI_RESCAN = Path("/sys/bus/pci/rescan")


class DisconnectMethod(Enum):
    """Available GPU disconnect methods"""
    AUTO = "auto"
    SLOT_POWER = "slot"
    HOT_RESET = "hot"
    LOGICAL = "logical"
    NVIDIA_RESET = "nvidia"


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
            result = await self._execute_disconnect(bdf, method, down_time)
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

    async def _execute_disconnect(self, bdf: str, method: DisconnectMethod, down_time: float) -> Dict:
        """Execute the actual disconnect/reconnect operation"""
        if method == DisconnectMethod.AUTO:
            method = await self._select_best_method(bdf)
        
        start_time = time.time()
        
        try:
            if method == DisconnectMethod.SLOT_POWER:
                await self._slot_power_disconnect(bdf, down_time)
            elif method == DisconnectMethod.HOT_RESET:
                await self._hot_reset_disconnect(bdf, down_time)
            elif method == DisconnectMethod.LOGICAL:
                await self._logical_disconnect(bdf, down_time)
            elif method == DisconnectMethod.NVIDIA_RESET:
                await self._nvidia_reset_disconnect(bdf, down_time)
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

    async def _select_best_method(self, bdf: str) -> DisconnectMethod:
        """Select the best available method for maximum realism"""
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
        logger.info(f"Executing logical disconnect for {bdf}")
        
        # Unbind and remove
        await self._unbind_driver(bdf)
        await self._write_sysfs(SYSFS_PCI_DEVICES / bdf / "remove", "1")
        
        await asyncio.sleep(down_time)
        
        # Rescan
        await self._write_sysfs(SYSFS_PCI_RESCAN, "1")
        await self._wait_for_condition(
            lambda: (SYSFS_PCI_DEVICES / bdf).exists(),
            timeout=30,
            description=f"{bdf} to reappear"
        )

    async def _nvidia_reset_disconnect(self, bdf: str, down_time: float):
        """Execute NVIDIA GPU reset"""
        logger.info(f"Executing NVIDIA reset for {bdf}")
        
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
