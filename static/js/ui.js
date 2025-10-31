/**
 * UI Interactions and navigation
 */

// Global state
let currentTab = 'overview';
let registeredGPUs = new Set();
let hasAutoSwitched = false; // Track if we've done initial auto-switch

// Toggle processes section
function toggleProcesses() {
    const content = document.getElementById('processes-content');
    const header = document.querySelector('.processes-header');
    const icon = document.querySelector('.toggle-icon');

    content.classList.toggle('expanded');
    header.classList.toggle('expanded');
    icon.classList.toggle('expanded');
}

// Tab switching with smooth transitions
function switchToView(viewName) {
    currentTab = viewName;

    // Update view selector states
    document.querySelectorAll('.view-option').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
        }
    });

    // Switch tab content with animation
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const targetContent = document.getElementById(`tab-${viewName}`);
    if (targetContent) {
        targetContent.classList.add('active');

        // Trigger chart resize for visible charts using RAF for better timing
        if (viewName.startsWith('gpu-')) {
            const gpuId = viewName.replace('gpu-', '');
            requestAnimationFrame(() => {
                if (charts[gpuId]) {
                    Object.values(charts[gpuId]).forEach(chart => {
                        if (chart && chart.resize) chart.resize();
                    });
                }
            });
        }
    }
}

// Create or update GPU tab
function ensureGPUTab(gpuId, gpuInfo, shouldUpdateDOM = true) {
    if (!registeredGPUs.has(gpuId)) {
        // Add view option
        const viewSelector = document.getElementById('view-selector');
        const viewOption = document.createElement('button');
        viewOption.className = 'view-option';
        viewOption.dataset.view = `gpu-${gpuId}`;
        viewOption.textContent = `GPU ${gpuId}`;
        viewOption.onclick = () => switchToView(`gpu-${gpuId}`);
        viewSelector.appendChild(viewOption);

        // Create tab content
        const tabContent = document.createElement('div');
        tabContent.id = `tab-gpu-${gpuId}`;
        tabContent.className = 'tab-content';
        tabContent.innerHTML = `<div class="detailed-view"></div>`;
        document.getElementById('tab-overview').after(tabContent);

        registeredGPUs.add(gpuId);
    }

    // Update or create detailed GPU card in tab
    const detailedContainer = document.querySelector(`#tab-gpu-${gpuId} .detailed-view`);
    const existingCard = document.getElementById(`gpu-${gpuId}`);

    if (!existingCard && detailedContainer) {
        detailedContainer.innerHTML = createGPUCard(gpuId, gpuInfo);
        // Do not reinitialize chartData here; it would break existing chart references
        if (!chartData[gpuId]) initGPUData(gpuId);
        initGPUCharts(gpuId);
        
        // Add disconnect button to the card
        const card = document.getElementById(`gpu-${gpuId}`);
        if (card && window.addGPUSelectCheckbox) {
            window.addGPUSelectCheckbox(gpuId, card);
        }
    } else if (existingCard) {
        updateGPUDisplay(gpuId, gpuInfo, shouldUpdateDOM);
    }
}

// Remove GPU tab
function removeGPUTab(gpuId) {
    if (!registeredGPUs.has(gpuId)) {
        return; // Tab doesn't exist
    }

    // If currently viewing this GPU's tab, switch to overview
    if (currentTab === `gpu-${gpuId}`) {
        switchToView('overview');
    }

    // Remove view option button
    const viewOption = document.querySelector(`.view-option[data-view="gpu-${gpuId}"]`);
    if (viewOption) {
        viewOption.remove();
    }

    // Remove tab content
    const tabContent = document.getElementById(`tab-gpu-${gpuId}`);
    if (tabContent) {
        tabContent.remove();
    }

    // Destroy charts
    if (charts[gpuId]) {
        Object.values(charts[gpuId]).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
        delete charts[gpuId];
    }

    // Remove from registered GPUs
    registeredGPUs.delete(gpuId);
}

// Auto-switch to single GPU view if only 1 GPU detected
function autoSwitchSingleGPU(gpuCount, gpuIds) {
    if (gpuCount === 1 && !hasAutoSwitched) {
        const singleGpuId = gpuIds[0];
        setTimeout(() => {
            switchToView(`gpu-${singleGpuId}`);
        }, 300); // Small delay to ensure DOM is ready
        hasAutoSwitched = true;
    }
}

// Make switchToView globally available
window.switchToView = switchToView;
