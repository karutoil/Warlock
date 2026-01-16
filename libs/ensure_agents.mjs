/**
 * Startup Task: Install agents on all hosts that don't have them
 * Runs once when panel starts to ensure all hosts have agents
 */

import { Host } from '../db.js';
import { isAgentInstalled, installAgent } from './agent_manager.mjs';
import { logger } from './logger.mjs';

export async function ensureAllAgentsInstalled() {
	try {
		logger.info('Starting agent deployment check for all hosts...');
		
		// Get all hosts from database
		const hosts = await Host.findAll();
		
		if (hosts.length === 0) {
			logger.info('No hosts found, skipping agent deployment');
			return;
		}

		const panelUrl = process.env.PANEL_URL || `http://${process.env.IP || '127.0.0.1'}:${process.env.PORT || 3077}`;
		
		let installed = 0;
		let alreadyInstalled = 0;
		let failed = 0;

		// Process hosts in parallel (but limit concurrency to avoid overwhelming)
		const processHost = async (host) => {
			const hostIp = host.ip;
			
			try {
				// Skip localhost special handling - it still needs the agent
				// Check if agent already installed
				const agentExists = await isAgentInstalled(hostIp);
				
				if (agentExists) {
					logger.info(`Agent already installed on ${hostIp}`);
					alreadyInstalled++;
					return;
				}

				// Install agent
				logger.info(`Installing agent on ${hostIp}...`);
				const result = await installAgent(hostIp, panelUrl);
				
				if (result.success) {
					logger.info(`✓ Agent successfully installed on ${hostIp}`);
					installed++;
				} else {
					logger.warn(`✗ Agent installation failed on ${hostIp}: ${result.error}`);
					failed++;
				}
			} catch (err) {
				logger.error(`Error processing agent installation for ${hostIp}:`, err.message);
				failed++;
			}
		};

		// Process hosts with concurrency limit of 3
		const chunks = [];
		for (let i = 0; i < hosts.length; i += 3) {
			chunks.push(hosts.slice(i, i + 3));
		}

		for (const chunk of chunks) {
			await Promise.all(chunk.map(processHost));
		}

		logger.info(`Agent deployment complete: ${installed} installed, ${alreadyInstalled} already installed, ${failed} failed`);
	} catch (err) {
		logger.error('Error in ensureAllAgentsInstalled:', err);
	}
}
