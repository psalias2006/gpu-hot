/**
 * Chart Drawer — Correlation View
 * Shows primary metric overlaid with a selectable companion metric
 * for cause-and-effect analysis across a shared time axis.
 */

// ============================================
// Drawer state
// ============================================

let drawerChart = null;
let drawerOpen = false;
let drawerGpuId = null;
let drawerChartType = null;
let drawerCompanionType = null;
let drawerUpdateInterval = null;

// ============================================
// Companion styling
// ============================================

const COMPANION = {
    line: 'rgba(255, 170, 50, 0.50)',
    lineBright: 'rgba(255, 170, 50, 0.70)',
    tick: 'rgba(255, 170, 50, 0.30)',
    chip: 'rgba(255, 170, 50, 0.12)',
    chipBorder: 'rgba(255, 170, 50, 0.35)',
    chipText: 'rgba(255, 170, 50, 0.80)',
};

// ============================================
// Chart type metadata
// ============================================

const chartMeta = {
    utilization:   { title: 'GPU Utilization',   unit: '%',     decimals: 1, yMax: 100 },
    temperature:   { title: 'Temperature',       unit: '°C',    decimals: 1, ySuggestedMax: 90 },
    memory:        { title: 'VRAM Usage',        unit: '%',     decimals: 1, yMax: 100 },
    power:         { title: 'Power Draw',        unit: 'W',     decimals: 1, ySuggestedMax: 200 },
    fanSpeed:      { title: 'Fan Speed',         unit: '%',     decimals: 1, yMax: 100 },
    clocks:        { title: 'Clock Speeds',      unit: ' MHz',  decimals: 0 },
    efficiency:    { title: 'Power Efficiency',  unit: ' %/W',  decimals: 2 },
    pcie:          { title: 'PCIe Throughput',   unit: ' KB/s', decimals: 0 },
    appclocks:     { title: 'App Clocks',        unit: ' MHz',  decimals: 0 },
    systemCpu:     { title: 'CPU Usage',         unit: '%',     decimals: 1, yMax: 100 },
    systemMemory:  { title: 'RAM Usage',         unit: '%',     decimals: 1, yMax: 100 },
    systemSwap:    { title: 'Swap Usage',        unit: '%',     decimals: 1, yMax: 100 },
    systemNetIo:   { title: 'Network I/O',       unit: ' KB/s', decimals: 1 },
    systemDiskIo:  { title: 'Disk I/O',          unit: ' KB/s', decimals: 1 },
    systemLoadAvg: { title: 'Load Average',      unit: '',      decimals: 2, ySuggestedMax: 4 },
};

// ============================================
// Companion mappings  [default, ...rest]
// ============================================

const companionMap = {
    utilization:   ['temperature', 'power', 'memory', 'clocks'],
    temperature:   ['utilization', 'fanSpeed', 'power'],
    memory:        ['utilization', 'power'],
    power:         ['utilization', 'temperature', 'clocks'],
    fanSpeed:      ['temperature', 'utilization'],
    clocks:        ['utilization', 'power', 'temperature'],
    efficiency:    ['utilization', 'power'],
    pcie:          ['utilization', 'memory'],
    appclocks:     ['utilization', 'power'],
    systemCpu:     ['systemMemory', 'systemSwap', 'systemLoadAvg'],
    systemMemory:  ['systemCpu', 'systemSwap'],
    systemSwap:    ['systemMemory', 'systemCpu'],
    systemNetIo:   ['systemCpu', 'systemDiskIo'],
    systemDiskIo:  ['systemCpu', 'systemNetIo'],
    systemLoadAvg: ['systemCpu', 'systemMemory'],
};

// ============================================
// Helpers
// ============================================

/** Return the primary data array for a chart type */
function getPrimaryDataArray(gpuId, type) {
    const d = chartData[gpuId] && chartData[gpuId][type];
    if (!d) return null;
    switch (type) {
        case 'clocks':        return d.graphicsData;
        case 'pcie':          return d.dataRX;
        case 'appclocks':     return d.dataGr;
        case 'systemNetIo':   return d.dataRX;
        case 'systemDiskIo':  return d.dataRead;
        case 'systemLoadAvg': return d.data1m;
        default:              return d.data;
    }
}

