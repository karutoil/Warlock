import {cmdRunner} from "./cmd_runner.mjs";
import cache from "./cache.mjs";
import {logger} from "./logger.mjs";
import { isAgentConnected, getAgentConnection } from "./agent_manager.mjs";
import { checkAgentHealth } from "./agent_health_monitor.mjs";

/**
 * Get the services for a single application on a given host
 * Prefers WebSocket agent, falls back to SSH with auto-remediation
 *
 * @param appData {AppData}
 * @param hostData {HostAppData}
 * @returns {Promise<{services:Object.<{string}, ServiceData>, app:AppData, host:HostAppData}>}
 */
export async function getApplicationServices(appData, hostData) {
	return new Promise(async (resolve, reject) => {

		const guid = appData.guid;
		const host = hostData.host;
		const cacheKey = `services_${guid}_${host}`;

		let cachedServices = cache.get(cacheKey);
		if (cachedServices) {
			logger.debug(`[PERF] getApplicationServices: Cache hit for ${guid} on ${host}`);
			return resolve({
				app: appData,
				host: hostData,
				services: cachedServices
			});
		}

		// Check agent health and trigger remediation if needed
		const healthStatus = await checkAgentHealth(host);
		
		// Determine execution method based on actual socket connection (not just database status)
		const agentConnected = await isAgentConnected(host);
		const executionMethod = agentConnected ? 'WEBSOCKET' : 'SSH';
		
		const startTime = Date.now();
		// Try fast path first if available; fall back to default
		const command = `${hostData.path}/manage.py --get-services-fast || ${hostData.path}/manage.py --get-services`;
		
		logger.info(`[PERF][${executionMethod}] Fetching services for ${guid} on ${host}${healthStatus.remediating ? ' (agent offline, auto-remediating)' : ''}`);

		// Set aggressive timeout for slow queries
		const queryTimeout = 5000; // 5 second timeout
		let timeoutHandle = null;
		let commandPromise = cmdRunner(host, command);

		// Race against timeout
		const timeoutPromise = new Promise((_, rejectTimeout) => {
			timeoutHandle = setTimeout(() => {
				const staleCache = cache.get(`${cacheKey}_stale`);
				if (staleCache) {
					logger.warn(`[PERF] getApplicationServices: Query timeout for ${guid} on ${host}, returning stale cache (${Date.now() - startTime}ms elapsed)`);
					clearTimeout(timeoutHandle);
					return resolve({
						app: appData,
						host: hostData,
						services: staleCache
					});
				}
				rejectTimeout(new Error(`Query timeout after ${queryTimeout}ms`));
			}, queryTimeout);
		});

		Promise.race([commandPromise, timeoutPromise])
			.then(result => {
				clearTimeout(timeoutHandle);
				const duration = Date.now() - startTime;
				const method = result.executedVia || 'ssh';
				logger.info(`[PERF][${method.toUpperCase()}] ${guid} on ${host}: ${duration}ms`);
				
				let appServices = {},
					allData,
					keysInterestedIn = ['name', 'service', 'ip', 'port', 'enabled', 'max_players'];

				try {
					allData = JSON.parse(result.stdout);

					// We just want some basic information for each service.
					for (let svcName in allData) {
						appServices[svcName] = {};
						for (let key of keysInterestedIn) {
							appServices[svcName][key] = typeof(allData[svcName][key]) === 'undefined' ? null : allData[svcName][key];
						}
					}
				}
				catch(e) {
					return reject(new Error(`Error parsing services data for application '${guid}' on host '${host}': ${e.message}`));
				}

				// Cache with dual strategy: 
				// - Fresh cache: 5 minutes (aggressive refresh for frequently accessed data)
				// - Stale cache: 1 day (fallback for timeout scenarios)
				cache.set(cacheKey, appServices, 300); // 5 minute fresh cache
				cache.set(`${cacheKey}_stale`, appServices, 86400); // 24 hour stale cache

				return resolve({
					app: appData,
					host: hostData,
					services: appServices
				});
			})
			.catch(e => {
				clearTimeout(timeoutHandle);
				const duration = Date.now() - startTime;
				const method = e.executedVia || 'ssh';
				
				// On timeout, try to return stale cache
				if (e.message.includes('timeout')) {
					const staleCache = cache.get(`${cacheKey}_stale`);
					if (staleCache) {
						logger.warn(`[PERF][${method.toUpperCase()}] TIMEOUT ${guid} on ${host}: ${duration}ms, using stale cache`);
						return resolve({
							app: appData,
							host: hostData,
							services: staleCache
						});
					}
				}
				
				logger.warn(`[PERF][${method.toUpperCase()}] FAILED ${guid} on ${host}: ${duration}ms - ${e.message || e.error?.message}`);
				
				// If we were using agent and it failed, mark health issue
				if (agentConnected) {
					logger.warn(`[AGENT-FALLBACK] Agent query failed for ${host}, this may trigger auto-remediation`);
				}
				
				return reject(new Error(`Error retrieving services for application '${guid}' on host '${host}': ${e.error?.message || e.message}`));
			});
	});
}
