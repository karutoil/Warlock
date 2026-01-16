// Configuration
const CONFIG = {
    REFRESH_INTERVAL: 30000,      // 30 seconds
    RELOAD_DELAY: 2000,            // 2 seconds after action
    AUTO_REFRESH_ENABLED: true,
    DEFAULT_VIEW: 'cards'
};

// Override with external config if available
if (typeof SERVERS_CONFIG !== 'undefined') {
    Object.assign(CONFIG, SERVERS_CONFIG);
}

// DOM element cache - avoid repeated querySelector calls
const DOM = {
    serversGrid: null,
    serversTable: null,
    servicesTableBody: null,
    viewToggleBtns: null
};

// Centralized state management
const AppState = {
    servers: [],
    view: 'cards',
    isLoading: false,
    
    // Track active server actions
    actions: {
        inProgress: false,
        server: null,           // {guid, host, service}
        action: null,           // 'start', 'stop', 'restart'
        expectedStatus: null    // 'running', 'stopped'
    },
    
    intervals: {
        refresh: null,
        statusPoll: null
    }
};

/**
 * Type-safe state setter
 */
function setState(path, value) {
    const setNested = (obj, pathStr, val) => {
        const keys = pathStr.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        const lastKey = keys[keys.length - 1];
        current[lastKey] = val;
    };
    
    setNested(AppState, path, value);
}

/**
 * Safe getter for nested state properties
 */
function getState(path) {
    const keys = path.split('.');
    let current = AppState;
    
    for (const key of keys) {
        if (current === null || current === undefined) return undefined;
        current = current[key];
    }
    
    return current;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validate server data structure
 */
function validateServer(server) {
    if (!server || typeof server !== 'object') return false;
    if (!server.app || !server.host || !server.service) return false;
    if (!server.host.host || !server.service.service) return false;
    return true;
}

/**
 * Validate API response structure
 */
function validateServicesResponse(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(result.services)) {
        throw new Error('Services response is not an array');
    }
    // Validate each server in the array
    const validServers = result.services.filter(server => {
        if (!validateServer(server)) {
            console.warn('Invalid server data structure:', server);
            return false;
        }
        return true;
    });
    return validServers;
}

/**
 * Render servers in card view
 */
