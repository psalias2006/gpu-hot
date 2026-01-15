/**
 * GPU Hot - Main Application
 * Initializes the application when the DOM is ready
 */

// Application initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('GPU Hot application initialized');
    
    // All functionality is loaded from other modules:
    // - charts.js: Chart configurations and updates
    // - gpu-cards.js: GPU card rendering and updates
    // - ui.js: UI interactions and navigation
    // - socket-handlers.js: Real-time data updates via Socket.IO
    
    // The socket connection is established automatically when socket-handlers.js loads
    
    // Check for version updates
    checkVersion();

    // Initialize GitHub star prompt
    initStarPrompt();
});

/**
 * Check current version and update availability
 */
async function checkVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        
        const versionCurrent = document.getElementById('version-current');
        const updateBadge = document.getElementById('update-badge');
        const updateLink = document.getElementById('update-link');
        
        if (versionCurrent) {
            versionCurrent.textContent = `v${data.current}`;
        }
        
        if (data.update_available && data.latest) {
            updateBadge.style.display = 'inline-block';
            updateLink.href = data.release_url || 'https://github.com/psalias2006/gpu-hot/releases/latest';
            updateLink.title = `Update to v${data.latest}`;
        }
    } catch (error) {
        console.debug('Failed to check version:', error);
        const versionCurrent = document.getElementById('version-current');
        if (versionCurrent) {
            versionCurrent.textContent = 'Unknown';
        }
    }
}

/**
 * Show a non-modal prompt to star the project on GitHub.
 * Triggers on the third visit and after a short uptime delay.
 */
function initStarPrompt() {
    const dismissKey = 'gpuHotStarPromptDismissed';
    const toast = document.getElementById('star-toast');

    if (!toast) {
        return;
    }

    if (localStorage.getItem(dismissKey) === 'true') {
        return;
    }

    const starButton = toast.querySelector('[data-action="star"]');
    const closeButton = toast.querySelector('[data-action="dismiss"]');

    const dismissPrompt = () => {
        localStorage.setItem(dismissKey, 'true');
        toast.classList.add('is-hidden');
    };

    if (starButton) {
        starButton.addEventListener('click', () => {
            window.open('https://github.com/psalias2006/gpu-hot', '_blank', 'noopener,noreferrer');
            dismissPrompt();
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', dismissPrompt);
    }

    // Fire-and-forget: fetch star count async, don't block anything
    fetchStarCount().catch(() => {});

    // Show after 1 minute of active use
    const showDelayMs = 60 * 1000;
    setTimeout(() => {
        if (localStorage.getItem(dismissKey) !== 'true') {
            toast.classList.remove('is-hidden');
        }
    }, showDelayMs);
}

/**
 * Fetch GitHub star count and update UI if successful.
 * Completely async and non-blocking. If it fails, the generic message stays.
 */
async function fetchStarCount() {
    const progressWrap = document.getElementById('star-progress-wrap');
    const milestoneEl = document.getElementById('star-toast-milestone');
    const progressFillEl = document.getElementById('star-progress-fill');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch('https://api.github.com/repos/psalias2006/gpu-hot', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const data = await response.json();
        const stars = Number(data.stargazers_count);

        if (!Number.isFinite(stars) || stars <= 0) return;

        const nextGoal = stars % 1000 === 0 ? stars + 1000 : Math.ceil(stars / 1000) * 1000;
        const starsToGo = nextGoal - stars;
        const prevMilestone = nextGoal - 1000;
        const progressPercent = Math.min(100, Math.max(0, ((stars - prevMilestone) / 1000) * 100));
        const goalLabel = nextGoal >= 1000 ? (nextGoal / 1000) + 'k' : String(nextGoal);

        // Update UI with real data
        if (milestoneEl) {
            milestoneEl.textContent = `${formatNumber(starsToGo)} stars to ${goalLabel}`;
        }
        if (progressFillEl) {
            progressFillEl.style.width = progressPercent + '%';
        }
        if (progressWrap) {
            progressWrap.classList.remove('is-hidden');
        }
    } catch (error) {
        // Silent fail - generic message stays, no progress bar shown
        clearTimeout(timeoutId);
    }
}

function formatNumber(value) {
    return Number(value).toLocaleString('en-US');
}
