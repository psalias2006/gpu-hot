#!/usr/bin/env python3
"""
GPU Test Workloads - Generate various GPU operations for disconnect testing
Uses PyTorch/CuPy for CUDA operations without requiring custom CUDA code
"""

import asyncio
import logging
import time
import threading
from datetime import datetime
from typing import Optional, Dict, List
from enum import Enum

logger = logging.getLogger(__name__)

# Try to import GPU libraries
try:
    import torch
    TORCH_AVAILABLE = torch.cuda.is_available()
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available - GPU workload tests will be limited")

try:
    import cupy as cp
    CUPY_AVAILABLE = True
except ImportError:
    CUPY_AVAILABLE = False
    logger.warning("CuPy not available - using PyTorch for workloads")


class WorkloadType(Enum):
    """Types of GPU workloads for testing"""
    MEMORY_STRESS = "memory_stress"
    COMPUTE_INTENSIVE = "compute_intensive"
    LONG_RUNNING = "long_running"
    CONTINUOUS = "continuous"
    MIXED = "mixed"


class WorkloadStatus(Enum):
    """Status of a running workload"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


class GPUWorkload:
    """Represents a single GPU workload operation"""
    
    def __init__(self, workload_id: str, gpu_id: int, workload_type: WorkloadType, duration: float = 10.0):
        self.workload_id = workload_id
        self.gpu_id = gpu_id
        self.workload_type = workload_type
        self.duration = duration
        self.status = WorkloadStatus.PENDING
        self.start_time = None
        self.end_time = None
        self.error = None
        self.progress = 0.0
        self.iterations_completed = 0
        self.expected_iterations = 100
        self._stop_event = threading.Event()
        self._thread = None
    
    def start(self):
        """Start the workload in a background thread"""
        if self.status != WorkloadStatus.PENDING:
            raise RuntimeError(f"Workload {self.workload_id} already started")
        
        self.status = WorkloadStatus.RUNNING
        self.start_time = datetime.now()
        
        # Run in separate thread to avoid blocking
        self._thread = threading.Thread(target=self._run_workload, daemon=True)
        self._thread.start()
    
    def stop(self):
        """Stop the workload gracefully"""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5.0)
    
    def _run_workload(self):
        """Execute the actual GPU workload"""
        try:
            if self.workload_type == WorkloadType.MEMORY_STRESS:
                self._memory_stress()
            elif self.workload_type == WorkloadType.COMPUTE_INTENSIVE:
                self._compute_intensive()
            elif self.workload_type == WorkloadType.LONG_RUNNING:
                self._long_running()
            elif self.workload_type == WorkloadType.CONTINUOUS:
                self._continuous()
            elif self.workload_type == WorkloadType.MIXED:
                self._mixed()
            else:
                raise ValueError(f"Unknown workload type: {self.workload_type}")
            
            if not self._stop_event.is_set():
                self.status = WorkloadStatus.COMPLETED
                self.end_time = datetime.now()
                logger.info(f"Workload {self.workload_id} completed successfully")
            else:
                self.status = WorkloadStatus.INTERRUPTED
                self.end_time = datetime.now()
                logger.info(f"Workload {self.workload_id} interrupted")
                
        except Exception as e:
            self.status = WorkloadStatus.FAILED
            self.end_time = datetime.now()
            self.error = str(e)
            logger.error(f"Workload {self.workload_id} failed: {e}")
    
    def _memory_stress(self):
        """Allocate and deallocate GPU memory repeatedly"""
        if TORCH_AVAILABLE:
            logger.info(f"Starting memory stress test on GPU {self.gpu_id}")
            device = torch.device(f'cuda:{self.gpu_id}')
            
            iteration = 0
            start = time.time()
            
            while not self._stop_event.is_set() and (time.time() - start) < self.duration:
                try:
                    # Allocate large tensors
                    tensors = []
                    for _ in range(10):
                        if self._stop_event.is_set():
                            break
                        # Allocate ~100MB per tensor
                        tensor = torch.randn(1024, 1024, 25, device=device)
                        tensors.append(tensor)
                    
                    # Do some operations
                    if tensors and not self._stop_event.is_set():
                        result = torch.stack(tensors).sum()
                        _ = result.cpu()  # Force computation
                    
                    # Deallocate
                    del tensors
                    torch.cuda.empty_cache()
                    
                    iteration += 1
                    self.iterations_completed = iteration
                    self.progress = min(100.0, (time.time() - start) / self.duration * 100)
                    
                    time.sleep(0.1)  # Brief pause between iterations
                    
                except RuntimeError as e:
                    if "CUDA" in str(e) or "out of memory" in str(e):
                        raise  # GPU-related errors should propagate
                    logger.warning(f"Non-critical error in memory stress: {e}")
        else:
            # Fallback without GPU
            logger.warning("PyTorch CUDA not available, simulating memory stress")
            time.sleep(self.duration)
            self.iterations_completed = 100
    
    def _compute_intensive(self):
        """Perform compute-intensive matrix operations"""
        if TORCH_AVAILABLE:
            logger.info(f"Starting compute-intensive test on GPU {self.gpu_id}")
            device = torch.device(f'cuda:{self.gpu_id}')
            
            iteration = 0
            start = time.time()
            
            # Create large matrices
            size = 2048
            matrix_a = torch.randn(size, size, device=device)
            matrix_b = torch.randn(size, size, device=device)
            
            while not self._stop_event.is_set() and (time.time() - start) < self.duration:
                try:
                    # Matrix multiplication (compute-heavy)
                    result = torch.matmul(matrix_a, matrix_b)
                    
                    # Additional operations
                    result = torch.nn.functional.relu(result)
                    result = torch.nn.functional.softmax(result, dim=1)
                    
                    # Force synchronization
                    torch.cuda.synchronize(device)
                    
                    iteration += 1
                    self.iterations_completed = iteration
                    self.progress = min(100.0, (time.time() - start) / self.duration * 100)
                    
                except RuntimeError as e:
                    if "CUDA" in str(e):
                        raise
                    logger.warning(f"Non-critical error in compute test: {e}")
            
            del matrix_a, matrix_b
            torch.cuda.empty_cache()
        else:
            logger.warning("PyTorch CUDA not available, simulating compute workload")
            time.sleep(self.duration)
            self.iterations_completed = 100
    
    def _long_running(self):
        """Single long-running operation"""
        if TORCH_AVAILABLE:
            logger.info(f"Starting long-running test on GPU {self.gpu_id}")
            device = torch.device(f'cuda:{self.gpu_id}')
            
            try:
                # Create very large operation that takes time
                size = 4096
                matrix = torch.randn(size, size, device=device)
                
                start = time.time()
                iterations = int(self.duration * 10)  # Adjust based on duration
                
                for i in range(iterations):
                    if self._stop_event.is_set():
                        break
                    
                    # Chain of operations
                    result = torch.matmul(matrix, matrix)
                    result = result + matrix
                    result = torch.nn.functional.relu(result)
                    matrix = result / result.max()
                    
                    torch.cuda.synchronize(device)
                    
                    self.iterations_completed = i + 1
                    self.expected_iterations = iterations
                    self.progress = min(100.0, (i + 1) / iterations * 100)
                
                del matrix, result
                torch.cuda.empty_cache()
                
            except RuntimeError as e:
                if "CUDA" in str(e):
                    raise
                logger.warning(f"Error in long-running test: {e}")
        else:
            logger.warning("PyTorch CUDA not available, simulating long-running workload")
            time.sleep(self.duration)
            self.iterations_completed = 100
    
    def _continuous(self):
        """Continuous background operations"""
        if TORCH_AVAILABLE:
            logger.info(f"Starting continuous test on GPU {self.gpu_id}")
            device = torch.device(f'cuda:{self.gpu_id}')
            
            iteration = 0
            start = time.time()
            
            while not self._stop_event.is_set() and (time.time() - start) < self.duration:
                try:
                    # Rapid small operations
                    tensor = torch.randn(512, 512, device=device)
                    result = tensor @ tensor.T
                    _ = result.sum().item()
                    
                    iteration += 1
                    self.iterations_completed = iteration
                    self.progress = min(100.0, (time.time() - start) / self.duration * 100)
                    
                except RuntimeError as e:
                    if "CUDA" in str(e):
                        raise
                    time.sleep(0.01)
            
            torch.cuda.empty_cache()
        else:
            logger.warning("PyTorch CUDA not available, simulating continuous workload")
            time.sleep(self.duration)
            self.iterations_completed = 100
    
    def _mixed(self):
        """Mixed workload combining memory and compute"""
        if TORCH_AVAILABLE:
            logger.info(f"Starting mixed test on GPU {self.gpu_id}")
            device = torch.device(f'cuda:{self.gpu_id}')
            
            iteration = 0
            start = time.time()
            
            while not self._stop_event.is_set() and (time.time() - start) < self.duration:
                try:
                    # Alternate between memory and compute
                    if iteration % 2 == 0:
                        # Memory operations
                        tensors = [torch.randn(1024, 1024, device=device) for _ in range(5)]
                        _ = torch.stack(tensors).sum()
                        del tensors
                    else:
                        # Compute operations
                        a = torch.randn(1024, 1024, device=device)
                        b = torch.randn(1024, 1024, device=device)
                        c = torch.matmul(a, b)
                        _ = c.sum()
                        del a, b, c
                    
                    torch.cuda.synchronize(device)
                    torch.cuda.empty_cache()
                    
                    iteration += 1
                    self.iterations_completed = iteration
                    self.progress = min(100.0, (time.time() - start) / self.duration * 100)
                    
                    time.sleep(0.1)
                    
                except RuntimeError as e:
                    if "CUDA" in str(e):
                        raise
                    logger.warning(f"Error in mixed workload: {e}")
            
        else:
            logger.warning("PyTorch CUDA not available, simulating mixed workload")
            time.sleep(self.duration)
            self.iterations_completed = 100
    
    def get_status(self) -> Dict:
        """Get current workload status"""
        duration = None
        if self.start_time:
            end = self.end_time or datetime.now()
            duration = (end - self.start_time).total_seconds()
        
        return {
            'workload_id': self.workload_id,
            'gpu_id': self.gpu_id,
            'type': self.workload_type.value,
            'status': self.status.value,
            'progress': self.progress,
            'iterations_completed': self.iterations_completed,
            'expected_iterations': self.expected_iterations,
            'duration_seconds': duration,
            'error': self.error,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None
        }


class GPUWorkloadManager:
    """Manages multiple GPU workloads"""
    
    def __init__(self):
        self.workloads: Dict[str, GPUWorkload] = {}
        self.workload_counter = 0
    
    def create_workload(
        self, 
        gpu_id: int, 
        workload_type: WorkloadType = WorkloadType.COMPUTE_INTENSIVE,
        duration: float = 10.0
    ) -> str:
        """Create a new workload"""
        self.workload_counter += 1
        workload_id = f"workload_{self.workload_counter}_{int(time.time())}"
        
        workload = GPUWorkload(workload_id, gpu_id, workload_type, duration)
        self.workloads[workload_id] = workload
        
        logger.info(f"Created workload {workload_id} for GPU {gpu_id}: {workload_type.value}")
        return workload_id
    
    def start_workload(self, workload_id: str):
        """Start a pending workload"""
        if workload_id not in self.workloads:
            raise ValueError(f"Workload {workload_id} not found")
        
        workload = self.workloads[workload_id]
        workload.start()
        logger.info(f"Started workload {workload_id}")
    
    def stop_workload(self, workload_id: str):
        """Stop a running workload"""
        if workload_id not in self.workloads:
            raise ValueError(f"Workload {workload_id} not found")
        
        workload = self.workloads[workload_id]
        workload.stop()
        logger.info(f"Stopped workload {workload_id}")
    
    def get_workload_status(self, workload_id: str) -> Dict:
        """Get status of a specific workload"""
        if workload_id not in self.workloads:
            raise ValueError(f"Workload {workload_id} not found")
        
        return self.workloads[workload_id].get_status()
    
    def get_all_workloads(self) -> List[Dict]:
        """Get status of all workloads"""
        return [w.get_status() for w in self.workloads.values()]
    
    def get_active_workloads(self) -> List[Dict]:
        """Get status of currently running workloads"""
        return [
            w.get_status() 
            for w in self.workloads.values() 
            if w.status == WorkloadStatus.RUNNING
        ]
    
    def cleanup_completed(self):
        """Remove completed/failed workloads older than 5 minutes"""
        cutoff = time.time() - 300  # 5 minutes ago
        to_remove = []
        
        for wid, workload in self.workloads.items():
            if workload.status in [WorkloadStatus.COMPLETED, WorkloadStatus.FAILED, WorkloadStatus.INTERRUPTED]:
                if workload.end_time:
                    end_timestamp = workload.end_time.timestamp()
                    if end_timestamp < cutoff:
                        to_remove.append(wid)
        
        for wid in to_remove:
            del self.workloads[wid]
        
        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} old workloads")
    
    def stop_all(self):
        """Stop all running workloads"""
        for workload in self.workloads.values():
            if workload.status == WorkloadStatus.RUNNING:
                workload.stop()
        
        logger.info("Stopped all workloads")


# Global workload manager instance
workload_manager = GPUWorkloadManager()
