/**
 * Chart configuration factory - DRY approach for chart configs
 */

// Base chart options shared across all charts
function getBaseChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable all animations globally
        interaction: {
            intersect: false,
            mode: 'index'
        },
        layout: {
            padding: { left: 0, right: 0, top: 5, bottom: 10 }
        },
        scales: {
            x: {
                display: true,
                offset: true,
                grid: {
                    display: false,
                    drawBorder: false,
                    offset: true
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.6)',
                    font: { size: 11, weight: '500' },
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 7,
                    padding: 8,
                    align: 'center'
                }
            },
            y: {
                min: 0,
                grid: {
                    color: 'rgba(255, 255, 255, 0.08)',
                    borderDash: [2, 3],
                    drawBorder: false,
                    lineWidth: 1
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    font: { size: 12, weight: '500' },
                    padding: 12,
                    count: 6
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
                borderWidth: 2,
                cornerRadius: 12,
                displayColors: true,
                padding: 12,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 }
            }
        }
    };
}

// Create a line chart configuration
function createLineChartConfig(options) {
    const {
        label,
        borderColor,
        backgroundColor,
        yMax,
        yStepSize,
        yUnit,
        tooltipTitle,
        tooltipLabel,  // Optional: custom label for tooltip (defaults to dataset label)
        tooltipAfterLabel,
        thresholds = []
    } = options;

    const datasets = [{
        label: label,
        data: [],
        borderColor: borderColor,
        backgroundColor: backgroundColor,
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 0,
        pointHitRadius: 12,
        pointBackgroundColor: borderColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round'
    }];

    // Add threshold lines
    thresholds.forEach(threshold => {
        datasets.push({
            label: threshold.label,
            data: [],
            borderColor: threshold.color,
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderDash: threshold.dash || [5, 5],
            pointRadius: 0,
            fill: false
        });
    });

    const config = {
        type: 'line',
        data: {
            labels: [],
            datasets: datasets
        },
        options: getBaseChartOptions()
    };

    // Customize Y axis
    if (yMax !== undefined) config.options.scales.y.max = yMax;
    if (yMax === undefined && options.ySuggestedMax) config.options.scales.y.suggestedMax = options.ySuggestedMax;
    if (yStepSize) config.options.scales.y.ticks.stepSize = yStepSize;
    if (yUnit) {
        config.options.scales.y.ticks.callback = function(value) {
            return value + yUnit;
        };
    }

    // Customize tooltip
    config.options.plugins.tooltip.borderColor = borderColor;
    config.options.plugins.tooltip.callbacks = {
        title: function(context) {
            return tooltipTitle;
        },
        label: function(context) {
            const datasetLabel = context.dataset.label || '';
            const value = context.parsed.y;
            // Skip threshold labels
            if (thresholds.some(t => datasetLabel.includes(t.label.split('(')[0]))) {
                return datasetLabel;
            }
            const displayLabel = tooltipLabel || datasetLabel;
            return `${displayLabel}: ${value.toFixed(options.decimals || 1)}${yUnit || ''}`;
        },
        afterLabel: tooltipAfterLabel ? function(context) {
            if (thresholds.some(t => context.dataset.label.includes(t.label.split('(')[0]))) {
                return null;
            }
            return tooltipAfterLabel(context.parsed.y);
        } : undefined
    };

    return config;
}

