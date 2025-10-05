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
        """Parse nvidia-smi output and extract comprehensive GPU information"""
        try:
            # Get comprehensive GPU information using nvidia-smi
            # Using more widely supported fields
            result = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=index,name,uuid,driver_version,vbios_version,'
                'temperature.gpu,utilization.gpu,utilization.memory,'
                'memory.used,memory.total,memory.free,power.draw,power.limit,'
                'fan.speed,clocks.gr,clocks.sm,clocks.mem,'
                'clocks.max.gr,clocks.max.sm,clocks.max.mem,'
                'pcie.link.gen.current,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max,'
                'encoder.stats.sessionCount,encoder.stats.averageFps,encoder.stats.averageLatency,'
                'pstate,compute_mode',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                print(f"nvidia-smi failed with return code {result.returncode}")
                print(f"stderr: {result.stderr}")
                print(f"stdout: {result.stdout}")
                # Try a simpler query as fallback
                return self.parse_nvidia_smi_fallback()
                
            lines = result.stdout.strip().split('\n')
            gpu_data = {}
            
            for line in lines:
                if line.strip():
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 27:
                        gpu_id = parts[0]
                        gpu_data[gpu_id] = {
                            'index': parts[0],
                            'name': parts[1],
                            'uuid': parts[2] if parts[2] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'driver_version': parts[3] if parts[3] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'vbios_version': parts[4] if parts[4] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'temperature': float(parts[5]) if parts[5] not in ['N/A', '[N/A]', ''] else 0,
                            'temperature_memory': 0,  # Not widely supported
                            'utilization': float(parts[6]) if parts[6] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_utilization': float(parts[7]) if parts[7] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_used': float(parts[8]) if parts[8] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_total': float(parts[9]) if parts[9] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_free': float(parts[10]) if parts[10] not in ['N/A', '[N/A]', ''] else 0,
                            'power_draw': float(parts[11]) if parts[11] not in ['N/A', '[N/A]', ''] else 0,
                            'power_limit': float(parts[12]) if parts[12] not in ['N/A', '[N/A]', ''] else 0,
                            'power_default_limit': 0,  # Not widely supported
                            'fan_speed': float(parts[13]) if parts[13] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_graphics': float(parts[14]) if parts[14] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_sm': float(parts[15]) if parts[15] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_memory': float(parts[16]) if parts[16] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_video': 0,  # Not widely supported
                            'clock_max_graphics': float(parts[17]) if parts[17] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_max_sm': float(parts[18]) if parts[18] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_max_memory': float(parts[19]) if parts[19] not in ['N/A', '[N/A]', ''] else 0,
                            'pcie_gen': parts[20] if parts[20] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'pcie_gen_max': parts[21] if parts[21] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'pcie_width': parts[22] if parts[22] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'pcie_width_max': parts[23] if parts[23] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'encoder_sessions': int(parts[24]) if parts[24] not in ['N/A', '[N/A]', ''] else 0,
                            'encoder_fps': float(parts[25]) if parts[25] not in ['N/A', '[N/A]', ''] else 0,
                            'encoder_latency': float(parts[26]) if parts[26] not in ['N/A', '[N/A]', ''] else 0,
                            'decoder_sessions': 0,  # Not widely supported
                            'decoder_fps': 0,  # Not widely supported
                            'decoder_latency': 0,  # Not widely supported
                            'performance_state': parts[27] if len(parts) > 27 and parts[27] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'compute_mode': parts[28] if len(parts) > 28 and parts[28] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'throttle_reasons': 'None',  # Not widely supported
                            'timestamp': datetime.now().isoformat()
                        }
            
            return gpu_data
            
        except subprocess.TimeoutExpired:
            print("nvidia-smi command timed out")
            return {}
        except Exception as e:
            print(f"Error parsing nvidia-smi: {e}")
            return self.parse_nvidia_smi_fallback()
    
    def parse_nvidia_smi_fallback(self):
        """Fallback parser with minimal, widely-supported fields"""
        try:
            print("Attempting fallback nvidia-smi query with basic fields...")
            result = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=index,name,temperature.gpu,utilization.gpu,utilization.memory,'
                'memory.used,memory.total,power.draw,power.limit,fan.speed,'
                'clocks.gr,clocks.sm,clocks.mem,pstate',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                print(f"Fallback nvidia-smi also failed with return code {result.returncode}")
                print(f"stderr: {result.stderr}")
                print(f"stdout: {result.stdout}")
                return {}
            
            lines = result.stdout.strip().split('\n')
            gpu_data = {}
            
            for line in lines:
                if line.strip():
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 14:
                        gpu_id = parts[0]
                        gpu_data[gpu_id] = {
                            'index': parts[0],
                            'name': parts[1],
                            'uuid': 'N/A',
                            'driver_version': 'N/A',
                            'vbios_version': 'N/A',
                            'temperature': float(parts[2]) if parts[2] not in ['N/A', '[N/A]', ''] else 0,
                            'temperature_memory': 0,
                            'utilization': float(parts[3]) if parts[3] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_utilization': float(parts[4]) if parts[4] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_used': float(parts[5]) if parts[5] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_total': float(parts[6]) if parts[6] not in ['N/A', '[N/A]', ''] else 0,
                            'memory_free': float(parts[6]) - float(parts[5]) if parts[6] not in ['N/A', '[N/A]', ''] and parts[5] not in ['N/A', '[N/A]', ''] else 0,
                            'power_draw': float(parts[7]) if parts[7] not in ['N/A', '[N/A]', ''] else 0,
                            'power_limit': float(parts[8]) if parts[8] not in ['N/A', '[N/A]', ''] else 0,
                            'power_default_limit': 0,
                            'fan_speed': float(parts[9]) if parts[9] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_graphics': float(parts[10]) if parts[10] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_sm': float(parts[11]) if parts[11] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_memory': float(parts[12]) if parts[12] not in ['N/A', '[N/A]', ''] else 0,
                            'clock_video': 0,
                            'clock_max_graphics': 0,
                            'clock_max_sm': 0,
                            'clock_max_memory': 0,
                            'pcie_gen': 'N/A',
                            'pcie_gen_max': 'N/A',
                            'pcie_width': 'N/A',
                            'pcie_width_max': 'N/A',
                            'encoder_sessions': 0,
                            'encoder_fps': 0,
                            'encoder_latency': 0,
                            'decoder_sessions': 0,
                            'decoder_fps': 0,
                            'decoder_latency': 0,
                            'performance_state': parts[13] if parts[13] not in ['N/A', '[N/A]', ''] else 'N/A',
                            'compute_mode': 'N/A',
                            'throttle_reasons': 'None',
                            'timestamp': datetime.now().isoformat()
                        }
            
            print(f"Fallback query successful! Found {len(gpu_data)} GPU(s)")
            return gpu_data
            
        except Exception as e:
            print(f"Fallback nvidia-smi also failed: {e}")
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
                
                # Add minimal system info (GPU-relevant only)
                system_info = {
                    'cpu_percent': psutil.cpu_percent(percpu=False),
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

