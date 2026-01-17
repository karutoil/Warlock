/**
 * Agent Health Monitor
 * Monitors agent connectivity and auto-remediates offline agents
 */

import { AgentConnection } from '../db.js';
import { logger } from './logger.mjs';
import { cmdRunner } from './cmd_runner.mjs';
import { getAgentConnection } from './agent_manager.mjs';

// Track agent offline duration (in memory)
const agentOfflineDuration = new Map(); // host_ip -> {startTime, remediationAttempted}

const OFFLINE_THRESHOLD = 30000; // 30 seconds before auto-remediation
const REMEDIATION_RETRY_DELAY = 5000; // Wait 5 seconds between remediation attempts
const MAX_REMEDIATION_ATTEMPTS = 3;

/**
 * Check and track agent connectivity
 * Returns agent status and triggers remediation if offline too long
 * 
 * @param {string} hostIp - Host IP address
 * @returns {Promise<{connected: boolean, duration: number, remediating: boolean}>}
 */
export async function checkAgentHealth(hostIp) {
	try {
		const agent = await AgentConnection.findOne({
			where: { host_ip: hostIp }
		});

		if (!agent) {
			return { connected: false, duration: null, remediating: false, notFound: true };
		}

		const isConnected = agent.status === 'connected';
		
		if (isConnected) {
			// Agent came back online, reset tracking
			agentOfflineDuration.delete(hostIp);
			return { connected: true, duration: 0, remediating: false };
		}

		// Agent is offline, track duration
		const now = Date.now();
		let offlineTrack = agentOfflineDuration.get(hostIp);

		if (!offlineTrack) {
			offlineTrack = { startTime: now, remediationAttempts: 0 };
			agentOfflineDuration.set(hostIp, offlineTrack);
		}

		const duration = now - offlineTrack.startTime;
		const remediating = offlineTrack.remediationAttempts > 0;

		// Check if we should attempt remediation
		if (duration > OFFLINE_THRESHOLD && offlineTrack.remediationAttempts < MAX_REMEDIATION_ATTEMPTS) {
			// Schedule remediation asynchronously (don't block the request)
			attemptAgentRemediation(hostIp, agent).catch(err => {
				logger.error(`Agent remediation failed for ${hostIp}:`, err.message);
			});
			
			offlineTrack.remediationAttempts++;
			offlineTrack.lastRemediationTime = now;
		}

		return {
			connected: false,
			duration,
			remediating,
			remediationAttempts: offlineTrack.remediationAttempts,
			maxAttempts: MAX_REMEDIATION_ATTEMPTS
		};
	} catch (err) {
		logger.error(`Error checking agent health for ${hostIp}:`, err);
		return { connected: false, duration: null, remediating: false, error: err.message };
	}
}

/**
 * Attempt to remediate an offline agent
 * Tries to uninstall and reinstall the agent via SSH
 * 
 * @param {string} hostIp - Host IP address
 * @param {Object} agent - Agent connection object
 * @returns {Promise<boolean>} True if remediation was successful
 */
async function attemptAgentRemediation(hostIp, agent) {
	logger.warn(`[AGENT-REMEDIATION] Attempting to remediate agent on ${hostIp}`);

	try {
		// Step 1: Try to uninstall the agent via SSH
		logger.info(`[AGENT-REMEDIATION] Uninstalling agent on ${hostIp}...`);
		try {
			await cmdRunner(hostIp, 'systemctl stop warlock-agent 2>/dev/null; systemctl disable warlock-agent 2>/dev/null; rm -f /etc/systemd/system/warlock-agent.service');
			logger.info(`[AGENT-REMEDIATION] Agent uninstall completed on ${hostIp}`);
		} catch (err) {
			logger.warn(`[AGENT-REMEDIATION] Uninstall command failed (may be expected): ${err.message}`);
			// Continue anyway - agent might not be properly installed
		}

		// Step 2: Check if we can find agent installation info
		logger.info(`[AGENT-REMEDIATION] Getting agent token for reinstall on ${hostIp}...`);
		const agentToken = agent.agent_token;
		if (!agentToken) {
			throw new Error('No agent token found for remediation');
		}

		// Step 3: Attempt to reinstall via the agent installation command
		// This assumes the warlock agent installer is available at a known location
		const panelUrl = process.env.PANEL_URL || `http://${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || 3077}`;
		const installCommand = `curl -sSL https://raw.githubusercontent.com/BitsNBytes25/Warlock/main/agent/install.sh | bash -s -- --panel-url="${panelUrl}" --token="${agentToken}" 2>&1`;

		logger.info(`[AGENT-REMEDIATION] Reinstalling agent on ${hostIp}...`);
		const result = await cmdRunner(hostIp, installCommand, { timeout: 60000 });
		
		if (result.code === 0) {
			logger.info(`[AGENT-REMEDIATION] Agent reinstalled successfully on ${hostIp}`);
			// Reset tracking
			agentOfflineDuration.delete(hostIp);
			return true;
		} else {
			logger.error(`[AGENT-REMEDIATION] Agent reinstall failed on ${hostIp}: ${result.stderr || result.stdout}`);
			return false;
		}
	} catch (err) {
		logger.error(`[AGENT-REMEDIATION] Remediation failed for ${hostIp}:`, err);
		return false;
	}
}

/**
 * Clear offline tracking for a host (used when agent reconnects)
 * @param {string} hostIp - Host IP address
 */
export function clearOfflineTracking(hostIp) {
	agentOfflineDuration.delete(hostIp);
}

/**
 * Get all hosts currently being monitored
 * @returns {Array<{hostIp: string, duration: number, attempts: number}>}
 */
export function getMonitoredHosts() {
	const hosts = [];
	for (const [hostIp, track] of agentOfflineDuration.entries()) {
		hosts.push({
			hostIp,
			duration: Date.now() - track.startTime,
			attempts: track.remediationAttempts
		});
	}
	return hosts;
}

