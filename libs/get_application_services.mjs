import {cmdRunner} from "./cmd_runner.mjs";
import cache from "./cache.mjs";

/**
 * Get the services for a single application on a given host
 *
 * @param appData {AppData}
 * @param hostData {HostAppData}
 * @returns {Promise<{services:Object.<{string}, ServiceData>, app:AppData, host:HostAppData}>}
 */
export async function getApplicationServices(appData, hostData) {
	return new Promise((resolve, reject) => {

		const guid = appData.guid;
		const instanceId = hostData.instance_id || 'default';

		let cachedServices = cache.get(`services_${guid}_${hostData.host}_${instanceId}`);
		if (cachedServices) {
			return resolve({
				app: appData,
				host: hostData,
				services: cachedServices
			});
		}

		const instanceParam = hostData.instance_id ? ` --instance ${hostData.instance_id}` : '';
		cmdRunner(hostData.host, `${hostData.path}/manage.py${instanceParam} --get-services`)
			.then(result => {
				let appServices = {},
					allData,
					keysInterestedIn = ['name', 'service', 'ip', 'port', 'enabled', 'max_players'];

				try {
					allData = JSON.parse(result.stdout);

					// We just want some basic information for each service.
					// Strictly this is not required, but it keeps the data size down
					// and helps avoid confusion if the developer looks at this data and wonders why some data is stale.

					for (let svcName in allData) {
						appServices[svcName] = {};
						for (let key of keysInterestedIn) {
							appServices[svcName][key] = typeof(allData[svcName][key]) === 'undefined' ? null : allData[svcName][key];
						}
						// Include instance_id in the service data
						appServices[svcName].instance_id = instanceId;
					}
				}
				catch(e) {
					return reject(new Error(`Error parsing services data for application '${guid}' on host '${hostData.host}': ${e.message}`));
				}

				// Save this to cache for faster future lookups
				cache.set(`services_${guid}_${hostData.host}_${instanceId}`, appServices, 86400); // Cache for a day

				return resolve({
					app: appData,
					host: hostData,
					services: appServices
				});
			})
			.catch(e => {
				return reject(new Error(`Error retrieving services for application '${guid}' on host '${hostData.host}': ${e.error.message}`));
			});
	});
}
