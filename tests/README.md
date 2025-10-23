# GPU Disconnect Integration Tests

This directory contains comprehensive integration tests for GPU disconnect functionality.

## Quick Start

### Run Full Test Suite
```bash
cd tests
python3 test_gpu_disconnect_integration.py
```

This will run a complete suite of disconnect tests including:
- Basic disconnect during compute workload
- Memory stress test with disconnect
- Immediate disconnect after workload start  
- Continuous workload disconnect

## Requirements

### System Requirements
- **Linux** with PCI sysfs (`/sys/bus/pci/devices`)
- **Root privileges** (for actual GPU disconnect)
- **NVIDIA GPU** with drivers installed
- **PyTorch with CUDA** support

### Python Dependencies
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

Or use the Docker container which includes all dependencies.

## Test Components

### 1. GPU Workload Generator (`core/gpu_test_workloads.py`)
Generates various GPU workloads for testing:

**Workload Types:**
- `MEMORY_STRESS` - Rapid memory allocation/deallocation
- `COMPUTE_INTENSIVE` - Matrix multiplications and heavy compute
- `LONG_RUNNING` - Single long operation with many iterations
- `CONTINUOUS` - Rapid small operations in tight loop
- `MIXED` - Combination of memory and compute operations

### 2. Integration Test Framework (`test_gpu_disconnect_integration.py`)
Orchestrates complete test scenarios:

**Test Phases:**
1. **Start Workload** - Begin GPU operation
2. **Monitor** - Track workload progress
3. **Disconnect** - Trigger GPU disconnect
4. **Validate** - Verify expected behavior

**Expected Results:**
- Workload interrupted or fails during disconnect
- CUDA errors captured appropriately
- GPU unavailable during disconnect period
- GPU recovers after reconnect

### 3. Pre-configured Test Scenarios
Ready-to-use test configurations:

```python
from tests.test_gpu_disconnect_integration import (
    create_basic_disconnect_test,
    create_memory_stress_disconnect_test,
    create_immediate_disconnect_test,
    create_continuous_workload_test,
    create_standard_test_suite
)

# Run single test
test = create_basic_disconnect_test(gpu_id=0)
result = await test.run()

# Run full suite
suite = create_standard_test_suite(gpu_id=0)
results = await suite.run_all()
```

## Manual Testing with API

You can also test via the REST API when the application is running:

### 1. Create and Start Workload
```bash
# Create workload
curl -X POST http://localhost:1312/api/gpu/workload/create \
  -H "Content-Type: application/json" \
  -d '{"gpu_id": 0, "workload_type": "compute_intensive", "duration": 30.0}'

# Response includes workload_id
# {"workload_id": "workload_1_1234567890", ...}

# Start the workload
curl -X POST http://localhost:1312/api/gpu/workload/workload_1_1234567890/start
```

### 2. Monitor Workload
```bash
# Check workload status
curl http://localhost:1312/api/gpu/workload/workload_1_1234567890/status

# List all workloads
curl http://localhost:1312/api/gpu/workloads
```

### 3. Trigger Disconnect During Workload
```bash
# While workload is running, trigger disconnect
curl -X POST http://localhost:1312/api/gpu/0/disconnect \
  -H "Content-Type: application/json" \
  -d '{"method": "auto", "down_time": 5.0}'
```

### 4. Check Results
```bash
# Check final workload status
curl http://localhost:1312/api/gpu/workload/workload_1_1234567890/status

# Expected: status should be "interrupted" or "failed"
```

## Test Validation Criteria

### Successful Disconnect Test:
✅ Workload starts successfully  
✅ Disconnect operation completes  
✅ Workload is interrupted/fails during disconnect  
✅ GPU becomes unavailable (nvidia-smi shows error)  
✅ GPU recovers after reconnect  
✅ New operations can be scheduled after recovery  

### Expected Behaviors:

**During Disconnect:**
- Running CUDA operations fail with errors
- New operations cannot be scheduled
- `nvidia-smi` reports GPU unavailable
- Workload status changes to `interrupted` or `failed`

**After Reconnect:**
- GPU reappears in system
- New workloads can be created
- Operations complete successfully
- No memory leaks or resource issues

## Troubleshooting

### "PyTorch CUDA not available"
Install PyTorch with CUDA support:
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

### "Permission denied" during disconnect
Tests require root privileges for actual GPU disconnect:
```bash
sudo python3 test_gpu_disconnect_integration.py
```

### "Workload completed despite disconnect"
This indicates the disconnect didn't actually affect the GPU. Possible causes:
- Insufficient privileges (need root)
- WSL2 limitations (use bare metal Linux)
- Disconnect method not supported on platform

### Tests pass but you want to verify manually
Check system logs during test:
```bash
# Terminal 1: Run tests
sudo python3 test_gpu_disconnect_integration.py

# Terminal 2: Watch GPU status
watch -n 0.5 nvidia-smi

# Terminal 3: Monitor kernel messages
sudo dmesg -w | grep -i gpu
```

## Advanced Usage

### Custom Test Scenario
```python
from tests.test_gpu_disconnect_integration import DisconnectTestScenario
from core.gpu_test_workloads import WorkloadType

# Create custom test
test = DisconnectTestScenario(
    test_id="custom_test_1",
    name="Custom Stress Test",
    description="My custom disconnect scenario",
    gpu_id=0,
    workload_type=WorkloadType.MEMORY_STRESS,
    workload_duration=60.0,      # 60 second workload
    disconnect_delay=10.0,        # Disconnect after 10s
    disconnect_method="logical",  # Force logical method
    disconnect_duration=15.0      # Keep disconnected for 15s
)

result = await test.run()
print(result)
```

### Multi-GPU Testing
```python
# Test on different GPUs
suite = DisconnectTestSuite("Multi-GPU Tests")

for gpu_id in [0, 1, 2, 3]:
    test = create_basic_disconnect_test(gpu_id=gpu_id)
    suite.add_test(test)

results = await suite.run_all()
```

## CI/CD Integration

For automated testing in CI/CD pipelines:

```bash
# Run tests with JSON output
python3 test_gpu_disconnect_integration.py --json > results.json

# Check exit code
if [ $? -eq 0 ]; then
    echo "All tests passed"
else
    echo "Tests failed"
    exit 1
fi
```

## WSL2 / Limited Environments

In WSL2 or environments without full PCI access, tests will:
- Execute workloads successfully ✅
- Attempt disconnect operations ✅
- Report permission errors (expected) ⚠️
- Still validate UI/API functionality ✅

This allows partial validation even without hardware disconnect capability.