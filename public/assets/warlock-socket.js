/**
 * Warlock WebSocket Client
 * Manages real-time communication between panel frontend and backend
 */

(function() {
	'use strict';

	// Initialize socket.io client
	const socket = io({
		transports: ['websocket', 'polling'],
		reconnection: true,
		reconnectionDelay: 1000,
		reconnectionAttempts: Infinity
	});

	// Connection status indicator
	let connectionStatus = 'disconnected';
	let statusIndicator = null;

	// Create status indicator in DOM
	function createStatusIndicator() {
		if (statusIndicator) return;

		statusIndicator = document.createElement('div');
		statusIndicator.id = 'ws-status-indicator';
		statusIndicator.style.cssText = `
			position: fixed;
			top: 10px;
			right: 10px;
			padding: 8px 12px;
			border-radius: 4px;
			font-size: 12px;
			font-weight: bold;
			z-index: 10000;
			transition: all 0.3s ease;
		`;
		document.body.appendChild(statusIndicator);
		updateStatusIndicator();
	}

	function updateStatusIndicator() {
		if (!statusIndicator) return;

		switch (connectionStatus) {
			case 'connected':
				statusIndicator.textContent = '🟢 Connected';
				statusIndicator.style.backgroundColor = '#4CAF50';
				statusIndicator.style.color = 'white';
				break;
			case 'connecting':
				statusIndicator.textContent = '🟡 Connecting...';
				statusIndicator.style.backgroundColor = '#FFC107';
				statusIndicator.style.color = 'black';
				break;
			case 'disconnected':
				statusIndicator.textContent = '🔴 Disconnected';
				statusIndicator.style.backgroundColor = '#F44336';
				statusIndicator.style.color = 'white';
				break;
		}
	}

	// Connection event handlers
	socket.on('connect', () => {
		console.log('[WebSocket] Connected to panel');
		connectionStatus = 'connected';
		updateStatusIndicator();
		
		// Emit custom event for pages to react
		window.dispatchEvent(new CustomEvent('warlock:connected'));
	});

	socket.on('disconnect', (reason) => {
		console.log('[WebSocket] Disconnected:', reason);
		connectionStatus = 'disconnected';
		updateStatusIndicator();
		
		window.dispatchEvent(new CustomEvent('warlock:disconnected', { detail: { reason } }));
	});

	socket.on('connect_error', (error) => {
		console.error('[WebSocket] Connection error:', error.message);
		connectionStatus = 'disconnected';
		updateStatusIndicator();
	});

	socket.on('reconnect', (attemptNumber) => {
		console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
		connectionStatus = 'connected';
		updateStatusIndicator();
		
		window.dispatchEvent(new CustomEvent('warlock:reconnected', { detail: { attempts: attemptNumber } }));
	});

	socket.on('reconnecting', (attemptNumber) => {
		console.log('[WebSocket] Reconnecting... attempt', attemptNumber);
		connectionStatus = 'connecting';
		updateStatusIndicator();
	});

	// Real-time metrics handler
	const metricsCallbacks = new Map();

	socket.onAny((eventName, ...args) => {
		// Handle metrics:host_ip events
		if (eventName.startsWith('metrics:')) {
			const hostIp = eventName.replace('metrics:', '');
			
			if (metricsCallbacks.has(hostIp)) {
				metricsCallbacks.get(hostIp).forEach(callback => {
					callback(args[0]);
				});
			}
		}

		// Handle stream events
		if (eventName.startsWith('stream:')) {
			window.dispatchEvent(new CustomEvent('warlock:stream', { 
				detail: { event: eventName, data: args[0] }
			}));
		}
	});

	// Public API
	window.WarlockSocket = {
		// Get socket instance
		getSocket: () => socket,

		// Connection status
		isConnected: () => socket.connected,
		getStatus: () => connectionStatus,

		// Subscribe to metrics for a specific host
		subscribeMetrics: (hostIp, callback) => {
			if (!metricsCallbacks.has(hostIp)) {
				metricsCallbacks.set(hostIp, []);
			}
			metricsCallbacks.get(hostIp).push(callback);

			return () => {
				// Unsubscribe function
				const callbacks = metricsCallbacks.get(hostIp);
				if (callbacks) {
					const index = callbacks.indexOf(callback);
					if (index > -1) {
						callbacks.splice(index, 1);
					}
				}
			};
		},

		// Emit event
		emit: (event, data, callback) => {
			socket.emit(event, data, callback);
		},

		// Listen for event
		on: (event, callback) => {
			socket.on(event, callback);
			
			return () => {
				socket.off(event, callback);
			};
		},

		// One-time listener
		once: (event, callback) => {
			socket.once(event, callback);
		},

		// Remove listener
		off: (event, callback) => {
			socket.off(event, callback);
		},

		// Show/hide status indicator
		showStatusIndicator: () => {
			createStatusIndicator();
		},

		hideStatusIndicator: () => {
			if (statusIndicator) {
				statusIndicator.remove();
				statusIndicator = null;
			}
		}
	};

	// Auto-show status indicator on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			createStatusIndicator();
		});
	} else {
		createStatusIndicator();
	}

	// Global event bus for Warlock events
	window.WarlockEvents = {
		onConnected: (callback) => {
			window.addEventListener('warlock:connected', callback);
			return () => window.removeEventListener('warlock:connected', callback);
		},

		onDisconnected: (callback) => {
			window.addEventListener('warlock:disconnected', callback);
			return () => window.removeEventListener('warlock:disconnected', callback);
		},

		onReconnected: (callback) => {
			window.addEventListener('warlock:reconnected', callback);
			return () => window.removeEventListener('warlock:reconnected', callback);
		},

		onStream: (callback) => {
			window.addEventListener('warlock:stream', callback);
			return () => window.removeEventListener('warlock:stream', callback);
		}
	};

	console.log('[Warlock] WebSocket client initialized');
})();
