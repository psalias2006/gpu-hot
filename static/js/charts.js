/**
 * Chart configurations and chart-related functions
 */

window.alertSettings = window.alertSettings || {
    data: null,
    thresholds: {
        temperature: 85,
        memory_percent: 90,
        utilization: 80,
        power_draw: 0
    }
};

const ALERT_RULE_UNITS = {
    temperature: '°C',
    memory_percent: '%',
    utilization: '%',
    power_draw: 'W'
};

function resolveAlertThreshold(ruleName, fallback) {
    const settings = window.alertSettings?.thresholds || {};
    const value = settings[ruleName];
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    return fallback;
}

function formatThresholdValue(ruleName, value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return 'disabled';
    }
    const unit = ALERT_RULE_UNITS[ruleName] || '';
    if (unit === '%') {
        return `${Number(value).toFixed(0)}${unit}`;
    }
    if (unit === '°C') {
        return `${Number(value).toFixed(0)}${unit}`;
    }
    return `${Number(value).toFixed(1)}${unit}`;
}

function computeTemperatureWarning(baseThreshold) {
    if (baseThreshold === null || baseThreshold === undefined || baseThreshold <= 0) {
        return null;
    }
    return Math.max(0, baseThreshold - 10);
}

function fillSeries(series, value) {
    if (!Array.isArray(series)) return;
    for (let i = 0; i < series.length; i += 1) {
        series[i] = value;
    }
}

