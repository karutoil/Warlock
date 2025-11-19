/**
 * Represents the details of an application.
 *
 * @typedef {Object} AppData
 * @property {string} title Name of the application.
 * @property {string} guid Globally unique identifier of the application.
 * @property {string} icon Icon URL of the application.
 * @property {string} repo Repository URL fragment of the application.
 * @property {string} installer Installer URL fragment of the application.
 * @property {string} source Source handler for the application installer.
 * @property {string} thumbnail Thumbnail URL of the application.
 * @property {string} image Full size image URL of the application.
 * @property {string} header Header image URL of the application.
 */

/**
 * Represents the details of a host specifically regarding an installed application.
 *
 * @typedef {Object} HostAppData
 * @property {string} host Hostname or IP of host.
 * @property {string} path Path where the application is installed on the host.
 *
 */

/**
 * Represents the details of a start/pre-start execution result from systemd
 *
 * @typedef {Object} ServiceExecResult
 * @property {string} arguments Raw arguments passed to the service handler
 * @property {string,null} code Exit code/message of the execution
 * @property {string} path Working path of the application when executed
 * @property {string} pid Process ID of the execution
 * @property {number} runtime Time taken for the execution in seconds, or NULL if still running
 * @property {number,null} start_time Timestamp of when the execution started
 * @property {number} status Numeric status code of the execution result, 0 means success
 * @property {number,null} stop_time Timestamp of when the execution stopped, or NULL if still running
 */

/**
 * Represents the details of a service.
 *
 * @typedef {Object} ServiceData
 * @property {string} name Name of the service, usually operator set for the instance/map name.
 * @property {string} service Service identifier registered in systemd.
 * @property {string} status Current status of the service, one of [running, stopped, starting, stopping].
 * @property {string} cpu_usage Current CPU usage of the service as a percentage or 'N/A'.
 * @property {string} memory_usage Current memory usage of the service in MB/GB or 'N/A'.
 * @property {number} game_pid Process ID of the game server process, or 0 if not running.
 * @property {number} service_pid Process ID of the service manager process, or 0 if not running.
 * @property {string} ip IP address the service is bound to.
 * @property {number} port Port number the service is using.
 * @property {number} player_count Current number of players connected to the service.
 * @property {number} max_players Maximum number of players allowed on the service.
 * @property {ServiceExecResult,null} pre_exec Details of the last start execution attempt.
 * @property {ServiceExecResult,null} start_exec Details of the last stop execution attempt.
 */

/**
 * Represents a configuration option for a given service or app
 *
 * @typedef {Object} AppConfigOption
 * @property {string} option Name of the configuration option.
 * @property {string|number|bool} value Current value of the configuration option.
 * @property {string|number|bool} default Default value of the configuration option.
 * @property {string} type Data type of the configuration option (str, int, bool, float, text).
 * @property {string} help Help text or description for the configuration option.
 */

/**
 * Representation of a file on the filesystem
 *
 * @typedef {Object} FileData
 * @property {string} name Basename of the file (without path)
 * @property {string} path Full path name of the file, (with symlinks resolving to the full destination)
 * @property {number} size Size of the file in bytes
 * @property {string} mimetype MIME type of the file, eg "text/plain" or "application/octet-stream"
 * @property {string} encoding Encoding to use for content parsing, or null if binary
 * @property {string} content Content of the file as a string, or null if binary
 */

/**
 * Representation of a server host
 *
 * @typedef {Object} HostData
 * @property {string} hostname Resolved system hostname of the host.
 * @property {boolean} connected Whether the host is currently connected.
 * @property {{name:string, title:string, version:string}} os Operating system information of the host.
 * @property {[{filesystem:string, fstype:string, used:int, avail:int, mountpoint:str}]} disks List of disk partitions on the host.
 */

/**
 * Cache of application data received from the backend.
 * @type {Object<string, AppData>}
 */
let applicationData = null;

/**
 * Cache of host data received from the backend.
 * @type {Object<string, HostData>}
 */
let hostData = null;

/**
 * Application GUID of the currently loaded application.
 *
 * @type {string|null}
 */
let loadedApplication = null;

/**
 * Host identifier of the currently loaded host.
 *
 * @type {string|null}
 */
let loadedHost = null;

/**
 * Fetches the list of services from the backend API.
 *
 * @returns {Promise<[{app: AppData, host: HostAppData, service: ServiceData}]>} A promise that resolves to an array of AppDetails objects.
 */
async function fetchServices() {
	return new Promise((resolve, reject) => {
		fetch('/api/services', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		})
			.then(response => response.json())
			.then(response => {
				if (response.success) {
					return resolve(response.services);
				}
			});
	});
}

/**
 * Fetches the list of services from the backend API.
 *
 * @returns {Promise<ServiceData>} A promise that resolves to an array of AppDetails objects.
 */
