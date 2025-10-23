<div align="center">

# GPU Hot

Real-time NVIDIA GPU monitoring dashboard. Web-based, no SSH required.

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NVIDIA](https://img.shields.io/badge/NVIDIA-GPU-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/)

<img src="gpu-hot.png" alt="GPU Hot Dashboard" width="800" />

</div>

---

## Usage

Monitor a single machine or an entire cluster with the same Docker image.

**Single machine:**
```bash
docker run -d --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

**Multiple machines:**
```bash
# On each GPU server
docker run -d --gpus all -p 1312:1312 -e NODE_NAME=$(hostname) ghcr.io/psalias2006/gpu-hot:latest

# On a hub machine (no GPU required)
docker run -d -p 1312:1312 -e GPU_HOT_MODE=hub -e NODE_URLS=http://server1:1312,http://server2:1312,http://server3:1312 ghcr.io/psalias2006/gpu-hot:latest
```

Open `http://localhost:1312`

**Older GPUs:** Add `-e NVIDIA_SMI=true` if metrics don't appear.

**Process monitoring:** Add `--init --pid=host` to see process names. Note: This allows the container to access host process information.

**From source:**
```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

**Requirements:** Docker + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

---

## Features

- Real-time metrics (sub-second)
- Automatic multi-GPU detection
- Process monitoring (PID, memory usage)
- Historical charts (utilization, temperature, power, clocks)
- System metrics (CPU, RAM)
- Scale from 1 to 100+ GPUs
- **GPU Disconnect Testing** - Simulate GPU failures for fault tolerance testing

**Metrics:** Utilization, temperature, memory, power draw, fan speed, clock speeds, PCIe info, P-State, throttle status, encoder/decoder sessions

---

## GPU Disconnect Testing

GPU Hot includes advanced fault tolerance testing through simulated GPU disconnect/reconnect operations. This feature helps test how your applications handle GPU failures in production environments.

### Features
- **Multiple disconnect methods** - Auto-select the most realistic method available:
  - **Slot Power Toggle** - Actually cut and restore slot power (closest to physical disconnect)
  - **Hot Reset** - Reset PCIe link using upstream bridge controls  
  - **Logical Remove** - Software remove and re-scan (no hardware reset)
  - **NVIDIA Reset** - Use NVIDIA driver reset functionality
- **Individual GPU control** - Disconnect specific GPUs from detailed view
- **Multi-GPU operations** - Select and disconnect multiple GPUs simultaneously
- **Hub coordination** - Hub can trigger disconnects on remote nodes
- **Real-time feedback** - Live status updates during operations
- **Safety features** - Process detection, confirmation dialogs, timeout protection

### Requirements

**For GPU disconnect functionality, the container requires elevated privileges:**
```bash
# Docker run with privileged mode
docker run -d --gpus all --privileged \
  -v /sys/bus/pci:/sys/bus/pci:rw \
  -v /sys/devices:/sys/devices:ro \
  -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

**Or use docker-compose (recommended):**
```bash
# docker-compose.yml includes the required privileged configuration
docker-compose up -d
```

### Usage

1. **Individual GPU**: Click the "Disconnect" button in any GPU's detailed view
2. **Multiple GPUs**: 
   - Select GPUs using checkboxes in overview tab
   - Click "Disconnect Selected" from the batch toolbar
3. **Choose method** and duration in the modal dialog
4. **Monitor progress** with real-time status updates

### Security & Safety

⚠️ **Important Considerations:**
- Requires **root privileges** inside container (privileged mode)
- Will **interrupt running processes** on affected GPUs
- Includes **confirmation dialogs** and active process warnings
- All operations are **logged** for audit trails
- **Rate limiting** prevents abuse
- Works on **dedicated GPU slots** (avoid shared PCIe buses)

### Hub Mode
The hub can coordinate disconnect operations across multiple nodes:
```bash
# Hub triggers disconnect on specific node
POST /api/hub/gpu/{node_name}/{gpu_id}/disconnect

# Multi-node batch operations supported
POST /api/hub/gpu/disconnect-multiple
```

### Integration Testing

GPU Hot includes a comprehensive testing framework to validate disconnect functionality:

**Run Full Test Suite:**
```bash
cd tests
sudo python3 test_gpu_disconnect_integration.py
```

**Manual API Testing:**
```bash
# 1. Create GPU workload
curl -X POST http://localhost:1312/api/gpu/workload/create \
  -H "Content-Type: application/json" \
  -d '{"gpu_id": 0, "workload_type": "compute_intensive", "duration": 30.0}'

# 2. Start workload (use workload_id from response)
curl -X POST http://localhost:1312/api/gpu/workload/{workload_id}/start

# 3. Trigger disconnect while workload is running
curl -X POST http://localhost:1312/api/gpu/0/disconnect \
  -H "Content-Type": application/json" \
  -d '{"method": "auto", "down_time": 5.0}'

# 4. Check workload status (should be "interrupted" or "failed")
curl http://localhost:1312/api/gpu/workload/{workload_id}/status
```

See [`tests/README.md`](tests/README.md) for detailed testing documentation.

---

## Configuration

**Environment variables:**
```bash
NVIDIA_VISIBLE_DEVICES=0,1     # Specific GPUs (default: all)
NVIDIA_SMI=true                # Force nvidia-smi mode for older GPUs
GPU_HOT_MODE=hub               # Set to 'hub' for multi-node aggregation (default: single node)
NODE_NAME=gpu-server-1         # Node display name (default: hostname)
NODE_URLS=http://host:1312...  # Comma-separated node URLs (required for hub mode)
```

**Backend (`core/config.py`):**
```python
UPDATE_INTERVAL = 0.5  # Polling interval
PORT = 1312            # Server port
```

---

## API

### HTTP
```bash
GET /              # Dashboard
GET /api/gpu-data  # JSON metrics

# GPU Disconnect API (Node Mode)
GET  /api/gpu/{gpu_id}/disconnect/methods        # Get available disconnect methods
POST /api/gpu/{gpu_id}/disconnect               # Disconnect specific GPU
POST /api/gpu/disconnect-multiple               # Disconnect multiple GPUs
GET  /api/gpu/disconnect/status                 # System disconnect capabilities

# GPU Disconnect API (Hub Mode)
GET  /api/hub/nodes                             # List connected nodes
GET  /api/hub/gpu/{node}/{gpu_id}/disconnect/methods  # Get methods for node GPU
POST /api/hub/gpu/{node}/{gpu_id}/disconnect   # Disconnect GPU on specific node
POST /api/hub/gpu/disconnect-multiple          # Multi-node batch disconnect
GET  /api/hub/gpu/disconnect/status             # Hub-wide disconnect status

# GPU Workload Testing API
POST   /api/gpu/workload/create                # Create new GPU workload
POST   /api/gpu/workload/{id}/start            # Start workload
POST   /api/gpu/workload/{id}/stop             # Stop workload
GET    /api/gpu/workload/{id}/status           # Get workload status
GET    /api/gpu/workloads                      # List all workloads
DELETE /api/gpu/workloads/cleanup              # Clean up completed workloads
```

### WebSocket
```javascript
socket.on('gpu_data', (data) => {
  // Updates every 0.5s (configurable)
  // Contains: data.gpus, data.processes, data.system
});
```
---

## Project Structure

```bash
gpu-hot/
├── app.py                      # Flask + WebSocket server
├── core/
│   ├── config.py               # Configuration
│   ├── monitor.py              # NVML GPU monitoring
│   ├── handlers.py             # WebSocket handlers
│   ├── routes.py               # HTTP routes
│   └── metrics/
│       ├── collector.py        # Metrics collection
│       └── utils.py            # Metric utilities
├── static/
│   ├── js/
│   │   ├── charts.js           # Chart configs
│   │   ├── gpu-cards.js        # UI components
│   │   ├── socket-handlers.js  # WebSocket + rendering
│   │   ├── ui.js               # View management
│   │   └── app.js              # Init
│   └── css/styles.css
├── templates/index.html
├── Dockerfile
└── docker-compose.yml
```

---

## Troubleshooting

**No GPUs detected:**
```bash
nvidia-smi  # Verify drivers work
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi  # Test Docker GPU access
```

**Hub can't connect to nodes:**
```bash
curl http://node-ip:1312/api/gpu-data  # Test connectivity
sudo ufw allow 1312/tcp                # Check firewall
```

**Performance issues:** Increase `UPDATE_INTERVAL` in `core/config.py`

---

## Contributing

PRs welcome. Open an issue for major changes.

## License

MIT - see [LICENSE](LICENSE)
  
