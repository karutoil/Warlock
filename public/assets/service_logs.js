const logsContainer = document.getElementById('logsContainer'),
	logsModeHourBtn = document.getElementById('logs-mode-hour'),
	logsModeDayBtn = document.getElementById('logs-mode-day'),
	logsModeLiveBtn = document.getElementById('logs-mode-live'),
	logsPagerPrevBtn = document.getElementById('logs-pager-previous'),
	logsPagerNextBtn = document.getElementById('logs-pager-next');

let serviceIdentifier = null,
	mode = 'live',
	offset = 1,
	req = null;

// Prevent rapid switching between modes (client-side guard)
let logsLastRequestAt = 0;
const LOGS_RATE_LIMIT_MS = 3000; // 3 seconds

async function fetchLogs() {
	logsContainer.innerHTML = '';

	if (mode === 'live') {
		req = stream(
			`/api/service/logs/${loadedApplication}/${loadedHost}/${serviceIdentifier}`,
			'GET',
			{},
			null,
			(event, data) => {
				terminalOutputHelper(logsContainer, event, data);
			}
		);
	}
	else {
		if (req) {
			req.cancel();
			req = null;
		}

		// Render a header message in the logsContainer for the selected time period and offset
		let headerMessage = ``;
		if (mode === 'h') {
			if (offset === 1) {
				headerMessage = 'Logs for the past hour';
			}
			else {
				headerMessage = `Hourly logs from ${offset} hours ago`;
			}
		} else if (mode === 'd') {
			if (offset === 1) {
				headerMessage = 'Logs for the past day';
			}
			else {
				headerMessage = `Daily logs from ${offset} days ago`;
			}
		}

		const headerEntry = document.createElement('div');
		headerEntry.textContent = headerMessage;
		headerEntry.className = 'line-stdout log-header';
		logsContainer.appendChild(headerEntry);

		fetch(`/api/service/logs/${loadedApplication}/${loadedHost}/${serviceIdentifier}?mode=${mode}&offset=${offset}`, {
			method: 'GET',
		})
			.then(async response => {
				const contentType = response.headers.get('content-type') || '';
				if (!response.ok) {
					const text = await response.text();
					throw new Error(text || `HTTP ${response.status}`);
				}
				if (contentType.includes('application/json')) return response.json();
				return {success: true, compressed: false, data: await response.text()};
			})
			.then(result => {
				if (!result.success) {
					const logEntry = document.createElement('div');
					logEntry.textContent = `Error fetching logs: ${result.error || 'Unknown error'}`;
					logEntry.className = 'line-stderr';
					logsContainer.appendChild(logEntry);
					return;
				}

				let rawText = '';
				if (result.compressed && result.data) {
					try {
						const decompressMsg = document.createElement('div');
						decompressMsg.className = 'line-stdout';
						decompressMsg.style.opacity = 0.7;
						decompressMsg.textContent = '[INFO] Decompressing logs...';
						logsContainer.appendChild(decompressMsg);

						const b64 = result.data.replace(/\s+/g, '');
						const binary = atob(b64);
						const len = binary.length;
						const bytes = new Uint8Array(len);
						for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
						rawText = pako.ungzip(bytes, { to: 'string' });
						decompressMsg.remove();
					} catch (err) {
						const logEntry = document.createElement('div');
						logEntry.textContent = `Error decompressing logs: ${err.message}`;
						logEntry.className = 'line-stderr';
						logsContainer.appendChild(logEntry);
						return;
					}
				} else if (typeof result.data === 'string') {
					rawText = result.data;
				}

				if (!rawText || rawText.trim() === '') {
					const logEntry = document.createElement('div');
					logEntry.textContent = 'No logs available for the selected time period.';
					logEntry.className = 'line-stderr';
					logsContainer.appendChild(logEntry);
					return;
				}

				let lines = rawText.split('\n');
				lines.forEach(line => {
					const logEntry = document.createElement('div');
					logEntry.textContent = line;
					logEntry.className = 'line-stdout';
					logsContainer.appendChild(logEntry);
				});
			})
			.catch(e => {
				const logEntry = document.createElement('div');
				logEntry.textContent = `Error fetching logs: ${e.message}`;
				logEntry.className = 'line-stderr';
				logsContainer.appendChild(logEntry);
			});
	}

/*
	fetch(, {
		method: 'GET',
	})
		.then(response => response.text())
		.then(result => {
			let lines = result.split('\n'),
				scrolledToBottom = logsContainer.scrollHeight - logsContainer.clientHeight <= logsContainer.scrollTop + 1;
			// Only update if there are new lines
			lines.forEach(line => {
				if (!lastLogs.includes(line) && line.trim() !== '') {
					const logEntry = document.createElement('div');
					logEntry.textContent = line;
					logsContainer.appendChild(logEntry);
				}
			});

			lastLogs = lines;
			// Scroll to bottom
			if (scrolledToBottom) {
				logsContainer.scrollTop = logsContainer.scrollHeight;
			}
		});*/
}

