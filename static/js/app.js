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
});
