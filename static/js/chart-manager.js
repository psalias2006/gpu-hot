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
        },
        // System metrics (per-GPU, tied to the node this GPU runs on)
        systemCpu: { labels: [...labels], data: fill(0) },
        systemMemory: { labels: [...labels], data: fill(0) },
        systemSwap: { labels: [...labels], data: fill(0) },
        systemNetIo: { labels: [...labels], dataRX: fill(0), dataTX: fill(0) },
        systemDiskIo: { labels: [...labels], dataRead: fill(0), dataWrite: fill(0) },
        systemLoadAvg: { labels: [...labels], data1m: fill(0), data5m: fill(0), data15m: fill(0) }
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

    const chartTypes = [
        'utilization', 'temperature', 'memory', 'power', 'fanSpeed', 'clocks', 'efficiency', 'pcie', 'appclocks',
        'systemCpu', 'systemMemory', 'systemSwap', 'systemNetIo', 'systemDiskIo', 'systemLoadAvg'
    ];
    if (!charts[gpuId]) charts[gpuId] = {};

    chartTypes.forEach(type => {
        const canvas = document.getElementById(`chart-${type}-${gpuId}`);
        if (!canvas) return;

        if (charts[gpuId][type]) {
            try { charts[gpuId][type].destroy(); } catch (e) {}
        }

        const config = JSON.parse(JSON.stringify(chartConfigs[type]));
        const typeData = chartData[gpuId][type];

        // Link data
        if (type === 'clocks') {
            config.data.datasets[0].data = typeData.graphicsData;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.smData;
            if (config.data.datasets[2]) config.data.datasets[2].data = typeData.memoryData;
        } else if (type === 'pcie') {
            config.data.datasets[0].data = typeData.dataRX;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.dataTX;
        } else if (type === 'appclocks') {
            config.data.datasets[0].data = typeData.dataGr;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.dataMem;
            if (config.data.datasets[2]) config.data.datasets[2].data = typeData.dataSM;
            if (config.data.datasets[3]) config.data.datasets[3].data = typeData.dataVideo;
        } else if (type === 'systemNetIo') {
            config.data.datasets[0].data = typeData.dataRX;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.dataTX;
        } else if (type === 'systemDiskIo') {
            config.data.datasets[0].data = typeData.dataRead;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.dataWrite;
        } else if (type === 'systemLoadAvg') {
            config.data.datasets[0].data = typeData.data1m;
            if (config.data.datasets[1]) config.data.datasets[1].data = typeData.data5m;
            if (config.data.datasets[2]) config.data.datasets[2].data = typeData.data15m;
        } else {
            config.data.datasets[0].data = typeData.data;
        }

        config.data.labels = typeData.labels;

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

// ============================================
// System Charts — Sidebar (mini) + Per-GPU (sparklines)
// ============================================

const systemCharts = {};
const systemData = {
    cpu: { labels: [], data: [] },
    memory: { labels: [], data: [] }
};

// Per-source cumulative counter tracking for rate calculation (keyed by sourceKey)
const _prevSystemCounters = {};

// Sidebar mini charts (CPU/RAM)
function initSidebarCharts() {
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

// Sidebar-only update (CPU/RAM text + mini charts)
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

    if (!systemCharts.cpu || !systemCharts.memory) initSidebarCharts();
    if (systemCharts.cpu) systemCharts.cpu.update('none');
    if (systemCharts.memory) systemCharts.memory.update('none');
}

// Format bandwidth values
function fmtBandwidth(kbps) {
    if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
    return `${Math.round(kbps)} KB/s`;
}

/**
 * Update per-GPU system charts (called once per GPU per tick)
 * @param {string} gpuId - GPU identifier
 * @param {object} systemInfo - system metrics from backend
 * @param {string} sourceKey - rate-tracking key ('_local' or node name)
 * @param {boolean} shouldUpdateDOM - whether to update stat text elements
 */
function updateGPUSystemCharts(gpuId, systemInfo, sourceKey, shouldUpdateDOM) {
    if (!chartData[gpuId]) return;
    if (!systemInfo) return;

    const now = new Date().toLocaleTimeString();
    const nowMs = Date.now();

    // --- Compute rates once per source per tick ---
    if (!_prevSystemCounters[sourceKey]) {
        _prevSystemCounters[sourceKey] = { timestamp: null };
    }
    const prev = _prevSystemCounters[sourceKey];
    let netRxKBps = 0, netTxKBps = 0, diskReadKBps = 0, diskWriteKBps = 0;
    let hasNetRate = false, hasDiskRate = false;

    // Only compute if this source hasn't been updated this tick (within 50ms)
    const isNewTick = !prev._lastTick || (nowMs - prev._lastTick) > 50;

    if (isNewTick && prev.timestamp !== null) {
        const dtSec = (nowMs - prev.timestamp) / 1000;
        if (dtSec > 0) {
            if (systemInfo.net_bytes_recv !== undefined && prev.net_bytes_recv !== undefined) {
                netRxKBps = Math.max(((systemInfo.net_bytes_recv - prev.net_bytes_recv) / 1024) / dtSec, 0);
                netTxKBps = Math.max(((systemInfo.net_bytes_sent - prev.net_bytes_sent) / 1024) / dtSec, 0);
                hasNetRate = true;
            }
            if (systemInfo.disk_read_bytes !== undefined && prev.disk_read_bytes !== undefined) {
                diskReadKBps = Math.max(((systemInfo.disk_read_bytes - prev.disk_read_bytes) / 1024) / dtSec, 0);
                diskWriteKBps = Math.max(((systemInfo.disk_write_bytes - prev.disk_write_bytes) / 1024) / dtSec, 0);
                hasDiskRate = true;
            }
        }
        // Cache computed rates
        prev._cachedNet = { rx: netRxKBps, tx: netTxKBps, valid: hasNetRate };
        prev._cachedDisk = { read: diskReadKBps, write: diskWriteKBps, valid: hasDiskRate };
    } else if (!isNewTick && prev._cachedNet) {
        // Reuse cached rates for same tick (other GPUs on same node)
        netRxKBps = prev._cachedNet.rx;
        netTxKBps = prev._cachedNet.tx;
        hasNetRate = prev._cachedNet.valid;
        diskReadKBps = prev._cachedDisk.read;
        diskWriteKBps = prev._cachedDisk.write;
        hasDiskRate = prev._cachedDisk.valid;
    }

    if (isNewTick) {
        prev.net_bytes_sent = systemInfo.net_bytes_sent;
        prev.net_bytes_recv = systemInfo.net_bytes_recv;
        prev.disk_read_bytes = systemInfo.disk_read_bytes;
        prev.disk_write_bytes = systemInfo.disk_write_bytes;
        prev.timestamp = nowMs;
        prev._lastTick = nowMs;
    }

    // --- Push data to per-GPU chart arrays ---
    const trim = (obj, ...keys) => {
        if (obj.labels.length > 120) {
            obj.labels.shift();
            keys.forEach(k => { if (obj[k]) obj[k].shift(); });
        }
    };

    // CPU
    const cpuData = chartData[gpuId].systemCpu;
    cpuData.labels.push(now);
    cpuData.data.push(systemInfo.cpu_percent);
    trim(cpuData, 'data');

    // Memory
    const memData = chartData[gpuId].systemMemory;
    memData.labels.push(now);
    memData.data.push(systemInfo.memory_percent);
    trim(memData, 'data');

    // Swap
    if (systemInfo.swap_percent !== undefined) {
        const swapData = chartData[gpuId].systemSwap;
        swapData.labels.push(now);
        swapData.data.push(systemInfo.swap_percent);
        trim(swapData, 'data');
    }

    // Network I/O
    if (hasNetRate) {
        const netData = chartData[gpuId].systemNetIo;
        netData.labels.push(now);
        netData.dataRX.push(netRxKBps);
        netData.dataTX.push(netTxKBps);
        trim(netData, 'dataRX', 'dataTX');
    }

    // Disk I/O
    if (hasDiskRate) {
        const diskData = chartData[gpuId].systemDiskIo;
        diskData.labels.push(now);
        diskData.dataRead.push(diskReadKBps);
        diskData.dataWrite.push(diskWriteKBps);
        trim(diskData, 'dataRead', 'dataWrite');
    }

    // Load Average
    if (systemInfo.load_avg_1 !== undefined) {
        const loadData = chartData[gpuId].systemLoadAvg;
        loadData.labels.push(now);
        loadData.data1m.push(systemInfo.load_avg_1);
        loadData.data5m.push(systemInfo.load_avg_5);
        loadData.data15m.push(systemInfo.load_avg_15);
        trim(loadData, 'data1m', 'data5m', 'data15m');
    }

    // --- Update chart renders ---
    const sysTypes = ['systemCpu', 'systemMemory', 'systemSwap', 'systemNetIo', 'systemDiskIo', 'systemLoadAvg'];
    sysTypes.forEach(t => {
        if (charts[gpuId] && charts[gpuId][t]) {
            try { charts[gpuId][t].update('none'); } catch (e) {}
        }
    });

    // --- Update stats + DOM (throttled) ---
    if (shouldUpdateDOM) {
        // CPU stats
        updateChartStats(gpuId, 'systemCpu', calculateStats(cpuData.data), '%');
        // Memory stats
        updateChartStats(gpuId, 'systemMemory', calculateStats(memData.data), '%');
        // Memory sublabel
        const memSubEl = document.getElementById(`sys-mem-sub-${gpuId}`);
        if (memSubEl && systemInfo.memory_used_gb !== undefined) {
            memSubEl.textContent = `${systemInfo.memory_used_gb} / ${systemInfo.memory_total_gb} GB`;
        }
        // Swap stats
        if (systemInfo.swap_percent !== undefined) {
            updateChartStats(gpuId, 'systemSwap', calculateStats(chartData[gpuId].systemSwap.data), '%');
        }
        // Network I/O stats
        if (hasNetRate) {
            const rxCurEl = document.getElementById(`stat-systemNetIo-rx-current-${gpuId}`);
            const txCurEl = document.getElementById(`stat-systemNetIo-tx-current-${gpuId}`);
            if (rxCurEl) rxCurEl.textContent = fmtBandwidth(netRxKBps);
            if (txCurEl) txCurEl.textContent = fmtBandwidth(netTxKBps);
        }
        // Disk I/O stats
        if (hasDiskRate) {
            const readCurEl = document.getElementById(`stat-systemDiskIo-read-current-${gpuId}`);
            const writeCurEl = document.getElementById(`stat-systemDiskIo-write-current-${gpuId}`);
            if (readCurEl) readCurEl.textContent = fmtBandwidth(diskReadKBps);
            if (writeCurEl) writeCurEl.textContent = fmtBandwidth(diskWriteKBps);
        }
        // Load Average stats
        if (systemInfo.load_avg_1 !== undefined) {
            const loadStats = calculateStats(chartData[gpuId].systemLoadAvg.data1m);
            const fmt2 = (v) => v.toFixed(2);
            const lCur = document.getElementById(`stat-systemLoadAvg-current-${gpuId}`);
            const lMin = document.getElementById(`stat-systemLoadAvg-min-${gpuId}`);
            const lMax = document.getElementById(`stat-systemLoadAvg-max-${gpuId}`);
            const lAvg = document.getElementById(`stat-systemLoadAvg-avg-${gpuId}`);
            if (lCur) lCur.textContent = fmt2(loadStats.current);
            if (lMin) lMin.textContent = fmt2(loadStats.min);
            if (lMax) lMax.textContent = fmt2(loadStats.max);
            if (lAvg) lAvg.textContent = fmt2(loadStats.avg);
        }

        // Show/hide conditional sections
        const swapSec = document.getElementById(`sys-swap-${gpuId}`);
        if (swapSec) swapSec.style.display = systemInfo.swap_percent !== undefined ? '' : 'none';
        const netSec = document.getElementById(`sys-net-${gpuId}`);
        if (netSec) netSec.style.display = systemInfo.net_bytes_recv !== undefined ? '' : 'none';
        const diskSec = document.getElementById(`sys-disk-${gpuId}`);
        if (diskSec) diskSec.style.display = systemInfo.disk_read_bytes !== undefined ? '' : 'none';
        const loadSec = document.getElementById(`sys-load-${gpuId}`);
        if (loadSec) loadSec.style.display = systemInfo.load_avg_1 !== undefined ? '' : 'none';
    }
}
