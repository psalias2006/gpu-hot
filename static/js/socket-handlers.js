/**
 * Socket.IO event handlers
 */

// Initialize Socket.IO connection
const socket = io();

// Handle incoming GPU data
socket.on('gpu_data', function(data) {
    const overviewContainer = document.getElementById('overview-container');

    // Clear loading state
    if (overviewContainer.innerHTML.includes('Loading GPU data')) {
        overviewContainer.innerHTML = '';
    }

    const gpuCount = Object.keys(data.gpus).length;

    // Process each GPU
    Object.keys(data.gpus).forEach(gpuId => {
        const gpuInfo = data.gpus[gpuId];

        // Initialize chart data if needed
        if (!chartData[gpuId]) {
            initGPUData(gpuId);
        }

        // Update or create overview card
        const existingOverview = overviewContainer.querySelector(`[data-gpu-id="${gpuId}"]`);
        if (!existingOverview) {
            overviewContainer.insertAdjacentHTML('beforeend', createOverviewCard(gpuId, gpuInfo));
            initOverviewMiniChart(gpuId, gpuInfo.utilization);
        } else {
            updateOverviewCard(gpuId, gpuInfo);
        }

        // Ensure GPU has its own detail tab
        ensureGPUTab(gpuId, gpuInfo);
    });

    // Auto-switch to single GPU view if only 1 GPU detected (first time only)
    autoSwitchSingleGPU(gpuCount, Object.keys(data.gpus));

    // Update processes and system info
    updateProcesses(data.processes);
    updateSystemInfo(data.system);
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
