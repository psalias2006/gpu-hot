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

### Standalone Mode (Single Machine)

**Docker (recommended):**

```bash
docker run -d --name gpu-hot --gpus all -p 1312:1312 ghcr.io/psalias2006/gpu-hot:latest
```

**Force nvidia-smi mode (for older GPUs):**
```bash
docker run -d --name gpu-hot --gpus all -p 1312:1312 -e NVIDIA_SMI=true ghcr.io/psalias2006/gpu-hot:latest
```

Open `http://localhost:1312`

**From source:**

```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

**Local dev:**

```bash
pip install -r requirements.txt
python app.py
```

**Requirements:** Docker + NVIDIA Container Toolkit ([install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html))

---

### Cluster Mode (Multi-Node Monitoring)

Monitor GPUs across multiple servers. No SSH required - just start agents on each node and hub on your laptop.

**Simple 2-step setup:**

**Step 1: On each GPU node** (however you access them - SSH, console, existing tools):
```bash
# Install once
pip install -r requirements.txt

# Run agent (one command, that's it)
GPU_HOT_MODE=agent python app.py
```

**Step 2: On your laptop/monitoring machine:**
```bash
# Run hub pointing to your nodes
GPU_HOT_MODE=hub GPU_HOT_NODES=http://node1:1312,http://node2:1312 python app.py

# Open browser: http://localhost:1312
```

**Done!** View all GPUs from all nodes in one dashboard.

---

**Using Docker (even simpler):**

**On each GPU node:**
```bash
docker run -d --gpus all -p 1312:1312 -e GPU_HOT_MODE=agent ghcr.io/psalias2006/gpu-hot:latest
```

**On your laptop:**
```bash
docker run -d -p 1312:1312 \
  -e GPU_HOT_MODE=hub \
  -e GPU_HOT_NODES=http://node1:1312,http://node2:1312 \
  ghcr.io/psalias2006/gpu-hot:latest
```

---

**Optional: YAML configuration for many nodes**

Create `nodes.yaml`:
```yaml
nodes:
  - url: http://node1:1312
    name: "Training Node 1"
    tags: ["training"]
  - url: http://node2:1312
    name: "Inference Node"
    tags: ["inference"]
```

Run hub:
```bash
GPU_HOT_MODE=hub python app.py  # Auto-loads nodes.yaml
```

---

**Test cluster locally:**
```bash
# Start 1 hub + 3 agents on same machine
docker-compose --profile cluster up
```

### Cluster Architecture

GPU Hot uses a **hub-spoke architecture** for cluster monitoring:

```
┌─────────────────────┐
│   Hub Dashboard     │  ← Central monitoring server
│  (http://hub:1312)  │     - Aggregates data from agents
└──────────┬──────────┘     - Displays unified dashboard
           │                - No GPUs required
           ├─────────┬──────────────┐
           │         │              │
    ┌──────▼──────┐  │       ┌──────▼──────┐
    │   Agent 1   │  │       │   Agent N   │
    │ GPU Node 1  │  │  ...  │ GPU Node N  │
    │ (port 1312) │  │       │ (port 1312) │
    └─────────────┘  │       └─────────────┘
                     │
              ┌──────▼──────┐
              │   Agent 2   │
              │ GPU Node 2  │
              │ (port 1312) │
              └─────────────┘
```

**Agent Mode:**
- Runs on each GPU node
- Exposes HTTP API endpoints
- Minimal overhead (HTTP only, no WebSocket)
- Endpoint: `/api/agent/gpu-data`

**Hub Mode:**
- Runs on central monitoring server
- Polls agents via HTTP
- Aggregates and displays data
- Full dashboard with WebSocket streaming

**Standalone Mode:**
- Original single-machine mode
- No cluster features
- Default mode

### Deployment Scenarios

**Bare Metal:**

```bash
# On GPU nodes - install dependencies
pip install -r requirements.txt

# Start agents
GPU_HOT_MODE=agent python app.py

# On hub server
GPU_HOT_MODE=hub GPU_HOT_NODES=http://node1:1312,http://node2:1312 python app.py
```

**Kubernetes:**

Deploy as DaemonSet for agents + Deployment for hub.

```yaml
# Agent DaemonSet
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: gpu-hot-agent
spec:
  selector:
    matchLabels:
      app: gpu-hot-agent
  template:
    spec:
      nodeSelector:
        gpu: "true"
      containers:
      - name: agent
        image: ghcr.io/psalias2006/gpu-hot:latest
        env:
        - name: GPU_HOT_MODE
          value: "agent"
        ports:
        - containerPort: 1312

# Hub Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gpu-hot-hub
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: hub
        image: ghcr.io/psalias2006/gpu-hot:latest
        env:
        - name: GPU_HOT_MODE
          value: "hub"
        - name: GPU_HOT_NODES
          value: "http://gpu-node-1:1312,http://gpu-node-2:1312"
```

### Cluster Troubleshooting

**Agent Not Responding:**

Check agent health:
```bash
curl http://node1:1312/api/agent/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "gpu_count": 2,
  "node_id": "node1_10_0_1_10",
  "hostname": "node1"
}
```

Common issues:
- Firewall blocking port 1312
- Agent not running
- GPU drivers not installed
- Wrong network/hostname

**Hub Shows Cached Data:**

"Cached (Xs ago)" means agent was reachable but is now offline. Hub shows last known state for 5 minutes (configurable via `CACHE_OFFLINE_DURATION`).

**Slow Hub Response:**

For large clusters (50+ nodes):
```bash
AGENT_POLL_INTERVAL=2.0      # Slower polling
AGENT_TIMEOUT=3.0            # Shorter timeout
CACHE_OFFLINE_DURATION=60    # Shorter cache
```

Expected performance:
- 50 agents: ~1-2 seconds per poll cycle
- 100 agents: ~2-4 seconds per poll cycle
- 200+ agents: Consider splitting into multiple hubs

### Security Considerations

**No Authentication:**
- GPU Hot has no built-in authentication
- Suitable for trusted internal networks only
- **Do not expose to public internet**

**Recommendations:**
- Use firewall rules to restrict access
- Deploy behind VPN
- Use reverse proxy with authentication (nginx, Traefik)
- Consider network segmentation

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

### Operating Modes

GPU Hot supports three modes:

1. **Standalone** (default): Monitor GPUs on local machine
2. **Agent**: Expose GPU data via HTTP API for hub collection
3. **Hub**: Collect and aggregate data from multiple agents

Set mode via environment variable:
```bash
GPU_HOT_MODE=standalone  # Default
GPU_HOT_MODE=agent       # Agent mode
GPU_HOT_MODE=hub         # Hub mode
```

### Configuration File

Optional. Edit `core/config.py`:

```python
UPDATE_INTERVAL = 0.5         # NVML polling interval (fast)
NVIDIA_SMI_INTERVAL = 2.0     # nvidia-smi polling interval (slower to reduce overhead)
PORT = 1312                   # Web server port
DEBUG = False

