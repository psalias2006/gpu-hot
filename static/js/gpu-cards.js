/**
 * GPU Card creation and update functions
 * GPU Studio — Swiss Minimalist Edition
 */

// Helper: format memory values
function formatMemory(mb) {
    if (mb >= 1024) {
        return `${(mb / 1024).toFixed(1)}`;
    }
    return `${Math.round(mb)}`;
}

// Helper: memory unit
function formatMemoryUnit(mb) {
    return mb >= 1024 ? 'GB' : 'MB';
}

// Helper: format energy values
function formatEnergy(wh) {
    if (wh >= 1000) {
        return `${(wh / 1000).toFixed(2)}kWh`;
    }
    return `${wh.toFixed(2)}Wh`;
}

// Helper: safely get metric value with default
function getMetricValue(gpuInfo, key, defaultValue = 0) {
    return (key in gpuInfo && gpuInfo[key] !== null && gpuInfo[key] !== undefined) ? gpuInfo[key] : defaultValue;
}

// Helper: check if metric is available
function hasMetric(gpuInfo, key) {
    const value = gpuInfo[key];
    return value !== null && value !== undefined && value !== 'N/A' && value !== 'Unknown' && value !== '';
}

// Helper: bullet bar CSS class based on thresholds
function bulletClass(value, warnThreshold, dangerThreshold) {
    if (value >= dangerThreshold) return 'danger';
    if (value >= warnThreshold) return 'warning';
    return '';
}

// Track enhanced overview mode
let isEnhancedOverview = false;

// ============================================
// Overview Card (All GPUs view) — flat row
// ============================================

function createOverviewCard(gpuId, gpuInfo) {
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const memPercent = (memory_used / memory_total) * 100;

    return `
        <div class="overview-gpu-card" data-gpu-id="${gpuId}" onclick="switchToView('gpu-${gpuId}')">
            <div class="overview-gpu-name">
                <h2>GPU ${gpuId}</h2>
                <p>${getMetricValue(gpuInfo, 'name', 'Unknown GPU')}</p>
            </div>
            <div class="overview-metrics">
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-util-${gpuId}">${getMetricValue(gpuInfo, 'utilization', 0)}%</div>
                    <div class="overview-metric-label">UTIL</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-temp-${gpuId}">${getMetricValue(gpuInfo, 'temperature', 0)}°</div>
                    <div class="overview-metric-label">TEMP</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-mem-${gpuId}">${Math.round(memPercent)}%</div>
                    <div class="overview-metric-label">MEM</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-power-${gpuId}">${getMetricValue(gpuInfo, 'power_draw', 0).toFixed(0)}W</div>
                    <div class="overview-metric-label">POWER</div>
                </div>
            </div>
            <div class="overview-mini-chart">
                <canvas id="overview-chart-${gpuId}"></canvas>
            </div>
        </div>
    `;
}

// Update overview card
function updateOverviewCard(gpuId, gpuInfo, shouldUpdateDOM = true) {
    // Delegate to enhanced updater if enhanced overview is active
    if (isEnhancedOverview) {
        updateEnhancedOverviewCard(gpuId, gpuInfo, shouldUpdateDOM);
        return;
    }

    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const memPercent = (memory_used / memory_total) * 100;

    if (shouldUpdateDOM) {
        const utilEl = document.getElementById(`overview-util-${gpuId}`);
        const tempEl = document.getElementById(`overview-temp-${gpuId}`);
        const memEl = document.getElementById(`overview-mem-${gpuId}`);
        const powerEl = document.getElementById(`overview-power-${gpuId}`);

        if (utilEl) utilEl.textContent = `${getMetricValue(gpuInfo, 'utilization', 0)}%`;
        if (tempEl) tempEl.textContent = `${getMetricValue(gpuInfo, 'temperature', 0)}°`;
        if (memEl) memEl.textContent = `${Math.round(memPercent)}%`;
        if (powerEl) powerEl.textContent = `${getMetricValue(gpuInfo, 'power_draw', 0).toFixed(0)}W`;
    }

    // Always update chart data
    updateChart(gpuId, 'utilization', Number(getMetricValue(gpuInfo, 'utilization', 0)));

    if (charts[gpuId] && charts[gpuId].overviewMini) {
        charts[gpuId].overviewMini.update('none');
    }
}

// ============================================
// Single GPU Overview — Enhanced Dashboard
// ============================================

