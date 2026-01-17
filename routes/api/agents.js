/**
 * Agent Status and Management API Routes
 */

const express = require('express');
const router = express.Router();
const { validate_session } = require('../../libs/validate_session.mjs');

// Import agent manager functions (using dynamic import for ESM)
let agentManager;
let agentHealthMonitor;
(async () => {
	agentManager = await import('../../libs/agent_manager.mjs');
	agentHealthMonitor = await import('../../libs/agent_health_monitor.mjs');
})();

// Get all agent connection statuses
router.get('/', validate_session, async (req, res) => {
	try {
		const connections = await agentManager.getAllAgentConnections();
		
		const agentSockets = req.app.get('agentSockets');
		
		// Enhance with real-time connection status
		const enhanced = connections.map(conn => ({
			host_ip: conn.host_ip,
			status: conn.status,
			agent_version: conn.agent_version,
			connected_at: conn.connected_at,
			last_ping: conn.last_ping,
			is_connected: agentSockets.has(conn.host_ip)
		}));

		res.json({ success: true, agents: enhanced });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Get agent status for specific host
router.get('/:ip', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;
		
		const agent = await agentManager.getAgentConnection(ip);
		const health = await agentHealthMonitor.checkAgentHealth(ip);
		
		if (!agent) {
			return res.json({ 
				success: true, 
				installed: false,
				connected: false,
				health: health
			});
		}

		const agentSockets = req.app.get('agentSockets');
		const isConnected = agentSockets.has(ip);

		res.json({
			success: true,
			installed: true,
			connected: isConnected,
			status: agent.status,
			agent_version: agent.agent_version,
			connected_at: agent.connected_at,
			last_ping: agent.last_ping,
			health: health
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Install agent on a host
router.post('/:ip/install', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;
		const panelUrl = req.body.panel_url || process.env.PANEL_URL || `http://${process.env.IP || '127.0.0.1'}:${process.env.PORT || 3077}`;

		const result = await agentManager.installAgent(ip, panelUrl);

		res.json(result);
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Uninstall agent from a host
router.post('/:ip/uninstall', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;

		const result = await agentManager.uninstallAgent(ip);

		res.json(result);
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Auto-register agent (create DB record if missing)
// This helps when agent is installed but database record doesn't exist
router.post('/:ip/register', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;

		// Check if record already exists
		let agent = await agentManager.getAgentConnection(ip);
		
		if (agent) {
			return res.json({ 
				success: true, 
				message: 'Agent already registered',
				agent: {
					host_ip: agent.host_ip,
					token: agent.agent_token,
					status: agent.status
				}
			});
		}

		// Create new agent connection record with auto-generated token
		agent = await agentManager.createAgentConnection(ip);
		
		res.json({
			success: true,
			message: 'Agent registered successfully',
			agent: {
				host_ip: agent.host_ip,
				token: agent.agent_token,
				status: agent.status,
				install_command: `curl -sSL https://raw.githubusercontent.com/BitsNBytes25/Warlock/main/agent/install.sh | bash -s -- --panel-url="${process.env.PANEL_URL || `http://${process.env.IP || '127.0.0.1'}:${process.env.PORT || 3077}`}" --token="${agent.agent_token}"`
			}
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Auto-fix agent (register + auto-install)
// This attempts to register the agent and install it automatically
router.post('/:ip/auto-fix', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;
		const { auto_install } = req.body;

		// Step 1: Register agent (create DB record)
		let agent = await agentManager.getAgentConnection(ip);
		
		if (!agent) {
			agent = await agentManager.createAgentConnection(ip);
		}

		const panelUrl = process.env.PANEL_URL || `http://${process.env.IP || '127.0.0.1'}:${process.env.PORT || 3077}`;
		const installCommand = `curl -sSL https://raw.githubusercontent.com/BitsNBytes25/Warlock/main/agent/install.sh | bash -s -- --panel-url="${panelUrl}" --token="${agent.agent_token}"`;

		// Step 2: If auto_install requested, attempt installation
		if (auto_install) {
			try {
				const { cmdRunner } = await import('../../libs/cmd_runner.mjs');
				const result = await cmdRunner(ip, installCommand, { timeout: 60000 });
				
				if (result.code === 0) {
					return res.json({
						success: true,
						message: 'Agent auto-installed successfully',
						agent: {
							host_ip: agent.host_ip,
							token: agent.agent_token,
							auto_installed: true
						}
					});
				} else {
					throw new Error(`Installation failed: ${result.stderr || result.stdout}`);
				}
			} catch (err) {
				// Installation failed, return manual instructions
				return res.json({
					success: false,
					message: 'Auto-install failed, manual installation required',
					error: err.message,
					manual_install: {
						host_ip: agent.host_ip,
						token: agent.agent_token,
						command: installCommand
					}
				});
			}
		}

		// Return registration info and install command
		res.json({
			success: true,
			message: 'Agent registered. Run the install command to complete setup.',
			agent: {
				host_ip: agent.host_ip,
				token: agent.agent_token,
				status: agent.status,
				install_command: installCommand
			}
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Check agent health
router.post('/:ip/health', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;

		const health = await agentHealthMonitor.checkAgentHealth(ip);

		res.json({ success: true, ...health });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Get all monitored hosts (health check)
router.get('/monitor/status', validate_session, async (req, res) => {
	try {
		const monitored = agentHealthMonitor.getMonitoredHosts();
		res.json({ success: true, monitored: monitored });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Regenerate agent token
router.post('/:ip/regenerate-token', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;
		
		const newToken = agentManager.generateAgentToken();
		await agentManager.createAgentConnection(ip, newToken);

		res.json({ 
			success: true, 
			message: 'Token regenerated. Agent must be reinstalled with new token.',
			token: newToken 
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

module.exports = router;