# Cluster settings
AGENT_POLL_INTERVAL = 1.0     # Hub polling frequency
AGENT_TIMEOUT = 5.0           # Agent request timeout
```

### Environment Variables

**All Modes:**
```bash
GPU_HOT_MODE=standalone|agent|hub  # Operating mode
NVIDIA_VISIBLE_DEVICES=0,1          # Specific GPUs (default: all)
NVIDIA_SMI=true                     # Force nvidia-smi mode for all GPUs
PORT=1312                           # Server port
```

**Hub Mode Only:**
```bash
GPU_HOT_NODES=http://node1:1312,http://node2:1312  # Comma-separated agent URLs
NODE_CONFIG_FILE=nodes.yaml                         # Path to YAML config (default: nodes.yaml)
AGENT_POLL_INTERVAL=1.0                             # Polling frequency in seconds
AGENT_TIMEOUT=5.0                                   # Request timeout in seconds
CACHE_OFFLINE_DURATION=300                          # Keep offline node data for N seconds
```

**nvidia-smi Fallback:**
- Automatically detects GPUs that don't support NVML utilization metrics
- Falls back to nvidia-smi for those GPUs
- Compatible with older GPUs (Quadro P1000, Tesla, etc.)

**Force nvidia-smi for all GPUs:**
- Docker: `docker run -e NVIDIA_SMI=true ...`
- Config: Set `NVIDIA_SMI = True` in `core/config.py`

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
├── app.py                      # Flask + WebSocket server
├── core/
│   ├── config.py               # Configuration + cluster settings
│   ├── monitor.py              # NVML GPU monitoring (standalone)
│   ├── agent.py                # Agent mode (HTTP API)
│   ├── hub.py                  # Hub mode (multi-node aggregation)
│   ├── handlers.py             # WebSocket handlers
│   ├── routes.py               # HTTP routes (mode-aware)
│   └── metrics/
│       ├── collector.py        # Metrics collection
│       └── utils.py            # Metric utilities
├── static/
│   ├── js/
│   │   ├── charts.js           # Chart configs
│   │   ├── gpu-cards.js        # UI components
│   │   ├── socket-handlers.js  # WebSocket + unified node rendering
│   │   ├── ui.js               # View management
│   │   └── app.js              # Init
│   └── css/styles.css
├── templates/index.html
├── Dockerfile
└── docker-compose.yml          # Unified standalone + cluster
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
