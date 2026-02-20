/**
 * GPU Card creation and update functions
 */

// Create overview GPU card (compact view)
function createOverviewCard(gpuId, gpuInfo) {
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const memPercent = (memory_used / memory_total) * 100;

    return `
        <div class="overview-gpu-card" data-gpu-id="${gpuId}" onclick="switchToView('gpu-${gpuId}')" style="pointer-events: auto;">
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
                    <div class="overview-metric-value" id="overview-util-${gpuId}">${getMetricValue(gpuInfo, 'utilization', 0)}%</div>
                    <div class="overview-metric-label">GPU Usage</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-temp-${gpuId}">${getMetricValue(gpuInfo, 'temperature', 0)}°C</div>
                    <div class="overview-metric-label">Temperature</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-mem-${gpuId}">${Math.round(memPercent)}%</div>
                    <div class="overview-metric-label">Memory</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-value" id="overview-power-${gpuId}">${getMetricValue(gpuInfo, 'power_draw', 0).toFixed(0)}W</div>
                    <div class="overview-metric-label">Power Draw</div>
                </div>
            </div>

            <div class="overview-chart-section">
                <div class="overview-mini-chart">
                    <canvas id="overview-chart-${gpuId}"></canvas>
                </div>
            </div>
        </div>
    `;
}

// Update overview card (throttled for DOM updates, always updates charts)
function updateOverviewCard(gpuId, gpuInfo, shouldUpdateDOM = true) {
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const memPercent = (memory_used / memory_total) * 100;

    // Only update DOM text when throttle allows
    if (shouldUpdateDOM) {
        const utilEl = document.getElementById(`overview-util-${gpuId}`);
        const tempEl = document.getElementById(`overview-temp-${gpuId}`);
        const memEl = document.getElementById(`overview-mem-${gpuId}`);
        const powerEl = document.getElementById(`overview-power-${gpuId}`);

        if (utilEl) utilEl.textContent = `${getMetricValue(gpuInfo, 'utilization', 0)}%`;
        if (tempEl) tempEl.textContent = `${getMetricValue(gpuInfo, 'temperature', 0)}°C`;
        if (memEl) memEl.textContent = `${Math.round(memPercent)}%`;
        if (powerEl) powerEl.textContent = `${getMetricValue(gpuInfo, 'power_draw', 0).toFixed(0)}W`;
    }

    // ALWAYS update chart data for the mini chart (smooth animations)
    updateChart(gpuId, 'utilization', Number(getMetricValue(gpuInfo, 'utilization', 0)));

    // Update mini chart
    if (charts[gpuId] && charts[gpuId].overviewMini) {
        charts[gpuId].overviewMini.update('none');
    }
}

