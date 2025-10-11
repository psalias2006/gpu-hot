/**
 * Socket.IO event handlers
 */

// Initialize Socket.IO connection
const socket = io();

// Scroll detection to pause updates during scroll
let isScrolling = false;
let scrollTimeout;
const SCROLL_PAUSE_DURATION = 100; // ms to wait after scroll stops

// Detect scrolling and pause updates (on window, where actual scroll happens)
function setupScrollDetection() {
    // Wait for DOM ready
    setTimeout(() => {
        window.addEventListener('scroll', function() {
            isScrolling = true;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
            }, SCROLL_PAUSE_DURATION);
        }, { passive: true });
        
        // Also catch container scroll as fallback
        const container = document.querySelector('.container');
        if (container) {
            container.addEventListener('scroll', function() {
                isScrolling = true;
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    isScrolling = false;
                }, SCROLL_PAUSE_DURATION);
            }, { passive: true });
        }
    }, 500);
}

// Initialize scroll detection
setupScrollDetection();

// Batched rendering system using requestAnimationFrame
let pendingUpdates = new Map(); // Store pending GPU updates
let rafScheduled = false;

// Throttling for DOM updates (text/cards) - tracks last update time per GPU
const lastDOMUpdate = {};
const DOM_UPDATE_INTERVAL = 1000; // Update text/cards every 1 second

// Handle incoming GPU data
socket.on('gpu_data', function(data) {
    const overviewContainer = document.getElementById('overview-container');

    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }

    const gpuCount = Object.keys(data.gpus).length;

    const now = Date.now();
    
    // Skip ALL DOM updates if user is actively scrolling
    if (isScrolling) {
        // Still update ALL chart data arrays (lightweight) but skip rendering
        Object.keys(data.gpus).forEach(gpuId => {
            const gpuInfo = data.gpus[gpuId];
            if (!chartData[gpuId]) {
                initGPUData(gpuId);
            }
            // Add ALL metrics data points silently (no rendering)
            updateAllChartDataOnly(gpuId, gpuInfo);
        });
        return; // Skip all DOM updates during scroll
    }
    
    // Process each GPU - batch all updates into a single animation frame
    Object.keys(data.gpus).forEach(gpuId => {
        const gpuInfo = data.gpus[gpuId];

        // Initialize chart data if needed
        if (!chartData[gpuId]) {
            initGPUData(gpuId);
        }

        // Check if we should update DOM (text/cards) for this GPU
        const shouldUpdateDOM = !lastDOMUpdate[gpuId] || (now - lastDOMUpdate[gpuId]) >= DOM_UPDATE_INTERVAL;

        // Store update in pending queue instead of executing immediately
        pendingUpdates.set(gpuId, {
            gpuInfo: gpuInfo,
            shouldUpdateDOM: shouldUpdateDOM,
            now: now
        });

        // Update or create overview card (initial creation only - no batching needed)
        const existingOverview = overviewContainer.querySelector(`[data-gpu-id="${gpuId}"]`);
        if (!existingOverview) {
            overviewContainer.insertAdjacentHTML('beforeend', createOverviewCard(gpuId, gpuInfo));
            initOverviewMiniChart(gpuId, gpuInfo.utilization);
            lastDOMUpdate[gpuId] = now;
        }
    });
    
    // Schedule batched render if not already scheduled
    if (!rafScheduled && pendingUpdates.size > 0) {
        rafScheduled = true;
        requestAnimationFrame(processBatchedUpdates);
    }

    // Store system updates for batching too
    if (!isScrolling && (!lastDOMUpdate.system || (now - lastDOMUpdate.system) >= DOM_UPDATE_INTERVAL)) {
        pendingUpdates.set('_system', {
            processes: data.processes,
            system: data.system,
            now: now
        });
    }
    
    // Auto-switch to single GPU view if only 1 GPU detected (first time only)
    autoSwitchSingleGPU(gpuCount, Object.keys(data.gpus));
});

