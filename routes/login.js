const express = require('express');
const {User} = require("../db");
const csrf = require('csurf');
const bodyParser = require('body-parser');

const router = express.Router();
const csrfProtection = csrf({ cookie: true });
const parseForm = bodyParser.urlencoded({ extended: false });

router.get('/', csrfProtection, (req, res) => {
	res.locals.csrfToken = req.csrfToken();

	res.render('login');
});

router.post('/', parseForm, csrfProtection, (req, res) => {
	const {username, password} = req.body;

	res.locals.csrfToken = req.csrfToken();

	if ( !username || !password ) {
		return res.render('install', {error: 'Username and password are required.'});
	}

	User.findOne({ where: { username } })
		.then(user => {
			if (!user || !user.validatePassword(password)) {
				return res.render('login', { error: 'Invalid username or password.' });
			}

			// Set session user
			req.session.user = user.id;
			res.redirect('/dashboard');
		})
		.catch(err => {
			console.error('Error during login:', err);
			res.status(500).send('Internal Server Error');
		});
});

module.exports = router;