// Create multi-line chart (for clocks, pcie, etc)
function createMultiLineChartConfig(options) {
    const {
        datasets,
        yUnit,
        tooltipTitle,
        showLegend = false,
        ySuggestedMax,
        decimals = 0
    } = options;

    const config = {
        type: 'line',
        data: {
            labels: [],
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: [],
                borderColor: ds.color,
                backgroundColor: ds.bgColor || `${ds.color}15`,
                borderWidth: ds.width || 2.5,
                tension: 0.35,
                fill: ds.fill !== undefined ? ds.fill : false,
                pointRadius: 0,
                pointHitRadius: 12,
                pointBackgroundColor: ds.color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                borderCapStyle: 'round',
                borderJoinStyle: 'round'
            }))
        },
        options: getBaseChartOptions()
    };

    // Y axis customization
    if (ySuggestedMax) config.options.scales.y.suggestedMax = ySuggestedMax;
    if (yUnit) {
        config.options.scales.y.ticks.callback = function(value) {
            return value.toFixed(decimals) + yUnit;
        };
    }

    // Legend
    if (showLegend) {
        config.options.plugins.legend.display = true;
        config.options.plugins.legend.position = 'top';
        config.options.plugins.legend.align = 'end';
        config.options.plugins.legend.labels = {
            color: 'rgba(255, 255, 255, 0.8)',
            font: { size: 11 },
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            usePointStyle: true
        };
    }

    // Tooltip
    config.options.plugins.tooltip.borderColor = datasets[0].color;
    config.options.plugins.tooltip.callbacks = {
        title: function(context) {
            return tooltipTitle;
        },
        label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(decimals)}${yUnit || ''}`;
        }
    };

    return config;
}

// Chart configurations using factory functions
const chartConfigs = {
    utilization: createLineChartConfig({
        label: 'GPU Utilization',
        borderColor: '#4facfe',
        backgroundColor: 'rgba(79, 172, 254, 0.15)',
        yMax: 100,
        yStepSize: 20,
        yUnit: '%',
        tooltipTitle: 'GPU Utilization',
        thresholds: [
            { label: 'High Load (80%)', color: 'rgba(250, 112, 154, 0.5)', dash: [5, 5] }
        ],
        tooltipAfterLabel: (value) => {
            if (value > 90) return '🔥 Very High';
            if (value > 80) return '⚡ High';
            if (value > 50) return '✓ Active';
            return '💤 Low';
        }
    }),

    temperature: createLineChartConfig({
        label: 'GPU Temperature',
        borderColor: '#f5576c',
        backgroundColor: 'rgba(245, 87, 108, 0.15)',
        ySuggestedMax: 90,
        yStepSize: 15,
        yUnit: '°C',
        tooltipTitle: 'GPU Temperature',
        thresholds: [
            { label: 'Warning (75°C)', color: 'rgba(254, 202, 87, 0.6)', dash: [5, 5] },
            { label: 'Danger (85°C)', color: 'rgba(250, 112, 154, 0.8)', dash: [10, 5] }
        ],
        tooltipAfterLabel: (value) => {
            if (value > 85) return '🚨 DANGER';
            if (value > 75) return '⚠️ Warning';
            if (value > 60) return '🌡️ Normal';
            return '❄️ Cool';
        }
    }),

    memory: createLineChartConfig({
        label: 'Memory Usage',
        borderColor: '#4facfe',
        backgroundColor: 'rgba(79, 172, 254, 0.15)',
        yMax: 100,
        yStepSize: 20,
        yUnit: '%',
        tooltipTitle: 'VRAM Usage',
        thresholds: [
            { label: 'High Usage (90%)', color: 'rgba(250, 112, 154, 0.6)', dash: [5, 5] }
        ],
        tooltipAfterLabel: (value) => {
            if (value > 95) return '🚨 Critical';
            if (value > 90) return '⚠️ Very High';
            if (value > 75) return '📊 High';
            return '✓ Normal';
        }
    }),

    power: createLineChartConfig({
        label: 'Power Draw',
        borderColor: '#43e97b',
        backgroundColor: 'rgba(67, 233, 123, 0.15)',
        ySuggestedMax: 200,
        yStepSize: 50,
        yUnit: ' W',
        tooltipTitle: 'Power Draw',
        tooltipLabel: 'Power',  // Shortened label for tooltip
        tooltipAfterLabel: (value) => {
            if (value > 200) return '⚡ Maximum Performance';
            if (value > 150) return '🔥 High Performance';
            if (value > 100) return '💪 Active';
            if (value > 50) return '✓ Moderate';
            return '💤 Idle';
        }
    }),

    fanSpeed: createLineChartConfig({
        label: 'Fan Speed',
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        yMax: 100,
        yStepSize: 20,
        yUnit: '%',
        tooltipTitle: 'Fan Speed',
        tooltipAfterLabel: (value) => {
            if (value > 90) return '🌪️ Maximum';
            if (value > 70) return '💨 High';
            if (value > 40) return '🌬️ Active';
            if (value > 10) return '✓ Low';
            return '⏸️ Idle';
        }
    }),

    clocks: createMultiLineChartConfig({
        datasets: [
            { label: 'Graphics Clock', color: '#a78bfa', bgColor: 'rgba(167, 139, 250, 0.1)' },
            { label: 'SM Clock', color: '#fb923c', bgColor: 'rgba(251, 146, 60, 0.1)' },
            { label: 'Memory Clock', color: '#34d399', bgColor: 'rgba(52, 211, 153, 0.1)' }
        ],
        yUnit: ' MHz',
        tooltipTitle: 'Clock Speeds',
        showLegend: true,
        decimals: 0
    }),

    efficiency: createLineChartConfig({
        label: 'Power Efficiency',
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251, 191, 36, 0.15)',
        yUnit: ' %/W',
        tooltipTitle: 'Power Efficiency',
        tooltipLabel: 'Efficiency',  // Shortened label for tooltip
        decimals: 2,
        tooltipAfterLabel: (value) => {
            if (value > 0.8) return '⭐ Excellent';
            if (value > 0.5) return '✓ Good';
            if (value > 0.3) return '📊 Fair';
            if (value > 0.1) return '⚡ Active';
            return '💤 Idle';
        }
    }),

    pcie: createMultiLineChartConfig({
        datasets: [
            { label: 'RX Throughput', color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.15)', width: 3, fill: true },
            { label: 'TX Throughput', color: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)', width: 3, fill: true }
        ],
        yUnit: ' KB/s',
        tooltipTitle: 'PCIe Throughput',
        showLegend: true,
        decimals: 0
    }),

    appclocks: createMultiLineChartConfig({
        datasets: [
            { label: 'Graphics Clock', color: '#4facfe', backgroundColor: 'rgba(79, 172, 254, 0.15)', width: 2, fill: true },
            { label: 'Memory Clock', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)', width: 2, fill: true },
            { label: 'SM Clock', color: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.15)', width: 2, fill: true },
            { label: 'Video Clock', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', width: 2, fill: true }
        ],
        yUnit: ' MHz',
        tooltipTitle: 'Application Clocks',
        showLegend: true,
        decimals: 0
    })
};

