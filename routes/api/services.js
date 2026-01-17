const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {getAllServices} = require("../../libs/get_all_services.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");
const {getServicesStatus} = require("../../libs/get_services_status.mjs");
const {logger} = require("../../libs/logger.mjs");
const {Metric} = require("../../db.js");
const {getApplicationServices} = require("../../libs/get_application_services.mjs");
const {getLatestServiceMetrics} = require("../../libs/get_latest_service_metrics.mjs");
const cache = require("../../libs/cache.mjs");

const router = express.Router();

/**
 * Get all services and their stats
 *
 * Returns JSON data with success (True/False), output/error, and services {list}
 *
 */
router.get('/', validate_session, (req, res) => {
	const t0 = Date.now();
	logger.info('[PERF] Backend: /api/services request started');
	
	getAllServices()
		.then(async services => {
			const t1 = Date.now();
			logger.info(`[PERF] Backend: getAllServices completed in ${t1 - t0}ms (${services.length} services)`);
			
			// Group services by host to see per-host timing
			const servicesByHost = {};
			services.forEach(s => {
				if (!servicesByHost[s.host.host]) servicesByHost[s.host.host] = [];
				servicesByHost[s.host.host].push(s);
			});
			
			logger.info(`[PERF] Backend: Services distributed across ${Object.keys(servicesByHost).length} hosts`);
			Object.entries(servicesByHost).forEach(([host, svcList]) => {
				logger.info(`[PERF]   - ${host}: ${svcList.length} services`);
			});
			
			// For each service, lookup the latest metrics and tack them onto the service object
			const metricsStart = Date.now();
		
			// Parallelize metrics fetching instead of sequential await
			const metricsPromises = services.map(svcEntry => {
				const metricStart = Date.now();
				return getLatestServiceMetrics(svcEntry.app, svcEntry.host.host, svcEntry.service.service)
					.then(metrics => {
						const metricDuration = Date.now() - metricStart;
						return {
							svcEntry,
							metrics,
							duration: metricDuration,
							cached_players: cache.default.get(`players_${svcEntry.app}_${svcEntry.host.host}_${svcEntry.service.service}`)
						};
					})
					.catch(err => {
						const metricDuration = Date.now() - metricStart;
						logger.warn(`[PERF] Metrics fetch failed for ${svcEntry.app} on ${svcEntry.host.host} after ${metricDuration}ms: ${err.message}`);
						return {
							svcEntry,
							metrics: {},
							duration: metricDuration,
							error: true
						};
					});
			});
			
			const metricResults = await Promise.all(metricsPromises);
			
			// Log slowest metrics queries
			const slowestMetrics = metricResults
				.sort((a, b) => b.duration - a.duration)
				.slice(0, 5);
			
			slowestMetrics.forEach(({ svcEntry, duration }) => {
				logger.info(`[PERF]   Slowest: ${svcEntry.app} on ${svcEntry.host.host} took ${duration}ms`);
			});
			
			metricResults.forEach(({ svcEntry, metrics, cached_players }) => {
				svcEntry.service = {...svcEntry.service, ...metrics};
				
				// Add in player data if available
				if (cached_players) {
					svcEntry.service.players = cached_players;
				}
				else {
					svcEntry.service.players = [];
				}
			});
			
			const metricsEnd = Date.now();
			logger.info(`[PERF] Backend: Metrics enrichment completed in ${metricsEnd - metricsStart}ms`);

			const t2 = Date.now();
			logger.info(`[PERF] Backend: Total /api/services request time ${t2 - t0}ms`);
			
			return res.json({
				success: true,
				output: '',
				services: services,
				_timings: {
					totalMs: t2 - t0,
					getServicesMs: t1 - t0,
					metricsMs: metricsEnd - metricsStart
				}
			});
		})
		.catch(e => {
			const t3 = Date.now();
			logger.error(`[PERF] Backend: /api/services failed after ${t3 - t0}ms: ${e.message}`);
			return res.json({
				success: false,
				error: e.message,
				services: [],
				_timings: {
					totalMs: t3 - t0
				}
			});
		});
});

module.exports = router;
