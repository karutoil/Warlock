/**
 * Represents the details of an application.
 *
 * @typedef {Object} AppData
 * @property {string} title Name of the application.
 * @property {string} guid Globally unique identifier of the application.
 * @property {string} icon Icon URL of the application.
 * @property {string} repo Repository URL fragment of the application.
 * @property {string} installer Installer URL fragment of the application.
 * @property {string} source Source handler for the application installer.
 * @property {string} thumbnail Thumbnail URL of the application.
 * @property {HostAppData[]} hosts List of hosts where the application is installed.
 * @property {string} image Full size image URL of the application.
 * @property {string} header Header image URL of the application.
 */

/**
 * Represents the details of a host specifically regarding an installed application.
 *
 * @typedef {Object} HostAppData
 * @property {string} host Hostname or IP of host.
 * @property {string} path Path where the application is installed on the host.
 *
 */

/**
 * Represents the details of a service.
 *
 * @typedef {Object} ServiceData
 * @property {string} name Name of the service, usually operator set for the instance/map name.
 * @property {string} service Service identifier registered in systemd.
 * @property {string} status Current status of the service, one of [running, stopped, starting, stopping].
 * @property {string} cpu_usage Current CPU usage of the service as a percentage or 'N/A'.
 * @property {string} memory_usage Current memory usage of the service in MB/GB or 'N/A'.
 * @property {number} game_pid Process ID of the game server process, or 0 if not running.
 * @property {number} service_pid Process ID of the service manager process, or 0 if not running.
 * @property {string} ip IP address the service is bound to.
 * @property {number} port Port number the service is using.
 * @property {number} player_count Current number of players connected to the service.
 * @property {number} max_players Maximum number of players allowed on the service.
 */

/**
 * Represents a configuration option for a given service or app
 *
 * @typedef {Object} AppConfigOption
 * @property {string} option Name of the configuration option.
 * @property {string|number|bool} value Current value of the configuration option.
 * @property {string|number|bool} default Default value of the configuration option.
 * @property {string} type Data type of the configuration option (str, int, bool, float, text).
 * @property {string} help Help text or description for the configuration option.
 */


const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: process.env.CORS_ORIGIN || '*',
		methods: ['GET', 'POST']
	},
	transports: ['websocket', 'polling']
});

const cookieParser = require('cookie-parser');
const session = require('express-session');
const {logger} = require("./libs/logger.mjs");
const {push_analytics} = require("./libs/push_analytics.mjs");
const {sequelize} = require("./db.js");
const {MetricsPollTask} = require("./tasks/metrics_poll.mjs");
const {MetricsMergeTask} = require("./tasks/metrics_merge.mjs");

// Load environment variables
dotenv.config();

// Make io available globally
app.set('io', io);


app.set('view engine', 'ejs')

app.use(cookieParser());

app.use(session({
	secret: process.env.SESSION_SECRET || 'warlock_secret_key',
	resave: false, // don't save session if unmodified
	saveUninitialized: false, // don't create session until something stored
}));


/***************************************************************
 **               Common Functions
 ***************************************************************/

// Middleware
const compression = require('compression');

app.use(express.json());
// Enable gzip compression for all responses (improves large log fetches and other API payloads)
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));


/***************************************************************
 **               Application/UI Endpoints
 ***************************************************************/

