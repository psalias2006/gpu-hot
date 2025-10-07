/**
 * Chart configurations and chart-related functions
 */

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
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    pointBackgroundColor: '#667eea',
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
                    fill: false
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
                    borderColor: '#667eea',
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
                    fill: false
                },
                {
                    label: 'Danger (85°C)',
                    data: [],
                    borderColor: 'rgba(250, 112, 154, 0.8)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false
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
                    fill: false
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
        power: { labels: [], data: [] }
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

    if (currentEl) currentEl.textContent = `${Math.round(stats.current)}${unit}`;
    if (minEl) minEl.textContent = `${Math.round(stats.min)}${unit}`;
    if (maxEl) maxEl.textContent = `${Math.round(stats.max)}${unit}`;
    if (avgEl) avgEl.textContent = `${Math.round(stats.avg)}${unit}`;
}

// Update chart data
function updateChart(gpuId, chartType, value) {
    if (!chartData[gpuId]) initGPUData(gpuId);

    const data = chartData[gpuId][chartType];
    const now = new Date().toLocaleTimeString();

    data.labels.push(now);
    data.data.push(Number(value) || 0);

    // Add threshold data based on chart type
    if (chartType === 'utilization') {
        data.thresholdData.push(80); // High load threshold at 80%
    } else if (chartType === 'temperature') {
        data.warningData.push(75); // Warning at 75°C
        data.dangerData.push(85);  // Danger at 85°C
    } else if (chartType === 'memory') {
        data.thresholdData.push(90); // High usage at 90%
    }

    // Keep only last 30 data points for smoother performance
    if (data.labels.length > 30) {
        data.labels.shift();
        data.data.shift();
        if (data.thresholdData) data.thresholdData.shift();
        if (data.warningData) data.warningData.shift();
        if (data.dangerData) data.dangerData.shift();
    }

    // Calculate and update statistics
    const stats = calculateStats(data.data);
    const unitMap = {
        'utilization': '%',
        'util': '%',
        'temperature': '°C',
        'temp': '°C',
        'memory': '%',
        'power': 'W'
    };
    const unit = unitMap[chartType] || '';
    updateChartStats(gpuId, chartType, stats, unit);

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
                borderColor: 'rgba(102, 126, 234, 0.8)',
                backgroundColor: 'rgba(102, 126, 234, 0.3)',
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
    const chartTypes = ['utilization', 'temperature', 'memory', 'power'];
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
            } else {
                config.data.datasets[0].data = chartData[gpuId][type].data;
            }

            config.data.labels = chartData[gpuId][type].labels;
            charts[gpuId][type] = new Chart(canvas, config);
        }
    });
}

// Initialize overview mini chart
function initOverviewMiniChart(gpuId, currentValue) {
    const canvas = document.getElementById(`overview-chart-${gpuId}`);
    if (!canvas) return;

    if (!chartData[gpuId]) initGPUData(gpuId);
    // Pre-fill with a short history so the chart looks alive immediately
    if (chartData[gpuId].utilization.labels.length === 0) {
        const seedValue = Number(currentValue);
        const points = 10; // ~ last 20s based on 2s updates
        for (let i = points - 1; i >= 0; i--) {
            const t = new Date(Date.now() - i * 2000).toLocaleTimeString();
            chartData[gpuId].utilization.labels.push(t);
            chartData[gpuId].utilization.data.push(Number.isFinite(seedValue) ? seedValue : 0);
            chartData[gpuId].utilization.thresholdData.push(80); // Pre-fill threshold data
        }
    }

    const config = {
        type: 'line',
        data: {
            labels: chartData[gpuId].utilization.labels,
            datasets: [{
                data: chartData[gpuId].utilization.data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.15)',
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
                    borderColor: 'rgba(102, 126, 234, 0.8)',
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
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

    // Keep only last 20 points
    if (systemData.cpu.labels.length > 20) {
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
