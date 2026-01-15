// Example: populate one host entry from a JS object
function renderHost(host, hostData) {
	const hostContainer = document.createElement('div'),
		hostnameContainer = document.createElement('div'),
		metricsContainer = document.createElement('div');

	hostContainer.className = 'host-card';
	hostContainer.dataset.host = host;
	metricsContainer.className = 'host-metrics';

	const target = document.getElementById('hostsList');
	const cpuGraph = document.getElementById('cpu-speedometer-template').content.cloneNode(true);

	const thumbnail = hostContainer.appendChild(renderHostOSThumbnail(host));

	// Hostname
	hostnameContainer.className = 'host-title';
	const hostname = document.createElement('h4');
	hostname.className = 'host-name';
	hostname.innerHTML = `${renderHostIcon(host)} <span>${hostData.hostname || host}</span>`;
	hostnameContainer.appendChild(hostname);
/*
	// IP/
	const ip = document.createElement('div');
	ip.className = 'host-desc';
	ip.textContent = host || '';
	hostnameContainer.appendChild(ip);*/

	// Actions (Add Delete button)
	const actions = document.createElement('div');
	const deleteBtn = document.createElement('button');
	const firewallBtn = document.createElement('button');

	actions.className = 'host-actions';

	if (hostData.connected) {
		firewallBtn.className = 'link-control action-edit';
		firewallBtn.dataset.href = `/host/firewall/${encodeURIComponent(host)}`;
		firewallBtn.title = 'Host Firewall';
		firewallBtn.innerHTML = '<i class="fas fa-shield"></i>';
		actions.appendChild(firewallBtn);
	}

	deleteBtn.className = 'link-control action-remove';
	deleteBtn.dataset.href = `/host/delete/${encodeURIComponent(host)}`;
	deleteBtn.title = 'Delete Host';
	deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
	actions.appendChild(deleteBtn);

	hostnameContainer.appendChild(actions);

	// --- CPU: show speedometer + small percent text ---
	const cpu = document.createElement('div');
	cpu.className = 'metric-item metric-cpu';
	cpu.appendChild(cpuGraph);
	const cpuMeta = document.createElement('div');
	cpuMeta.className = 'metric-meta';
	const cpuModel = document.createElement('div');
	cpuModel.className = 'metric-label cpu-model';
	if (hostData.cpu.model) {
		cpuModel.textContent = (hostData.cpu.count > 1 ? `${hostData.cpu.count}x ` : '') + hostData.cpu.model;
		cpuMeta.appendChild(cpuModel);
	}
	const cpuPercent = document.createElement('div');
	cpuPercent.className = 'cpu-percent';
	cpuPercent.textContent = `${Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0))}%`;
	cpuMeta.appendChild(cpuPercent);
	cpu.appendChild(cpuMeta);
	metricsContainer.appendChild(cpu);

	// --- Memory: vertical bar with label ---
	const memory = document.createElement('div');
	memory.className = 'metric-item metric-memory';
	const memGraph = document.createElement('div');
	memGraph.className = 'mem-graph metric-graph';
	const memUsed = document.createElement('div');
	memUsed.className = 'mem-used';
	memGraph.appendChild(memUsed);
	memory.appendChild(memGraph);
	const memLabel = document.createElement('div');
	memLabel.className = 'metric-label mem-summary';
	memLabel.textContent = `${formatFileSize(hostData.memory.used)} / ${formatFileSize(hostData.memory.total)}`;
	memory.appendChild(memLabel);
	metricsContainer.appendChild(memory);

	// Memory values and state
	const used = Number(hostData.memory.used || 0);
	const total = Number(hostData.memory.total || 0) || 1;
	const memPct = Math.max(0, Math.min(100, (used / total) * 100));
	if (memPct >= 80) {
		memGraph.classList.add('usage-status-critical');
	}
	else if (memPct >= 60) {
		memGraph.classList.add('usage-status-warning');
	}
	else {
		memGraph.classList.add('usage-status-normal');
	}
	memUsed.style.height = `${memPct}%`;

	// --- Disk: aggregated summary ---
	const diskSummary = document.createElement('div');
	diskSummary.className = 'metric-item metric-disk-summary';
	let totalDisk = 0, totalAvail = 0;
	hostData.disks.forEach(disk => {
		totalDisk += Number(disk.size || 0);
		totalAvail += Number(disk.avail || 0);
	});
	const totalUsed = Math.max(0, totalDisk - totalAvail);
	const diskPct = totalDisk > 0 ? Math.round((totalUsed / totalDisk) * 100) : 0;
	diskSummary.innerHTML = `<div class="metric-label">Disk</div><div class="metric-value">${formatFileSize(totalAvail)} free (${diskPct}% used)</div>`;
	metricsContainer.appendChild(diskSummary);

	// Append a compact host details area with IP, cores and a per-disk list
	const details = document.createElement('div');
	details.className = 'host-details';
	// IP
	const ipItem = document.createElement('div');
	ipItem.className = 'detail-item detail-ip';
	// If IP looks like loopback or localhost, prefer to display public IPv4 if available
	let rawIp = hostData.ip || '';
	let publicIp = hostData.public_ip || '';
	let ipDisplay = rawIp;
	let ipClass = 'ip-value';
	let titleText = rawIp;
	if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.toLowerCase() === 'localhost' || rawIp.startsWith('127.') ) {
		if (publicIp) {
			ipDisplay = publicIp;
			ipClass += ' public';
			titleText = `raw: ${rawIp} (public: ${publicIp})`;
		}
		else {
			ipDisplay = hostData.hostname || rawIp || '';
			ipClass += ' loopback';
			titleText = rawIp;
		}
	}
	ipItem.innerHTML = `<i class="fas fa-network-wired"></i><span class="detail-label">IP</span><span class="detail-value ${ipClass}" title="${titleText}">${ipDisplay}</span>`;
	details.appendChild(ipItem);
	// Cores / Threads — show physical cores and logical threads (e.g., "8 cores / 16 threads")
	const coreItem = document.createElement('div');
	coreItem.className = 'detail-item detail-cores';
	const threads = hostData.cpu.threads || 0;
	const physical = hostData.cpu.physical_cores || (hostData.cpu.cores_per_socket && hostData.cpu.count ? (hostData.cpu.cores_per_socket * hostData.cpu.count) : 0);
	let coreText = '';
	if (physical && physical > 0) {
		coreText = `${physical} cores / ${threads} threads`;
	} else {
		coreText = `${threads} threads`;
	}
	coreItem.innerHTML = `<i class="fas fa-microchip"></i><span class="detail-label">Cores</span><span class="detail-value cores-value">${coreText}</span>`;
	details.appendChild(coreItem);
	// Memory percent
	const memItem = document.createElement('div');
	memItem.className = 'detail-item detail-memory';
	memItem.innerHTML = `<i class="fas fa-memory"></i><span class="detail-label">Memory</span><span class="detail-value mem-value">${Math.round(memPct)}%</span>`;
	details.appendChild(memItem);
	// CPU usage
	const cpuItem = document.createElement('div');
	cpuItem.className = 'detail-item detail-cpu';
	cpuItem.innerHTML = `<i class="fas fa-tachometer-alt"></i><span class="detail-label">CPU</span><span class="detail-value cpu-value">${Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0))}%</span>`;
	details.appendChild(cpuItem);
	// Disk per mountpoint (small)
	if (hostData.disks && hostData.disks.length) {
		const diskList = document.createElement('div');
		diskList.className = 'disk-list';
		hostData.disks.slice(0,3).forEach(disk => {
			const d = document.createElement('div');
			d.className = 'disk-item';
			const dUsed = Number(disk.used || 0), dSize = Number(disk.size || 0), dPct = dSize > 0 ? Math.round((dUsed / dSize) * 100) : 0;
			d.innerHTML = `<span class="disk-mount">${disk.mountpoint}</span><span class="disk-free">${formatFileSize(disk.avail)} free</span><span class="disk-pct">${dPct}%</span>`;
			diskList.appendChild(d);
		});
		details.appendChild(diskList);
	}

	hostContainer.appendChild(thumbnail);
	hostContainer.appendChild(hostnameContainer);
	hostContainer.appendChild(metricsContainer);
	hostContainer.appendChild(details);
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

	// TEST
	//hostData.cpu.usage = 95;

	// Update CPU needle and percent
	const cpuNeedle = hostContainer.querySelector('.gauge-needle');
	const percent = Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0));
	const rot = -90 + (percent * 180 / 100);
	cpuNeedle.style.transform = `rotate(${rot}deg)`;

	const arc = hostContainer.querySelector('.gauge-arc');
	if (arc) {
		const offset = 565 - (255 * (percent / 100));
		arc.style.strokeDashoffset = String(offset);
	}
	const cpuPercent = hostContainer.querySelector('.cpu-percent');
	if (cpuPercent) cpuPercent.textContent = `${percent}%`;
	const cpuValue = hostContainer.querySelector('.detail-cpu .cpu-value');
	if (cpuValue) cpuValue.textContent = `${percent}%`;
	// Update cores value (physical cores / logical threads)
	const coresValue = hostContainer.querySelector('.cores-value');
	if (coresValue) {
		const threads = hostData.cpu.threads || 0;
		const physical = hostData.cpu.physical_cores || (hostData.cpu.cores_per_socket && hostData.cpu.count ? (hostData.cpu.cores_per_socket * hostData.cpu.count) : 0);
		let coreText = '';
		if (physical && physical > 0) coreText = `${physical} cores / ${threads} threads`;
		else coreText = `${threads} threads`;
		coresValue.textContent = coreText;
	}
	// Update IP display in case it changed; keep loopback handling
	const ipElem = hostContainer.querySelector('.ip-value');
	if (ipElem) {
		let rawIp = hostData.ip || '';
		let publicIp = hostData.public_ip || '';
		let ipDisplay = rawIp;
		let isLoop = false;
		let titleText = rawIp;
		if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.toLowerCase() === 'localhost' || rawIp.startsWith('127.')) {
			if (publicIp) {
				ipDisplay = publicIp;
				titleText = `raw: ${rawIp} (public: ${publicIp})`;
				ipElem.classList.add('public');
				ipElem.classList.remove('loopback');
			} else {
				ipDisplay = hostData.hostname || rawIp || '';
				isLoop = true;
				ipElem.classList.add('loopback');
				ipElem.classList.remove('public');
			}
		}
		else {
			ipElem.classList.remove('public');
			ipElem.classList.remove('loopback');
		}
		ipElem.textContent = ipDisplay;
		ipElem.title = titleText;
	}

	// Update Memory
	const memUsedDiv = hostContainer.querySelector('.mem-used');
	const memGraph = hostContainer.querySelector('.mem-graph');
	const used = Number(hostData.memory.used || 0);
	const total = Number(hostData.memory.total || 0) || 1;
	const memPct = Math.max(0, Math.min(100, (used / total) * 100));
	memUsedDiv.style.height = `${memPct}%`;

	// Update memory status class
	memGraph.classList.remove('usage-status-normal', 'usage-status-warning', 'usage-status-critical');
	if (memPct >= 80) {
		memGraph.classList.add('usage-status-critical');
	}
	else if (memPct >= 60) {
		memGraph.classList.add('usage-status-warning');
	}
	else {
		memGraph.classList.add('usage-status-normal');
	}

	// Update memory label and detail
	const memLabel = hostContainer.querySelector('.metric-memory .mem-summary');
	if (memLabel) memLabel.textContent = `${formatFileSize(hostData.memory.used)} / ${formatFileSize(hostData.memory.total)}`;
	const memDetail = hostContainer.querySelector('.detail-memory .mem-value');
	if (memDetail) memDetail.textContent = `${Math.round(memPct)}%`;

	// Update disk summary and per-disk items
	let totalDisk = 0, totalAvail = 0;
	hostData.disks.forEach(disk => {
		totalDisk += Number(disk.size || 0);
		totalAvail += Number(disk.avail || 0);
	});
	const totalUsed = Math.max(0, totalDisk - totalAvail);
	const diskPct = totalDisk > 0 ? Math.round((totalUsed / totalDisk) * 100) : 0;
	const diskSummary = hostContainer.querySelector('.metric-disk-summary');
	if (diskSummary) {
		diskSummary.querySelector('.metric-value').textContent = `${formatFileSize(totalAvail)} free (${diskPct}% used)`;
	}
	// per-disk
	const diskItems = hostContainer.querySelectorAll('.disk-item');
	hostData.disks.slice(0, diskItems.length).forEach((disk, idx) => {
		const d = diskItems[idx];
		if (!d) return;
		const dUsed = Number(disk.used || 0), dSize = Number(disk.size || 0), dPct = dSize > 0 ? Math.round((dUsed / dSize) * 100) : 0;
		d.querySelector('.disk-free').textContent = `${formatFileSize(disk.avail)} free`;
		d.querySelector('.disk-pct').textContent = `${dPct}%`;
	});
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