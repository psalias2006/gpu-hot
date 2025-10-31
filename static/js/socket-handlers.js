/**
 * WebSocket event handlers
 */

// Initialize WebSocket connection with protocol detection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(protocol + '//' + window.location.host + '/socket.io/');

// Performance: Scroll detection to pause DOM updates during scroll
let isScrolling = false;
let scrollTimeout;
const SCROLL_PAUSE_DURATION = 100; // ms to wait after scroll stops before resuming updates

/**
 * Setup scroll event listeners to detect when user is scrolling
 * Uses passive listeners for better performance
 */
function setupScrollDetection() {
    const handleScroll = () => {
        isScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, SCROLL_PAUSE_DURATION);
    };
    
    // Wait for DOM to be ready
    setTimeout(() => {
        // Listen to window scroll (primary scroll container)
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        // Also listen to .container as fallback
        const container = document.querySelector('.container');
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
        }
    }, 500);
}

// Initialize scroll detection
setupScrollDetection();

// Performance: Batched rendering system using requestAnimationFrame
// Batches all DOM updates into a single frame to minimize reflows/repaints
let pendingUpdates = new Map(); // Queue of pending GPU/system updates
let rafScheduled = false; // Flag to prevent duplicate RAF scheduling

// Performance: Throttle text updates (less critical than charts)
const lastDOMUpdate = {}; // Track last update time per GPU
const DOM_UPDATE_INTERVAL = 1000; // Text/card updates every 1s, charts update every frame

// Handle incoming GPU data
socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    // Hub mode: different data structure with nodes
    if (data.mode === 'hub') {
        handleClusterData(data);
        return;
    }
    
    const overviewContainer = document.getElementById('overview-container');

    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }

    const gpuCount = Object.keys(data.gpus).length;
    const now = Date.now();
    
    // Performance: Skip ALL DOM updates during active scrolling
    if (isScrolling) {
        // Still update chart data arrays (lightweight) to maintain continuity
        // This ensures no data gaps when scroll ends
        Object.keys(data.gpus).forEach(gpuId => {
            if (!chartData[gpuId]) {
                initGPUData(gpuId);
            }
            updateAllChartDataOnly(gpuId, data.gpus[gpuId]);
        });
        return; // Exit early - zero DOM work during scroll = smooth 60 FPS
    }
    
    // Process each GPU - queue updates for batched rendering
    Object.keys(data.gpus).forEach(gpuId => {
        const gpuInfo = data.gpus[gpuId];

        // Initialize chart data structures if first time seeing this GPU
        if (!chartData[gpuId]) {
            initGPUData(gpuId);
        }

        // Determine if text/card DOM should update (throttled) or just charts (every frame)
        const shouldUpdateDOM = !lastDOMUpdate[gpuId] || (now - lastDOMUpdate[gpuId]) >= DOM_UPDATE_INTERVAL;

        // Queue this GPU's update instead of executing immediately
        pendingUpdates.set(gpuId, {
            gpuInfo,
            shouldUpdateDOM,
            now
        });

        // Handle initial card creation (can't be batched since we need the DOM element)
        const existingOverview = overviewContainer.querySelector(`[data-gpu-id="${gpuId}"]`);
        if (!existingOverview) {
            overviewContainer.insertAdjacentHTML('beforeend', createOverviewCard(gpuId, gpuInfo));
            initOverviewMiniChart(gpuId, gpuInfo.utilization);
            lastDOMUpdate[gpuId] = now;
            
            // Add disconnect button to the card
            const card = overviewContainer.querySelector(`[data-gpu-id="${gpuId}"]`);
            if (card && window.addGPUSelectCheckbox) {
                window.addGPUSelectCheckbox(gpuId, card);
            }
        }
    });
    
    // Queue system updates (processes/CPU/RAM) for batching
    if (!lastDOMUpdate.system || (now - lastDOMUpdate.system) >= DOM_UPDATE_INTERVAL) {
        pendingUpdates.set('_system', {
            processes: data.processes,
            system: data.system,
            now
        });
    }
    
    // Schedule single batched render (if not already scheduled)
    // This ensures all updates happen in ONE animation frame
    if (!rafScheduled && pendingUpdates.size > 0) {
        rafScheduled = true;
        requestAnimationFrame(processBatchedUpdates);
    }
    
    // Auto-switch to single GPU view if only 1 GPU detected (first time only)
    autoSwitchSingleGPU(gpuCount, Object.keys(data.gpus));
};

/**
 * Process all batched updates in a single animation frame
 * Called by requestAnimationFrame at optimal timing (~60 FPS)
 * 
 * Performance benefit: All DOM updates execute in ONE layout/paint cycle
 * instead of multiple cycles, eliminating layout thrashing
 */
