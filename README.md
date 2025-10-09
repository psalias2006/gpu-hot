<div align="center">

# GPU Hot
### Real-Time NVIDIA GPU Monitoring Dashboard

Single-container web dashboard for NVIDIA GPU monitoring with real-time charts.

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NVIDIA](https://img.shields.io/badge/NVIDIA-GPU-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/)

<img src="gpu-hot.png" alt="GPU Hot Dashboard" width="800" />

</div>

## Overview

Self-contained dashboard for monitoring NVIDIA GPUs on remote servers. Access utilization and health metrics from a browser without SSH.

Runs in a single container on one port. No configuration required - start the container and open a browser.

---

## Quick Start

### Using Pre-built Docker Image (Recommended)

```bash
docker run -d --name gpu-hot --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

Open `http://localhost:1312`

### Building from Source

```bash
docker-compose up --build
```

Open `http://localhost:1312`

**Requirements:** Docker, NVIDIA Container Toolkit ([install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html))

---

## Why Not Just Use...

**nvidia-smi CLI:**
- Requires SSH access
- No historical data or charts
- Manual refresh only
- Hard to compare multiple GPUs

**prometheus/grafana:**
- Complex setup (exporters, databases, dashboard configs)
- Overkill for simple monitoring needs
- Higher resource usage

This is the middle ground: web interface with charts, zero configuration.

---

## Features

**7 Charts per GPU:**
- Utilization, Temperature, Memory, Power Draw
- Fan Speed, Clock Speeds (graphics/SM/memory), Power Efficiency

**Monitoring:**
- Automatic multi-GPU detection
- GPU process tracking (PID, memory usage)
- System CPU/RAM monitoring
- Threshold indicators (temp: 75°C/85°C, util: 80%, memory: 90%)

**Metrics Collected:**

<details>
<summary>Core Metrics</summary>

- GPU & Memory Utilization (%)
- Temperature - GPU core & memory (°C)
- Memory - used/free/total (MB)
- Power - draw & limits (W)
- Fan Speed (%)
- Clock Speeds - graphics, SM, memory, video (MHz)
</details>

<details>
<summary>Advanced Metrics</summary>

- PCIe Generation & Lane Width (current/max)
- Performance State (P-State)
- Compute Mode
- Encoder/Decoder sessions & statistics
- Driver & VBIOS versions
- Throttle status
</details>

---

## Installation

### Pre-built Image (Easiest)

```bash
docker run -d --name gpu-hot --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

### Build from Source

```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

### Local Development

```bash
pip install -r requirements.txt
python app.py
```

### Verify GPU Access

```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

If this fails, install NVIDIA Container Toolkit first.

---

## Configuration

None required. Optional customization:

**Environment Variables:**
```bash
NVIDIA_VISIBLE_DEVICES=0,1    # Specific GPUs (default: all)
```

**Application (`app.py`):**
```python
eventlet.sleep(2)              # Update interval (seconds)
socketio.run(app, port=1312)   # Port
```

**Charts (`static/js/charts.js`):**
```javascript
if (data.labels.length > 30)   // History length (data points)
```

---

## API

### HTTP
```bash
GET /                    # Dashboard UI
GET /api/gpu-data        # JSON metrics
```

### WebSocket
```javascript
socket.on('gpu_data', (data) => {
  // Real-time updates every 2s
  // data.gpus, data.processes, data.system
});
```

---

## Extending

### Add New Metric

**1. Backend (`app.py`):**
```python
def parse_nvidia_smi(self):
    result = subprocess.run([
        'nvidia-smi',
        '--query-gpu=index,name,your.new.metric',
        '--format=csv,noheader,nounits'
    ], ...)
```

**2. Frontend (`static/js/gpu-cards.js`):**
```javascript
// Add to createGPUCard() template
<div class="metric-value" id="new-metric-${gpuId}">
    ${gpuInfo.new_metric}
</div>
```

**3. Chart (optional `static/js/charts.js`):**
```javascript
chartConfigs.newMetric = {
    type: 'line',
    data: { ... },
    options: { ... }
};
```

---

## Project Structure

```
gpu-hot/
├── app.py                      # Flask + WebSocket server
├── static/js/
│   ├── charts.js               # Chart configuration
│   ├── gpu-cards.js            # UI rendering
│   ├── socket-handlers.js      # WebSocket events
│   ├── ui.js                   # View switching
│   └── app.js                  # Bootstrap
├── templates/index.html        # Dashboard
├── Dockerfile                  # nvidia/cuda:12.1-devel-ubuntu22.04
└── docker-compose.yml
```

---

## Troubleshooting

**GPU not detected:**
```bash
# Verify drivers
nvidia-smi

# Test Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# Restart Docker daemon
sudo systemctl restart docker
```

**Debug logging:**
```python
# app.py
socketio.run(app, debug=True)
```

---

## Contributing

Pull requests welcome. For major changes, open an issue first.

```bash
git checkout -b feature/NewFeature
git commit -m 'Add NewFeature'
git push origin feature/NewFeature
```

## License

MIT - see [LICENSE](LICENSE)

---

<div align="center">

[Report Bug](https://github.com/psalias2006/gpu-hot/issues) • [Request Feature](https://github.com/psalias2006/gpu-hot/issues)

</div>
