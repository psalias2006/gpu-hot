/**
 * GPU Disconnect Controls - Frontend functionality for GPU disconnect operations
 * Handles method selection modals, confirmations, and status updates
 */

// Global state for disconnect operations
let disconnectState = {
    currentGpu: null,
    selectedGpus: new Set(),
    disconnectMethods: {},
    systemCapabilities: null,
    hubMode: false,
    nodeInfo: {}
};

// Disconnect operation status
let activeDisconnects = new Map(); // gpuId -> {status, startTime, method}

/**
 * Initialize disconnect controls
 */
function initDisconnectControls() {
    console.log('Initializing GPU disconnect controls');
    
    // Check system capabilities
    checkDisconnectCapabilities();
    
    // Setup UI event listeners
    setupDisconnectEventListeners();
    
    // Check if we're in hub mode
    detectHubMode();
}

/**
 * Check system disconnect capabilities
 */
async function checkDisconnectCapabilities() {
    try {
        let endpoint = disconnectState.hubMode ? '/api/hub/gpu/disconnect/status' : '/api/gpu/disconnect/status';
        const response = await fetch(endpoint);
        const data = await response.json();
        
        disconnectState.systemCapabilities = data;
        console.log('System disconnect capabilities:', data);
        
        // Update UI based on capabilities
        updateDisconnectUI();
        
    } catch (error) {
        console.error('Error checking disconnect capabilities:', error);
        disconnectState.systemCapabilities = { ready: false };
        updateDisconnectUI();
    }
}

/**
 * Detect if we're in hub mode
 */
function detectHubMode() {
    // Check if we have hub-specific data in the page
    disconnectState.hubMode = window.location.pathname.includes('hub') || 
                              document.body.classList.contains('hub-mode') ||
                              (window.currentData && window.currentData.mode === 'hub');
    
    if (disconnectState.hubMode) {
        console.log('Running in hub mode - enabling hub disconnect features');
        loadNodeInfo();
    }
}

/**
 * Load node information for hub mode
 */
async function loadNodeInfo() {
    try {
        const response = await fetch('/api/hub/nodes');
        const data = await response.json();
        disconnectState.nodeInfo = data;
        console.log('Node info loaded:', data);
    } catch (error) {
        console.error('Error loading node info:', error);
    }
}

/**
 * Setup event listeners for disconnect controls
 */
function setupDisconnectEventListeners() {
    // Listen for modal close events
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeDisconnectModal();
        }
    });
    
    // Listen for ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDisconnectModal();
        }
    });
    
    // Multi-select functionality removed - using individual disconnect buttons now
}

/**
 * Add disconnect button to a GPU card
 */
function addDisconnectButton(gpuId, gpuCard, nodeInfo = null) {
    // Check if button already exists
    if (gpuCard.querySelector('.disconnect-button')) {
        return;
    }
    
    // Create disconnect button
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'disconnect-button';
    disconnectBtn.innerHTML = '<span class="disconnect-icon">⚡</span> Disconnect';
    disconnectBtn.onclick = () => showDisconnectModal(gpuId, nodeInfo);
    
    // Add to GPU card actions area
    let actionsArea = gpuCard.querySelector('.gpu-actions');
    if (!actionsArea) {
        actionsArea = document.createElement('div');
        actionsArea.className = 'gpu-actions';
        gpuCard.appendChild(actionsArea);
    }
    
    actionsArea.appendChild(disconnectBtn);
    
    // Update button state based on system capabilities
    updateDisconnectButtonState(disconnectBtn, gpuId);
}

/**
 * Add multi-select checkbox to GPU card
 */
function addGPUSelectCheckbox(gpuId, gpuCard, nodeInfo = null) {
    // Check if disconnect button already exists
    if (gpuCard.querySelector('.gpu-disconnect-button')) {
        return;
    }
    
    // Create disconnect button container
    const disconnectContainer = document.createElement('div');
    disconnectContainer.className = 'gpu-disconnect-container';
    
    // Create pill-shaped disconnect button
    const disconnectButton = document.createElement('button');
    disconnectButton.className = 'gpu-disconnect-button';
    disconnectButton.dataset.gpuId = gpuId;
    if (nodeInfo) {
        disconnectButton.dataset.nodeName = nodeInfo.node_name;
    }
    
    // Add icon and text
    const iconSpan = document.createElement('span');
    iconSpan.className = 'disconnect-dot';
    disconnectButton.appendChild(iconSpan);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'disconnect-text';
    textSpan.textContent = 'Simulate Disconnect';
    disconnectButton.appendChild(textSpan);
    
    // Add click handler
    disconnectButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        showDisconnectModal(gpuId, nodeInfo);
    });
    
    disconnectContainer.appendChild(disconnectButton);
    
    // Position at top-right of the GPU card, aligned with ONLINE badge
    disconnectContainer.style.position = 'absolute';
    disconnectContainer.style.right = '200px';
    disconnectContainer.style.top = '35px';
    disconnectContainer.style.zIndex = '10';
    
    // Add to GPU card (not header, so it's positioned relative to the card)
    gpuCard.style.position = 'relative';
    gpuCard.appendChild(disconnectContainer);
}

