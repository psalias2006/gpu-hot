/**
 * Chart management - data storage, updates, and initialization
 * Requires: chart-config.js to be loaded first
 */

// Detect if we're on a mobile device
function isMobile() {
    return window.innerWidth <= 768;
}

// Get mobile-optimized chart options
function getMobileChartOptions(baseOptions) {
    if (!isMobile()) return baseOptions;
    
    // Clone the options to avoid mutating the base config
    const mobileOptions = JSON.parse(JSON.stringify(baseOptions));
    
    const isVerySmall = window.innerWidth <= 375;
    
    // Simplify axes for mobile - minimal but readable
    if (mobileOptions.scales) {
        if (mobileOptions.scales.x) {
            mobileOptions.scales.x.display = false; // Hide x-axis time labels
        }
        if (mobileOptions.scales.y) {
            // Keep y-axis visible and simple
            mobileOptions.scales.y.display = true;
            mobileOptions.scales.y.ticks = mobileOptions.scales.y.ticks || {};
            mobileOptions.scales.y.ticks.font = { size: isVerySmall ? 8 : 9 };
            mobileOptions.scales.y.ticks.padding = 3;
            mobileOptions.scales.y.ticks.color = 'rgba(255, 255, 255, 0.5)';
            mobileOptions.scales.y.ticks.maxTicksLimit = 3;
            mobileOptions.scales.y.grid = mobileOptions.scales.y.grid || {};
            mobileOptions.scales.y.grid.color = 'rgba(255, 255, 255, 0.08)';
            mobileOptions.scales.y.grid.lineWidth = 1;
            mobileOptions.scales.y.grid.drawBorder = true;
        }
    }
    
    // Keep tooltips but simplify them
    if (mobileOptions.plugins && mobileOptions.plugins.tooltip) {
        mobileOptions.plugins.tooltip.enabled = true;
        mobileOptions.plugins.tooltip.padding = 8;
        mobileOptions.plugins.tooltip.titleFont = { size: 11 };
        mobileOptions.plugins.tooltip.bodyFont = { size: 10 };
    }
    
    // Hide legends on mobile
    if (mobileOptions.plugins && mobileOptions.plugins.legend) {
        mobileOptions.plugins.legend.display = false;
    }
    
    // Keep some padding so chart renders properly
    if (mobileOptions.layout && mobileOptions.layout.padding) {
        mobileOptions.layout.padding = { left: 10, right: 15, top: 5, bottom: 10 };
    }
    
    // Ensure chart renders
    mobileOptions.responsive = true;
    mobileOptions.maintainAspectRatio = false;
    
    return mobileOptions;
}

// Store charts and data
const charts = {};
const chartData = {};

// Initialize chart data for a GPU with pre-filled baseline data
function initGPUData(gpuId, initialValues = {}) {
    const dataPoints = 120; // 60 seconds at 0.5s interval
    const labels = [];
    
    // Create labels for the full timeline
    for (let i = dataPoints - 1; i >= 0; i--) {
        const time = new Date(Date.now() - i * 500);
        labels.push(time.toLocaleTimeString());
    }
    
    // Helper to create filled array with initial value
    const createFilledArray = (value = 0) => new Array(dataPoints).fill(value);
    
    chartData[gpuId] = {
        utilization: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.utilization || 0), 
            thresholdData: createFilledArray(80) 
        },
        temperature: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.temperature || 0), 
            warningData: createFilledArray(75), 
            dangerData: createFilledArray(85) 
        },
        memory: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.memory || 0), 
            thresholdData: createFilledArray(90) 
        },
        power: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.power || 0) 
        },
        fanSpeed: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.fanSpeed || 0) 
        },
        clocks: { 
            labels: [...labels], 
            graphicsData: createFilledArray(initialValues.clockGraphics || 0), 
            smData: createFilledArray(initialValues.clockSm || 0), 
            memoryData: createFilledArray(initialValues.clockMemory || 0) 
        },
        efficiency: { 
            labels: [...labels], 
            data: createFilledArray(initialValues.efficiency || 0) 
        },
        pcie: { 
            labels: [...labels], 
            dataRX: createFilledArray(initialValues.pcieRX || 0), 
            dataTX: createFilledArray(initialValues.pcieTX || 0) 
        },
        appclocks: { 
            labels: [...labels], 
            dataGr: createFilledArray(initialValues.appclockGr || 0), 
            dataMem: createFilledArray(initialValues.appclockMem || 0), 
            dataSM: createFilledArray(initialValues.appclockSM || 0), 
            dataVideo: createFilledArray(initialValues.appclockVideo || 0) 
        }
    };
}

