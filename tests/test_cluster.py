#!/usr/bin/env python3
"""
Mock GPU cluster for load testing hub mode
Simulates realistic GPU workloads across multiple servers
"""

import time
import random
import eventlet
from datetime import datetime
import argparse
import logging
from flask import Flask
from flask_socketio import SocketIO

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)


class MockGPUNode:
    """Simulates a GPU node with realistic metrics for load testing"""
    
    def __init__(self, node_name, gpu_count, port=1312):
        self.node_name = node_name
        self.gpu_count = gpu_count
        self.port = port
        self.app = Flask(__name__)
        self.sio = SocketIO(self.app, cors_allowed_origins='*', async_mode='eventlet')
        
        # Initialize per-GPU state for realistic patterns
        self.gpu_states = []
        for gpu_id in range(gpu_count):
            self.gpu_states.append({
                'base_temp': random.randint(45, 55),
                'is_busy': random.random() < 0.4,  # 40% of GPUs are busy
                'job_start': time.time() - random.uniform(0, 300),  # Random job start time
                'memory': random.choice([12288, 24576]),  # Mix of 3080 (12GB) and 3090 (24GB)
                'allocated_memory': 0,
                'clock_base': random.randint(1710, 1890),  # Stable boost clock
            })
        
        self.start_time = time.time()
        
    def _generate_realistic_utilization(self, state, timestamp):
        """Generate realistic ML training utilization patterns"""
        if not state['is_busy']:
            # Idle GPU - occasionally switch to busy
            if random.random() < 0.001:  # 0.1% chance per update to start job
                state['is_busy'] = True
                state['job_start'] = timestamp
                state['allocated_memory'] = state['memory'] * random.uniform(0.85, 0.95)
            return random.uniform(0, 3)
        
        # Busy GPU - simulate training epoch pattern
        job_duration = timestamp - state['job_start']
        epoch_time = 120  # 2 minute epochs
        epoch_progress = (job_duration % epoch_time) / epoch_time
        
        # Occasionally finish job
        if random.random() < 0.0005:  # Job finishes
            state['is_busy'] = False
            state['allocated_memory'] = 0
            return 0
        
        # Training pattern with data loading dips
        if epoch_progress < 0.05:  # Warmup phase
            return random.gauss(25, 5)
        elif epoch_progress > 0.93:  # Validation phase
            return random.gauss(65, 5)
        else:  # Main training
            base_util = random.gauss(96, 2)
            # Data loading dips every ~5 seconds
            if (timestamp % 5) < 0.4:
                base_util *= 0.75
            return max(0, min(100, base_util))
    
    def generate_gpu_data(self):
        """Generate realistic GPU metrics for load testing"""
        timestamp = time.time()
        gpus = {}
        processes = []
        
        for gpu_id in range(self.gpu_count):
            state = self.gpu_states[gpu_id]
            
            # Realistic utilization pattern
            util = self._generate_realistic_utilization(state, timestamp)
            
            # Memory: allocated at job start, stays constant during training
            if state['is_busy']:
                mem_used = state['allocated_memory']
            else:
                mem_used = random.uniform(0, 100)  # Minimal idle usage
            
            # Temperature: correlates with utilization, slow changes
            target_temp = state['base_temp'] + (util / 100) * 35
            temp_variation = random.gauss(0, 1)
            temp = max(30, min(92, target_temp + temp_variation))
            
            # Power: correlates with utilization
            mem_base = state['memory']
            max_power = 250 if mem_base == 12288 else 350
            power = (util / 100) * max_power * random.uniform(0.85, 1.0)
            
            # Clock speeds: stable based on load
            if util > 50:
                clock_graphics = state['clock_base'] + random.randint(-20, 20)
                pstate = 'P0'
            elif util > 10:
                clock_graphics = int(state['clock_base'] * 0.8) + random.randint(-15, 15)
                pstate = 'P2'
            else:
                clock_graphics = random.randint(210, 500)
                pstate = 'P8'
            
            gpus[str(gpu_id)] = {
                'index': gpu_id,
                'name': f'NVIDIA RTX {"3090" if mem_base == 24576 else "3080"}',
                'utilization': round(util, 1),
                'temperature': round(temp, 1),
                'memory_used': round(mem_used, 0),
                'memory_total': mem_base,
                'power_draw': round(power, 1),
                'power_limit': max_power,
                'fan_speed': round(min(100, 30 + max(0, temp - 40) * 1.5)),
                'clock_graphics': clock_graphics,
                'clock_sm': clock_graphics,
                'clock_memory': 9501 if mem_base == 24576 else 9001,
                'pcie_gen': 4,
                'pcie_width': 16,
                'pstate': pstate,
                'encoder_sessions': 0,
                'decoder_sessions': 0,
                'throttle_reasons': []
            }
            
            # Add processes for busy GPUs
            if state['is_busy']:
                process_count = random.randint(1, 2)
                for p in range(process_count):
                    processes.append({
                        'pid': random.randint(1000, 99999),
                        'name': random.choice(['python3', 'train.py', 'pytorch', 'python']),
                        'gpu_memory': round(mem_used / process_count, 0),
                        'gpu_id': gpu_id
                    })
        
        # System metrics: correlate with GPU load
        avg_gpu_util = sum(g['utilization'] for g in gpus.values()) / len(gpus)
        system = {
            'cpu_percent': round(random.gauss(15 + avg_gpu_util * 0.3, 5), 1),
            'memory_percent': round(random.gauss(60, 10), 1),
            'memory_used': round(random.gauss(80, 15), 1),
            'memory_total': 128.0
        }
        
        return {
            'node_name': self.node_name,
            'gpus': gpus,
            'processes': processes,
            'system': system
        }
    
    def _broadcast_loop(self):
        """Background task to broadcast GPU data every 0.5s"""
        while True:
            try:
                data = self.generate_gpu_data()
                self.sio.emit('gpu_data', data, namespace='/')
            except Exception as e:
                logger.error(f'[{self.node_name}] Error in broadcast loop: {e}')
            eventlet.sleep(0.5)
    
    def run(self):
        """Run the mock node server"""
        
        @self.sio.on('connect')
        def on_connect():
            logger.info(f'[{self.node_name}] Client connected')
            # Start broadcasting when first client connects
            if not hasattr(self, '_broadcasting'):
                self._broadcasting = True
                self.sio.start_background_task(self._broadcast_loop)
        
        @self.sio.on('disconnect')
        def on_disconnect():
            logger.info(f'[{self.node_name}] Client disconnected')
        
        logger.info(f'[{self.node_name}] Starting mock node with {self.gpu_count} GPUs on port {self.port}')
        # Use eventlet's WSGI server to run Flask-SocketIO
        import eventlet.wsgi
        eventlet.wsgi.server(eventlet.listen(('0.0.0.0', self.port)), self.app)