// Process all batched updates in a single animation frame
function processBatchedUpdates() {
    rafScheduled = false;
    
    // Batch all DOM updates together to minimize reflows
    pendingUpdates.forEach((update, gpuId) => {
        if (gpuId === '_system') {
            // System updates
            updateProcesses(update.processes);
            updateSystemInfo(update.system);
            lastDOMUpdate.system = update.now;
        } else {
            // GPU updates
            const { gpuInfo, shouldUpdateDOM, now } = update;
            
            // Update overview card
            updateOverviewCard(gpuId, gpuInfo, shouldUpdateDOM);
            if (shouldUpdateDOM) {
                lastDOMUpdate[gpuId] = now;
            }
            
            // Only update detail tab if it's currently visible
            const isDetailTabVisible = currentTab === `gpu-${gpuId}`;
            if (isDetailTabVisible || !registeredGPUs.has(gpuId)) {
                ensureGPUTab(gpuId, gpuInfo, shouldUpdateDOM && isDetailTabVisible);
            }
        }
    });
    
    // Clear pending updates
    pendingUpdates.clear();
}

// Helper function to update ALL chart data arrays without rendering (during scroll)
function updateAllChartDataOnly(gpuId, gpuInfo) {
    if (!chartData[gpuId]) return;
    
    const now = new Date().toLocaleTimeString();
    const memory_used = gpuInfo.memory_used || 0;
    const memory_total = gpuInfo.memory_total || 1;
    const memPercent = (memory_used / memory_total) * 100;
    
    // Update all chart types with current data
    const updates = {
        utilization: gpuInfo.utilization || 0,
        temperature: gpuInfo.temperature || 0,
        memory: memPercent,
        power: gpuInfo.power_draw || 0,
        fanSpeed: gpuInfo.fan_speed || 0,
        efficiency: (gpuInfo.power_draw > 0 ? (gpuInfo.utilization || 0) / gpuInfo.power_draw : 0)
    };
    
    // Update each chart's data array
    Object.keys(updates).forEach(chartType => {
        const data = chartData[gpuId][chartType];
        if (data && data.labels && data.data) {
            data.labels.push(now);
            data.data.push(Number(updates[chartType]) || 0);
            
            // Add threshold data where needed
            if (chartType === 'utilization') {
                if (data.thresholdData) data.thresholdData.push(80);
            } else if (chartType === 'temperature') {
                if (data.warningData) data.warningData.push(75);
                if (data.dangerData) data.dangerData.push(85);
            } else if (chartType === 'memory') {
                if (data.thresholdData) data.thresholdData.push(90);
            }
            
            // Keep same limit as normal updates (120 points)
            if (data.labels.length > 120) {
                data.labels.shift();
                data.data.shift();
                if (data.thresholdData) data.thresholdData.shift();
                if (data.warningData) data.warningData.shift();
                if (data.dangerData) data.dangerData.shift();
            }
        }
    });
    
    // Update multi-line charts (clocks, pcie, etc.)
    const clocksData = chartData[gpuId].clocks;
    if (clocksData) {
        clocksData.labels.push(now);
        clocksData.graphicsData.push(gpuInfo.clock_graphics || 0);
        clocksData.smData.push(gpuInfo.clock_sm || 0);
        clocksData.memoryData.push(gpuInfo.clock_memory || 0);
        
        if (clocksData.labels.length > 120) {
            clocksData.labels.shift();
            clocksData.graphicsData.shift();
            clocksData.smData.shift();
            clocksData.memoryData.shift();
        }
    }
}

// Handle connection status
socket.on('connect', function() {
    console.log('Connected to server');
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('connection-status').style.color = '#43e97b';
});

socket.on('disconnect', function() {
    console.log('Disconnected from server');
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-status').style.color = '#f5576c';
});

// Handle connection errors
socket.on('connect_error', function() {
    document.getElementById('connection-status').textContent = 'Connection Error';
    document.getElementById('connection-status').style.color = '#f5576c';
});
