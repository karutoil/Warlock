const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {getLatestServiceMetrics} = require("../../libs/get_latest_service_metrics.mjs");
const {getApplicationServices} = require("../../libs/get_application_services.mjs");
const {logger} = require("../../libs/logger.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");
const {getApplicationMetrics} = require("../../libs/get_application_metrics.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");

const router = express.Router();

/**
 * Get the actual systemd status for a service
 */
async function getServiceStatus(host, serviceName) {
	try {
		const result = await cmdRunner(host, `systemctl is-active ${serviceName}.service`);
		const status = result.stdout.trim().toLowerCase();
		
		// Map systemd status to our status format
		// systemctl is-active returns: active, inactive, failed, activating, deactivating, reloading, etc.
		if (status === 'active' || status === 'activating') {
			return 'running';
		} else if (status === 'inactive' || status === 'deactivating' || status === 'failed') {
			return 'stopped';
		}
		return 'stopped'; // Default to stopped for any unknown state
	} catch (error) {
		console.error('Error checking service status:', error);
		// If command fails, service is likely stopped
		return 'stopped';
	}
}

/**
 * Get a single service and its status from a given host and application GUID
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(async dat => {
			// Get latest metrics for the service
			let metrics = await getLatestServiceMetrics(req.params.guid, req.params.host, req.params.service);
			
			// Get live status from systemd instead of cached metrics
			const liveStatus = await getServiceStatus(req.params.host, req.params.service);
			metrics.status = liveStatus;
			
			dat.service = {...dat.service, ...metrics};

			return res.json({
				success: true,
				service: dat.service,
				host: dat.host,
				app: dat.app.guid,
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message,
				service: []
			});
		});
});

router.get('/stream/:guid/:host/:service', validate_session, (req, res) => {
	let clientGone = false;

	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		'Connection': 'keep-alive'
	});

	validateHostService(req.params.host, req.params.guid, req.params.service).then(async dat => {
		const onClientClose = () => {
			if (clientGone) return;
			clientGone = true;
		};

		const lookup = () => {
			if (clientGone) return;

			// Get the live metrics for this service
			getApplicationMetrics(dat.app, dat.host, req.params.service).then(results => {
				if (clientGone) return;

				let ret = {
					app: results.app.guid,
					host: results.host,
					service: results.services[req.params.service],
				};

				ret.service['response_time'] = results.response_time;

				res.write(`data: ${JSON.stringify(ret)}\n\n`);

				setTimeout(lookup,5000);
			}).catch(e => {
				if (clientGone) return;

				res.write(`data: ${JSON.stringify({
					success: false,
					error: e.message,
					service: []
				})}\n\n`);
			});
		};

		// Track client disconnects
		req.on('close', onClientClose);
		req.on('aborted', onClientClose);
		res.on('close', onClientClose);

		lookup();
	})
	.catch(e => {
		return res.json({
			success: false,
			error: e.message,
			service: []
		});
	});
});

module.exports = router;