// Calculate statistics for chart data
function calculateStats(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return { min: 0, max: 0, avg: 0, current: 0 };
    }
    
    // Filter out invalid numbers
    const validData = data.filter(val => isFinite(val));
    if (validData.length === 0) {
        return { min: 0, max: 0, avg: 0, current: 0 };
    }
    
    const current = validData[validData.length - 1];
    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const avg = validData.reduce((a, b) => a + b, 0) / validData.length;
    
    return {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 0,
        avg: isFinite(avg) ? avg : 0,
        current: isFinite(current) ? current : 0
    };
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
    // Smart formatter that converts KB/s to MB/s when >= 1000
    const formatBandwidth = (value) => {
        if (value >= 1000) {
            return `${(value / 1024).toFixed(1)} MB/s`;
        }
        return `${Math.round(value)} KB/s`;
    };

    // Update RX stats
    const rxCurrentEl = document.getElementById(`stat-pcie-rx-current-${gpuId}`);
    const rxMinEl = document.getElementById(`stat-pcie-rx-min-${gpuId}`);
    const rxMaxEl = document.getElementById(`stat-pcie-rx-max-${gpuId}`);
    const rxAvgEl = document.getElementById(`stat-pcie-rx-avg-${gpuId}`);

    if (rxCurrentEl) rxCurrentEl.textContent = formatBandwidth(statsRX.current);
    if (rxMinEl) rxMinEl.textContent = formatBandwidth(statsRX.min);
    if (rxMaxEl) rxMaxEl.textContent = formatBandwidth(statsRX.max);
    if (rxAvgEl) rxAvgEl.textContent = formatBandwidth(statsRX.avg);

    // Update TX stats
    const txCurrentEl = document.getElementById(`stat-pcie-tx-current-${gpuId}`);
    const txMinEl = document.getElementById(`stat-pcie-tx-min-${gpuId}`);
    const txMaxEl = document.getElementById(`stat-pcie-tx-max-${gpuId}`);
    const txAvgEl = document.getElementById(`stat-pcie-tx-avg-${gpuId}`);

    if (txCurrentEl) txCurrentEl.textContent = formatBandwidth(statsTX.current);
    if (txMinEl) txMinEl.textContent = formatBandwidth(statsTX.min);
    if (txMaxEl) txMaxEl.textContent = formatBandwidth(statsTX.max);
    if (txAvgEl) txAvgEl.textContent = formatBandwidth(statsTX.avg);
}

// Update mobile chart header value display
function updateMobileChartValue(gpuId, chartType, value, unit) {
    const chartHeader = document.querySelector(`#chart-${chartType}-${gpuId}`)?.closest('.chart-container')?.querySelector('.chart-header');
    if (chartHeader) {
        const formattedValue = chartType === 'efficiency' ? value.toFixed(2) : Math.round(value);
        chartHeader.setAttribute('data-value', `${formattedValue}${unit}`);
    }
}

// Update chart data
function updateChart(gpuId, chartType, value, value2, value3, value4) {
    // Validate inputs
    if (!gpuId || !chartType) {
        console.warn('updateChart: Missing gpuId or chartType');
        return;
    }
    
    if (!chartData[gpuId]) initGPUData(gpuId);

    const data = chartData[gpuId][chartType];
    if (!data) {
        console.warn(`updateChart: Invalid chartType "${chartType}" for GPU ${gpuId}`);
        return;
    }
    
    const now = new Date().toLocaleTimeString();

    data.labels.push(now);
    
    // Safe number conversion helper
    const safeNumber = (val) => {
        const num = Number(val);
        return (isFinite(num) && num >= 0) ? num : 0;
    };
    
    // Handle multi-value charts
    if (chartType === 'clocks') {
        data.graphicsData.push(safeNumber(value));
        data.smData.push(safeNumber(value2));
        data.memoryData.push(safeNumber(value3));
    } else if (chartType === 'pcie') {
        data.dataRX.push(safeNumber(value));
        data.dataTX.push(safeNumber(value2));
    } else if (chartType === 'appclocks') {
        data.dataGr.push(safeNumber(value));
        data.dataMem.push(safeNumber(value2));
        data.dataSM.push(safeNumber(value3));
        data.dataVideo.push(safeNumber(value4));
    } else {
        data.data.push(safeNumber(value));
    }

    // Add threshold data based on chart type
    if (chartType === 'utilization') {
        data.thresholdData.push(80); // High load threshold at 80%
    } else if (chartType === 'temperature') {
        data.warningData.push(75); // Warning at 75°C
        data.dangerData.push(85);  // Danger at 85°C
    } else if (chartType === 'memory') {
        data.thresholdData.push(90); // High usage at 90%
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
        
        // Update mobile chart header with current value
        if (isMobile()) {
            updateMobileChartValue(gpuId, chartType, stats.current, unit);
        }
    }

    // Update chart if it exists with error handling
    if (charts[gpuId] && charts[gpuId][chartType]) {
        try {
            charts[gpuId][chartType].update('none');
        } catch (error) {
            console.error(`Error updating chart ${chartType} for GPU ${gpuId}:`, error);
        }
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
    });
}

