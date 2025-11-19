const express = require('express');
const {User} = require("../db");
const router = express.Router();

router.get('/', (req, res) => {
	// If there are no users in the database, redirect to install page
	User.count().then((count) => {
		if (count === 0) {
			res.redirect('/install');
		}
		else {
			res.redirect('/dashboard');
		}
	});
});

module.exports = router;