/**
 * Real-Time WebSocket Integration for Servers View
 * Replaces polling with WebSocket subscriptions
 */

(function() {
	'use strict';

	if (typeof WarlockSocket === 'undefined') {
		console.warn('WarlockSocket not available, real-time updates disabled');
		return;
	}

	const activeSubscriptions = new Map();
	const metricsCache = new Map();

	/**
	 * Subscribe to real-time metrics for all servers
	 */
	function subscribeToAllServers(servers) {
		// Unsubscribe from previous subscriptions
		activeSubscriptions.forEach(unsubscribe => unsubscribe());
		activeSubscriptions.clear();

		// Subscribe to each unique host
		const hosts = new Set();
		servers.forEach(server => {
			server.hosts.forEach(host => {
				hosts.add(host.host);
			});
		});

		hosts.forEach(hostIp => {
			const unsubscribe = WarlockSocket.subscribeMetrics(hostIp, (metrics) => {
				handleMetricsUpdate(hostIp, metrics);
			});
			activeSubscriptions.set(hostIp, unsubscribe);
		});

		console.log(`Subscribed to real-time metrics for ${hosts.size} hosts`);
	}

	/**
	 * Handle incoming metrics update
	 */
	function handleMetricsUpdate(hostIp, metrics) {
		metricsCache.set(hostIp, {
			...metrics,
			receivedAt: Date.now()
		});

		// Trigger UI update
		if (typeof updateServerMetrics === 'function') {
			updateServerMetrics(hostIp, metrics);
		}

		// Dispatch custom event for other components
		window.dispatchEvent(new CustomEvent('warlock:metrics:update', {
			detail: { hostIp, metrics }
		}));
	}

	/**
	 * Get cached metrics for a host
	 */
	function getCachedMetrics(hostIp) {
		return metricsCache.get(hostIp);
	}

	/**
	 * Real-time service status updates
	 */
	function subscribeToServiceStatus(guid, host, service) {
		const channel = `service:status:${guid}:${host}:${service}`;
		
		const unsubscribe = WarlockSocket.on(channel, (data) => {
			if (typeof updateServiceStatus === 'function') {
				updateServiceStatus(guid, host, service, data);
			}
		});

		return unsubscribe;
	}

	/**
	 * Real-time command output streaming
	 */
	function subscribeToCommandOutput(streamId, callbacks) {
		const unsubscribes = [];

		if (callbacks.onStdout) {
			unsubscribes.push(WarlockSocket.on(`stream:stdout:${streamId}`, callbacks.onStdout));
		}

		if (callbacks.onStderr) {
			unsubscribes.push(WarlockSocket.on(`stream:stderr:${streamId}`, callbacks.onStderr));
		}

		if (callbacks.onClose) {
			unsubscribes.push(WarlockSocket.on(`stream:close:${streamId}`, callbacks.onClose));
		}

		if (callbacks.onError) {
			unsubscribes.push(WarlockSocket.on(`stream:error:${streamId}`, callbacks.onError));
		}

		// Return cleanup function
		return () => {
			unsubscribes.forEach(fn => fn());
		};
	}

	/**
	 * Emit service control action and listen for response
	 */
	function emitServiceControl(guid, host, service, action, callback) {
		const requestId = `${guid}-${host}-${service}-${Date.now()}`;
		
		WarlockSocket.emit('service:control', {
			requestId,
			guid,
			host,
			service,
			action
		}, (response) => {
			if (callback) callback(response);
		});

		// Also listen for real-time status updates
		const channel = `service:status:${guid}:${host}:${service}`;
		const cleanup = WarlockSocket.once(channel, (status) => {
			if (typeof updateServiceStatus === 'function') {
				updateServiceStatus(guid, host, service, status);
			}
		});

		return cleanup;
	}

	/**
	 * Initialize on page load
	 */
	function initializeRealTime() {
		// Wait for initial server load
		if (typeof AppState !== 'undefined' && AppState.servers) {
			subscribeToAllServers(AppState.servers);
		}

		// Listen for server list updates
		window.addEventListener('servers:loaded', (event) => {
			if (event.detail && event.detail.servers) {
				subscribeToAllServers(event.detail.servers);
			}
		});

		// Cleanup on page unload
		window.addEventListener('beforeunload', () => {
			activeSubscriptions.forEach(unsubscribe => unsubscribe());
			activeSubscriptions.clear();
		});

		console.log('[Warlock] Real-time features initialized');
	}

	// Public API
	window.WarlockRealTime = {
		subscribeToAllServers,
		subscribeToServiceStatus,
		subscribeToCommandOutput,
		emitServiceControl,
		getCachedMetrics,
		metricsCache
	};

	// Auto-initialize when DOM ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initializeRealTime);
	} else {
		initializeRealTime();
	}

})();
