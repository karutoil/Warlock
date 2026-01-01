const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {getAllServices} = require("../../libs/get_all_services.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");
const {getServicesStatus} = require("../../libs/get_services_status.mjs");
const {logger} = require("../../libs/logger.mjs");
const {Metric} = require("../../db.js");

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
			const metricsTracking = new Map(); // Track last metric save time per service

			const onClientClose = () => {
				if (clientGone) return;
				clientGone = true;
			};

			const saveMetrics = async (app, hostData, services, responseTime) => {
				const timestamp = Math.floor(Date.now() / 1000);
				
				for (let serviceName in services) {
					const service = services[serviceName];
					const trackingKey = `${hostData.host}_${serviceName}`;
					const lastSave = metricsTracking.get(trackingKey) || 0;
					
					// Only save metrics once per minute
					if (timestamp - lastSave >= 60) {
						metricsTracking.set(trackingKey, timestamp);
						
						// Parse numeric values from service data
						const cpuValue = parseFloat(service.cpu_usage) || 0;
						
						// Parse memory usage - handle MB and GB
						let memoryValue = 0;
						if (service.memory_usage && service.memory_usage !== 'N/A') {
							const memoryMatch = service.memory_usage.match(/^([\d.]+)\s*(MB|GB)?/i);
							if (memoryMatch) {
								memoryValue = parseFloat(memoryMatch[1]);
								// Convert GB to MB if needed
								if (memoryMatch[2] && memoryMatch[2].toUpperCase() === 'GB') {
									memoryValue = memoryValue * 1024;
								}
							}
						}
						
						const playerValue = service.player_count || 0;
						const statusValue = service.status === 'running' ? 1 : 0;
						
						// Save each metric type
						const metricsToSave = [
							{metric_title: 'cpu', metric_value: cpuValue},
							{metric_title: 'memory', metric_value: memoryValue},
							{metric_title: 'players', metric_value: playerValue},
							{metric_title: 'status', metric_value: statusValue},
							{metric_title: 'response_time', metric_value: responseTime}
						];
						
						for (let metric of metricsToSave) {
							try {
								await Metric.create({
									ip: hostData.host,
									metric_title: metric.metric_title,
									app_guid: app.guid,
									service: serviceName,
									metric_value: metric.metric_value,
									timestamp
								});
							} catch (error) {
								logger.warn(`Error saving ${metric.metric_title} metric: ${error.message}`);
							}
						}
					}
				}
			};

			const lookup = (app, hostData) => {
				if (clientGone) return;

				const requestStartTime = Date.now();

				getServicesStatus(app, hostData).then(services => {
					if (clientGone) return;

					const responseTime = Date.now() - requestStartTime;

					res.write(`data: ${JSON.stringify(services)}\n\n`);
					
					// Save metrics asynchronously without blocking the stream
					saveMetrics(app, hostData, services.services, responseTime).catch(e => {
						logger.warn(`Error saving metrics: ${e.message}`);
					});

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

			let appCount = 0;
			for (let guid in results) {
				let app = results[guid];
				for (let hostData of app.hosts) {
					appCount += 1;
					lookup(app, hostData);
				}
			}

			if (appCount === 0) {
				res.write(`event: NOSERVICES\ndata: ${JSON.stringify([])}\n\n`);
				res.end();
			}
		});
});

module.exports = router;
