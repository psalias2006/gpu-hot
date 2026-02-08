/**
 * UI Interactions and navigation — GPU Studio
 * Sidebar-based navigation
 */

// Global state
let currentTab = 'overview';
let registeredGPUs = new Set();
let hasAutoSwitched = false;

// Toggle processes section
function toggleProcesses() {
    const content = document.getElementById('processes-content');
    const header = document.querySelector('.processes-header');
    const icon = document.querySelector('.toggle-icon');

    content.classList.toggle('expanded');
    if (header) header.classList.toggle('expanded');
    if (icon) icon.classList.toggle('expanded');
}

// Tab switching
function switchToView(viewName) {
    if (!viewName) return;

    currentTab = viewName;

    // Update sidebar button states
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
        }
    });

    // Switch tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const targetContent = document.getElementById(`tab-${viewName}`);
    if (!targetContent) return;

    targetContent.classList.add('active');

    // Chart resize for visible tab
    if (viewName.startsWith('gpu-')) {
        const gpuId = viewName.replace('gpu-', '');

        if (charts && charts[gpuId]) {
            Object.values(charts[gpuId]).forEach(chart => {
                if (!chart || !chart.options) return;
                try {
                    const orig = chart.options.animation;
                    chart.options.animation = false;
                    if (typeof chart.resize === 'function') chart.resize();
                    if (typeof chart.update === 'function') chart.update('none');
                    chart.options.animation = orig;
                } catch (error) {
                    console.error(`Chart resize error GPU ${gpuId}:`, error);
                }
            });
        }
    }
}

// Create or update GPU tab
function ensureGPUTab(gpuId, gpuInfo, shouldUpdateDOM = true) {
    if (!registeredGPUs.has(gpuId)) {
        // Add sidebar button
        const viewSelector = document.getElementById('view-selector');
        const btn = document.createElement('button');
        btn.className = 'sidebar-btn';
        btn.dataset.view = `gpu-${gpuId}`;
        // For cluster IDs like "gpu-server-2-0", show only the last segment
        const parts = String(gpuId).split('-');
        btn.textContent = parts.length > 1 ? parts[parts.length - 1] : gpuId;
        btn.title = `GPU ${gpuId}`;
        btn.onclick = () => switchToView(`gpu-${gpuId}`);
        viewSelector.appendChild(btn);

        // Create tab content
        const tabContent = document.createElement('div');
        tabContent.id = `tab-gpu-${gpuId}`;
        tabContent.className = 'tab-content';
        tabContent.innerHTML = `<div class="detailed-view"></div>`;
        document.getElementById('tab-overview').after(tabContent);

        registeredGPUs.add(gpuId);
    }

    // Update or create detailed GPU card
    const detailedContainer = document.querySelector(`#tab-gpu-${gpuId} .detailed-view`);
    const existingCard = document.getElementById(`gpu-${gpuId}`);

    if (!existingCard && detailedContainer) {
        detailedContainer.innerHTML = createGPUCard(gpuId, gpuInfo);
        if (!chartData[gpuId]) initGPUData(gpuId);
        initGPUCharts(gpuId);
    } else if (existingCard) {
        updateGPUDisplay(gpuId, gpuInfo, shouldUpdateDOM);
    }
}

// Remove GPU tab
function removeGPUTab(gpuId) {
    if (!registeredGPUs.has(gpuId)) return;

    if (currentTab === `gpu-${gpuId}`) {
        switchToView('overview');
    }

    const btn = document.querySelector(`.sidebar-btn[data-view="gpu-${gpuId}"]`);
    if (btn) btn.remove();

    const tabContent = document.getElementById(`tab-gpu-${gpuId}`);
    if (tabContent) tabContent.remove();

    if (charts[gpuId]) {
        Object.values(charts[gpuId]).forEach(chart => {
            if (chart && chart.destroy) chart.destroy();
        });
        delete charts[gpuId];
    }

    registeredGPUs.delete(gpuId);
}

// Auto-switch to single GPU view
function autoSwitchSingleGPU(gpuCount, gpuIds) {
    if (gpuCount === 1 && !hasAutoSwitched) {
        const singleGpuId = gpuIds[0];
        setTimeout(() => {
            switchToView(`gpu-${singleGpuId}`);
        }, 300);
        hasAutoSwitched = true;
    }
}

window.switchToView = switchToView;
