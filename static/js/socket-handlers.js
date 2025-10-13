/**
 * Socket.IO event handlers
 * Unified node-based rendering for both standalone and cluster modes
 */

// Initialize Socket.IO connection
const socket = io();

// View mode state
let viewMode = 'by-node'; // 'by-node' or 'all-gpus'
let collapsedNodes = new Set();

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

/**
 * Create node section with collapsible GPU cards
 */
function createNodeSection(nodeUrl, nodeData) {
    const metadata = nodeData.metadata || {};
    const nodeConfig = nodeData.node_config || {};
    const nodeName = nodeConfig.name || metadata.hostname || nodeUrl;
    const gpus = nodeData.gpus || {};
    const status = nodeData.status || 'unknown';
    const gpuCount = Object.keys(gpus).length;
    
    // Determine status badge
    let statusClass = 'status-unknown';
    let statusText = 'ONLINE';
    let statusIcon = '✓';
    
    if (status === 'offline') {
        statusClass = 'status-offline';
        statusText = 'OFFLINE';
        statusIcon = '×';
    } else if (status === 'error') {
        statusClass = 'status-error';
        statusText = 'ERROR';
        statusIcon = '!';
    }
    
    // Format last seen
    let lastSeenText = '';
    if (nodeData.cache_age) {
        lastSeenText = `Cached (${Math.round(nodeData.cache_age)}s ago)`;
    } else if (status === 'online') {
        lastSeenText = 'Live';
    }
    
    // For single node (standalone), hide node header if name is "Local"
    const isSingleLocalNode = nodeName === 'Local' && nodeUrl === 'localhost';
    const isCollapsed = collapsedNodes.has(nodeUrl);
    
    if (isSingleLocalNode) {
        // Standalone mode: skip node wrapper, show GPUs directly
        return `<div class="node-gpus-grid" id="node-gpus-${nodeUrl}"></div>`;
    }
    
    // Multi-node or named node: show full node section
    return `
        <div class="node-section ${isCollapsed ? 'collapsed' : ''}" data-node-url="${nodeUrl}">
            <div class="node-header" onclick="toggleNodeSection('${nodeUrl}')">
                <div class="node-info">
                    <div class="node-title">
                        <span class="node-collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
                        <h2>${nodeName}</h2>
                        <span class="node-status-badge ${statusClass}">
                            <span class="status-icon">${statusIcon}</span>
                            ${statusText}
                        </span>
                    </div>
                    <div class="node-metadata">
                        ${metadata.hostname && metadata.hostname !== nodeName ? `
                        <span class="node-meta-item">
                            <span class="meta-label">Hostname:</span> ${metadata.hostname}
                        </span>
                        ` : ''}
                        ${metadata.ip_address && metadata.ip_address !== '127.0.0.1' ? `
                        <span class="node-meta-item">
                            <span class="meta-label">IP:</span> ${metadata.ip_address}
                        </span>
                        ` : ''}
                        <span class="node-meta-item">
                            <span class="meta-label">GPUs:</span> ${gpuCount}
                        </span>
                        ${lastSeenText ? `
                        <span class="node-meta-item">
                            <span class="meta-label">Status:</span> ${lastSeenText}
                        </span>
                        ` : ''}
                        ${nodeConfig.tags && nodeConfig.tags.length > 0 ? `
                        <span class="node-meta-item">
                            <span class="meta-label">Tags:</span> ${nodeConfig.tags.map(tag => `<span class="node-tag">${tag}</span>`).join(' ')}
                        </span>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="node-content ${isCollapsed ? 'hidden' : ''}">
                <div class="node-gpus-grid" id="node-gpus-${nodeUrl}">
                    ${gpuCount === 0 ? '<div class="no-gpus">No GPUs detected</div>' : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Toggle node section collapse state
 */
function toggleNodeSection(nodeUrl) {
    const section = document.querySelector(`[data-node-url="${nodeUrl}"]`);
    if (!section) return;
    
    const isCurrentlyCollapsed = collapsedNodes.has(nodeUrl);
    
    if (isCurrentlyCollapsed) {
        collapsedNodes.delete(nodeUrl);
        section.classList.remove('collapsed');
        section.querySelector('.node-content').classList.remove('hidden');
        section.querySelector('.node-collapse-icon').textContent = '▼';
    } else {
        collapsedNodes.add(nodeUrl);
        section.classList.add('collapsed');
        section.querySelector('.node-content').classList.add('hidden');
        section.querySelector('.node-collapse-icon').textContent = '▶';
    }
}

/**
 * Render node view with GPUs
 */
function renderNodeView(nodes) {
    const container = document.getElementById('overview-container');
    if (!container) return;
    
    const nodeUrls = Object.keys(nodes);
    
    if (nodeUrls.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-text">No Nodes Configured</div>
                <div class="empty-state-subtext">Configure nodes via GPU_HOT_NODES environment variable or nodes.yaml file</div>
            </div>
        `;
        return;
    }
    
    if (viewMode === 'by-node') {
        // Group by node view
        container.innerHTML = nodeUrls.map(nodeUrl => {
            return createNodeSection(nodeUrl, nodes[nodeUrl]);
        }).join('');
        
        // Populate GPU cards for each node
        nodeUrls.forEach(nodeUrl => {
            const nodeData = nodes[nodeUrl];
            const gpus = nodeData.gpus || {};
            const nodeContainer = document.getElementById(`node-gpus-${nodeUrl}`);
            
            if (nodeContainer && Object.keys(gpus).length > 0) {
                Object.keys(gpus).forEach(gpuId => {
                    const gpuInfo = gpus[gpuId];
                    const compoundId = `${nodeUrl}:${gpuId}`;
                    
                    // Add node context to GPU info
                    gpuInfo._node_url = nodeUrl;
                    gpuInfo._node_name = nodeData.node_config?.name || nodeUrl;
                    gpuInfo._node_status = nodeData.status;
                    
                    // Create overview card
                    const existingCard = nodeContainer.querySelector(`[data-gpu-id="${compoundId}"]`);
                    if (!existingCard) {
                        nodeContainer.insertAdjacentHTML('beforeend', createOverviewCard(compoundId, gpuInfo));
                        if (!chartData[compoundId]) {
                            initGPUData(compoundId);
                        }
                        initOverviewMiniChart(compoundId, gpuInfo.utilization);
                    }
                });
            }
        });
    } else {
        // All GPUs flat view
        container.innerHTML = '<div class="overview-grid" id="flat-gpu-grid"></div>';
        const flatGrid = document.getElementById('flat-gpu-grid');
        
        nodeUrls.forEach(nodeUrl => {
            const nodeData = nodes[nodeUrl];
            const gpus = nodeData.gpus || {};
            
            Object.keys(gpus).forEach(gpuId => {
                const gpuInfo = gpus[gpuId];
                const compoundId = `${nodeUrl}:${gpuId}`;
                
                gpuInfo._node_url = nodeUrl;
                gpuInfo._node_name = nodeData.node_config?.name || nodeUrl;
                gpuInfo._node_status = nodeData.status;
                
                const existingCard = flatGrid.querySelector(`[data-gpu-id="${compoundId}"]`);
                if (!existingCard) {
                    flatGrid.insertAdjacentHTML('beforeend', createOverviewCard(compoundId, gpuInfo));
                    if (!chartData[compoundId]) {
                        initGPUData(compoundId);
                    }
                    initOverviewMiniChart(compoundId, gpuInfo.utilization);
                }
            });
        });
    }
}

/**
 * Switch view mode
 */
function switchViewMode(mode) {
    viewMode = mode;
    
    // Update button states
    document.querySelectorAll('.view-mode-option').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.viewMode === mode) {
            btn.classList.add('active');
        }
    });
    
    // Re-render will happen on next data update
}

/**
 * Create view mode controls
 */
function createViewModeControls(nodeCount) {
    const viewSelector = document.getElementById('view-selector');
    if (!viewSelector) return;
    
    // Only show view toggle for multi-node setups
    if (nodeCount <= 1) return;
    
    // Check if already exists
    if (document.querySelector('.view-mode-controls')) return;
    
    // Add view toggle buttons
    const controls = document.createElement('div');
    controls.className = 'view-mode-controls';
    controls.innerHTML = `
        <button class="view-mode-option active" data-view-mode="by-node" onclick="switchViewMode('by-node')">
            By Node
        </button>
        <button class="view-mode-option" data-view-mode="all-gpus" onclick="switchViewMode('all-gpus')">
            All GPUs
        </button>
    `;
    
    viewSelector.insertBefore(controls, viewSelector.firstChild);
}

// Make functions globally available
window.toggleNodeSection = toggleNodeSection;
window.switchViewMode = switchViewMode;

// Handle incoming GPU data - always in node format
socket.on('gpu_data', function(data) {
    const overviewContainer = document.getElementById('overview-container');

    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }

    // Always process as nodes (standalone = 1 node, cluster = N nodes)
    const nodes = data.nodes || {};
    const nodeUrls = Object.keys(nodes);
    const nodeCount = nodeUrls.length;
    
    // Render node view
    renderNodeView(nodes);
    
    // Create view mode controls if multiple nodes
    createViewModeControls(nodeCount);
    
    // Flatten data for chart updates and backward compatibility
    const flatGpus = {};
    for (const nodeUrl in nodes) {
        const nodeData = nodes[nodeUrl];
        const nodeName = nodeData.node_config?.name || nodeUrl;
        for (const gpuId in nodeData.gpus) {
            const compoundId = `${nodeUrl}:${gpuId}`;
            flatGpus[compoundId] = {
                ...nodeData.gpus[gpuId],
                _node_url: nodeUrl,
                _node_name: nodeName,
                _node_status: nodeData.status
            };
        }
    }
    
    // Process aggregated processes
    const allProcesses = [];
    for (const nodeUrl in nodes) {
        const nodeData = nodes[nodeUrl];
        const nodeName = nodeData.node_config?.name || nodeUrl;
        for (const process of (nodeData.processes || [])) {
            allProcesses.push({
                ...process,
                _node_name: nodeName
            });
        }
    }
    
    const gpuCount = Object.keys(flatGpus).length;
    const now = Date.now();
    
    // Performance: Skip ALL DOM updates during active scrolling
    if (isScrolling) {
        // Still update chart data arrays (lightweight) to maintain continuity
        // This ensures no data gaps when scroll ends
        Object.keys(flatGpus).forEach(gpuId => {
            if (!chartData[gpuId]) {
                initGPUData(gpuId);
            }
            updateAllChartDataOnly(gpuId, flatGpus[gpuId]);
        });
        return; // Exit early - zero DOM work during scroll = smooth 60 FPS
    }
    
    // Process each GPU - queue updates for batched rendering
    Object.keys(flatGpus).forEach(gpuId => {
        const gpuInfo = flatGpus[gpuId];

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
        }
    });
    
    // Queue system updates (processes/CPU/RAM) for batching
    // Use aggregated system data from first node (for standalone) or combined (for cluster)
    const firstNode = nodes[nodeUrls[0]];
    if (!lastDOMUpdate.system || (now - lastDOMUpdate.system) >= DOM_UPDATE_INTERVAL) {
        pendingUpdates.set('_system', {
            processes: allProcesses,
            system: firstNode?.system || {},
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
});

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
