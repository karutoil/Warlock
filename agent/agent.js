#!/usr/bin/env node
/**
 * Warlock Agent - WebSocket client for remote server management
 * Maintains persistent connection to Warlock panel and executes commands
 */

const { io } = require('socket.io-client');
const si = require('systeminformation');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = '/etc/warlock/agent.conf';
const VERSION = '1.0.0';

// Simple in-memory cache for expensive commands (e.g., manage.py --get-services)
const commandCache = new Map();
const CACHE_TTL_MS = Number(process.env.WARLOCK_AGENT_CACHE_TTL_MS || 60000); // default 60s

// Load configuration
let config = {};
try {
	config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (err) {
	console.error(`Failed to load config from ${CONFIG_FILE}:`, err.message);
	console.error('Please run: warlock-agent --configure');
	process.exit(1);
}

const { PANEL_URL, AGENT_TOKEN } = config;

if (!PANEL_URL || !AGENT_TOKEN) {
	console.error('Missing required config: PANEL_URL and AGENT_TOKEN');
	process.exit(1);
}

// Connect to panel with authentication
const socket = io(PANEL_URL, {
	auth: {
		token: AGENT_TOKEN,
		version: VERSION,
		hostname: os.hostname()
	},
	reconnection: true,
	reconnectionDelay: 1000,
	reconnectionDelayMax: 30000,
	reconnectionAttempts: Infinity,
	timeout: 20000,
	transports: ['websocket', 'polling']
});

// Connection event handlers
socket.on('connect', () => {
	console.log(`[${new Date().toISOString()}] Connected to panel: ${PANEL_URL}`);
	socket.emit('agent:register', {
		version: VERSION,
		hostname: os.hostname(),
		platform: os.platform(),
		arch: os.arch()
	});
});

socket.on('disconnect', (reason) => {
	console.log(`[${new Date().toISOString()}] Disconnected: ${reason}`);
});

socket.on('connect_error', (error) => {
	console.error(`[${new Date().toISOString()}] Connection error:`, error.message);
});

socket.on('reconnect', (attemptNumber) => {
	console.log(`[${new Date().toISOString()}] Reconnected after ${attemptNumber} attempts`);
});

// Command execution handler
socket.on('command:exec', async (data, callback) => {
	const { command, timeout = 30000, cwd } = data;
	
	try {
		// Cache only manage.py service enumeration commands
		const isServiceList = typeof command === 'string' && command.includes('manage.py') && command.includes('--get-services');
		if (isServiceList) {
			const cacheKey = `${cwd || ''}::${command}`;
			const cached = commandCache.get(cacheKey);
			if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
				console.log(`[${new Date().toISOString()}] [CACHE] Returning cached result for: ${command}`);
				return callback({ success: true, ...cached.result });
			}
		}

		const result = await executeCommand(command, timeout, cwd);

		// Save to cache on success
		if (typeof command === 'string' && command.includes('manage.py') && command.includes('--get-services')) {
			const cacheKey = `${cwd || ''}::${command}`;
			commandCache.set(cacheKey, { result, timestamp: Date.now() });
		}

		return callback({ success: true, ...result });
	} catch (err) {
		return callback({ success: false, error: err.message });
	}
});

// Streaming command handler
socket.on('command:stream', async (data) => {
	const { streamId, command, cwd } = data;
	
	try {
		const proc = spawn('bash', ['-c', command], {
			cwd: cwd || '/root',
			env: process.env
		});

		proc.stdout.on('data', (data) => {
			socket.emit('stream:stdout', { streamId, data: data.toString() });
		});

		proc.stderr.on('data', (data) => {
			socket.emit('stream:stderr', { streamId, data: data.toString() });
		});

		proc.on('close', (code) => {
			socket.emit('stream:close', { streamId, code });
		});

		proc.on('error', (err) => {
			socket.emit('stream:error', { streamId, error: err.message });
		});

	} catch (err) {
		socket.emit('stream:error', { streamId, error: err.message });
	}
});