async function fetchService() {
	return fetch(`/api/service/${loadedApplication}/${loadedHost}/${serviceIdentifier}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		}
	})
		.then(response => response.json())
		.then(result => {
			if (result.success && result.service) {
				let actionButtons = [];

				if (result.service.status === 'running') {
					actionButtons.push(`
<button data-host="${loadedHost}" data-service="${serviceIdentifier}" data-action="stop" data-guid="${loadedApplication}" class="service-control action-stop">
	<i class="fas fa-stop"></i> Stop
</button>`);
				}
				else if (result.service.status === 'stopped') {
					actionButtons.push(`
<button data-host="${loadedHost}" data-service="${serviceIdentifier}" data-action="start" data-guid="${loadedApplication}" class="service-control action-start">
	<i class="fas fa-play"></i> Start
</button>`);
				}
				else if (result.service.status === 'starting') {
					actionButtons.push(`
<button data-host="${loadedHost}" data-service="${serviceIdentifier}" data-action="stop" data-guid="${loadedApplication}" class="service-control action-stop">
	<i class="fas fa-stop"></i> Stop
</button>`);
				}

				document.querySelector('.content-header-buttons').innerHTML = actionButtons.join(' ');
			} else {
				throw new Error('Failed to fetch service data.');
			}
		});
}


/**
 * Primary handler to load the application on page load
 */
window.addEventListener('DOMContentLoaded', () => {
	const [app_guid, host, service] = window.location.pathname.substring(14).split('/');

	Promise.all([
		loadApplication(app_guid),
		loadHost(host)
	])
		.then(() => {
			serviceIdentifier = service;

			document.querySelectorAll('.service-service-placeholder').forEach(el => {
				el.innerHTML = service;
			});

			logsModeLiveBtn.classList.add('active');
			fetchLogs();

			setInterval(() => {
				fetchService();
			}, 20000);

			fetchService();

			logsModeLiveBtn.addEventListener('click', event => {
				event.preventDefault();
				const now = Date.now();
				if (now - logsLastRequestAt < LOGS_RATE_LIMIT_MS) {
					showToast('warning', 'Please wait a few seconds before switching log modes.');
					return;
				}
				logsLastRequestAt = now;
				if (mode !== 'live') {
					mode = 'live';
					offset = 1;
					logsContainer.innerHTML = '';
					logsModeLiveBtn.classList.add('active');
					logsModeHourBtn.classList.remove('active');
					logsModeDayBtn.classList.remove('active');
					logsPagerPrevBtn.classList.add('disabled');
					logsPagerNextBtn.classList.add('disabled');
					fetchLogs();
				}
			});
			logsModeHourBtn.addEventListener('click', event => {
				event.preventDefault();
				const now = Date.now();
				if (now - logsLastRequestAt < LOGS_RATE_LIMIT_MS) {
					showToast('warning', 'Please wait a few seconds before switching log modes.');
					return;
				}
				logsLastRequestAt = now;
				if (mode !== 'h') {
					mode = 'h';
					offset = 1;
					logsContainer.innerHTML = '';
					logsModeHourBtn.classList.add('active');
					logsModeLiveBtn.classList.remove('active');
					logsModeDayBtn.classList.remove('active');
					logsPagerPrevBtn.classList.remove('disabled');
					fetchLogs();
				}
			});
			logsModeDayBtn.addEventListener('click', event => {
				event.preventDefault();
				const now = Date.now();
				if (now - logsLastRequestAt < LOGS_RATE_LIMIT_MS) {
					showToast('warning', 'Please wait a few seconds before switching log modes.');
					return;
				}
				logsLastRequestAt = now;
				if (mode !== 'd') {
					mode = 'd';
					offset = 1;
					logsContainer.innerHTML = '';
					logsModeDayBtn.classList.add('active');
					logsModeLiveBtn.classList.remove('active');
					logsModeHourBtn.classList.remove('active');
					logsPagerPrevBtn.classList.remove('disabled');
					fetchLogs();
				}
			});
			logsPagerPrevBtn.addEventListener('click', event => {
				event.preventDefault();
				if (!logsPagerPrevBtn.classList.contains('disabled')) {
					offset += 1;
					logsContainer.innerHTML = '';
					logsPagerNextBtn.classList.remove('disabled');
					fetchLogs();
				}
			});
			logsPagerNextBtn.addEventListener('click', event => {
				event.preventDefault();
				if (!logsPagerNextBtn.classList.contains('disabled') && offset > 1) {
					offset -= 1;
					logsContainer.innerHTML = '';
					if (offset === 1) {
						logsPagerNextBtn.classList.add('disabled');
					}
					fetchLogs();
				}
			});

		})
		.catch(e => {
			console.error(e);
			logsContainer.innerHTML = '<div class="alert alert-danger" role="alert">Error loading application or host data.</div>';
		});
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

			e.preventDefault();

			if (btn.classList.contains('disabled')) {
				return;
			}
			btn.classList.add('disabled');
			serviceAction(guid, host, service, action);
		}
	}

});