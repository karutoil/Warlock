import {exec} from 'child_process';
import {Host} from "../db.js";
import {logger} from "./logger.mjs";

// Global app reference (set by Express app)
let globalApp = null;
let globalAgentSockets = null;

export function setGlobalApp(app) {
	globalApp = app;
	// Also get the agent sockets map from the app
	globalAgentSockets = app?.get?.('agentSockets');
}

/**
 * Check if agent actually has an active WebSocket connection
 * This is more reliable than checking the database status
 */
function hasActiveAgentSocket(hostIp) {
	if (!globalAgentSockets) return false;
	const socket = globalAgentSockets.get(hostIp);
	return socket && socket.connected === true;
}

/**
 * Run a command on the target host - prefers WebSocket agent, falls back to SSH
 *
 * @param target {string} - Host IP or identifier
 * @param cmd {string} - Command to execute
 * @param extraFields {*} - Extra fields to include in response
 * @returns {Promise<{stdout: string, stderr: string, extraFields: *}>|Promise<{error: Error, stdout: string, stderr: string, extraFields: *}>}
 */
export async function cmdRunner(target, cmd, extraFields = {}) {
	return new Promise(async (resolve, reject) => {
		// Confirm the host exists in the database first
		Host.count({where: {ip: target}}).then(async count => {
			let cmdOptions = {timeout: 30000, maxBuffer: 1024 * 1024 * 100}; // Increase buffer to 100MB for big log payloads
			if (count === 0) {
				return reject({
					error: new Error(`Target host '${target}' not found in database.`),
					stdout: '',
					stderr: '',
					extraFields
				});
			}

			// Try WebSocket agent ONLY if socket is actually connected
			// Don't rely on database status - check the actual socket
			const hasSocket = hasActiveAgentSocket(target);
			
			if (globalApp && hasSocket) {
				const executeOnAgent = globalApp.get('executeOnAgent');
				
				if (executeOnAgent) {
					logger.debug(`[WEBSOCKET] Attempting command on agent ${target}: ${cmd}`);
					try {
						const result = await executeOnAgent(target, cmd, cmdOptions.timeout);
						return resolve({
							stdout: result.stdout || result.output || '',
							stderr: result.stderr || '',
							extraFields,
							executedVia: 'websocket'
						});
					} catch (err) {
						logger.warn(`[WEBSOCKET] Agent execution failed for ${target}, falling back to SSH: ${err.message}`);
						// Fall through to SSH fallback
					}
				}
			}

			// Fallback to SSH
			logger.debug(`[SSH] Executing command on ${target}: ${cmd}`);
			let sshCommand = null;
			
			if (target === 'localhost' || target === '127.0.0.1') {
				sshCommand = cmd; // No SSH needed for localhost
			} else {
				// Escape single quotes in the remote command to avoid breaking the SSH command
				sshCommand = cmd.replace(/'/g, "'\\''");
				sshCommand = `ssh -o LogLevel=quiet -o StrictHostKeyChecking=no root@${target} '${sshCommand}'`;
			}

			exec(sshCommand, cmdOptions, (error, stdout, stderr) => {
				if (error) {
					logger.debug('cmdRunner exit code:', error.code);
					if (stderr) {
						logger.debug('cmdRunner stderr:', stderr);
						return reject({error: new Error(stderr), stdout, stderr, extraFields, executedVia: 'ssh'});
					}
					else {
						return reject({error, stdout, stderr, extraFields, executedVia: 'ssh'});
					}
				}

				logger.debug('cmdRunner:', stdout);
				resolve({stdout, stderr, extraFields, executedVia: 'ssh'});
			});
		});
	});
}
