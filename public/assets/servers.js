let currentView = 'cards';
let allServers = [];

/**
 * Render servers in card view
 */
function renderCardsView(servers) {
    const grid = document.getElementById('serversGrid');
    
    if (servers.length === 0) {
        grid.innerHTML = `
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

    let html = '';
    servers.forEach(server => {
        const app_guid = server.app,
            host = server.host,
            service = server.service,
            thumbnailUrl = getAppThumbnail(app_guid),
            appIcon = thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${app_guid} Thumbnail" class="server-card-icon" title="${app_guid}">` : renderAppIcon(app_guid),
            statusClass = service.status || 'stopped',
            statusIcon = getStatusIcon(service.status),
            playerCount = service.player_count || 0,
            maxPlayers = service.max_players || '?',
            memoryUsage = service.memory_usage || '-',
            cpuUsage = service.cpu_usage || '-';

        html += `
            <div class="server-card" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}">
                <div class="server-card-header">
                    ${appIcon}
                    <div class="server-card-title">
                        <h3>${service.service}</h3>
                        <p>${renderHostName(host.host)}</p>
                    </div>
                </div>
                <div class="server-card-body">
                    <div class="server-stats">
                        <div class="server-stat">
                            <span class="server-stat-label">Status</span>
                            <span class="server-stat-value">
                                <span class="server-status ${statusClass}">
                                    ${statusIcon} ${service.status.toUpperCase()}
                                </span>
                            </span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-label">Port</span>
                            <span class="server-stat-value">${service.port || '-'}</span>
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
                        <button class="server-action-btn view-server" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" title="View Server Details">
                            <i class="fas fa-eye"></i>
                            <span>View</span>
                        </button>
                        ${service.status === 'running' ? `
                            <button class="server-action-btn stop" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" data-action="stop" title="Stop Server">
                                <i class="fas fa-stop"></i>
                                <span>Stop</span>
                            </button>
                        ` : `
                            <button class="server-action-btn start" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" data-action="start" title="Start Server">
                                <i class="fas fa-play"></i>
                                <span>Start</span>
                            </button>
                        `}
                        <button class="server-action-btn restart" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" data-action="restart" title="Restart Server">
                            <i class="fas fa-redo"></i>
                            <span>Restart</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

/**
 * Render servers in table view
 */
function renderTableView(servers) {
    const table = document.getElementById('services-table');
    const tbody = table.querySelector('tbody');

    if (servers.length === 0) {
        tbody.innerHTML = `
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

    let html = '';
    servers.forEach(server => {
        const app_guid = server.app,
            host = server.host,
            service = server.service,
            thumbnailUrl = getAppThumbnail(app_guid),
            appIcon = thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${app_guid} Thumbnail" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" title="${app_guid}">` : renderAppIcon(app_guid),
            statusIcon = getStatusIcon(service.status);

        html += `
            <tr class="service" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}">
                <td class="host">${renderHostName(host.host)}</td>
                <td class="icon">${appIcon}</td>
                <td class="name">${service.service}</td>
                <td class="status status-${service.status}">${statusIcon} ${service.status.toUpperCase()}</td>
                <td class="port">${service.port || '-'}</td>
                <td class="players">${service.player_count || 0} / ${service.max_players || '?'}</td>
                <td class="memory">${service.memory_usage || '-'}</td>
                <td class="cpu">${service.cpu_usage || '-'}</td>
                <td class="actions">
                    <div class="button-group">
                        <button class="link-control view-server" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" title="View Server">
                            <i class="fas fa-eye"></i><span>View</span>
                        </button>
                        ${service.status === 'running' ? `
                            <button class="server-action-btn stop" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" data-action="stop" title="Stop">
                                <i class="fas fa-stop"></i><span>Stop</span>
                            </button>
                        ` : `
                            <button class="server-action-btn start" data-guid="${app_guid}" data-host="${host.host}" data-service="${service.service}" data-action="start" title="Start">
                                <i class="fas fa-play"></i><span>Start</span>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
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
 * Handle server control actions
 */
function handleServerAction(guid, host, service, action) {
    fetch('/api/service/control', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            guid: guid,
            host: host,
            service: service,
            action: action
        })
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            showToast('success', `Server ${action} command sent successfully`);
            // Reload servers after a short delay
            setTimeout(loadServers, 2000);
        } else {
            showToast('error', result.error || 'Failed to execute action');
        }
    })
    .catch(error => {
        console.error('Error executing action:', error);
        showToast('error', 'Failed to execute action');
    });
}

/**
 * Load all servers
 */
function loadServers() {
    fetch('/api/services', {method: 'GET'})
        .then(r => r.json())
        .then(result => {
            if (result.success && result.services.length > 0) {
                allServers = result.services;
                renderView();
            } else {
                allServers = [];
                renderView();
            }
        })
        .catch(error => {
            console.error('Error loading servers:', error);
            showToast('error', 'Failed to load servers');
        });
}

/**
 * Render current view based on selection
 */
function renderView() {
    if (currentView === 'cards') {
        document.getElementById('serversGrid').style.display = 'grid';
        document.getElementById('serversTable').style.display = 'none';
        renderCardsView(allServers);
    } else {
        document.getElementById('serversGrid').style.display = 'none';
        document.getElementById('serversTable').style.display = 'block';
        renderTableView(allServers);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load application data for thumbnails
    fetchApplications().catch(e => console.error('Failed to fetch applications:', e));

    // Initial load
    loadServers();
    
    // Auto-refresh every 30 seconds
    setInterval(loadServers, 30000);

    // View toggle
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            renderView();
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


