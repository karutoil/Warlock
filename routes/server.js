const express = require('express');
const {validate_session} = require("../libs/validate_session.mjs");
const router = express.Router();

// Individual server detail page
router.get('/:guid/:host/:service', validate_session, (req, res) => {
	res.render('server_detail');
});

module.exports = router;
