const servicesContainer = document.getElementById('servicesContainer');

let applicationData = null;


function renderAppIcon(appData) {
	if (appData && appData.icon) {
		return '<img src="' + appData.icon + '" alt="' + appData.title + ' Icon" title="' + appData.title + '">';
	}
	else {
		return '<i class="fas fa-cube" style="font-size: 1.5rem; color: white;"></i>';
	}
}

function createServicesTable() {

	if (document.getElementById('services-table')) {
		return; // Table already exists
	}

	let tableHTML = `
		<div style="overflow-x: auto;">
			<table id="services-table" style="width: 100%; border-collapse: collapse; background: rgba(0, 40, 80, 0.3); border: 1px solid rgba(0, 150, 255, 0.2); border-radius: 10px; overflow: hidden;">
				<thead>
					<tr class="header">
						<th>Host</th>
						<th>Game</th>
						<th>Server Name</th>
						<th>Status</th>
						<th>Port</th>
						<th>Players</th>
						<th>Memory</th>
						<th>CPU</th>
						<th>
							Actions
							<i id="services-loading-indicator" style="opacity:0" class="fas fa-sync-alt fa-spin"></i>
						</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		</div>
	`;

	servicesContainer.innerHTML = tableHTML;
}

/**
 *
 * @param servicesWithStats {[{app: AppData, host: HostAppData, service: ServiceData}]}
 */
function populateServicesTable(servicesWithStats) {
	console.log('Populating table with services:', servicesWithStats);

	if (servicesWithStats.length === 0) {
		servicesContainer.innerHTML = '<p style="color: #87ceeb; text-align: center; padding: 2rem;">No services found.</p>';
		return;
	}
	else {
		createServicesTable();
	}

	const table = document.getElementById('services-table');

	table.querySelectorAll('tr.service').forEach(row => {
		row.dataset.found = '0'; // Mark all existing rows as not found
	});

	servicesWithStats.forEach(record => {
		let service = record.service,
			app = record.app,
			host = record.host,
			row = table.querySelector('tr.service[data-host="' + host.host + '"][data-service="' + service.service + '"]'),
			fields = ['host', 'icon', 'name', 'status', 'port', 'players', 'memory', 'cpu', 'actions'],
			statusIcon = '',
			actionButtons = [],
			appIcon = renderAppIcon(app);

		if (service.status === 'running') {
			statusIcon = '<i class="fas fa-check-circle"></i>';
			actionButtons.push(`
<button data-host="${host.host}" data-service="${service.service}" data-action="stop" data-guid="${app.guid}" class="service-control action-stop">
	<i class="fas fa-stop"></i> Stop
</button>`);
		} else if (service.status === 'stopped') {
			statusIcon = '<i class="fas fa-times-circle"></i>';
			actionButtons.push(`
<button data-href="/service/configure/${app.guid}/${host.host}/${service.service}" class="link-control action-configure">
	<i class="fas fa-cog"></i> Config
</button>`);
			actionButtons.push(`
<button data-host="${host.host}" data-service="${service.service}" data-action="start" data-guid="${app.guid}" class="service-control action-start">
	<i class="fas fa-play"></i> Start
</button>`);
		} else if (service.status === 'starting' || service.status === 'stopping') {
			statusIcon = '<i class="fas fa-sync-alt fa-spin"></i>';
		} else {
			statusIcon = '<i class="fas fa-question-circle"></i>';
		}

		if (!row) {
			// Create new row
			row = document.createElement('tr');
			row.className = 'service';
			row.setAttribute('data-host', host.host);
			row.setAttribute('data-service', service.service);
			table.querySelector('tbody').appendChild(row);

			// Initialize empty cells
			fields.forEach(field => {
				const cell = document.createElement('td');
				cell.className = field;
				row.appendChild(cell);
			});
		}

		row.dataset.found = '1'; // Mark as found

		fields.forEach(field => {
			const cell = row.querySelector('td.' + field);
			let val = service[field] || '';

			if (field === 'host') {
				val = host.host;
			}
			else if (field === 'status') {
				val = statusIcon + ' ' + service[field].toUpperCase();
				cell.className = field + ' status-' + service[field];
			} else if (field === 'players') {
				val = service.player_count || 0;
				if (service.max_players) {
					val += ' / ' + service.max_players;
				}
			} else if (field === 'memory') {
				val = service.memory_usage || '-';
			} else if (field === 'cpu') {
				val = service.cpu_usage || '-';
			}
			else if (field === 'actions') {
				val = actionButtons.join(' ');
			}
			else if (field === 'icon') {
				val = appIcon;
			}

			cell.innerHTML = val;
		});
	});

	table.querySelectorAll('tr.service').forEach(row => {
		if (row.dataset.found === '0') {
			// Remove rows not found in the latest data
			row.remove();
			console.debug('Removed stale row for service:', row.dataset.service);
		}
	});
}

async function loadAllServicesAndStats() {
	if (document.getElementById('services-loading-indicator')) {
		document.getElementById('services-loading-indicator').style.opacity = '1';
	}

	fetchServices().then(services => {
		console.debug('Fetched services:', services);
		populateServicesTable(services);

		if (document.getElementById('services-loading-indicator')) {
			document.getElementById('services-loading-indicator').style.opacity = '0';
		}
	});
}

