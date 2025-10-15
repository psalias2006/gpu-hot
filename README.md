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

**Start with one machine:**
```bash
docker run -d --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

**Scale to multiple servers by adding two flags:**
```bash
# On each GPU server (same command everywhere)
docker run -d --gpus all -p 1312:1312 -e GPU_HOT_MODE=agent -e NODE_NAME=$(hostname) ghcr.io/psalias2006/gpu-hot:latest

# On a hub machine (no GPU required)
docker run -d -p 1312:1312 -e GPU_HOT_MODE=hub -e AGENT_URLS=http://server1:1312,http://server2:1312,http://server3:1312 ghcr.io/psalias2006/gpu-hot:latest
```

Open `http://localhost:1312`

**Older GPUs:** Add `-e NVIDIA_SMI=true` if metrics don't appear.

**From source:**
```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

**Requirements:** Docker + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

---

## Features

- Real-time updates via WebSocket (sub-second)
- Multi-GPU support with automatic detection
- Process monitoring (PID, memory usage)
- Historical charts (utilization, temperature, power, clocks)
- System metrics (CPU, RAM)
- **Scale from 1 to 100+ GPUs** with the same Docker image

**Metrics:** Utilization, temperature, memory, power draw, fan speed, clock speeds, PCIe info, P-State, throttle status, encoder/decoder sessions

---

## Configuration

**Environment variables:**
```bash
NVIDIA_VISIBLE_DEVICES=0,1    # Specific GPUs (default: all)
NVIDIA_SMI=true                # Force nvidia-smi mode
GPU_HOT_MODE=standalone        # standalone (default), agent, hub
NODE_NAME=gpu-server-1         # Node display name in cluster view
AGENT_URLS=http://host:1312... # Comma-separated agent URLs for hub
```

**Backend (`core/config.py`):**
```python
UPDATE_INTERVAL = 0.5    # Polling interval
PORT = 1312              # Server port
```

---

## API

### HTTP
```bash
GET /              # Dashboard
GET /api/gpu-data  # JSON metrics
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

```
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

**Cluster agents offline:**
```bash
curl http://agent-ip:1312/api/gpu-data  # Test connectivity
sudo ufw allow 1312/tcp  # Check firewall
```

**Performance issues:** Increase `UPDATE_INTERVAL` in `core/config.py`

---

## Contributing

PRs welcome. Open an issue for major changes.

## License

MIT - see [LICENSE](LICENSE)
  
