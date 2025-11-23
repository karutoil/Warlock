const backupsList = document.getElementById('backupsList'),
	performBackupBtn = document.getElementById('performBackupBtn'),
	backupModal = document.getElementById('backupModal'),
	confirmBackupBtn = document.getElementById('confirmBackupBtn'),
	confirmRestoreBtn = document.getElementById('confirmRestoreBtn'),
	restoreModal = document.getElementById('restoreModal'),
	deleteModal = document.getElementById('deleteModal'),
	confirmDeleteBtn = document.getElementById('confirmDeleteBtn'),
	configureAutoBackupBtn = document.getElementById('configureAutoBackupBtn'),
	automatedBackupsDisabledMessage = document.getElementById('automatedBackupsDisabledMessage'),
	automatedBackupsEnabledMessage = document.getElementById('automatedBackupsEnabledMessage'),
	autoBackupModal = document.getElementById('autoBackupModal'),
	autoBackupSchedule = document.getElementById('autoBackupSchedule'),
	autoBackupTime = document.getElementById('autoBackupTime'),
	autoBackupWeeklyDay = document.getElementById('autoBackupWeeklyDay'),
	autoBackupKeep = document.getElementById('autoBackupKeep'),
	saveAutoBackupBtn = document.getElementById('saveAutoBackupBtn');

let backupPath, automaticBackups;

/**
 * Render a single backup file item
 *
 * @param {Object<modified: integer, name: string, size: integer, name: string>} fileData
 */
function renderBackupFile(fileData) {
	const fileItem = document.createElement('div');
	fileItem.classList.add('backup-file-item');
	fileItem.innerHTML = `
		<div class="file-modified">${convertTimestampToDateTimeString(fileData.modified)}</div>
		<div class="file-size">${formatFileSize(fileData.size)}</div>
		<div class="file-actions button-group">
			<button class="action-download">
				<i class="fas fa-download"></i>
				Download
			</button>
			<button class="action-restore">
				<i class="fas fa-undo"></i>
				Restore
			</button>
			<button class="action-remove">
				<i class="fas fa-trash"></i>
				Delete
			</button>
		</div>`;

	fileItem.querySelector('.action-download').addEventListener('click', () => {
		window.open(`/api/file/${loadedHost}?path=${fileData.path}&download=1`, '_blank');
	});
	fileItem.querySelector('.action-restore').addEventListener('click', () => {
		confirmRestoreBtn.dataset.file = fileData.name;
		restoreModal.querySelector('.warning-message').style.display = 'flex';
		restoreModal.querySelector('.terminal').style.display = 'none';
		restoreModal.classList.add('show');
	});
	fileItem.querySelector('.action-remove').addEventListener('click', () => {
		confirmDeleteBtn.dataset.path = fileData.path;
		deleteModal.classList.add('show');
	});

	return fileItem;
}

