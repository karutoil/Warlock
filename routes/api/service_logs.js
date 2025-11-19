const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");

const router = express.Router();

/**
 * Get recent logs for a given service
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(dat => {
			cmdRunner(dat.host.host, `${dat.host.path}/manage.py --service ${dat.service.service} --logs`)
				.then(result => {
					// Return raw output from the command back to the user agent
					res.set('Content-Type', 'text/plain');
					return res.send(result.stdout);
				})
				.catch(e => {
					res.status(400).send(`Could not render service logs: ${e.error.message}`);
				});
		})
		.catch(e => {
			res.status(400).send(`Could not render service logs: ${e.error.message}`);
		});
});

module.exports = router;
