/**
 * Tests for static/js/gpu-cards.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Helper functions are loaded into global scope by setup.js

describe('formatMemory', () => {
    it('returns GB for values >= 1024', () => {
        expect(formatMemory(2048)).toBe('2.0');
    });

    it('returns MB for values < 1024', () => {
        expect(formatMemory(512)).toBe('512');
    });

    it('handles exactly 1024', () => {
        expect(formatMemory(1024)).toBe('1.0');
    });

    it('handles zero', () => {
        expect(formatMemory(0)).toBe('0');
    });

    it('handles fractional GB', () => {
        expect(formatMemory(1536)).toBe('1.5');
    });
});

describe('formatMemoryUnit', () => {
    it('returns GB for >= 1024', () => {
        expect(formatMemoryUnit(2048)).toBe('GB');
    });

    it('returns MB for < 1024', () => {
        expect(formatMemoryUnit(512)).toBe('MB');
    });

    it('returns GB for exactly 1024', () => {
        expect(formatMemoryUnit(1024)).toBe('GB');
    });
});

describe('formatEnergy', () => {
    it('returns Wh for small values', () => {
        expect(formatEnergy(500)).toBe('500.00Wh');
    });

    it('returns kWh for values >= 1000', () => {
        expect(formatEnergy(1500)).toBe('1.50kWh');
    });

    it('returns kWh for exactly 1000', () => {
        expect(formatEnergy(1000)).toBe('1.00kWh');
    });

    it('handles zero', () => {
        expect(formatEnergy(0)).toBe('0.00Wh');
    });
});

describe('getMetricValue', () => {
    it('returns value when key exists', () => {
        expect(getMetricValue({ temp: 72 }, 'temp')).toBe(72);
    });

    it('returns default when key missing', () => {
        expect(getMetricValue({}, 'temp')).toBe(0);
    });

    it('returns default when value is null', () => {
        expect(getMetricValue({ temp: null }, 'temp')).toBe(0);
    });

    it('returns default when value is undefined', () => {
        expect(getMetricValue({ temp: undefined }, 'temp')).toBe(0);
    });

    it('returns custom default', () => {
        expect(getMetricValue({}, 'temp', -1)).toBe(-1);
    });

    it('returns zero when value is zero', () => {
        expect(getMetricValue({ temp: 0 }, 'temp', 99)).toBe(0);
    });

    it('uses the numeric default when a metric is not numeric', () => {
        expect(getMetricValue({ temp: '<img src=x>' }, 'temp', 7)).toBe(7);
    });
});

describe('hasMetric', () => {
    it('returns true for numeric value', () => {
        expect(hasMetric({ temp: 72 }, 'temp')).toBe(true);
    });

    it('returns true for zero', () => {
        expect(hasMetric({ temp: 0 }, 'temp')).toBe(true);
    });

    it('returns false for N/A', () => {
        expect(hasMetric({ temp: 'N/A' }, 'temp')).toBe(false);
    });

    it('returns false for Unknown', () => {
        expect(hasMetric({ arch: 'Unknown' }, 'arch')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(hasMetric({ name: '' }, 'name')).toBe(false);
    });

    it('returns false for null', () => {
        expect(hasMetric({ temp: null }, 'temp')).toBe(false);
    });

    it('returns false for undefined key', () => {
        expect(hasMetric({}, 'temp')).toBe(false);
    });
});

describe('bulletClass', () => {
    it('returns empty for normal value', () => {
        expect(bulletClass(50, 80, 95)).toBe('');
    });

    it('returns warning at warn threshold', () => {
        expect(bulletClass(80, 80, 95)).toBe('warning');
    });

    it('returns warning between thresholds', () => {
        expect(bulletClass(90, 80, 95)).toBe('warning');
    });

    it('returns danger at danger threshold', () => {
        expect(bulletClass(95, 80, 95)).toBe('danger');
    });

    it('returns danger above danger threshold', () => {
        expect(bulletClass(100, 80, 95)).toBe('danger');
    });
});

describe('createAggregateCard', () => {
    it('returns HTML with aggregate card structure', () => {
        const html = createAggregateCard();
        expect(html).toContain('aggregate-card');
        expect(html).toContain('Total VRAM');
        expect(html).toContain('agg-vram-value');
        expect(html).toContain('agg-vram-bar');
    });
});

describe('createEnhancedOverviewCard', () => {
    const gpuInfo = {
        name: 'NVIDIA RTX 3090',
        utilization: 75,
        temperature: 72,
        memory_used: 8192,
        memory_total: 24576,
        power_draw: 250,
        power_limit: 350,
        fan_speed: 65,
        clock_graphics: 1800,
        performance_state: 'P0',
        driver_version: '535.129.03',
        architecture: 'Ampere'
    };

    it('returns a card with the GPU name', () => {
        const html = createEnhancedOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('RTX 3090');
    });

    it('includes metric elements', () => {
        const html = createEnhancedOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('1800 MHz');
    });
});

describe('updateProcesses', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="processes-container"></div>
            <span id="process-count"></span>
        `;
    });

    it('renders processes', () => {
        const processes = [
            { name: 'python3', pid: '1234', memory: 4096, gpu_id: '0' },
            { name: 'blender', pid: '5678', memory: 2048, gpu_id: '0' }
        ];
        updateProcesses(processes);
        const container = document.getElementById('processes-container');
        expect(container.innerHTML).toContain('python3');
        expect(container.innerHTML).toContain('blender');
    });

    it('renders process names and identifiers as text', () => {
        const hostile = '<img src=x onerror="window.__processXss=1">';
        updateProcesses([{ name: hostile, pid: hostile, memory: hostile }]);
        const container = document.getElementById('processes-container');

        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.process-name').textContent).toBe(hostile);
        expect(container.querySelector('.process-pid').textContent).toBe(hostile);
        expect(container.querySelector('.process-memory').textContent).toBe('Not reported');
    });

    it('handles empty process list', () => {
        updateProcesses([]);
        const container = document.getElementById('processes-container');
        expect(container.innerHTML).toContain('No active GPU processes');
    });
});

describe('createCompactOverviewCard', () => {
    const gpuInfo = {
        name: 'NVIDIA RTX 3090',
        utilization: 75,
        temperature: 72,
        memory_used: 8192,
        memory_total: 24576,
        power_draw: 250,
        power_limit: 350,
    };

    it('returns a card with the GPU name', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('RTX 3090');
    });

    it('includes overview-gpu-card class', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('overview-gpu-card');
    });

    it('includes compact metric elements with overview- IDs', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('overview-util-0');
        expect(html).toContain('overview-temp-0');
        expect(html).toContain('overview-mem-0');
        expect(html).toContain('overview-power-0');
    });

    it('shows utilization percentage', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('75%');
    });

    it('shows temperature with degree symbol', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('72°');
    });

    it('shows memory as percentage', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        // 8192/24576 = 33.3%
        expect(html).toContain('33%');
    });

    it('shows power in watts', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('250W');
    });

    it('includes mini chart canvas', () => {
        const html = createCompactOverviewCard('0', gpuInfo).outerHTML;
        expect(html).toContain('overview-chart-0');
        expect(html).toContain('<canvas');
    });

    it('uses an event listener instead of an inline click handler', () => {
        const card = createCompactOverviewCard('2', gpuInfo);
        expect(card.hasAttribute('onclick')).toBe(false);
    });
});

describe('collector text rendering', () => {
    const hostileText = '<img src=x onerror="window.__collectorTextExecuted=1">';
    const gpuInfo = {
        name: 'Test GPU',
        utilization: 1,
        temperature: 1,
        memory_used: 1,
        memory_total: 1024,
        power_draw: 1,
        power_limit: 100,
        fan_speed: 1
    };

    it.each([
        ['compact overview', 'uuid', createCompactOverviewCard],
        ['single-GPU overview', 'uuid', createEnhancedOverviewCard],
        ['single-GPU overview', 'performance_state', createEnhancedOverviewCard],
        ['single-GPU overview', 'driver_version', createEnhancedOverviewCard],
        ['single-GPU overview', 'architecture', createEnhancedOverviewCard],
        ['detail card', 'performance_state', createGPUCard],
        ['detail card', 'driver_version', createGPUCard],
        ['detail card', 'architecture', createGPUCard],
        ['detail card', 'throttle_reasons', createGPUCard]
    ])('%s renders hostile %s as text', (_cardType, field, markupFactory) => {
        const container = document.createElement('div');
        container.appendChild(markupFactory('0', { ...gpuInfo, [field]: hostileText }));

        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain(hostileText);
        if (field === 'uuid') {
            expect(container.querySelector('[title]').title).toBe(hostileText);
        }
    });

    it('renders GPU names as text in every card factory', () => {
        for (const factory of [createCompactOverviewCard, createEnhancedOverviewCard, createGPUCard]) {
            const card = factory('0', { ...gpuInfo, name: hostileText });
            expect(card.querySelector('img')).toBeNull();
            expect(card.textContent).toContain(hostileText);
        }
    });

    it('rejects non-numeric markup from every numeric-looking collector field', () => {
        const fields = [
            'brand', 'pcie_gen', 'pcie_width', 'pcie_gen_max', 'pcie_width_max',
            'clock_sm_max', 'clock_graphics', 'clock_memory', 'clock_sm', 'clock_video',
            'memory_utilization', 'temperature_memory', 'decoder_sessions',
            'encoder_sessions', 'encoder_utilization', 'decoder_utilization'
        ];
        const hostileInfo = { ...gpuInfo };
        fields.forEach(field => { hostileInfo[field] = hostileText; });

        const cards = [
            createEnhancedOverviewCard('0', hostileInfo),
            createGPUCard('0', hostileInfo)
        ];
        cards.forEach(card => {
            expect(card.querySelector('img')).toBeNull();
            expect(card.innerHTML).not.toContain(hostileText);
            expect(card.textContent).toContain('Not reported');
        });
    });

    it.each([
        ['object with a non-callable toString', JSON.parse('{"toString":"bad"}')],
        ['array', [12]],
        ['boolean', true],
        ['nested object', { value: { amount: 12 } }]
    ])('keeps rendering when a numeric field contains a %s', (_name, badValue) => {
        const data = {
            ...gpuInfo,
            utilization: badValue,
            memory_used: badValue,
            power_draw: badValue,
            fan_speed: badValue,
            clock_graphics: badValue,
            pcie_gen: badValue,
            energy_consumption_wh: badValue
        };
        const cards = [
            createCompactOverviewCard('0', data),
            createEnhancedOverviewCard('0', data),
            createGPUCard('0', data)
        ];

        cards.forEach(card => expect(card).toBeInstanceOf(Element));
        expect(cards[1].textContent).toContain('Not reported');
        expect(cards[2].querySelector('#clock-gr-0').textContent).toBe('Not reported');
        expect(getMetricValue({ metric: badValue }, 'metric', 7)).toBe(7);
    });

    it.each([
        ['compact overview', createCompactOverviewCard],
        ['single-GPU overview', createEnhancedOverviewCard],
        ['detail card', createGPUCard]
    ])('keeps an untrusted GPU identifier inside text and attributes for %s', (_cardType, factory) => {
        const hostileId = '0"><img src=x onerror="window.__idXss=1">';
        const card = factory(hostileId, gpuInfo);

        expect(card.querySelector('img')).toBeNull();
        expect(card.id || card.dataset.gpuId).toContain(hostileId);
        expect(card.querySelector('[class*="gpu-detail-title"], h2').textContent).toBe(`GPU ${hostileId}`);
        expect(card.hasAttribute('onclick')).toBe(false);
    });
});