async function loadBackupsList() {
	if (!backupPath) {
		backupsList.innerHTML = '<p class="error-message">Backup path is not defined.</p>';
		return;
	}
	if (!loadedHost) {
		backupsList.innerHTML = '<p class="error-message">Host data is not loaded.</p>';
		return;
	}

	backupsList.innerHTML = '<div><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

	fetch(`/api/files/${loadedHost}?path=${backupPath}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		}
	})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				backupsList.innerHTML = '';
				// Sort them by modified timestamp, descending
				data.files.sort((a, b) => b.modified - a.modified);

				data.files.forEach(fileData => {
					if (fileData.name.endsWith('.tar.gz')) {
						backupsList.appendChild(renderBackupFile(fileData));
					}
				});
				console.log(data.files);
			}
			else {
				showToast('error', `Failed to load directory: ${data.error}`);
			}
		});
}

async function loadAutomaticBackupConfig() {
	if (!loadedHost) {
		return;
	}

	const autoBackupWeeklyDayRow = document.getElementById('autoBackupWeeklyDayRow');
	const autoBackupHost = document.getElementById('autoBackupHost');
	const autoBackupGuid = document.getElementById('autoBackupGuid');
	const saveAutoBackupBtn = document.getElementById('saveAutoBackupBtn');

	autoBackupSchedule.value = 'disabled';
	autoBackupTime.closest('.form-group').style.display = 'none';
	autoBackupWeeklyDay.closest('.form-group').style.display = 'none';
	autoBackupKeep.closest('.form-group').style.display = 'none';

	fetch(`/api/cron/${loadedHost}`, { method: 'GET' })
		.then(r => r.json())
		.then(data => {
			console.log(data);
			if (!data.success) {
				automaticBackups = [];
			}
			const identifier = `${loadedApplication}_backup`;
			const jobs = data.jobs || [];
			const job = jobs.find(j => j.identifier === identifier);
			if (!job) {
				automatedBackupsDisabledMessage.style.display = 'flex';
				automatedBackupsEnabledMessage.style.display = 'none';
				autoBackupSchedule.value = 'disabled';
				autoBackupWeeklyDayRow.style.display = 'none';
			} else {
				automatedBackupsDisabledMessage.style.display = 'none';
				automatedBackupsEnabledMessage.style.display = 'flex';
				// parse schedule
				if (job.schedule && job.schedule.startsWith('@')) {
					// treat @daily as daily
					if (job.schedule === '@daily') {
						autoBackupSchedule.value = 'daily';
					} else {
						autoBackupSchedule.value = 'daily';
					}
					// time unknown for @special; keep default
				} else if (job.schedule) {
					const parts = job.schedule.split(/\s+/);
					if (parts.length >= 5) {
						const minute = parts[0].padStart(2, '0');
						const hour = parts[1].padStart(2, '0');
						autoBackupTime.value = `${hour}:${minute}`;
						if (parts[4] && parts[4] !== '*') {
							autoBackupSchedule.value = 'weekly';
							autoBackupWeeklyDay.closest('.form-group').style.display = 'flex';
							autoBackupTime.closest('.form-group').style.display = 'flex';
							autoBackupKeep.closest('.form-group').style.display = 'flex';
							// map day number to option
							const dowNum = parts[4];
							const dowMap = { '0': 'sun', '1': 'mon', '2': 'tue', '3': 'wed', '4': 'thu', '5': 'fri', '6': 'sat', '7': 'sun' };
							autoBackupWeeklyDay.value = dowMap[dowNum] || 'sun';
						} else {
							autoBackupSchedule.value = 'daily';
							autoBackupWeeklyDay.closest('.form-group').style.display = 'none';
							autoBackupTime.closest('.form-group').style.display = 'flex';
							autoBackupKeep.closest('.form-group').style.display = 'flex';
						}
					}
				}

				// parse command for max-backups
				if (job.command) {
					const m = job.command.match(/--max-backups=(\d+)/);
					if (m) autoBackupKeep.value = parseInt(m[1], 10) || 0;
				}
			}
		})
		.catch(() => {
			// ignore fetch errors; show defaults
		});
}

async function saveAutomaticBackupConfig() {
	const scheduleSel = autoBackupSchedule.value;
	const time = autoBackupTime.value || '02:00';
	const keep = parseInt(autoBackupKeep.value, 10) || 0;
	const guid = loadedApplication;
	const identifier = `${loadedApplication}_backup`;
	const gameDir = (applicationData[guid] && applicationData[guid].hosts && applicationData[guid].hosts.filter(h => h.host === loadedHost)[0]) ? applicationData[guid].hosts.filter(h => h.host === loadedHost)[0].path : null;

	if (!gameDir) {
		showToast('error', 'Cannot determine game directory for this host.');
		return;
	}

	if (scheduleSel === 'disabled') {
		// Delete existing identifier
		fetch(`/api/cron/${loadedHost}`, {
			method: 'DELETE',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({identifier})
		})
			.then(r => r.json())
			.then(response => {
				if (response.success) {
					showToast('success', 'Automatic backups disabled.');
					autoBackupModal.classList.remove('show');
					loadAutomaticBackupConfig();
				} else {
					showToast('error', `Failed to disable automatic backups: ${response.error}`);
				}
			})
			.catch(() => showToast('error', 'Error disabling automatic backups'));
		return;
	}

	// Build cron schedule string
	const [hour, minute] = time.split(':');
	let cronSchedule = `${parseInt(minute, 10)} ${parseInt(hour, 10)}`;
	if (scheduleSel === 'weekly') {
		const dow = autoBackupWeeklyDay.value; // mon, tue...
		const dowMap = {'sun': '0', 'mon': '1', 'tue': '2', 'wed': '3', 'thu': '4', 'fri': '5', 'sat': '6'};
		cronSchedule += ` * * ${dowMap[dow]}`;
	} else {
		cronSchedule += ` * * *`;
	}

	// Build command
	const command = `${gameDir}/manage.py --backup --max-backups=${keep}`;

	fetch(`/api/cron/${loadedHost}`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({schedule: cronSchedule, command, identifier})
	})
		.then(r => r.json())
		.then(response => {
			if (response.success) {
				showToast('success', 'Automatic backup scheduled.');
				autoBackupModal.classList.remove('show');
				loadAutomaticBackupConfig();
			} else {
				showToast('error', `Failed to save schedule: ${response.error}`);
			}
		})
		.catch(() => showToast('error', 'Error saving schedule'));
}

/**
 * Primary handler to load the application on page load
 */
window.addEventListener('DOMContentLoaded', () => {

	const {guid, host} = getPathParams('/application/backups/:guid/:host');

	Promise.all([
		loadApplication(guid),
		loadHost(host)
	])
		.then(() => {

			backupPath = applicationData[guid].hosts.filter(h => h.host === host)[0].path + '/backups';

			loadAutomaticBackupConfig();
			loadBackupsList();

			performBackupBtn.addEventListener('click', () => {
				backupModal.classList.add('show');
				backupModal.querySelector('.warning-message').style.display = 'flex';
				backupModal.querySelector('.terminal').style.display = 'none';
			});

			confirmBackupBtn.addEventListener('click', () => {
				const terminalOutput = backupModal.querySelector('.terminal');

				backupModal.querySelector('.warning-message').style.display = 'none';
				terminalOutput.textContent = 'Performing backup... Please wait.\n';
				terminalOutput.style.display = 'block';
				stream(
					`/api/application/backup/${loadedApplication}/${loadedHost}`,
					'POST',
					{'Content-Type': 'application/json'},
					null,
					(event, data) => {
						terminalOutputHelper(terminalOutput, event, data);
					})
					.then(() => {
						showToast('success', 'Backup completed successfully.');
						loadBackupsList();
					}).catch(() => {
						showToast('error', 'Backup process encountered an error. See terminal output for details.');
					});
			});

			confirmRestoreBtn.addEventListener('click', () => {
				const terminalOutput = restoreModal.querySelector('.terminal'),
					fileName = confirmRestoreBtn.dataset.file;

				restoreModal.querySelector('.warning-message').style.display = 'none';
				terminalOutput.textContent = `Restoring backup '${fileName}'... Please wait.\n`;
				terminalOutput.style.display = 'block';
				stream(
					`/api/application/backup/${loadedApplication}/${loadedHost}`,
					'PUT',
					{'Content-Type': 'application/json'},
					JSON.stringify({filename: fileName}),
					(event, data) => {
						terminalOutputHelper(terminalOutput, event, data);
					})
					.then(() => {
						showToast('success', 'Restore completed successfully.');
					}).catch(() => {
						showToast('error', 'Restore process encountered an error. See terminal output for details.');
					});
			});

			confirmDeleteBtn.addEventListener('click', () => {
				const filePath = confirmDeleteBtn.dataset.path;

				fetch(`/api/file/${loadedHost}?path=${filePath}`, {
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json'
					}
				})
					.then(response => response.json())
					.then(data => {
						if (data.success) {
							showToast('success', `Backup '${filePath}' deleted successfully.`);
							deleteModal.classList.remove('show');
							loadBackupsList();
						} else {
							showToast('error', `Failed to delete backup: ${data.error}`);
						}
					})
					.catch(e => {
						showToast('error', `Error deleting backup: ${e.message}`);
					});
			});

			configureAutoBackupBtn.addEventListener('click', () => {
				autoBackupModal.classList.add('show');
			});

			autoBackupSchedule.addEventListener('change', () => {
				if (autoBackupSchedule.value === 'weekly') {
					autoBackupTime.closest('.form-group').style.display = 'flex';
					autoBackupWeeklyDay.closest('.form-group').style.display = 'flex';
					autoBackupKeep.closest('.form-group').style.display = 'flex';
				}
				else if (autoBackupSchedule.value === 'daily') {
					autoBackupTime.closest('.form-group').style.display = 'flex';
					autoBackupWeeklyDay.closest('.form-group').style.display = 'none';
					autoBackupKeep.closest('.form-group').style.display = 'flex';
				}
				else {
					autoBackupTime.closest('.form-group').style.display = 'none';
					autoBackupWeeklyDay.closest('.form-group').style.display = 'none';
					autoBackupKeep.closest('.form-group').style.display = 'none';
				}
			});

			saveAutoBackupBtn.addEventListener('click', () => {
				saveAutomaticBackupConfig();
			});
		}).catch(e => {
			console.error(e);
			document.querySelector('.content-body').innerHTML = '<div class="alert alert-danger" role="alert">Error loading application or host data.</div>';
		});
});
