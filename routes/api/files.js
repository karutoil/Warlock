const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");
const {Host} = require('../../db');
const {logger} = require('../../libs/logger.mjs');

const router = express.Router();

// File browser endpoints
router.get('/:host', validate_session, (req, res) => {
	const requestedPath = req.query.path || '/root';
	const host = req.params.host;

	if (!requestedPath) {
		return res.json({
			success: false,
			error: 'Path is required'
		});
	}

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Browsing directory:', requestedPath);

		// Use ls with detailed output to get file information
		// -la shows all details including symlinks
		//let cmd = `ls -la "${requestedPath}" | tail -n +2`;
		let cmd = `P="${requestedPath}"; ` +
			'ls -1 "$P" | while read F; do ' +
			'P="${P%/}"; ' +
			'ORIGINAL="$P/$F";' +
			'[ -h "$P/$F" ] && FP="$(readlink -f "$P/$F")" || FP="$P/$F";' +
			'[ -h "$P/$F" ] && SL="true" || SL="false";' +
			'[ -f "$FP" ] && [ -r "$FP" ] && S="$(stat -L -c%s "$FP")" || S="null";' +
			'[ -r "$FP" ] && M="$(file --mime-type "$FP" | sed "s#.*: ##")" || M="";' +
			'[ -r "$FP" ] && PERMS="$(stat -c%a "$FP")" || PERMS="null";' +
			'U="$(stat -c%U "$FP")";' +
			'G="$(stat -c%G "$FP")";' +
			'[ -r "$FP" ] && MTIME="$(stat -c%Y "$FP")" || MTIME="null";' +
			`echo "{\\"name\\":\\"$F\\",\\"mimetype\\":\\"$M\\",\\"path\\":\\"$ORIGINAL\\",\\"targetPath\\":\\"$FP\\",\\"size\\":$S,\\"symlink\\":$SL,\\"permissions\\":$PERMS,\\"user\\":\\"$U\\",\\"group\\":\\"$G\\",\\"modified\\":$MTIME},";` +
			'done;';
		cmdRunner(host, cmd).then(result => {
			// Resulting code will be _almost_ JSON compatible, just strip the trailing comma and wrap in []
			let jsonOutput = `[${result.stdout.trim().replace(/,$/, '')}]`;
			let files = [];
			try {
				files = JSON.parse(jsonOutput);
			} catch (e) {
				return res.json({
					success: false,
					error: 'Failed to parse directory listing'
				});
			}

			res.json({
				success: true,
				files: files,
				path: requestedPath
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.error.message
			});
		});
	});
});

// Create new file endpoint
router.post('/create-file', validate_session, (req, res) => {
	const {host, path, fileName} = req.body;

	if (!host || !path || !fileName) {
		return res.json({
			success: false,
			error: 'Host, path, and fileName are required'
		});
	}

	// Prevent path traversal
	if (fileName.includes('/') || fileName.includes('..')) {
		return res.json({
			success: false,
			error: 'Invalid file name'
		});
	}

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		// Ensure path doesn't end with /
		const safePath = path.endsWith('/') ? path : path + '/';
		const fullPath = safePath + fileName;

		logger.info('Creating file:', fullPath);

		// Touch the file to create it
		const cmd = `touch "${fullPath}"`;
		cmdRunner(host, cmd).then(result => {
			res.json({
				success: true,
				message: `File "${fileName}" created successfully`
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.error.message || 'Failed to create file'
			});
		});
	});
});

// Create new folder endpoint
router.post('/create-folder', validate_session, (req, res) => {
	const {host, path, folderName} = req.body;

	if (!host || !path || !folderName) {
		return res.json({
			success: false,
			error: 'Host, path, and folderName are required'
		});
	}

	// Prevent path traversal
	if (folderName.includes('/') || folderName.includes('..')) {
		return res.json({
			success: false,
			error: 'Invalid folder name'
		});
	}

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		// Ensure path doesn't end with /
		const safePath = path.endsWith('/') ? path : path + '/';
		const fullPath = safePath + folderName;

		logger.info('Creating folder:', fullPath);

		// Create directory with mkdir -p
		const cmd = `mkdir -p "${fullPath}"`;
		cmdRunner(host, cmd).then(result => {
			res.json({
				success: true,
				message: `Folder "${folderName}" created successfully`
			});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.error.message || 'Failed to create folder'
			});
		});
	});
});

module.exports = router;