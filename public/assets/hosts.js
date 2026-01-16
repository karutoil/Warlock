// Get host OS background image URL
function getHostOSImage(host) {
	let hostInfo = hostData && hostData[host] || null;
	
	if (!hostInfo) {
		return '/assets/media/wallpapers/servers/generic.webp';
	}
	
	if (!hostInfo.connected) {
		return '/assets/media/wallpapers/servers/disconnected.webp';
	}
	else if (hostInfo.os.name && hostInfo.os.version) {
		return `/assets/media/wallpapers/servers/${hostInfo.os.name.toLowerCase()}_${hostInfo.os.version.toLowerCase()}.webp`;
	}
	else {
		return '/assets/media/wallpapers/servers/generic.webp';
	}
}

// Example: populate one host entry from a JS object
function renderHost(host, hostData) {
	const hostContainer = document.createElement('div'),
		cardHeader = document.createElement('div'),
		cardBody = document.createElement('div'),
		statsContainer = document.createElement('div'),
		actionsContainer = document.createElement('div');

	hostContainer.className = 'host-card';
	hostContainer.dataset.host = host;
	cardHeader.className = 'host-card-header';
	cardBody.className = 'host-card-body';
	statsContainer.className = 'host-stats';
	actionsContainer.className = 'host-actions';

	const target = document.getElementById('hostsList');

	// Get OS thumbnail for header background
	const osImage = getHostOSImage(host);
	if (osImage) {
		cardHeader.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${osImage}')`;
		cardHeader.style.backgroundSize = 'cover';
		cardHeader.style.backgroundPosition = 'center';
	}

	// Card Header - Title section
	const titleContainer = document.createElement('div');
	titleContainer.className = 'host-card-title';
	
	const hostname = document.createElement('h3');
	hostname.textContent = hostData.hostname || host;
	titleContainer.appendChild(hostname);

	// IP as subtitle
	let rawIp = hostData.ip || '';
	let publicIp = hostData.public_ip || '';
	let ipDisplay = rawIp;
	if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.toLowerCase() === 'localhost' || rawIp.startsWith('127.')) {
		ipDisplay = publicIp || hostData.hostname || rawIp;
	}
	const ipSubtitle = document.createElement('p');
	ipSubtitle.textContent = ipDisplay;
	titleContainer.appendChild(ipSubtitle);

	cardHeader.appendChild(titleContainer);

	// --- Card Body Stats ---
	
	// CPU Stat
	const cpuStat = document.createElement('div');
	cpuStat.className = 'host-stat';
	const cpuLabel = document.createElement('span');
	cpuLabel.className = 'host-stat-label';
	cpuLabel.textContent = 'CPU Usage';
	const cpuValue = document.createElement('span');
	cpuValue.className = 'host-stat-value cpu-value';
	const cpuPercent = Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0));
	cpuValue.textContent = `${cpuPercent}%`;
	cpuStat.appendChild(cpuLabel);
	cpuStat.appendChild(cpuValue);
	statsContainer.appendChild(cpuStat);

	// CPU Model Stat
	const cpuModelStat = document.createElement('div');
	cpuModelStat.className = 'host-stat';
	const cpuModelLabel = document.createElement('span');
	cpuModelLabel.className = 'host-stat-label';
	cpuModelLabel.textContent = 'CPU Model';
	const cpuModelValue = document.createElement('span');
	cpuModelValue.className = 'host-stat-value cpu-model';
	const threads = hostData.cpu.threads || 0;
	const physical = hostData.cpu.physical_cores || (hostData.cpu.cores_per_socket && hostData.cpu.count ? (hostData.cpu.cores_per_socket * hostData.cpu.count) : 0);
	let modelText = hostData.cpu.model || 'Unknown';
	if (hostData.cpu.count > 1) {
		modelText = `${hostData.cpu.count}x ${modelText}`;
	}
	cpuModelValue.textContent = modelText;
	cpuModelStat.appendChild(cpuModelLabel);
	cpuModelStat.appendChild(cpuModelValue);
	statsContainer.appendChild(cpuModelStat);

	// Memory Stat
	const memStat = document.createElement('div');
	memStat.className = 'host-stat';
	const memLabel = document.createElement('span');
	memLabel.className = 'host-stat-label';
	memLabel.textContent = 'Memory';
	const memValue = document.createElement('span');
	memValue.className = 'host-stat-value mem-value';
	const used = Number(hostData.memory.used || 0);
	const total = Number(hostData.memory.total || 0) || 1;
	const memPct = Math.max(0, Math.min(100, (used / total) * 100));
	memValue.textContent = `${formatFileSize(used)} / ${formatFileSize(total)}`;
	memStat.appendChild(memLabel);
	memStat.appendChild(memValue);
	statsContainer.appendChild(memStat);

	// Cores/Threads Stat
	const coresStat = document.createElement('div');
	coresStat.className = 'host-stat';
	const coresLabel = document.createElement('span');
	coresLabel.className = 'host-stat-label';
	coresLabel.textContent = 'Cores';
	const coresValue = document.createElement('span');
	coresValue.className = 'host-stat-value cores-value';
	let coreText = '';
	if (physical && physical > 0) {
		coreText = `${physical} / ${threads}`;
	} else {
		coreText = `${threads}`;
	}
	coresValue.textContent = coreText;
	coresStat.appendChild(coresLabel);
	coresStat.appendChild(coresValue);
	statsContainer.appendChild(coresStat);

	// Storage Stat (aggregated disk usage)
	const storageStat = document.createElement('div');
	storageStat.className = 'host-stat';
	const storageLabel = document.createElement('span');
	storageLabel.className = 'host-stat-label';
	storageLabel.textContent = 'Storage';
	const storageValue = document.createElement('span');
	storageValue.className = 'host-stat-value storage-value';
	let totalDisk = 0, totalAvail = 0;
	hostData.disks.forEach(disk => {
		totalDisk += Number(disk.size || 0);
		totalAvail += Number(disk.avail || 0);
	});
	const totalUsed = Math.max(0, totalDisk - totalAvail);
	const diskPct = totalDisk > 0 ? Math.round((totalUsed / totalDisk) * 100) : 0;
	storageValue.textContent = `${formatFileSize(totalAvail)} free (${diskPct}%)`;
	storageStat.appendChild(storageLabel);
	storageStat.appendChild(storageValue);
	statsContainer.appendChild(storageStat);

	cardBody.appendChild(statsContainer);

	// --- Action Buttons ---
	
	// Agent Status Indicator (if available)
	if (typeof WarlockSocket !== 'undefined') {
		const agentStatus = document.createElement('div');
		agentStatus.className = 'host-agent-status';
		agentStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Checking agent...';
		agentStatus.style.cssText = 'padding: 0.5rem; margin-bottom: 0.5rem; font-size: 0.85rem; border-radius: 4px; text-align: center;';
		
		// Check agent status via API
		fetch(`/api/agents/${encodeURIComponent(host)}`)
			.then(r => r.json())
			.then(data => {
				if (data.success) {
					if (data.connected) {
						agentStatus.className = 'host-agent-status connected';
						agentStatus.innerHTML = '<i class="fas fa-check-circle"></i> Agent Connected';
						agentStatus.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
						agentStatus.style.color = '#4CAF50';
					} else if (data.installed) {
						agentStatus.className = 'host-agent-status installed';
						agentStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Agent Offline';
						agentStatus.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
						agentStatus.style.color = '#FFC107';
					} else {
						agentStatus.className = 'host-agent-status not-installed';
						agentStatus.innerHTML = '<i class="fas fa-times-circle"></i> Agent Not Installed';
						agentStatus.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
						agentStatus.style.color = '#F44336';
					}
				}
			})
			.catch(err => {
				agentStatus.innerHTML = '<i class="fas fa-question-circle"></i> Status Unknown';
				agentStatus.style.backgroundColor = 'rgba(128, 128, 128, 0.2)';
			});
		
		cardBody.insertBefore(agentStatus, actionsContainer);
	}
	
	// Files Button
	const filesBtn = document.createElement('button');
	filesBtn.className = 'host-action-btn link-control';
	filesBtn.dataset.href = `/files/${encodeURIComponent(host)}`;
	filesBtn.title = 'Browse Files';
	filesBtn.innerHTML = '<i class="fas fa-folder"></i><span>Files</span>';
	actionsContainer.appendChild(filesBtn);

	// Firewall Button
	if (hostData.connected) {
		const firewallBtn = document.createElement('button');
		firewallBtn.className = 'host-action-btn link-control';
		firewallBtn.dataset.href = `/host/firewall/${encodeURIComponent(host)}`;
		firewallBtn.title = 'Host Firewall';
		firewallBtn.innerHTML = '<i class="fas fa-shield"></i><span>Firewall</span>';
		actionsContainer.appendChild(firewallBtn);
	}

	// Delete Button
	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'host-action-btn delete link-control';
	deleteBtn.dataset.href = `/host/delete/${encodeURIComponent(host)}`;
	deleteBtn.title = 'Delete Host';
	deleteBtn.innerHTML = '<i class="fas fa-trash"></i><span>Delete</span>';
	actionsContainer.appendChild(deleteBtn);

	cardBody.appendChild(actionsContainer);

	// Append to container
	hostContainer.appendChild(cardHeader);
	hostContainer.appendChild(cardBody);
	target.appendChild(hostContainer);
}

