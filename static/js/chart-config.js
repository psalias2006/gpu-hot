/**
 * Chart configuration factory — GPU Studio
 * Grayscale sparklines, no fills, no color except alerts
 */

// Sparkline palette — monochromatic
const SPARK = {
    stroke: 'rgba(255, 255, 255, 0.4)',
    strokeLight: 'rgba(255, 255, 255, 0.25)',
    strokeDim: 'rgba(255, 255, 255, 0.15)',
    grid: 'rgba(255, 255, 255, 0.04)',
    tick: 'rgba(255, 255, 255, 0.3)',
    tooltipBg: '#1A1A1A',
};

// Base chart options — minimal sparkline
function getBaseChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        elements: {
            point: { radius: 0, hitRadius: 8 },
            line: { borderCapStyle: 'round', borderJoinStyle: 'round' }
        },
        layout: {
            padding: { left: 0, right: 0, top: 2, bottom: 0 }
        },
        scales: {
            x: {
                display: false
            },
            y: {
                min: 0,
                display: true,
                position: 'right',
                grid: {
                    color: SPARK.grid,
                    drawBorder: false,
                    lineWidth: 1
                },
                ticks: {
                    color: SPARK.tick,
                    font: { size: 10, family: "'SF Mono', 'Menlo', 'Consolas', monospace" },
                    padding: 8,
                    maxTicksLimit: 3
                },
                border: {
                    display: false
                }
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: SPARK.tooltipBg,
                titleColor: '#ffffff',
                bodyColor: 'rgba(255,255,255,0.7)',
                borderWidth: 0,
                cornerRadius: 4,
                displayColors: false,
                padding: 8,
                titleFont: { size: 11, weight: '600' },
                bodyFont: { size: 11 }
            }
        }
    };
}

// Single-line sparkline config
function createLineChartConfig(options) {
    const {
        label,
        yMax,
        yStepSize,
        yUnit,
        tooltipTitle,
        tooltipLabel,
        decimals = 1
    } = options;

    const config = {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: SPARK.stroke,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                pointHitRadius: 8
            }]
        },
        options: getBaseChartOptions()
    };

    if (yMax !== undefined) config.options.scales.y.max = yMax;
    if (options.ySuggestedMax) config.options.scales.y.suggestedMax = options.ySuggestedMax;
    if (yStepSize) config.options.scales.y.ticks.stepSize = yStepSize;
    if (yUnit) {
        config.options.scales.y.ticks.callback = function(value) {
            return value + yUnit;
        };
    }

    config.options.plugins.tooltip.callbacks = {
        title: function() { return tooltipTitle; },
        label: function(context) {
            const displayLabel = tooltipLabel || context.dataset.label || '';
            const value = context.parsed.y;
            return `${displayLabel}: ${value.toFixed(decimals)}${yUnit || ''}`;
        }
    };

    return config;
}

