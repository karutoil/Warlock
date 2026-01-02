import {cmdRunner} from "./cmd_runner.mjs";

/**
 * Get the metrics of an application on a given host
 *
 * Optionally include the service name to only retrieve metrics for that service
 *
 * @param appData {AppData}
 * @param hostData {HostAppData}
 * @param service {string|null}
 * @returns {Promise<{services:Object.<{string}, ServiceData>, app:AppData, host:HostAppData, response_time:number}>}
 */
export async function getApplicationMetrics(appData, hostData, service) {
	return new Promise((resolve, reject) => {

		const guid = appData.guid,
			requestStartTime = Date.now();
		let cmd;

		if (service) {
			cmd = `${hostData.path}/manage.py --service ${service} --get-metrics`
		}
		else {
			cmd = `${hostData.path}/manage.py --get-metrics`
		}

		cmdRunner(hostData.host, cmd)
			.then(result => {
				let appServices;
				try{
					appServices = JSON.parse(result.stdout);
				}
				catch(e){
					return reject(new Error(`Error parsing services metrics for application '${guid}' on host '${hostData.host}': ${e.message}`));
				}

				return resolve({
					app: appData,
					host: hostData,
					services: appServices,
					response_time: Date.now() - requestStartTime
				});
			})
			.catch(e => {
				return reject(new Error(`Error retrieving service metrics for application '${guid}' on host '${hostData.host}': ${e.error.message}`));
			});
	});
}