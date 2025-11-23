const express = require('express');
const { validate_session } = require("../libs/validate_session.mjs");
const { Host } = require('../db');
const router = express.Router();

// Render firewall UI for a given host (hostid is the IP/hostname)
router.get('/:host', validate_session, (req, res) => {
	const host = req.params.host;

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.status(404).send('Host not found');
		}

		res.render('firewall');
	}).catch(err => {
		console.error('Database error checking host:', err);
		res.status(500).send('Internal Server Error');
	});
});

module.exports = router;