// Metrics collection handler
socket.on('metrics:collect', async (data, callback) => {
	try {
		const metrics = await collectMetrics();
		callback({ success: true, metrics });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

// File operations handler
socket.on('file:read', async (data, callback) => {
	const { path: filePath, encoding = 'utf8' } = data;
	
	try {
		const content = fs.readFileSync(filePath, encoding);
		callback({ success: true, content });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

socket.on('file:write', async (data, callback) => {
	const { path: filePath, content, encoding = 'utf8' } = data;
	
	try {
		fs.writeFileSync(filePath, content, encoding);
		callback({ success: true });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

socket.on('file:list', async (data, callback) => {
	const { path: dirPath } = data;
	
	try {
		const files = fs.readdirSync(dirPath, { withFileTypes: true });
		const result = files.map(file => ({
			name: file.name,
			isDirectory: file.isDirectory(),
			isFile: file.isFile()
		}));
		callback({ success: true, files: result });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

// Service management handler (systemctl wrapper)
socket.on('service:control', async (data, callback) => {
	const { service, action } = data; // action: start, stop, restart, status
	
	try {
		const result = await executeCommand(`systemctl ${action} ${service}`, 10000);
		callback({ success: true, ...result });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

// Agent update handler
socket.on('agent:update', async (data, callback) => {
	const { version, downloadUrl } = data;
	
	try {
		console.log(`Updating agent to version ${version}...`);
		// Download and replace agent files, then restart service
		await executeCommand(`curl -L ${downloadUrl} | tar -xz -C /opt/warlock-agent --strip-components=1`, 60000);
		await executeCommand('systemctl restart warlock-agent', 5000);
		callback({ success: true });
	} catch (err) {
		callback({ success: false, error: err.message });
	}
});

// Ping/pong for connection health
socket.on('ping', (callback) => {
	callback({ pong: true, timestamp: Date.now() });
});

// Helper functions
function executeCommand(command, timeout = 30000, cwd = '/root') {
	return new Promise((resolve, reject) => {
		const options = {
			timeout,
			maxBuffer: 100 * 1024 * 1024, // 100MB
			cwd,
			env: process.env
		};

		exec(command, options, (error, stdout, stderr) => {
			if (error && error.killed) {
				reject(new Error(`Command timeout after ${timeout}ms`));
			} else if (error) {
				resolve({ stdout, stderr, code: error.code || 1 });
			} else {
				resolve({ stdout, stderr, code: 0 });
			}
		});
	});
}

async function collectMetrics() {
	try {
		const [cpu, mem, fsSize, networkStats, processes, osInfo] = await Promise.all([
			si.currentLoad(),
			si.mem(),
			si.fsSize(),
			si.networkStats(),
			si.processes(),
			si.osInfo()
		]);

		return {
			timestamp: Date.now(),
			cpu: {
				usage: cpu.currentLoad,
				cores: cpu.cpus.length
			},
			memory: {
				total: mem.total,
				used: mem.used,
				free: mem.free,
				usage: (mem.used / mem.total) * 100
			},
			disk: fsSize.map(disk => ({
				fs: disk.fs,
				type: disk.type,
				size: disk.size,
				used: disk.used,
				available: disk.available,
				usage: disk.use
			})),
			network: networkStats.map(net => ({
				iface: net.iface,
				rx_bytes: net.rx_bytes,
				tx_bytes: net.tx_bytes,
				rx_sec: net.rx_sec,
				tx_sec: net.tx_sec
			})),
			processes: {
				all: processes.all,
				running: processes.running,
				blocked: processes.blocked,
				sleeping: processes.sleeping
			},
			uptime: osInfo.uptime
		};
	} catch (err) {
		throw new Error(`Metrics collection failed: ${err.message}`);
	}
}

// Auto-send metrics every 30 seconds
setInterval(async () => {
	if (socket.connected) {
		try {
			const metrics = await collectMetrics();
			socket.emit('metrics:push', metrics);
		} catch (err) {
			console.error('Failed to push metrics:', err.message);
		}
	}
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('Received SIGTERM, shutting down gracefully...');
	socket.disconnect();
	process.exit(0);
});

process.on('SIGINT', () => {
	console.log('Received SIGINT, shutting down gracefully...');
	socket.disconnect();
	process.exit(0);
});

console.log(`Warlock Agent v${VERSION} starting...`);
console.log(`Connecting to panel: ${PANEL_URL}`);