/**
 * Updating an existing host entry with new metrics
 *
 * @param {string} host
 * @param {HostData} hostData
 */
function updateHost(host, hostData) {
	const hostContainer = document.querySelector(`.host-card[data-host="${host}"]`);
	if (!hostContainer) {
		// Host not found, render new
		renderHost(host, hostData);
		return;
	}

	// Update CPU value
	const cpuValue = hostContainer.querySelector('.cpu-value');
	if (cpuValue) {
		const cpuPercent = Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0));
		cpuValue.textContent = `${cpuPercent}%`;
	}

	// Update CPU model
	const cpuModel = hostContainer.querySelector('.cpu-model');
	if (cpuModel) {
		let modelText = hostData.cpu.model || 'Unknown';
		if (hostData.cpu.count > 1) {
			modelText = `${hostData.cpu.count}x ${modelText}`;
		}
		cpuModel.textContent = modelText;
	}

	// Update cores/threads
	const coresValue = hostContainer.querySelector('.cores-value');
	if (coresValue) {
		const threads = hostData.cpu.threads || 0;
		const physical = hostData.cpu.physical_cores || (hostData.cpu.cores_per_socket && hostData.cpu.count ? (hostData.cpu.cores_per_socket * hostData.cpu.count) : 0);
		let coreText = '';
		if (physical && physical > 0) {
			coreText = `${physical} / ${threads}`;
		} else {
			coreText = `${threads}`;
		}
		coresValue.textContent = coreText;
	}

	// Update Memory
	const memValue = hostContainer.querySelector('.mem-value');
	if (memValue) {
		const used = Number(hostData.memory.used || 0);
		const total = Number(hostData.memory.total || 0) || 1;
		memValue.textContent = `${formatFileSize(used)} / ${formatFileSize(total)}`;
	}

	// Update Storage
	const storageValue = hostContainer.querySelector('.storage-value');
	if (storageValue) {
		let totalDisk = 0, totalAvail = 0;
		hostData.disks.forEach(disk => {
			totalDisk += Number(disk.size || 0);
			totalAvail += Number(disk.avail || 0);
		});
		const totalUsed = Math.max(0, totalDisk - totalAvail);
		const diskPct = totalDisk > 0 ? Math.round((totalUsed / totalDisk) * 100) : 0;
		storageValue.textContent = `${formatFileSize(totalAvail)} free (${diskPct}%)`;
	}
}