function processBatchedUpdates() {
    rafScheduled = false;
    
    // Execute all queued updates in a single batch
    pendingUpdates.forEach((update, gpuId) => {
        if (gpuId === '_system') {
            // System updates (CPU, RAM, processes)
            updateProcesses(update.processes);
            updateSystemInfo(update.system);
            lastDOMUpdate.system = update.now;
        } else {
            // GPU updates
            const { gpuInfo, shouldUpdateDOM, now } = update;
            
            // Update overview card (always for charts, conditionally for text)
            updateOverviewCard(gpuId, gpuInfo, shouldUpdateDOM);
            if (shouldUpdateDOM) {
                lastDOMUpdate[gpuId] = now;
            }
            
            // Performance: Only update detail view if tab is visible
            // Invisible tabs = zero wasted processing
            const isDetailTabVisible = currentTab === `gpu-${gpuId}`;
            if (isDetailTabVisible || !registeredGPUs.has(gpuId)) {
                ensureGPUTab(gpuId, gpuInfo, shouldUpdateDOM && isDetailTabVisible);
            }
        }
    });
    
    // Clear queue for next batch
    pendingUpdates.clear();
}

/**
 * Update chart data arrays without triggering any rendering (used during scroll)
 * 
 * This maintains data continuity during scroll by collecting metrics
 * but skips expensive DOM/canvas updates for smooth 60 FPS scrolling
 * 
 * @param {string} gpuId - GPU identifier
 * @param {object} gpuInfo - GPU metrics data
 */
