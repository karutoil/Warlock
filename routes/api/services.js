const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {getAllServices} = require("../../libs/get_all_services.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");
const {getServicesStatus} = require("../../libs/get_services_status.mjs");
const {logger} = require("../../libs/logger.mjs");

const router = express.Router();

/**
 * Get all services and their stats
 *
 * Returns JSON data with success (True/False), output/error, and services {list}
 *
 */
router.get('/', validate_session, (req, res) => {
	getAllServices()
		.then((services) => {
			return res.json({
				success: true,
				output: '',
				services: services
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message,
				services: []
			});
		});
});

router.get('/stream', validate_session, (req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		'Connection': 'keep-alive'
	});

	getAllApplications()
		.then(results => {
			let clientGone = false;

			const onClientClose = () => {
				if (clientGone) return;
				clientGone = true;
			};

			const lookup = (app, hostData) => {
				if (clientGone) return;

				getServicesStatus(app, hostData).then(services => {
					if (clientGone) return;

					res.write(`data: ${JSON.stringify(services)}\n\n`);

					setTimeout(() => {
						lookup(app, hostData);
					}, 15000);
				}).catch(e => {
					logger.warn(e);
				});
			};

			// Track client disconnects
			req.on('close', onClientClose);
			req.on('aborted', onClientClose);
			res.on('close', onClientClose);

			for (let guid in results) {
				let app = results[guid];
				for (let hostData of app.hosts) {
					lookup(app, hostData);
				}
			}
		});
});

module.exports = router;