def start_mock_node(node_name, gpu_count, port):
    """Start a mock node in a greenlet"""
    node = MockGPUNode(node_name, gpu_count, port)
    node.run()


def main():
    parser = argparse.ArgumentParser(description='Mock GPU cluster for testing')
    parser.add_argument('--nodes', type=str, default='2,4,8',
                      help='Comma-separated GPU counts for each node (e.g., "2,4,8")')
    parser.add_argument('--base-port', type=int, default=13120,
                      help='Base port for nodes (increments for each node)')
    parser.add_argument('--prefix', type=str, default='gpu-server',
                      help='Prefix for node names')
    
    args = parser.parse_args()
    
    gpu_counts = [int(x.strip()) for x in args.nodes.split(',')]
    
    print("\n" + "="*60)
    print("GPU Hot - Mock Cluster Test")
    print("="*60)
    print(f"\nStarting {len(gpu_counts)} mock GPU servers:\n")
    
    node_urls = []
    for i, gpu_count in enumerate(gpu_counts):
        port = args.base_port + i
        node_name = f"{args.prefix}-{i+1}"
        node_urls.append(f"http://localhost:{port}")
        print(f"  • {node_name}: {gpu_count} GPUs on port {port}")
        
        # Spawn each node in a greenlet
        eventlet.spawn(start_mock_node, node_name, gpu_count, port)
    
    print("\n" + "-"*60)
    print("Mock nodes running! Now start the hub with:")
    print("-"*60)
    print(f"\nexport GPU_HOT_MODE=hub")
    print(f"export NODE_URLS={','.join(node_urls)}")
    print(f"python app.py")
    print("\nOr with Docker:")
    print(f"\ndocker run -d -p 1312:1312 \\")
    print(f"  -e GPU_HOT_MODE=hub \\")
    print(f"  -e NODE_URLS={','.join(node_urls)} \\")
    print(f"  --network=host \\")
    print(f"  ghcr.io/psalias2006/gpu-hot:latest")
    print("\nThen open: http://localhost:1312")
    print("-"*60 + "\n")
    
    # Keep main thread alive
    try:
        while True:
            eventlet.sleep(10)
    except KeyboardInterrupt:
        print("\n\nStopping mock cluster...")


if __name__ == '__main__':
    main()