function updateAllChartDataOnly(gpuId, gpuInfo) {
    if (!chartData[gpuId]) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const memory_used = gpuInfo.memory_used || 0;
    const memory_total = gpuInfo.memory_total || 1;
    const memPercent = (memory_used / memory_total) * 100;
    const power_draw = gpuInfo.power_draw || 0;
    
    // Prepare all metric updates
    const metrics = {
        utilization: gpuInfo.utilization || 0,
        temperature: gpuInfo.temperature || 0,
        memory: memPercent,
        power: power_draw,
        fanSpeed: gpuInfo.fan_speed || 0,
        efficiency: power_draw > 0 ? (gpuInfo.utilization || 0) / power_draw : 0
    };
    
    // Update single-line charts
    Object.entries(metrics).forEach(([chartType, value]) => {
        const data = chartData[gpuId][chartType];
        if (!data?.labels || !data?.data) return;
        
        data.labels.push(timestamp);
        data.data.push(Number(value) || 0);
        
        // Add threshold lines for specific charts
        if (chartType === 'utilization' && data.thresholdData) {
            data.thresholdData.push(80);
        } else if (chartType === 'temperature') {
            if (data.warningData) data.warningData.push(75);
            if (data.dangerData) data.dangerData.push(85);
        } else if (chartType === 'memory' && data.thresholdData) {
            data.thresholdData.push(90);
        }
        
        // Maintain rolling window (120 points = 60s at 0.5s interval)
        if (data.labels.length > 120) {
            data.labels.shift();
            data.data.shift();
            if (data.thresholdData) data.thresholdData.shift();
            if (data.warningData) data.warningData.shift();
            if (data.dangerData) data.dangerData.shift();
        }
    });
    
    // Update multi-line charts (clocks)
    const clocksData = chartData[gpuId].clocks;
    if (clocksData?.labels) {
        clocksData.labels.push(timestamp);
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
socket.onopen = function() {
    console.log('Connected to server');
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('connection-status').style.color = '#43e97b';
};

socket.onclose = function() {
    console.log('Disconnected from server');
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-status').style.color = '#f5576c';
};

socket.onerror = function(error) {
    document.getElementById('connection-status').textContent = 'Connection Error';
    document.getElementById('connection-status').style.color = '#f5576c';
};

/**
 * Handle cluster/hub mode data
 * Data structure: { mode: 'hub', nodes: {...}, cluster_stats: {...} }
 */
function handleClusterData(data) {
    const overviewContainer = document.getElementById('overview-container');
    const now = Date.now();
    
    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }
    
    // Skip DOM updates during scrolling
    if (isScrolling) {
        // Still update chart data for continuity
        Object.entries(data.nodes).forEach(([nodeName, nodeData]) => {
            if (nodeData.status === 'online') {
                Object.keys(nodeData.gpus).forEach(gpuId => {
                    const fullGpuId = `${nodeName}-${gpuId}`;
                    if (!chartData[fullGpuId]) {
                        initGPUData(fullGpuId);
                    }
                    updateAllChartDataOnly(fullGpuId, nodeData.gpus[gpuId]);
                });
            }
        });
        return;
    }
    
    // Render GPUs grouped by node (minimal grouping)
    Object.entries(data.nodes).forEach(([nodeName, nodeData]) => {
        // Get or create node group container
        let nodeGroup = overviewContainer.querySelector(`[data-node="${nodeName}"]`);
        if (!nodeGroup) {
            overviewContainer.insertAdjacentHTML('beforeend', `
                <div class="node-group" data-node="${nodeName}">
                    <div class="node-label">${nodeName}</div>
                    <div class="node-grid"></div>
                </div>
            `);
            nodeGroup = overviewContainer.querySelector(`[data-node="${nodeName}"]`);
        }
        
        const nodeGrid = nodeGroup.querySelector('.node-grid');
        
        if (nodeData.status === 'online') {
            // Node is online - process its GPUs normally
            Object.entries(nodeData.gpus).forEach(([gpuId, gpuInfo]) => {
                const fullGpuId = `${nodeName}-${gpuId}`;
                
                // Initialize chart data
                if (!chartData[fullGpuId]) {
                    initGPUData(fullGpuId);
                }
                
                // Queue update
                const shouldUpdateDOM = !lastDOMUpdate[fullGpuId] || (now - lastDOMUpdate[fullGpuId]) >= DOM_UPDATE_INTERVAL;
                pendingUpdates.set(fullGpuId, {
                    gpuInfo,
                    shouldUpdateDOM,
                    now,
                    nodeName
                });
                
                // Create card if doesn't exist
                const existingCard = nodeGrid.querySelector(`[data-gpu-id="${fullGpuId}"]`);
                if (!existingCard) {
                    nodeGrid.insertAdjacentHTML('beforeend', createClusterGPUCard(nodeName, gpuId, gpuInfo));
                    initOverviewMiniChart(fullGpuId, gpuInfo.utilization);
                    lastDOMUpdate[fullGpuId] = now;
                    
                    // Add disconnect button to the card
                    const card = nodeGrid.querySelector(`[data-gpu-id="${fullGpuId}"]`);
                    if (card && window.addGPUSelectCheckbox) {
                        window.addGPUSelectCheckbox(fullGpuId, card, { node_name: nodeName });
                    }
                }
            });
        } else {
            // Node is offline - remove entire node group
            const existingCards = nodeGrid.querySelectorAll('[data-gpu-id]');
            existingCards.forEach(card => {
                const gpuId = card.getAttribute('data-gpu-id');
                // Clean up chart data
                if (chartData[gpuId]) {
                    delete chartData[gpuId];
                }
                if (lastDOMUpdate[gpuId]) {
                    delete lastDOMUpdate[gpuId];
                }
                // Remove the GPU tab
                removeGPUTab(gpuId);
            });
            
            // Remove the entire node group from the UI
            nodeGroup.remove();
        }
    });
    
    // Update processes and system info (use first online node)
    const firstOnlineNode = Object.values(data.nodes).find(n => n.status === 'online');
    if (firstOnlineNode) {
        if (!lastDOMUpdate.system || (now - lastDOMUpdate.system) >= DOM_UPDATE_INTERVAL) {
            pendingUpdates.set('_system', {
                processes: firstOnlineNode.processes || [],
                system: firstOnlineNode.system || {},
                now
            });
        }
    }
    
    // Schedule batched render
    if (!rafScheduled && pendingUpdates.size > 0) {
        rafScheduled = true;
        requestAnimationFrame(processBatchedUpdates);
    }
}

/**
 * Create GPU card for cluster view (includes node name)
 */
function createClusterGPUCard(nodeName, gpuId, gpuInfo) {
    const fullGpuId = `${nodeName}-${gpuId}`;
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const memPercent = (memory_used / memory_total) * 100;

    return `
        <div class="overview-gpu-card" data-gpu-id="${fullGpuId}" onclick="switchToView('gpu-${fullGpuId}')" style="pointer-events: auto;">
            <div class="overview-header">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; background: var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 0.25rem;">
                        GPU ${gpuId}
                    </h2>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">${getMetricValue(gpuInfo, 'name', 'Unknown GPU')}</p>
                </div>
                <div class="gpu-status-badge">
                    <span class="status-dot"></span>
                    <span class="status-text">ONLINE</span>
                </div>
            </div>

            <div class="overview-metrics">
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-util-${fullGpuId}">${getMetricValue(gpuInfo, 'utilization', 0)}%</div>
                    <div class="overview-metric-label">GPU Usage</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-temp-${fullGpuId}">${getMetricValue(gpuInfo, 'temperature', 0)}°C</div>
                    <div class="overview-metric-label">Temperature</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-mem-${fullGpuId}">${Math.round(memPercent)}%</div>
                    <div class="overview-metric-label">Memory</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-power-${fullGpuId}">${getMetricValue(gpuInfo, 'power_draw', 0).toFixed(0)}W</div>
                    <div class="overview-metric-label">Power Draw</div>
                </div>
            </div>

            <div class="overview-chart-section">
                <div class="overview-mini-chart">
                    <canvas id="overview-chart-${fullGpuId}"></canvas>
                </div>
            </div>
        </div>
    `;
}