function serviceAction(guid, host, service, action) {
	fetch(`/api/service/${action}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			guid: guid,
			host: host,
			service: service
		})
	})
		.then(response => {
			console.debug(response);
		})
		.catch(error => {
			console.error('Network error:', error);
		});
}

/**
 *
 * @param {Object.<string, AppData>} applications
 */
function displayApplications(applications) {
	const applicationsList = document.getElementById('applicationsList');

	if (Object.keys(applications).length === 0) {
		applicationsList.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
                        <p>No applications found in /var/lib/warlock</p>
                    </div>
                `;
		return;
	}

	let html = '';
	for (const [guid, app] of Object.entries(applications)) {
		console.debug(app);
		// Extract the last folder name from the path
		let //pathParts = app.path.split('/').filter(part => part.length > 0),
			displayName = app.title || guid,
			icon = app.icon || null,
			thumbnail = app.thumbnail || null;

		if (!icon) {
			icon = '<i class="fas fa-cube" style="font-size: 1.5rem; color: white;"></i>';
		}
		else {
			icon = '<img src="' + icon + '" alt="' + displayName + ' Icon" style="width: 36px; height: 36px; border-radius: 6px;">';
		}

		if (thumbnail) {
			thumbnail = '<img class="app-thumbnail" src="' + thumbnail + '" alt="' + displayName + ' Thumbnail" style="width: 100%; height: auto;">';
		}


		html += `
                    <div class="application-card" style="background: rgba(26, 26, 46, 0.9); border: 1px solid rgba(0, 150, 255, 0.2); border-radius: 12px; padding: 1.5rem; transition: all 0.3s; cursor: pointer; position: relative; overflow: hidden;"
                         onmouseover="this.style.borderColor='#0096ff'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0, 150, 255, 0.3)';"
                         onmouseout="this.style.borderColor='rgba(0, 150, 255, 0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
                         onclick="window.open('/files.html?path=${encodeURIComponent(app.path)}', '_blank')">
                        ${thumbnail ? thumbnail : ''}
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #0096ff 0%, #0066cc 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0, 150, 255, 0.3);">
                                ${icon}
                            </div>
                            <div style="flex: 1;">
                                <h4 style="color: #0096ff; margin: 0; font-size: 1.1rem; font-weight: 600;">${displayName}</h4>
                            </div>
                        </div>
                        <div style="padding: 0.75rem; background: rgba(0, 40, 80, 0.4); border-radius: 6px; border-left: 3px solid #0096ff;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; color: #87ceeb; font-size: 0.9rem;">
                                <i class="fas fa-folder" style="color: #0096ff;"></i>
                                <span style="font-family: 'Monaco', monospace; word-break: break-all;">${app.path}</span>
                            </div>
                        </div>
                        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                            <button onclick="event.stopPropagation(); window.open('/files.html?path=${encodeURIComponent(app.path)}', '_blank')" 
                                    style="flex: 1; padding: 0.5rem; background: linear-gradient(135deg, #0096ff 0%, #0066cc 100%); border: none; border-radius: 6px; color: white; font-size: 0.85rem; cursor: pointer; transition: all 0.3s;"
                                    onmouseover="this.style.background='linear-gradient(135deg, #00a8ff 0%, #0077dd 100%)'"
                                    onmouseout="this.style.background='linear-gradient(135deg, #0096ff 0%, #0066cc 100%)'">
                                <i class="fas fa-folder-open"></i> Browse
                            </button>
                        </div>
                    </div>
                `;
	}

	applicationsList.innerHTML = html;
}


// Load navigation component
fetch('/components/nav')
	.then(response => response.text())
	.then(html => {
		document.getElementById('nav-placeholder').innerHTML = html;
	})
	.catch(error => console.error('Error loading navigation:', error));

// Load on page load
window.addEventListener('DOMContentLoaded', () => {
	fetchApplications().then(applications => {
		displayApplications(applications);

		loadAllServicesAndStats();
	}).catch(error => {
		console.error('Error fetching applications:', error);
	});

	// Auto-refresh every 5 seconds
	setInterval(() => {
		loadAllServicesAndStats();
	}, 10000);
});

// Dynamic events for various buttons
document.addEventListener('click', e => {
	if (e.target) {

		if (e.target.classList.contains('service-control') || e.target.closest('.service-control')) {
			let btn = e.target.classList.contains('service-control') ? e.target : e.target.closest('.service-control'),
				service = btn.dataset.service,
				action = btn.dataset.action,
				host = btn.dataset.host,
				guid = btn.dataset.guid;

			serviceAction(guid, host, service, action);
			e.preventDefault();
		}
		else if (e.target.classList.contains('link-control') || e.target.closest('.link-control')) {
			let btn = e.target.classList.contains('link-control') ? e.target : e.target.closest('.link-control'),
				href = btn.dataset.href;

			window.location.href = href;
			e.preventDefault();
		}
	}

});