/** Format a value according to its chart type metadata */
function fmtValue(val, meta) {
    if (!meta) return val;
    return (meta.decimals > 0 ? val.toFixed(meta.decimals) : Math.round(val)) + meta.unit;
}

// ============================================
// Open / Close
// ============================================

function openChartDrawer(gpuId, chartType) {
    const meta = chartMeta[chartType];
    if (!meta || !chartData[gpuId]) return;

    drawerGpuId = gpuId;
    drawerChartType = chartType;

    // Default companion
    const companions = companionMap[chartType] || [];
    drawerCompanionType = companions[0] || null;

    // Header
    document.getElementById('drawer-title').textContent = meta.title;
    document.getElementById('drawer-hero-unit').textContent = meta.unit;

    // Build everything
    updateDrawerHero();
    createDrawerChart();
    renderCompanionChips();
    updateDrawerStats();

    // Slide open
    document.getElementById('drawer-overlay').classList.add('open');
    document.getElementById('chart-drawer').classList.add('open');
    drawerOpen = true;

    // Live refresh every 500 ms
    drawerUpdateInterval = setInterval(() => {
        if (!drawerOpen) return;
        updateDrawerChartData();
        updateDrawerHero();
        updateDrawerStats();
    }, 500);
}

function closeChartDrawer() {
    document.getElementById('drawer-overlay').classList.remove('open');
    document.getElementById('chart-drawer').classList.remove('open');
    drawerOpen = false;
    drawerGpuId = null;
    drawerChartType = null;
    drawerCompanionType = null;

    if (drawerUpdateInterval) {
        clearInterval(drawerUpdateInterval);
        drawerUpdateInterval = null;
    }
    if (drawerChart) {
        drawerChart.destroy();
        drawerChart = null;
    }
}

// ============================================
// Create dual-axis correlation chart
// ============================================

