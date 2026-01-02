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

	for (let key of Object.keys(metrics)) {
		let res = await Metric.findOne({
			where: {
				ip: host,
				app_guid,
				service,
				metric_title: key
			},
			order: [['timestamp', 'DESC']],
			raw: true
		});

		if (res) {
			if (key === 'cpu_usage' ) {
				metrics[key] = res.metric_value + '%';
			}
			else if (key === 'memory_usage') {
				if (res.metric_value > 1024) {
					metrics[key] = (res.metric_value / 1024).toFixed(2) + ' GB';
				}
				else {
					metrics[key] = res.metric_value + ' MB';
				}
			}
			else if (key === 'status') {
				metrics[key] = res.metric_value === 1 ? 'running' : 'stopped';
			}
			else {
				metrics[key] = res.metric_value;
			}
		}
	}

	return metrics;
}