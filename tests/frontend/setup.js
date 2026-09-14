/**
 * Vitest setup for gpu-hot frontend tests.
 * Mocks browser globals and loads vanilla JS source files into global scope.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '../../static/js');

// ---------------------------------------------------------------------------
// Mock Chart.js
// ---------------------------------------------------------------------------

class MockChart {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this.data = config?.data || { datasets: [], labels: [] };
        this.options = config?.options || {};
    }
    update() {}
    destroy() {}
    resize() {}
}

globalThis.Chart = MockChart;

// ---------------------------------------------------------------------------
// Mock browser APIs
// ---------------------------------------------------------------------------

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// jsdom does not implement Canvas 2D; chart-manager uses getContext + createLinearGradient
function mockCanvas2DContext() {
    return {
        createLinearGradient() {
            return { addColorStop() {} };
        }
    };
}
HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (type === '2d') return mockCanvas2DContext();
    return null;
};

// ---------------------------------------------------------------------------
// Load source files in dependency order using vm.runInThisContext
// so that top-level declarations (const, function, var) land on globalThis.
// ---------------------------------------------------------------------------

const loadOrder = [
    'chart-config.js',
    'chart-manager.js',
    'gpu-cards.js',
    'ui.js',
];

for (const file of loadOrder) {
    const code = readFileSync(join(srcDir, file), 'utf-8');
    // Wrap in an IIFE that assigns all declarations to globalThis
    // Use vm.runInThisContext so `this` at the top level is globalThis
    const wrappedCode = `(function() { ${code}\n
        // Export all function declarations and variables to globalThis
        if (typeof SPARK !== 'undefined') globalThis.SPARK = SPARK;
        if (typeof SPARK_THRESHOLDS !== 'undefined') globalThis.SPARK_THRESHOLDS = SPARK_THRESHOLDS;
        if (typeof getBaseChartOptions !== 'undefined') globalThis.getBaseChartOptions = getBaseChartOptions;
        if (typeof createLineChartConfig !== 'undefined') globalThis.createLineChartConfig = createLineChartConfig;
        if (typeof createMultiLineChartConfig !== 'undefined') globalThis.createMultiLineChartConfig = createMultiLineChartConfig;
        if (typeof chartConfigs !== 'undefined') globalThis.chartConfigs = chartConfigs;
        if (typeof charts !== 'undefined') globalThis.charts = charts;
        if (typeof chartData !== 'undefined') globalThis.chartData = chartData;
        if (typeof initGPUData !== 'undefined') globalThis.initGPUData = initGPUData;
        if (typeof calculateStats !== 'undefined') globalThis.calculateStats = calculateStats;
        if (typeof updateChart !== 'undefined') globalThis.updateChart = updateChart;
        if (typeof updateChartStats !== 'undefined') globalThis.updateChartStats = updateChartStats;
        if (typeof initGPUCharts !== 'undefined') globalThis.initGPUCharts = initGPUCharts;
        if (typeof initOverviewMiniChart !== 'undefined') globalThis.initOverviewMiniChart = initOverviewMiniChart;
        if (typeof initAggregateChart !== 'undefined') globalThis.initAggregateChart = initAggregateChart;
        if (typeof isMobile !== 'undefined') globalThis.isMobile = isMobile;
        if (typeof formatMemory !== 'undefined') globalThis.formatMemory = formatMemory;
        if (typeof formatMemoryUnit !== 'undefined') globalThis.formatMemoryUnit = formatMemoryUnit;
        if (typeof formatEnergy !== 'undefined') globalThis.formatEnergy = formatEnergy;
        if (typeof getMetricValue !== 'undefined') globalThis.getMetricValue = getMetricValue;
        if (typeof hasMetric !== 'undefined') globalThis.hasMetric = hasMetric;
        if (typeof bulletClass !== 'undefined') globalThis.bulletClass = bulletClass;
        if (typeof createAggregateCard !== 'undefined') globalThis.createAggregateCard = createAggregateCard;
        if (typeof createCompactOverviewCard !== 'undefined') globalThis.createCompactOverviewCard = createCompactOverviewCard;
        if (typeof createEnhancedOverviewCard !== 'undefined') globalThis.createEnhancedOverviewCard = createEnhancedOverviewCard;
        if (typeof createGPUCard !== 'undefined') globalThis.createGPUCard = createGPUCard;
        if (typeof updateGPUDisplay !== 'undefined') globalThis.updateGPUDisplay = updateGPUDisplay;
        if (typeof updateEnhancedOverviewCard !== 'undefined') globalThis.updateEnhancedOverviewCard = updateEnhancedOverviewCard;
        if (typeof updateProcesses !== 'undefined') globalThis.updateProcesses = updateProcesses;
        if (typeof switchToView !== 'undefined') globalThis.switchToView = switchToView;
        if (typeof ensureGPUTab !== 'undefined') globalThis.ensureGPUTab = ensureGPUTab;
        if (typeof removeGPUTab !== 'undefined') globalThis.removeGPUTab = removeGPUTab;
        if (typeof autoSwitchSingleGPU !== 'undefined') globalThis.autoSwitchSingleGPU = autoSwitchSingleGPU;
        if (typeof toggleProcesses !== 'undefined') globalThis.toggleProcesses = toggleProcesses;
        if (typeof currentTab !== 'undefined') {
            Object.defineProperty(globalThis, 'currentTab', {
                get() { return currentTab; },
                set(v) { currentTab = v; },
                configurable: true
            });
        }
        if (typeof registeredGPUs !== 'undefined') {
            Object.defineProperty(globalThis, 'registeredGPUs', {
                get() { return registeredGPUs; },
                set(v) { registeredGPUs = v; },
                configurable: true
            });
        }
        if (typeof hasAutoSwitched !== 'undefined') {
            Object.defineProperty(globalThis, 'hasAutoSwitched', {
                get() { return hasAutoSwitched; },
                set(v) { hasAutoSwitched = v; },
                configurable: true
            });
        }
        if (typeof updatePCIeChartStats !== 'undefined') globalThis.updatePCIeChartStats = updatePCIeChartStats;
        if (typeof updateEncDecChartStats !== 'undefined') globalThis.updateEncDecChartStats = updateEncDecChartStats;
    })();`;
    vm.runInThisContext(wrappedCode, { filename: file });
}
