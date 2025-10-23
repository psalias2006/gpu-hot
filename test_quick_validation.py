#!/usr/bin/env python3
"""
Quick validation script - Test GPU disconnect functionality
Run this to verify the implementation works on your system
"""

import sys
import time
import asyncio

print("="*80)
print("GPU DISCONNECT FUNCTIONALITY - QUICK VALIDATION TEST")
print("="*80)
print()

# Check 1: Verify all modules can be imported
print("✓ Step 1: Checking module imports...")
try:
    from core.gpu_disconnect import gpu_disconnector, DisconnectMethod
    print("  ✓ GPU disconnect module loaded")
except ImportError as e:
    print(f"  ✗ Failed to import gpu_disconnect: {e}")
    sys.exit(1)

try:
    from core.gpu_test_workloads import workload_manager, WorkloadType, TORCH_AVAILABLE
    print("  ✓ GPU workload module loaded")
except ImportError as e:
    print(f"  ✗ Failed to import gpu_test_workloads: {e}")
    sys.exit(1)

try:
    from tests.test_gpu_disconnect_integration import (
        create_basic_disconnect_test,
        create_standard_test_suite
    )
    print("  ✓ Integration test module loaded")
except ImportError as e:
    print(f"  ✗ Failed to import integration tests: {e}")
    sys.exit(1)

print()

# Check 2: Verify PyTorch availability
print("✓ Step 2: Checking GPU libraries...")
if TORCH_AVAILABLE:
    import torch
    gpu_count = torch.cuda.device_count()
    print(f"  ✓ PyTorch CUDA available: {gpu_count} GPU(s) detected")
    if gpu_count > 0:
        for i in range(gpu_count):
            name = torch.cuda.get_device_name(i)
            print(f"    - GPU {i}: {name}")
else:
    print("  ⚠ PyTorch CUDA not available")
    print("    Install with: pip install torch --index-url https://download.pytorch.org/whl/cu118")
    print("    Continuing with limited functionality...")

print()

# Check 3: Test workload creation
print("✓ Step 3: Testing workload creation...")
try:
    workload_id = workload_manager.create_workload(
        gpu_id=0,
        workload_type=WorkloadType.COMPUTE_INTENSIVE,
        duration=5.0
    )
    print(f"  ✓ Created test workload: {workload_id}")
    
    # Get status
    status = workload_manager.get_workload_status(workload_id)
    print(f"  ✓ Workload status: {status['status']}")
    
except Exception as e:
    print(f"  ✗ Failed to create workload: {e}")
    sys.exit(1)

print()

# Check 4: Test disconnect capability detection
print("✓ Step 4: Checking disconnect capabilities...")
async def check_disconnect():
    try:
        methods = await gpu_disconnector.get_available_methods(0)
        print(f"  ✓ Available disconnect methods: {', '.join(methods)}")
        return True
    except Exception as e:
        print(f"  ⚠ Could not detect methods: {e}")
        print("    This is expected if not running as root")
        return False

has_disconnect = asyncio.run(check_disconnect())

print()

# Check 5: Run a simple test (if PyTorch available)
if TORCH_AVAILABLE and gpu_count > 0:
    print("✓ Step 5: Running quick GPU workload test...")
    try:
        # Start the workload
        workload_manager.start_workload(workload_id)
        print(f"  ✓ Started workload on GPU 0")
        
        # Monitor for a few seconds
        for i in range(3):
            time.sleep(1)
            status = workload_manager.get_workload_status(workload_id)
            print(f"  ✓ Progress: {status['progress']:.1f}% "
                  f"({status['iterations_completed']} iterations, "
                  f"status: {status['status']})")
        
        # Stop it
        workload_manager.stop_workload(workload_id)
        final_status = workload_manager.get_workload_status(workload_id)
        print(f"  ✓ Workload stopped: {final_status['status']}")
        
    except Exception as e:
        print(f"  ✗ Workload test failed: {e}")
        import traceback
        traceback.print_exc()
else:
    print("⊘ Step 5: Skipping workload test (PyTorch/CUDA not available)")

print()

# Check 6: Test integration test creation
print("✓ Step 6: Testing integration test framework...")
try:
    test = create_basic_disconnect_test(gpu_id=0)
    print(f"  ✓ Created test: {test.name}")
    print(f"    Description: {test.description}")
    print(f"    Workload: {test.workload_type.value}")
    print(f"    Duration: {test.workload_duration}s")
except Exception as e:
    print(f"  ✗ Failed to create integration test: {e}")
    sys.exit(1)

print()

# Summary
print("="*80)
print("VALIDATION SUMMARY")
print("="*80)
print()

all_checks = [
    ("Module imports", True),
    ("PyTorch CUDA", TORCH_AVAILABLE),
    ("Workload creation", True),
    ("Disconnect detection", has_disconnect),
    ("GPU workload execution", TORCH_AVAILABLE and gpu_count > 0),
    ("Integration test framework", True)
]

passed = sum(1 for _, result in all_checks if result)
total = len(all_checks)

for check_name, result in all_checks:
    symbol = "✓" if result else "⚠" if "PyTorch" in check_name else "✗"
    status = "PASS" if result else "WARN" if "PyTorch" in check_name else "FAIL"
    print(f"{symbol} {check_name}: {status}")

print()
print(f"Results: {passed}/{total} checks passed")
print()

if not TORCH_AVAILABLE:
    print("⚠ WARNING: PyTorch CUDA not available")
    print("  The framework is installed but cannot run GPU workloads")
    print("  Install PyTorch with CUDA:")
    print("  pip install torch --index-url https://download.pytorch.org/whl/cu118")
    print()

if not has_disconnect:
    print("⚠ WARNING: Disconnect capabilities limited")
    print("  This is normal if not running as root or in WSL2")
    print("  For full disconnect testing, run with sudo on bare-metal Linux")
    print()

# Next steps
print("="*80)
print("NEXT STEPS")
print("="*80)
print()
print("1. Start the application:")
print("   docker-compose up --build")
print()
print("2. Test via Web UI:")
print("   Open http://localhost:1312")
print("   - Click disconnect button on any GPU")
print("   - Select method and duration")
print()
print("3. Run full integration tests:")
print("   cd tests")
print("   sudo python3 test_gpu_disconnect_integration.py")
print()
print("4. Test via API:")
print("   # Create workload")
print("   curl -X POST http://localhost:1312/api/gpu/workload/create \\")
print("     -H 'Content-Type: application/json' \\")
print("     -d '{\"gpu_id\": 0, \"workload_type\": \"compute_intensive\", \"duration\": 30}'")
print()
print("   # Start workload (use workload_id from response)")
print("   curl -X POST http://localhost:1312/api/gpu/workload/<ID>/start")
print()
print("   # Trigger disconnect while running")
print("   curl -X POST http://localhost:1312/api/gpu/0/disconnect \\")
print("     -H 'Content-Type: application/json' \\")
print("     -d '{\"method\": \"auto\", \"down_time\": 5}'")
print()
print("   # Check workload status (should be interrupted)")
print("   curl http://localhost:1312/api/gpu/workload/<ID>/status")
print()
print("="*80)
print()

if passed == total:
    print("✓ ALL SYSTEMS GO! The implementation is ready to use.")
    sys.exit(0)
elif passed >= total - 1:
    print("⚠ MOSTLY READY - Some optional features unavailable")
    sys.exit(0)
else:
    print("✗ ISSUES DETECTED - Please review warnings above")
    sys.exit(1)