function createEnhancedOverviewCard(gpuId, gpuInfo) {
    isEnhancedOverview = true;

    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const memPercent = (memory_used / memory_total) * 100;
    const powerPercent = (power_draw / power_limit) * 100;
    const utilization = getMetricValue(gpuInfo, 'utilization', 0);
    const fan_speed = getMetricValue(gpuInfo, 'fan_speed', 0);
    const temperature = getMetricValue(gpuInfo, 'temperature', 0);

    // Build secondary info items
    let secondaryItems = '';

    if (hasMetric(gpuInfo, 'clock_graphics')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-clock-gr-${gpuId}">${gpuInfo.clock_graphics} MHz</span>
                <span class="sgo-info-label">GFX CLOCK</span>
            </div>`;
    }
    if (hasMetric(gpuInfo, 'clock_memory')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-clock-mem-${gpuId}">${gpuInfo.clock_memory} MHz</span>
                <span class="sgo-info-label">MEM CLOCK</span>
            </div>`;
    }
    if (hasMetric(gpuInfo, 'performance_state')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-pstate-${gpuId}">${gpuInfo.performance_state}</span>
                <span class="sgo-info-label">P-STATE</span>
            </div>`;
    }
    if (hasMetric(gpuInfo, 'memory_utilization')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-mem-util-${gpuId}">${gpuInfo.memory_utilization}%</span>
                <span class="sgo-info-label">MEM CTRL</span>
            </div>`;
    }
    if (hasMetric(gpuInfo, 'pcie_gen')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-pcie-${gpuId}">Gen${gpuInfo.pcie_gen} x${gpuInfo.pcie_width || '?'}</span>
                <span class="sgo-info-label">PCIE</span>
            </div>`;
    }
    if (hasMetric(gpuInfo, 'energy_consumption_wh')) {
        secondaryItems += `
            <div class="sgo-info-item">
                <span class="sgo-info-value" id="sgo-energy-${gpuId}">${formatEnergy(gpuInfo.energy_consumption_wh)}</span>
                <span class="sgo-info-label">ENERGY</span>
            </div>`;
    }

    return `
        <div class="single-gpu-overview" data-gpu-id="${gpuId}" onclick="switchToView('gpu-${gpuId}')">
            <div class="sgo-header">
                <div class="gpu-detail-header">
                    <span class="gpu-detail-title">GPU ${gpuId}</span>
                    <span class="gpu-detail-name">${gpuInfo.name || 'Unknown'}</span>
                </div>
                <div class="gpu-detail-specs">
                    <span class="spec-tag" id="sgo-fan-badge-${gpuId}">Fan ${fan_speed}%</span>
                    <span class="spec-tag" id="sgo-pstate-badge-${gpuId}">${gpuInfo.performance_state || ''}</span>
                    <span class="spec-tag">${gpuInfo.driver_version || ''}</span>
                    ${hasMetric(gpuInfo, 'architecture') ? `<span class="spec-tag">${gpuInfo.architecture}</span>` : ''}
                    <span class="spec-tag">${gpuInfo._fallback_mode ? 'smi' : 'NVML'}</span>
                </div>
            </div>

            <div class="sgo-metrics-row">
                <div class="metrics-grid sgo-metrics-grid">
                    <div class="metric-cell">
                        <div class="metric-num-row">
                            <span class="metric-num" id="sgo-util-${gpuId}">${utilization}</span>
                            <span class="metric-unit">%</span>
                        </div>
                        <span class="metric-label">UTILIZATION</span>
                        <div class="bullet-bar"><div class="bullet-fill ${bulletClass(utilization, 80, 95)}" id="sgo-util-bar-${gpuId}" style="width:${utilization}%"></div></div>
                    </div>

                    <div class="metric-cell">
                        <div class="metric-num-row">
                            <span class="metric-num" id="sgo-temp-${gpuId}">${temperature}</span>
                            <span class="metric-unit">°C</span>
                        </div>
                        <span class="metric-label">TEMPERATURE</span>
                        <div class="bullet-bar"><div class="bullet-fill ${bulletClass(temperature, 75, 85)}" id="sgo-temp-bar-${gpuId}" style="width:${Math.min(temperature / 100 * 100, 100)}%"></div></div>
                    </div>

                    <div class="metric-cell">
                        <div class="metric-num-row">
                            <span class="metric-num" id="sgo-mem-${gpuId}">${formatMemory(memory_used)}</span>
                            <span class="metric-unit" id="sgo-mem-unit-${gpuId}">${formatMemoryUnit(memory_used)}</span>
                        </div>
                        <span class="metric-label">VRAM</span>
                        <span class="metric-sub" id="sgo-mem-total-${gpuId}">of ${formatMemory(memory_total)}${formatMemoryUnit(memory_total)}</span>
                        <div class="bullet-bar"><div class="bullet-fill ${bulletClass(memPercent, 85, 95)}" id="sgo-mem-bar-${gpuId}" style="width:${memPercent}%"></div></div>
                    </div>

                    <div class="metric-cell">
                        <div class="metric-num-row">
                            <span class="metric-num" id="sgo-power-${gpuId}">${power_draw.toFixed(0)}</span>
                            <span class="metric-unit">W</span>
                        </div>
                        <span class="metric-label">POWER</span>
                        <span class="metric-sub" id="sgo-power-limit-${gpuId}">of ${power_limit.toFixed(0)}W</span>
                        <div class="bullet-bar"><div class="bullet-fill ${bulletClass(powerPercent, 80, 95)}" id="sgo-power-bar-${gpuId}" style="width:${powerPercent}%"></div></div>
                    </div>

                    <div class="metric-cell">
                        <div class="metric-num-row">
                            <span class="metric-num" id="sgo-fan-${gpuId}">${fan_speed}</span>
                            <span class="metric-unit">%</span>
                        </div>
                        <span class="metric-label">FAN</span>
                        <div class="bullet-bar"><div class="bullet-fill" id="sgo-fan-bar-${gpuId}" style="width:${fan_speed}%"></div></div>
                    </div>
                </div>

                <div class="sgo-mini-chart">
                    <canvas id="overview-chart-${gpuId}"></canvas>
                </div>
            </div>

            ${secondaryItems ? `<div class="sgo-info-strip">${secondaryItems}</div>` : ''}
        </div>
    `;
}

// Update enhanced overview card
function updateEnhancedOverviewCard(gpuId, gpuInfo, shouldUpdateDOM = true) {
    const utilization = getMetricValue(gpuInfo, 'utilization', 0);
    const temperature = getMetricValue(gpuInfo, 'temperature', 0);
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const fan_speed = getMetricValue(gpuInfo, 'fan_speed', 0);
    const memPercent = (memory_used / memory_total) * 100;
    const powerPercent = (power_draw / power_limit) * 100;

    if (shouldUpdateDOM) {
        // Hero metrics
        const utilEl = document.getElementById(`sgo-util-${gpuId}`);
        const tempEl = document.getElementById(`sgo-temp-${gpuId}`);
        const memEl = document.getElementById(`sgo-mem-${gpuId}`);
        const powerEl = document.getElementById(`sgo-power-${gpuId}`);
        const fanEl = document.getElementById(`sgo-fan-${gpuId}`);

        if (utilEl) utilEl.textContent = utilization;
        if (tempEl) tempEl.textContent = temperature;
        if (memEl) memEl.textContent = formatMemory(memory_used);
        if (powerEl) powerEl.textContent = power_draw.toFixed(0);
        if (fanEl) fanEl.textContent = fan_speed;

        const memUnitEl = document.getElementById(`sgo-mem-unit-${gpuId}`);
        if (memUnitEl) memUnitEl.textContent = formatMemoryUnit(memory_used);

        // Bullet bars
        const utilBar = document.getElementById(`sgo-util-bar-${gpuId}`);
        const tempBar = document.getElementById(`sgo-temp-bar-${gpuId}`);
        const memBar = document.getElementById(`sgo-mem-bar-${gpuId}`);
        const powerBar = document.getElementById(`sgo-power-bar-${gpuId}`);
        const fanBar = document.getElementById(`sgo-fan-bar-${gpuId}`);

        if (utilBar) { utilBar.style.width = `${utilization}%`; utilBar.className = `bullet-fill ${bulletClass(utilization, 80, 95)}`; }
        if (tempBar) { tempBar.style.width = `${Math.min(temperature / 100 * 100, 100)}%`; tempBar.className = `bullet-fill ${bulletClass(temperature, 75, 85)}`; }
        if (memBar) { memBar.style.width = `${memPercent}%`; memBar.className = `bullet-fill ${bulletClass(memPercent, 85, 95)}`; }
        if (powerBar) { powerBar.style.width = `${powerPercent}%`; powerBar.className = `bullet-fill ${bulletClass(powerPercent, 80, 95)}`; }
        if (fanBar) fanBar.style.width = `${fan_speed}%`;

        // Header badges
        const fanBadgeEl = document.getElementById(`sgo-fan-badge-${gpuId}`);
        if (fanBadgeEl) fanBadgeEl.textContent = `Fan ${fan_speed}%`;
        const pstateBadgeEl = document.getElementById(`sgo-pstate-badge-${gpuId}`);
        if (pstateBadgeEl) pstateBadgeEl.textContent = getMetricValue(gpuInfo, 'performance_state', '');

        // Secondary metrics
        const clockGrEl = document.getElementById(`sgo-clock-gr-${gpuId}`);
        const clockMemEl = document.getElementById(`sgo-clock-mem-${gpuId}`);
        const pstateEl = document.getElementById(`sgo-pstate-${gpuId}`);
        const memUtilEl = document.getElementById(`sgo-mem-util-${gpuId}`);
        const pcieEl = document.getElementById(`sgo-pcie-${gpuId}`);
        const energyEl = document.getElementById(`sgo-energy-${gpuId}`);

        if (clockGrEl) clockGrEl.textContent = `${getMetricValue(gpuInfo, 'clock_graphics', 0)} MHz`;
        if (clockMemEl) clockMemEl.textContent = `${getMetricValue(gpuInfo, 'clock_memory', 0)} MHz`;
        if (pstateEl) pstateEl.textContent = getMetricValue(gpuInfo, 'performance_state', 'N/A');
        if (memUtilEl) memUtilEl.textContent = `${getMetricValue(gpuInfo, 'memory_utilization', 0)}%`;
        if (pcieEl) pcieEl.textContent = `Gen${getMetricValue(gpuInfo, 'pcie_gen', '?')} x${getMetricValue(gpuInfo, 'pcie_width', '?')}`;
        if (energyEl && hasMetric(gpuInfo, 'energy_consumption_wh')) energyEl.textContent = formatEnergy(gpuInfo.energy_consumption_wh);
    }

    // Always update chart data
    updateChart(gpuId, 'utilization', Number(utilization));

    if (charts[gpuId] && charts[gpuId].overviewMini) {
        charts[gpuId].overviewMini.update('none');
    }
}

// ============================================
// Detailed GPU Card — Three Tier Layout
// ============================================

function createGPUCard(gpuId, gpuInfo) {
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const memPercent = (memory_used / memory_total) * 100;
    const powerPercent = (power_draw / power_limit) * 100;
    const utilization = getMetricValue(gpuInfo, 'utilization', 0);
    const fan_speed = getMetricValue(gpuInfo, 'fan_speed', 0);
    const temperature = getMetricValue(gpuInfo, 'temperature', 0);

    // Build optional metric cells
    let extraMetrics = '';

    if (hasMetric(gpuInfo, 'memory_utilization')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="mem-util-${gpuId}">${gpuInfo.memory_utilization}</span>
                    <span class="metric-unit">%</span>
                </div>
                <span class="metric-label">MEMORY UTILIZATION</span>
                <span class="metric-sub">Controller Usage</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'clock_graphics')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="clock-gr-${gpuId}">${gpuInfo.clock_graphics}</span>
                    <span class="metric-unit">MHz</span>
                </div>
                <span class="metric-label">GRAPHICS CLOCK</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'clock_memory')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="clock-mem-${gpuId}">${gpuInfo.clock_memory}</span>
                    <span class="metric-unit">MHz</span>
                </div>
                <span class="metric-label">MEMORY CLOCK</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'performance_state')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="pstate-${gpuId}">${gpuInfo.performance_state}</span>
                </div>
                <span class="metric-label">PERFORMANCE STATE</span>
                <span class="metric-sub">Power Mode</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'pcie_gen')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="pcie-${gpuId}">Gen ${gpuInfo.pcie_gen}</span>
                </div>
                <span class="metric-label">PCIE LINK</span>
                <span class="metric-sub">x${gpuInfo.pcie_width || '?'} lanes</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'encoder_sessions')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="encoder-${gpuId}">${gpuInfo.encoder_sessions}</span>
                </div>
                <span class="metric-label">ENC SESS</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'clock_sm')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="clock-sm-${gpuId}">${gpuInfo.clock_sm}</span>
                    <span class="metric-unit">MHz</span>
                </div>
                <span class="metric-label">SM CLOCK</span>
                <span class="metric-sub" id="clock-sm-max-${gpuId}">MHz / ${gpuInfo.clock_sm_max || '?'} Max</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'temperature_memory')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="temp-mem-${gpuId}">${gpuInfo.temperature_memory}</span>
                    <span class="metric-unit">°C</span>
                </div>
                <span class="metric-label">VRAM TEMP</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'memory_free')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="mem-free-${gpuId}">${formatMemory(gpuInfo.memory_free)}</span>
                    <span class="metric-unit" id="mem-free-unit-${gpuId}">${formatMemoryUnit(gpuInfo.memory_free)}</span>
                </div>
                <span class="metric-label">FREE MEMORY</span>
                <span class="metric-sub">Available VRAM</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'decoder_sessions')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="decoder-${gpuId}">${gpuInfo.decoder_sessions}</span>
                </div>
                <span class="metric-label">DEC SESS</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'energy_consumption_wh')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="energy-${gpuId}" style="font-size:20px;">${formatEnergy(gpuInfo.energy_consumption_wh)}</span>
                </div>
                <span class="metric-label">TOTAL ENERGY</span>
                <span class="metric-sub">Since driver load</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'clock_video')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="clock-video-${gpuId}">${gpuInfo.clock_video}</span>
                    <span class="metric-unit">MHz</span>
                </div>
                <span class="metric-label">VIDEO CLOCK</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'pcie_gen_max')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="pcie-max-${gpuId}">Gen ${gpuInfo.pcie_gen_max}</span>
                </div>
                <span class="metric-label">MAX PCIE</span>
                <span class="metric-sub" id="pcie-max-width-${gpuId}">x${gpuInfo.pcie_width_max || '?'} Max</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'bar1_memory_used')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="bar1-mem-${gpuId}">${formatMemory(gpuInfo.bar1_memory_used)}</span>
                    <span class="metric-unit" id="bar1-mem-unit-${gpuId}">${formatMemoryUnit(gpuInfo.bar1_memory_used)}</span>
                </div>
                <span class="metric-label">BAR1 MEMORY</span>
                <span class="metric-sub" id="bar1-mem-total-${gpuId}">of ${formatMemory(gpuInfo.bar1_memory_total || 0)}${formatMemoryUnit(gpuInfo.bar1_memory_total || 0)}</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'brand') || hasMetric(gpuInfo, 'architecture')) {
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="brand-${gpuId}" style="font-size:16px;">${gpuInfo.brand || 'N/A'}</span>
                </div>
                <span class="metric-label">BRAND / ARCHITECTURE</span>
                <span class="metric-sub" id="arch-${gpuId}">${gpuInfo.architecture || 'Unknown'}</span>
            </div>`;
    }

    if (hasMetric(gpuInfo, 'graphics_processes_count')) {
        const computeProcs = getMetricValue(gpuInfo, 'compute_processes_count', 0);
        const graphicsProcs = getMetricValue(gpuInfo, 'graphics_processes_count', 0);
        extraMetrics += `
            <div class="metric-cell">
                <div class="metric-num-row">
                    <span class="metric-num" id="proc-counts-${gpuId}" style="font-size:16px;">C:${computeProcs} G:${graphicsProcs}</span>
                </div>
                <span class="metric-label">PROCESS COUNTS</span>
                <span class="metric-sub">Compute / Graphics</span>
            </div>`;
    }

    const throttle_reasons = getMetricValue(gpuInfo, 'throttle_reasons', 'None');
    const isThrottling = throttle_reasons && throttle_reasons !== 'None' && throttle_reasons !== 'N/A';
    extraMetrics += `
        <div class="metric-cell">
            <div class="metric-num-row">
                <span class="metric-num" id="throttle-${gpuId}" style="font-size:16px;${isThrottling ? 'color:var(--warning);' : ''}">${isThrottling ? throttle_reasons : 'GPU Idle'}</span>
            </div>
            <span class="metric-label">THROTTLE STATUS</span>
            <span class="metric-sub" id="throttle-sub-${gpuId}">${isThrottling ? 'Throttling' : 'Performance'}</span>
        </div>`;

    // Build sparkline chart containers
    let pcieChart = '';
    if (hasMetric(gpuInfo, 'pcie_rx_throughput') || hasMetric(gpuInfo, 'pcie_tx_throughput')) {
        pcieChart = `
            <div class="sparkline-container" data-chart-type="pcie" data-gpu-id="${gpuId}">
                <div class="sparkline-header">
                    <span class="sparkline-title">PCIe</span>
                    <div class="sparkline-stats">
                        <div class="sparkline-stat">
                            <span class="sparkline-stat-label">RX</span>
                            <span class="sparkline-stat-value" id="stat-pcie-rx-current-${gpuId}">0 KB/s</span>
                        </div>
                        <div class="sparkline-stat">
                            <span class="sparkline-stat-label">TX</span>
                            <span class="sparkline-stat-value" id="stat-pcie-tx-current-${gpuId}">0 KB/s</span>
                        </div>
                    </div>
                </div>
                <div class="sparkline-canvas-wrap"><canvas id="chart-pcie-${gpuId}"></canvas></div>
            </div>`;
    }

    let appClocksChart = '';
    if (hasMetric(gpuInfo, 'clock_graphics_app') || hasMetric(gpuInfo, 'clock_memory_app')) {
        appClocksChart = `
            <div class="sparkline-container" data-chart-type="appclocks" data-gpu-id="${gpuId}">
                <div class="sparkline-header">
                    <span class="sparkline-title">App Clocks</span>
                    <div class="sparkline-stats">
                        <div class="sparkline-stat">
                            <span class="sparkline-stat-label">GFX</span>
                            <span class="sparkline-stat-value" id="stat-app-clock-gr-${gpuId}">0</span>
                        </div>
                        <div class="sparkline-stat">
                            <span class="sparkline-stat-label">MEM</span>
                            <span class="sparkline-stat-value" id="stat-app-clock-mem-${gpuId}">0</span>
                        </div>
                    </div>
                </div>
                <div class="sparkline-canvas-wrap"><canvas id="chart-appclocks-${gpuId}"></canvas></div>
            </div>`;
    }

    return `
        <div class="gpu-card" id="gpu-${gpuId}">
            <!-- Header -->
            <div class="gpu-detail-header">
                <span class="gpu-detail-title">GPU ${gpuId}</span>
                <span class="gpu-detail-name">${gpuInfo.name || 'Unknown'}</span>
            </div>
            <div class="gpu-detail-specs">
                <span class="spec-tag" id="fan-${gpuId}">Fan ${fan_speed}%</span>
                <span class="spec-tag" id="pstate-header-${gpuId}">${gpuInfo.performance_state || ''}</span>
                <span class="spec-tag" id="pcie-header-${gpuId}">PCIe ${gpuInfo.pcie_gen || '?'}</span>
                <span class="spec-tag">${gpuInfo.driver_version || ''}</span>
                <span class="spec-tag">${gpuInfo._fallback_mode ? 'smi' : 'NVML'}</span>
            </div>

            <!-- TOP TIER: Raw numbers + bullet bars -->
            <div class="metrics-grid">
                <div class="metric-cell">
                    <div class="metric-num-row">
                        <span class="metric-num" id="util-text-${gpuId}">${utilization}</span>
                        <span class="metric-unit">%</span>
                    </div>
                    <span class="metric-label">GPU UTILIZATION</span>
                    <div class="bullet-bar"><div class="bullet-fill ${bulletClass(utilization, 80, 95)}" id="util-bar-${gpuId}" style="width:${utilization}%"></div></div>
                </div>

                <div class="metric-cell">
                    <div class="metric-num-row">
                        <span class="metric-num" id="temp-${gpuId}">${temperature}</span>
                        <span class="metric-unit">°C</span>
                    </div>
                    <span class="metric-label">TEMPERATURE</span>
                    <div class="bullet-bar"><div class="bullet-fill ${bulletClass(temperature, 75, 85)}" id="temp-bar-${gpuId}" style="width:${Math.min(temperature / 100 * 100, 100)}%"></div></div>
                </div>

                <div class="metric-cell">
                    <div class="metric-num-row">
                        <span class="metric-num" id="mem-${gpuId}">${formatMemory(memory_used)}</span>
                        <span class="metric-unit" id="mem-unit-${gpuId}">${formatMemoryUnit(memory_used)}</span>
                    </div>
                    <span class="metric-label">MEMORY USAGE</span>
                    <span class="metric-sub" id="mem-total-${gpuId}">of ${formatMemory(memory_total)}${formatMemoryUnit(memory_total)}</span>
                    <div class="bullet-bar"><div class="bullet-fill ${bulletClass(memPercent, 85, 95)}" id="mem-bar-${gpuId}" style="width:${memPercent}%"></div></div>
                </div>

                <div class="metric-cell">
                    <div class="metric-num-row">
                        <span class="metric-num" id="power-${gpuId}">${power_draw.toFixed(0)}</span>
                        <span class="metric-unit">W</span>
                    </div>
                    <span class="metric-label">POWER DRAW</span>
                    <span class="metric-sub" id="power-limit-${gpuId}">of ${power_limit.toFixed(0)}W</span>
                    <div class="bullet-bar"><div class="bullet-fill ${bulletClass(powerPercent, 80, 95)}" id="power-bar-${gpuId}" style="width:${powerPercent}%"></div></div>
                </div>

                <div class="metric-cell">
                    <div class="metric-num-row">
                        <span class="metric-num" id="fan-val-${gpuId}">${fan_speed}</span>
                        <span class="metric-unit">%</span>
                    </div>
                    <span class="metric-label">FAN</span>
                    <div class="bullet-bar"><div class="bullet-fill" id="fan-bar-${gpuId}" style="width:${fan_speed}%"></div></div>
                </div>

                ${extraMetrics}
            </div>

            <!-- MID TIER: Sparklines -->
            <div class="sparklines-section">
                <div class="sparklines-grid">
                    <div class="sparkline-container" data-chart-type="utilization" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Utilization</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-utilization-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-utilization-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-utilization-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-utilization-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-utilization-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="temperature" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Temperature</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-temperature-current-${gpuId}">0°C</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-temperature-min-${gpuId}">0°C</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-temperature-max-${gpuId}">0°C</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-temperature-avg-${gpuId}">0°C</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-temperature-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="memory" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Memory</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-memory-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-memory-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-memory-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-memory-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-memory-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="power" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Power</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-power-current-${gpuId}">0W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-power-min-${gpuId}">0W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-power-max-${gpuId}">0W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-power-avg-${gpuId}">0W</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-power-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="fanSpeed" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Fan Speed</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-fanSpeed-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-fanSpeed-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-fanSpeed-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-fanSpeed-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-fanSpeed-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="clocks" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Clocks</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-clocks-current-${gpuId}">0 MHz</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-clocks-min-${gpuId}">0 MHz</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-clocks-max-${gpuId}">0 MHz</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-clocks-avg-${gpuId}">0 MHz</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-clocks-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="efficiency" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Efficiency</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-efficiency-current-${gpuId}">0 %/W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-efficiency-min-${gpuId}">0 %/W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-efficiency-max-${gpuId}">0 %/W</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-efficiency-avg-${gpuId}">0 %/W</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-efficiency-${gpuId}"></canvas></div>
                    </div>

                    ${pcieChart}
                    ${appClocksChart}
                </div>
            </div>

            <!-- System Metrics -->
            <div class="system-sparklines-section">
                <div class="system-sparklines-label">System</div>
                <div class="sparklines-grid">
                    <div class="sparkline-container" data-chart-type="systemCpu" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">CPU</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-systemCpu-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-systemCpu-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-systemCpu-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-systemCpu-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemCpu-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" data-chart-type="systemMemory" data-gpu-id="${gpuId}">
                        <div class="sparkline-header">
                            <span class="sparkline-title">RAM</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-systemMemory-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-systemMemory-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-systemMemory-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-systemMemory-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemMemory-${gpuId}"></canvas></div>
                        <div class="sparkline-sub" id="sys-mem-sub-${gpuId}"></div>
                    </div>

                    <div class="sparkline-container" id="sys-swap-${gpuId}" data-chart-type="systemSwap" data-gpu-id="${gpuId}" style="display:none">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Swap</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-systemSwap-current-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-systemSwap-min-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-systemSwap-max-${gpuId}">0%</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-systemSwap-avg-${gpuId}">0%</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemSwap-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" id="sys-net-${gpuId}" data-chart-type="systemNetIo" data-gpu-id="${gpuId}" style="display:none">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Network</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">RX</span><span class="sparkline-stat-value" id="stat-systemNetIo-rx-current-${gpuId}">0 KB/s</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">TX</span><span class="sparkline-stat-value" id="stat-systemNetIo-tx-current-${gpuId}">0 KB/s</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemNetIo-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" id="sys-disk-${gpuId}" data-chart-type="systemDiskIo" data-gpu-id="${gpuId}" style="display:none">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Disk</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Read</span><span class="sparkline-stat-value" id="stat-systemDiskIo-read-current-${gpuId}">0 KB/s</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Write</span><span class="sparkline-stat-value" id="stat-systemDiskIo-write-current-${gpuId}">0 KB/s</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemDiskIo-${gpuId}"></canvas></div>
                    </div>

                    <div class="sparkline-container" id="sys-load-${gpuId}" data-chart-type="systemLoadAvg" data-gpu-id="${gpuId}" style="display:none">
                        <div class="sparkline-header">
                            <span class="sparkline-title">Load Average</span>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Cur</span><span class="sparkline-stat-value" id="stat-systemLoadAvg-current-${gpuId}">0</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Min</span><span class="sparkline-stat-value" id="stat-systemLoadAvg-min-${gpuId}">0</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Max</span><span class="sparkline-stat-value" id="stat-systemLoadAvg-max-${gpuId}">0</span></div>
                                <div class="sparkline-stat"><span class="sparkline-stat-label">Avg</span><span class="sparkline-stat-value" id="stat-systemLoadAvg-avg-${gpuId}">0</span></div>
                            </div>
                        </div>
                        <div class="sparkline-canvas-wrap"><canvas id="chart-systemLoadAvg-${gpuId}"></canvas></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// Update GPU Display
// ============================================

function updateGPUDisplay(gpuId, gpuInfo, shouldUpdateDOM = true) {
    const utilization = getMetricValue(gpuInfo, 'utilization', 0);
    const temperature = getMetricValue(gpuInfo, 'temperature', 0);
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const fan_speed = getMetricValue(gpuInfo, 'fan_speed', 0);

    if (shouldUpdateDOM) {
        // Core metrics
        const utilEl = document.getElementById(`util-text-${gpuId}`);
        const tempEl = document.getElementById(`temp-${gpuId}`);
        const memEl = document.getElementById(`mem-${gpuId}`);
        const powerEl = document.getElementById(`power-${gpuId}`);
        const fanEl = document.getElementById(`fan-${gpuId}`);
        const fanValEl = document.getElementById(`fan-val-${gpuId}`);

        if (utilEl) utilEl.textContent = `${utilization}`;
        if (tempEl) tempEl.textContent = `${temperature}`;
        if (memEl) memEl.textContent = formatMemory(memory_used);
        const memUnitEl = document.getElementById(`mem-unit-${gpuId}`);
        if (memUnitEl) memUnitEl.textContent = formatMemoryUnit(memory_used);
        if (powerEl) powerEl.textContent = `${power_draw.toFixed(0)}`;
        if (fanEl) fanEl.textContent = `Fan ${fan_speed}%`;
        if (fanValEl) fanValEl.textContent = `${fan_speed}`;

        // Bullet bars
        const memPercent = (memory_used / memory_total) * 100;
        const powerPercent = (power_draw / power_limit) * 100;

        const utilBar = document.getElementById(`util-bar-${gpuId}`);
        const tempBar = document.getElementById(`temp-bar-${gpuId}`);
        const memBar = document.getElementById(`mem-bar-${gpuId}`);
        const powerBar = document.getElementById(`power-bar-${gpuId}`);
        const fanBar = document.getElementById(`fan-bar-${gpuId}`);

        if (utilBar) {
            utilBar.style.width = `${utilization}%`;
            utilBar.className = `bullet-fill ${bulletClass(utilization, 80, 95)}`;
        }
        if (tempBar) {
            tempBar.style.width = `${Math.min(temperature / 100 * 100, 100)}%`;
            tempBar.className = `bullet-fill ${bulletClass(temperature, 75, 85)}`;
        }
        if (memBar) {
            memBar.style.width = `${memPercent}%`;
            memBar.className = `bullet-fill ${bulletClass(memPercent, 85, 95)}`;
        }
        if (powerBar) {
            powerBar.style.width = `${powerPercent}%`;
            powerBar.className = `bullet-fill ${bulletClass(powerPercent, 80, 95)}`;
        }
        if (fanBar) fanBar.style.width = `${fan_speed}%`;

        // Secondary metrics (only if elements exist)
        const clockGrEl = document.getElementById(`clock-gr-${gpuId}`);
        const clockMemEl = document.getElementById(`clock-mem-${gpuId}`);
        const clockSmEl = document.getElementById(`clock-sm-${gpuId}`);
        const memUtilEl = document.getElementById(`mem-util-${gpuId}`);
        const pcieEl = document.getElementById(`pcie-${gpuId}`);
        const pstateEl = document.getElementById(`pstate-${gpuId}`);
        const encoderEl = document.getElementById(`encoder-${gpuId}`);

        if (clockGrEl) clockGrEl.textContent = `${getMetricValue(gpuInfo, 'clock_graphics', 0)}`;
        if (clockMemEl) clockMemEl.textContent = `${getMetricValue(gpuInfo, 'clock_memory', 0)}`;
        if (clockSmEl) clockSmEl.textContent = `${getMetricValue(gpuInfo, 'clock_sm', 0)}`;
        if (memUtilEl) memUtilEl.textContent = `${getMetricValue(gpuInfo, 'memory_utilization', 0)}`;
        if (pcieEl) pcieEl.textContent = `Gen ${getMetricValue(gpuInfo, 'pcie_gen', 'N/A')}`;
        if (pstateEl) pstateEl.textContent = `${getMetricValue(gpuInfo, 'performance_state', 'N/A')}`;
        if (encoderEl) encoderEl.textContent = `${getMetricValue(gpuInfo, 'encoder_sessions', 0)}`;

        // Header badges
        const pstateHeaderEl = document.getElementById(`pstate-header-${gpuId}`);
        const pcieHeaderEl = document.getElementById(`pcie-header-${gpuId}`);
        if (pstateHeaderEl) pstateHeaderEl.textContent = `${getMetricValue(gpuInfo, 'performance_state', 'N/A')}`;
        if (pcieHeaderEl) pcieHeaderEl.textContent = `PCIe ${getMetricValue(gpuInfo, 'pcie_gen', 'N/A')}`;

        // Memory sublabel
        const memTotalEl = document.getElementById(`mem-total-${gpuId}`);
        if (memTotalEl) memTotalEl.textContent = `of ${formatMemory(memory_total)}${formatMemoryUnit(memory_total)}`;

        // Power sublabel
        const powerLimitEl = document.getElementById(`power-limit-${gpuId}`);
        if (powerLimitEl) powerLimitEl.textContent = `of ${power_limit.toFixed(0)}W`;

        // Advanced metrics
        const tempMemEl = document.getElementById(`temp-mem-${gpuId}`);
        const memFreeEl = document.getElementById(`mem-free-${gpuId}`);
        const decoderEl = document.getElementById(`decoder-${gpuId}`);
        const throttleEl = document.getElementById(`throttle-${gpuId}`);

        if (tempMemEl) {
            const tempMem = getMetricValue(gpuInfo, 'temperature_memory', null);
            tempMemEl.textContent = tempMem !== null ? `${tempMem}` : 'N/A';
        }
        if (memFreeEl) {
            const memFreeVal = getMetricValue(gpuInfo, 'memory_free', 0);
            memFreeEl.textContent = formatMemory(memFreeVal);
            const memFreeUnitEl = document.getElementById(`mem-free-unit-${gpuId}`);
            if (memFreeUnitEl) memFreeUnitEl.textContent = formatMemoryUnit(memFreeVal);
        }
        if (decoderEl) {
            const ds = getMetricValue(gpuInfo, 'decoder_sessions', null);
            decoderEl.textContent = ds !== null ? `${ds}` : 'N/A';
        }
        if (throttleEl) {
            const tr = getMetricValue(gpuInfo, 'throttle_reasons', 'None');
            const isT = tr && tr !== 'None' && tr !== 'N/A';
            throttleEl.textContent = isT ? tr : 'GPU Idle';
            throttleEl.style.color = isT ? 'var(--warning)' : '';
            const throttleSubEl = document.getElementById(`throttle-sub-${gpuId}`);
            if (throttleSubEl) throttleSubEl.textContent = isT ? 'Throttling' : 'Performance';
        }

        if (hasMetric(gpuInfo, 'energy_consumption_wh')) {
            const energyEl = document.getElementById(`energy-${gpuId}`);
            if (energyEl) energyEl.textContent = formatEnergy(gpuInfo.energy_consumption_wh);
        }

        // Video clock
        const clockVideoEl = document.getElementById(`clock-video-${gpuId}`);
        if (clockVideoEl) clockVideoEl.textContent = `${getMetricValue(gpuInfo, 'clock_video', 0)}`;

        // Max PCIe
        const pcieMaxEl = document.getElementById(`pcie-max-${gpuId}`);
        if (pcieMaxEl) pcieMaxEl.textContent = `Gen ${getMetricValue(gpuInfo, 'pcie_gen_max', 'N/A')}`;

        // BAR1 memory
        const bar1MemEl = document.getElementById(`bar1-mem-${gpuId}`);
        if (bar1MemEl) {
            const bar1MemVal = getMetricValue(gpuInfo, 'bar1_memory_used', 0);
            bar1MemEl.textContent = formatMemory(bar1MemVal);
            const bar1MemUnitEl = document.getElementById(`bar1-mem-unit-${gpuId}`);
            if (bar1MemUnitEl) bar1MemUnitEl.textContent = formatMemoryUnit(bar1MemVal);
        }
        const bar1TotalEl = document.getElementById(`bar1-mem-total-${gpuId}`);
        if (bar1TotalEl) {
            const bar1Total = getMetricValue(gpuInfo, 'bar1_memory_total', 0);
            bar1TotalEl.textContent = `of ${formatMemory(bar1Total)}${formatMemoryUnit(bar1Total)}`;
        }

        // Brand / Architecture
        const brandEl = document.getElementById(`brand-${gpuId}`);
        if (brandEl) brandEl.textContent = `${getMetricValue(gpuInfo, 'brand', 'N/A')}`;
        const archEl = document.getElementById(`arch-${gpuId}`);
        if (archEl) archEl.textContent = `${getMetricValue(gpuInfo, 'architecture', 'Unknown')}`;

        // Process counts
        const procCountsEl = document.getElementById(`proc-counts-${gpuId}`);
        if (procCountsEl) {
            const computeProcs = getMetricValue(gpuInfo, 'compute_processes_count', 0);
            const graphicsProcs = getMetricValue(gpuInfo, 'graphics_processes_count', 0);
            procCountsEl.textContent = `C:${computeProcs} G:${graphicsProcs}`;
        }
    }

    // Always update charts
    const memPercent = (memory_used / memory_total) * 100;

    updateChart(gpuId, 'utilization', utilization);
    updateChart(gpuId, 'temperature', temperature);
    updateChart(gpuId, 'memory', memPercent);
    updateChart(gpuId, 'power', power_draw);
    updateChart(gpuId, 'fanSpeed', fan_speed);
    updateChart(gpuId, 'clocks',
        getMetricValue(gpuInfo, 'clock_graphics', 0),
        getMetricValue(gpuInfo, 'clock_sm', 0),
        getMetricValue(gpuInfo, 'clock_memory', 0)
    );

    const efficiency = power_draw > 0 ? utilization / power_draw : 0;
    updateChart(gpuId, 'efficiency', efficiency);

    if (hasMetric(gpuInfo, 'pcie_rx_throughput') || hasMetric(gpuInfo, 'pcie_tx_throughput')) {
        updateChart(gpuId, 'pcie',
            gpuInfo.pcie_rx_throughput || 0,
            gpuInfo.pcie_tx_throughput || 0
        );
    }

    if (hasMetric(gpuInfo, 'clock_graphics_app') || hasMetric(gpuInfo, 'clock_memory_app')) {
        updateChart(gpuId, 'appclocks',
            gpuInfo.clock_graphics_app || gpuInfo.clock_graphics || 0,
            gpuInfo.clock_memory_app || gpuInfo.clock_memory || 0,
            gpuInfo.clock_sm_app || gpuInfo.clock_sm || 0,
            gpuInfo.clock_video_app || gpuInfo.clock_video || 0
        );
    }
}

// ============================================
// Process Table
// ============================================

function updateProcesses(processes) {
    const container = document.getElementById('processes-container');
    const countEl = document.getElementById('process-count');

    if (countEl) {
        countEl.textContent = processes.length === 0 ? '0' :
                             `${processes.length}`;
    }

    if (processes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-text">No active GPU processes</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="process-table-header">
            <span>Process</span>
            <span>PID</span>
            <span style="text-align:right">VRAM</span>
        </div>
    ` + processes.map(proc => `
        <div class="process-item">
            <div class="process-name">${proc.name}</div>
            <div class="process-pid">${proc.pid}</div>
            <div class="process-memory">${formatMemory(proc.memory)}${formatMemoryUnit(proc.memory)}</div>
        </div>
    `).join('');
}
