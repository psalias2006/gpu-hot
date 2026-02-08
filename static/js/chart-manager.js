/**
 * Chart management — data storage, updates, initialization
 * GPU Studio edition
 * Requires: chart-config.js loaded first
 */

function isMobile() {
    return window.innerWidth <= 768;
}

// Store charts and data
const charts = {};
const chartData = {};

// Initialize chart data for a GPU with pre-filled baseline
function initGPUData(gpuId, initialValues = {}) {
    const dataPoints = 120; // 60 seconds at 0.5s interval
    const labels = [];

    for (let i = dataPoints - 1; i >= 0; i--) {
        const time = new Date(Date.now() - i * 500);
        labels.push(time.toLocaleTimeString());
    }

    const fill = (value = 0) => new Array(dataPoints).fill(value);

    chartData[gpuId] = {
        utilization: { labels: [...labels], data: fill(initialValues.utilization || 0) },
        temperature: { labels: [...labels], data: fill(initialValues.temperature || 0) },
        memory: { labels: [...labels], data: fill(initialValues.memory || 0) },
        power: { labels: [...labels], data: fill(initialValues.power || 0) },
        fanSpeed: { labels: [...labels], data: fill(initialValues.fanSpeed || 0) },
        clocks: {
            labels: [...labels],
            graphicsData: fill(initialValues.clockGraphics || 0),
            smData: fill(initialValues.clockSm || 0),
            memoryData: fill(initialValues.clockMemory || 0)
        },
        efficiency: { labels: [...labels], data: fill(initialValues.efficiency || 0) },
        pcie: {
            labels: [...labels],
            dataRX: fill(initialValues.pcieRX || 0),
            dataTX: fill(initialValues.pcieTX || 0)
        },
        appclocks: {
            labels: [...labels],
            dataGr: fill(initialValues.appclockGr || 0),
            dataMem: fill(initialValues.appclockMem || 0),
            dataSM: fill(initialValues.appclockSM || 0),
            dataVideo: fill(initialValues.appclockVideo || 0)
        }
    };
}

// Calculate statistics
function calculateStats(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return { min: 0, max: 0, avg: 0, current: 0 };
    }
    const valid = data.filter(val => isFinite(val));
    if (valid.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };

    const current = valid[valid.length - 1];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

    return {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 0,
        avg: isFinite(avg) ? avg : 0,
        current: isFinite(current) ? current : 0
    };
}

// Update stats display
function updateChartStats(gpuId, chartType, stats, unit) {
    const currentEl = document.getElementById(`stat-${chartType}-current-${gpuId}`);
    const minEl = document.getElementById(`stat-${chartType}-min-${gpuId}`);
    const maxEl = document.getElementById(`stat-${chartType}-max-${gpuId}`);
    const avgEl = document.getElementById(`stat-${chartType}-avg-${gpuId}`);

    const fmt = (value) => {
        if (chartType === 'efficiency') return value.toFixed(2);
        return Math.round(value);
    };

    if (currentEl) currentEl.textContent = `${fmt(stats.current)}${unit}`;
    if (minEl) minEl.textContent = `${fmt(stats.min)}${unit}`;
    if (maxEl) maxEl.textContent = `${fmt(stats.max)}${unit}`;
    if (avgEl) avgEl.textContent = `${fmt(stats.avg)}${unit}`;
}

// Update PCIe stats (RX/TX)
function updatePCIeChartStats(gpuId, statsRX, statsTX) {
    const fmtBw = (value) => {
        if (value >= 1000) return `${(value / 1024).toFixed(1)} MB/s`;
        return `${Math.round(value)} KB/s`;
    };

    const rxCurEl = document.getElementById(`stat-pcie-rx-current-${gpuId}`);
    const txCurEl = document.getElementById(`stat-pcie-tx-current-${gpuId}`);

    if (rxCurEl) rxCurEl.textContent = fmtBw(statsRX.current);
    if (txCurEl) txCurEl.textContent = fmtBw(statsTX.current);
}

// Update mobile chart header value
function updateMobileChartValue(gpuId, chartType, value, unit) {
    // No special mobile header in new design — stats show inline
}

// Update chart data
function updateChart(gpuId, chartType, value, value2, value3, value4) {
    if (!gpuId || !chartType) return;
    if (!chartData[gpuId]) initGPUData(gpuId);

    const data = chartData[gpuId][chartType];
    if (!data) return;

    const now = new Date().toLocaleTimeString();
    data.labels.push(now);

    const safe = (val) => {
        const num = Number(val);
        return (isFinite(num) && num >= 0) ? num : 0;
    };

    if (chartType === 'clocks') {
        data.graphicsData.push(safe(value));
        data.smData.push(safe(value2));
        data.memoryData.push(safe(value3));
    } else if (chartType === 'pcie') {
        data.dataRX.push(safe(value));
        data.dataTX.push(safe(value2));
    } else if (chartType === 'appclocks') {
        data.dataGr.push(safe(value));
        data.dataMem.push(safe(value2));
        data.dataSM.push(safe(value3));
        data.dataVideo.push(safe(value4));
    } else {
        data.data.push(safe(value));
    }

    // Rolling window — 120 points
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
    }

    // Stats
    if (chartType === 'pcie') {
        const statsRX = calculateStats(data.dataRX);
        const statsTX = calculateStats(data.dataTX);
        updatePCIeChartStats(gpuId, statsRX, statsTX);
    } else {
        let statsData = data.data;
        if (chartType === 'clocks') statsData = data.graphicsData;
        else if (chartType === 'appclocks') statsData = data.dataGr;

        const stats = calculateStats(statsData);
        const unitMap = {
            'utilization': '%', 'temperature': '°C', 'memory': '%',
            'power': 'W', 'fanSpeed': '%', 'clocks': ' MHz',
            'efficiency': ' %/W', 'appclocks': ' MHz'
        };
        const unit = unitMap[chartType] || '';
        updateChartStats(gpuId, chartType, stats, unit);
    }

    // Render
    if (charts[gpuId] && charts[gpuId][chartType]) {
        try {
            charts[gpuId][chartType].update('none');
        } catch (error) {
            console.error(`Chart update error ${chartType} GPU ${gpuId}:`, error);
        }
    }
}

