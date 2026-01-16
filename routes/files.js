
const express = require('express');
const {validate_session} = require("../libs/validate_session.mjs");
const router = express.Router();

// File browser page route (with no host selected)
// Redirect to hosts page since files are accessed through host cards
router.get('/', validate_session, (req, res) => {
	res.redirect('/hosts');
});

router.get('/:host', validate_session, (req, res) => {
	res.render('files');
});

module.exports = router;