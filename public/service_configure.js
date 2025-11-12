/**
 * Build the HTML for configuration options received from the server
 *
 * Populates to the container with the ID configurationContainer on the main page
 *
 * @param {string} app_guid
 * @param {string} host
 * @param {string} service
 * @param {AppConfigOption[]} options
 */
function buildOptionsForm(app_guid, host, service, options) {
	let target = document.getElementById('configurationContainer');

	if (options.length === 0) {
		target.innerHTML = '<div class="alert alert-info" role="alert">No configuration options available for this service.</div>';
		return;
	}

	options.forEach(option => {
		let formGroup = document.createElement('div');
		formGroup.className = 'form-group';

		let label = document.createElement('label');
		label.htmlFor = `config-${option.option}`;
		label.className = 'form-label';
		label.innerText = option.option;

		// TESTING
		option.help = 'Some helpful text for this value';

		let help = null;
		if (option.help) {
			help = document.createElement('span');
			help.className = 'help-text';
			help.innerText = option.help;
		}


		let input;
		switch (option.type) {
			case 'bool':
				input = document.createElement('input');
				input.type = 'checkbox';
				input.className = 'form-check-input';
				input.id = `config-${option.option}`;
				input.checked = option.value === true || option.value === 'true';
				break;
			case 'int':
			case 'float':
				input = document.createElement('input');
				input.type = 'number';
				input.className = 'form-control';
				input.id = `config-${option.option}`;
				input.value = option.value;
				break;
			case 'text':
				input = document.createElement('textarea');
				input.className = 'form-control';
				input.id = `config-${option.option}`;
				input.value = option.value;
				break;
			case 'str':
			default:
				input = document.createElement('input');
				input.type = 'text';
				input.className = 'form-control';
				input.id = `config-${option.option}`;
				input.value = option.value;
				break;
		}

		formGroup.appendChild(label);
		if (help) {
			formGroup.appendChild(help);
		}
		formGroup.appendChild(input);
		target.appendChild(formGroup);

		// Add event handler on input to live-save changes to the backend
		input.addEventListener('change', (event) => {
			let newValue;
			if (option.type === 'bool') {
				newValue = event.target.checked;
			} else if (option.type === 'int') {
				newValue = parseInt(event.target.value, 10);
			} else if (option.type === 'float') {
				newValue = parseFloat(event.target.value);
			} else {
				newValue = event.target.value;
			}

			// Send update to backend
			fetch(`/api/service/${app_guid}/${host}/${service}/configs`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ [option.option]: newValue })
			})
				.then(response => response.json())
				.then(result => {
					if (result.success) {
						console.debug(`Configuration option ${option.option} updated successfully.`);
					} else {
						console.error(`Failed to update configuration option ${option.option}.`);
					}
				});
		});
	});
}


// Load navigation component
fetch('/components/nav')
	.then(response => response.text())
	.then(html => {
		document.getElementById('nav-placeholder').innerHTML = html;
	})
	.catch(error => console.error('Error loading navigation:', error));

/**
 * Primary handler to load the application on page load
 */
window.addEventListener('DOMContentLoaded', () => {

	const [app_guid, host, service] = window.location.pathname.substring(19).split('/'),
		configurationContainer = document.getElementById('configurationContainer');

	fetchApplications()
		.then(applications => {
			const app = applications[app_guid] || null;

			if (!app) {
				configurationContainer.innerHTML = '<div class="alert alert-danger" role="alert">Application not found.</div>';
				return;
			}

			console.debug(app);

			// Replace content from application
			document.querySelectorAll('.app-name-placeholder').forEach(el => {
				el.innerHTML = app.title;
			});
			document.querySelectorAll('.host-name-placeholder').forEach(el => {
				el.innerHTML = host;
			});
			if (app.image) {
				document.body.style.backgroundImage = `url(${app.image})`;
			}
			if (app.header) {
				document.querySelector('.content-header').style.backgroundImage = `url(${app.header})`;
			}

			fetchService(app_guid, host, service)
				.then(serviceData => {
					document.querySelectorAll('.service-service-placeholder').forEach(el => {
						el.innerHTML = serviceData.service;
					});

					// Pull the configs from the service
					fetch(`/api/service/${app_guid}/${host}/${service}/configs`, {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json'
						}
					})
						.then(response => response.json())
						.then(result => {
							if (result.success && result.configs) {
								const configs = result.configs;
								console.debug(configs);
								buildOptionsForm(app_guid, host, service, configs);
							}
						});
				});
		});
});