// Chart configurations with modern styling and thresholds
const chartConfigs = {
    utilization: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'GPU Utilization',
                    data: [],
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#4facfe',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'High Load (80%)',
                    data: [],
                    borderColor: 'rgba(250, 112, 154, 0.5)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    alertRule: 'utilization',
                    defaultThreshold: 80,
                    labelBase: 'High Load'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 20,
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + '%'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4facfe',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'GPU Utilization';
                        },
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (label.includes('High Load')) {
                                return label;
                            }
                            return `${label}: ${value.toFixed(1)}%`;
                        },
                        afterLabel: function(context) {
                            if (!context.dataset.label.includes('High Load')) {
                                const value = context.parsed.y;
                                if (value > 90) return '🔥 Very High';
                                if (value > 80) return '⚡ High';
                                if (value > 50) return '✓ Active';
                                return '💤 Low';
                            }
                        }
                    }
                }
            }
        }
    },
    temperature: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'GPU Temperature',
                    data: [],
                    borderColor: '#f5576c',
                    backgroundColor: 'rgba(245, 87, 108, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#f5576c',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Warning (75°C)',
                    data: [],
                    borderColor: 'rgba(254, 202, 87, 0.6)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    alertRule: 'temperature',
                    defaultThreshold: 85,
                    labelBase: 'Warning',
                    alertType: 'warning'
                },
                {
                    label: 'Danger (85°C)',
                    data: [],
                    borderColor: 'rgba(250, 112, 154, 0.8)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false,
                    alertRule: 'temperature',
                    defaultThreshold: 85,
                    labelBase: 'Danger',
                    alertType: 'danger'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    suggestedMax: 90,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 15,
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + '°C'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#f5576c',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'GPU Temperature';
                        },
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (label.includes('Warning') || label.includes('Danger')) {
                                return label;
                            }
                            return `${label}: ${value.toFixed(1)}°C`;
                        },
                        afterLabel: function(context) {
                            if (!context.dataset.label.includes('Warning') && !context.dataset.label.includes('Danger')) {
                                const value = context.parsed.y;
                                if (value > 85) return '🚨 DANGER';
                                if (value > 75) return '⚠️ Warning';
                                if (value > 60) return '🌡️ Normal';
                                return '❄️ Cool';
                            }
                        }
                    }
                }
            }
        }
    },
    memory: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Memory Usage',
                    data: [],
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#4facfe',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'High Usage (90%)',
                    data: [],
                    borderColor: 'rgba(250, 112, 154, 0.6)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    alertRule: 'memory_percent',
                    defaultThreshold: 90,
                    labelBase: 'High Usage'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 20,
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + '%'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4facfe',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'VRAM Usage';
                        },
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (label.includes('High Usage')) {
                                return label;
                            }
                            return `${label}: ${value.toFixed(1)}%`;
                        },
                        afterLabel: function(context) {
                            if (!context.dataset.label.includes('High Usage')) {
                                const value = context.parsed.y;
                                if (value > 95) return '🚨 Critical';
                                if (value > 90) return '⚠️ Very High';
                                if (value > 75) return '📊 High';
                                return '✓ Normal';
                            }
                        }
                    }
                }
            }
        }
    },
    power: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Power Draw',
                    data: [],
                    borderColor: '#43e97b',
                    backgroundColor: 'rgba(67, 233, 123, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#43e97b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Alert Threshold',
                    data: [],
                    borderColor: 'rgba(250, 112, 154, 0.6)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    alertRule: 'power_draw',
                    defaultThreshold: 0,
                    labelBase: 'Alert Threshold'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    suggestedMax: 200,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 50,
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + ' W'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#43e97b',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'Power Draw';
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            return `Power: ${value.toFixed(1)} W`;
                        },
                        afterLabel: function(context) {
                            const value = context.parsed.y;
                            if (value > 200) return '⚡ Maximum Performance';
                            if (value > 150) return '🔥 High Performance';
                            if (value > 100) return '💪 Active';
                            if (value > 50) return '✓ Moderate';
                            return '💤 Idle';
                        }
                    }
                }
            }
        }
    },
    fanSpeed: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Fan Speed',
                    data: [],
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#38bdf8',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 20,
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + '%'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'Fan Speed';
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            return `Fan Speed: ${value.toFixed(1)}%`;
                        },
                        afterLabel: function(context) {
                            const value = context.parsed.y;
                            if (value > 90) return '🌪️ Maximum';
                            if (value > 70) return '💨 High';
                            if (value > 40) return '🌬️ Active';
                            if (value > 10) return '✓ Low';
                            return '⏸️ Idle';
                        }
                    }
                }
            }
        }
    },
    clocks: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Graphics Clock',
                    data: [],
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#a78bfa',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'SM Clock',
                    data: [],
                    borderColor: '#fb923c',
                    backgroundColor: 'rgba(251, 146, 60, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#fb923c',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Memory Clock',
                    data: [],
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#34d399',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value + ' MHz'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: { size: 11 },
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 10,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#a78bfa',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'Clock Speeds';
                        },
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            return `${label}: ${value.toFixed(0)} MHz`;
                        }
                    }
                }
            }
        }
    },
    efficiency: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Power Efficiency',
                    data: [],
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#fbbf24',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value.toFixed(2) + ' %/W'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#fbbf24',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'Power Efficiency';
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            return `Efficiency: ${value.toFixed(2)} %/W`;
                        },
                        afterLabel: function(context) {
                            const value = context.parsed.y;
                            if (value > 0.8) return '⭐ Excellent';
                            if (value > 0.5) return '✓ Good';
                            if (value > 0.3) return '📊 Fair';
                            if (value > 0.1) return '⚡ Active';
                            return '💤 Idle';
                        }
                    }
                }
            }
        }
    },
    pcie: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'RX Throughput',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'TX Throughput',
                    data: [],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value.toFixed(0) + ' KB/s'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'PCIe Throughput';
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            const label = context.dataset.label;
                            return `${label}: ${value.toFixed(0)} KB/s`;
                        }
                    }
                }
            }
        }
    },
    appclocks: {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Graphics Clock',
                    data: [],
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#4facfe',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Memory Clock',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'SM Clock',
                    data: [],
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#ec4899',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Video Clock',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: { left: 0, right: 10, top: 10, bottom: 0 }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.55)',
                        font: { size: 12 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    min: 0,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.12)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.65)',
                        font: { size: 11 },
                        padding: 8,
                        callback: function(value) { return value.toFixed(0) + ' MHz'; }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4facfe',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        title: function(context) {
                            return 'Application Clocks';
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            const label = context.dataset.label;
                            return `${label}: ${value.toFixed(0)} MHz`;
                        }
                    }
                }
            }
        }
    }
};

// Store charts and data
const charts = {};
const chartData = {};

// Initialize chart data for a GPU
function initGPUData(gpuId) {
    chartData[gpuId] = {
        utilization: { labels: [], data: [], thresholdData: [] },
        temperature: { labels: [], data: [], warningData: [], dangerData: [] },
        memory: { labels: [], data: [], thresholdData: [] },
        power: { labels: [], data: [], thresholdData: [] },
        fanSpeed: { labels: [], data: [] },
        clocks: { labels: [], graphicsData: [], smData: [], memoryData: [] },
        efficiency: { labels: [], data: [] },
        pcie: { labels: [], dataRX: [], dataTX: [] },
        appclocks: { labels: [], dataGr: [], dataMem: [], dataSM: [], dataVideo: [] }
    };
}

