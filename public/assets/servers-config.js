/**
 * Configuration for the Servers Overview page
 * 
 * This file contains externalized configuration options that can be
 * easily modified without changing the main servers.js file.
 */

const SERVERS_CONFIG = {
    // Auto-refresh interval in milliseconds (30 seconds)
    REFRESH_INTERVAL: parseInt(localStorage.getItem('serverRefreshInterval')) || 30000,
    
    // Delay before reloading after an action (2 seconds)
    RELOAD_DELAY: 2000,
    
    // Enable automatic refresh of server list
    AUTO_REFRESH_ENABLED: true,
    
    // Number of servers to display per page (0 = unlimited)
    SERVERS_PER_PAGE: 0,
    
    // Default view on page load ('cards' or 'table')
    DEFAULT_VIEW: localStorage.getItem('serverDefaultView') || 'cards',
    
    // Show player count in servers list
    SHOW_PLAYER_COUNT: true,
    
    // Show resource usage (CPU/Memory) in servers list
    SHOW_RESOURCE_USAGE: true,
    
    // Update config from localStorage
    setRefreshInterval: function(interval) {
        if (interval > 0) {
            this.REFRESH_INTERVAL = interval;
            localStorage.setItem('serverRefreshInterval', interval);
        }
    },
    
    setDefaultView: function(view) {
        if (['cards', 'table'].includes(view)) {
            this.DEFAULT_VIEW = view;
            localStorage.setItem('serverDefaultView', view);
        }
    }
};

// Export for use in servers.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SERVERS_CONFIG;
}