// Multi-line sparkline config
function createMultiLineChartConfig(options) {
    const {
        datasets,
        yUnit,
        tooltipTitle,
        showLegend = false,
        ySuggestedMax,
        decimals = 0
    } = options;

    // Grayscale tones for multi-line differentiation
    const grayTones = [SPARK.stroke, SPARK.strokeLight, SPARK.strokeDim, 'rgba(255,255,255,0.1)'];

    const config = {
        type: 'line',
        data: {
            labels: [],
            datasets: datasets.map((ds, i) => ({
                label: ds.label,
                data: [],
                borderColor: grayTones[i % grayTones.length],
                backgroundColor: 'transparent',
                borderWidth: ds.width || 1.5,
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                pointHitRadius: 8
            }))
        },
        options: getBaseChartOptions()
    };

    if (ySuggestedMax) config.options.scales.y.suggestedMax = ySuggestedMax;
    if (yUnit) {
        config.options.scales.y.ticks.callback = function(value) {
            return value.toFixed(decimals) + yUnit;
        };
    }

    if (showLegend) {
        config.options.plugins.legend.display = true;
        config.options.plugins.legend.position = 'top';
        config.options.plugins.legend.align = 'end';
        config.options.plugins.legend.labels = {
            color: 'rgba(255, 255, 255, 0.4)',
            font: { size: 10 },
            boxWidth: 8,
            boxHeight: 2,
            padding: 8,
            usePointStyle: false
        };
    }

    config.options.plugins.tooltip.callbacks = {
        title: function() { return tooltipTitle; },
        label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(decimals)}${yUnit || ''}`;
        }
    };

    return config;
}

// ============================================
// Chart Configs — all grayscale sparklines
// ============================================

const chartConfigs = {
    utilization: createLineChartConfig({
        label: 'Utilization',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'GPU Utilization',
        tooltipLabel: 'Util'
    }),

    temperature: createLineChartConfig({
        label: 'Temperature',
        ySuggestedMax: 90,
        yStepSize: 30,
        yUnit: '°C',
        tooltipTitle: 'Temperature',
        tooltipLabel: 'Temp'
    }),

    memory: createLineChartConfig({
        label: 'Memory',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'VRAM Usage',
        tooltipLabel: 'Mem'
    }),

    power: createLineChartConfig({
        label: 'Power',
        ySuggestedMax: 200,
        yStepSize: 100,
        yUnit: 'W',
        tooltipTitle: 'Power Draw',
        tooltipLabel: 'Power'
    }),

    fanSpeed: createLineChartConfig({
        label: 'Fan',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'Fan Speed',
        tooltipLabel: 'Fan'
    }),

    clocks: createMultiLineChartConfig({
        datasets: [
            { label: 'Graphics' },
            { label: 'SM' },
            { label: 'Memory' }
        ],
        yUnit: ' MHz',
        tooltipTitle: 'Clock Speeds',
        showLegend: true,
        decimals: 0
    }),

    efficiency: createLineChartConfig({
        label: 'Efficiency',
        yUnit: ' %/W',
        tooltipTitle: 'Power Efficiency',
        tooltipLabel: 'Eff',
        decimals: 2
    }),

    pcie: createMultiLineChartConfig({
        datasets: [
            { label: 'RX' },
            { label: 'TX' }
        ],
        yUnit: ' KB/s',
        tooltipTitle: 'PCIe Throughput',
        showLegend: true,
        decimals: 0
    }),

    appclocks: createMultiLineChartConfig({
        datasets: [
            { label: 'Graphics' },
            { label: 'Memory' },
            { label: 'SM' },
            { label: 'Video' }
        ],
        yUnit: ' MHz',
        tooltipTitle: 'App Clocks',
        showLegend: true,
        decimals: 0
    }),

    // ============================================
    // System Charts
    // ============================================

    systemCpu: createLineChartConfig({
        label: 'CPU',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'CPU Usage',
        tooltipLabel: 'CPU'
    }),

    systemMemory: createLineChartConfig({
        label: 'RAM',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'RAM Usage',
        tooltipLabel: 'RAM'
    }),

    systemSwap: createLineChartConfig({
        label: 'Swap',
        yMax: 100,
        yStepSize: 50,
        yUnit: '%',
        tooltipTitle: 'Swap Usage',
        tooltipLabel: 'Swap'
    }),

    systemNetIo: createMultiLineChartConfig({
        datasets: [
            { label: 'RX' },
            { label: 'TX' }
        ],
        yUnit: ' KB/s',
        tooltipTitle: 'Network I/O',
        showLegend: true,
        decimals: 1
    }),

    systemDiskIo: createMultiLineChartConfig({
        datasets: [
            { label: 'Read' },
            { label: 'Write' }
        ],
        yUnit: ' KB/s',
        tooltipTitle: 'Disk I/O',
        showLegend: true,
        decimals: 1
    }),

    systemLoadAvg: createMultiLineChartConfig({
        datasets: [
            { label: '1m' },
            { label: '5m' },
            { label: '15m' }
        ],
        yUnit: '',
        tooltipTitle: 'Load Average',
        showLegend: true,
        ySuggestedMax: 4,
        decimals: 2
    })
};