async function fetchService(app_guid, host, service) {
	return new Promise((resolve, reject) => {
		fetch(`/api/service/${app_guid}/${host}/${service}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		})
			.then(response => response.json())
			.then(response => {
				if (response.success) {
					return resolve(response.service);
				}
			});
	});
}

/**
 * Fetches the list of applications from the backend API or localStorage.
 *
 * @returns {Promise<Object.<string, AppData>>} A promise that resolves to an object mapping GUIDs to AppData objects.
 */
async function fetchApplications() {
	// Try to use localStorage for faster results, defaulting back to the manual fetch
	return new Promise((resolve, reject) => {
		if (applicationData) {
			return resolve(applicationData);
		}

		fetch('/api/applications', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		})
			.then(response => {
				return response.json()
			})
			.then(result => {
				if (result.success && result.applications) {
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
	});
}

async function fetchHosts() {
	return new Promise((resolve, reject) => {
		fetch('/api/hosts', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		})
			.then(response => response.json())
			.then(response => {
				if (response.success) {
					hostData = response.hosts;
					return resolve(response.hosts);
				}
				else {
					reject(response.error);
				}
			})
			.catch(error => {
				console.error('Error fetching hosts:', error);
				reject(error);
			});
	});
}

/**
 * Get the rendered HTML for an application icon.
 *
 * @param {string} guid
 * @returns {string}
 */
function renderAppIcon(guid) {
	let appData = applicationData && applicationData[guid] || null;

	if (appData && appData.icon) {
		return '<img src="' + appData.icon + '" alt="' + appData.title + ' Icon" title="' + appData.title + '">';
	}
	else {
		return '<i class="fas fa-cube" style="font-size: 1.5rem; color: white;"></i>';
	}
}

/**
 * Get the rendered hostname for a given host identifier.
 *
 * @param {string} host
 * @returns {string}
 */
function renderHostName(host) {
	let hostInfo = hostData && hostData[host] || null;

	if (hostInfo && hostInfo.hostname) {
		return '<span title="' + host + '">' + hostInfo.hostname + '</span>';
	}
	else {
		return host;
	}
}

/**
 * Get the rendered HTML for a host connection icon.
 *
 * @param {host} host
 * @returns {string}
 */
function renderHostIcon(host) {
	let hostInfo = hostData && hostData[host] || null;

	if (hostInfo && hostInfo.connected && hostInfo.os.name) {
		return '<img src="/media/logos/servers/' + hostInfo.os.name.toLowerCase() + '.svg" alt="' + hostInfo.os.title + ' Icon" title="' + hostInfo.os.title + '">';
	}
	else {
		return '<i class="fas fa-desktop" title="Disconnected"></i>';
	}
}

/**
 * Format bytes as human-readable text.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function serviceAction(guid, host, service, action) {
	return new Promise((resolve, reject) => {
		fetch(`/api/service/control/${guid}/${host}/${service}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: action
			})
		})
			.then(response => response.json())
			.then(response => {
				resolve(response);
			})
			.catch(error => {
				reject(error);
			});
	});
}

/**
 * Replace all placeholders in the document with application-specific data.
 *
 * @param {AppData} app
 */
function replaceAppPlaceholders(app) {
	// Automatic replacements of the content
	document.querySelectorAll('.app-name-placeholder').forEach(el => {
		el.innerHTML = app.title;
	});

	if (document.body.dataset.useAppBackground && app.image) {
		document.body.style.backgroundImage = `url(${app.image})`;
	}

	if (
		document.querySelector('.content-header') &&
		document.querySelector('.content-header').dataset.useAppHeader &&
		app.header
	) {
		document.querySelector('.content-header').style.backgroundImage = `url(${app.header})`;
	}
}

/**
 * Replace all placeholders in the document with application-specific data.
 *
 * @param {HostData} host
 */
function replaceHostPlaceholders(host) {
	// Automatic replacements of the content
	document.querySelectorAll('.host-name-placeholder').forEach(el => {
		el.innerHTML = host.hostname;
	});
}

/**
 * Load application data for the given GUID.
 *
 * @param {string} guid
 * @returns {Promise<void>}
 */
async function loadApplication(guid) {
	return new Promise((resolve, reject) => {
		fetchApplications()
			.then(applications => {
				const app = applications[guid] || null;

				if (!app) {
					return reject('Application not found.');
				}

				loadedApplication = guid;

				// Replace content from application
				replaceAppPlaceholders(app);
				resolve();
			})
			.catch(error => {
				reject(error);
			});
	});
}

/**
 * Load host data for the given host identifier.
 *
 * @param {string} host
 * @returns {Promise<unknown>}
 */
async function loadHost(host) {
	return new Promise((resolve, reject) => {
		fetchHosts()
			.then(hosts => {
				const hostInfo = hosts[host] || null;

				if (!hostInfo) {
					return reject('Host not found.');
				}

				loadedHost = host;

				// Replace content from application
				replaceHostPlaceholders(hostInfo);
				resolve();
			})
			.catch(error => {
				reject(error);
			});
	});
}
