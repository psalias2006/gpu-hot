#!/usr/bin/env python3
"""
GPU Hot Web Application
Real-time monitoring of NVIDIA GPU usage using nvidia-smi
"""

import eventlet
eventlet.monkey_patch()

import json
import subprocess
import time
from datetime import datetime
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO, emit
import psutil

app = Flask(__name__)
app.config['SECRET_KEY'] = 'gpu_hot_secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

class GPUMonitor:
    def __init__(self):
        self.running = False
        self.monitor_thread = None
        self.gpu_data = {}
        
    def parse_nvidia_smi(self):
        """Parse nvidia-smi output and extract GPU information"""
        try:
            # Get GPU information using nvidia-smi with JSON output
            result = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                print(f"nvidia-smi failed with return code {result.returncode}")
                print(f"stderr: {result.stderr}")
                return {}
                
            lines = result.stdout.strip().split('\n')
            gpu_data = {}
            
            for line in lines:
                if line.strip():
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 9:
                        gpu_id = parts[0]
                        gpu_data[gpu_id] = {
                            'index': parts[0],
                            'name': parts[1],
                            'temperature': float(parts[2]) if parts[2] != 'N/A' else 0,
                            'utilization': float(parts[3]) if parts[3] != 'N/A' else 0,
                            'memory_used': float(parts[4]) if parts[4] != 'N/A' else 0,
                            'memory_total': float(parts[5]) if parts[5] != 'N/A' else 0,
                            'power_draw': float(parts[6]) if parts[6] != 'N/A' else 0,
                            'power_limit': float(parts[7]) if parts[7] != 'N/A' else 0,
                            'fan_speed': float(parts[8]) if parts[8] != 'N/A' else 0,
                            'timestamp': datetime.now().isoformat()
                        }
            
            return gpu_data
            
        except subprocess.TimeoutExpired:
            print("nvidia-smi command timed out")
            return {}
        except Exception as e:
            print(f"Error parsing nvidia-smi: {e}")
            return {}
    
    def get_processes(self):
        """Get GPU processes information"""
        try:
            result = subprocess.run([
                'nvidia-smi', 
                '--query-compute-apps=pid,process_name,gpu_uuid,used_memory',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode != 0:
                return []
                
            processes = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 4:
                        processes.append({
                            'pid': parts[0],
                            'name': parts[1],
                            'gpu_uuid': parts[2],
                            'memory': float(parts[3]) if parts[3] != 'N/A' else 0
                        })
            
            return processes
            
        except Exception as e:
            print(f"Error getting processes: {e}")
            return []
    
    def monitor_loop(self):
        """Main monitoring loop"""
        while self.running:
            try:
                # Get GPU data
                gpu_data = self.parse_nvidia_smi()
                processes = self.get_processes()
                
                # Add system info
                system_info = {
                    'cpu_percent': psutil.cpu_percent(),
                    'memory_percent': psutil.virtual_memory().percent,
                    'timestamp': datetime.now().isoformat()
                }
                
                # Emit data to all connected clients
                emit_data = {
                    'gpus': gpu_data,
                    'processes': processes,
                    'system': system_info
                }
                socketio.emit('gpu_data', emit_data, namespace='/')
                
                self.gpu_data = gpu_data
                
            except Exception as e:
                print(f"Error in monitor loop: {e}")
            
            eventlet.sleep(2)  # Update every 2 seconds
    
    def start_monitoring(self):
        """Start the monitoring thread"""
        if not self.running:
            self.running = True
            self.monitor_thread = socketio.start_background_task(self.monitor_loop)
    
    def stop_monitoring(self):
        """Stop the monitoring thread"""
        self.running = False

# Initialize GPU monitor
gpu_monitor = GPUMonitor()

@app.route('/')
def index():
    """Main dashboard page"""
    return render_template('index.html')

@app.route('/api/gpu-data')
def get_gpu_data():
    """API endpoint for current GPU data"""
    return jsonify({
        'gpus': gpu_monitor.gpu_data,
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    # Start monitoring if not already running
    if not gpu_monitor.running:
        gpu_monitor.start_monitoring()

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

if __name__ == '__main__':
    # Run the Flask app
    # Note: use_reloader=False is required for background tasks to work properly
    socketio.run(app, host='0.0.0.0', port=1312, debug=True, use_reloader=False)

