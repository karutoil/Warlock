const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");
const {filePushRunner} = require("../../libs/file_push_runner.mjs");
const path = require('path');
const fs = require('fs');
const {Host} = require('../../db');
const {logger} = require('../../libs/logger.mjs');

const router = express.Router();

// File viewing endpoint
router.get('/:host', validate_session, (req, res) => {
	const filePath = req.query.path || null,
		host = req.params.host;

	if (!filePath) {
		return res.json({
			success: false,
			error: 'File path is required'
		});
	}
	logger.info('Viewing file:', filePath);

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		// First check if it's a text file and get its size
		let cmd = `[ -h "${filePath}" ] && F="$(readlink "${filePath}")" || F="${filePath}"; file --mime-type "$F" && stat -c%s "$F" && echo "$F"`;
		cmdRunner(host, cmd).then(result => {
			let lines = result.stdout.trim().split('\n'),
				mimetype = lines[0] || '',
				encoding = null,
				cmd = null,
				filesize = parseInt(lines[1]) || 0,
				filename = lines[2] || '';

			if (mimetype) {
				mimetype = mimetype.split(':').pop().trim();
			}

			if (filesize <= 1024 * 1024 * 10) {
				if (mimetype.startsWith('text/') || mimetype === 'application/json' || mimetype === 'application/xml') {
					cmd = `cat "${filePath}"`;
					encoding = 'raw';
				} else if (mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
					// For images/videos, return base64 encoding
					cmd = `base64 "${filePath}"`;
					encoding = 'base64';
				}
			}

			// Read the file content
			if (cmd) {
				cmdRunner(host, cmd).then(result => {
					return res.json({
						success: true,
						content: result.stdout,
						encoding: encoding,
						mimetype: mimetype,
						size: filesize,
						path: filename,
						name: path.basename(filePath),
					});
				})
				.catch(e => {
					return res.json({
						success: false,
						error: 'Cannot read file content'
					});
				});
			}
			else {
				return res.json({
					success: true,
					content: null,
					encoding: encoding,
					mimetype: mimetype,
					size: filesize,
					path: filename,
					name: path.basename(filePath),
				})
			}
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.error.message
			});
		});
	});
});

/**
 * Save file contents to a given path on the target host
 */
router.post('/:host', validate_session, (req, res) => {
	let host = req.params.host,
		path = req.query.path,
		{content} = req.body,
		name = req.query.name || null,
		isDir = req.query.isdir || false;

	isDir = (isDir === 'true' || isDir === '1');

	// Sanity checks
	if (!path) {
		return res.json({
			success: false,
			error: 'Please enter a file path'
		});
	}
	if (name) {
		// Allow the user to submit a path + name separately so we can validate the name
		['"', "'", '/', '\\', '?', '%', '*', ':', '|', '<', '>'].forEach(char => {
			if (name.includes(char)) {
				return res.json({
					success: false,
					error: `The file name cannot contain the following characters: " ' / \\ ? % * : | < >`
				});
			}
		});
	}
	['"', "'", '\\', '?', '%', '*', ':', '|', '<', '>'].forEach(char => {
		if (path.includes(char)) {
			return res.json({
				success: false,
				error: `The file path cannot contain the following characters: " ' \\ ? % * : | < >`
			});
		}
	});

	if (isDir && !name) {
		return res.json({
			success: false,
			error: 'Please enter a directory name'
		});
	}

	if (name) {
		// If name and path are requested separately, combine them to perform file operations.
		path = path.replace(/\/+$/,'') + '/' + name;
	}

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}
		if (isDir) {
			// Create directory
			logger.info('Creating directory:', path);
			let cmd = `mkdir -p "${path}" && chown $(stat -c%U "$(dirname "${path}")"):$(stat -c%U "$(dirname "${path}")") "${path}"`;
			cmdRunner(host, cmd).then(() => {
				logger.debug('Directory created successfully:', path);
				res.json({
					success: true,
					message: 'Directory created successfully'
				});
			})
			.catch(e => {
				logger.error('Create directory error:', e);
				return res.json({
					success: false,
					error: `Cannot create directory: ${e.error.message}`
				});
			});
		}
		else if (content) {
			// Content was requested, save to a local /tmp file to transfer to the target server
			logger.info('Saving file:', path);

			// Create a temporary file on the server with the content and then move it
			const tempFile = `/tmp/warlock_edit_${Date.now()}.tmp`;
			fs.writeFileSync(tempFile, content, 'utf8');

			// Push the temporary file to the target device
			filePushRunner(host, tempFile, path).then(() => {
				logger.info('File saved successfully:', path);
				res.json({
					success: true,
					message: 'File saved successfully'
				});
			})
			.catch(error => {
				logger.error('Save file error:', error);
				return res.json({
					success: false,
					error: `Cannot save file: ${error.message}`
				});
			})
			.finally(() => {
				// Remove the temporary file
				fs.unlinkSync(tempFile);
			});
		} else {
			// No content supplied, that's fine!  We can still create an empty file.
			let cmd = `touch "${path}" && chown $(stat -c%U "$(dirname "${path}")"):$(stat -c%U "$(dirname "${path}")") "${path}"`;
			cmdRunner(host, cmd).then(() => {
				logger.debug('File created successfully:', path);
				res.json({
					success: true,
					message: 'File saved successfully'
				});
			})
			.catch(e => {
				logger.error('Create file error:', e);
				return res.json({
					success: false,
					error: `Cannot create file: ${e.error.message}`
				});
			});
		}
	});
});

// @todo Add a PUT method to push a binary file to the target host.

/**
 * Delete file on a given path on the target host
 */
router.delete('/:host', validate_session, (req, res) => {
	const host = req.params.host;

	let path = req.query.path || null;

	// Sanity checks
	if (!path) {
		return res.json({
			success: false,
			error: 'Please enter a file path'
		});
	}
	if (path === '/') {
		return res.json({
			success: false,
			error: 'LULZ, Do not delete the root directory'
		});
	}

	Host.count({where: {ip: host}}).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Deleting file:', path);
		cmdRunner(host, `rm -fr "${path}"`).then(() => {
			logger.debug('File deleted successfully:', path);
			res.json({
				success: true,
				message: 'File removed successfully'
			});
		})
		.catch(e => {
			logger.error('Delete file error:', e);
			return res.json({
				success: false,
				error: `Cannot delete file: ${e.error.message}`
			});
		});
	});
});

module.exports = router;