function createDrawerChart() {
    const canvas = document.getElementById('drawer-chart-canvas');
    if (!canvas) return;

    if (drawerChart) {
        drawerChart.destroy();
        drawerChart = null;
    }

    const gpuId = drawerGpuId;
    const chartType = drawerChartType;
    const companionType = drawerCompanionType;

    const primaryStore = chartData[gpuId] && chartData[gpuId][chartType];
    if (!primaryStore) return;

    const pMeta = chartMeta[chartType];
    const cMeta = companionType ? chartMeta[companionType] : null;

    // --- Build primary datasets ---
    const datasets = [];
    const primaryArr = getPrimaryDataArray(gpuId, chartType);

    // Multi-line primary types get all their sub-lines
    const isMultiLine = ['clocks', 'pcie', 'appclocks', 'systemNetIo', 'systemDiskIo', 'systemLoadAvg'].includes(chartType);

    if (isMultiLine) {
        const multiDefs = {
            clocks:        [{ key: 'graphicsData', label: 'Graphics' }, { key: 'smData', label: 'SM' }, { key: 'memoryData', label: 'Memory' }],
            pcie:          [{ key: 'dataRX', label: 'RX' }, { key: 'dataTX', label: 'TX' }],
            appclocks:     [{ key: 'dataGr', label: 'Graphics' }, { key: 'dataMem', label: 'Memory' }, { key: 'dataSM', label: 'SM' }, { key: 'dataVideo', label: 'Video' }],
            systemNetIo:   [{ key: 'dataRX', label: 'RX' }, { key: 'dataTX', label: 'TX' }],
            systemDiskIo:  [{ key: 'dataRead', label: 'Read' }, { key: 'dataWrite', label: 'Write' }],
            systemLoadAvg: [{ key: 'data1m', label: '1m' }, { key: 'data5m', label: '5m' }, { key: 'data15m', label: '15m' }],
        };
        const whiteAlphas = [0.6, 0.3, 0.18, 0.12];
        (multiDefs[chartType] || []).forEach((def, i) => {
            datasets.push({
                label: def.label,
                data: primaryStore[def.key],
                borderColor: `rgba(255, 255, 255, ${whiteAlphas[i] || 0.12})`,
                backgroundColor: i === 0 ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                borderWidth: i === 0 ? 2 : 1.5,
                tension: 0.3,
                fill: i === 0,
                pointRadius: 0,
                pointHitRadius: 8,
                yAxisID: 'y',
            });
        });
    } else {
        datasets.push({
            label: pMeta.title,
            data: primaryArr,
            borderColor: 'rgba(255, 255, 255, 0.6)',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHitRadius: 8,
            yAxisID: 'y',
        });
    }

    // --- Companion dataset ---
    if (companionType && chartData[gpuId][companionType]) {
        const companionArr = getPrimaryDataArray(gpuId, companionType);
        if (companionArr) {
            datasets.push({
                label: cMeta.title,
                data: companionArr,
                borderColor: COMPANION.line,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderDash: [4, 3],
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                pointHitRadius: 8,
                yAxisID: 'y2',
            });
        }
    }

    // --- Scales ---
    const scales = {
        x: {
            display: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
                color: 'rgba(255, 255, 255, 0.15)',
                font: { size: 9, family: "'SF Mono', 'Menlo', monospace" },
                maxTicksLimit: 6,
                maxRotation: 0,
                padding: 8,
            },
        },
        y: {
            display: true,
            position: 'left',
            min: 0,
            grid: { color: 'rgba(255, 255, 255, 0.04)', lineWidth: 1 },
            ticks: {
                color: 'rgba(255, 255, 255, 0.25)',
                font: { size: 10, family: "'SF Mono', 'Menlo', monospace" },
                maxTicksLimit: 5,
                padding: 12,
                callback: (v) => v + (pMeta.unit || ''),
            },
            border: { display: false },
        },
    };

    if (pMeta.yMax !== undefined) scales.y.max = pMeta.yMax;
    if (pMeta.ySuggestedMax !== undefined) scales.y.suggestedMax = pMeta.ySuggestedMax;

    // Right axis for companion
    if (companionType && cMeta) {
        scales.y2 = {
            display: true,
            position: 'right',
            min: 0,
            grid: { display: false },
            ticks: {
                color: COMPANION.tick,
                font: { size: 10, family: "'SF Mono', 'Menlo', monospace" },
                maxTicksLimit: 5,
                padding: 12,
                callback: (v) => v + (cMeta.unit || ''),
            },
            border: { display: false },
        };
        if (cMeta.yMax !== undefined) scales.y2.max = cMeta.yMax;
        if (cMeta.ySuggestedMax !== undefined) scales.y2.suggestedMax = cMeta.ySuggestedMax;
    }

    // --- Config ---
    const config = {
        type: 'line',
        data: { labels: primaryStore.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { intersect: false, mode: 'index' },
            elements: {
                point: { radius: 0, hitRadius: 8 },
                line: { borderCapStyle: 'round', borderJoinStyle: 'round' },
            },
            layout: { padding: { left: 0, right: 0, top: 8, bottom: 0 } },
            scales,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.35)',
                        font: { size: 10 },
                        boxWidth: 12,
                        boxHeight: 2,
                        padding: 10,
                        usePointStyle: false,
                    },
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#222222',
                    titleColor: '#ffffff',
                    bodyColor: 'rgba(255,255,255,0.7)',
                    borderWidth: 0,
                    padding: 10,
                    cornerRadius: 4,
                    titleFont: { size: 10, weight: '600' },
                    bodyFont: { size: 12, weight: '600', family: "'SF Mono', 'Menlo', monospace" },
                    displayColors: true,
                    callbacks: {
                        label: function (ctx) {
                            const isCompanion = ctx.dataset.yAxisID === 'y2';
                            const meta = isCompanion ? cMeta : pMeta;
                            if (!meta) return '';
                            const val = ctx.parsed.y;
                            return `${ctx.dataset.label}: ${fmtValue(val, meta)}`;
                        },
                    },
                },
            },
        },
    };

    drawerChart = new Chart(canvas, config);
}

// ============================================
// Companion selector chips
// ============================================

