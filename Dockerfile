FROM nvidia/cuda:12.2.2-runtime-ubuntu22.04

# GPU Hot - Real-time NVIDIA GPU Monitoring with Disconnect Testing
# 
# IMPORTANT: For GPU disconnect functionality, this container requires:
# - privileged: true (to access PCI sysfs)
# - volumes: /sys/bus/pci:/sys/bus/pci:rw (for PCI operations)
# - volumes: /sys/devices:/sys/devices:ro (for device enumeration)
# 
# See docker-compose.yml for complete configuration example

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create templates directory if it doesn't exist
RUN mkdir -p templates

# Expose port
EXPOSE 1312

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:1312/api/gpu-data || exit 1

# Run the application
CMD ["python3", "app.py"]

