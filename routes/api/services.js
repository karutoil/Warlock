const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {getAllServices} = require("../../libs/get_all_services.mjs");

const router = express.Router();

/**
 * Get all services and their stats
 *
 * Returns JSON data with success (True/False), output/error, and services {list}
 *
 */
router.get('/', validate_session, (req, res) => {
	getAllServices()
		.then((services) => {
			return res.json({
				success: true,
				output: '',
				services: services
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message,
				services: []
			});
		});
});

module.exports = router;