// Example usage: replace loading state and render array
function renderHosts(hosts) {
	const container = document.getElementById('hostsList');

	if (Object.keys(hosts).length === 0) {
		container.innerHTML = '<div style="grid-column:1/-1;"><p class="error-message">No hosts found</p></div>';
		return;
	}

	Object.keys(hosts).forEach(hostId => {
		if (document.querySelector(`.host-card[data-host="${hostId}"]`)) {
			updateHost(hostId, hosts[hostId]);
		}
		else {
			renderHost(hostId, hosts[hostId]);
		}
	});
}

function displayNoHosts() {
	const hostsList = document.getElementById('hostsList');
	hostsList.innerHTML = `
		<div style="grid-column: 1 / -1;">
			<div class="error-message">
				<p style="text-align:center; width:100%;">
					<i class="fas fa-server" style="font-size: 2rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
					<br/>
					No hosts available. Please <a href="/host/add">add a host</a> to manage applications and services.
				</p>
			</div>
		</div>
	`;
}

fetchHosts().then(hosts => {
	if (Object.values(hosts).length === 0) {
		displayNoHosts();
		return;
	}

	setInterval(() => {
		fetchHosts().then(hosts => renderHosts(hosts));
	}, 5000);

	renderHosts(hosts);
}).catch(err => {
	console.error('Error fetching hosts:', err);
});

// Dynamic events for various buttons
document.addEventListener('click', e => {
	if (e.target) {
		if (e.target.classList.contains('link-control') || e.target.closest('.link-control')) {
			let btn = e.target.classList.contains('link-control') ? e.target : e.target.closest('.link-control'),
				href = btn.dataset.href;

			e.preventDefault();

			window.location.href = href;
		}
	}
});