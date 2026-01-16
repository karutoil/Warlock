const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");
const {cmdStreamer} = require("../../libs/cmd_streamer.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");

const router = express.Router();

// Rate limiting for historical log fetches to prevent abuse (per session+service)
const LOGS_RATE_LIMIT_WINDOW_MS = 3000; // 3 seconds minimum between requests
const logsRateMap = new Map();

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
				// Rate limit check - prevent rapid mode switching
				try {
					const rateKey = `${req.sessionID}:${dat.host.host}:${dat.service.service}`;
					const last = logsRateMap.get(rateKey) || 0;
					const now = Date.now();
					if (now - last < LOGS_RATE_LIMIT_WINDOW_MS) {
						const wait = Math.ceil((LOGS_RATE_LIMIT_WINDOW_MS - (now - last)) / 1000) || 1;
						res.set('Retry-After', String(wait));
						res.status(429).json({success: false, error: `Too many log requests - please wait ${wait} second(s)`});
						return;
					}
					logsRateMap.set(rateKey, now);
					// garbage collect the key after a short period
					setTimeout(() => logsRateMap.delete(rateKey), LOGS_RATE_LIMIT_WINDOW_MS * 4);
				} catch (e) {
					// If anything goes wrong with rate limiting, continue but log
					console.warn('Rate limit check failed:', e);
				}

				// User requested a static view of recent logs - return gzipped base64 to reduce transfer size
				const cmd = `journalctl -qu ${dat.service.service}.service --no-pager -S -${offset}${mode} -U -${offset-1}${mode} | gzip -c | base64`;
				cmdRunner(dat.host.host, cmd)
					.then(output => {
						res.json({success: true, compressed: true, data: output.stdout});
					})
					.catch(e => {
						res.status(400).json({success: false, error: e.error?.message || e.message});
					});
			}
			else if (mode === 'custom') {
				// User requested custom date range - return gzipped base64
				const startDate = req.query.start;
				const endDate = req.query.end;
				
				if (!startDate || !endDate) {
					res.status(400).json({success: false, error: 'Start and end dates are required for custom mode'});
					return;
				}
				
				// journalctl expects format like "2023-01-15 14:30:00"
				const cmd = `journalctl -qu ${dat.service.service}.service --no-pager -S "${startDate}" -U "${endDate}" | gzip -c | base64`;
				cmdRunner(dat.host.host, cmd)
					.then(output => {
						res.json({success: true, compressed: true, data: output.stdout});
					})
					.catch(e => {
						res.status(400).json({success: false, error: e.error?.message || e.message});
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
