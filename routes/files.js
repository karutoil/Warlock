
const express = require('express');
const {validate_session} = require("../libs/validate_session.mjs");
const router = express.Router();

// File browser page route (with no host selected)
router.get('/', validate_session, (req, res) => {
	res.render('files_noserver');
});

router.get('/:host', validate_session, (req, res) => {
	res.render('files');
});

module.exports = router;