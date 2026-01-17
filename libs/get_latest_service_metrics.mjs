import {Metric} from "../db.js";

/**
 * Get the latest metrics for a given service on a host
 *
 * The return dictionary will be similar to that of querying `--get-metrics` for the service
 *
 * @param {string} app_guid
 * @param {string} host
 * @param {string} service
 * @returns {Promise<{response_time: string, player_count: number, status: string, memory: string, cpu: string}>}
 */
export async function getLatestServiceMetrics(app_guid, host, service) {
	let metrics = {
		response_time: 'N/A',
		player_count: 0,
		status: 'Unknown',
		memory_usage: 'N/A',
		cpu_usage: 'N/A'
	};

	try {
		const res = await Metric.findOne({
			where: {
				ip: host,
				app_guid,
				service
			},
			order: [['timestamp', 'DESC']],
			raw: true
		});

		if (res) {
			if (res.cpu_usage !== null) {
				metrics.cpu_usage = res.cpu_usage + '%';
			}

			if (res.memory_usage !== null) {
				if (res.memory_usage > 1024) {
					metrics.memory_usage = (res.memory_usage / 1024).toFixed(2) + ' GB';
				}
				else {
					metrics.memory_usage = res.memory_usage + ' MB';
				}
			}

			metrics.status = res.status === 1 ? 'running' : 'stopped';

			if (res.player_count !== null) {
				metrics.player_count = res.player_count;
			}

			if (res.response_time !== null) {
				metrics.response_time = res.response_time + ' ms';
			}
		}
	} catch (error) {
		// Return default metrics on error rather than crashing
	}

	return metrics;
}

/**
 * Get the latest metrics for multiple services at once (batch query)
 * More efficient than calling getLatestServiceMetrics multiple times
 *
 * @param {Array} serviceQueries - Array of {app_guid, host, service} objects
 * @returns {Promise<Object>} Map of "host:app_guid:service" -> metrics
 */
export async function getLatestServiceMetricsBatch(serviceQueries) {
	const result = {};
	
	if (!serviceQueries || serviceQueries.length === 0) {
		return result;
	}
	
	try {
		// Build OR conditions for all service queries
		const conditions = serviceQueries.map(q => ({
			ip: q.host,
			app_guid: q.app_guid,
			service: q.service
		}));
		
		const { Op } = require('sequelize');
		const metrics = await Metric.findAll({
			where: {
				[Op.or]: conditions
			},
			raw: true
		});
		
		// Group by service and get latest timestamp for each
		const latestMetrics = {};
		metrics.forEach(metric => {
			const key = `${metric.ip}:${metric.app_guid}:${metric.service}`;
			if (!latestMetrics[key] || new Date(metric.timestamp) > new Date(latestMetrics[key].timestamp)) {
				latestMetrics[key] = metric;
			}
		});
		
		// Format the metrics
		for (const key in latestMetrics) {
			const res = latestMetrics[key];
			const metrics_obj = {
				response_time: 'N/A',
				player_count: 0,
				status: 'Unknown',
				memory_usage: 'N/A',
				cpu_usage: 'N/A'
			};
			
			if (res.cpu_usage !== null) metrics_obj.cpu_usage = res.cpu_usage + '%';
			if (res.memory_usage !== null) {
				metrics_obj.memory_usage = res.memory_usage > 1024 
					? (res.memory_usage / 1024).toFixed(2) + ' GB'
					: res.memory_usage + ' MB';
			}
			if (res.status !== null) metrics_obj.status = res.status === 1 ? 'running' : 'stopped';
			if (res.player_count !== null) metrics_obj.player_count = res.player_count;
			if (res.response_time !== null) metrics_obj.response_time = res.response_time + ' ms';
			
			result[key] = metrics_obj;
		}
	} catch (error) {
		// Return empty result on error
	}
	
	return result;
}