// Initialize charts for a GPU
function initGPUCharts(gpuId) {
    if (!gpuId) return;

    const chartTypes = ['utilization', 'temperature', 'memory', 'power', 'fanSpeed', 'clocks', 'efficiency', 'pcie', 'appclocks'];
    if (!charts[gpuId]) charts[gpuId] = {};

    chartTypes.forEach(type => {
        const canvas = document.getElementById(`chart-${type}-${gpuId}`);
        if (!canvas) return;

        if (charts[gpuId][type]) {
            try { charts[gpuId][type].destroy(); } catch (e) {}
        }

        const config = JSON.parse(JSON.stringify(chartConfigs[type]));

        // Link data
        if (type === 'clocks') {
            config.data.datasets[0].data = chartData[gpuId][type].graphicsData;
            if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].smData;
            if (config.data.datasets[2]) config.data.datasets[2].data = chartData[gpuId][type].memoryData;
        } else if (type === 'pcie') {
            config.data.datasets[0].data = chartData[gpuId][type].dataRX;
            if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].dataTX;
        } else if (type === 'appclocks') {
            config.data.datasets[0].data = chartData[gpuId][type].dataGr;
            if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].dataMem;
            if (config.data.datasets[2]) config.data.datasets[2].data = chartData[gpuId][type].dataSM;
            if (config.data.datasets[3]) config.data.datasets[3].data = chartData[gpuId][type].dataVideo;
        } else {
            config.data.datasets[0].data = chartData[gpuId][type].data;
        }

        config.data.labels = chartData[gpuId][type].labels;

        // Mobile: simplify
        if (isMobile()) {
            config.data.datasets[0].borderWidth = 2;
            for (let i = 1; i < config.data.datasets.length; i++) {
                config.data.datasets[i].hidden = true;
            }
            if (config.options.scales.y) {
                config.options.scales.y.display = false;
            }
        }

        try {
            charts[gpuId][type] = new Chart(canvas, config);
        } catch (error) {
            console.error(`Chart init error ${type} GPU ${gpuId}:`, error);
        }
    });
}

// Overview mini sparkline
function initOverviewMiniChart(gpuId, currentValue) {
    if (!gpuId) return;

    const canvas = document.getElementById(`overview-chart-${gpuId}`);
    if (!canvas) return;

    if (charts[gpuId] && charts[gpuId].overviewMini) {
        try { charts[gpuId].overviewMini.destroy(); } catch (e) {}
    }

    if (!chartData[gpuId]) {
        initGPUData(gpuId, { utilization: currentValue });
    }

    const config = {
        type: 'line',
        data: {
            labels: chartData[gpuId].utilization.labels,
            datasets: [{
                data: chartData[gpuId].utilization.data,
                borderColor: 'rgba(255, 255, 255, 0.3)',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                tension: 0.3,
                fill: false,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { display: false },
                y: { display: false, min: 0, max: 100 }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    };

    if (!charts[gpuId]) charts[gpuId] = {};

    try {
        charts[gpuId].overviewMini = new Chart(canvas, config);
    } catch (error) {
        console.error(`Overview chart error GPU ${gpuId}:`, error);
    }
}

// System charts
const systemCharts = {};
const systemData = {
    cpu: { labels: [], data: [] },
    memory: { labels: [], data: [] }
};

function initSystemCharts() {
    const cpuCanvas = document.getElementById('cpu-chart');
    const memCanvas = document.getElementById('memory-chart');

    const sysChartOpts = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            x: { display: false },
            y: { display: false, min: 0, max: 100 }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
        }
    };

    if (cpuCanvas && !systemCharts.cpu) {
        systemCharts.cpu = new Chart(cpuCanvas, {
            type: 'line',
            data: {
                labels: systemData.cpu.labels,
                datasets: [{
                    data: systemData.cpu.data,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: sysChartOpts
        });
    }

    if (memCanvas && !systemCharts.memory) {
        systemCharts.memory = new Chart(memCanvas, {
            type: 'line',
            data: {
                labels: systemData.memory.labels,
                datasets: [{
                    data: systemData.memory.data,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: sysChartOpts
        });
    }
}

function updateSystemInfo(systemInfo) {
    const cpuEl = document.getElementById('cpu-usage');
    const memEl = document.getElementById('memory-usage');

    if (cpuEl) cpuEl.textContent = `${Math.round(systemInfo.cpu_percent)}%`;
    if (memEl) memEl.textContent = `${Math.round(systemInfo.memory_percent)}%`;

    const now = new Date().toLocaleTimeString();

    systemData.cpu.labels.push(now);
    systemData.cpu.data.push(systemInfo.cpu_percent);
    systemData.memory.labels.push(now);
    systemData.memory.data.push(systemInfo.memory_percent);

    if (systemData.cpu.labels.length > 120) {
        systemData.cpu.labels.shift();
        systemData.cpu.data.shift();
        systemData.memory.labels.shift();
        systemData.memory.data.shift();
    }

    if (!systemCharts.cpu || !systemCharts.memory) {
        initSystemCharts();
    }

    if (systemCharts.cpu) systemCharts.cpu.update('none');
    if (systemCharts.memory) systemCharts.memory.update('none');
}
