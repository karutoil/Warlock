import {getAllApplications} from "./get_all_applications.mjs";
import {logger} from "./logger.mjs";
import {getApplicationServices} from "./get_application_services.mjs";
import cache from "./cache.mjs";

/**
 * Get all services from all applications across all hosts
 *
 * @returns {Promise<[{service:ServiceData, app:AppData, host:HostAppData}]>}
 */
export async function getAllServices() {
	// Check if we have a cached version of all services (1 minute cache for rapid requests)
	const cachedAllServices = cache.get('all_services_compiled');
	if (cachedAllServices) {
		logger.debug('[PERF] getAllServices: Returning cached all services');
		return cachedAllServices;
	}
	
	return new Promise((resolve, reject) => {
		const t0 = Date.now();
		logger.info('[PERF] getAllServices: Starting');
		
		getAllApplications()
			.then(results => {
				const t1 = Date.now();
				const appCount = Object.keys(results).length;
				logger.info(`[PERF] getAllServices: getAllApplications completed in ${t1 - t0}ms (${appCount} apps)`);
				
				let allLookups = [],
					hostMap = new Map(), // Track which hosts we're querying
					services = [];

				for (let guid in results) {
					let app = results[guid];
					for (let hostData of app.hosts) {
						if (!hostMap.has(hostData.host)) {
							hostMap.set(hostData.host, []);
						}
						hostMap.get(hostData.host).push(guid);
						allLookups.push(getApplicationServices(app, hostData));
					}
				}
				
				logger.info(`[PERF] getAllServices: Created ${allLookups.length} service lookups across ${hostMap.size} hosts`);
				Array.from(hostMap.entries()).forEach(([host, apps]) => {
					logger.info(`[PERF]   Host ${host}: ${apps.length} apps`);
				});

				const t2 = Date.now();
				Promise.allSettled(allLookups)
					.then(serviceResults => {
						const t3 = Date.now();
						logger.info(`[PERF] getAllServices: All service lookups settled in ${t3 - t2}ms`);
						
						// Track timing per host
						const hostTimings = new Map();
						
						serviceResults.forEach(result => {
							if (result.status === 'fulfilled') {
								let appServices = result.value.services;
								const host = result.value.host.host;
								if (!hostTimings.has(host)) {
									hostTimings.set(host, { count: 0, time: 0 });
								}
								hostTimings.get(host).count += Object.keys(appServices).length;
								
								for (let svc of Object.values(appServices)) {
									// Merge extra fields into service data
									services.push({service: svc, app: result.value.app.guid, host: result.value.host} );
								}
							} else {
								logger.warn(`[PERF] getAllServices: One service lookup failed: ${result.reason?.message}`);
							}
						});
						
						// Log timing breakdown by host
						hostTimings.forEach((timing, host) => {
							logger.info(`[PERF]   Host ${host}: ${timing.count} services retrieved`);
						});

						const t4 = Date.now();

			// Deduplicate services by unique key (app_guid + host + service name)
			const seen = new Set();
			const uniqueServices = [];
			const duplicates = [];
			for (const s of services) {
				const key = `${s.app}_${s.host.host}_${s.service.service}`;
				if (seen.has(key)) {
					duplicates.push(key);
					continue;
				}
				seen.add(key);
				uniqueServices.push(s);
			}
			logger.info(`[PERF] getAllServices: Retrieved ${services.length} services, deduplicated to ${uniqueServices.length} unique services (${duplicates.length} duplicates removed)`);
			if (duplicates.length > 0) {
				logger.warn(`[PERF] getAllServices: Found ${duplicates.length} duplicate service entries, removing duplicates`);
				// Log up to 10 duplicate keys for debugging
				duplicates.slice(0, 10).forEach(d => logger.debug(`[PERF] Duplicate service: ${d}`));
			}

			logger.info(`[PERF] getAllServices: Complete in ${Date.now() - t0}ms (${uniqueServices.length} unique services, ${duplicates.length} duplicates removed)`);
			// Cache the deduplicated services list for 5 minutes
			cache.set('all_services_compiled', uniqueServices, 300); // 5 minute cache
			resolve(uniqueServices);
					});
			});
	});
}
