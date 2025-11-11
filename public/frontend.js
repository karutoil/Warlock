const terminalOutput = document.getElementById('terminalOutput');
const servicesContainer = document.getElementById('servicesContainer');
const loadingStatus = document.getElementById('loadingStatus');
const refreshBtn = document.getElementById('refreshBtn');

let servicesData = [];

let applicationData = null;

function addTerminalLine(text, type = 'output') {
	const line = document.createElement('div');
	line.className = `output-text ${type}`;
	line.textContent = text;
	terminalOutput.appendChild(line);
	terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function clearTerminal() {
	terminalOutput.innerHTML = '';
}

function setLoadingStatus(message) {
	loadingStatus.textContent = message;
}

async function fetchServices() {
	try {
		const response = await fetch('/get-services', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const result = await response.json();

		console.log('Get Services Result:', result);

		if (result.success) {
			// Check if services array exists
			if (result.services && Array.isArray(result.services)) {
				// Backend returns: [{name: "service", application: "App", path: "/path"}, ...]
				return result.services;
			}

			// If no services array, try to parse the output
			if (result.output) {
				try {
					const parsed = JSON.parse(result.output.trim());
					// If it's an object with service data
					if (typeof parsed === 'object' && !Array.isArray(parsed)) {
						// Extract all services from the object
						const services = [];
						Object.keys(parsed).forEach(serviceName => {
							const serviceData = parsed[serviceName];
							services.push({
								name: serviceName,
								application: result.applications?.[0]?.name || 'Unknown',
								path: result.applications?.[0]?.path || '',
								statsData: serviceData // Include the full service data
							});
						});
						return services;
					}
				} catch (e) {
					console.error('Error parsing services output:', e);
				}
			}
		}

		addTerminalLine('Failed to get services: ' + (result.error || 'Unknown error'), 'error');
		return [];
	} catch (error) {
		console.error('Error fetching services:', error);
		addTerminalLine('Network error fetching services: ' + error.message, 'error');
		return [];
	}
}

async function fetchStatsForService(serviceName) {
	try {
		const response = await fetch('/get-stats', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ service: serviceName })
		});

		const result = await response.json();

		if (result.success && result.output) {
			// Parse the JSON stats output
			try {
				const statsJson = JSON.parse(result.output.trim());
				// The stats JSON contains ALL services from the application
				// Format: {"service-name": {...stats...}, "service-name-2": {...stats...}}

				return {
					serviceName: serviceName,
					stats: result.output,
					statsData: statsJson, // Return entire stats object
					success: true
				};
			} catch (e) {
				console.error('Error parsing stats JSON for ' + serviceName + ':', e);
				return {
					serviceName: serviceName,
					stats: result.output,
					statsData: null,
					success: false
				};
			}
		} else {
			return {
				serviceName: serviceName,
				stats: result.error || 'Failed to get stats',
				statsData: null,
				success: false
			};
		}
	} catch (error) {
		console.error('Error fetching stats for ' + serviceName + ':', error);
		return {
			serviceName: serviceName,
			stats: 'Network error: ' + error.message,
			statsData: null,
			success: false
		};
	}
}

