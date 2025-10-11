"""
Simple nvidia-smi fallback parser
Based on the original working implementation
"""

import subprocess
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_nvidia_smi():
    """Parse nvidia-smi output and extract comprehensive GPU information"""
    try:
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
            logger.warning(f"nvidia-smi comprehensive query failed (code {result.returncode}), trying basic query")
            return parse_nvidia_smi_fallback()
            
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
                        'temperature_memory': 0,
                        'utilization': float(parts[6]) if parts[6] not in ['N/A', '[N/A]', ''] else 0,
                        'memory_utilization': float(parts[7]) if parts[7] not in ['N/A', '[N/A]', ''] else 0,
                        'memory_used': float(parts[8]) if parts[8] not in ['N/A', '[N/A]', ''] else 0,
                        'memory_total': float(parts[9]) if parts[9] not in ['N/A', '[N/A]', ''] else 0,
                        'memory_free': float(parts[10]) if parts[10] not in ['N/A', '[N/A]', ''] else 0,
                        'power_draw': float(parts[11]) if parts[11] not in ['N/A', '[N/A]', ''] else 0,
                        'power_limit': float(parts[12]) if parts[12] not in ['N/A', '[N/A]', ''] else 0,
                        'power_default_limit': 0,
                        'fan_speed': float(parts[13]) if parts[13] not in ['N/A', '[N/A]', ''] else 0,
                        'clock_graphics': float(parts[14]) if parts[14] not in ['N/A', '[N/A]', ''] else 0,
                        'clock_sm': float(parts[15]) if parts[15] not in ['N/A', '[N/A]', ''] else 0,
                        'clock_memory': float(parts[16]) if parts[16] not in ['N/A', '[N/A]', ''] else 0,
                        'clock_video': 0,
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
                        'decoder_sessions': 0,
                        'decoder_fps': 0,
                        'decoder_latency': 0,
                        'performance_state': parts[27] if len(parts) > 27 and parts[27] not in ['N/A', '[N/A]', ''] else 'N/A',
                        'compute_mode': parts[28] if len(parts) > 28 and parts[28] not in ['N/A', '[N/A]', ''] else 'N/A',
                        'throttle_reasons': 'None',
                        'timestamp': datetime.now().isoformat()
                    }
        
        if gpu_data:
            logger.debug(f"nvidia-smi returned data for {len(gpu_data)} GPU(s)")
        return gpu_data
        
    except subprocess.TimeoutExpired:
        logger.error("nvidia-smi command timed out (>10s)")
        return {}
    except Exception as e:
        logger.error(f"nvidia-smi comprehensive query error: {e}, trying basic query")
        return parse_nvidia_smi_fallback()


def parse_nvidia_smi_fallback():
    """Fallback parser with minimal, widely-supported fields"""
    try:
        logger.info("Using basic nvidia-smi query (minimal fields)")
        result = subprocess.run([
            'nvidia-smi', 
            '--query-gpu=index,name,temperature.gpu,utilization.gpu,utilization.memory,'
            'memory.used,memory.total,power.draw,power.limit,fan.speed,'
            'clocks.gr,clocks.sm,clocks.mem,pstate',
            '--format=csv,noheader,nounits'
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            logger.error(f"Basic nvidia-smi query also failed (code {result.returncode})")
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
        
        if gpu_data:
            logger.info(f"Basic nvidia-smi query successful - Found {len(gpu_data)} GPU(s)")
        return gpu_data
        
    except Exception as e:
        logger.error(f"Basic nvidia-smi query failed: {e}")
        return {}

