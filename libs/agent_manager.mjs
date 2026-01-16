/**
 * Agent Connection Manager
 * Handles WebSocket agent connections, command execution, and fallback to SSH
 */

import { AgentConnection } from '../db.js';
import { logger } from './logger.mjs';
import { cmdRunner } from './cmd_runner.mjs';
import crypto from 'crypto';

/**
 * Check if agent is connected for a host
 * @param {string} hostIp - Host IP address
 * @returns {Promise<boolean>} True if agent is connected
 */
export async function isAgentConnected(hostIp) {
	try {
		const agent = await AgentConnection.findOne({
			where: { host_ip: hostIp }
		});

		return agent && agent.status === 'connected';
	} catch (err) {
		logger.error(`Error checking agent status for ${hostIp}:`, err);
		return false;
	}
}

/**
 * Get agent connection details
 * @param {string} hostIp - Host IP address
 * @returns {Promise<Object|null>} Agent connection object or null
 */
export async function getAgentConnection(hostIp) {
	try {
		return await AgentConnection.findOne({
			where: { host_ip: hostIp }
		});
	} catch (err) {
		logger.error(`Error fetching agent for ${hostIp}:`, err);
		return null;
	}
}

/**
 * Generate a secure token for agent authentication
 * @returns {string} Random token
 */
export function generateAgentToken() {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Create or update agent connection record
 * @param {string} hostIp - Host IP address
 * @param {string} token - Optional token (generates new if not provided)
 * @returns {Promise<Object>} Agent connection object
 */
export async function createAgentConnection(hostIp, token = null) {
	try {
		const agentToken = token || generateAgentToken();

		const [agent, created] = await AgentConnection.findOrCreate({
			where: { host_ip: hostIp },
			defaults: {
				host_ip: hostIp,
				agent_token: agentToken,
				status: 'disconnected'
			}
		});

		if (!created && token) {
			// Update token if provided
			await agent.update({ agent_token: token });
		}

		logger.info(`Agent connection ${created ? 'created' : 'updated'} for ${hostIp}`);
		return agent;
	} catch (err) {
		logger.error(`Error creating agent connection for ${hostIp}:`, err);
		throw err;
	}
}

/**
 * Delete agent connection record
 * @param {string} hostIp - Host IP address
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteAgentConnection(hostIp) {
	try {
		const deleted = await AgentConnection.destroy({
			where: { host_ip: hostIp }
		});

		if (deleted > 0) {
			logger.info(`Agent connection deleted for ${hostIp}`);
			return true;
		}

		return false;
	} catch (err) {
		logger.error(`Error deleting agent connection for ${hostIp}:`, err);
		return false;
	}
}

/**
 * Execute command with automatic fallback
 * Tries WebSocket agent first, falls back to SSH if agent unavailable
 * 
 * @param {string} hostIp - Host IP address
 * @param {string} command - Command to execute
 * @param {Object} executeOnAgent - WebSocket execute function from app.js
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {string} options.cwd - Working directory (default: /root)
 * @returns {Promise<Object>} Execution result with stdout, stderr, code
 */
export async function executeCommand(hostIp, command, executeOnAgent, options = {}) {
	const { timeout = 30000, cwd = '/root' } = options;

	// Try agent first (including localhost for testing)
	const connected = await isAgentConnected(hostIp);
	
	if (connected && executeOnAgent) {
		try {
			logger.debug(`Executing via agent on ${hostIp}: ${command}`);
			const result = await executeOnAgent(hostIp, command, timeout, cwd);
			
			return {
				stdout: result.stdout || '',
				stderr: result.stderr || '',
				code: result.code || 0
			};
		} catch (err) {
			logger.warn(`Agent execution failed for ${hostIp}, falling back to SSH: ${err.message}`);
		}
	}

	// Fallback to SSH
	logger.debug(`Executing via SSH on ${hostIp}: ${command}`);
	return await cmdRunner(command, hostIp, timeout);
}

/**
 * Get all agent connections with their status
 * @returns {Promise<Array>} List of agent connections
 */
export async function getAllAgentConnections() {
	try {
		return await AgentConnection.findAll({
			order: [['host_ip', 'ASC']]
		});
	} catch (err) {
		logger.error('Error fetching all agent connections:', err);
		return [];
	}
}

/**
 * Check agent health and update status
 * @param {string} hostIp - Host IP address
 * @param {Map} agentSockets - Map of active agent sockets
 * @returns {Promise<Object>} Health status
 */
export async function checkAgentHealth(hostIp, agentSockets) {
	try {
		const socket = agentSockets.get(hostIp);
		
		if (!socket || !socket.connected) {
			await AgentConnection.update({
				status: 'disconnected'
			}, {
				where: { host_ip: hostIp }
			});

			return { connected: false, error: 'Socket not connected' };
		}

		// Send ping and wait for pong
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve({ connected: false, error: 'Ping timeout' });
			}, 5000);

			socket.emit('ping', (response) => {
				clearTimeout(timeout);
				
				if (response && response.pong) {
					resolve({ connected: true, latency: Date.now() - response.timestamp });
				} else {
					resolve({ connected: false, error: 'Invalid pong response' });
				}
			});
		});
	} catch (err) {
		logger.error(`Error checking agent health for ${hostIp}:`, err);
		return { connected: false, error: err.message };
	}
}