// Initialize charts for a GPU
function initGPUCharts(gpuId) {
    if (!gpuId) {
        console.warn('initGPUCharts: Missing gpuId');
        return;
    }
    
    const chartTypes = ['utilization', 'temperature', 'memory', 'power', 'fanSpeed', 'clocks', 'efficiency', 'pcie', 'appclocks'];
    if (!charts[gpuId]) charts[gpuId] = {};

    // Initialize background utilization chart
    initUtilBackgroundChart(gpuId);

    chartTypes.forEach(type => {
        const canvas = document.getElementById(`chart-${type}-${gpuId}`);
        if (!canvas) return;
        
        // Destroy existing chart to prevent memory leaks
        if (charts[gpuId][type]) {
            try {
                charts[gpuId][type].destroy();
            } catch (error) {
                console.warn(`Error destroying existing chart ${type} for GPU ${gpuId}:`, error);
            }
        }
        
        if (canvas) {
            const config = JSON.parse(JSON.stringify(chartConfigs[type])); // Deep clone

            // Link datasets to chartData FIRST
            if (type === 'utilization') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].thresholdData;
            } else if (type === 'temperature') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].warningData;
                if (config.data.datasets[2]) config.data.datasets[2].data = chartData[gpuId][type].dangerData;
            } else if (type === 'memory') {
                config.data.datasets[0].data = chartData[gpuId][type].data;
                if (config.data.datasets[1]) config.data.datasets[1].data = chartData[gpuId][type].thresholdData;
            } else if (type === 'clocks') {
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
            
            // Optimize dataset appearance for mobile (BEFORE applying options)
            if (isMobile() && config.data.datasets) {
                // Make first dataset prominent
                config.data.datasets[0].borderWidth = 3;
                config.data.datasets[0].pointRadius = 0;
                config.data.datasets[0].fill = true;
                
                // Hide other datasets by making them invisible (don't remove them!)
                for (let i = 1; i < config.data.datasets.length; i++) {
                    config.data.datasets[i].hidden = true;
                    config.data.datasets[i].borderWidth = 0;
                }
            }
            
            // Apply mobile optimizations to chart options
            config.options = getMobileChartOptions(config.options);
            
            // Ensure canvas has proper dimensions before creating chart
            const parent = canvas.parentElement;
            if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
                // Set canvas dimensions to match container
                canvas.style.width = '100%';
                canvas.style.height = '100%';
            }
            
            // Create chart with error handling
            try {
                charts[gpuId][type] = new Chart(canvas, config);
            } catch (error) {
                console.error(`Error creating chart ${type} for GPU ${gpuId}:`, error);
            }
        }
    });
}

// Initialize overview mini chart
function initOverviewMiniChart(gpuId, currentValue) {
    if (!gpuId) {
        console.warn('initOverviewMiniChart: Missing gpuId');
        return;
    }
    
    const canvas = document.getElementById(`overview-chart-${gpuId}`);
    if (!canvas) return;
    
    // Destroy existing chart to prevent memory leaks
    if (charts[gpuId] && charts[gpuId].overviewMini) {
        try {
            charts[gpuId].overviewMini.destroy();
        } catch (error) {
            console.warn(`Error destroying existing overview chart for GPU ${gpuId}:`, error);
        }
    }

    // Initialize with current utilization value if not already initialized
    if (!chartData[gpuId]) {
        initGPUData(gpuId, { utilization: currentValue });
    }

    // Mobile-specific configuration for mini charts
    const fontSize = isMobile() ? 8 : 10;
    const yAxisDisplay = !isMobile() || window.innerWidth > 480;

    const config = {
        type: 'line',
        data: {
            labels: chartData[gpuId].utilization.labels,
            datasets: [{
                data: chartData[gpuId].utilization.data,
                borderColor: '#4facfe',
                backgroundColor: 'rgba(79, 172, 254, 0.15)',
                borderWidth: isMobile() ? 2 : 2.5,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Disable animations for overview charts
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    max: 100,
                    display: yAxisDisplay,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: { size: fontSize },
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
                    padding: isMobile() ? 8 : 12,
                    cornerRadius: 8,
                    titleFont: { size: isMobile() ? 11 : 12 },
                    bodyFont: { size: isMobile() ? 10 : 11 },
                    callbacks: {
                        label: context => `GPU: ${context.parsed.y.toFixed(1)}%`
                    }
                }
            }
        }
    };

    if (!charts[gpuId]) charts[gpuId] = {};
    
    try {
        charts[gpuId].overviewMini = new Chart(canvas, config);
    } catch (error) {
        console.error(`Error creating overview mini chart for GPU ${gpuId}:`, error);
    }
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

