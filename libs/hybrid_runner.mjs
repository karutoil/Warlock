/**
 * Hybrid Command Runner - WebSocket with SSH Fallback
 * Wrapper around agent execution that falls back to SSH when agents unavailable
 */

import { executeCommand as agentExecuteCommand, isAgentConnected } from './agent_manager.mjs';
import { cmdRunner } from './cmd_runner.mjs';
import { logger } from './logger.mjs';

/**
 * Execute command on remote host with automatic fallback
 * Tries WebSocket agent first, falls back to SSH
 * 
 * @param {string} command - Command to execute
 * @param {string} target - Target host IP or identifier
 * @param {number} timeout - Timeout in milliseconds
 * @param {Object} app - Express app instance (optional, for accessing executeOnAgent)
 * @returns {Promise<Object>} Execution result {stdout, stderr, code}
 */
export async function hybridRunner(command, target, timeout = 30000, app = null) {
	// Try agent if app instance is available (including localhost for testing)
	if (app) {
		const executeOnAgent = app.get('executeOnAgent');
		
		if (executeOnAgent) {
			try {
				return await agentExecuteCommand(target, command, executeOnAgent, { timeout });
			} catch (err) {
				logger.debug(`Agent execution failed for ${target}, using SSH: ${err.message}`);
			}
		}
	}

	// Fallback to SSH
	return await cmdRunner(target, command, { timeout });
}

/**
 * Check if hybrid runner will use agent or SSH for a given host
 * @param {string} target - Target host IP
 * @returns {Promise<string>} 'agent', 'ssh', or 'local'
 */
export async function getExecutionMethod(target) {
	const connected = await isAgentConnected(target);
	if (connected) {
		return 'agent';
	}

	// For localhost, allow fallback to local execution, otherwise use SSH
	if (target === '127.0.0.1' || target === 'localhost') {
		return 'local';
	}

	return 'ssh';
}
