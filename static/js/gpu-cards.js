/**
 * GPU Card creation and update functions
 */

// Create overview GPU card (compact view)
function createOverviewCard(gpuId, gpuInfo) {
    const memPercent = (gpuInfo.memory_used / gpuInfo.memory_total) * 100;

    return `
        <div class="overview-gpu-card" data-gpu-id="${gpuId}" onclick="switchToView('gpu-${gpuId}')" style="pointer-events: auto;">
            <div class="overview-header">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; background: var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 0.25rem;">
                        GPU ${gpuId}
                    </h2>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">${gpuInfo.name}</p>
                </div>
                <div class="gpu-status-badge">
                    <span class="status-dot"></span>
                    <span class="status-text">ONLINE</span>
                </div>
            </div>

            <div class="overview-metrics">
                <div class="overview-metric">
                    <div class="overview-metric-icon">⚡</div>
                    <div class="overview-metric-value" id="overview-util-${gpuId}">${gpuInfo.utilization}%</div>
                    <div class="overview-metric-label">GPU Usage</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-icon">🌡️</div>
                    <div class="overview-metric-value" id="overview-temp-${gpuId}">${gpuInfo.temperature}°C</div>
                    <div class="overview-metric-label">Temperature</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-icon">💾</div>
                    <div class="overview-metric-value" id="overview-mem-${gpuId}">${Math.round(memPercent)}%</div>
                    <div class="overview-metric-label">Memory</div>
                </div>
                <div class="overview-metric">
                    <div class="overview-metric-icon">⚡</div>
                    <div class="overview-metric-value" id="overview-power-${gpuId}">${gpuInfo.power_draw.toFixed(0)}W</div>
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

// Update overview card
function updateOverviewCard(gpuId, gpuInfo) {
    const memPercent = (gpuInfo.memory_used / gpuInfo.memory_total) * 100;

    const utilEl = document.getElementById(`overview-util-${gpuId}`);
    const tempEl = document.getElementById(`overview-temp-${gpuId}`);
    const memEl = document.getElementById(`overview-mem-${gpuId}`);
    const powerEl = document.getElementById(`overview-power-${gpuId}`);

    if (utilEl) utilEl.textContent = `${gpuInfo.utilization}%`;
    if (tempEl) tempEl.textContent = `${gpuInfo.temperature}°C`;
    if (memEl) memEl.textContent = `${Math.round(memPercent)}%`;
    if (powerEl) powerEl.textContent = `${gpuInfo.power_draw.toFixed(0)}W`;

    // Update chart data for the mini chart
    updateChart(gpuId, 'utilization', Number(gpuInfo.utilization) || 0);

    // Update mini chart
    if (charts[gpuId] && charts[gpuId].overviewMini) {
        charts[gpuId].overviewMini.update('none');
    }
}

// Create detailed GPU card HTML (for individual tabs)
function createGPUCard(gpuId, gpuInfo) {
    const memPercent = (gpuInfo.memory_used / gpuInfo.memory_total) * 100;
    const powerPercent = (gpuInfo.power_draw / gpuInfo.power_limit) * 100;

    return `
        <div class="gpu-card" id="gpu-${gpuId}">
            <div class="gpu-header-enhanced">
                <div class="gpu-icon-container">
                    <div class="gpu-icon">🎮</div>
                    <div class="gpu-icon-glow"></div>
                </div>
                <div class="gpu-info-section">
                    <div class="gpu-title-large">GPU ${gpuId}</div>
                    <div class="gpu-name">${gpuInfo.name}</div>
                    <div class="gpu-specs">
                        <span class="spec-item">
                            <span class="spec-icon">🔥</span>
                            <span id="fan-${gpuId}">${gpuInfo.fan_speed}%</span> Fan
                        </span>
                        <span class="spec-item">
                            <span class="spec-icon">⚙️</span>
                            <span id="pstate-header-${gpuId}">${gpuInfo.performance_state || 'N/A'}</span>
                        </span>
                        <span class="spec-item">
                            <span class="spec-icon">🔗</span>
                            PCIe Gen <span id="pcie-header-${gpuId}">${gpuInfo.pcie_gen || 'N/A'}</span>
                        </span>
                        <span class="spec-item">
                            <span class="spec-icon">💿</span>
                            Driver ${gpuInfo.driver_version || 'N/A'}
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
                        <span class="metric-icon">⚡</span>
                        <span class="metric-label">GPU Utilization</span>
                    </div>
                    <div class="circular-progress-container">
                        <svg class="circular-progress" viewBox="0 0 120 120">
                            <defs>
                                <linearGradient id="util-gradient-${gpuId}" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
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
                        <span class="metric-icon">🌡️</span>
                        <span class="metric-label">Temperature</span>
                    </div>
                    <div class="temp-display">
                        <div class="metric-value-large" id="temp-${gpuId}">${gpuInfo.temperature}°C</div>
                        <div class="temp-gauge"></div>
                        <div class="temp-status" id="temp-status-${gpuId}">
                            ${gpuInfo.temperature < 60 ? '❄️ Cool' : gpuInfo.temperature < 75 ? '🌤️ Normal' : '🔥 Warm'}
                        </div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">💾</span>
                        <span class="metric-label">Memory Usage</span>
                    </div>
                    <div class="metric-value-large" id="mem-${gpuId}">${Math.round(gpuInfo.memory_used)}MB</div>
                    <div class="metric-sublabel" id="mem-total-${gpuId}">of ${Math.round(gpuInfo.memory_total)}MB</div>
                    <div class="progress-bar">
                        <div class="progress-fill mem-bar" id="mem-bar-${gpuId}" style="width: ${memPercent}%"></div>
                    </div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">⚡</span>
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
                        <span class="metric-icon">🔧</span>
                        <span class="metric-label">Graphics Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-gr-${gpuId}">${gpuInfo.clock_graphics || 0}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">💿</span>
                        <span class="metric-label">Memory Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-mem-${gpuId}">${gpuInfo.clock_memory || 0}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🎯</span>
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
                        <span class="metric-icon">🔗</span>
                        <span class="metric-label">PCIe Link</span>
                    </div>
                    <div class="metric-value-large" id="pcie-${gpuId}">Gen ${gpuInfo.pcie_gen || 'N/A'}</div>
                    <div class="metric-sublabel">x${gpuInfo.pcie_width || 'N/A'} lanes</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">⚙️</span>
                        <span class="metric-label">Performance State</span>
                    </div>
                    <div class="metric-value-large" id="pstate-${gpuId}">${gpuInfo.performance_state || 'N/A'}</div>
                    <div class="metric-sublabel">Power Mode</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🎬</span>
                        <span class="metric-label">Encoder Sessions</span>
                    </div>
                    <div class="metric-value-large" id="encoder-${gpuId}">${gpuInfo.encoder_sessions || 0}</div>
                    <div class="metric-sublabel">${(gpuInfo.encoder_fps || 0).toFixed(1)} FPS avg</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">⏱️</span>
                        <span class="metric-label">SM Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-sm-${gpuId}">${gpuInfo.clock_sm || 0}</div>
                    <div class="metric-sublabel">MHz / ${gpuInfo.clock_max_sm || 0} Max</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🌡️</span>
                        <span class="metric-label">Memory Temp</span>
                    </div>
                    <div class="metric-value-large" id="temp-mem-${gpuId}">${gpuInfo.temperature_memory || 0}°C</div>
                    <div class="metric-sublabel">VRAM Temperature</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">💿</span>
                        <span class="metric-label">Free Memory</span>
                    </div>
                    <div class="metric-value-large" id="mem-free-${gpuId}">${Math.round(gpuInfo.memory_free || 0)}MB</div>
                    <div class="metric-sublabel">Available VRAM</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">📹</span>
                        <span class="metric-label">Decoder Sessions</span>
                    </div>
                    <div class="metric-value-large" id="decoder-${gpuId}">${gpuInfo.decoder_sessions || 0}</div>
                    <div class="metric-sublabel">${(gpuInfo.decoder_fps || 0).toFixed(1)} FPS avg</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🎥</span>
                        <span class="metric-label">Video Clock</span>
                    </div>
                    <div class="metric-value-large" id="clock-video-${gpuId}">${gpuInfo.clock_video || 0}</div>
                    <div class="metric-sublabel">MHz</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">📊</span>
                        <span class="metric-label">Compute Mode</span>
                    </div>
                    <div class="metric-value-large" id="compute-mode-${gpuId}" style="font-size: 1.5rem;">${gpuInfo.compute_mode || 'N/A'}</div>
                    <div class="metric-sublabel">Execution Mode</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🔌</span>
                        <span class="metric-label">Max PCIe</span>
                    </div>
                    <div class="metric-value-large" id="pcie-max-${gpuId}">Gen ${gpuInfo.pcie_gen_max || 'N/A'}</div>
                    <div class="metric-sublabel">x${gpuInfo.pcie_width_max || 'N/A'} Max</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">🚨</span>
                        <span class="metric-label">Throttle Status</span>
                    </div>
                    <div class="metric-value-large" id="throttle-${gpuId}" style="font-size: 1.2rem;">${gpuInfo.throttle_reasons === 'Active' || gpuInfo.throttle_reasons !== 'None' ? '⚠️ Active' : '✅ None'}</div>
                    <div class="metric-sublabel">Performance</div>
                </div>
            </div>

            <div class="charts-section">
                <div class="chart-container">
                    <div class="chart-header">
                        <div class="chart-title">📊 GPU Utilization History</div>
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
                    <div class="chart-header">
                        <div class="chart-title">🌡️ GPU Temperature History</div>
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
                    <div class="chart-header">
                        <div class="chart-title">💾 Memory Usage History</div>
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
                    <div class="chart-header">
                        <div class="chart-title">⚡ Power Draw History</div>
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
            </div>
        </div>
    `;
}

// Update GPU display
function updateGPUDisplay(gpuId, gpuInfo) {
    // Update metric values
    const utilEl = document.getElementById(`util-${gpuId}`);
    const tempEl = document.getElementById(`temp-${gpuId}`);
    const memEl = document.getElementById(`mem-${gpuId}`);
    const powerEl = document.getElementById(`power-${gpuId}`);
    const fanEl = document.getElementById(`fan-${gpuId}`);

    if (utilEl) utilEl.textContent = `${gpuInfo.utilization}%`;
    if (tempEl) tempEl.textContent = `${gpuInfo.temperature}°C`;
    if (memEl) memEl.textContent = `${Math.round(gpuInfo.memory_used)}MB`;
    if (powerEl) powerEl.textContent = `${gpuInfo.power_draw.toFixed(1)}W`;
    if (fanEl) fanEl.textContent = `${gpuInfo.fan_speed}%`;

    // Update temperature status
    const tempStatus = document.getElementById(`temp-status-${gpuId}`);
    if (tempStatus) {
        if (gpuInfo.temperature < 60) {
            tempStatus.textContent = '❄️ Cool';
        } else if (gpuInfo.temperature < 75) {
            tempStatus.textContent = '🌤️ Normal';
        } else {
            tempStatus.textContent = '🔥 Warm';
        }
    }

    // Update circular gauge
    const utilRing = document.getElementById(`util-ring-${gpuId}`);
    const utilText = document.getElementById(`util-text-${gpuId}`);
    if (utilRing) {
        const offset = 314 - (314 * gpuInfo.utilization / 100);
        utilRing.style.strokeDashoffset = offset;
    }
    if (utilText) utilText.textContent = `${gpuInfo.utilization}%`;

    // Update progress bars
    const utilBar = document.getElementById(`util-bar-${gpuId}`);
    const memBar = document.getElementById(`mem-bar-${gpuId}`);
    const powerBar = document.getElementById(`power-bar-${gpuId}`);

    const memPercent = (gpuInfo.memory_used / gpuInfo.memory_total) * 100;
    const powerPercent = (gpuInfo.power_draw / gpuInfo.power_limit) * 100;

    if (utilBar) utilBar.style.width = `${gpuInfo.utilization}%`;
    if (memBar) memBar.style.width = `${memPercent}%`;
    if (powerBar) powerBar.style.width = `${powerPercent}%`;

    // Update new metrics
    const clockGrEl = document.getElementById(`clock-gr-${gpuId}`);
    const clockMemEl = document.getElementById(`clock-mem-${gpuId}`);
    const clockSmEl = document.getElementById(`clock-sm-${gpuId}`);
    const memUtilEl = document.getElementById(`mem-util-${gpuId}`);
    const memUtilBar = document.getElementById(`mem-util-bar-${gpuId}`);
    const pcieEl = document.getElementById(`pcie-${gpuId}`);
    const pstateEl = document.getElementById(`pstate-${gpuId}`);
    const encoderEl = document.getElementById(`encoder-${gpuId}`);

    if (clockGrEl) clockGrEl.textContent = `${gpuInfo.clock_graphics || 0}`;
    if (clockMemEl) clockMemEl.textContent = `${gpuInfo.clock_memory || 0}`;
    if (clockSmEl) clockSmEl.textContent = `${gpuInfo.clock_sm || 0}`;
    if (memUtilEl) memUtilEl.textContent = `${gpuInfo.memory_utilization || 0}%`;
    if (memUtilBar) memUtilBar.style.width = `${gpuInfo.memory_utilization || 0}%`;
    if (pcieEl) pcieEl.textContent = `Gen ${gpuInfo.pcie_gen || 'N/A'}`;
    if (pstateEl) pstateEl.textContent = `${gpuInfo.performance_state || 'N/A'}`;
    if (encoderEl) encoderEl.textContent = `${gpuInfo.encoder_sessions || 0}`;

    // Update header badges
    const pstateHeaderEl = document.getElementById(`pstate-header-${gpuId}`);
    const pcieHeaderEl = document.getElementById(`pcie-header-${gpuId}`);
    if (pstateHeaderEl) pstateHeaderEl.textContent = `${gpuInfo.performance_state || 'N/A'}`;
    if (pcieHeaderEl) pcieHeaderEl.textContent = `${gpuInfo.pcie_gen || 'N/A'}`;

    // Update new advanced metrics
    const tempMemEl = document.getElementById(`temp-mem-${gpuId}`);
    const memFreeEl = document.getElementById(`mem-free-${gpuId}`);
    const decoderEl = document.getElementById(`decoder-${gpuId}`);
    const clockVideoEl = document.getElementById(`clock-video-${gpuId}`);
    const computeModeEl = document.getElementById(`compute-mode-${gpuId}`);
    const pcieMaxEl = document.getElementById(`pcie-max-${gpuId}`);
    const throttleEl = document.getElementById(`throttle-${gpuId}`);

    if (tempMemEl) tempMemEl.textContent = `${gpuInfo.temperature_memory || 0}°C`;
    if (memFreeEl) memFreeEl.textContent = `${Math.round(gpuInfo.memory_free || 0)}MB`;
    if (decoderEl) decoderEl.textContent = `${gpuInfo.decoder_sessions || 0}`;
    if (clockVideoEl) clockVideoEl.textContent = `${gpuInfo.clock_video || 0}`;
    if (computeModeEl) computeModeEl.textContent = `${gpuInfo.compute_mode || 'N/A'}`;
    if (pcieMaxEl) pcieMaxEl.textContent = `Gen ${gpuInfo.pcie_gen_max || 'N/A'}`;
    if (throttleEl) {
        const isThrottling = gpuInfo.throttle_reasons && gpuInfo.throttle_reasons !== 'None' && gpuInfo.throttle_reasons !== '[N/A]';
        throttleEl.textContent = isThrottling ? '⚠️ Active' : '✅ None';
    }

    // Update charts
    updateChart(gpuId, 'utilization', gpuInfo.utilization);
    updateChart(gpuId, 'temperature', gpuInfo.temperature);
    updateChart(gpuId, 'memory', memPercent);
    updateChart(gpuId, 'power', gpuInfo.power_draw);

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
                <div class="empty-state-icon">💤</div>
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
                <span style="font-size: 1.1rem; font-weight: 700;">${Math.round(proc.memory)}MB</span>
                <span style="color: var(--text-secondary); font-size: 0.8rem; margin-left: 0.25rem;">VRAM</span>
            </div>
        </div>
    `).join('');
}
