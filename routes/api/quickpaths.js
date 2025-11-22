const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");
const {Host} = require('../../db');
const {logger} = require('../../libs/logger.mjs');

const router = express.Router();

router.get('/:host', validate_session, (req, res) => {
	const host = req.params.host;

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info(`Fetching quick paths for host ${host}`);
		// Find common applications, (Steam in this case),
		// in common locations.  These will be in the user home directories.
		const cmd = `echo "STEAM:"; ls -d /home/*/.local/share/Steam 2>/dev/null; ` +
			'echo "GAMES:"; for file in /var/lib/warlock/*.app; do [ -f "$file" ] && echo "$(basename "$file" ".app"):$(cat "$file")"; done; ' +
			'echo "HOMES:"; ls -d /home/* 2>/dev/null; ls -d /root 2>/dev/null;';
		cmdRunner(host, cmd).then(result => {
			let paths = [];
			const lines = result.stdout.split('\n');
			let currentApp = null;

			lines.forEach(line => {
				line = line.trim();
				if (line === 'STEAM:') {
					currentApp = 'steam';
				}
				else if (line === 'HOMES:') {
					currentApp = 'home';
				}
				else if (line === 'GAMES:') {
					currentApp = 'game';
				}
				else if (currentApp === 'steam' && line.length > 0) {
					paths.push({
						type: 'app',
						app: 'steam',
						title: line.startsWith('/home/steam/') ? 'Steam' : `Steam (${line.split('/')[2]})`,
						path: line,
					});
				}
				else if (currentApp === 'home' && line.length > 0) {
					paths.push({
						type: 'home',
						title: line === '/root' ? 'root' : `${line.split('/')[2]}`,
						path: line,
					});
				}
				else if (currentApp === 'game' && line.length > 0) {
					let [guid, appPath] = line.split(':').map(s => s.trim());
					paths.push({
						type: 'game',
						guid: guid,
						path: appPath,
					});
				}
			});

			return res.json({
				success: true,
				paths: paths
			});
		}).catch(err => {
			return res.json({
				success: false,
				error: 'Failed to retrieve installed applications'
			});
		});
	});
});

module.exports = router;