/**
 * Install agent on a remote host via SSH
 * @param {string} hostIp - Host IP address
 * @param {string} panelUrl - Panel WebSocket URL
 * @returns {Promise<Object>} Installation result
 */
export async function installAgent(hostIp, panelUrl) {
	try {
		// Create agent connection and get token
		const agent = await createAgentConnection(hostIp);
		const token = agent.agent_token;

		let installCmd;
		
		// For localhost, use local installer script directly
		if (hostIp === '127.0.0.1' || hostIp === 'localhost') {
			// Get the project root directory (assuming we're in /root/Warlock)
			const projectRoot = process.cwd();
			installCmd = `cd ${projectRoot}/agent && ./install.sh --panel-url "${panelUrl}" --token "${token}"`;
		} else {
			// For remote hosts, download installer from GitHub
			installCmd = `
				cd /tmp && \\
				curl -sL https://raw.githubusercontent.com/BitsNBytes25/Warlock/main/agent/install.sh -o warlock-agent-install.sh && \\
				chmod +x warlock-agent-install.sh && \\
				./warlock-agent-install.sh --panel-url "${panelUrl}" --token "${token}" && \\
				rm -f warlock-agent-install.sh
			`.replace(/\s+/g, ' ').trim();
		}

		logger.info(`Installing agent on ${hostIp}...`);
		const result = await cmdRunner(hostIp, installCmd, { timeout: 300000 }); // 5 minute timeout

		if (result.code === 0 || !result.error) {
			logger.info(`Agent successfully installed on ${hostIp}`);
			return { success: true, stdout: result.stdout, stderr: result.stderr };
		} else {
			logger.error(`Agent installation failed on ${hostIp}: ${result.stderr}`);
			return { success: false, error: result.stderr || 'Installation failed', stdout: result.stdout };
		}
	} catch (err) {
		logger.error(`Error installing agent on ${hostIp}:`, err);
		return { success: false, error: err.message };
	}
}

/**
 * Uninstall agent from a remote host
 * @param {string} hostIp - Host IP address
 * @returns {Promise<Object>} Uninstallation result
 */
export async function uninstallAgent(hostIp) {
	try {
		const uninstallCmd = `
			curl -sL https://raw.githubusercontent.com/BitsNBytes25/Warlock/main/agent/uninstall.sh -o /tmp/warlock-agent-uninstall.sh && \\
			chmod +x /tmp/warlock-agent-uninstall.sh && \\
			echo "y" | /tmp/warlock-agent-uninstall.sh && \\
			rm -f /tmp/warlock-agent-uninstall.sh
		`.replace(/\s+/g, ' ').trim();

		logger.info(`Uninstalling agent from ${hostIp}...`);
		const result = await cmdRunner(hostIp, uninstallCmd, { timeout: 60000 });

		// Delete from database
		await deleteAgentConnection(hostIp);

		return { success: true, stdout: result.stdout, stderr: result.stderr };
	} catch (err) {
		logger.error(`Error uninstalling agent from ${hostIp}:`, err);
		return { success: false, error: err.message };
	}
}

/**
 * Check if agent is installed on a remote host
 * @param {string} hostIp - Host IP address
 * @returns {Promise<boolean>} True if agent is installed
 */
export async function isAgentInstalled(hostIp) {
	try {
		const checkCmd = 'systemctl is-active warlock-agent 2>/dev/null || echo "not-installed"';
		const result = await cmdRunner(hostIp, checkCmd, { timeout: 5000 });

		return result.stdout.trim() === 'active' || result.stdout.trim() === 'inactive';
	} catch (err) {
		logger.debug(`Agent not installed on ${hostIp}: ${err.message}`);
		return false;
	}
}
