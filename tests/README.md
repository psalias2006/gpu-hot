# GPU Hot - Load Testing (FastAPI + AsyncIO)

Simple load testing for multi-node GPU monitoring with realistic async patterns.

## Quick Start

```bash
cd tests
docker-compose -f docker-compose.test.yml up
```

Open http://localhost:1312 to see the dashboard.

## Architecture

- **FastAPI + AsyncIO**: Modern async Python for better performance
- **Native WebSockets**: No Socket.IO overhead, direct WebSocket protocol
- **Concurrent Mock Nodes**: Multiple nodes running in parallel
- **Realistic GPU Patterns**: Training jobs with epochs, warmup, validation

## Load Test Presets

Edit `docker-compose.test.yml` and uncomment the preset you want:

### LIGHT (3 nodes, 14 GPUs)
Good for development and quick testing.
```yaml
- NODES=2,4,8
- NODE_URLS=http://mock-cluster:13120,http://mock-cluster:13121,http://mock-cluster:13122
```

### MEDIUM (8 nodes, 64 GPUs) ⭐ Default
Realistic medium-sized cluster.
```yaml
- NODES=8,8,8,8,8,8,8,8
- NODE_URLS=http://mock-cluster:13120,...,http://mock-cluster:13127
```

### HEAVY (20 nodes, 160 GPUs)
Stress test for large production environments.
```yaml
- NODES=8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8
- NODE_URLS=http://mock-cluster:13120,...,http://mock-cluster:13139
```

## What's Simulated

- **Realistic GPU patterns**: Training jobs with epochs, warmup, validation
- **Idle + busy GPUs**: ~40% utilization typical of real clusters
- **Stable memory**: Memory allocated at job start, stays constant
- **Clock speeds**: Proper P-states (P0/P2/P8)
- **Data loading dips**: Periodic utilization drops
- **Temperature correlation**: Realistic thermal behavior

## Files

- `test_cluster.py` - Mock GPU node with realistic patterns (FastAPI + AsyncIO)
- `docker-compose.test.yml` - Test stack with preset configurations
- `Dockerfile.test` - Container for mock nodes (FastAPI dependencies)

## Performance Benefits

- **20-40% latency reduction** with true async/await
- **2-3x more concurrent connections** supported
- **Better resource utilization** for hub mode aggregation
- **Sub-500ms latency** consistently achieved

## Rebuild After Changes

```bash
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up --build
```
