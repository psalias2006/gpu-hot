/**
 * GPU Hot - Export Functionality
 * Client-side export of GPU metrics to JSON, HTML, and Chart Images
 */

// Toggle export menu visibility
function toggleExportMenu() {
    const menu = document.getElementById('export-menu');
    const btn = document.getElementById('export-btn');

    menu.classList.toggle('hidden');
    btn.classList.toggle('active');

    // Close menu when clicking outside
    if (!menu.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', closeExportMenuOnOutsideClick);
        }, 100);
    } else {
        document.removeEventListener('click', closeExportMenuOnOutsideClick);
    }
}

function closeExportMenuOnOutsideClick(event) {
    const menu = document.getElementById('export-menu');
    const btn = document.getElementById('export-btn');
    const controls = document.querySelector('.export-controls');

    if (!controls.contains(event.target)) {
        menu.classList.add('hidden');
        btn.classList.remove('active');
        document.removeEventListener('click', closeExportMenuOnOutsideClick);
    }
}

// Export as JSON
function exportAsJSON() {
    try {
        const exportData = {
            metadata: {
                export_timestamp: new Date().toISOString(),
                export_format: 'json',
                application: 'GPU Hot',
                version: document.getElementById('version-current')?.textContent || 'unknown'
            },
            gpus: collectGPUData(),
            processes: collectProcessData(),
            system: collectSystemData(),
            historical_data: collectHistoricalData()
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `gpu-hot-export-${timestamp}.json`;

        downloadFile(jsonString, filename, 'application/json');
        closeExportMenu();

        console.log('JSON export completed:', filename);
    } catch (error) {
        console.error('Error exporting JSON:', error);
        alert('Error exporting JSON data. Check console for details.');
    }
}

// Export as HTML Report
async function exportAsHTML() {
    try {
        const exportData = {
            metadata: {
                export_timestamp: new Date().toISOString(),
                export_format: 'html',
                application: 'GPU Hot',
                version: document.getElementById('version-current')?.textContent || 'unknown'
            },
            gpus: collectGPUData(),
            processes: collectProcessData(),
            system: collectSystemData(),
            charts: await generateChartImages()
        };

        const htmlContent = generateHTMLReport(exportData);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `gpu-hot-report-${timestamp}.html`;

        downloadFile(htmlContent, filename, 'text/html');
        closeExportMenu();

        console.log('HTML export completed:', filename);
    } catch (error) {
        console.error('Error exporting HTML:', error);
        alert('Error exporting HTML report. Check console for details.');
    }
}

// Export Chart Images
async function exportChartImages() {
    try {
        const chartImages = await generateChartImages();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

        if (Object.keys(chartImages).length === 0) {
            alert('No charts available to export. Please wait for data to load.');
            return;
        }

        // Download each chart as a separate PNG file
        for (const [chartName, base64Image] of Object.entries(chartImages)) {
            // Convert base64 to blob
            const base64Data = base64Image.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gpu-hot-${chartName}-${timestamp}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Small delay between downloads to prevent browser blocking
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        closeExportMenu();
        console.log(`Chart export completed: ${Object.keys(chartImages).length} images downloaded`);
    } catch (error) {
        console.error('Error exporting charts:', error);
        alert('Error exporting chart images. Check console for details.');
    }
}

// Helper: Close export menu
function closeExportMenu() {
    const menu = document.getElementById('export-menu');
    const btn = document.getElementById('export-btn');
    menu.classList.add('hidden');
    btn.classList.remove('active');
    document.removeEventListener('click', closeExportMenuOnOutsideClick);
}

// Collect GPU data from DOM
function collectGPUData() {
    const gpus = {};

    // Get all GPU cards
    const gpuCards = document.querySelectorAll('.overview-gpu-card, .gpu-card');

    gpuCards.forEach((card, index) => {
        const gpuId = card.dataset.gpuId || `gpu-${index}`;
        const nodeName = card.dataset.nodeName || 'default';

        // Extract GPU name
        const nameElement = card.querySelector('.gpu-name, .gpu-model');
        const gpuName = nameElement?.textContent.trim() || 'Unknown GPU';

        // Extract metrics
        const metrics = {};

        // Utilization
        const utilizationElement = card.querySelector('[data-metric="utilization"]');
        if (utilizationElement) {
            metrics.utilization = parseFloat(utilizationElement.textContent) || 0;
        }

        // Memory
        const memoryElement = card.querySelector('[data-metric="memory"]');
        if (memoryElement) {
            metrics.memory_used = memoryElement.textContent.trim();
        }

        // Temperature
        const temperatureElement = card.querySelector('[data-metric="temperature"]');
        if (temperatureElement) {
            metrics.temperature = parseFloat(temperatureElement.textContent) || 0;
        }

        // Power
        const powerElement = card.querySelector('[data-metric="power"]');
        if (powerElement) {
            metrics.power_draw = powerElement.textContent.trim();
        }

        // Fan speed
        const fanElement = card.querySelector('[data-metric="fan"]');
        if (fanElement) {
            metrics.fan_speed = parseFloat(fanElement.textContent) || 0;
        }

        // Clocks
        const clockElement = card.querySelector('[data-metric="clock"]');
        if (clockElement) {
            metrics.gpu_clock = clockElement.textContent.trim();
        }

        gpus[gpuId] = {
            node_name: nodeName,
            name: gpuName,
            metrics: metrics
        };
    });

    return gpus;
}

// Collect process data from DOM
function collectProcessData() {
    const processes = [];

    const processRows = document.querySelectorAll('.process-row, .process-item');

    processRows.forEach((row) => {
        const process = {
            pid: row.querySelector('.process-pid')?.textContent.trim() || '',
            name: row.querySelector('.process-name')?.textContent.trim() || '',
            gpu_id: row.dataset.gpuId || '',
            memory: row.querySelector('.process-memory')?.textContent.trim() || '',
            gpu_utilization: row.querySelector('.process-utilization')?.textContent.trim() || ''
        };

        if (process.pid || process.name) {
            processes.push(process);
        }
    });

    return processes;
}

// Collect system data from DOM
function collectSystemData() {
    const system = {};

    // CPU usage
    const cpuElement = document.getElementById('cpu-usage');
    if (cpuElement) {
        system.cpu_usage = cpuElement.textContent.trim();
    }

    // Memory usage
    const memoryElement = document.getElementById('memory-usage');
    if (memoryElement) {
        system.memory_usage = memoryElement.textContent.trim();
    }

    // Connection status
    const connectionElement = document.getElementById('connection-status');
    if (connectionElement) {
        system.connection_status = connectionElement.textContent.trim();
    }

    // Process count
    const processCountElement = document.getElementById('process-count');
    if (processCountElement) {
        system.active_processes = processCountElement.textContent.trim();
    }

    return system;
}

// Collect historical chart data (60 second window)
function collectHistoricalData() {
    const historical = {};

    // Check if chartData is available globally
    if (typeof chartData !== 'undefined' && chartData) {
        // Copy the chart data structure
        Object.keys(chartData).forEach(key => {
            if (chartData[key] && Array.isArray(chartData[key])) {
                historical[key] = [...chartData[key]];
            }
        });
    }

    return historical;
}

// Generate chart images from Chart.js instances
async function generateChartImages() {
    const chartImages = {};

    // Check if charts object is available globally
    if (typeof charts === 'undefined' || !charts) {
        console.warn('Charts object not available for export');
        return chartImages;
    }

    // Export each chart as base64 PNG
    for (const [chartName, chartInstance] of Object.entries(charts)) {
        if (chartInstance && typeof chartInstance.toBase64Image === 'function') {
            try {
                const base64Image = chartInstance.toBase64Image('image/png', 1.0);
                chartImages[chartName] = base64Image;
            } catch (error) {
                console.warn(`Failed to export chart ${chartName}:`, error);
            }
        }
    }

    return chartImages;
}

// Generate HTML report
function generateHTMLReport(data) {
    const timestamp = new Date(data.metadata.export_timestamp).toLocaleString();

    let chartHTML = '';
    if (data.charts && Object.keys(data.charts).length > 0) {
        chartHTML = '<div class="charts-section"><h2>Performance Charts</h2><div class="charts-grid">';
        for (const [chartName, base64Image] of Object.entries(data.charts)) {
            chartHTML += `
                <div class="chart-item">
                    <h3>${formatChartName(chartName)}</h3>
                    <img src="${base64Image}" alt="${chartName}" style="max-width: 100%; height: auto; border-radius: 8px;">
                </div>
            `;
        }
        chartHTML += '</div></div>';
    }

    let gpuHTML = '';
    if (data.gpus && Object.keys(data.gpus).length > 0) {
        gpuHTML = '<div class="gpus-section"><h2>GPU Status</h2><table class="gpu-table"><thead><tr><th>GPU</th><th>Node</th><th>Utilization</th><th>Memory</th><th>Temperature</th><th>Power</th><th>Fan</th></tr></thead><tbody>';

        for (const [gpuId, gpu] of Object.entries(data.gpus)) {
            gpuHTML += `
                <tr>
                    <td>${gpu.name}</td>
                    <td>${gpu.node_name}</td>
                    <td>${gpu.metrics.utilization !== undefined ? gpu.metrics.utilization + '%' : 'N/A'}</td>
                    <td>${gpu.metrics.memory_used || 'N/A'}</td>
                    <td>${gpu.metrics.temperature !== undefined ? gpu.metrics.temperature + '°C' : 'N/A'}</td>
                    <td>${gpu.metrics.power_draw || 'N/A'}</td>
                    <td>${gpu.metrics.fan_speed !== undefined ? gpu.metrics.fan_speed + '%' : 'N/A'}</td>
                </tr>
            `;
        }

        gpuHTML += '</tbody></table></div>';
    }

    let processHTML = '';
    if (data.processes && data.processes.length > 0) {
        processHTML = '<div class="processes-section"><h2>Active Processes</h2><table class="process-table"><thead><tr><th>PID</th><th>Name</th><th>GPU</th><th>Memory</th><th>Utilization</th></tr></thead><tbody>';

        data.processes.forEach(process => {
            processHTML += `
                <tr>
                    <td>${process.pid}</td>
                    <td>${process.name}</td>
                    <td>${process.gpu_id}</td>
                    <td>${process.memory}</td>
                    <td>${process.gpu_utilization}</td>
                </tr>
            `;
        });

        processHTML += '</tbody></table></div>';
    }

    const systemHTML = `
        <div class="system-section">
            <h2>System Metrics</h2>
            <div class="system-grid">
                <div class="system-item"><strong>CPU Usage:</strong> ${data.system.cpu_usage || 'N/A'}</div>
                <div class="system-item"><strong>RAM Usage:</strong> ${data.system.memory_usage || 'N/A'}</div>
                <div class="system-item"><strong>Connection:</strong> ${data.system.connection_status || 'N/A'}</div>
                <div class="system-item"><strong>Active Processes:</strong> ${data.system.active_processes || 'N/A'}</div>
            </div>
        </div>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPU Hot Report - ${timestamp}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
            color: #ffffff;
            padding: 2rem;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .metadata {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        h2 {
            font-size: 1.5rem;
            margin: 2rem 0 1rem 0;
            color: #4facfe;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2rem;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            overflow: hidden;
        }

        thead {
            background: rgba(79, 172, 254, 0.15);
        }

        th, td {
            padding: 0.875rem 1rem;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        th {
            font-weight: 600;
            color: #4facfe;
            text-transform: uppercase;
            font-size: 0.85rem;
            letter-spacing: 0.5px;
        }

        tr:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .system-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .system-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }

        .chart-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .chart-item h3 {
            font-size: 1rem;
            margin-bottom: 0.75rem;
            color: rgba(255, 255, 255, 0.8);
        }

        @media print {
            body {
                background: white;
                color: black;
            }

            .container {
                background: white;
                box-shadow: none;
            }

            h1, h2, th {
                color: #1a73e8;
                -webkit-text-fill-color: #1a73e8;
            }

            table, .system-item, .chart-item {
                border: 1px solid #ddd;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔥 GPU Hot Report</h1>
        <div class="metadata">
            <div><strong>Generated:</strong> ${timestamp}</div>
            <div><strong>Application:</strong> ${data.metadata.application} v${data.metadata.version}</div>
        </div>

        ${systemHTML}
        ${gpuHTML}
        ${processHTML}
        ${chartHTML}

        <div class="footer" style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); text-align: center; color: rgba(255, 255, 255, 0.5); font-size: 0.85rem;">
            Generated by <a href="https://github.com/psalias2006/gpu-hot" style="color: #4facfe; text-decoration: none;">GPU Hot</a>
        </div>
    </div>
</body>
</html>`;

    return html;
}

// Format chart name for display
function formatChartName(chartName) {
    return chartName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/-/g, ' ')
        .trim();
}

// Download file helper
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