/**
 * Show disconnect modal for a specific GPU
 */
async function showDisconnectModal(gpuId, nodeInfo = null) {
    disconnectState.currentGpu = { id: gpuId, node: nodeInfo };
    
    try {
        // Get available methods
        const methods = await getAvailableMethods(gpuId, nodeInfo);
        disconnectState.disconnectMethods[gpuId] = methods;
        
        // Create and show modal
        const modal = createDisconnectModal(gpuId, methods, nodeInfo);
        document.body.appendChild(modal);
        
        // Animate modal in
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.querySelector('.disconnect-modal').style.transform = 'scale(1)';
        });
        
    } catch (error) {
        console.error('Error showing disconnect modal:', error);
        showNotification(`Error loading disconnect options: ${error.message}`, 'error');
    }
}

/**
 * Show multi-GPU disconnect modal
 */
function showMultiDisconnectModal() {
    if (disconnectState.selectedGpus.size === 0) {
        showNotification('Please select at least one GPU', 'warning');
        return;
    }
    
    const selectedArray = Array.from(disconnectState.selectedGpus);
    console.log('Showing multi-disconnect modal for:', selectedArray);
    
    const modal = createMultiDisconnectModal(selectedArray);
    document.body.appendChild(modal);
    
    // Animate modal in
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.querySelector('.disconnect-modal').style.transform = 'scale(1)';
    });
}

/**
 * Create disconnect modal HTML
 */
function createDisconnectModal(gpuId, methods, nodeInfo) {
    const modalHtml = `
        <div class="modal-overlay disconnect-modal-overlay">
            <div class="disconnect-modal">
                <div class="modal-header">
                    <h3>Disconnect ${nodeInfo ? `${nodeInfo.node_name}/` : ''}GPU ${gpuId}</h3>
                    <button class="modal-close" onclick="closeDisconnectModal()">×</button>
                </div>
                
                <div class="modal-content">
                    <div class="method-selection">
                        <label>Disconnect Method:</label>
                        <select id="disconnect-method-select">
                            ${methods.map(method => `
                                <option value="${method}">${formatMethodName(method)}</option>
                            `).join('')}
                        </select>
                        <div class="method-description" id="method-description">
                            ${getMethodDescription(methods[0])}
                        </div>
                    </div>
                    
                    <div class="timing-controls">
                        <label>Disconnect Duration:</label>
                        <div class="time-options">
                            <button class="time-btn active" data-time="5">5 sec</button>
                            <button class="time-btn" data-time="10">10 sec</button>
                            <button class="time-btn" data-time="30">30 sec</button>
                            <button class="time-btn" data-time="60">1 min</button>
                            <input type="number" id="custom-time" placeholder="Custom (sec)" min="1" max="300">
                        </div>
                    </div>
                    
                    <div class="active-processes-warning" id="processes-warning" style="display: none;">
                        <div class="warning-icon">🔄</div>
                        <div class="warning-text">
                            <strong>Active Processes Detected:</strong> This GPU may have running processes that will be interrupted.
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeDisconnectModal()">Cancel</button>
                    <button class="btn-danger" onclick="executeDisconnect()">
                        <span class="disconnect-icon">⚡</span> Disconnect GPU
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.innerHTML = modalHtml;
    const modalElement = modal.firstElementChild;
    
    // Setup event listeners
    setupModalEventListeners(modalElement);
    
    return modalElement;
}

/**
 * Create multi-GPU disconnect modal
 */
function createMultiDisconnectModal(selectedGpus) {
    const gpuList = selectedGpus.map(gpu => {
        if (typeof gpu === 'object') {
            return `${gpu.node || 'local'}/${gpu.id}`;
        }
        return `GPU ${gpu}`;
    }).join(', ');
    
    const modalHtml = `
        <div class="modal-overlay disconnect-modal-overlay">
            <div class="disconnect-modal multi-disconnect-modal">
                <div class="modal-header">
                    <h3>Disconnect Multiple GPUs</h3>
                    <button class="modal-close" onclick="closeDisconnectModal()">×</button>
                </div>
                
                <div class="modal-content">
                    <div class="selected-gpus">
                        <label>Selected GPUs (${selectedGpus.length}):</label>
                        <div class="gpu-list">${gpuList}</div>
                    </div>
                    
                    <div class="disconnect-warning multi-warning">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-text">
                            <strong>Mass Disconnect Warning:</strong> This will disconnect <strong>${selectedGpus.length} GPUs</strong> simultaneously.
                            All running processes on these GPUs will be interrupted.
                        </div>
                    </div>
                    
                    <div class="method-selection">
                        <label>Disconnect Method:</label>
                        <select id="multi-disconnect-method-select">
                            <option value="auto">Auto (Best Available)</option>
                            <option value="logical">Logical Remove/Rescan</option>
                            <option value="hot">Hot Reset</option>
                            <option value="slot">Slot Power (if available)</option>
                        </select>
                        <div class="method-description" id="multi-method-description">
                            ${getMethodDescription('auto')}
                        </div>
                    </div>
                    
                    <div class="timing-controls">
                        <label>Disconnect Duration:</label>
                        <div class="time-options">
                            <button class="time-btn active" data-time="5">5 sec</button>
                            <button class="time-btn" data-time="10">10 sec</button>
                            <button class="time-btn" data-time="30">30 sec</button>
                            <input type="number" id="multi-custom-time" placeholder="Custom (sec)" min="1" max="300">
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeDisconnectModal()">Cancel</button>
                    <button class="btn-danger" onclick="executeMultiDisconnect()">
                        <span class="disconnect-icon">⚡</span> Disconnect All Selected
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.innerHTML = modalHtml;
    const modalElement = modal.firstElementChild;
    
    // Setup event listeners
    setupModalEventListeners(modalElement);
    
    return modalElement;
}

