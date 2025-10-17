"""HTTP routes"""

from datetime import datetime
from flask import render_template, jsonify, request

from . import config


def register_routes(app, monitor, alert_manager=None):
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

    @app.route('/api/alerts/settings', methods=['GET'])
    def api_alert_settings():
        if alert_manager is None:
            defaults = {
                'enabled': False,
                'cooldown_seconds': config.ALERT_COOLDOWN_SECONDS,
                'reset_delta': config.ALERT_RESET_DELTA,
                'rules': [],
                'backends': {},
            }
            return jsonify({
                'enabled': False,
                'cooldown_seconds': config.ALERT_COOLDOWN_SECONDS,
                'reset_delta': config.ALERT_RESET_DELTA,
                'rules': [],
                'backends': {},
                'available_backends': [],
                'notifications_configured': False,
                'active': False,
                'persisted': False,
                'defaults': defaults,
            })
        return jsonify(alert_manager.get_settings())

    @app.route('/api/alerts/settings', methods=['PUT', 'POST'])
    def api_update_alert_settings():
        if alert_manager is None:
            return jsonify({'error': 'Alert manager is not configured'}), 503

        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({'error': 'Invalid or missing JSON payload'}), 400

        try:
            updated = alert_manager.update_settings(payload)
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({'error': str(exc)}), 500

        return jsonify(updated)

    @app.route('/api/alerts/test', methods=['POST'])
    def api_test_alert():
        if alert_manager is None:
            return jsonify({'error': 'Alert manager is not configured'}), 503

        payload = request.get_json(silent=True) or {}
        message = payload.get('message')

        try:
            alert_manager.send_test_notification(message=message)
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        except Exception as exc:
            return jsonify({'error': str(exc)}), 500

        return jsonify({'status': 'ok'})