// Create detailed GPU card HTML (for individual tabs)
function createGPUCard(gpuId, gpuInfo) {
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const memPercent = (memory_used / memory_total) * 100;
    const powerPercent = (power_draw / power_limit) * 100;

    return `
        <div class="gpu-card" id="gpu-${gpuId}">
            <div class="gpu-header-enhanced">
                <div class="gpu-info-section">
                    <div class="gpu-title-large">GPU ${gpuId}</div>
                    <div class="gpu-name">${gpuInfo.name}</div>
                    <div class="gpu-specs">
                        <span class="spec-item">
                            <span id="fan-${gpuId}">${gpuInfo.fan_speed}%</span> Fan
                        </span>
                        <span class="spec-item">
                            <span id="pstate-header-${gpuId}">${gpuInfo.performance_state || 'N/A'}</span>
                        </span>
                        <span class="spec-item">
                            PCIe Gen <span id="pcie-header-${gpuId}">${gpuInfo.pcie_gen || 'N/A'}</span>
                        </span>
                        <span class="spec-item">
                            Driver ${gpuInfo.driver_version || 'N/A'}
                        </span>
                        <span class="spec-item spec-mode">
                            ${gpuInfo._fallback_mode ? 'nvidia-smi' : 'NVML'}
                        </span>
                    </div>
                </div>
                <div class="gpu-status-badge">
                    <span class="status-dot"></span>
                    <span class="status-text">ONLINE</span>
                </div>
            </div>

            <div class="metrics-grid-enhanced">
                <div class="metric-card metric-card-featured">
                    <canvas class="util-background-chart" id="util-bg-chart-${gpuId}"></canvas>
                    <div class="metric-header">
                        <span class="metric-label">GPU Utilization</span>
                    </div>
                    <div class="circular-progress-container">
                        <svg class="circular-progress" viewBox="0 0 120 120">
                            <defs>
                                <linearGradient id="util-gradient-${gpuId}" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#4facfe;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#1e3a8a;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                            <circle class="progress-ring-bg" cx="60" cy="60" r="50"/>
                            <circle class="progress-ring" id="util-ring-${gpuId}" cx="60" cy="60" r="50"
                                stroke="url(#util-gradient-${gpuId})"
                                style="stroke-dashoffset: ${314 - (314 * gpuInfo.utilization / 100)}"/>
                            <text x="60" y="60" class="progress-text" id="util-text-${gpuId}">${gpuInfo.utilization}%</text>
                        </svg>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="util-bar-${gpuId}" style="width: ${gpuInfo.utilization}%"></div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Temperature</span>
                    </div>
                    <div class="temp-display">
                        <div class="metric-value-large" id="temp-${gpuId}">${gpuInfo.temperature}°C</div>
                        <div class="temp-gauge"></div>
                        <div class="temp-status" id="temp-status-${gpuId}">
                            ${gpuInfo.temperature < 60 ? 'Cool' : gpuInfo.temperature < 75 ? 'Normal' : 'Warm'}
                        </div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Memory Usage</span>
                    </div>
                    <div class="metric-value-large" id="mem-${gpuId}">${formatMemory(gpuInfo.memory_used)}</div>
                    <div class="metric-sublabel" id="mem-total-${gpuId}">of ${formatMemory(gpuInfo.memory_total)}</div>
                    <div class="progress-bar">
                        <div class="progress-fill mem-bar" id="mem-bar-${gpuId}" style="width: ${memPercent}%"></div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Power Draw</span>
                    </div>
                    <div class="metric-value-large" id="power-${gpuId}">${gpuInfo.power_draw.toFixed(1)}W</div>
                    <div class="metric-sublabel" id="power-limit-${gpuId}">of ${gpuInfo.power_limit.toFixed(0)}W</div>
                    <div class="progress-bar">
                        <div class="progress-fill power-bar" id="power-bar-${gpuId}" style="width: ${powerPercent}%"></div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Graphics Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-gr-${gpuId}">${gpuInfo.clock_graphics || 0}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Memory Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-mem-${gpuId}">${gpuInfo.clock_memory || 0}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Memory Utilization</span>
                    </div>
                    <div class="metric-value-large" id="mem-util-${gpuId}">${gpuInfo.memory_utilization || 0}%</div>
                    <div class="metric-sublabel">Controller Usage</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="mem-util-bar-${gpuId}" style="width: ${gpuInfo.memory_utilization || 0}%"></div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">PCIe Link</span>
                    </div>
                    <div class="metric-value-large" id="pcie-${gpuId}">Gen ${gpuInfo.pcie_gen || 'N/A'}</div>
                    <div class="metric-sublabel">x${gpuInfo.pcie_width || 'N/A'} lanes</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Performance State</span>
                    </div>
                    <div class="metric-value-large" id="pstate-${gpuId}">${gpuInfo.performance_state || 'N/A'}</div>
                    <div class="metric-sublabel">Power Mode</div>
                </div>

                ${hasMetric(gpuInfo, 'encoder_sessions') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Encoder Sessions</span>
                    </div>
                    <div class="metric-value-large" id="encoder-${gpuId}">${gpuInfo.encoder_sessions}</div>
                    <div class="metric-sublabel">${(gpuInfo.encoder_fps || 0).toFixed(1)} FPS avg</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'clock_sm') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">SM Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-sm-${gpuId}">${gpuInfo.clock_sm}</div>
                    <div class="metric-sublabel">MHz${gpuInfo.clock_sm_max ? ` / ${gpuInfo.clock_sm_max} Max` : ''}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'temperature_memory') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Memory Temp</span>
                    </div>
                    <div class="metric-value-large" id="temp-mem-${gpuId}">${gpuInfo.temperature_memory}°C</div>
                    <div class="metric-sublabel">VRAM Temperature</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'memory_free') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Free Memory</span>
                    </div>
                    <div class="metric-value-large" id="mem-free-${gpuId}">${formatMemory(gpuInfo.memory_free)}</div>
                    <div class="metric-sublabel">Available VRAM</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'decoder_sessions') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Decoder Sessions</span>
                    </div>
                    <div class="metric-value-large" id="decoder-${gpuId}">${gpuInfo.decoder_sessions}</div>
                    <div class="metric-sublabel">${(gpuInfo.decoder_fps || 0).toFixed(1)} FPS avg</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'clock_video') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Video Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-video-${gpuId}">${gpuInfo.clock_video}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'compute_mode') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Compute Mode</span>
                    </div>
                    <div class="metric-value-large" id="compute-mode-${gpuId}" style="font-size: 1.5rem;">${gpuInfo.compute_mode}</div>
                    <div class="metric-sublabel">Execution Mode</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'pcie_gen_max') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Max PCIe</span>
                    </div>
                    <div class="metric-value-large" id="pcie-max-${gpuId}">Gen ${gpuInfo.pcie_gen_max}</div>
                    <div class="metric-sublabel">x${gpuInfo.pcie_width_max || 'N/A'} Max</div>
                </div>` : ''}

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Throttle Status</span>
                    </div>
                    <div class="metric-value-large" id="throttle-${gpuId}" style="font-size: 1.2rem;">${gpuInfo.throttle_reasons === 'Active' || gpuInfo.throttle_reasons !== 'None' ? 'Active' : 'None'}</div>
                    <div class="metric-sublabel">Performance</div>
                </div>

                ${hasMetric(gpuInfo, 'energy_consumption_wh') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Total Energy</span>
                    </div>
                    <div class="metric-value-large" id="energy-${gpuId}">${formatEnergy(gpuInfo.energy_consumption_wh)}</div>
                    <div class="metric-sublabel">Since driver load</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'brand') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Brand / Architecture</span>
                    </div>
                    <div class="metric-value-large" id="brand-${gpuId}" style="font-size: 1.3rem;">${gpuInfo.brand}</div>
                    <div class="metric-sublabel">${gpuInfo.architecture || 'Unknown'}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'power_limit_min') && hasMetric(gpuInfo, 'power_limit_max') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Power Range</span>
                    </div>
                    <div class="metric-value-large" id="power-range-${gpuId}" style="font-size: 1.3rem;">${gpuInfo.power_limit_min.toFixed(0)}W - ${gpuInfo.power_limit_max.toFixed(0)}W</div>
                    <div class="metric-sublabel">Min / Max Limit</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'clock_graphics_app') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Target Graphics Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-gr-app-${gpuId}">${gpuInfo.clock_graphics_app}</div>
                    <div class="metric-sublabel">MHz${gpuInfo.clock_graphics_default ? ` / ${gpuInfo.clock_graphics_default} Default` : ''}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'clock_memory_app') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Target Memory Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-mem-app-${gpuId}">${gpuInfo.clock_memory_app}</div>
                    <div class="metric-sublabel">MHz${gpuInfo.clock_memory_default ? ` / ${gpuInfo.clock_memory_default} Default` : ''}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'pcie_rx_throughput') || hasMetric(gpuInfo, 'pcie_tx_throughput') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">PCIe Throughput</span>
                    </div>
                    <div class="metric-value-large" id="pcie-throughput-${gpuId}" style="font-size: 1.3rem;">↓${(gpuInfo.pcie_rx_throughput || 0).toFixed(0)} KB/s</div>
                    <div class="metric-sublabel">↑${(gpuInfo.pcie_tx_throughput || 0).toFixed(0)} KB/s</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'bar1_memory_used') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">BAR1 Memory</span>
                    </div>
                    <div class="metric-value-large" id="bar1-mem-${gpuId}">${formatMemory(gpuInfo.bar1_memory_used)}</div>
                    <div class="metric-sublabel">of ${formatMemory(gpuInfo.bar1_memory_total || 0)}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'persistence_mode') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Persistence Mode</span>
                    </div>
                    <div class="metric-value-large" id="persistence-${gpuId}" style="font-size: 1.3rem;">${gpuInfo.persistence_mode}</div>
                    <div class="metric-sublabel">${gpuInfo.display_active ? 'Display Active' : 'Headless'}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'reset_required') || hasMetric(gpuInfo, 'multi_gpu_board') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">GPU Status</span>
                    </div>
                    <div class="metric-value-large" id="reset-required-${gpuId}" style="font-size: 1.3rem; color: ${gpuInfo.reset_required ? '#ff4444' : '#00ff88'};">${gpuInfo.reset_required ? 'Reset Required!' : 'Healthy'}</div>
                    <div class="metric-sublabel">${gpuInfo.multi_gpu_board ? 'Multi-GPU Board' : 'Single GPU'}</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'nvlink_active_count') && gpuInfo.nvlink_active_count > 0 ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">NVLink Status</span>
                    </div>
                    <div class="metric-value-large" id="nvlink-${gpuId}">${gpuInfo.nvlink_active_count}</div>
                    <div class="metric-sublabel">Active Links</div>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'compute_processes_count') || hasMetric(gpuInfo, 'graphics_processes_count') ? `
                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-label">Process Counts</span>
                    </div>
                    <div class="metric-value-large" id="process-counts-${gpuId}" style="font-size: 1.3rem;">C:${gpuInfo.compute_processes_count || 0} G:${gpuInfo.graphics_processes_count || 0}</div>
                    <div class="metric-sublabel">Compute / Graphics</div>
                </div>` : ''}
            </div>

            <div class="charts-section">
                <div class="chart-container">
                    <div class="chart-header" data-value="0%">
                        <div class="chart-title">Utilization</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-utilization-current-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-utilization-min-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-utilization-max-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-utilization-avg-${gpuId}">0%</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-utilization-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0°C">
                        <div class="chart-title">Temperature</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-temperature-current-${gpuId}">0°C</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-temperature-min-${gpuId}">0°C</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-temperature-max-${gpuId}">0°C</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-temperature-avg-${gpuId}">0°C</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-temperature-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0%">
                        <div class="chart-title">Memory</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-memory-current-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-memory-min-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-memory-max-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-memory-avg-${gpuId}">0%</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-memory-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0W">
                        <div class="chart-title">Power</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-power-current-${gpuId}">0W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-power-min-${gpuId}">0W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-power-max-${gpuId}">0W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-power-avg-${gpuId}">0W</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-power-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0%">
                        <div class="chart-title">Fan Speed</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-fanSpeed-current-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-fanSpeed-min-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-fanSpeed-max-${gpuId}">0%</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-fanSpeed-avg-${gpuId}">0%</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-fanSpeed-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0 MHz">
                        <div class="chart-title">Clocks</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-clocks-current-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-clocks-min-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-clocks-max-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-clocks-avg-${gpuId}">0 MHz</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-clocks-${gpuId}"></canvas>
                </div>

                <div class="chart-container">
                    <div class="chart-header" data-value="0 %/W">
                        <div class="chart-title">Efficiency</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current</span>
                                <span class="chart-stat-value current" id="stat-efficiency-current-${gpuId}">0 %/W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Min</span>
                                <span class="chart-stat-value min" id="stat-efficiency-min-${gpuId}">0 %/W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max</span>
                                <span class="chart-stat-value max" id="stat-efficiency-max-${gpuId}">0 %/W</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Avg</span>
                                <span class="chart-stat-value avg" id="stat-efficiency-avg-${gpuId}">0 %/W</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-efficiency-${gpuId}"></canvas>
                </div>


                ${hasMetric(gpuInfo, 'pcie_rx_throughput') || hasMetric(gpuInfo, 'pcie_tx_throughput') ? `
                <div class="chart-container">
                    <div class="chart-header" data-value="0 KB/s">
                        <div class="chart-title">PCIe</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current RX</span>
                                <span class="chart-stat-value current" id="stat-pcie-rx-current-${gpuId}">0 KB/s</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Current TX</span>
                                <span class="chart-stat-value current" id="stat-pcie-tx-current-${gpuId}">0 KB/s</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max RX</span>
                                <span class="chart-stat-value max" id="stat-pcie-rx-max-${gpuId}">0 KB/s</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Max TX</span>
                                <span class="chart-stat-value max" id="stat-pcie-tx-max-${gpuId}">0 KB/s</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-pcie-${gpuId}"></canvas>
                </div>` : ''}

                ${hasMetric(gpuInfo, 'clock_graphics_app') || hasMetric(gpuInfo, 'clock_memory_app') ? `
                <div class="chart-container">
                    <div class="chart-header" data-value="0 MHz">
                        <div class="chart-title">App Clocks</div>
                        <div class="chart-stats">
                            <div class="chart-stat">
                                <span class="chart-stat-label">Graphics</span>
                                <span class="chart-stat-value current" id="stat-app-clock-gr-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Memory</span>
                                <span class="chart-stat-value current" id="stat-app-clock-mem-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">SM</span>
                                <span class="chart-stat-value current" id="stat-app-clock-sm-${gpuId}">0 MHz</span>
                            </div>
                            <div class="chart-stat">
                                <span class="chart-stat-label">Video</span>
                                <span class="chart-stat-value current" id="stat-app-clock-video-${gpuId}">0 MHz</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="chart-appclocks-${gpuId}"></canvas>
                </div>` : ''}
            </div>
        </div>
    `;
}

// Helper function to format memory values
function formatMemory(mb) {
    if (mb >= 1024) {
        return `${(mb / 1024).toFixed(1)}GB`;
    }
    return `${Math.round(mb)}MB`;
}

// Helper function to format energy values (Wh to kWh when appropriate)
function formatEnergy(wh) {
    if (wh >= 1000) {
        return `${(wh / 1000).toFixed(2)}kWh`;
    }
    return `${wh.toFixed(2)}Wh`;
}

// Helper function to safely get metric value with default
function getMetricValue(gpuInfo, key, defaultValue = 0) {
    return (key in gpuInfo && gpuInfo[key] !== null && gpuInfo[key] !== undefined) ? gpuInfo[key] : defaultValue;
}

// Helper function to check if a metric is available (not null, undefined, or 'N/A')
function hasMetric(gpuInfo, key) {
    const value = gpuInfo[key];
    return value !== null && value !== undefined && value !== 'N/A' && value !== 'Unknown' && value !== '';
}

// Helper function to create metric card HTML (returns empty string if not available)
function createMetricCard(label, valueId, value, sublabel, gpuId, options = {}) {
    // Don't create card if value is not available and hideIfEmpty is true
    if (options.hideIfEmpty && (!value || value === 'N/A' || value === 0 || value === '0')) {
        return '';
    }
    
    const progressBar = options.progressBar ? `
        <div class="progress-bar">
            <div class="progress-fill ${options.progressClass || ''}" id="${valueId}-bar" style="width: ${options.progressWidth || 0}%"></div>
        </div>
    ` : '';
    
    return `
        <div class="metric-card" data-metric="${valueId}">
            <div class="metric-header">
                <span class="metric-label">${label}</span>
            </div>
            <div class="metric-value-large" id="${valueId}" style="${options.style || ''}">${value}</div>
            <div class="metric-sublabel">${sublabel}</div>
            ${progressBar}
        </div>
    `;
}

// Update GPU display
function updateGPUDisplay(gpuId, gpuInfo, shouldUpdateDOM = true) {
    // Extract metric values
    const utilization = getMetricValue(gpuInfo, 'utilization', 0);
    const temperature = getMetricValue(gpuInfo, 'temperature', 0);
    const memory_used = getMetricValue(gpuInfo, 'memory_used', 0);
    const memory_total = getMetricValue(gpuInfo, 'memory_total', 1);
    const power_draw = getMetricValue(gpuInfo, 'power_draw', 0);
    const power_limit = getMetricValue(gpuInfo, 'power_limit', 1);
    const fan_speed = getMetricValue(gpuInfo, 'fan_speed', 0);

    // Only update DOM text elements if throttle allows (reduce DOM thrashing during scroll)
    if (shouldUpdateDOM) {
        // Update metric values
        const utilEl = document.getElementById(`util-${gpuId}`);
        const tempEl = document.getElementById(`temp-${gpuId}`);
        const memEl = document.getElementById(`mem-${gpuId}`);
        const powerEl = document.getElementById(`power-${gpuId}`);
        const fanEl = document.getElementById(`fan-${gpuId}`);

        if (utilEl) utilEl.textContent = `${utilization}%`;
        if (tempEl) tempEl.textContent = `${temperature}°C`;
        if (memEl) memEl.textContent = formatMemory(memory_used);
        if (powerEl) powerEl.textContent = `${power_draw.toFixed(1)}W`;
        if (fanEl) fanEl.textContent = `${fan_speed}%`;

        // Update temperature status
        const tempStatus = document.getElementById(`temp-status-${gpuId}`);
        if (tempStatus) {
            if (temperature < 60) {
                tempStatus.textContent = 'Cool';
            } else if (temperature < 75) {
                tempStatus.textContent = 'Normal';
            } else {
                tempStatus.textContent = 'Warm';
            }
        }

        // Update circular gauge
        const utilRing = document.getElementById(`util-ring-${gpuId}`);
        const utilText = document.getElementById(`util-text-${gpuId}`);
        if (utilRing) {
            const offset = 314 - (314 * utilization / 100);
            utilRing.style.strokeDashoffset = offset;
        }
        if (utilText) utilText.textContent = `${utilization}%`;

        // Update progress bars
        const utilBar = document.getElementById(`util-bar-${gpuId}`);
        const memBar = document.getElementById(`mem-bar-${gpuId}`);
        const powerBar = document.getElementById(`power-bar-${gpuId}`);

        const memPercent = (memory_used / memory_total) * 100;
        const powerPercent = (power_draw / power_limit) * 100;

        if (utilBar) utilBar.style.width = `${utilization}%`;
        if (memBar) memBar.style.width = `${memPercent}%`;
        if (powerBar) powerBar.style.width = `${powerPercent}%`;

        // Update new metrics (only if they exist)
        const clockGrEl = document.getElementById(`clock-gr-${gpuId}`);
        const clockMemEl = document.getElementById(`clock-mem-${gpuId}`);
        const clockSmEl = document.getElementById(`clock-sm-${gpuId}`);
        const memUtilEl = document.getElementById(`mem-util-${gpuId}`);
        const memUtilBar = document.getElementById(`mem-util-bar-${gpuId}`);
        const pcieEl = document.getElementById(`pcie-${gpuId}`);
        const pstateEl = document.getElementById(`pstate-${gpuId}`);
        const encoderEl = document.getElementById(`encoder-${gpuId}`);

        if (clockGrEl) clockGrEl.textContent = `${getMetricValue(gpuInfo, 'clock_graphics', 0)}`;
        if (clockMemEl) clockMemEl.textContent = `${getMetricValue(gpuInfo, 'clock_memory', 0)}`;
        if (clockSmEl) clockSmEl.textContent = `${getMetricValue(gpuInfo, 'clock_sm', 0)}`;
        if (memUtilEl) memUtilEl.textContent = `${getMetricValue(gpuInfo, 'memory_utilization', 0)}%`;
        if (memUtilBar) memUtilBar.style.width = `${getMetricValue(gpuInfo, 'memory_utilization', 0)}%`;
        if (pcieEl) pcieEl.textContent = `Gen ${getMetricValue(gpuInfo, 'pcie_gen', 'N/A')}`;
        if (pstateEl) pstateEl.textContent = `${getMetricValue(gpuInfo, 'performance_state', 'N/A')}`;
        if (encoderEl) encoderEl.textContent = `${getMetricValue(gpuInfo, 'encoder_sessions', 0)}`;

        // Update header badges
        const pstateHeaderEl = document.getElementById(`pstate-header-${gpuId}`);
        const pcieHeaderEl = document.getElementById(`pcie-header-${gpuId}`);
        if (pstateHeaderEl) pstateHeaderEl.textContent = `${getMetricValue(gpuInfo, 'performance_state', 'N/A')}`;
        if (pcieHeaderEl) pcieHeaderEl.textContent = `${getMetricValue(gpuInfo, 'pcie_gen', 'N/A')}`;

        // Update memory total sublabel
        const memTotalEl = document.getElementById(`mem-total-${gpuId}`);
        if (memTotalEl) memTotalEl.textContent = `of ${formatMemory(memory_total)}`;

        // Update new advanced metrics (only if present)
        const tempMemEl = document.getElementById(`temp-mem-${gpuId}`);
        const memFreeEl = document.getElementById(`mem-free-${gpuId}`);
        const decoderEl = document.getElementById(`decoder-${gpuId}`);
        const clockVideoEl = document.getElementById(`clock-video-${gpuId}`);
        const computeModeEl = document.getElementById(`compute-mode-${gpuId}`);
        const pcieMaxEl = document.getElementById(`pcie-max-${gpuId}`);
        const throttleEl = document.getElementById(`throttle-${gpuId}`);

        if (tempMemEl) {
            const tempMem = getMetricValue(gpuInfo, 'temperature_memory', null);
            if (tempMem !== null) {
                tempMemEl.textContent = `${tempMem}°C`;
            } else {
                tempMemEl.textContent = 'N/A';
            }
        }
        if (memFreeEl) memFreeEl.textContent = formatMemory(getMetricValue(gpuInfo, 'memory_free', 0));
        if (decoderEl) {
            const decoderSessions = getMetricValue(gpuInfo, 'decoder_sessions', null);
            if (decoderSessions !== null) {
                decoderEl.textContent = `${decoderSessions}`;
            } else {
                decoderEl.textContent = 'N/A';
            }
        }
        if (clockVideoEl) {
            const clockVideo = getMetricValue(gpuInfo, 'clock_video', null);
            if (clockVideo !== null) {
                clockVideoEl.textContent = `${clockVideo}`;
            } else {
                clockVideoEl.textContent = 'N/A';
            }
        }
        if (computeModeEl) computeModeEl.textContent = `${getMetricValue(gpuInfo, 'compute_mode', 'N/A')}`;
        if (pcieMaxEl) pcieMaxEl.textContent = `Gen ${getMetricValue(gpuInfo, 'pcie_gen_max', 'N/A')}`;
        if (throttleEl) {
            const throttle_reasons = getMetricValue(gpuInfo, 'throttle_reasons', 'None');
            const isThrottling = throttle_reasons && throttle_reasons !== 'None' && throttle_reasons !== 'N/A';
            throttleEl.textContent = isThrottling ? throttle_reasons : 'None';
        }

        // Update all new metrics (only if elements exist - dynamic dashboard)
        if (hasMetric(gpuInfo, 'energy_consumption_wh')) {
            const energyEl = document.getElementById(`energy-${gpuId}`);
            if (energyEl) energyEl.textContent = formatEnergy(gpuInfo.energy_consumption_wh);
        }
        
        if (hasMetric(gpuInfo, 'brand')) {
            const brandEl = document.getElementById(`brand-${gpuId}`);
            if (brandEl) brandEl.textContent = gpuInfo.brand;
        }
        
        if (hasMetric(gpuInfo, 'power_limit_min') && hasMetric(gpuInfo, 'power_limit_max')) {
            const powerRangeEl = document.getElementById(`power-range-${gpuId}`);
            if (powerRangeEl) powerRangeEl.textContent = `${gpuInfo.power_limit_min.toFixed(0)}W - ${gpuInfo.power_limit_max.toFixed(0)}W`;
        }
        
        if (hasMetric(gpuInfo, 'clock_graphics_app')) {
            const clockGrAppEl = document.getElementById(`clock-gr-app-${gpuId}`);
            if (clockGrAppEl) clockGrAppEl.textContent = gpuInfo.clock_graphics_app;
        }
        
        if (hasMetric(gpuInfo, 'clock_memory_app')) {
            const clockMemAppEl = document.getElementById(`clock-mem-app-${gpuId}`);
            if (clockMemAppEl) clockMemAppEl.textContent = gpuInfo.clock_memory_app;
        }
        
        if (hasMetric(gpuInfo, 'pcie_rx_throughput') || hasMetric(gpuInfo, 'pcie_tx_throughput')) {
            const pcieThroughputEl = document.getElementById(`pcie-throughput-${gpuId}`);
            if (pcieThroughputEl) {
                const rx = (gpuInfo.pcie_rx_throughput || 0).toFixed(0);
                const tx = (gpuInfo.pcie_tx_throughput || 0).toFixed(0);
                pcieThroughputEl.innerHTML = `↓${rx} KB/s`;
            }
        }
        
        if (hasMetric(gpuInfo, 'bar1_memory_used')) {
            const bar1MemEl = document.getElementById(`bar1-mem-${gpuId}`);
            if (bar1MemEl) bar1MemEl.textContent = formatMemory(gpuInfo.bar1_memory_used);
        }
        
        if (hasMetric(gpuInfo, 'persistence_mode')) {
            const persistenceEl = document.getElementById(`persistence-${gpuId}`);
            if (persistenceEl) persistenceEl.textContent = gpuInfo.persistence_mode;
        }
        
        if (hasMetric(gpuInfo, 'reset_required')) {
            const resetRequiredEl = document.getElementById(`reset-required-${gpuId}`);
            if (resetRequiredEl) {
                resetRequiredEl.textContent = gpuInfo.reset_required ? 'Reset Required!' : 'Healthy';
                resetRequiredEl.style.color = gpuInfo.reset_required ? '#ff4444' : '#00ff88';
            }
        }
        
        if (hasMetric(gpuInfo, 'nvlink_active_count') && gpuInfo.nvlink_active_count > 0) {
            const nvlinkEl = document.getElementById(`nvlink-${gpuId}`);
            if (nvlinkEl) nvlinkEl.textContent = gpuInfo.nvlink_active_count;
        }
        
        if (hasMetric(gpuInfo, 'compute_processes_count') || hasMetric(gpuInfo, 'graphics_processes_count')) {
            const processCountsEl = document.getElementById(`process-counts-${gpuId}`);
            if (processCountsEl) {
                const compute = gpuInfo.compute_processes_count || 0;
                const graphics = gpuInfo.graphics_processes_count || 0;
                processCountsEl.textContent = `C:${compute} G:${graphics}`;
            }
        }
    } // End of shouldUpdateDOM block

    // ALWAYS update charts (they're efficient and need high-frequency data)
    const memPercent = (memory_used / memory_total) * 100;

    // Update charts with available data
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
    
    // Calculate and update power efficiency (utilization per watt)
    const efficiency = power_draw > 0 ? utilization / power_draw : 0;
    updateChart(gpuId, 'efficiency', efficiency);
    
    // Update new charts (only if metrics are available)
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

    // Update background utilization chart
    if (charts[gpuId] && charts[gpuId].utilBackground) {
        charts[gpuId].utilBackground.update('none');
    }
}

// Update processes display
function updateProcesses(processes) {
    const container = document.getElementById('processes-container');
    const countEl = document.getElementById('process-count');

    // Update count
    if (countEl) {
        countEl.textContent = processes.length === 0 ? 'No processes' :
                             processes.length === 1 ? '1 process' :
                             `${processes.length} processes`;
    }

    if (processes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-text">No Active GPU Processes</div>
                <div class="empty-state-subtext">Your GPUs are currently idle</div>
            </div>
        `;
        return;
    }

    container.innerHTML = processes.map(proc => `
        <div class="process-item">
            <div class="process-name">
                <strong>${proc.name}</strong>
                <span style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 0.5rem;">PID: ${proc.pid}</span>
            </div>
            <div class="process-memory">
                <span style="font-size: 1.1rem; font-weight: 700;">${formatMemory(proc.memory)}</span>
                <span style="color: var(--text-secondary); font-size: 0.8rem; margin-left: 0.25rem;">VRAM</span>
            </div>
        </div>
    `).join('');
}
