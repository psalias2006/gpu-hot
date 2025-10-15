"""HTTP routes"""

from datetime import datetime
from flask import render_template, jsonify


def register_routes(app, monitor):
    """Register HTTP routes"""
    
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/api/gpu-data')
    def api_gpu_data():
        # Hub mode: monitor is None, return empty (data comes via WebSocket)
        if monitor is None:
            return jsonify({
                'gpus': {},
                'timestamp': datetime.now().isoformat()
            })
        
        return jsonify({
            'gpus': monitor.gpu_data,
            'timestamp': datetime.now().isoformat()
        })