function renderCardsView(servers) {
    if (!Array.isArray(servers)) {
        console.error('Invalid servers array', servers);
        return;
    }

    // Lazy init DOM cache
    if (!DOM.serversGrid) {
        DOM.serversGrid = document.getElementById('serversGrid');
        if (!DOM.serversGrid) return; // DOM not ready
    }
    
    if (servers.length === 0) {
        DOM.serversGrid.innerHTML = `
            <div class="no-servers-message">
                <i class="fas fa-server"></i>
                <h3>No Servers Found</h3>
                <p>Install your first game to get started</p>
                <button class="link-control" data-href="/application/install" style="margin-top: 1rem;">
                    <i class="fas fa-plus"></i> Install Game
                </button>
            </div>
        `;
        return;
    }

    // Build HTML using array and join (more efficient than += concatenation)
    const htmlParts = new Array(servers.length);
    for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        const app_guid = escapeHtml(server.app),
            host = escapeHtml(server.host.host),
            service = escapeHtml(server.service.service),
            thumbnailUrl = getAppThumbnail(app_guid),
            appIcon = thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${app_guid} Thumbnail" class="server-card-icon" title="${app_guid}">` : renderAppIcon(app_guid),
            statusClass = server.service.status || 'stopped',
            statusIcon = getStatusIcon(server.service.status),
            playerCount = server.service.player_count != null ? server.service.player_count : 0,
            maxPlayers = server.service.max_players != null ? server.service.max_players : '?',
            memoryUsage = server.service.memory_usage != null ? server.service.memory_usage : '-',
            cpuUsage = server.service.cpu_usage != null ? server.service.cpu_usage : '-',
            // Check if this server has an action in progress
            isActionInProgress = AppState.actions.inProgress && 
                                AppState.actions.server?.guid === server.app &&
                                AppState.actions.server?.host === server.host.host &&
                                AppState.actions.server?.service === server.service.service;

        htmlParts[i] = `
            <div class="server-card" data-guid="${app_guid}" data-host="${host}" data-service="${service}">
                <div class="server-card-header">
                    ${appIcon}
                    <div class="server-card-title">
                        <h3>${service}</h3>
                        <p>${renderHostName(host)}</p>
                    </div>
                </div>
                <div class="server-card-body">
                    <div class="server-stats">
                        <div class="server-stat">
                            <span class="server-stat-label">Status</span>
                            <span class="server-stat-value">
                                <span class="server-status ${statusClass}">
                                    ${statusIcon} ${escapeHtml(server.service.status).toUpperCase()}
                                </span>
                            </span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-label">Port</span>
                            <span class="server-stat-value">${escapeHtml(server.service.port || '-')}</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-label">Players</span>
                            <span class="server-stat-value">${playerCount} / ${maxPlayers}</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-label">Resources</span>
                            <span class="server-stat-value">
                                <i class="fas fa-microchip"></i> ${cpuUsage}% | 
                                <i class="fas fa-memory"></i> ${memoryUsage}MB
                            </span>
                        </div>
                    </div>
                    <div class="server-actions">
                        <button class="server-action-btn view-server" data-guid="${app_guid}" data-host="${host}" data-service="${service}" title="View Server Details" ${isActionInProgress ? 'disabled' : ''}>
                            <i class="fas fa-eye"></i>
                            <span>View</span>
                        </button>
                        ${server.service.status === 'running' ? `
                            <button class="server-action-btn stop" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="stop" title="Stop Server" ${isActionInProgress ? 'disabled' : ''}>
                                ${isActionInProgress && AppState.actions.action === 'stop' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-stop"></i>'}
                                <span>${isActionInProgress && AppState.actions.action === 'stop' ? 'Stopping...' : 'Stop'}</span>
                            </button>
                        ` : `
                            <button class="server-action-btn start" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="start" title="Start Server" ${isActionInProgress ? 'disabled' : ''}>
                                ${isActionInProgress && AppState.actions.action === 'start' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-play"></i>'}
                                <span>${isActionInProgress && AppState.actions.action === 'start' ? 'Starting...' : 'Start'}</span>
                            </button>
                        `}
                        <button class="server-action-btn restart" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="restart" title="Restart Server" ${isActionInProgress ? 'disabled' : ''}>
                            ${isActionInProgress && AppState.actions.action === 'restart' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-redo"></i>'}
                            <span>${isActionInProgress && AppState.actions.action === 'restart' ? 'Restarting...' : 'Restart'}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Single DOM update with pre-built string
    DOM.serversGrid.innerHTML = htmlParts.join('');
}

/**
 * Render servers in table view
 */
function renderTableView(servers) {
    if (!Array.isArray(servers)) {
        console.error('Invalid servers array', servers);
        return;
    }

    // Lazy init DOM cache
    if (!DOM.servicesTableBody) {
        const table = document.getElementById('services-table');
        if (!table) return; // DOM not ready
        DOM.servicesTableBody = table.querySelector('tbody');
    }

    if (servers.length === 0) {
        DOM.servicesTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem;">
                    <div class="no-servers-message">
                        <i class="fas fa-server"></i>
                        <h3>No Servers Found</h3>
                        <p>Install your first game to get started</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Build HTML using array and join (more efficient than += concatenation)
    const htmlParts = new Array(servers.length);
    for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        const app_guid = escapeHtml(server.app),
            host = escapeHtml(server.host.host),
            service = escapeHtml(server.service.service),
            thumbnailUrl = getAppThumbnail(app_guid),
            appIcon = thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${app_guid} Thumbnail" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" title="${app_guid}">` : renderAppIcon(app_guid),
            statusIcon = getStatusIcon(server.service.status),
            playerCount = server.service.player_count != null ? server.service.player_count : 0,
            maxPlayers = server.service.max_players != null ? server.service.max_players : '?',
            memoryUsage = server.service.memory_usage != null ? server.service.memory_usage : '-',
            cpuUsage = server.service.cpu_usage != null ? server.service.cpu_usage : '-',
            // Check if this server has an action in progress
            isActionInProgress = AppState.actions.inProgress && 
                                AppState.actions.server?.guid === server.app &&
                                AppState.actions.server?.host === server.host.host &&
                                AppState.actions.server?.service === server.service.service;

        htmlParts[i] = `
            <tr class="service" data-guid="${app_guid}" data-host="${host}" data-service="${service}">
                <td class="host">${renderHostName(host)}</td>
                <td class="icon">${appIcon}</td>
                <td class="name">${service}</td>
                <td class="status status-${escapeHtml(server.service.status)}">${statusIcon} ${escapeHtml(server.service.status).toUpperCase()}</td>
                <td class="port">${escapeHtml(server.service.port || '-')}</td>
                <td class="players">${playerCount} / ${maxPlayers}</td>
                <td class="memory">${memoryUsage}</td>
                <td class="cpu">${cpuUsage}</td>
                <td class="actions">
                    <div class="button-group">
                        <button class="link-control view-server" data-guid="${app_guid}" data-host="${host}" data-service="${service}" title="View Server" ${isActionInProgress ? 'disabled' : ''}>
                            <i class="fas fa-eye"></i><span>View</span>
                        </button>
                        ${server.service.status === 'running' ? `
                            <button class="server-action-btn stop" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="stop" title="Stop" ${isActionInProgress ? 'disabled' : ''}>
                                ${isActionInProgress && AppState.actions.action === 'stop' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-stop"></i>'}
                                <span>${isActionInProgress && AppState.actions.action === 'stop' ? 'Stopping...' : 'Stop'}</span>
                            </button>
                        ` : `
                            <button class="server-action-btn start" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="start" title="Start" ${isActionInProgress ? 'disabled' : ''}>
                                ${isActionInProgress && AppState.actions.action === 'start' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-play"></i>'}
                                <span>${isActionInProgress && AppState.actions.action === 'start' ? 'Starting...' : 'Start'}</span>
                            </button>
                        `}
                        <button class="server-action-btn restart" data-guid="${app_guid}" data-host="${host}" data-service="${service}" data-action="restart" title="Restart Server" ${isActionInProgress ? 'disabled' : ''}>
                            ${isActionInProgress && AppState.actions.action === 'restart' ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-redo"></i>'}
                            <span>${isActionInProgress && AppState.actions.action === 'restart' ? 'Restarting...' : 'Restart'}</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    // Single DOM update with pre-built string
    DOM.servicesTableBody.innerHTML = htmlParts.join('');
}

/**
 * Get status icon based on status string
 */
function getStatusIcon(status) {
    switch(status) {
        case 'running':
            return '<i class="fas fa-check-circle"></i>';
        case 'stopped':
            return '<i class="fas fa-times-circle"></i>';
        case 'starting':
        case 'stopping':
            return '<i class="fas fa-sync-alt fa-spin"></i>';
        default:
            return '<i class="fas fa-question-circle"></i>';
    }
}

/**
 * Load all servers
 */
function loadServers() {
    // Skip if action is in progress
    if (AppState.actions.inProgress) {
        return;
    }

    // Prevent concurrent requests
    if (AppState.isLoading) {
        return;
    }

    setState('isLoading', true);
    
    fetch('/api/services', {method: 'GET'})
        .then(r => r.json())
        .then(result => {
            try {
                // Validate response structure
                if (!result.success) {
                    throw new Error(result.error || 'API returned success: false');
                }
                
                // Validate and filter servers
                const validServers = validateServicesResponse(result);
                setState('servers', validServers);
                renderView();
            } catch (error) {
                console.error('Error validating servers response:', error);
                // Preserve previous server state on error
                if (AppState.servers.length === 0) {
                    showToast('error', `Failed to load servers: ${error.message}`);
                    renderView(); // Render empty state
                }
            }
        })
        .catch(error => {
            console.error('Error loading servers:', error);
            // Preserve previous server state on error
            if (AppState.servers.length === 0) {
                showToast('error', 'Failed to load servers. Please check your connection.');
                renderView(); // Render empty state
            }
        })
        .finally(() => {
            setState('isLoading', false);
        });
}

/**
 * Handle server control actions with proper state management and polling
 */
async function handleServerAction(guid, host, service, action) {
    // Don't allow concurrent actions
    if (AppState.actions.inProgress) {
        showToast('warning', 'An action is already in progress');
        return;
    }

    // Determine expected status
    const expectedStatus = action === 'stop' ? 'stopped' : 'running';

    // Mark action in progress locally and in shared state
    setState('actions.inProgress', true);
    setState('actions.server', {guid, host, service});
    setState('actions.action', action);
    setState('actions.expectedStatus', expectedStatus);
    
    // Share action state across pages
    SharedActionState.set(guid, host, service, action);

    // Re-render to show loading state
    renderView();

    try {
        const response = await fetch('/api/service/control', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({guid, host, service, action})
        });

        const result = await response.json();

        if (!result.success) {
            showToast('error', result.error || 'Failed to execute action');
            setState('actions.inProgress', false);
            setState('actions.server', null);
            setState('actions.action', null);
            SharedActionState.clear();
            renderView();
            return;
        }

        showToast('success', `Server ${action} command sent`);

        // Wait for service to transition
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Poll for status change
        let statusReached = false;
        let attempts = 0;
        const maxAttempts = 30; // Max 30 seconds

        while (!statusReached && attempts < maxAttempts) {
            try {
                const statusResponse = await fetch('/api/services');
                const statusResult = await statusResponse.json();

                if (statusResult.success && Array.isArray(statusResult.services)) {
                    // Find this specific server
                    const server = statusResult.services.find(s => 
                        s.app === guid && 
                        s.host.host === host && 
                        s.service.service === service
                    );

                    if (server) {
                        console.log(`[Status] Expected: "${expectedStatus}", Got: "${server.service.status}", Attempt: ${attempts + 1}`);

                        if (server.service.status === expectedStatus) {
                            statusReached = true;
                            console.log(`✓ Status transition complete to "${expectedStatus}"`);
                            showToast('success', `Server ${action} completed`);
                            break;
                        }
                    }
                }
            } catch (pollError) {
                console.error('Error polling status:', pollError);
            }

            attempts++;
            if (!statusReached && attempts < maxAttempts) {
                // Wait 1 second before next poll
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (!statusReached) {
            console.warn(`Status update timeout after ${attempts} attempts - forcing full refresh`);
            showToast('warning', `Server ${action} may have completed - refreshing...`);
        }

    } catch (error) {
        console.error('Error executing action:', error);
        showToast('error', 'Failed to execute action');
    } finally {
        // Mark action as complete
        setState('actions.inProgress', false);
        setState('actions.server', null);
        setState('actions.action', null);
        SharedActionState.clear();
        
        // Force a full refresh from API regardless of timeout
        await new Promise(resolve => setTimeout(resolve, 500));
        loadServers();
    }
}

/**
 * Render current view based on selection
 */
function renderView() {
    // Lazy init DOM cache
    if (!DOM.serversGrid) {
        DOM.serversGrid = document.getElementById('serversGrid');
    }
    if (!DOM.serversTable) {
        DOM.serversTable = document.getElementById('serversTable');
    }
    
    if (!DOM.serversGrid || !DOM.serversTable) {
        return; // DOM not ready yet
    }

    if (AppState.view === 'cards') {
        DOM.serversGrid.style.display = 'grid';
        DOM.serversTable.style.display = 'none';
        renderCardsView(AppState.servers);
    } else {
        DOM.serversGrid.style.display = 'none';
        DOM.serversTable.style.display = 'block';
        renderTableView(AppState.servers);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load application data for thumbnails
    fetchApplications().catch(e => console.error('Failed to fetch applications:', e));

    // Initial load
    loadServers();
    
    // Auto-refresh every N seconds (configurable)
    if (CONFIG.AUTO_REFRESH_ENABLED) {
        const refreshInterval = setInterval(loadServers, CONFIG.REFRESH_INTERVAL);
        setState('intervals.refresh', refreshInterval);
    }

    // Listen for action state changes from other pages/tabs
    onSharedActionStateChange((newState, oldState) => {
        if (newState) {
            // Action started on another page
            setState('actions.inProgress', true);
            setState('actions.server', {
                guid: newState.guid,
                host: newState.host,
                service: newState.service
            });
            setState('actions.action', newState.action);
            setState('actions.expectedStatus', newState.action === 'stop' ? 'stopped' : 'running');
            renderView();
        } else if (oldState && !newState) {
            // Action completed on another page
            setState('actions.inProgress', false);
            setState('actions.server', null);
            setState('actions.action', null);
            renderView();
            // Refresh to get latest server states
            loadServers();
        }
    });

    // View toggle with debouncing - cache buttons on first use
    let viewToggleInProgress = false;
    const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
    
    viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (viewToggleInProgress) return;
            
            viewToggleInProgress = true;
            viewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setState('view', btn.dataset.view);
            renderView();
            
            // Reset flag after render
            setTimeout(() => { viewToggleInProgress = false; }, 100);
        });
    });

    // Handle clicks on the document
    document.addEventListener('click', e => {
        const target = e.target;

        // View server details
        if (target.closest('.view-server')) {
            const btn = target.closest('.view-server');
            const guid = btn.dataset.guid;
            const host = btn.dataset.host;
            const service = btn.dataset.service;
            window.location.href = `/server/${guid}/${host}/${service}`;
            return;
        }

        // Server card click (except on buttons)
        if (target.closest('.server-card') && !target.closest('button')) {
            const card = target.closest('.server-card');
            const guid = card.dataset.guid;
            const host = card.dataset.host;
            const service = card.dataset.service;
            window.location.href = `/server/${guid}/${host}/${service}`;
            return;
        }

        // Server control actions
        if (target.closest('.server-action-btn[data-action]')) {
            e.preventDefault();
            const btn = target.closest('.server-action-btn[data-action]');
            const guid = btn.dataset.guid;
            const host = btn.dataset.host;
            const service = btn.dataset.service;
            const action = btn.dataset.action;
            
            handleServerAction(guid, host, service, action);
            return;
        }

        // Link control
        if (target.closest('.link-control')) {
            const btn = target.closest('.link-control');
            const href = btn.dataset.href;
            if (href) {
                window.location.href = href;
            }
            return;
        }
    });
});