app.use('/', require('./routes/index'));
app.use('/install', require('./routes/install'));
app.use('/files', require('./routes/files'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/servers', require('./routes/servers'));
app.use('/server', require('./routes/server'));
app.use('/login', require('./routes/login'));
app.use('/hosts', require('./routes/hosts'));
app.use('/host/add', require('./routes/host_add'));
app.use('/host/delete', require('./routes/host_delete'));
app.use('/host/firewall', require('./routes/host_firewall'));
app.use('/service/logs', require('./routes/service_logs'));
app.use('/service/configure', require('./routes/service_configure'));
app.use('/application/uninstall', require('./routes/application_uninstall'));
app.use('/application/install', require('./routes/application_install'));
app.use('/application/backups', require('./routes/application_backups'));
app.use('/application/configure', require('./routes/application_configure'));
app.use('/settings', require('./routes/settings'));
app.use('/2fa-setup', require('./routes/2fa-setup'));


/***************************************************************
 **                      API Endpoints
 ***************************************************************/

app.use('/api/applications', require('./routes/api/applications'));
app.use('/api/file', require('./routes/api/file'));
app.use('/api/files', require('./routes/api/files'));
app.use('/api/hosts', require('./routes/api/hosts'));
app.use('/api/agents', require('./routes/api/agents'));
app.use('/api/services', require('./routes/api/services'));
app.use('/api/service', require('./routes/api/service'));
app.use('/api/service/logs', require('./routes/api/service_logs'));
app.use('/api/service/control', require('./routes/api/service_control'));
app.use('/api/service/command', require('./routes/api/service_command'));
app.use('/api/service/console', require('./routes/api/service_console'));
app.use('/api/service/configs', require('./routes/api/service_configs'));
app.use('/api/application', require('./routes/api/application'));
app.use('/api/application/backup', require('./routes/api/application_backup'));
app.use('/api/application/configs', require('./routes/api/application_configs'));
app.use('/api/application/update', require('./routes/api/application_update'));
app.use('/api/quickpaths', require('./routes/api/quickpaths'));
app.use('/api/cron', require('./routes/api/cron'));
app.use('/api/users', require('./routes/api/users'));
app.use('/api/firewall', require('./routes/api/firewall'));
app.use('/api/ports', require('./routes/api/ports'));
app.use('/api/metrics', require('./routes/api/metrics'));


const PORT = process.env.PORT || 3077;
const HOST = process.env.IP || '127.0.0.1';

/***************************************************************
 **               WebSocket Agent Management
 ***************************************************************/

const { AgentConnection } = require('./db.js');
const crypto = require('crypto');

// Store active socket connections
const agentSockets = new Map(); // host_ip -> socket

// Agent authentication middleware
io.use(async (socket, next) => {
	const { token, version, hostname } = socket.handshake.auth;
	
	if (!token) {
		return next(new Error('Authentication token required'));
	}

	try {
		// Verify token exists in database
		const agent = await AgentConnection.findOne({ where: { agent_token: token } });
		
		if (!agent) {
			logger.warn(`Agent authentication failed: Invalid token from ${socket.handshake.address}`);
			return next(new Error('Invalid authentication token'));
		}

		// Attach agent info to socket
		socket.agentHostIp = agent.host_ip;
		socket.agentVersion = version;
		socket.agentHostname = hostname;
		
		next();
	} catch (err) {
		logger.error('Agent authentication error:', err);
		next(new Error('Authentication failed'));
	}
});

// Agent connection handler
io.on('connection', async (socket) => {
	const hostIp = socket.agentHostIp;
	
	logger.info(`Agent connected: ${hostIp} (${socket.agentHostname}) v${socket.agentVersion}`);
	
	// Store socket reference
	agentSockets.set(hostIp, socket);
	
	// Update connection status in database
	try {
		await AgentConnection.update({
			socket_id: socket.id,
			agent_version: socket.agentVersion,
			connected_at: Math.floor(Date.now() / 1000),
			last_ping: Math.floor(Date.now() / 1000),
			status: 'connected'
		}, {
			where: { host_ip: hostIp }
		});
	} catch (err) {
		logger.error(`Failed to update agent connection status for ${hostIp}:`, err);
	}

	// Agent registration confirmation
	socket.on('agent:register', (data) => {
		logger.info(`Agent registered: ${hostIp} - ${JSON.stringify(data)}`);
		socket.emit('agent:registered', { success: true });
	});

	// Metrics push handler
	socket.on('metrics:push', async (metrics) => {
		// Broadcast metrics to any listening web clients
		io.emit(`metrics:${hostIp}`, metrics);
		
		// Update last ping
		try {
			await AgentConnection.update({
				last_ping: Math.floor(Date.now() / 1000)
			}, {
				where: { host_ip: hostIp }
			});
		} catch (err) {
			logger.error(`Failed to update last ping for ${hostIp}:`, err);
		}
	});

	// Ping/pong for health monitoring
	socket.on('ping', (callback) => {
		if (typeof callback === 'function') {
			callback({ pong: true, timestamp: Date.now() });
		}
	});

	// Stream handlers
	socket.on('stream:stdout', (data) => {
		io.emit(`stream:stdout:${hostIp}:${data.streamId}`, data.data);
	});

	socket.on('stream:stderr', (data) => {
		io.emit(`stream:stderr:${hostIp}:${data.streamId}`, data.data);
	});

	socket.on('stream:close', (data) => {
		io.emit(`stream:close:${hostIp}:${data.streamId}`, data.code);
	});

	socket.on('stream:error', (data) => {
		io.emit(`stream:error:${hostIp}:${data.streamId}`, data.error);
	});

	// Disconnect handler
	socket.on('disconnect', async (reason) => {
		logger.info(`Agent disconnected: ${hostIp} - ${reason}`);
		
		// Remove from active sockets
		agentSockets.delete(hostIp);
		
		// Update status in database
		try {
			await AgentConnection.update({
				socket_id: null,
				status: 'disconnected'
			}, {
				where: { host_ip: hostIp }
			});
		} catch (err) {
			logger.error(`Failed to update disconnect status for ${hostIp}:`, err);
		}
	});
});

// Helper function to execute command on agent via WebSocket
async function executeOnAgent(hostIp, command, timeout = 30000, cwd = null) {
	const socket = agentSockets.get(hostIp);
	
	if (!socket || !socket.connected) {
		throw new Error(`Agent not connected for host: ${hostIp}`);
	}

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Command timeout after ${timeout}ms`));
		}, timeout);

		socket.emit('command:exec', { command, timeout, cwd }, (response) => {
			clearTimeout(timer);
			
			if (response.success) {
				resolve(response);
			} else {
				reject(new Error(response.error || 'Command execution failed'));
			}
		});
	});
}

// Export helper functions
app.set('agentSockets', agentSockets);
app.set('executeOnAgent', executeOnAgent);

/***************************************************************
 **                  Server Startup
 ***************************************************************/

// Start the server
server.listen(PORT, HOST, () => {
	logger.info(`Listening on ${PORT}`);

	// Ensure the sqlite database is up to date with the schema.
	sequelize.sync({ alter: true }).then(async () => {
		logger.info('Initialized database connection and synchronized schema.');

		// Send a tracking snippet to our analytics server so we can monitor basic usage.
		push_analytics('Start');

		// Deploy agents to all hosts that don't have them (runs once on startup)
		const { ensureAllAgentsInstalled } = await import('./libs/ensure_agents.mjs');
		setTimeout(() => {
			ensureAllAgentsInstalled().catch(err => {
				logger.error('Agent deployment task failed:', err);
			});
		}, 2000); // Wait 2 seconds after startup to let server fully initialize

		MetricsPollTask();
		setInterval(MetricsPollTask, 60000); // Run every 60 seconds

		MetricsMergeTask();
		setInterval(MetricsMergeTask, 3600000); // Run every hour
	});
});
