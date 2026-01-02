const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {getLatestServiceMetrics} = require("../../libs/get_latest_service_metrics.mjs");
const {getApplicationServices} = require("../../libs/get_application_services.mjs");
const {logger} = require("../../libs/logger.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");
const {getApplicationMetrics} = require("../../libs/get_application_metrics.mjs");

const router = express.Router();

/**
 * Get a single service and its status from a given host and application GUID
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(async dat => {
			// Get latest metrics for the service
			let metrics = await getLatestServiceMetrics(req.params.guid, req.params.host, req.params.service);
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
