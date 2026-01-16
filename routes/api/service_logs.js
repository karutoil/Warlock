const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {cmdStreamer} = require("../../libs/cmd_streamer.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");

const router = express.Router();

/**
 * Get recent logs for a given service
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	const mode = req.query.mode || 'live',
		offset = parseInt(req.query.offset) || 1;

	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(dat => {
			if (mode === 'live') {
				// User requested a live real-time view of logs
				// Use the cmdStreamer to stream output straight to the browser.
				cmdStreamer(dat.host.host, `journalctl -qfu ${dat.service.service}.service --no-pager`, res);
			}
			else if (mode === 'd' || mode === 'h') {
				// User requested a static view of recent logs
				const cmd = `journalctl -qu ${dat.service.service}.service --no-pager -S -${offset}${mode} -U -${offset-1}${mode}`;
				cmdRunner(dat.host.host, cmd)
					.then(output => {
						res.send(output.stdout);
					})
					.catch(e => {
						res.status(400).send(`Could not retrieve service logs: ${e.error.message}`);
					});
			}
			else if (mode === 'custom') {
				// User requested custom date range
				const startDate = req.query.start;
				const endDate = req.query.end;
				
				if (!startDate || !endDate) {
					res.status(400).send('Start and end dates are required for custom mode');
					return;
				}
				
				// journalctl expects format like "2023-01-15 14:30:00"
				const cmd = `journalctl -qu ${dat.service.service}.service --no-pager -S "${startDate}" -U "${endDate}"`;
				cmdRunner(dat.host.host, cmd)
					.then(output => {
						res.send(output.stdout);
					})
					.catch(e => {
						res.status(400).send(`Could not retrieve service logs: ${e.error.message}`);
					});
			}
			else {
				res.status(400).send(`Invalid mode specified: ${mode}`);
			}

		})
		.catch(e => {
			res.status(400).send(`Could not render service logs: ${e.error.message}`);
		});
});

module.exports = router;
