<div align="center">

# GPU Hot

Real-time NVIDIA GPU monitoring dashboard. Web-based, no SSH required.
**Supports Docker and native installation on Linux & Windows.**

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NVIDIA](https://img.shields.io/badge/NVIDIA-GPU-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/)
[![Linux](https://img.shields.io/badge/Linux-Native-FCC624?style=flat-square&logo=linux&logoColor=black)](https://www.kernel.org/)
[![Windows](https://img.shields.io/badge/Windows-Native-0078D4?style=flat-square&logo=windows&logoColor=white)](https://www.microsoft.com/windows/)

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

**From source (Docker):**
```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

**Native installation (Linux/Windows):**
```bash
# Linux
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
pip3 install -r requirements.txt
python3 app.py
```

```cmd
REM Windows (Command Prompt)
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
pip install -r requirements.txt
python app.py
```

```powershell
# Windows (PowerShell)
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
pip install -r requirements.txt
python app.py
```

**Docker Requirements:** Docker + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

**Native Requirements:** 
- Python 3.8+ with pip
- NVIDIA GPU drivers (recent version recommended)
- All Python dependencies will be installed via pip

---

## Features

- Real-time metrics (sub-second)
- Automatic multi-GPU detection
- Process monitoring (PID, memory usage)
- Historical charts (utilization, temperature, power, clocks)
- System metrics (CPU, RAM)
- Scale from 1 to 100+ GPUs

**Metrics:** Utilization, temperature, memory, power draw, fan speed, clock speeds, PCIe info, P-State, throttle status, encoder/decoder sessions

---

## Configuration

**Environment variables (Docker & Native):**
```bash
NVIDIA_VISIBLE_DEVICES=0,1     # Specific GPUs (default: all)
NVIDIA_SMI=true                # Force nvidia-smi mode for older GPUs
GPU_HOT_MODE=hub               # Set to 'hub' for multi-node aggregation (default: single node)
NODE_NAME=gpu-server-1         # Node display name (default: hostname)
NODE_URLS=http://host:1312...  # Comma-separated node URLs (required for hub mode)
```

**Native installation examples:**
```bash
# Linux - Single machine with specific GPUs
export NVIDIA_VISIBLE_DEVICES=0,1
export NVIDIA_SMI=true
python3 app.py
```

```cmd
REM Windows Command Prompt - Hub mode
set GPU_HOT_MODE=hub
set NODE_URLS=http://server1:1312,http://server2:1312
python app.py
```

```powershell
# Windows PowerShell - Force nvidia-smi mode
$env:NVIDIA_SMI="true"
python app.py
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
# Test NVIDIA drivers
nvidia-smi  # Should show GPU list

# Docker-specific test
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# Native installation - force nvidia-smi mode for older GPUs
export NVIDIA_SMI=true  # Linux
set NVIDIA_SMI=true     # Windows CMD
$env:NVIDIA_SMI="true"  # Windows PowerShell
```

**Python/pip issues (Native installation):**
```bash
# Linux - Install missing dependencies
sudo apt update && sudo apt install python3 python3-pip
pip3 install -r requirements.txt

# Verify Python version (3.8+ required)
python3 --version
```

```cmd
REM Windows - Install Python from python.org
python --version
pip install -r requirements.txt

REM If 'python' not found, try:
python3 --version
py --version
```

**Port 1312 already in use:**
```bash
# Linux - Find what's using the port
sudo lsof -i :1312
sudo netstat -tulpn | grep :1312

# Kill existing process or change port
export PORT=1313  # Linux
set PORT=1313     # Windows
```

**Permission errors (Windows):**
```cmd
REM Run Command Prompt or PowerShell as Administrator
REM Or install to user directory:
pip install --user -r requirements.txt
```

**Import errors:**
```bash
# Missing nvidia-ml-py (most common issue)
pip install nvidia-ml-py

# Missing system packages (Linux)
sudo apt install build-essential python3-dev

# Verify all dependencies
python -c "import pynvml, psutil, fastapi; print('Dependencies OK')"
```

**Hub can't connect to nodes:**
```bash
curl http://node-ip:1312/api/gpu-data  # Test connectivity
sudo ufw allow 1312/tcp                # Linux firewall
netsh advfirewall firewall add rule name="GPU Hot" dir=in action=allow protocol=TCP localport=1312  # Windows firewall
```

**Performance issues:** Increase `UPDATE_INTERVAL` in `core/config.py`

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=psalias2006/gpu-hot&type=date&legend=top-left)](https://www.star-history.com/#psalias2006/gpu-hot&type=date&legend=top-left)

## Contributing

PRs welcome. Open an issue for major changes.

## License

MIT - see [LICENSE](LICENSE)
