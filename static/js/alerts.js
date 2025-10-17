/**
 * Alert settings UI management.
 */

(function() {
    const API_ENDPOINT = '/api/alerts/settings';
    const API_TEST_ENDPOINT = '/api/alerts/test';

    let modal;
    let form;
    let statusEl;
    let rulesContainer;
    let backendSummaryEl;
    let enabledCheckbox;
    let cooldownInput;
    let resetInput;
    let channelContainer;
    let addChannelButton;
    let channelMenu;
    let enabledNote;
    let testButton;
    let channelMenuVisible = false;
    let currentChannels = [];
    let lastLoadError = null;

    const NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0
    });

    const CHANNEL_TYPES = {
        discord: {
            label: 'Discord Webhook',
            description: 'Send alerts to a Discord channel via webhook.',
            renderFields(channel) {
                const value = channel.webhook_url || '';
                return `
                    <label class="form-field">
                        <span class="form-label">Webhook URL</span>
                        <input type="url" class="input channel-input" data-field="webhook_url"
                               placeholder="https://discord.com/api/webhooks/..." value="${value}">
                    </label>
                `;
            },
            collect(card) {
                const input = card.querySelector('input[data-field="webhook_url"]');
                const webhook = input ? input.value.trim() : '';
                if (!webhook) {
                    throw new Error('Discord channels require a webhook URL.');
                }
                return { webhook_url: webhook };
            }
        },
        telegram: {
            label: 'Telegram Bot',
            description: 'Send alerts via Telegram bot token and chat ID.',
            renderFields(channel) {
                const token = channel.bot_token || '';
                const chatId = channel.chat_id || '';
                return `
                    <label class="form-field">
                        <span class="form-label">Bot token</span>
                        <input type="text" class="input channel-input" data-field="bot_token"
                               autocomplete="off" placeholder="123456:ABCdef" value="${token}">
                    </label>
                    <label class="form-field">
                        <span class="form-label">Chat ID</span>
                        <input type="text" class="input channel-input" data-field="chat_id"
                               autocomplete="off" placeholder="-1001234567890" value="${chatId}">
                    </label>
                `;
            },
            collect(card) {
                const tokenInput = card.querySelector('input[data-field="bot_token"]');
                const chatInput = card.querySelector('input[data-field="chat_id"]');
                const token = tokenInput ? tokenInput.value.trim() : '';
                const chatId = chatInput ? chatInput.value.trim() : '';
                if (!token || !chatId) {
                    throw new Error('Telegram channels require both a bot token and chat ID.');
                }
                return { bot_token: token, chat_id: chatId };
            }
        }
    };

    function isModalOpen() {
        return modal && !modal.classList.contains('hidden');
    }

    function generateChannelId() {
        return `chan-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    }

    function ensureChannelIds(channels) {
        return (channels || []).reduce((acc, entry) => {
            if (!entry || typeof entry !== 'object') return acc;
            if (!entry.type) return acc;
            const clone = { ...entry };
            if (!clone.id) clone.id = generateChannelId();
             clone.enabled = clone.enabled !== false;
            acc.push(clone);
            return acc;
        }, []);
    }

    function showStatus(message, variant = 'info') {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.classList.remove('is-success', 'is-error', 'is-info', 'is-empty');
        if (!message) {
            statusEl.classList.add('is-empty');
            return;
        }
        const variantClass = variant === 'error'
            ? 'is-error'
            : variant === 'success'
                ? 'is-success'
                : 'is-info';
        statusEl.classList.add(variantClass);
    }

    function formatRuleValue(value, unit) {
        if (value === null || value === undefined) {
            return 'n/a';
        }
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
            return String(value);
        }
        const formatted = NUMBER_FORMAT.format(numeric);
        return unit ? `${formatted}${unit}` : formatted;
    }

    function normalizeBackendList(backends) {
        if (!backends) return [];
        if (Array.isArray(backends)) {
            return ensureChannelIds(backends);
        }
        if (typeof backends === 'object') {
            const list = [];
            if (backends.discord && typeof backends.discord === 'object') {
                list.push({ type: 'discord', ...backends.discord });
            }
            if (backends.telegram && typeof backends.telegram === 'object') {
                list.push({ type: 'telegram', ...backends.telegram });
            }
            return ensureChannelIds(list);
        }
        return [];
    }

    function getDefaultsMap(settings) {
        const defaults = (settings && settings.defaults && Array.isArray(settings.defaults.rules))
            ? settings.defaults.rules
            : [];
        const map = new Map();
        defaults.forEach(rule => map.set(rule.name, rule));
        return map;
    }

    function updateRuleStatus(row, value) {
        const status = row.querySelector('.rule-status');
        if (!status) return;

        if (typeof value === 'number' && value > 0) {
            status.textContent = 'Enabled';
            status.classList.add('is-active');
            status.classList.remove('is-disabled');
        } else {
            status.textContent = 'Disabled';
            status.classList.add('is-disabled');
            status.classList.remove('is-active');
        }
    }

    function channelTypeLabel(type) {
        return CHANNEL_TYPES[type]?.label || type;
    }

    function isChannelConfigured(channel) {
        if (!channel) return false;
        if (channel.type === 'discord') {
            return Boolean(channel.webhook_url);
        }
        if (channel.type === 'telegram') {
            return Boolean(channel.bot_token && channel.chat_id);
        }
        return false;
    }

    function buildChannelSummary(channel) {
        if (!channel) return '';
        if (!isChannelConfigured(channel)) {
            return 'Incomplete configuration';
        }

        if (channel.type === 'discord') {
            try {
                const url = new URL(channel.webhook_url);
                const parts = url.pathname.split('/').filter(Boolean);
                const suffix = parts.length ? parts[parts.length - 1] : url.pathname;
                return `Discord • ${url.hostname}/${suffix.slice(0, 6)}…`;
            } catch (_) {
                return `Discord • ${channel.webhook_url.slice(0, 24)}…`;
            }
        }

        if (channel.type === 'telegram') {
            return channel.chat_id ? `Telegram • Chat ${channel.chat_id}` : 'Telegram • Chat pending';
        }

        return '';
    }

    function setTestButtonEnabled(enabled) {
        if (testButton) {
            testButton.disabled = !enabled;
        }
    }

    function updateTestButtonState(settings) {
        const snapshot = settings || window.getAlertSettingsSnapshot();
        const hasLocalConfigured = currentChannels.some(channel => channel.enabled !== false && isChannelConfigured(channel));
        const hasSavedBackends = snapshot
            ? snapshot.notifications_configured !== false && Array.isArray(snapshot.available_backends) && snapshot.available_backends.length > 0
            : false;
        setTestButtonEnabled(hasLocalConfigured && hasSavedBackends);
    }

    function updateEnabledNote(settings) {
        if (!enabledNote) return;
        const snapshot = settings || window.getAlertSettingsSnapshot();
        const enabled = snapshot?.enabled;
        const notificationsConfigured = snapshot?.notifications_configured;
        const active = snapshot?.active;
        const editingCount = currentChannels.filter(channel => channel._editing).length;
        const configuredCount = currentChannels.filter(isChannelConfigured).length;
        const enabledCount = currentChannels.filter(
            channel => channel.enabled !== false && isChannelConfigured(channel)
        ).length;

        if (!currentChannels.length) {
            enabledNote.textContent = 'Add at least one delivery channel to start receiving alerts.';
            return;
        }
        if (editingCount > 0) {
            enabledNote.textContent = 'Save or cancel your channel edits before alerts can run.';
            return;
        }
        if (configuredCount === 0) {
            enabledNote.textContent = 'Complete the channel details so alerts know where to send.';
            return;
        }
        if (enabledCount === 0) {
            enabledNote.textContent = 'All channels are disabled. Enable a channel to receive alerts.';
            return;
        }
        if (enabled === false) {
            enabledNote.textContent = 'Alerts are disabled; enable them to send notifications.';
            return;
        }
        if (notificationsConfigured === false || notificationsConfigured === undefined) {
            enabledNote.textContent = 'Save changes to activate the configured channels.';
            return;
        }
        if (active === false) {
            enabledNote.textContent = 'All thresholds are disabled, so no alerts will be sent.';
            return;
        }
        enabledNote.textContent = 'Alerts are enabled and will use the configured backends.';
    }

    function updateChannelStatusVisual(card, channel) {
        if (!card || !channel) return;
        const statusEl = card.querySelector('.channel-status');
        const summaryEl = card.querySelector('.channel-summary');
        const isConfigured = isChannelConfigured(channel);
        const isEnabled = channel.enabled !== false;

        if (statusEl) {
            statusEl.classList.toggle('is-online', isConfigured && isEnabled);
            statusEl.classList.toggle('is-offline', !isConfigured || !isEnabled);
        }

        if (summaryEl) {
            let summary = buildChannelSummary(channel);
            if (!isEnabled && summary) {
                summary += ' • Disabled';
            }
            summaryEl.textContent = summary;
        }

        card.classList.toggle('is-incomplete', !isConfigured);
        card.classList.toggle('is-disabled', !isEnabled);
    }

    function createChannelCard(channel) {
        const config = CHANNEL_TYPES[channel.type];
        const card = document.createElement('div');
        const isEditing = Boolean(channel._editing);
        const isConfigured = isChannelConfigured(channel);
        const isEnabled = channel.enabled !== false;

        card.className = `channel-card channel-${channel.type}`;
        card.dataset.channelId = channel.id;
        card.dataset.channelType = channel.type;
        if (isEditing) card.classList.add('is-editing');
        if (!isConfigured) card.classList.add('is-incomplete');
        if (!isEnabled) card.classList.add('is-disabled');

        const description = config?.description ? `<p class="channel-description">${config.description}</p>` : '';
        const fields = config ? config.renderFields(channel) : '';
        const summary = buildChannelSummary(channel);
        const statusClass = isConfigured && isEnabled ? 'is-online' : 'is-offline';
        const toggleChecked = isEnabled ? 'checked' : '';
        const saveLabel = channel._isNew ? 'Add Channel' : 'Save';

        card.innerHTML = `
            <div class="channel-card-header">
                <div class="channel-heading">
                    <div class="channel-type">${channelTypeLabel(channel.type)}</div>
                    <span class="channel-status ${statusClass}" aria-hidden="true"></span>
                    <span class="channel-summary">${summary}</span>
                    ${description}
                </div>
                <div class="channel-controls">
                    <label class="toggle-switch mini-toggle">
                        <input type="checkbox" data-action="toggle-enabled" ${toggleChecked}>
                        <span class="toggle-slider" aria-hidden="true"></span>
                    </label>
                    <button type="button" class="button button-ghost button-small" data-action="edit-channel">
                        ${isEditing ? 'Editing…' : 'Edit'}
                    </button>
                    <button type="button" class="channel-remove" data-action="remove-channel" aria-label="Remove channel">×</button>
                </div>
            </div>
            <div class="channel-card-body">
                ${fields}
            </div>
            <div class="channel-card-footer">
                <button type="button" class="button button-secondary button-small" data-action="channel-save">${saveLabel}</button>
                <button type="button" class="button button-ghost button-small" data-action="channel-cancel">
                    ${channel._isNew ? 'Cancel' : 'Discard changes'}
                </button>
            </div>
        `;

        return card;
    }

    function renderChannels(channels = null, settings = null) {
        if (!channelContainer) return;
        if (Array.isArray(channels)) {
            currentChannels = ensureChannelIds(channels).map(channel => ({
                ...channel,
                enabled: channel.enabled !== false,
            }));
        }

        channelContainer.innerHTML = '';

        if (!currentChannels.length) {
            channelContainer.innerHTML = '<div class="channel-empty">No delivery channels yet. Add one to start receiving alerts.</div>';
        } else {
            currentChannels.forEach(channel => {
                const card = createChannelCard(channel);
                channelContainer.appendChild(card);
                updateChannelStatusVisual(card, channel);
                if (channel._editing) {
                    requestAnimationFrame(() => {
                        const input = card.querySelector('.channel-input');
                        if (input) input.focus();
                    });
                }
            });
        }

        const snapshot = settings || window.getAlertSettingsSnapshot();
        updateEnabledNote(snapshot);
        updateTestButtonState(snapshot);
    }

    function closeChannelMenu() {
        if (channelMenu && channelMenuVisible) {
            channelMenu.classList.add('hidden');
            channelMenuVisible = false;
        }
    }

    function openChannelMenu() {
        if (channelMenu && !channelMenuVisible) {
            channelMenu.classList.remove('hidden');
            channelMenuVisible = true;
        }
    }

    function toggleChannelMenu() {
        if (!channelMenu) return;
        if (channelMenuVisible) {
            closeChannelMenu();
        } else {
            openChannelMenu();
        }
    }

    function addChannel(type) {
        const config = CHANNEL_TYPES[type];
        if (!config) return;
        const newChannel = {
            id: generateChannelId(),
            type,
            enabled: true,
            _editing: true,
            _isNew: true,
        };
        if (type === 'discord') {
            newChannel.webhook_url = '';
        } else if (type === 'telegram') {
            newChannel.bot_token = '';
            newChannel.chat_id = '';
        }
        currentChannels.push(newChannel);
        renderChannels();
        closeChannelMenu();
    }

    function enterEditMode(id) {
        const channel = currentChannels.find(item => item.id === id);
        if (!channel || channel._editing) return;
        currentChannels.forEach(item => {
            if (item.id !== id) {
                delete item._editing;
                delete item._original;
            }
        });
        channel._editing = true;
        channel._original = { ...channel };
        renderChannels();
    }

    function saveChannel(id) {
        const channel = currentChannels.find(item => item.id === id);
        if (!channel) return;
        const card = channelContainer.querySelector(`.channel-card[data-channel-id="${id}"]`);
        const config = CHANNEL_TYPES[channel.type];
        if (!config || !card) return;

        try {
            const values = config.collect(card);
            Object.assign(channel, values);
            channel.enabled = channel.enabled !== false;
            delete channel._editing;
            delete channel._original;
            delete channel._isNew;
            renderChannels();
            showStatus('Channel updated. Remember to save changes.', 'info');
        } catch (error) {
            showStatus(error.message || 'Channel configuration is incomplete.', 'error');
        }
    }

    function cancelChannel(id) {
        const index = currentChannels.findIndex(item => item.id === id);
        if (index === -1) return;
        const channel = currentChannels[index];

        if (channel._isNew) {
            currentChannels.splice(index, 1);
        } else if (channel._original) {
            Object.assign(channel, channel._original);
            channel.enabled = channel._original.enabled !== false;
            delete channel._original;
            delete channel._editing;
        } else {
            delete channel._editing;
        }

        delete channel._isNew;
        renderChannels();
    }

    function removeChannel(id) {
        if (!id) return;
        const index = currentChannels.findIndex(channel => channel.id === id);
        if (index === -1) return;
        currentChannels.splice(index, 1);
        renderChannels();
    }

    function handleChannelClick(event) {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;
        const card = actionTarget.closest('.channel-card');
        if (!card) return;
        const channelId = card.dataset.channelId;

        switch (action) {
            case 'remove-channel':
                removeChannel(channelId);
                break;
            case 'edit-channel':
                enterEditMode(channelId);
                break;
            case 'channel-save':
                saveChannel(channelId);
                break;
            case 'channel-cancel':
                cancelChannel(channelId);
                break;
            default:
                break;
        }
    }

    function handleChannelChange(event) {
        const target = event.target;
        const card = target.closest('.channel-card');
        if (!card) return;
        const channelId = card.dataset.channelId;
        const channel = currentChannels.find(item => item.id === channelId);
        if (!channel) return;

        if (target.dataset.action === 'toggle-enabled') {
            channel.enabled = target.checked;
            updateChannelStatusVisual(card, channel);
            updateEnabledNote(window.getAlertSettingsSnapshot());
            updateTestButtonState(window.getAlertSettingsSnapshot());
        }
    }

    function collectChannelPayload() {
        if (currentChannels.some(channel => channel._editing)) {
            throw new Error('Finish editing all delivery channels before saving.');
        }

        const payload = [];

        currentChannels.forEach(channel => {
            const entry = {
                id: channel.id,
                type: channel.type,
                enabled: channel.enabled !== false,
            };

            const configured = isChannelConfigured(channel);

            if (channel.enabled !== false && !configured) {
                throw new Error('Finish configuring each channel or disable it before saving.');
            }

            if (channel.type === 'discord') {
                entry.webhook_url = channel.webhook_url || '';
            } else if (channel.type === 'telegram') {
                entry.bot_token = channel.bot_token || '';
                entry.chat_id = channel.chat_id || '';
            }

            payload.push(entry);
        });

        return payload;
    }

    function renderRules(settings) {
        if (!rulesContainer) return;

        const rules = Array.isArray(settings?.rules) ? settings.rules : [];
        const defaultsMap = getDefaultsMap(settings);

        if (!rules.length) {
            rulesContainer.innerHTML = '<p class="empty-state">No alert rules are currently available.</p>';
            return;
        }

        rulesContainer.innerHTML = '';

        rules.forEach(rule => {
            const defaultRule = defaultsMap.get(rule.name);
            const unit = rule.unit || '';
            const thresholdValue = typeof rule.threshold === 'number' ? rule.threshold : 0;
            const resetValue = rule.reset_delta;
            const defaultThreshold = formatRuleValue(defaultRule?.threshold ?? null, unit);

            const row = document.createElement('div');
            row.className = 'alert-rule-row';
            row.dataset.ruleName = rule.name;

            row.innerHTML = `
                <div class="rule-header">
                    <div>
                        <div class="rule-label">${rule.label}</div>
                        <div class="rule-description">
                            Default ${unit ? `(${unit})` : ''}: ${defaultThreshold}. Set to 0 to disable.
                        </div>
                    </div>
                    <div class="rule-status ${thresholdValue > 0 ? 'is-active' : 'is-disabled'}">
                        ${thresholdValue > 0 ? 'Enabled' : 'Disabled'}
                    </div>
                </div>
                <div class="form-grid compact">
                    <label class="form-field">
                        <span class="form-label">Threshold${unit ? ` (${unit})` : ''}</span>
                        <input
                            type="number"
                            class="input"
                            data-field="threshold"
                            min="0"
                            step="0.1"
                            value="${thresholdValue}"
                            required
                        >
                    </label>
                    <label class="form-field">
                        <span class="form-label">Reset delta</span>
                        <input
                            type="number"
                            class="input"
                            data-field="reset_delta"
                            min="0"
                            step="0.1"
                            ${resetValue !== null && resetValue !== undefined ? `value="${resetValue}"` : 'placeholder="Use global"'}
                        >
                    </label>
                </div>
            `;

            const thresholdInput = row.querySelector('input[data-field="threshold"]');
            if (thresholdInput) {
                thresholdInput.addEventListener('input', () => {
                    const newValue = parseFloat(thresholdInput.value);
                    if (Number.isNaN(newValue)) {
                        updateRuleStatus(row, 0);
                    } else {
                        updateRuleStatus(row, newValue);
                    }
                });
            }

            rulesContainer.appendChild(row);
        });
    }

    function updateBackendSummary(settings) {
        if (!backendSummaryEl) return;

        const backends = Array.isArray(settings?.available_backends) ? [...new Set(settings.available_backends)] : [];
        const enabled = settings?.enabled;
        const notificationsConfigured = settings?.notifications_configured;
        const active = settings?.active;

        const parts = [];
        if (backends.length) {
            const names = backends.map(name => name.charAt(0).toUpperCase() + name.slice(1));
            parts.push(`Alerts will notify via ${names.join(', ')}.`);
        } else {
            parts.push('No notification backends configured.');
        }

        if (!notificationsConfigured) {
            parts.push('Configure a backend to receive external notifications.');
        } else if (enabled === false) {
            parts.push('Alerts are currently disabled.');
        } else if (!active) {
            parts.push('All thresholds are disabled, so no alerts will trigger.');
        }

        backendSummaryEl.textContent = parts.join(' ');
    }

    function renderSettings(settings) {
        if (!settings || !form) return;

        const channelList = normalizeBackendList(settings.backends);
        renderChannels(channelList, settings);

        enabledCheckbox.checked = Boolean(settings.enabled);

        const cooldownValue = typeof settings.cooldown_seconds === 'number'
            ? Math.max(0, settings.cooldown_seconds)
            : 0;
        cooldownInput.value = Math.round(cooldownValue);

        resetInput.value = (settings.reset_delta === null || settings.reset_delta === undefined)
            ? ''
            : String(settings.reset_delta);

        const snapshot = window.getAlertSettingsSnapshot();
        const defaults = snapshot?.defaults || settings.defaults;
        renderRules({ ...settings, defaults });
        updateBackendSummary(settings);

        updateEnabledNote(settings);

        updateTestButtonState(settings);
    }

    function collectRulePayload(row) {
        const name = row.dataset.ruleName;
        if (!name) {
            throw new Error('Rule name missing');
        }

        const thresholdInput = row.querySelector('input[data-field="threshold"]');
        const resetInputEl = row.querySelector('input[data-field="reset_delta"]');

        if (!thresholdInput) {
            throw new Error(`Threshold input missing for rule ${name}`);
        }

        const thresholdValue = thresholdInput.value.trim();
        if (thresholdValue === '') {
            throw new Error(`Threshold is required for ${name}`);
        }
        const threshold = parseFloat(thresholdValue);
        if (Number.isNaN(threshold) || threshold < 0) {
            throw new Error(`Threshold for ${name} must be zero or greater`);
        }

        let ruleReset = null;
        if (resetInputEl) {
            const resetValue = resetInputEl.value.trim();
            if (resetValue !== '') {
                ruleReset = parseFloat(resetValue);
                if (Number.isNaN(ruleReset) || ruleReset < 0) {
                    throw new Error(`Reset delta for ${name} must be zero or greater`);
                }
            }
        }

        return {
            name,
            threshold,
            reset_delta: ruleReset
        };
    }

    function buildPayload() {
        if (!form) return null;

        const cooldown = parseFloat(cooldownInput.value);
        if (Number.isNaN(cooldown) || cooldown < 0) {
            throw new Error('Cooldown must be zero or greater.');
        }

        let resetDelta = null;
        const resetValue = resetInput.value.trim();
        if (resetValue !== '') {
            resetDelta = parseFloat(resetValue);
            if (Number.isNaN(resetDelta) || resetDelta < 0) {
                throw new Error('Reset delta must be zero or greater.');
            }
        }

        const rulePayloads = [];
        const rows = rulesContainer.querySelectorAll('.alert-rule-row');
        rows.forEach(row => {
            rulePayloads.push(collectRulePayload(row));
        });

        const backendChannels = collectChannelPayload();

        return {
            enabled: enabledCheckbox.checked,
            cooldown_seconds: cooldown,
            reset_delta: resetDelta,
            rules: rulePayloads,
            backends: backendChannels
        };
    }

    async function triggerTestAlert() {
        if (!testButton) return;

        const restoreDisabled = testButton.disabled;
        testButton.disabled = true;
        showStatus('Sending test alert…', 'info');
        try {
            const response = await fetch(API_TEST_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errorMessage = body?.error || 'Failed to send test alert.';
                throw new Error(errorMessage);
            }
            showStatus('Test alert dispatched. Check your channels for delivery.', 'success');
        } catch (error) {
            showStatus(error.message || 'Failed to send test alert.', 'error');
        } finally {
            testButton.disabled = restoreDisabled;
            updateTestButtonState();
        }
    }

    async function submitSettings(event) {
        event.preventDefault();
        try {
            const payload = buildPayload();
            if (!payload) return;

            showStatus('Saving settings…', 'info');
            const response = await fetch(API_ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errorMessage = body?.error || 'Failed to save alert settings.';
                throw new Error(errorMessage);
            }

            window.setAlertSettingsSnapshot(body);
            renderSettings(body);
            showStatus('Alert settings updated.', 'success');
        } catch (error) {
            showStatus(error.message || 'Failed to save alert settings.', 'error');
        }
    }

    async function fetchSettings() {
        try {
            const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = data?.error || 'Unable to load alert settings.';
                throw new Error(message);
            }

            lastLoadError = null;
            window.setAlertSettingsSnapshot(data);
            renderSettings(data);
            if (isModalOpen()) {
                showStatus('', 'info');
            }
        } catch (error) {
            lastLoadError = error.message || 'Unable to load alert settings.';
            if (isModalOpen()) {
                showStatus(lastLoadError, 'error');
            }
            console.error('Alert settings load failed:', error);
        }
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        closeChannelMenu();
        showStatus('');
    }

    function openModal() {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        const snapshot = window.getAlertSettingsSnapshot();
        if (snapshot) {
            renderSettings(snapshot);
            showStatus('');
        } else if (lastLoadError) {
            showStatus(lastLoadError, 'error');
        } else {
            showStatus('Loading alert settings…', 'info');
        }

        // Focus first input for accessibility
        setTimeout(() => {
            if (enabledCheckbox) {
                enabledCheckbox.focus();
            }
        }, 0);

        fetchSettings();
    }

    function restoreDefaults() {
        const snapshot = window.getAlertSettingsSnapshot();
        if (!snapshot || !snapshot.defaults) {
            showStatus('Defaults are unavailable.', 'error');
            return;
        }

        const defaults = snapshot.defaults;
        enabledCheckbox.checked = Boolean(defaults.enabled);

        const defaultCooldown = typeof defaults.cooldown_seconds === 'number'
            ? Math.max(0, defaults.cooldown_seconds)
            : 0;
        cooldownInput.value = Math.round(defaultCooldown);

        resetInput.value = (defaults.reset_delta === null || defaults.reset_delta === undefined)
            ? ''
            : String(defaults.reset_delta);

        const defaultChannels = normalizeBackendList(defaults.backends);
        renderChannels(defaultChannels, defaults);
        updateTestButtonState(defaults);
        updateEnabledNote(defaults);

        const defaultsMap = getDefaultsMap(snapshot);
        const rows = rulesContainer.querySelectorAll('.alert-rule-row');
        rows.forEach(row => {
            const ruleName = row.dataset.ruleName;
            const defaultRule = defaultsMap.get(ruleName);
            if (!defaultRule) return;

            const thresholdInput = row.querySelector('input[data-field="threshold"]');
            const resetInputEl = row.querySelector('input[data-field="reset_delta"]');

            if (thresholdInput) {
                thresholdInput.value = defaultRule.threshold ?? 0;
                const numeric = Number(defaultRule.threshold ?? 0);
                updateRuleStatus(row, Number.isNaN(numeric) ? 0 : numeric);
            }
            if (resetInputEl) {
                if (defaultRule.reset_delta === null || defaultRule.reset_delta === undefined) {
                    resetInputEl.value = '';
                } else {
                    resetInputEl.value = defaultRule.reset_delta;
                }
            }
        });

        showStatus('Defaults restored. Save to apply.', 'info');
    }

    function handleModalClick(event) {
        const target = event.target;
        if (target && target.dataset.action === 'close-alert-settings') {
            closeModal();
        }
    }

    function handleDocumentClick(event) {
        if (!channelMenuVisible) {
            return;
        }
        if (channelMenu && channelMenu.contains(event.target)) {
            return;
        }
        if (addChannelButton && addChannelButton.contains(event.target)) {
            return;
        }
        closeChannelMenu();
    }

    function handleKeydown(event) {
        if (event.key === 'Escape') {
            if (channelMenuVisible) {
                closeChannelMenu();
                event.stopPropagation();
                return;
            }
            if (isModalOpen()) {
                closeModal();
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        modal = document.getElementById('alert-settings-modal');
        if (!modal) return;

        form = document.getElementById('alert-settings-form');
        statusEl = document.getElementById('alert-settings-status');
        rulesContainer = document.getElementById('alert-rules-container');
        backendSummaryEl = document.getElementById('alert-backend-summary');
        enabledCheckbox = document.getElementById('alerts-enabled');
        cooldownInput = document.getElementById('alert-cooldown');
        resetInput = document.getElementById('alert-reset-delta');
        channelContainer = document.getElementById('alert-channel-container');
        addChannelButton = document.getElementById('alert-add-channel');
        channelMenu = document.getElementById('alert-channel-menu');
        enabledNote = document.getElementById('alert-enabled-note');
        testButton = document.getElementById('alert-test-button');
        const openButton = document.getElementById('alert-settings-button');
        const closeButton = document.getElementById('alert-settings-close');
        const cancelButton = document.getElementById('alert-settings-cancel');
        const restoreButton = document.getElementById('alert-settings-restore');

        if (openButton) openButton.addEventListener('click', openModal);
        if (closeButton) closeButton.addEventListener('click', closeModal);
        if (cancelButton) cancelButton.addEventListener('click', closeModal);
        if (restoreButton) restoreButton.addEventListener('click', restoreDefaults);
        if (testButton) testButton.addEventListener('click', triggerTestAlert);
        if (addChannelButton) addChannelButton.addEventListener('click', event => {
            event.stopPropagation();
            toggleChannelMenu();
        });
        if (channelMenu) {
            channelMenu.addEventListener('click', event => {
                event.stopPropagation();
                const target = event.target;
                const type = target?.dataset?.channelType;
                if (type) {
                    addChannel(type);
                }
            });
        }
        if (channelContainer) {
            channelContainer.addEventListener('click', handleChannelClick);
            channelContainer.addEventListener('change', handleChannelChange);
        }
        if (form) form.addEventListener('submit', submitSettings);
        modal.addEventListener('click', handleModalClick);
        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('keydown', handleKeydown);

        fetchSettings();
    });
})();
