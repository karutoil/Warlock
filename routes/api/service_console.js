const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {cmdStreamer} = require("../../libs/cmd_streamer.mjs");

const router = express.Router();

/**
 * Stream live console output from a running game server
 * GET /api/service/console/:guid/:host/:service
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	const {guid, host, service} = req.params;

	if (!(host && guid && service)) {
		return res.status(400).json({
			success: false,
			error: 'Host, GUID, and service are required'
		});
	}

	validateHostService(host, guid, service)
		.then(dat => {
			// Stream the systemd journal output directly for this service
			// This works without requiring manage.py to have --console-attach support
			const cmd = `journalctl -u ${service}.service -f -n 50 --no-pager`;

			// Stream the console output to the client
			cmdStreamer(host, cmd, res).catch(() => {
				// Stream ended or error occurred
			});
		})
		.catch(e => {
			return res.status(400).json({
				success: false,
				error: e.message
			});
		});
});

module.exports = router;
