const express = require('express');
const {validate_session} = require("../libs/validate_session.mjs");
const router = express.Router();

// Servers overview page
router.get('/', validate_session, (req, res) => {
	res.render('servers');
});

module.exports = router;
