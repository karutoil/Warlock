/**
 * Agent Status and Management API Routes
 */

const express = require('express');
const router = express.Router();
const { validate_session } = require('../../libs/validate_session.mjs');

// Import agent manager functions (using dynamic import for ESM)
let agentManager;
(async () => {
	agentManager = await import('../../libs/agent_manager.mjs');
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
		
		if (!agent) {
			return res.json({ 
				success: true, 
				installed: false,
				connected: false
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
			last_ping: agent.last_ping
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

// Check agent health
router.post('/:ip/health', validate_session, async (req, res) => {
	try {
		const { ip } = req.params;
		const agentSockets = req.app.get('agentSockets');

		const health = await agentManager.checkAgentHealth(ip, agentSockets);

		res.json({ success: true, ...health });
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
