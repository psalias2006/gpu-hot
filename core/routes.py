"""HTTP routes"""

from datetime import datetime
from flask import render_template, jsonify, redirect
from . import config


def register_routes(app, monitor):
    """Register HTTP routes based on mode (standalone, agent, or hub)
    
    Args:
        app: Flask application
        monitor: GPUMonitor, AgentServer, or HubMonitor instance
    """
    
    mode = config.MODE
    
    if mode == 'agent':
        # Agent mode: expose API endpoints only
        
        @app.route('/')
        def index():
            """Info page for agent mode"""
            from .agent import __version__
            agent = monitor if hasattr(monitor, 'node_id') else None
            
            info = {
                'mode': 'agent',
                'agent_version': __version__,
                'message': 'This is a GPU Hot agent node. Access GPU data at /api/agent/gpu-data',
                'endpoints': {
                    'gpu_data': '/api/agent/gpu-data',
                    'health': '/api/agent/health'
                }
            }
            
            if agent:
                info['node_id'] = agent.node_id
                info['hostname'] = agent.hostname
                info['uptime'] = agent.get_uptime()
            
            return jsonify(info)
        
        @app.route('/api/agent/gpu-data')
        def agent_gpu_data():
            """Return GPU data in agent format"""
            return jsonify(monitor.get_agent_data())
        
        @app.route('/api/agent/health')
        def agent_health():
            """Health check endpoint"""
            return jsonify(monitor.get_health())
    
    elif mode == 'hub':
        # Hub mode: dashboard + aggregated data from agents
        
        @app.route('/')
        def index():
            return render_template('index.html', mode='hub')
        
        @app.route('/api/gpu-data')
        def api_gpu_data():
            """Return aggregated GPU data from all nodes"""
            return jsonify({
                'gpus': monitor.gpu_data if hasattr(monitor, 'gpu_data') else {},
                'timestamp': datetime.now().isoformat(),
                'mode': 'hub'
            })
        
        @app.route('/api/hub/nodes')
        def hub_nodes():
            """Return detailed node information"""
            aggregated = monitor.aggregate_data()
            return jsonify(aggregated)
        
        @app.route('/api/hub/summary')
        def hub_summary():
            """Return summary statistics"""
            aggregated = monitor.aggregate_data()
            return jsonify(aggregated.get('summary', {}))
    
    else:
        # Standalone mode: original behavior
        
        @app.route('/')
        def index():
            return render_template('index.html', mode='standalone')
        
        @app.route('/api/gpu-data')
        def api_gpu_data():
            return jsonify({
                'gpus': monitor.gpu_data,
                'timestamp': datetime.now().isoformat()
            })

