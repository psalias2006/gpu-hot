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