/**
 * Setup modal event listeners
 */
function setupModalEventListeners(modal) {
    // Method selection change
    const methodSelect = modal.querySelector('#disconnect-method-select, #multi-disconnect-method-select');
    if (methodSelect) {
        methodSelect.addEventListener('change', (e) => {
            const description = modal.querySelector('#method-description, #multi-method-description');
            if (description) {
                description.textContent = getMethodDescription(e.target.value);
            }
        });
    }
    
    // Time button selection
    modal.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            modal.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Clear custom input
            const customInput = modal.querySelector('#custom-time, #multi-custom-time');
            if (customInput) customInput.value = '';
        });
    });
    
    // Custom time input
    const customInput = modal.querySelector('#custom-time, #multi-custom-time');
    if (customInput) {
        customInput.addEventListener('input', () => {
            modal.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
        });
    }
}

/**
 * Close disconnect modal
 */
function closeDisconnectModal() {
    const modal = document.querySelector('.disconnect-modal-overlay');
    if (modal) {
        modal.style.opacity = '0';
        modal.querySelector('.disconnect-modal').style.transform = 'scale(0.8)';
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
    
    disconnectState.currentGpu = null;
}

/**
 * Execute single GPU disconnect
 */
async function executeDisconnect() {
    if (!disconnectState.currentGpu) return;
    
    const modal = document.querySelector('.disconnect-modal-overlay');
    const methodSelect = modal.querySelector('#disconnect-method-select');
    const customTime = modal.querySelector('#custom-time');
    const activeTimeBtn = modal.querySelector('.time-btn.active');
    
    const method = methodSelect.value;
    const downTime = customTime.value ? parseFloat(customTime.value) : 
                     activeTimeBtn ? parseFloat(activeTimeBtn.dataset.time) : 5;
    
    const gpuId = disconnectState.currentGpu.id;
    const nodeInfo = disconnectState.currentGpu.node;
    
    try {
        closeDisconnectModal();
        
        // Mark as active
        activeDisconnects.set(gpuId, {
            status: 'starting',
            startTime: Date.now(),
            method: method,
            downTime: downTime
        });
        
        // Update UI
        updateGPUDisconnectStatus(gpuId, 'starting');
        showNotification(`Starting disconnect of ${nodeInfo ? `${nodeInfo.node_name}/` : ''}GPU ${gpuId}...`, 'info');
        
        // Execute disconnect
        const result = await performDisconnect(gpuId, method, downTime, nodeInfo);
        
        // Update status
        activeDisconnects.set(gpuId, {
            status: 'completed',
            startTime: activeDisconnects.get(gpuId).startTime,
            method: method,
            result: result
        });
        
        updateGPUDisconnectStatus(gpuId, 'completed');
        showNotification(`GPU ${gpuId} disconnect completed successfully`, 'success');
        
        // Clear status after delay
        setTimeout(() => {
            activeDisconnects.delete(gpuId);
            updateGPUDisconnectStatus(gpuId, 'idle');
        }, 5000);
        
    } catch (error) {
        console.error('Disconnect failed:', error);
        
        activeDisconnects.set(gpuId, {
            status: 'failed',
            startTime: activeDisconnects.get(gpuId)?.startTime || Date.now(),
            method: method,
            error: error.message
        });
        
        updateGPUDisconnectStatus(gpuId, 'failed');
        showNotification(`GPU ${gpuId} disconnect failed: ${error.message}`, 'error');
        
        // Clear error status after delay
        setTimeout(() => {
            activeDisconnects.delete(gpuId);
            updateGPUDisconnectStatus(gpuId, 'idle');
        }, 10000);
    }
}

/**
 * Execute multi-GPU disconnect
 */
async function executeMultiDisconnect() {
    const modal = document.querySelector('.disconnect-modal-overlay');
    const methodSelect = modal.querySelector('#multi-disconnect-method-select');
    const customTime = modal.querySelector('#multi-custom-time');
    const activeTimeBtn = modal.querySelector('.time-btn.active');
    
    const method = methodSelect.value;
    const downTime = customTime.value ? parseFloat(customTime.value) : 
                     activeTimeBtn ? parseFloat(activeTimeBtn.dataset.time) : 5;
    
    const selectedGpus = Array.from(disconnectState.selectedGpus);
    
    try {
        closeDisconnectModal();
        
        // Mark all as active
        selectedGpus.forEach(gpu => {
            const gpuId = typeof gpu === 'object' ? gpu.id : gpu;
            activeDisconnects.set(gpuId, {
                status: 'starting',
                startTime: Date.now(),
                method: method,
                downTime: downTime
            });
            updateGPUDisconnectStatus(gpuId, 'starting');
        });
        
        showNotification(`Starting disconnect of ${selectedGpus.length} GPUs...`, 'info');
        
        // Execute multi-disconnect
        const result = await performMultiDisconnect(selectedGpus, method, downTime);
        
        // Process results
        Object.entries(result.results || {}).forEach(([key, res]) => {
            const gpuId = res.gpu_index;
            activeDisconnects.set(gpuId, {
                status: 'completed',
                startTime: activeDisconnects.get(gpuId).startTime,
                method: method,
                result: res
            });
            updateGPUDisconnectStatus(gpuId, 'completed');
        });
        
        Object.entries(result.errors || {}).forEach(([key, error]) => {
            // Extract GPU ID from key or use the key itself
            const gpuId = key;
            activeDisconnects.set(gpuId, {
                status: 'failed',
                startTime: activeDisconnects.get(gpuId)?.startTime || Date.now(),
                method: method,
                error: error
            });
            updateGPUDisconnectStatus(gpuId, 'failed');
        });
        
        const successful = result.successful || 0;
        const failed = result.failed || 0;
        
        if (failed === 0) {
            showNotification(`All ${successful} GPUs disconnected successfully`, 'success');
        } else {
            showNotification(`${successful} GPUs successful, ${failed} failed`, 'warning');
        }
        
        // Clear statuses after delay
        setTimeout(() => {
            selectedGpus.forEach(gpu => {
                const gpuId = typeof gpu === 'object' ? gpu.id : gpu;
                activeDisconnects.delete(gpuId);
                updateGPUDisconnectStatus(gpuId, 'idle');
            });
        }, 5000);
        
        // Clear selection
        clearGPUSelection();
        
    } catch (error) {
        console.error('Multi-disconnect failed:', error);
        
        selectedGpus.forEach(gpu => {
            const gpuId = typeof gpu === 'object' ? gpu.id : gpu;
            activeDisconnects.set(gpuId, {
                status: 'failed',
                startTime: activeDisconnects.get(gpuId)?.startTime || Date.now(),
                method: method,
                error: error.message
            });
            updateGPUDisconnectStatus(gpuId, 'failed');
        });
        
        showNotification(`Multi-disconnect failed: ${error.message}`, 'error');
        
        // Clear error statuses after delay
        setTimeout(() => {
            selectedGpus.forEach(gpu => {
                const gpuId = typeof gpu === 'object' ? gpu.id : gpu;
                activeDisconnects.delete(gpuId);
                updateGPUDisconnectStatus(gpuId, 'idle');
            });
        }, 10000);
    }
}

/**
 * Get available disconnect methods for a GPU
 */
async function getAvailableMethods(gpuId, nodeInfo) {
    try {
        let endpoint;
        if (nodeInfo && disconnectState.hubMode) {
            endpoint = `/api/hub/gpu/${nodeInfo.node_name}/${gpuId}/disconnect/methods`;
        } else {
            endpoint = `/api/gpu/${gpuId}/disconnect/methods`;
        }
        
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.available_methods || ['auto'];
        
    } catch (error) {
        console.error('Error getting available methods:', error);
        return ['auto']; // Fallback
    }
}

/**
 * Perform single GPU disconnect
 */
async function performDisconnect(gpuId, method, downTime, nodeInfo) {
    let endpoint;
    let requestData = {
        method: method,
        down_time: downTime
    };
    
    if (nodeInfo && disconnectState.hubMode) {
        endpoint = `/api/hub/gpu/${nodeInfo.node_name}/${gpuId}/disconnect`;
    } else {
        endpoint = `/api/gpu/${gpuId}/disconnect`;
    }
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
}

/**
 * Perform multi-GPU disconnect
 */
async function performMultiDisconnect(selectedGpus, method, downTime) {
    if (disconnectState.hubMode) {
        // Hub mode - targets include node information
        const targets = selectedGpus.map(gpu => {
            if (typeof gpu === 'object') {
                return { node_name: gpu.node, gpu_id: gpu.id };
            } else {
                return { node_name: 'local', gpu_id: gpu };
            }
        });
        
        const response = await fetch('/api/hub/gpu/disconnect-multiple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                targets: targets,
                method: method,
                down_time: downTime
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
        
    } else {
        // Node mode - simple GPU indices
        const gpuIndices = selectedGpus.map(gpu => typeof gpu === 'object' ? gpu.id : gpu);
        
        const response = await fetch('/api/gpu/disconnect-multiple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                gpu_indices: gpuIndices,
                method: method,
                down_time: downTime
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
}

/**
 * Handle GPU selection checkbox changes
 */
function handleGPUSelection(event) {
    const checkbox = event.target;
    const gpuId = checkbox.dataset.gpuId;
    const nodeName = checkbox.dataset.nodeName;
    
    const gpuIdentifier = nodeName ? { id: gpuId, node: nodeName } : gpuId;
    
    if (checkbox.checked) {
        disconnectState.selectedGpus.add(gpuIdentifier);
    } else {
        disconnectState.selectedGpus.delete(gpuIdentifier);
    }
    
    updateMultiSelectUI();
}

/**
 * Clear GPU selection
 */
function clearGPUSelection() {
    disconnectState.selectedGpus.clear();
    updateMultiSelectUI();
}

/**
 * Update multi-select UI
 */
function updateMultiSelectUI() {
    const selectedCount = disconnectState.selectedGpus.size;
    
    // Update or create multi-select toolbar
    let toolbar = document.querySelector('.multi-select-toolbar');
    
    if (selectedCount > 0) {
        if (!toolbar) {
            toolbar = createMultiSelectToolbar();
            document.querySelector('.container').appendChild(toolbar);
        }
        
        toolbar.querySelector('.selected-count').textContent = selectedCount;
        toolbar.style.display = 'flex';
        
    } else if (toolbar) {
        toolbar.style.display = 'none';
    }
}

/**
 * Create multi-select toolbar
 */
function createMultiSelectToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'multi-select-toolbar';
    toolbar.innerHTML = `
        <div class="toolbar-content">
            <span class="selected-count">0</span> GPUs selected
            <div class="toolbar-actions">
                <button class="btn-secondary" onclick="clearGPUSelection()">Clear Selection</button>
                <button class="btn-danger" onclick="showMultiDisconnectModal()">
                    <span class="disconnect-icon">⚡</span> Disconnect Selected
                </button>
            </div>
        </div>
    `;
    
    return toolbar;
}

/**
 * Update GPU disconnect status UI
 */
function updateGPUDisconnectStatus(gpuId, status) {
    const gpuCard = document.getElementById(`gpu-${gpuId}`);
    if (!gpuCard) return;
    
    // Remove existing status classes
    gpuCard.classList.remove('disconnecting', 'disconnect-completed', 'disconnect-failed');
    
    // Add status indicator
    let statusIndicator = gpuCard.querySelector('.disconnect-status');
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.className = 'disconnect-status';
        gpuCard.appendChild(statusIndicator);
    }
    
    switch (status) {
        case 'starting':
            gpuCard.classList.add('disconnecting');
            statusIndicator.innerHTML = '<div class="status-spinner"></div> Disconnecting...';
            statusIndicator.style.display = 'block';
            break;
            
        case 'completed':
            gpuCard.classList.add('disconnect-completed');
            statusIndicator.innerHTML = '<span class="status-success">✓</span> Reconnected';
            statusIndicator.style.display = 'block';
            break;
            
        case 'failed':
            gpuCard.classList.add('disconnect-failed');
            statusIndicator.innerHTML = '<span class="status-error">✗</span> Disconnect Failed';
            statusIndicator.style.display = 'block';
            break;
            
        default:
            statusIndicator.style.display = 'none';
    }
    
    // Update disconnect button state
    const disconnectBtn = gpuCard.querySelector('.disconnect-button');
    if (disconnectBtn) {
        disconnectBtn.disabled = (status === 'starting');
    }
}

/**
 * Update disconnect UI based on system capabilities
 */
function updateDisconnectUI() {
    const capabilities = disconnectState.systemCapabilities;
    if (!capabilities) return;
    
    // Update all disconnect buttons
    document.querySelectorAll('.disconnect-button').forEach(btn => {
        if (!capabilities.ready) {
            btn.disabled = true;
            btn.title = 'Disconnect unavailable: ' + (capabilities.warnings || []).join(', ');
        } else {
            btn.disabled = false;
            btn.title = 'Disconnect GPU for fault tolerance testing';
        }
    });
    
    // Show system status if there are issues
    if (!capabilities.ready) {
        console.warn('GPU disconnect not ready:', capabilities.warnings);
    }
}

/**
 * Update disconnect button state
 */
function updateDisconnectButtonState(button, gpuId) {
    const status = activeDisconnects.get(gpuId);
    const capabilities = disconnectState.systemCapabilities;
    
    if (status && status.status === 'starting') {
        button.disabled = true;
        button.innerHTML = '<div class="btn-spinner"></div> Disconnecting...';
    } else if (!capabilities || !capabilities.ready) {
        button.disabled = true;
        button.title = 'Disconnect unavailable';
    } else {
        button.disabled = false;
        button.innerHTML = '<span class="disconnect-icon">⚡</span> Disconnect';
        button.title = 'Disconnect GPU';
    }
}

/**
 * Format method name for display
 */
function formatMethodName(method) {
    const names = {
        'auto': 'Auto (Best Available)',
        'slot': 'Slot Power Toggle (Linux)',
        'hot': 'Hot Reset (Linux)',
        'logical': 'Logical Remove/Rescan (Linux)',
        'nvidia': 'NVIDIA GPU Reset (Linux)',
        'memory_flood': 'Memory Flood ⚠️ EXPERIMENTAL (WSL2/Docker/Linux)'
    };
    return names[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

/**
 * Get method description
 */
function getMethodDescription(method) {
    const descriptions = {
        'auto': 'Automatically select the most realistic method available on this system.',
        'slot': 'Actually cut and restore slot power (closest to physical disconnect). Linux only.',
        'hot': 'Reset the PCIe link using upstream bridge controls. Linux only.',
        'logical': 'Software-only remove and re-scan. Linux only.',
        'nvidia': 'Use NVIDIA driver reset functionality. Linux only.',
        'memory_flood': '⚠️ EXPERIMENTAL: Floods GPU memory to trigger OOM/driver reset. May cause system instability! This is the only method available in WSL2/Docker.'
    };
    return descriptions[method] || 'Custom disconnect method.';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    // Add to page
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto-remove after delay
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure other scripts have loaded
    setTimeout(initDisconnectControls, 100);
});

// Export functions for use by other modules
window.addDisconnectButton = addDisconnectButton;
window.addGPUSelectCheckbox = addGPUSelectCheckbox;
window.showDisconnectModal = showDisconnectModal;
window.showMultiDisconnectModal = showMultiDisconnectModal;
window.clearGPUSelection = clearGPUSelection;
