function displayHostsWithApplications(hosts, applications) {
	const container = document.getElementById('hostsList');

	if (Object.keys(hosts).length === 0) {
		container.innerHTML = `
			<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
				<i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
				<p>No hosts configured!</p>
			</div>
		`;
		return;
	}

	let html = '';
	for (const [host, hostData] of Object.entries(hosts)) {
		console.debug(hostData);
		// Extract the last folder name from the path
		let displayName = hostData.hostname || host,
			osImage = null;

		if (hostData.os.name && hostData.os.version) {
			osImage = `/assets/media/wallpapers/servers/${hostData.os.name.toLowerCase()}_${hostData.os.version.toLowerCase()}.webp`;
		}
		else {
			osImage = '/assets/media/wallpapers/servers/generic.webp';
		}

		// IP display logic
		let rawIp = hostData.ip || '';
		let publicIp = hostData.public_ip || '';
		let ipDisplay = rawIp;
		if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.toLowerCase() === 'localhost' || rawIp.startsWith('127.')) {
			ipDisplay = publicIp || hostData.hostname || rawIp;
		}

		// Calculate stats
		const cpuPercent = Math.max(0, Math.min(100, Number(hostData.cpu.usage) || 0));
		const used = Number(hostData.memory.used || 0);
		const total = Number(hostData.memory.total || 0) || 1;
		const threads = hostData.cpu.threads || 0;
		const physical = hostData.cpu.physical_cores || (hostData.cpu.cores_per_socket && hostData.cpu.count ? (hostData.cpu.cores_per_socket * hostData.cpu.count) : 0);
		let modelText = hostData.cpu.model || 'Unknown';
		if (hostData.cpu.count > 1) {
			modelText = `${hostData.cpu.count}x ${modelText}`;
		}
		let coreText = '';
		if (physical && physical > 0) {
			coreText = `${physical} / ${threads}`;
		} else {
			coreText = `${threads}`;
		}

		html += `
			<div class="host-card">
				<div class="host-card-header" style="background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${osImage}'); background-size: cover; background-position: center;">
					<div class="host-card-title">
						<h3>${displayName}</h3>
						<p>${ipDisplay}</p>
					</div>
				</div>
				<div class="host-card-body">
					<div class="host-stats">
						<div class="host-stat">
							<span class="host-stat-label">CPU Usage</span>
							<span class="host-stat-value">${cpuPercent}%</span>
						</div>
						<div class="host-stat">
							<span class="host-stat-label">CPU Model</span>
							<span class="host-stat-value">${modelText}</span>
						</div>
						<div class="host-stat">
							<span class="host-stat-label">Memory</span>
							<span class="host-stat-value">${formatFileSize(used)} / ${formatFileSize(total)}</span>
						</div>
						<div class="host-stat">
							<span class="host-stat-label">Cores</span>
							<span class="host-stat-value">${coreText}</span>
						</div>
					</div>`;

		// Add the list of file systems on this host along with a pretty bargraph of disk usage
		if (hostData.disks && hostData.disks.length > 0) {
			html += `<div class="host-disks" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);"><h5 style="font-size: 0.75rem; text-transform: uppercase; opacity: 0.7; margin-bottom: 0.5rem;">Filesystems</h5>`;
			hostData.disks.forEach(fs => {
				let usagePercent = fs.size > 0 ? (fs.used / fs.size) * 100 : 0,
					usageStatus;

				if (usagePercent >= 90) {
					usageStatus = 'critical';
				}
				else if (usagePercent >= 75) {
					usageStatus = 'warning';
				}
				else {
					usageStatus = 'normal'
				}

				html += `<div class="filesystem link-control" data-href="/files/${host}?path=${fs.mountpoint}" title="Browse ${fs.mountpoint}">
					<div class="filesystem-row-header">
						<div class="filesystem-path" title="${fs.mountpoint}">${fs.mountpoint}</div>
					</div>
					
					<div class="filesystem-usage-bar">
						<div class="usage-fill usage-status-${usageStatus}" style="width: ${usagePercent}%;"></div>
						<div class="filesystem-usage-text">${formatFileSize(fs.used)} / ${formatFileSize(fs.size)} (${usagePercent.toFixed(1)}%)</div>
					</div>
				</div>`;
			});
			html += `</div>`;
		}

		// Add any application installed on this host
		html += '<div class="app-installs" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);"><h5 style="font-size: 0.75rem; text-transform: uppercase; opacity: 0.7; margin-bottom: 0.5rem;">Games Installed</h5>';
		for (const [guid, app] of Object.entries(applications)) {
			let isInstalled = app.hosts.some(h => h.host === host);
			if (isInstalled) {
				let gamePath = app.hosts.find(h => h.host === host).path;
				html += `<div class="app-install link-control" data-href="/files/${host}?path=${gamePath}" title="Browse Files">
					<span class="app-name">${renderAppIcon(guid)} ${app.title || guid}</span>
				</div>`;
			}
		}

		html += `</div></div></div>`;
	}

	container.innerHTML = html;
}

// Load on page load
window.addEventListener('DOMContentLoaded', () => {
	fetchHosts().then(hosts => {
		fetchApplications().then(applications => {
			// Display hosts
			displayHostsWithApplications(hosts, applications);
		}).catch(error => {
			document.getElementById('hostsList').innerHTML = `<div style="grid-column:1/-1;"><p class="error-message">${error}</p></div>`;
			console.error('Error fetching applications:', error);
		});
	}).catch(error => {
		document.getElementById('hostsList').innerHTML = `<div style="grid-column:1/-1;"><p class="error-message">${error}</p></div>`;
		console.error('Error fetching hosts:', error);
	});
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