// Calculate statistics for chart data
function calculateStats(data) {
    if (data.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
    const current = data[data.length - 1];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    return { min, max, avg, current };
}

// Update statistics display for a chart
function updateChartStats(gpuId, chartType, stats, unit) {
    const currentEl = document.getElementById(`stat-${chartType}-current-${gpuId}`);
    const minEl = document.getElementById(`stat-${chartType}-min-${gpuId}`);
    const maxEl = document.getElementById(`stat-${chartType}-max-${gpuId}`);
    const avgEl = document.getElementById(`stat-${chartType}-avg-${gpuId}`);

    // Use decimal formatting for efficiency values
    const formatter = (value) => {
        if (chartType === 'efficiency') {
            return value.toFixed(2);
        }
        return Math.round(value);
    };

    if (currentEl) currentEl.textContent = `${formatter(stats.current)}${unit}`;
    if (minEl) minEl.textContent = `${formatter(stats.min)}${unit}`;
    if (maxEl) maxEl.textContent = `${formatter(stats.max)}${unit}`;
    if (avgEl) avgEl.textContent = `${formatter(stats.avg)}${unit}`;
}

// Update statistics display for PCIe chart (RX and TX separately)
function updatePCIeChartStats(gpuId, statsRX, statsTX) {
    const unit = ' KB/s';
    const formatter = (value) => Math.round(value);

    // Update RX stats
    const rxCurrentEl = document.getElementById(`stat-pcie-rx-current-${gpuId}`);
    const rxMinEl = document.getElementById(`stat-pcie-rx-min-${gpuId}`);
    const rxMaxEl = document.getElementById(`stat-pcie-rx-max-${gpuId}`);
    const rxAvgEl = document.getElementById(`stat-pcie-rx-avg-${gpuId}`);

    if (rxCurrentEl) rxCurrentEl.textContent = `${formatter(statsRX.current)}${unit}`;
    if (rxMinEl) rxMinEl.textContent = `${formatter(statsRX.min)}${unit}`;
    if (rxMaxEl) rxMaxEl.textContent = `${formatter(statsRX.max)}${unit}`;
    if (rxAvgEl) rxAvgEl.textContent = `${formatter(statsRX.avg)}${unit}`;

    // Update TX stats
    const txCurrentEl = document.getElementById(`stat-pcie-tx-current-${gpuId}`);
    const txMinEl = document.getElementById(`stat-pcie-tx-min-${gpuId}`);
    const txMaxEl = document.getElementById(`stat-pcie-tx-max-${gpuId}`);
    const txAvgEl = document.getElementById(`stat-pcie-tx-avg-${gpuId}`);

    if (txCurrentEl) txCurrentEl.textContent = `${formatter(statsTX.current)}${unit}`;
    if (txMinEl) txMinEl.textContent = `${formatter(statsTX.min)}${unit}`;
    if (txMaxEl) txMaxEl.textContent = `${formatter(statsTX.max)}${unit}`;
    if (txAvgEl) txAvgEl.textContent = `${formatter(statsTX.avg)}${unit}`;
}

// Update chart data
function updateChart(gpuId, chartType, value, value2, value3, value4) {
    if (!chartData[gpuId]) initGPUData(gpuId);

    const data = chartData[gpuId][chartType];
    const now = new Date().toLocaleTimeString();

    data.labels.push(now);
    
    // Handle multi-value charts
    if (chartType === 'clocks') {
        data.graphicsData.push(Number(value) || 0);
        data.smData.push(Number(value2) || 0);
        data.memoryData.push(Number(value3) || 0);
    } else if (chartType === 'pcie') {
        data.dataRX.push(Number(value) || 0);
        data.dataTX.push(Number(value2) || 0);
    } else if (chartType === 'appclocks') {
        data.dataGr.push(Number(value) || 0);
        data.dataMem.push(Number(value2) || 0);
        data.dataSM.push(Number(value3) || 0);
        data.dataVideo.push(Number(value4) || 0);
    } else {
        data.data.push(Number(value) || 0);
    }

    // Add threshold data based on chart type
    if (chartType === 'utilization') {
        const threshold = resolveAlertThreshold('utilization', 80);
        data.thresholdData.push(threshold > 0 ? threshold : null);
    } else if (chartType === 'temperature') {
        const baseThreshold = resolveAlertThreshold('temperature', 85);
        const warningValue = computeTemperatureWarning(baseThreshold);
        data.warningData.push(warningValue);
        data.dangerData.push(baseThreshold > 0 ? baseThreshold : null);
    } else if (chartType === 'memory') {
        const threshold = resolveAlertThreshold('memory_percent', 90);
        data.thresholdData.push(threshold > 0 ? threshold : null);
    } else if (chartType === 'power' && data.thresholdData) {
        const threshold = resolveAlertThreshold('power_draw', 0);
        data.thresholdData.push(threshold > 0 ? threshold : null);
    }

    // Keep only last 120 data points (60 seconds at 0.5s interval)
    if (data.labels.length > 120) {
        data.labels.shift();
        if (data.data) data.data.shift();
        if (data.graphicsData) data.graphicsData.shift();
        if (data.smData) data.smData.shift();
        if (data.memoryData) data.memoryData.shift();
        if (data.dataRX) data.dataRX.shift();
        if (data.dataTX) data.dataTX.shift();
        if (data.dataGr) data.dataGr.shift();
        if (data.dataMem) data.dataMem.shift();
        if (data.dataSM) data.dataSM.shift();
        if (data.dataVideo) data.dataVideo.shift();
        if (data.thresholdData) data.thresholdData.shift();
        if (data.warningData) data.warningData.shift();
        if (data.dangerData) data.dangerData.shift();
    }

    // Calculate and update statistics
    if (chartType === 'pcie') {
        // Handle PCIe separately - need stats for both RX and TX
        const statsRX = calculateStats(data.dataRX);
        const statsTX = calculateStats(data.dataTX);
        updatePCIeChartStats(gpuId, statsRX, statsTX);
    } else {
        let statsData = data.data;
        if (chartType === 'clocks') statsData = data.graphicsData;
        else if (chartType === 'appclocks') statsData = data.dataGr;
        
        const stats = calculateStats(statsData);
        const unitMap = {
            'utilization': '%',
            'util': '%',
            'temperature': '°C',
            'temp': '°C',
            'memory': '%',
            'power': 'W',
            'fanSpeed': '%',
            'clocks': ' MHz',
            'efficiency': ' %/W',
            'appclocks': ' MHz'
        };
        const unit = unitMap[chartType] || '';
        updateChartStats(gpuId, chartType, stats, unit);
    }

    // Update chart if it exists
    if (charts[gpuId] && charts[gpuId][chartType]) {
        charts[gpuId][chartType].update('none');
    }
}

// Initialize utilization background chart
function initUtilBackgroundChart(gpuId) {
    const canvas = document.getElementById(`util-bg-chart-${gpuId}`);
    if (!canvas) return;

    if (!charts[gpuId]) charts[gpuId] = {};
    if (charts[gpuId].utilBackground) return; // Already initialized

    charts[gpuId].utilBackground = new Chart(canvas, {
        type: 'line',
        data: {
            labels: chartData[gpuId].utilization.labels,
            datasets: [{
                data: chartData[gpuId].utilization.data,
                borderColor: 'rgba(79, 172, 254, 0.8)',
                backgroundColor: 'rgba(79, 172, 254, 0.3)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: { display: false, min: 0, max: 100 }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

// Initialize charts for a GPU
function initGPUCharts(gpuId) {
    const chartTypes = ['utilization', 'temperature', 'memory', 'power', 'fanSpeed', 'clocks', 'efficiency', 'pcie', 'appclocks'];
    if (!charts[gpuId]) charts[gpuId] = {};

    // Initialize background utilization chart
    initUtilBackgroundChart(gpuId);

    chartTypes.forEach(type => {
        const canvas = document.getElementById(`chart-${type}-${gpuId}`);
        if (canvas) {
            const config = JSON.parse(JSON.stringify(chartConfigs[type])); // Deep clone

            // Link datasets to chartData
            if (type === 'utilization') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                config.data.datasets[1].data = chartData[gpuId][type].thresholdData;
            } else if (type === 'temperature') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                config.data.datasets[1].data = chartData[gpuId][type].warningData;
                config.data.datasets[2].data = chartData[gpuId][type].dangerData;
            } else if (type === 'memory') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                config.data.datasets[1].data = chartData[gpuId][type].thresholdData;
            } else if (type === 'power') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                config.data.datasets[1].data = chartData[gpuId][type].thresholdData;
            } else if (type === 'clocks') {
                config.data.datasets[0].data = chartData[gpuId][type].graphicsData;
                config.data.datasets[1].data = chartData[gpuId][type].smData;
                config.data.datasets[2].data = chartData[gpuId][type].memoryData;
            } else if (type === 'pcie') {
                config.data.datasets[0].data = chartData[gpuId][type].dataRX;
                config.data.datasets[1].data = chartData[gpuId][type].dataTX;
            } else if (type === 'appclocks') {
                config.data.datasets[0].data = chartData[gpuId][type].dataGr;
                config.data.datasets[1].data = chartData[gpuId][type].dataMem;
                config.data.datasets[2].data = chartData[gpuId][type].dataSM;
                config.data.datasets[3].data = chartData[gpuId][type].dataVideo;
            } else {
                config.data.datasets[0].data = chartData[gpuId][type].data;
            }

            config.data.labels = chartData[gpuId][type].labels;
            charts[gpuId][type] = new Chart(canvas, config);
        }
    });
}

function syncChartThresholds() {
    const dataByGpu = chartData || {};
    Object.keys(dataByGpu).forEach(gpuId => {
        const gpuData = dataByGpu[gpuId];
        if (!gpuData) return;

        if (gpuData.utilization?.thresholdData) {
            const utilThreshold = resolveAlertThreshold('utilization', 80);
            fillSeries(gpuData.utilization.thresholdData, utilThreshold > 0 ? utilThreshold : null);
        }

        if (gpuData.memory?.thresholdData) {
            const memThreshold = resolveAlertThreshold('memory_percent', 90);
            fillSeries(gpuData.memory.thresholdData, memThreshold > 0 ? memThreshold : null);
        }

        if (gpuData.temperature) {
            const tempThreshold = resolveAlertThreshold('temperature', 85);
            const warningValue = computeTemperatureWarning(tempThreshold);
            fillSeries(gpuData.temperature.dangerData, tempThreshold > 0 ? tempThreshold : null);
            fillSeries(gpuData.temperature.warningData, warningValue);
        }

        if (gpuData.power?.thresholdData) {
            const powerThreshold = resolveAlertThreshold('power_draw', 0);
            fillSeries(gpuData.power.thresholdData, powerThreshold > 0 ? powerThreshold : null);
        }
    });

    Object.values(charts).forEach(chartGroup => {
        if (!chartGroup) return;
        Object.values(chartGroup).forEach(chart => {
            if (!chart) return;
            let needsUpdate = false;
            chart.config.data.datasets.forEach(dataset => {
                if (!dataset.alertRule) return;

                const ruleName = dataset.alertRule;
                const base = resolveAlertThreshold(ruleName, dataset.defaultThreshold || 0);
                let renderedValue = base;

                if (dataset.alertType === 'warning') {
                    renderedValue = computeTemperatureWarning(base);
                } else if (typeof dataset.alertOffset === 'number') {
                    renderedValue = base + dataset.alertOffset;
                }

                const showThreshold = typeof renderedValue === 'number' && renderedValue > 0;
                dataset.hidden = !showThreshold;

                if (Array.isArray(dataset.data)) {
                    fillSeries(dataset.data, showThreshold ? renderedValue : null);
                }

                if (dataset.labelBase) {
                    dataset.label = showThreshold
                        ? `${dataset.labelBase} (${formatThresholdValue(ruleName, renderedValue)})`
                        : `${dataset.labelBase} (disabled)`;
                }

                needsUpdate = true;
            });

            if (needsUpdate && chart.update) {
                chart.update('none');
            }
        });
    });
}

window.setAlertSettingsSnapshot = function(settings) {
    if (settings) {
        window.alertSettings.data = settings;
        if (Array.isArray(settings.rules)) {
            const updatedThresholds = { ...(window.alertSettings.thresholds || {}) };
            settings.rules.forEach(rule => {
                if (typeof rule.threshold === 'number' && !Number.isNaN(rule.threshold)) {
                    updatedThresholds[rule.name] = rule.threshold;
                }
            });
            window.alertSettings.thresholds = updatedThresholds;
        }
    }
    syncChartThresholds();
};

window.getAlertSettingsSnapshot = function() {
    return window.alertSettings?.data || null;
};

// Initialize threshold visuals with default values
syncChartThresholds();

// Initialize overview mini chart
function initOverviewMiniChart(gpuId, currentValue) {
    const canvas = document.getElementById(`overview-chart-${gpuId}`);
    if (!canvas) return;

    if (!chartData[gpuId]) initGPUData(gpuId);
    // Pre-fill with a short history so the chart looks alive immediately
    if (chartData[gpuId].utilization.labels.length === 0) {
        const seedValue = Number(currentValue);
        const points = 10; // ~ last 5s at 0.5s interval
        for (let i = points - 1; i >= 0; i--) {
            const t = new Date(Date.now() - i * 500).toLocaleTimeString(); // 0.5s intervals
            chartData[gpuId].utilization.labels.push(t);
            chartData[gpuId].utilization.data.push(Number.isFinite(seedValue) ? seedValue : 0);
            const seedThreshold = resolveAlertThreshold('utilization', 80);
            chartData[gpuId].utilization.thresholdData.push(seedThreshold > 0 ? seedThreshold : null);
        }
    }

    const config = {
        type: 'line',
        data: {
            labels: chartData[gpuId].utilization.labels,
            datasets: [{
                data: chartData[gpuId].utilization.data,
                borderColor: '#4facfe',
                backgroundColor: 'rgba(79, 172, 254, 0.15)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    max: 100,
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: { size: 10 },
                        stepSize: 50,
                        callback: value => value + '%'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: context => `GPU: ${context.parsed.y.toFixed(1)}%`
                    }
                }
            }
        }
    };

    if (!charts[gpuId]) charts[gpuId] = {};
    charts[gpuId].overviewMini = new Chart(canvas, config);
}

// System charts
const systemCharts = {};
const systemData = {
    cpu: { labels: [], data: [] },
    memory: { labels: [], data: [] }
};

// Initialize system charts
function initSystemCharts() {
    const cpuCanvas = document.getElementById('cpu-chart');
    const memCanvas = document.getElementById('memory-chart');

    if (cpuCanvas && !systemCharts.cpu) {
        systemCharts.cpu = new Chart(cpuCanvas, {
            type: 'line',
            data: {
                labels: systemData.cpu.labels,
                datasets: [{
                    data: systemData.cpu.data,
                    borderColor: 'rgba(79, 172, 254, 0.8)',
                    backgroundColor: 'rgba(79, 172, 254, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
    }

    if (memCanvas && !systemCharts.memory) {
        systemCharts.memory = new Chart(memCanvas, {
            type: 'line',
            data: {
                labels: systemData.memory.labels,
                datasets: [{
                    data: systemData.memory.data,
                    borderColor: 'rgba(79, 172, 254, 0.8)',
                    backgroundColor: 'rgba(79, 172, 254, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
    }
}

// Update system info with sparklines
function updateSystemInfo(systemInfo) {
    const cpuEl = document.getElementById('cpu-usage');
    const memEl = document.getElementById('memory-usage');

    if (cpuEl) cpuEl.textContent = `${Math.round(systemInfo.cpu_percent)}%`;
    if (memEl) memEl.textContent = `${Math.round(systemInfo.memory_percent)}%`;

    // Update system chart data
    const now = new Date().toLocaleTimeString();

    systemData.cpu.labels.push(now);
    systemData.cpu.data.push(systemInfo.cpu_percent);
    systemData.memory.labels.push(now);
    systemData.memory.data.push(systemInfo.memory_percent);

    // Keep only last 120 points (60 seconds at 0.5s interval)
    if (systemData.cpu.labels.length > 120) {
        systemData.cpu.labels.shift();
        systemData.cpu.data.shift();
        systemData.memory.labels.shift();
        systemData.memory.data.shift();
    }

    // Initialize charts if needed
    if (!systemCharts.cpu || !systemCharts.memory) {
        initSystemCharts();
    }

    // Update charts
    if (systemCharts.cpu) systemCharts.cpu.update('none');
    if (systemCharts.memory) systemCharts.memory.update('none');
}
