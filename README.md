<div align="center">

# GPU Hot
### **Real-time NVIDIA GPU Monitoring Dashboard**

Monitor NVIDIA GPUs from any browser. No SSH, no configuration – just start and view in real-time.

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NVIDIA](https://img.shields.io/badge/NVIDIA-GPU-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/)

<img src="gpu-hot.png" alt="GPU Hot Dashboard" width="800" />

</div>


## Quick Start

### Docker (recommended)

```bash
docker run -d --name gpu-hot --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

Open `http://localhost:1312`

### From source

```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

### Local dev

```bash
pip install -r requirements.txt
python app.py
```

**Requirements:** Docker + NVIDIA Container Toolkit ([install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html))

---

## Features

**Sub-Second Updates:**
- **Lightning-fast refresh rates**
- Historical data tracking
- WebSocket real-time streaming

**Charts:**
- Utilization, Temperature, Memory, Power
- Fan Speed, Clock Speeds, Power Efficiency

**Monitoring:**
- Multi-GPU detection
- Process tracking (PID, memory usage)
- System CPU/RAM
- WebSocket real-time updates

**Metrics:**
- GPU & Memory Utilization (%)
- Temperature (GPU core, memory)
- Memory (used/free/total)
- Power draw & limits
- Fan Speed (%)
- Clock Speeds (graphics, SM, memory, video)
- PCIe Gen & width
- Performance State (P-State)
- Compute Mode
- Encoder/Decoder sessions
- Throttle status

---

## Configuration

Optional. Edit `core/config.py`:

```python
UPDATE_INTERVAL = 0.5    # Sampling interval (seconds)
PORT = 1312              # Web server port
DEBUG = False
```

Environment variables:
```bash
NVIDIA_VISIBLE_DEVICES=0,1    # Specific GPUs (default: all)
```

**nvidia-smi Fallback:**
- Automatically detects GPUs that don't support NVML utilization metrics
- Falls back to nvidia-smi for those GPUs
- Compatible with older GPUs (Quadro P1000, Tesla, etc.)
- Set `NVIDIA_SMI = True` to force nvidia-smi for all GPUs (testing)

Frontend tuning in `static/js/socket-handlers.js`:
```javascript
DOM_UPDATE_INTERVAL = 1000       // Text updates frequency (ms)
SCROLL_PAUSE_DURATION = 100      // Scroll optimization (ms)
```

Chart history in `static/js/charts.js`:
```javascript
if (data.labels.length > 120)    // Data points to keep
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
  // Updates every 0.5s
  // data.gpus, data.processes, data.system
});
```

---

## Extending

Add new metrics:

**Backend (`core/metrics/collector.py`):**
```python
# Add NVML query
value = pynvml.nvmlDeviceGetYourMetric(handle)
gpu_data['your_metric'] = value
```

**Frontend (`static/js/gpu-cards.js`):**
```javascript
// Add to card template
<div class="metric-value" id="your-metric-${gpuId}">
    ${gpuInfo.your_metric}
</div>

// Add to update function
if (yourMetricEl) yourMetricEl.textContent = gpuInfo.your_metric;
```

**Chart (optional):**
```javascript
// static/js/charts.js
chartConfigs.yourMetric = { type: 'line', ... };
```

---

## Project Structure

```
gpu-hot/
├── app.py                    # Flask + WebSocket server
├── core/
│   ├── config.py             # Configuration
│   ├── monitor.py            # NVML GPU monitoring
│   ├── handlers.py           # WebSocket handlers
│   ├── routes.py             # HTTP routes
│   └── metrics/
│       ├── collector.py      # Metrics collection
│       └── utils.py          # Metric utilities
├── static/
│   ├── js/
│   │   ├── charts.js         # Chart configs
│   │   ├── gpu-cards.js      # UI components
│   │   ├── socket-handlers.js # WebSocket + rendering
│   │   ├── ui.js             # View management
│   │   └── app.js            # Init
│   └── css/styles.css
├── templates/index.html
├── Dockerfile
└── docker-compose.yml
```

---

## Performance

Frontend uses `requestAnimationFrame` batching to minimize reflows. Scroll detection pauses DOM updates during scrolling.

For heavy workloads or many GPUs, increase update intervals in `core/config.py`.

---

## Troubleshooting

**GPU not detected:**
```bash
# Verify drivers
nvidia-smi

# Test Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# Restart Docker
sudo systemctl restart docker
```

**Performance issues:**
- Increase `UPDATE_INTERVAL` in `core/config.py`
- Reduce chart history in `static/js/charts.js`
- Check browser console for errors

**Debug mode:**
```python
# core/config.py
DEBUG = True
```

---

## Contributing

PRs welcome. For major changes, open an issue first.

## License

MIT - see [LICENSE](LICENSE)

---

<div align="center">

[Report Bug](https://github.com/psalias2006/gpu-hot/issues) • [Request Feature](https://github.com/psalias2006/gpu-hot/issues)

</div>
