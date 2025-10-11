/**
 * Socket.IO event handlers
 */

// Initialize Socket.IO connection
const socket = io();

// Throttling for DOM updates (text/cards) - tracks last update time per GPU
const lastDOMUpdate = {};
const DOM_UPDATE_INTERVAL = 1000; // Update text/cards every 1 second (while charts update at full speed)

// Handle incoming GPU data
socket.on('gpu_data', function(data) {
    const overviewContainer = document.getElementById('overview-container');

    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }

    const gpuCount = Object.keys(data.gpus).length;

    const now = Date.now();
    
    // Process each GPU
    Object.keys(data.gpus).forEach(gpuId => {
        const gpuInfo = data.gpus[gpuId];

        // Initialize chart data if needed
        if (!chartData[gpuId]) {
            initGPUData(gpuId);
        }

        // Check if we should update DOM (text/cards) for this GPU
        const shouldUpdateDOM = !lastDOMUpdate[gpuId] || (now - lastDOMUpdate[gpuId]) >= DOM_UPDATE_INTERVAL;

        // Update or create overview card
        const existingOverview = overviewContainer.querySelector(`[data-gpu-id="${gpuId}"]`);
        if (!existingOverview) {
            overviewContainer.insertAdjacentHTML('beforeend', createOverviewCard(gpuId, gpuInfo));
            initOverviewMiniChart(gpuId, gpuInfo.utilization);
            lastDOMUpdate[gpuId] = now;
        } else {
            // Always call to update charts, but pass shouldUpdateDOM flag for text updates
            updateOverviewCard(gpuId, gpuInfo, shouldUpdateDOM);
            if (shouldUpdateDOM) {
                lastDOMUpdate[gpuId] = now;
            }
        }

        // Ensure GPU has its own detail tab
        ensureGPUTab(gpuId, gpuInfo, shouldUpdateDOM);
    });

    // Auto-switch to single GPU view if only 1 GPU detected (first time only)
    autoSwitchSingleGPU(gpuCount, Object.keys(data.gpus));

    // Update processes and system info (throttled)
    if (!lastDOMUpdate.system || (now - lastDOMUpdate.system) >= DOM_UPDATE_INTERVAL) {
        updateProcesses(data.processes);
        updateSystemInfo(data.system);
        lastDOMUpdate.system = now;
    }
});

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
