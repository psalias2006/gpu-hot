<div align="center">

# GPU Hot

### Real-Time NVIDIA GPU Monitoring Dashboard

Web-based monitoring for NVIDIA GPUs. Track 30+ metrics per GPU with live charts and real-time updates.

<img src="gpu-hot.png" alt="GPU Hot Dashboard" width="600" />

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-orange?style=flat-square)](LICENSE)
[![NVIDIA](https://img.shields.io/badge/NVIDIA-GPU-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/)

[Features](#features) • [Quick Start](#quick-start) • [Installation](#installation) • [Documentation](#documentation) • [Contributing](#contributing)

</div>

---

## Features

- **30+ GPU Metrics** - Utilization, temperature, memory, power, clocks, encoder/decoder stats, and more per GPU
- **Multi-GPU Support** - Automatic detection and independent monitoring of all NVIDIA GPUs
- **Live Historical Charts** - Real-time graphs with statistics (min/max/avg), threshold indicators, and contextual tooltips
- **Process Monitoring** - Track active GPU processes with memory usage and PIDs
- **Clean UI** - Responsive interface with glassmorphism design and smooth animations
- **WebSocket Updates** - Sub-second refresh rates (2s) for real-time monitoring
- **Docker Deployment** - One-command setup with NVIDIA Container Toolkit support
- **Zero Configuration** - Works out of the box with any NVIDIA GPU

## Monitored Metrics

### Core GPU Metrics
- GPU & Memory Utilization (%)
- Core & Memory Temperature (°C)
- Memory Usage (Used/Free/Total MB)
- Power Draw & Limits (W)
- Fan Speed (%)
- Clock Speeds (Graphics, SM, Memory, Video MHz)

### Advanced Metrics
- PCIe Generation & Lane Width (Current/Max)
- Performance State (P-State)
- Compute Mode
- Encoder/Decoder Sessions & Stats
- Driver & VBIOS Version
- Throttle Status Detection

### System Context
- Host CPU & RAM Usage
- Active GPU Processes with Memory Tracking

## Quick Start

### Docker Deployment (Recommended)

```bash
git clone https://github.com/psalias2006/gpu-hot
cd gpu-hot
docker-compose up --build
```

Access the dashboard at `http://localhost:1312`

### Local Development

```bash
pip install -r requirements.txt
python app.py
```

Access the dashboard at `http://localhost:1312`

## Installation

### Prerequisites

- NVIDIA GPU with drivers installed (verify with `nvidia-smi`)
- Docker & Docker Compose (for containerized deployment)
- NVIDIA Container Toolkit (for Docker GPU access)
- Python 3.8+ (for local development)

### NVIDIA Container Toolkit Setup

Required for Docker deployment to access GPUs.

**Installation:**

Follow the official installation guide for your distribution:  
📖 [NVIDIA Container Toolkit Installation Guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

The guide includes instructions for Ubuntu, Debian, RHEL, CentOS, Fedora, and other distributions.

**Verify Installation:**
```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

## Documentation

### Project Structure

```
gpu-hot/
├── app.py                 # Flask application with WebSocket server
├── templates/
│   └── index.html        # Web dashboard with live charts
├── requirements.txt      # Python dependencies
├── Dockerfile           # Container configuration
├── docker-compose.yml   # Docker Compose setup
└── README.md           # Documentation
```

### API Endpoints

**HTTP:**
- `GET /` - Dashboard interface
- `GET /api/gpu-data` - Current GPU metrics (JSON)

**WebSocket:**
- `gpu_data` - Real-time metrics broadcast (2s interval)
- `connect` / `disconnect` - Connection events

### Configuration

**Environment Variables:**
- `NVIDIA_VISIBLE_DEVICES` - GPU visibility (default: all)
- `NVIDIA_DRIVER_CAPABILITIES` - GPU capabilities (default: all)

**Customization in `app.py`:**
- Update interval: Modify `eventlet.sleep(2)` for refresh rate
- Port: Change in `socketio.run()` (default: 1312)
- Chart history: Adjust data retention (default: 30 points)

### Docker Configuration

- Base: `nvidia/cuda:12.1-devel-ubuntu22.04`
- Self-contained nvidia-smi (no host mounting required)
- Health checks every 30s
- Automatic restart on failure
- Exposes port 1312

### Development

**Adding New Metrics:**
1. Modify nvidia-smi query in `parse_nvidia_smi()`
2. Update frontend to display new metrics
3. Add chart configuration if needed

**Local Development:**
```bash
pip install -r requirements.txt
python app.py
```

Access at `http://localhost:1312` (Dashboard) or `http://localhost:1312/api/gpu-data` (API)

## Troubleshooting

### nvidia-smi not found
- Verify NVIDIA drivers: `nvidia-smi`
- Install NVIDIA Container Toolkit (see Installation section)
- Restart Docker daemon: `sudo systemctl restart docker`
- Test GPU access: `docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi`

### No GPU data
- Check host GPU access: `nvidia-smi`
- Verify Container Toolkit: `nvidia-ctk --version`
- Review logs: `docker-compose logs`
- Configure Docker runtime: `sudo nvidia-ctk runtime configure --runtime=docker`

### WebSocket issues
- Check port 1312 accessibility
- Review browser console for errors
- Verify firewall settings

### Enable debug logging
```python
# In app.py
socketio.run(app, host='0.0.0.0', port=1312, debug=True)
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

## License
See the [LICENSE](LICENSE) file for full details.

## Acknowledgments

- NVIDIA for nvidia-smi
- Flask & Socket.IO teams
- Chart.js for visualization
- Open-source community

---

<div align="center">

**GPU Hot** - Real-Time GPU Monitoring

[Report Bug](https://github.com/psalias2006/gpu-hot/issues) • [Request Feature](https://github.com/psalias2006/gpu-hot/issues)

</div>

