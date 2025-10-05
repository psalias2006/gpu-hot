# 🔥 GPU Hot

A stunning, real-time web-based monitoring dashboard for NVIDIA GPUs with modern UI and beautiful visualizations. Monitor GPU utilization, temperature, memory usage, power consumption, and active processes with sleek, responsive charts and glassmorphism design.

![GPU Hot](https://img.shields.io/badge/GPU-Hot-blue?style=for-the-badge&logo=nvidia)
![Python](https://img.shields.io/badge/Python-3.8+-green?style=for-the-badge&logo=python)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?style=for-the-badge&logo=docker)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-orange?style=for-the-badge)

## ✨ Features

- **🎨 Modern UI**: Clean, dark theme with glassmorphism effects and smooth animations
- **📊 Real-time Charts**: Beautiful line charts with gradient styling for all GPU metrics
- **🔄 Live Updates**: WebSocket-powered updates every 2 seconds
- **🎯 Multi-GPU Support**: Automatically detects and displays all available GPUs
- **📱 Responsive Design**: Perfect on desktop, tablet, and mobile devices
- **⚡ Process Monitoring**: Real-time GPU process tracking with memory usage
- **💻 System Metrics**: CPU and RAM usage with gradient indicators
- **🐳 Docker Ready**: One-command deployment with Docker Compose
- **🎭 Interactive Elements**: Hover effects, smooth transitions, and micro-interactions

## 📊 Monitored Metrics

### GPU Metrics
- **Utilization**: GPU compute utilization percentage
- **Temperature**: GPU temperature in Celsius
- **Memory Usage**: Used vs total GPU memory
- **Power Draw**: Current power consumption in watts
- **Fan Speed**: GPU fan speed percentage

### System Metrics
- **CPU Usage**: System CPU utilization
- **Memory Usage**: System RAM utilization

### Process Information
- **Active Processes**: Currently running GPU processes
- **Memory Usage**: Per-process GPU memory consumption
- **Process Names**: Names and PIDs of GPU processes

## 🚀 Quick Start

### Prerequisites

- **NVIDIA GPU** with NVIDIA drivers installed
- **Docker and Docker Compose** (for containerized deployment)
- **NVIDIA Container Toolkit** (required for Docker to access GPUs)
- **Python 3.8+** (for local development)

### Installing NVIDIA Container Toolkit

Before running the Docker deployment, you need to install the NVIDIA Container Toolkit to enable GPU access in containers.

> **📋 Note**: Ensure NVIDIA drivers are already installed on your host system. Verify by running `nvidia-smi` in your terminal.

#### Ubuntu/Debian

```bash
# Configure the production repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Update package list
sudo apt-get update

# Install the NVIDIA Container Toolkit packages
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use the NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker

# Restart Docker daemon to apply changes
sudo systemctl restart docker

# Verify installation - this should display your GPU information
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

#### Other Linux Distributions

For RHEL/CentOS, Fedora, or other distributions, see the official documentation:
- **Installation Guide**: [https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- **GitHub Repository**: [https://github.com/NVIDIA/nvidia-container-toolkit](https://github.com/NVIDIA/nvidia-container-toolkit)

### Option 1: Docker Deployment (Recommended)

1. **Clone and run**:
   ```bash
   git clone https://github.com/psalias2006/gpu-hot
   cd gpu-hot
   docker-compose up --build
   ```

2. **Access the dashboard**:
   Open your browser and navigate to `http://localhost:1312`

### Option 2: Local Development

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the application**:
   ```bash
   python app.py
   ```

3. **Access the dashboard**:
   Open your browser and navigate to `http://localhost:1312`

## 🐳 Docker Configuration

The application includes optimized Docker configuration with self-contained nvidia-smi:

- **Base Image**: `nvidia/cuda:12.1-devel-ubuntu22.04`
- **GPU Support**: Full NVIDIA GPU access with built-in nvidia-smi
- **Health Checks**: Automatic health monitoring every 30s
- **Self-contained**: No need to mount host nvidia-smi
- **Port**: Exposes port 1312
- **Security**: Runs with GPU capabilities and proper isolation

### Docker Compose Features

- **🎯 GPU Access**: Full GPU visibility and monitoring
- **📦 Self-contained**: nvidia-smi installed in container
- **💚 Health Checks**: Automatic service health monitoring
- **🔄 Restart Policy**: Automatic restart on failure
- **🔒 Security**: Proper GPU capability management

## 📁 Project Structure

```
gpu-hot/
├── app.py                 # Main Flask application with WebSocket support
├── templates/
│   └── index.html        # Modern web dashboard with real-time charts
├── requirements.txt      # Python dependencies
├── Dockerfile           # Optimized Docker configuration
├── docker-compose.yml   # Docker Compose setup with GPU support
└── README.md           # This comprehensive guide
```

## 🔧 Configuration

### Environment Variables

- `NVIDIA_VISIBLE_DEVICES`: Controls GPU visibility (default: all)
- `NVIDIA_DRIVER_CAPABILITIES`: GPU capabilities (default: all)

### Customization

You can modify the following in `app.py`:

- **Update Interval**: Change `time.sleep(2)` to adjust refresh rate (line 126)
- **Port**: Modify the port in the `socketio.run()` call (line 173)
- **Host**: Change host binding (default: 0.0.0.0)
- **Chart Data Points**: Adjust the number of data points kept in charts (line 383)

## 📈 API Endpoints

### REST API

- `GET /`: Main dashboard page
- `GET /api/gpu-data`: Current GPU data (JSON)

### WebSocket Events

- `gpu_data`: Real-time GPU metrics and system information
- `connect`: Client connection event
- `disconnect`: Client disconnection event

## 🛠️ Development

### Local Development Setup

1. **Install development dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run in development mode**:
   ```bash
   python app.py
   ```

3. **Access the application**:
   - 🎨 **Dashboard**: `http://localhost:1312` (Modern UI with real-time charts)
   - 📊 **API**: `http://localhost:1312/api/gpu-data` (JSON endpoint)

### Adding New Metrics

To add new GPU metrics:

1. **Modify nvidia-smi query** in `parse_nvidia_smi()` method
2. **Update frontend** to display new metrics
3. **Add chart configuration** for new metric types

## 🔍 Troubleshooting

### Common Issues

1. **nvidia-smi not found in Docker**:
   - Ensure NVIDIA drivers are installed on the host
   - Install NVIDIA Container Toolkit (see installation section above)
   - Verify Docker has GPU access: `docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi`
   - Restart Docker daemon after installing the toolkit

2. **No GPU data or "could not select device driver"**:
   - Verify GPU is accessible on host: `nvidia-smi`
   - Check NVIDIA Container Toolkit is installed: `nvidia-ctk --version`
   - Ensure Docker Compose file has proper GPU configuration
   - Review Docker logs: `docker-compose logs`
   - Try running with sudo if permission issues occur

3. **Docker can't access GPUs**:
   - Run: `sudo nvidia-ctk runtime configure --runtime=docker`
   - Restart Docker: `sudo systemctl restart docker`
   - Check Docker GPU support: `docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi`

4. **WebSocket connection issues**:
   - Check firewall settings
   - Verify port 1312 is accessible
   - Review browser console for errors
   - Ensure WebSocket support in browser

### Debug Mode

Enable debug logging by setting `debug=True` in `app.py`:

```python
socketio.run(app, host='0.0.0.0', port=1312, debug=True)
```

## 🎨 UI Features

### Modern Design Elements
- **🌙 Dark Theme**: Professional dark interface with gradient accents
- **💎 Glassmorphism**: Frosted glass effects with backdrop blur
- **🎭 Animations**: Smooth transitions and hover effects
- **📱 Responsive**: Perfect on all device sizes
- **🎨 Gradients**: Beautiful color schemes for different metrics
- **⚡ Real-time**: Live updates with smooth chart animations

### Chart Types
- **📈 Utilization**: GPU compute usage with blue gradient
- **🌡️ Temperature**: GPU temperature with red gradient  
- **💾 Memory**: Memory usage percentage with cyan gradient
- **⚡ Power**: Power draw with green gradient

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (both Docker and local)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- **NVIDIA** for the excellent `nvidia-smi` tool
- **Flask & Socket.IO** for the robust web framework
- **Chart.js** for beautiful, responsive charts
- **Inter Font** for the modern typography
- **The open-source community** for inspiration and support

## 📞 Support

For issues and questions:

1. 📖 Check the troubleshooting section above
2. 🔍 Review existing issues on GitHub
3. 🐛 Create a new issue with detailed information
4. 💬 Join discussions in the community

---

**Made with ❤️ and lots of ☕ for the GPU monitoring community**

*Enjoy monitoring your GPUs with style! 🚀*

