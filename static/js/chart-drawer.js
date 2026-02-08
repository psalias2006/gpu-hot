/**
 * Chart Drawer — Slide-out detail panel
 * Opens an enlarged chart + related metrics when clicking a sparkline
 */

// Drawer state
let drawerChart = null;
let drawerOpen = false;
let drawerGpuId = null;
let drawerChartType = null;
let drawerUpdateInterval = null;

// Chart type metadata: title, unit, related metrics
const chartMeta = {
    utilization: {
        title: 'GPU Utilization',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-utilization-current-', label: 'CURRENT', id },
            { key: 'stat-utilization-min-', label: 'MINIMUM', id },
            { key: 'stat-utilization-max-', label: 'MAXIMUM', id },
            { key: 'stat-utilization-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const el = document.getElementById(`pstate-${gpuId}`);
            const throttle = document.getElementById(`throttle-${gpuId}`);
            return [
                { label: 'P-STATE', value: el ? el.textContent : 'N/A' },
                { label: 'THROTTLE', value: throttle ? throttle.textContent : 'N/A' },
            ];
        }
    },
    temperature: {
        title: 'Temperature',
        unit: '°C',
        decimals: 1,
        related: (id) => [
            { key: 'stat-temperature-current-', label: 'CURRENT', id },
            { key: 'stat-temperature-min-', label: 'MINIMUM', id },
            { key: 'stat-temperature-max-', label: 'MAXIMUM', id },
            { key: 'stat-temperature-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const mem = document.getElementById(`temp-mem-${gpuId}`);
            const fan = document.getElementById(`fan-val-${gpuId}`);
            return [
                { label: 'VRAM TEMP', value: mem ? mem.textContent + '°C' : 'N/A' },
                { label: 'FAN SPEED', value: fan ? fan.textContent + '%' : 'N/A' },
            ];
        }
    },
    memory: {
        title: 'VRAM Usage',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-memory-current-', label: 'CURRENT', id },
            { key: 'stat-memory-min-', label: 'MINIMUM', id },
            { key: 'stat-memory-max-', label: 'MAXIMUM', id },
            { key: 'stat-memory-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const used = document.getElementById(`mem-${gpuId}`);
            const total = document.getElementById(`mem-total-${gpuId}`);
            const free = document.getElementById(`mem-free-${gpuId}`);
            return [
                { label: 'USED', value: used ? used.textContent : 'N/A' },
                { label: 'TOTAL', value: total ? total.textContent.replace('of ', '') : 'N/A' },
                { label: 'FREE', value: free ? free.textContent : 'N/A' },
            ];
        }
    },
    power: {
        title: 'Power Draw',
        unit: 'W',
        decimals: 1,
        related: (id) => [
            { key: 'stat-power-current-', label: 'CURRENT', id },
            { key: 'stat-power-min-', label: 'MINIMUM', id },
            { key: 'stat-power-max-', label: 'MAXIMUM', id },
            { key: 'stat-power-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const limit = document.getElementById(`power-limit-${gpuId}`);
            const eff = document.getElementById(`stat-efficiency-current-${gpuId}`);
            const energy = document.getElementById(`energy-${gpuId}`);
            return [
                { label: 'LIMIT', value: limit ? limit.textContent.replace('of ', '') : 'N/A' },
                { label: 'EFFICIENCY', value: eff ? eff.textContent : 'N/A' },
                { label: 'TOTAL ENERGY', value: energy ? energy.textContent : 'N/A' },
            ];
        }
    },
    fanSpeed: {
        title: 'Fan Speed',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-fanSpeed-current-', label: 'CURRENT', id },
            { key: 'stat-fanSpeed-min-', label: 'MINIMUM', id },
            { key: 'stat-fanSpeed-max-', label: 'MAXIMUM', id },
            { key: 'stat-fanSpeed-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const temp = document.getElementById(`temp-${gpuId}`);
            return [
                { label: 'GPU TEMP', value: temp ? temp.textContent + '°C' : 'N/A' },
            ];
        }
    },
    clocks: {
        title: 'Clock Speeds',
        unit: ' MHz',
        decimals: 0,
        related: (id) => [
            { key: 'stat-clocks-current-', label: 'CURRENT', id },
            { key: 'stat-clocks-min-', label: 'MINIMUM', id },
            { key: 'stat-clocks-max-', label: 'MAXIMUM', id },
            { key: 'stat-clocks-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const gr = document.getElementById(`clock-gr-${gpuId}`);
            const mem = document.getElementById(`clock-mem-${gpuId}`);
            const sm = document.getElementById(`clock-sm-${gpuId}`);
            return [
                { label: 'GFX CLOCK', value: gr ? gr.textContent + ' MHz' : 'N/A' },
                { label: 'MEM CLOCK', value: mem ? mem.textContent + ' MHz' : 'N/A' },
                { label: 'SM CLOCK', value: sm ? sm.textContent + ' MHz' : 'N/A' },
            ];
        }
    },
    efficiency: {
        title: 'Power Efficiency',
        unit: ' %/W',
        decimals: 2,
        related: (id) => [
            { key: 'stat-efficiency-current-', label: 'CURRENT', id },
            { key: 'stat-efficiency-min-', label: 'MINIMUM', id },
            { key: 'stat-efficiency-max-', label: 'MAXIMUM', id },
            { key: 'stat-efficiency-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const util = document.getElementById(`util-text-${gpuId}`);
            const power = document.getElementById(`power-${gpuId}`);
            return [
                { label: 'UTILIZATION', value: util ? util.textContent + '%' : 'N/A' },
                { label: 'POWER DRAW', value: power ? power.textContent + 'W' : 'N/A' },
            ];
        }
    },
    pcie: {
        title: 'PCIe Throughput',
        unit: ' KB/s',
        decimals: 0,
        related: () => [],
        context: (gpuId) => {
            const rx = document.getElementById(`stat-pcie-rx-current-${gpuId}`);
            const tx = document.getElementById(`stat-pcie-tx-current-${gpuId}`);
            const gen = document.getElementById(`pcie-${gpuId}`);
            return [
                { label: 'RX', value: rx ? rx.textContent : 'N/A' },
                { label: 'TX', value: tx ? tx.textContent : 'N/A' },
                { label: 'PCIE GEN', value: gen ? 'Gen ' + gen.textContent : 'N/A' },
            ];
        }
    },
    appclocks: {
        title: 'Application Clocks',
        unit: ' MHz',
        decimals: 0,
        related: () => [],
        context: () => []
    },

    // ============================================
    // System chart metadata
    // ============================================

    systemCpu: {
        title: 'CPU Usage',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-systemCpu-current-', label: 'CURRENT', id },
            { key: 'stat-systemCpu-min-', label: 'MINIMUM', id },
            { key: 'stat-systemCpu-max-', label: 'MAXIMUM', id },
            { key: 'stat-systemCpu-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const memEl = document.getElementById(`stat-systemMemory-current-${gpuId}`);
            const swapEl = document.getElementById(`stat-systemSwap-current-${gpuId}`);
            const loadEl = document.getElementById(`stat-systemLoadAvg-current-${gpuId}`);
            return [
                { label: 'RAM', value: memEl ? memEl.textContent : 'N/A' },
                { label: 'SWAP', value: swapEl ? swapEl.textContent : 'N/A' },
                { label: 'LOAD 1M', value: loadEl ? loadEl.textContent : 'N/A' },
            ];
        }
    },
    systemMemory: {
        title: 'RAM Usage',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-systemMemory-current-', label: 'CURRENT', id },
            { key: 'stat-systemMemory-min-', label: 'MINIMUM', id },
            { key: 'stat-systemMemory-max-', label: 'MAXIMUM', id },
            { key: 'stat-systemMemory-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const sub = document.getElementById(`sys-mem-sub-${gpuId}`);
            const cpuEl = document.getElementById(`stat-systemCpu-current-${gpuId}`);
            const swapEl = document.getElementById(`stat-systemSwap-current-${gpuId}`);
            return [
                { label: 'USED / TOTAL', value: sub ? sub.textContent : 'N/A' },
                { label: 'CPU', value: cpuEl ? cpuEl.textContent : 'N/A' },
                { label: 'SWAP', value: swapEl ? swapEl.textContent : 'N/A' },
            ];
        }
    },
    systemSwap: {
        title: 'Swap Usage',
        unit: '%',
        decimals: 1,
        related: (id) => [
            { key: 'stat-systemSwap-current-', label: 'CURRENT', id },
            { key: 'stat-systemSwap-min-', label: 'MINIMUM', id },
            { key: 'stat-systemSwap-max-', label: 'MAXIMUM', id },
            { key: 'stat-systemSwap-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const memEl = document.getElementById(`stat-systemMemory-current-${gpuId}`);
            return [
                { label: 'RAM', value: memEl ? memEl.textContent : 'N/A' },
            ];
        }
    },
    systemNetIo: {
        title: 'Network I/O',
        unit: ' KB/s',
        decimals: 1,
        multiLine: true,
        related: () => [],
        context: (gpuId) => {
            const rxEl = document.getElementById(`stat-systemNetIo-rx-current-${gpuId}`);
            const txEl = document.getElementById(`stat-systemNetIo-tx-current-${gpuId}`);
            return [
                { label: 'RX', value: rxEl ? rxEl.textContent : 'N/A' },
                { label: 'TX', value: txEl ? txEl.textContent : 'N/A' },
            ];
        }
    },
    systemDiskIo: {
        title: 'Disk I/O',
        unit: ' KB/s',
        decimals: 1,
        multiLine: true,
        related: () => [],
        context: (gpuId) => {
            const readEl = document.getElementById(`stat-systemDiskIo-read-current-${gpuId}`);
            const writeEl = document.getElementById(`stat-systemDiskIo-write-current-${gpuId}`);
            return [
                { label: 'READ', value: readEl ? readEl.textContent : 'N/A' },
                { label: 'WRITE', value: writeEl ? writeEl.textContent : 'N/A' },
            ];
        }
    },
    systemLoadAvg: {
        title: 'Load Average',
        unit: '',
        decimals: 2,
        multiLine: true,
        related: (id) => [
            { key: 'stat-systemLoadAvg-current-', label: 'CURRENT', id },
            { key: 'stat-systemLoadAvg-min-', label: 'MINIMUM', id },
            { key: 'stat-systemLoadAvg-max-', label: 'MAXIMUM', id },
            { key: 'stat-systemLoadAvg-avg-', label: 'AVERAGE', id },
        ],
        context: (gpuId) => {
            const cpuEl = document.getElementById(`stat-systemCpu-current-${gpuId}`);
            return [
                { label: 'CPU', value: cpuEl ? cpuEl.textContent : 'N/A' },
            ];
        }
    }
};

// ============================================
// Open drawer
// ============================================

function openChartDrawer(gpuId, chartType) {
    const meta = chartMeta[chartType];
    if (!meta || !chartData[gpuId]) return;

    drawerGpuId = gpuId;
    drawerChartType = chartType;

    // Set title and unit
    document.getElementById('drawer-title').textContent = meta.title;
    document.getElementById('drawer-hero-unit').textContent = meta.unit;

    // Set hero value
    updateDrawerHero(gpuId, chartType);

    // Build the enlarged chart
    createDrawerChart(gpuId, chartType);

    // Build stats
    updateDrawerStats(gpuId, chartType);

    // Build related context
    updateDrawerRelated(gpuId, chartType);

    // Open
    document.getElementById('drawer-overlay').classList.add('open');
    document.getElementById('chart-drawer').classList.add('open');
    drawerOpen = true;

    // Live-update the drawer chart + stats every 500ms
    drawerUpdateInterval = setInterval(() => {
        if (!drawerOpen) return;
        updateDrawerChartData(gpuId, chartType);
        updateDrawerHero(gpuId, chartType);
        updateDrawerStats(gpuId, chartType);
        updateDrawerRelated(gpuId, chartType);
    }, 500);
}

// ============================================
// Close drawer
// ============================================

function closeChartDrawer() {
    document.getElementById('drawer-overlay').classList.remove('open');
    document.getElementById('chart-drawer').classList.remove('open');
    drawerOpen = false;
    drawerGpuId = null;
    drawerChartType = null;

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
// Create enlarged chart in drawer
// ============================================

function createDrawerChart(gpuId, chartType) {
    const canvas = document.getElementById('drawer-chart-canvas');
    if (!canvas) return;

    if (drawerChart) {
        drawerChart.destroy();
        drawerChart = null;
    }

    const data = chartData[gpuId] && chartData[gpuId][chartType];
    if (!data) return;

    // Deep clone the config for this chart type
    const config = JSON.parse(JSON.stringify(chartConfigs[chartType]));

    // Link data arrays
    linkDrawerData(config, gpuId, chartType, data);

    // Refined enlarged chart styling
    config.options.scales.y.display = true;
    config.options.scales.y.position = 'right';
    config.options.scales.y.grid.color = 'rgba(255, 255, 255, 0.04)';
    config.options.scales.y.ticks.color = 'rgba(255, 255, 255, 0.25)';
    config.options.scales.y.ticks.font = { size: 10, family: "'SF Mono', 'Menlo', monospace" };
    config.options.scales.y.ticks.maxTicksLimit = 5;
    config.options.scales.y.ticks.padding = 12;
    config.options.scales.y.border = { display: false };
    config.options.scales.x.display = true;
    config.options.scales.x.grid = { display: false };
    config.options.scales.x.border = { display: false };
    config.options.scales.x.ticks = {
        color: 'rgba(255, 255, 255, 0.15)',
        font: { size: 9, family: "'SF Mono', 'Menlo', monospace" },
        maxTicksLimit: 6,
        maxRotation: 0,
        padding: 8
    };
    config.options.layout = { padding: { left: 0, right: 0, top: 8, bottom: 0 } };

    // Thicker line + subtle fill for the enlarged view
    config.data.datasets[0].borderWidth = 2;
    config.data.datasets[0].borderColor = 'rgba(255, 255, 255, 0.6)';
    config.data.datasets[0].backgroundColor = 'rgba(255, 255, 255, 0.04)';
    config.data.datasets[0].fill = true;

    // Enable tooltips — refined
    config.options.plugins.tooltip.enabled = true;
    config.options.plugins.tooltip.backgroundColor = '#222222';
    config.options.plugins.tooltip.borderWidth = 0;
    config.options.plugins.tooltip.padding = 10;
    config.options.plugins.tooltip.cornerRadius = 4;
    config.options.plugins.tooltip.titleFont = { size: 10, weight: '600' };
    config.options.plugins.tooltip.bodyFont = { size: 12, weight: '600', family: "'SF Mono', 'Menlo', monospace" };
    config.options.plugins.tooltip.displayColors = false;
    config.options.interaction = { intersect: false, mode: 'index' };

    // Crosshair-style hover line
    config.options.plugins.tooltip.callbacks = config.options.plugins.tooltip.callbacks || {};

    // Determine if multi-line chart
    const meta = chartMeta[chartType];
    const isMultiLine = ['clocks', 'pcie', 'appclocks'].includes(chartType) || (meta && meta.multiLine);

    // Show legend for multi-line charts
    if (isMultiLine) {
        config.options.plugins.legend.display = true;
        config.options.plugins.legend.position = 'top';
        config.options.plugins.legend.align = 'end';
        config.options.plugins.legend.labels = {
            color: 'rgba(255, 255, 255, 0.35)',
            font: { size: 10 },
            boxWidth: 8,
            boxHeight: 2,
            padding: 10,
            usePointStyle: false
        };
        // Multi-line: different opacities, primary line gets fill
        config.data.datasets[0].borderColor = 'rgba(255, 255, 255, 0.6)';
        config.data.datasets[0].backgroundColor = 'rgba(255, 255, 255, 0.04)';
        config.data.datasets[0].fill = true;
        for (let i = 1; i < config.data.datasets.length; i++) {
            config.data.datasets[i].borderWidth = 1.5;
            config.data.datasets[i].fill = false;
        }
    }

    drawerChart = new Chart(canvas, config);
}

// Link data arrays from chartData/systemData to the drawer config
function linkDrawerData(config, gpuId, chartType, data) {
    config.data.labels = data.labels;

    if (chartType === 'clocks') {
        config.data.datasets[0].data = data.graphicsData;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.smData;
        if (config.data.datasets[2]) config.data.datasets[2].data = data.memoryData;
    } else if (chartType === 'pcie') {
        config.data.datasets[0].data = data.dataRX;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.dataTX;
    } else if (chartType === 'appclocks') {
        config.data.datasets[0].data = data.dataGr;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.dataMem;
        if (config.data.datasets[2]) config.data.datasets[2].data = data.dataSM;
        if (config.data.datasets[3]) config.data.datasets[3].data = data.dataVideo;
    } else if (chartType === 'systemNetIo') {
        config.data.datasets[0].data = data.dataRX;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.dataTX;
    } else if (chartType === 'systemDiskIo') {
        config.data.datasets[0].data = data.dataRead;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.dataWrite;
    } else if (chartType === 'systemLoadAvg') {
        config.data.datasets[0].data = data.data1m;
        if (config.data.datasets[1]) config.data.datasets[1].data = data.data5m;
        if (config.data.datasets[2]) config.data.datasets[2].data = data.data15m;
    } else {
        config.data.datasets[0].data = data.data;
    }
}

// Update drawer chart (live refresh)
function updateDrawerChartData(gpuId, chartType) {
    if (!drawerChart) return;
    try {
        drawerChart.update('none');
    } catch (e) {
        // Chart may have been destroyed
    }
}

// ============================================
// Update hero current value
// ============================================

function updateDrawerHero(gpuId, chartType) {
    const meta = chartMeta[chartType];
    if (!meta) return;

    const heroEl = document.getElementById('drawer-hero-value');
    if (!heroEl) return;

    const data = chartData[gpuId] && chartData[gpuId][chartType];
    if (data) {
        let arr = data.data;
        if (chartType === 'clocks') arr = data.graphicsData;
        else if (chartType === 'pcie') arr = data.dataRX;
        else if (chartType === 'appclocks') arr = data.dataGr;
        else if (chartType === 'systemNetIo') arr = data.dataRX;
        else if (chartType === 'systemDiskIo') arr = data.dataRead;
        else if (chartType === 'systemLoadAvg') arr = data.data1m;
        if (arr && arr.length > 0) {
            const val = arr[arr.length - 1];
            heroEl.textContent = meta.decimals > 0 ? val.toFixed(meta.decimals) : Math.round(val);
            return;
        }
    }

    heroEl.textContent = '--';
}

// ============================================
// Update stats strip
// ============================================

function updateDrawerStats(gpuId, chartType) {
    const meta = chartMeta[chartType];
    if (!meta) return;

    const container = document.getElementById('drawer-stats');
    const statRefs = meta.related(gpuId);

    // Read values from existing stat elements on the page
    const statValues = statRefs.map(ref => {
        const el = document.getElementById(ref.key + ref.id);
        return {
            label: ref.label,
            value: el ? el.textContent : 'N/A'
        };
    });

    // Skip CURRENT (shown in hero), show MIN/MAX/AVG
    const filtered = statValues.filter(s => s.label !== 'CURRENT');

    container.innerHTML = filtered.map(s => `
        <div class="drawer-stat">
            <div class="drawer-stat-label">${s.label}</div>
            <div class="drawer-stat-value">${s.value}</div>
        </div>
    `).join('');
}

// ============================================
// Update related metrics context
// ============================================

function updateDrawerRelated(gpuId, chartType) {
    const meta = chartMeta[chartType];
    if (!meta || !meta.context) return;

    const container = document.getElementById('drawer-related');
    const items = meta.context(gpuId);

    if (!items || items.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="drawer-related-title">Related Metrics</div>
        <div class="drawer-related-grid">
            ${items.map(item => `
                <div class="drawer-related-item">
                    <div class="drawer-related-value">${item.value}</div>
                    <div class="drawer-related-label">${item.label}</div>
                </div>
            `).join('')}
        </div>
    `;
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

    // Delegate clicks on sparkline containers
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
});
