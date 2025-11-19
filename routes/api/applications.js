const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {getAllApplications} = require("../../libs/get_all_applications.mjs");

const router = express.Router();

/**
 * Get all available applications and which hosts each is installed on
 */
router.get('/', validate_session, (req, res) => {
	getAllApplications()
		.then(applications => {
			return res.json({
				success: true,
				applications: applications
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message,
				applications: []
			});
		});
});

module.exports = router;