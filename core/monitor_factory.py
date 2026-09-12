"""Compose NVIDIA and AMD monitors behind the existing monitor interface."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .amd import AMDCollector, discover_amd_devices
from .monitor import GPUMonitor

logger = logging.getLogger(__name__)


class MonitorComposition:
    """Expose one monitor interface for any detected GPU vendors."""

    def __init__(self, nvidia_monitor: GPUMonitor | None, amd_collector: AMDCollector | None):
        self.nvidia = nvidia_monitor
        self.amd = amd_collector
        self.running = False
        self.use_smi = getattr(nvidia_monitor, "use_smi", {}) or {}
        self._amd_data: dict[str, dict] = {}
        self._amd_processes: list[dict] = []
        self._amd_id_map: dict[str, str] = {}
        self._amd_collection_lock = asyncio.Lock()
        self._amd_task: asyncio.Task | None = None

    async def get_gpu_data(self) -> dict[str, dict]:
        gpu_payloads: dict[str, dict] = {}
        if self.nvidia is not None and getattr(self.nvidia, "initialized", False):
            try:
                gpu_payloads.update(await self.nvidia.get_gpu_data())
            except Exception as error:
                logger.error("NVIDIA collection failed: %s", error)
        if self.amd is not None:
            await self._refresh_amd()
            self._merge_amd_data(gpu_payloads)
        return gpu_payloads

    def _merge_amd_data(self, gpu_payloads: dict[str, dict]) -> None:
        """Keep bare numeric IDs unique when both vendors share a host."""
        id_map = self._amd_id_mapping(set(gpu_payloads))
        for gpu_id, payload in self._amd_data.items():
            merged_id = id_map[gpu_id]
            gpu_payloads[merged_id] = {**payload, "index": merged_id}
        self._amd_id_map = id_map

    def _amd_id_mapping(self, used_ids: set[str]) -> dict[str, str]:
        """Return stable bare IDs without colliding with collected NVIDIA IDs."""
        next_id = max((int(gpu_id) for gpu_id in used_ids if gpu_id.isdigit()), default=-1) + 1
        id_map: dict[str, str] = {}
        for gpu_id in self._amd_data:
            merged_id = gpu_id
            while merged_id in used_ids:
                merged_id = str(next_id)
                next_id += 1
            used_ids.add(merged_id)
            id_map[gpu_id] = merged_id
        return id_map

    async def get_processes(self) -> list[dict]:
        process_records: list[dict] = []
        if self.nvidia is not None and getattr(self.nvidia, "initialized", False):
            try:
                process_records.extend(await self.nvidia.get_processes())
            except Exception as error:
                logger.error("NVIDIA process collection failed: %s", error)
        if self.amd is not None:
            await self._await_amd()
            if not self._amd_id_map:
                nvidia_ids: set[str] = set()
                if self.nvidia is not None and getattr(self.nvidia, "initialized", False):
                    try:
                        nvidia_ids = set(await self.nvidia.get_gpu_data())
                    except Exception as error:
                        logger.error("NVIDIA collection failed: %s", error)
                self._amd_id_map = self._amd_id_mapping(nvidia_ids)
            process_records.extend(
                {
                    **process,
                    "gpu_id": self._amd_id_map.get(
                        process.get("gpu_id"), process.get("gpu_id")
                    ),
                }
                for process in self._amd_processes
            )
        return process_records

    async def _refresh_amd(self) -> None:
        async with self._amd_collection_lock:
            self._amd_task = asyncio.create_task(self._collect_amd_once())
            await self._amd_task

    async def _await_amd(self) -> None:
        if self._amd_task is None:
            await self._refresh_amd()
            return
        await self._amd_task

    async def _collect_amd_once(self) -> None:
        try:
            self._amd_data, self._amd_processes = await asyncio.get_event_loop().run_in_executor(
                None, self.amd.collect
            )
        except Exception as error:
            logger.error("AMD collection failed: %s", error)

    async def shutdown(self) -> None:
        if self.nvidia is not None and hasattr(self.nvidia, "shutdown"):
            await self.nvidia.shutdown()


def create_monitor(sysfs_root: str | Path = "/sys/class/drm") -> MonitorComposition:
    """Construct only the collectors needed by the local hardware."""
    nvidia = GPUMonitor()
    devices = discover_amd_devices(sysfs_root)
    amd = AMDCollector(devices) if devices else None
    if not devices:
        logger.info("No AMD GPUs detected")
    return MonitorComposition(nvidia, amd)
