/**
 * Tests for static/js/socket-handlers.js
 *
 * This file auto-executes connectWebSocket() on load, so we must
 * mock WebSocket and DOM elements BEFORE loading it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, '../../static/js/socket-handlers.js');
const sourceCode = readFileSync(srcPath, 'utf-8');

function loadSocketHandlers(locationOverride) {
    // Reset globals that socket-handlers.js defines
    globalThis.socket = null;
    globalThis.reconnectInterval = null;
    globalThis.reconnectAttempts = 0;

    // Mock WebSocket constructor
    const mockInstances = [];
    globalThis.WebSocket = class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        constructor(url) {
            this.url = url;
            this.readyState = MockWebSocket.CONNECTING;
            this.onopen = null;
            this.onmessage = null;
            this.onclose = null;
            this.onerror = null;
            mockInstances.push(this);
        }
        send() {}
        close() { this.readyState = MockWebSocket.CLOSED; }
    };
    globalThis.WebSocket.CONNECTING = 0;
    globalThis.WebSocket.OPEN = 1;

    // Mock DOM elements
    document.body.innerHTML = `
        <span id="connection-status">Disconnected</span>
        <span id="status-dot"></span>
    `;

    const defaultLoc = { protocol: 'http:', host: 'localhost:1312', reload: vi.fn() };
    const loc = { ...defaultLoc, ...locationOverride };
    if (!locationOverride?.reload) loc.reload = vi.fn();
    Object.defineProperty(window, 'location', {
        value: loc,
        writable: true,
        configurable: true
    });

    // Load the source and export to globalThis
    const wrappedCode = `(function() { ${sourceCode}\n
        globalThis.socket = socket;
        globalThis.reconnectInterval = reconnectInterval;
        Object.defineProperty(globalThis, 'reconnectAttempts', {
            get() { return reconnectAttempts; },
            set(v) { reconnectAttempts = v; },
            configurable: true
        });
        globalThis.createWebSocketConnection = createWebSocketConnection;
        globalThis.connectWebSocket = connectWebSocket;
        globalThis.setupWebSocketHandlers = setupWebSocketHandlers;
        globalThis.handleSocketOpen = handleSocketOpen;
        globalThis.handleSocketClose = handleSocketClose;
        globalThis.handleSocketError = handleSocketError;
        globalThis.attemptReconnect = attemptReconnect;
        globalThis.findDataElement = findDataElement;
        globalThis.createNodeGroup = createNodeGroup;
        globalThis.createClusterGPUCard = createClusterGPUCard;
        globalThis.handleSocketMessage = handleSocketMessage;
        globalThis.handleClusterData = handleClusterData;
        globalThis.MAX_RECONNECT_ATTEMPTS = MAX_RECONNECT_ATTEMPTS;
        globalThis.RECONNECT_DELAY = RECONNECT_DELAY;
    })();`;
    vm.runInThisContext(wrappedCode, { filename: 'socket-handlers.js' });

    return mockInstances;
}

describe('createWebSocketConnection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        global.clearInterval(global.reconnectInterval);
    });

    it('uses ws: protocol for http', () => {
        const instances = loadSocketHandlers({
            protocol: 'http:',
            host: 'localhost:1312'
        });
        expect(instances.length).toBeGreaterThan(0);
        expect(instances[0].url).toBe('ws://localhost:1312/socket.io/');
    });

    it('uses wss: protocol for https', () => {
        const instances = loadSocketHandlers({
            protocol: 'https:',
            host: 'secure.example.com'
        });
        expect(instances[0].url).toBe('wss://secure.example.com/socket.io/');
    });
});

describe('untrusted hub identity rendering', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        globalThis.switchToView = vi.fn();
    });
    afterEach(() => {
        vi.useRealTimers();
        global.clearInterval(global.reconnectInterval);
    });

    it('renders node, GPU name, and UUID as text without inline handlers', () => {
        loadSocketHandlers();
        const hostile = '<img src=x onerror="window.__hubXss=1">';
        const container = document.createElement('div');
        const group = createNodeGroup(container, hostile, hostile);
        const card = createClusterGPUCard(hostile, '0', {
            name: hostile,
            uuid: hostile,
            utilization: 1,
            temperature: 2,
            memory_used: 3,
            memory_total: 4,
            power_draw: 5
        });
        group.querySelector('.node-grid').appendChild(card);

        expect(container.querySelector('img')).toBeNull();
        expect(group.querySelector('.node-label').textContent).toBe(hostile);
        expect(card.querySelector('.overview-gpu-name p').textContent).toBe(hostile);
        expect(card.querySelector('.gpu-uuid').textContent).toBe(hostile);
        expect(card.hasAttribute('onclick')).toBe(false);
        card.click();
        expect(switchToView).toHaveBeenCalledWith(`gpu-${hostile}-0`);
    });

    it('finds a node whose name contains selector syntax', () => {
        loadSocketHandlers();
        const container = document.createElement('div');
        const name = 'node"] .other';
        const group = createNodeGroup(container, name, name);

        expect(findDataElement(container, '.node-group', 'node', name)).toBe(group);
    });

    it('reuses a local card when its GPU id contains selector syntax', () => {
        loadSocketHandlers();
        document.body.innerHTML = '<div id="overview-container"></div>';
        const id = 'gpu"x';
        const data = { gpus: { [id]: { name: 'GPU', utilization: 10, temperature: 30,
            memory_used: 1, memory_total: 2, power_draw: 10, power_limit: 20 } } };

        handleSocketMessage({ data: JSON.stringify(data) });
        handleSocketMessage({ data: JSON.stringify(data) });

        expect(document.querySelectorAll('.single-gpu-overview')).toHaveLength(1);
        expect(document.querySelector('.single-gpu-overview').dataset.gpuId).toBe(id);
    });

    it('reuses a hub node when its name contains selector syntax', () => {
        loadSocketHandlers();
        document.body.innerHTML = '<div id="overview-container"></div>';
        const name = 'node"x';
        const gpuInfo = { name: 'GPU', utilization: 10, temperature: 30,
            memory_used: 1, memory_total: 2, power_draw: 10, power_limit: 20 };

        handleClusterData({ nodes: { [name]: { status: 'online', gpus: { 0: gpuInfo } } } });
        handleClusterData({ nodes: { [name]: { status: 'online', gpus: { 0: gpuInfo } } } });

        expect(document.querySelectorAll('.node-group')).toHaveLength(1);
        expect(document.querySelector('.node-group').dataset.node).toBe(name);
    });

    it('reuses a hub card when its full GPU id contains selector syntax', () => {
        loadSocketHandlers();
        document.body.innerHTML = '<div id="overview-container"></div>';
        const name = 'node"x';
        const gpuInfo = { name: 'GPU', utilization: 10, temperature: 30,
            memory_used: 1, memory_total: 2, power_draw: 10, power_limit: 20 };

        handleClusterData({ nodes: { [name]: { status: 'online', gpus: { 0: gpuInfo } } } });
        handleClusterData({ nodes: { [name]: { status: 'online', gpus: { 0: gpuInfo } } } });

        expect(document.querySelectorAll('.overview-gpu-card')).toHaveLength(1);
        expect(document.querySelector('.overview-gpu-card').dataset.gpuId).toBe(`${name}-0`);
    });
});

describe('handleSocketOpen', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => {
        vi.useRealTimers();
        global.clearInterval(global.reconnectInterval);
    });

    it('resets reconnect attempts', () => {
        loadSocketHandlers();
        global.reconnectAttempts = 5;
        // Simulate open
        handleSocketOpen();
        expect(global.reconnectAttempts).toBe(0);
    });

    it('updates status text', () => {
        loadSocketHandlers();
        handleSocketOpen();
        const status = document.getElementById('connection-status');
        expect(status.textContent).toBe('Connected');
    });
});

describe('handleSocketClose', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => {
        vi.useRealTimers();
        global.clearInterval(global.reconnectInterval);
    });

    it('updates status to reconnecting', () => {
        loadSocketHandlers();
        handleSocketClose();
        const status = document.getElementById('connection-status');
        expect(status.textContent).toBe('Reconnecting...');
    });
});

describe('attemptReconnect', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => {
        vi.useRealTimers();
        global.clearInterval(global.reconnectInterval);
    });

    it('stops after max attempts', () => {
        loadSocketHandlers();
        global.reconnectAttempts = 0;
        global.reconnectInterval = null;

        attemptReconnect();
        // Advance time to exhaust all 10 attempts
        for (let i = 0; i < 11; i++) {
            vi.advanceTimersByTime(2000);
        }

        const status = document.getElementById('connection-status');
        expect(status.textContent).toBe('Disconnected');
    });

    it('does not duplicate reconnect intervals', () => {
        loadSocketHandlers();
        global.reconnectInterval = null;
        attemptReconnect();
        const first = global.reconnectInterval;
        attemptReconnect(); // Should be a no-op
        expect(global.reconnectInterval).toBe(first);
    });
});