function renderCompanionChips() {
    const container = document.getElementById('drawer-companions');
    const companions = companionMap[drawerChartType] || [];

    if (companions.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML =
        '<span class="drawer-companions-label">Compare with</span>' +
        companions.map(type => {
            const meta = chartMeta[type];
            if (!meta) return '';
            const active = type === drawerCompanionType ? ' active' : '';
            return `<button class="drawer-companion-chip${active}" data-companion="${type}">${meta.title}</button>`;
        }).join('');
}

function switchCompanion(companionType) {
    if (!drawerGpuId || !drawerChartType) return;
    drawerCompanionType = companionType;

    createDrawerChart();
    renderCompanionChips();
    updateDrawerStats();
}

// ============================================
// Hero current value
// ============================================

function updateDrawerHero() {
    const meta = chartMeta[drawerChartType];
    if (!meta) return;

    const heroEl = document.getElementById('drawer-hero-value');
    if (!heroEl) return;

    const arr = getPrimaryDataArray(drawerGpuId, drawerChartType);
    if (arr && arr.length > 0) {
        const val = arr[arr.length - 1];
        heroEl.textContent = meta.decimals > 0 ? val.toFixed(meta.decimals) : Math.round(val);
        return;
    }
    heroEl.textContent = '--';
}

// ============================================
// Live chart refresh
// ============================================

function updateDrawerChartData() {
    if (!drawerChart) return;
    try { drawerChart.update('none'); } catch (e) { /* destroyed */ }
}

// ============================================
// Dual-metric stats bar
// ============================================

function updateDrawerStats() {
    const container = document.getElementById('drawer-stats');
    const pMeta = chartMeta[drawerChartType];
    if (!pMeta) return;

    const pArr = getPrimaryDataArray(drawerGpuId, drawerChartType);
    const pStats = calculateStats(pArr);

    let html = `
        <div class="drawer-stats-group">
            <div class="drawer-stats-group-label">${pMeta.title}</div>
            <div class="drawer-stats-row">
                <div class="drawer-stat"><div class="drawer-stat-label">MIN</div><div class="drawer-stat-value">${fmtValue(pStats.min, pMeta)}</div></div>
                <div class="drawer-stat"><div class="drawer-stat-label">MAX</div><div class="drawer-stat-value">${fmtValue(pStats.max, pMeta)}</div></div>
                <div class="drawer-stat"><div class="drawer-stat-label">AVG</div><div class="drawer-stat-value">${fmtValue(pStats.avg, pMeta)}</div></div>
            </div>
        </div>`;

    if (drawerCompanionType) {
        const cMeta = chartMeta[drawerCompanionType];
        const cArr = getPrimaryDataArray(drawerGpuId, drawerCompanionType);
        if (cMeta && cArr) {
            const cStats = calculateStats(cArr);
            html += `
        <div class="drawer-stats-group companion">
            <div class="drawer-stats-group-label">${cMeta.title}</div>
            <div class="drawer-stats-row">
                <div class="drawer-stat"><div class="drawer-stat-label">MIN</div><div class="drawer-stat-value">${fmtValue(cStats.min, cMeta)}</div></div>
                <div class="drawer-stat"><div class="drawer-stat-label">MAX</div><div class="drawer-stat-value">${fmtValue(cStats.max, cMeta)}</div></div>
                <div class="drawer-stat"><div class="drawer-stat-label">AVG</div><div class="drawer-stat-value">${fmtValue(cStats.avg, cMeta)}</div></div>
            </div>
        </div>`;
        }
    }

    container.innerHTML = html;
}

// ============================================
// Event listeners
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Close button
    const closeBtn = document.getElementById('drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeChartDrawer);

    // Overlay click to close
    const overlay = document.getElementById('drawer-overlay');
    if (overlay) overlay.addEventListener('click', closeChartDrawer);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawerOpen) {
            closeChartDrawer();
        }
    });

    // Delegate clicks on sparkline containers → open drawer
    document.addEventListener('click', (e) => {
        const container = e.target.closest('.sparkline-container[data-chart-type]');
        if (container) {
            const chartType = container.dataset.chartType;
            const gpuId = container.dataset.gpuId;
            if (chartType && gpuId) {
                openChartDrawer(gpuId, chartType);
            }
        }
    });

    // Delegate clicks on companion chips → swap companion
    document.addEventListener('click', (e) => {
        const chip = e.target.closest('.drawer-companion-chip');
        if (chip) {
            const type = chip.dataset.companion;
            if (type) switchCompanion(type);
        }
    });
});
