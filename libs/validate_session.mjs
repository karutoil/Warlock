import { User } from '../db.js';

export const validate_session = (req, res, next) => {
	if (process.env.SKIP_AUTHENTICATION) {
		// If authentication is skipped, attach a default user object
		req.user = {
			id: 1,
			username: 'admin',
		};
		return next();
	}

	if (req.session && req.session.user) {
		// Lookup the user in the database to ensure session is valid
		const userId = req.session.user;
		User.findByPk(userId).then((user) => {
			if (user) {
				// User exists, proceed to next middleware
				// Attach the values from the user, (sans password and sensitive info)
				req.user = {
					id: user.id,
					username: user.username,
					// Add other non-sensitive fields as needed
				};
				return next();
			} else {
				// User not found, destroy session and redirect to login
				req.session.destroy(() => {
					return res.redirect('/login');
				});
			}
		}).catch((err) => {
			console.error('Database error during session validation:', err);
			return res.status(500).send('Internal Server Error');
		});
	} else {
		// No session, redirect to login
		return res.redirect('/login');
	}
};
