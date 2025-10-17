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
    let discordInput;
    let telegramTokenInput;
    let telegramChatInput;
    let enabledNote;
    let testButton;
    let lastLoadError = null;

    const NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0
    });

    function isModalOpen() {
        return modal && !modal.classList.contains('hidden');
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

        const backends = Array.isArray(settings?.available_backends) ? settings.available_backends : [];
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

        const backends = (settings.backends && typeof settings.backends === 'object') ? settings.backends : {};
        if (discordInput) {
            discordInput.value = backends.discord?.webhook_url || '';
        }
        if (telegramTokenInput) {
            telegramTokenInput.value = backends.telegram?.bot_token || '';
        }
        if (telegramChatInput) {
            telegramChatInput.value = backends.telegram?.chat_id || '';
        }

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

        if (enabledNote) {
            if (!settings.notifications_configured) {
                enabledNote.textContent = 'Add a Discord webhook or Telegram destination to deliver alerts.';
            } else if (settings.enabled === false) {
                enabledNote.textContent = 'Alerts are disabled; enable them to send notifications.';
            } else if (!settings.active) {
                enabledNote.textContent = 'All thresholds are disabled, so no alerts will be sent.';
            } else {
                enabledNote.textContent = 'Alerts are enabled and will use the configured backends.';
            }
        }

        if (testButton) {
            testButton.disabled = !settings.notifications_configured;
        }
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

        const discordUrl = discordInput ? discordInput.value.trim() : '';
        const telegramToken = telegramTokenInput ? telegramTokenInput.value.trim() : '';
        const telegramChat = telegramChatInput ? telegramChatInput.value.trim() : '';

        const telegramTokenProvided = Boolean(telegramToken);
        const telegramChatProvided = Boolean(telegramChat);
        if (telegramTokenProvided !== telegramChatProvided) {
            throw new Error('Telegram channel requires both a bot token and chat ID.');
        }

    const rulePayloads = [];
    const rows = rulesContainer.querySelectorAll('.alert-rule-row');
    rows.forEach(row => {
        rulePayloads.push(collectRulePayload(row));
    });

        const backendsPayload = {};
        if (discordInput) {
            backendsPayload.discord = discordUrl ? { webhook_url: discordUrl } : null;
        }
        if (telegramTokenInput || telegramChatInput) {
            backendsPayload.telegram = (telegramTokenProvided && telegramChatProvided)
                ? { bot_token: telegramToken, chat_id: telegramChat }
                : null;
        }

        return {
            enabled: enabledCheckbox.checked,
            cooldown_seconds: cooldown,
            reset_delta: resetDelta,
            rules: rulePayloads,
        backends: backendsPayload
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

        const defaultsBackends = (defaults.backends && typeof defaults.backends === 'object') ? defaults.backends : {};
        if (discordInput) {
            discordInput.value = defaultsBackends.discord?.webhook_url || '';
        }
        if (telegramTokenInput) {
            telegramTokenInput.value = defaultsBackends.telegram?.bot_token || '';
        }
        if (telegramChatInput) {
            telegramChatInput.value = defaultsBackends.telegram?.chat_id || '';
        }

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

        if (testButton) {
            const hasDefaultBackends = defaults.backends && Object.keys(defaults.backends).length > 0;
            testButton.disabled = !hasDefaultBackends;
        }

        showStatus('Defaults restored. Save to apply.', 'info');
    }

    function handleModalClick(event) {
        const target = event.target;
        if (target && target.dataset.action === 'close-alert-settings') {
            closeModal();
        }
    }

    function handleKeydown(event) {
        if (event.key === 'Escape' && isModalOpen()) {
            closeModal();
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
        discordInput = document.getElementById('alert-discord-webhook');
        telegramTokenInput = document.getElementById('alert-telegram-token');
        telegramChatInput = document.getElementById('alert-telegram-chat');
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
        if (form) form.addEventListener('submit', submitSettings);
        modal.addEventListener('click', handleModalClick);
        document.addEventListener('keydown', handleKeydown);

        fetchSettings();
    });
})();
