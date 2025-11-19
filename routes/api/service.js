const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");

const router = express.Router();

/**
 * Get a single service and its status from a given host and application GUID
 */
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	validateHostService(req.params.host, req.params.guid, req.params.service)
		.then(dat => {
			return res.json({
				success: true,
				service: dat.service,
				host: dat.host,
				app: dat.app.guid,
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message,
				service: []
			});
		});
});

module.exports = router;
