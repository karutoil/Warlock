const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {cmdStreamer} = require("../../libs/cmd_streamer.mjs");

const router = express.Router();

/**
 * Get recent logs for a given service
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(dat => {
			cmdStreamer(dat.host.host, `journalctl -fu ${dat.service.service}.service --no-pager`, res);
		})
		.catch(e => {
			res.status(400).send(`Could not render service logs: ${e.error.message}`);
		});
});

module.exports = router;