function getAppIcon(guid) {
	// Try to get application icon from localStorage cache
	let appData = null;

	if (applicationData) {
		appData = applicationData[guid];
	}

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
						<th>Actions</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		</div>
	`;

	servicesContainer.innerHTML = tableHTML;
}

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

	servicesWithStats.forEach(service => {
		console.log(`Processing service:`, service);

		let row = table.querySelector('tr.service[data-host="' + service.host + '"][data-service="' + service.service + '"]'),
			fields = ['host', 'icon', 'name', 'status', 'port', 'players', 'memory', 'cpu', 'actions'],
			statusIcon = '',
			actionButtons = [],
			appIcon = getAppIcon(service.app_guid);

		if (service.status === 'running') {
			statusIcon = '<i class="fas fa-check-circle"></i>';
			actionButtons.push(`
<button data-host="${service.host}" data-service="${service.service}" data-action="stop" class="service-control action-stop">
	<i class="fas fa-stop"></i> Stop
</button>`);
		} else if (service.status === 'stopped') {
			statusIcon = '<i class="fas fa-times-circle"></i>';
			actionButtons.push(`
<button data-host="${service.host}" data-service="${service.service}" data-action="start" class="service-control action-start">
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
			row.setAttribute('data-host', service.host);
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

			if (field === 'status') {
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
	refreshBtn.disabled = true;
	refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
	clearTerminal();
	addTerminalLine('> Loading services and stats...', 'command');

	setLoadingStatus('Fetching services...');

	// Step 1: Get all services
	fetchServices().then(services => {
		console.debug('Fetched services:', services);
		addTerminalLine(`Found ${services.length} service(s)`, 'success');
		populateServicesTable(services);

		setLoadingStatus('');
		refreshBtn.disabled = false;
		refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
		addTerminalLine('All services and stats loaded successfully', 'success');
	});
}

async function manualGetServices() {
	clearTerminal();
	addTerminalLine('> Executing: ./manage.py --get-services', 'command');
	addTerminalLine('Connecting to remote server...', 'info');

	const btn = document.getElementById('getServicesBtn');
	btn.disabled = true;
	btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';

	try {
		const response = await fetch('/get-services', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const result = await response.json();

		console.log('Get Services Result:', result);

		if (result.success) {
			addTerminalLine('Command executed successfully:', 'success');
			addTerminalLine('');

			// Split output by lines and display each
			const outputLines = result.output.split('\n');
			outputLines.forEach(line => {
				if (line.trim()) {
					addTerminalLine(line);
				}
			});

			if (result.stderr) {
				addTerminalLine('');
				addTerminalLine('Warnings/Errors:', 'warning');
				result.stderr.split('\n').forEach(line => {
					if (line.trim()) {
						addTerminalLine(line, 'error');
					}
				});
			}
		} else {
			addTerminalLine('Command failed:', 'error');
			addTerminalLine(result.error || 'Unknown error', 'error');
			if (result.output) {
				addTerminalLine('');
				addTerminalLine('Output:', 'warning');
				addTerminalLine(result.output);
			}
		}
	} catch (error) {
		console.error('Network error:', error);
		addTerminalLine('Network error: ' + error.message, 'error');
	} finally {
		btn.disabled = false;
		btn.innerHTML = '<i class="fas fa-list"></i> Get Services';
	}
}

async function manualGetStats() {
	clearTerminal();
	addTerminalLine('> Executing: ./manage.py --get-stats', 'command');
	addTerminalLine('Connecting to remote server...', 'info');

	const btn = document.getElementById('getStatsBtn');
	btn.disabled = true;
	btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';

	try {
		const response = await fetch('/get-stats', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const result = await response.json();

		console.log('Get Stats Result:', result);

		if (result.success) {
			addTerminalLine('Command executed successfully:', 'success');
			addTerminalLine('');

			// Split output by lines and display each
			const outputLines = result.output.split('\n');
			outputLines.forEach(line => {
				if (line.trim()) {
					addTerminalLine(line);
				}
			});

			if (result.stderr) {
				addTerminalLine('');
				addTerminalLine('Warnings/Errors:', 'warning');
				result.stderr.split('\n').forEach(line => {
					if (line.trim()) {
						addTerminalLine(line, 'error');
					}
				});
			}
		} else {
			addTerminalLine('Command failed:', 'error');
			addTerminalLine(result.error || 'Unknown error', 'error');
			if (result.output) {
				addTerminalLine('');
				addTerminalLine('Output:', 'warning');
				addTerminalLine(result.output);
			}
		}
	} catch (error) {
		console.error('Network error:', error);
		addTerminalLine('Network error: ' + error.message, 'error');
	} finally {
		btn.disabled = false;
		btn.innerHTML = '<i class="fas fa-chart-bar"></i> Get Stats';
	}
}

function serviceAction(host, service, action) {
	addTerminalLine(`> Executing on ${host}: systemctl ${action} ${service}`, 'command');
	addTerminalLine('Connecting to remote server...', 'info');

	fetch('/service-action', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			host: host,
			service: service,
			action: action
		})
	})
		.then(response => {
			console.debug(response);
		})
		.catch(error => {
			console.error('Network error:', error);
		});
}

async function fetchApplications() {
	// Try to use localStorage for faster results, defaulting back to the manual fetch
	return new Promise((resolve, reject) => {
		//let applications = localStorage.getItem('applications');
		let applications = null;

		if (applications) {
			applicationData = JSON.parse(applications);
			resolve(applicationData);
		}
		else {
			fetch('/get-applications', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			})
				.then(response => response.json())
				.then(result => {
					if (result.success && result.applications) {
						localStorage.setItem('applications', JSON.stringify(result.applications));
						applicationData = result.applications;
						resolve(result.applications);
					} else {
						reject(result.error);
					}
				})
				.catch(error => {
					console.error('Error fetching applications:', error);
					reject(error);
				});
		}
	});
}

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

// Event listeners
refreshBtn.addEventListener('click', loadAllServicesAndStats);
document.getElementById('getServicesBtn').addEventListener('click', manualGetServices);
document.getElementById('getStatsBtn').addEventListener('click', manualGetStats);

// Load navigation component
fetch('/components/nav')
	.then(response => response.text())
	.then(html => {
		document.getElementById('nav-placeholder').innerHTML = html;
	})
	.catch(error => console.error('Error loading navigation:', error));

// Load on page load
window.addEventListener('DOMContentLoaded', () => {
	addTerminalLine('Dashboard loaded. Fetching applications and services...', 'info');
	fetchApplications().then(applications => {
		displayApplications(applications);
	}).catch(error => {
		console.error('Error fetching applications:', error);
		addTerminalLine('Error fetching applications: ' + error, 'error');
	});
	loadAllServicesAndStats();

	// Auto-refresh every 5 seconds
	setInterval(() => {
		addTerminalLine('Auto-refreshing...', 'info');
		loadAllServicesAndStats();
	}, 10000);
});

// Dynamic events for various buttons
document.addEventListener('click', e => {
	if (e.target && (e.target.classList.contains('service-control') || e.target.closest('.service-control'))) {
		let btn = e.target.classList.contains('service-control') ? e.target : e.target.closest('.service-control'),
			service = btn.dataset.service,
			action = btn.dataset.action,
			host = btn.dataset.host;

		serviceAction(host, service, action);
		e.preventDefault();
	}
});