const express = require('express');
const { validate_session } = require("../../libs/validate_session.mjs");
const { cmdRunner } = require("../../libs/cmd_runner.mjs");
const { filePushRunner } = require("../../libs/file_push_runner.mjs");
const path = require('path');
const fs = require('fs');
const { Host } = require('../../db');
const { logger } = require('../../libs/logger.mjs');
const {buildRemoteExec} = require("../../libs/build_remote_exec.mjs");

const router = express.Router();

// File viewing endpoint
router.get('/:host', validate_session, (req, res) => {
	const filePath = req.query.path || null,
		host = req.params.host;
	let forceDownload = req.query.download || false;

	if (forceDownload === 'true' || forceDownload === '1') {
		forceDownload = true;
	}

	if (!filePath) {
		return res.json({
			success: false,
			error: 'File path is required'
		});
	}
	logger.info('Viewing file:', filePath);

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		if (forceDownload) {
			// Create a temporary file to download the file to
			const tempFile = `/tmp/warlock_download_${Date.now()}_${path.basename(filePath)}`;
			filePushRunner(host, tempFile, filePath, true).then(() => {
				return res.download(tempFile, path.basename(filePath), (err) => {
					// Remove the temporary file after download
					fs.unlinkSync(tempFile);
					if (err) {
						logger.error('File download error:', err);
					}
				});
			}).catch(e => {
				return res.json({
					success: false,
					error: `Cannot download file: ${e.error.message}`
				});
			});
		}
		else {
			// First check if it's a text file and get its size and basic stats
			let cmd = `[ -h "${filePath}" ] && F="$(readlink -f "${filePath}")" || F="${filePath}"; ` +
				`file --mime-type "$F"; ` + // mimetype, line[0]
				`stat -c%s "$F"; ` + // filesize, line[1]
				`echo "$F"; ` + // filename, line[2]
				`[ -r "$F" ] && stat -c%Y "$F" || echo "0";`; // modified time, line[3]
			cmdRunner(host, cmd).then(result => {
				let lines = result.stdout.trim().split('\n'),
					mimetype = lines[0] || '',
					encoding = null,
					cmd = null,
					filesize = parseInt(lines[1]) || 0,
					filename = lines[2] || '',
					modified = parseInt(lines[3]) || 0;
					textMimetypes = [
						'application/json',
						'application/xml',
						'application/javascript',
						'application/x-javascript',
						'inode/x-empty',
						'application/x-wine-extension-ini',
					];

				if (mimetype) {
					mimetype = mimetype.split(':').pop().trim();
				}

				if (filesize <= 1024 * 1024 * 10) {
					if (mimetype.startsWith('text/') || textMimetypes.includes(mimetype)) {
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
							modified: modified,
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
						modified: modified,
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
		}
	});
});

/**
 * Rename a file or folder on the target host
 * Resolves symlinks to prevent breaking them
 */
router.post('/:host/rename', validate_session, (req, res) => {
	const host = req.params.host;
	const oldPath = req.query.oldPath;
	const newName = req.query.newName;

	if (!oldPath || !newName) {
		return res.json({
			success: false,
			error: 'Old path and new name are required'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Renaming file/folder:', oldPath, 'to:', newName);

		const path_obj = require('path');
		
		// First check if the source is a symlink
		const checkSymlinkCmd = `[ -h "${oldPath}" ] && echo "true" || echo "false"`;
		
		cmdRunner(host, checkSymlinkCmd).then(result => {
			const isSymlink = result.stdout.trim() === 'true';
			
			if (isSymlink) {
				// For symlinks: rename both the target file and the symlink
				logger.debug('Source is a symlink, will rename both target and symlink');
				
				const resolveCmd = `readlink -f "${oldPath}"`;
				cmdRunner(host, resolveCmd).then(resolveResult => {
					const targetPath = resolveResult.stdout.trim();
					const targetDir = path_obj.dirname(targetPath);
					const targetExt = path_obj.extname(targetPath);
					const targetBaseName = path_obj.basename(targetPath, targetExt);
					
					// Determine new names
					const newExt = path_obj.extname(newName);
					const newBaseName = path_obj.basename(newName, newExt);
					
					// New target path (same directory as old target, but with new name)
					const newTargetPath = path_obj.join(targetDir, newBaseName + (newExt || targetExt));
					
					// New symlink path (same directory as old symlink, with new name)
					const symlinkDir = path_obj.dirname(oldPath);
					const newSymlinkPath = path_obj.join(symlinkDir, newName);
					
					logger.debug('Renaming target:', targetPath, '->', newTargetPath);
					logger.debug('Renaming symlink:', oldPath, '->', newSymlinkPath);
					
					// Rename the target file, remove old symlink, create new symlink pointing to renamed target
					const cmd = `mv "${targetPath}" "${newTargetPath}" && rm "${oldPath}" && ln -s "${newTargetPath}" "${newSymlinkPath}"`;
					
					cmdRunner(host, cmd).then(() => {
						logger.info('Symlink renamed successfully. Target:', targetPath, '->', newTargetPath, 'Symlink:', oldPath, '->', newSymlinkPath);
						res.json({
							success: true,
							message: 'File/folder renamed successfully',
							newPath: newSymlinkPath,
							targetPath: newTargetPath
						});
					})
					.catch(e => {
						logger.error('Rename symlink error:', e);
						return res.json({
							success: false,
							error: `Cannot rename file/folder: ${e.error?.message || e.message || 'Unknown error'}`
						});
					});
				})
				.catch(e => {
					logger.error('Failed to resolve symlink:', e);
					return res.json({
						success: false,
						error: `Cannot resolve symlink: ${e.error?.message || e.message || 'Unknown error'}`
					});
				});
			} else {
				// For regular files/folders: just rename normally
				const dirPath = path_obj.dirname(oldPath);
				const newPath = path_obj.join(dirPath, newName);

				logger.debug('Renaming regular file:', oldPath, 'to:', newPath);

				// Use mv command to rename
				const cmd = `mv "${oldPath}" "${newPath}"`;
				
				cmdRunner(host, cmd).then(() => {
					logger.info('File/folder renamed successfully:', oldPath, '->', newPath);
					res.json({
						success: true,
						message: 'File/folder renamed successfully',
						newPath: newPath
					});
				})
				.catch(e => {
					logger.error('Rename file/folder error:', e);
					return res.json({
						success: false,
						error: `Cannot rename file/folder: ${e.error?.message || e.message || 'Unknown error'}`
					});
				});
			}
		})
		.catch(e => {
			logger.error('Failed to check symlink status:', e);
			return res.json({
				success: false,
				error: `Cannot check file type: ${e.error?.message || e.message || 'Unknown error'}`
			});
		});
	});
});

router.move('/:host', validate_session, (req, res) => {
	const { oldPath, newPath } = req.body,
		host = req.params.host;

	if (!oldPath || !newPath) {
		return res.json({
			success: false,
			error: 'Old path and new path are required'
		});
	}

	logger.info('Renaming item:', oldPath, '->', newPath);

	// Use mv command to rename
	cmdRunner(host, `mv "${oldPath}" "${newPath}"`).then(() => {
		logger.info('Item renamed successfully:', oldPath, '->', newPath);
		res.json({
			success: true,
			message: 'Item renamed successfully'
		});
	})
	.catch(e => {
		logger.error('Rename error:', e);
		return res.json({
			success: false,
			error: `Cannot rename item: ${e.error.message}`
		});
	});
});

/**
 * Save file contents to a given path on the target host
 */
router.post('/:host', validate_session, (req, res) => {
	let host = req.params.host,
		path = req.query.path,
		{ content } = req.body,
		name = req.query.name || null,
		isDir = req.query.isdir || false,
		shouldExtract = req.query.extract === '1' || req.query.extract === 'true';

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
		path = path.replace(/\/+$/, '') + '/' + name;
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		// Handle file extraction
		if (shouldExtract) {
			logger.info('Extracting file:', path);
			
			// Determine the destination directory (same as the file, without the extension)
			const path_obj = require('path');
			let outputDir = path_obj.dirname(path);
			const filename = path_obj.basename(path);
			
			// Build extraction command based on file type
			let cmd;
			if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
				cmd = `tar -xzf "${path}" -C "${outputDir}"`;
			} else if (filename.endsWith('.tar.bz2')) {
				cmd = `tar -xjf "${path}" -C "${outputDir}"`;
			} else if (filename.endsWith('.tar')) {
				cmd = `tar -xf "${path}" -C "${outputDir}"`;
			} else if (filename.endsWith('.zip')) {
				cmd = `unzip -q "${path}" -d "${outputDir}"`;
			} else if (filename.endsWith('.gz')) {
				cmd = `gunzip -f "${path}"`;
			} else if (filename.endsWith('.bz2')) {
				cmd = `bunzip2 -f "${path}"`;
			} else if (filename.endsWith('.7z')) {
				cmd = `7z x "${path}" -o"${outputDir}"`;
			} else {
				return res.json({
					success: false,
					error: 'Unsupported archive format'
				});
			}

			cmdRunner(host, cmd).then(() => {
				logger.debug('File extracted successfully:', path);
				res.json({
					success: true,
					message: 'File extracted successfully'
				});
			})
			.catch(e => {
				logger.error('Extract file error:', e);
				return res.json({
					success: false,
					error: `Cannot extract file: ${e.error?.message || e.message}`
				});
			});
			return;
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
			let cmd = `[ -e "${path}" ] && echo -n "" > "${path}" || touch "${path}"; chown $(stat -c%U "$(dirname "${path}")"):$(stat -c%U "$(dirname "${path}")") "${path}"`;
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

router.put('/:host', validate_session, (req, res) => {
	const host = req.params.host;
	const filePath = req.query.path;

	if (!filePath) {
		return res.json({
			success: false,
			error: 'Please enter a file path'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Uploading binary file:', filePath);

		// Create a temporary file
		const tempFile = `/tmp/warlock_upload_${Date.now()}.tmp`;
		const writeStream = fs.createWriteStream(tempFile);

		req.pipe(writeStream);

		writeStream.on('finish', () => {
			// Push the temporary file to the target device
			filePushRunner(host, tempFile, filePath).then(() => {
				logger.info('File uploaded successfully:', filePath);
				res.json({
					success: true,
					message: 'File uploaded successfully'
				});
			})
				.catch(error => {
					logger.error('Upload file error:', error);
					return res.json({
						success: false,
						error: `Cannot upload file: ${error.message}`
					});
				})
				.finally(() => {
					// Remove the temporary file
					if (fs.existsSync(tempFile)) {
						fs.unlinkSync(tempFile);
					}
				});
		});

		writeStream.on('error', (err) => {
			logger.error('File write error:', err);
			res.json({
				success: false,
				error: 'Error writing file'
			});
		});
	});
});

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

	Host.count({ where: { ip: host } }).then(count => {
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

/**
 * Extract archive file on the target host
 */
router.post('/:host/extract', validate_session, (req, res) => {
	let host = req.params.host,
		path = req.query.path || null;

	// Sanity checks
	if (!path) {
		return res.json({
			success: false,
			error: 'Please enter a file path'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		// First resolve symlink if path is a symlink
		const resolveCmd = `[ -h "${path}" ] && readlink -f "${path}" || echo "${path}"`;
		
		cmdRunner(host, resolveCmd).then(resolveResult => {
			const resolvedPath = resolveResult.stdout.trim();
			logger.debug('Resolved path for extraction:', resolvedPath);
			
			// Retrieve some information about the file and target environment.
			// We'll need to know the mimetype of the archive and which archive formats are available.
			const cmdDiscover = `if [ -e "${resolvedPath}" ]; then file --mime-type "${resolvedPath}"; else echo "missing"; fi;` +
				'if which unzip &>/dev/null; then echo "zip"; fi;' +
				'if which unrar &>/dev/null; then echo "rar"; fi;' +
				'if which tar &>/dev/null; then echo "tar"; echo "tar/gz"; echo "tar/xz"; echo "tar/bzip2"; fi;' +
				'if which unxz &>/dev/null; then echo "xz"; fi;' +
				'if which bunzip2 &>/dev/null; then echo "bzip2"; fi;' +
				'if which 7z &>/dev/null; then echo "7z"; fi;';

			const mimetypeToHandler = {
				'application/zip': 'zip',
				'application/x-rar': 'rar',
				'application/x-tar': 'tar',
				'application/gzip': 'gzip',
				'application/x-bzip2': 'bzip2',
				'application/x-xz': 'xz',
				'application/x-7z-compressed': '7z',
			};

			const handlerSources = {
				'zip': 'https://raw.githubusercontent.com/eVAL-Agency/ScriptsCollection/refs/heads/main/dist/zip/linux_install_unzip.sh',
				'rar': 'https://raw.githubusercontent.com/eVAL-Agency/ScriptsCollection/refs/heads/main/dist/rar/linux_install_unrar.sh',
				'7z': 'https://raw.githubusercontent.com/eVAL-Agency/ScriptsCollection/refs/heads/main/dist/7zip/linux_install_7zip.sh',
			};

			const cmdSudoPrefix = `sudo -u $(stat -c%U "$(dirname "${resolvedPath}")")`;

			const cmdExtracts = {
				'zip': `${cmdSudoPrefix} unzip -o "${resolvedPath}" -d "$(dirname "${resolvedPath}")/"`,
				'rar': `${cmdSudoPrefix} unrar x -o+ "${resolvedPath}" "$(dirname "${resolvedPath}")/"`,
				'7z': `${cmdSudoPrefix} 7z x "${resolvedPath}" -o"$(dirname "${resolvedPath}")/" -y`,
				'tar/gz': `${cmdSudoPrefix} tar -xzf "${resolvedPath}" -C "$(dirname "${resolvedPath}")/"`,
				'tar/bzip2': `${cmdSudoPrefix} tar -xjf "${resolvedPath}" -C "$(dirname "${resolvedPath}")/"`,
				'tar/xz': `${cmdSudoPrefix} tar -xJf "${resolvedPath}" -C "$(dirname "${resolvedPath}")/"`,
				'gzip': `${cmdSudoPrefix} gunzip -c "${resolvedPath}" > "$(dirname "${resolvedPath}")/$(basename "${resolvedPath}" .gz)"`,
				'bzip2': `${cmdSudoPrefix} bunzip2 -c "${resolvedPath}" > "$(dirname "${resolvedPath}")/$(basename "${resolvedPath}" .bz2)"`,
				'xz': `${cmdSudoPrefix} unxz -c "${resolvedPath}" > "$(dirname "${resolvedPath}")/$(basename "${resolvedPath}" .xz)"`,
			}

			cmdRunner(host, cmdDiscover).then(async output => {
				let lines = output.stdout.trim().split('\n'),
					mimetype = lines[0] || 'missing',
					availableExtractors = lines.slice(1);

				if (mimetype.includes(': ')) {
					mimetype = mimetype.split(': ').pop().trim();
				}

				if (mimetype === 'missing') {
					return res.json({
						success: false,
						error: 'The specified file does not exist'
					});
				}

				let handler = mimetypeToHandler[mimetype] || null;
				if (!handler) {
					return res.json({
						success: false,
						error: `Unsupported archive mimetype: ${mimetype}`
					});
				}

				// Tarballs can be complicated, ie '.tar.gz' or '.tgz' will both be 'application/gzip' mimetype
				// but so will '.gz' files which are not tarballs.  We need to check the filename as well.
				if (handler === 'gzip' && (resolvedPath.endsWith('.tar.gz') || resolvedPath.endsWith('.tgz'))) {
					handler = 'tar/gz';
				}
				else if (handler === 'bzip2' && resolvedPath.endsWith('.tar.bz2')) {
					handler = 'tar/bzip2';
				}
				else if (handler === 'xz' && resolvedPath.endsWith('.tar.xz')) {
					handler = 'tar/xz';
				}

				if (!availableExtractors.includes(handler)) {
					// Install this handler on the server
					let source = handlerSources[handler] || null;
					if (!source) {
						return res.json({
							success: false,
							error: `No installation source found for missing extractor: ${handler}`
						});
					}

					await cmdRunner(host, buildRemoteExec(source).cmd);
				}

				const cmdExtract = cmdExtracts[handler] || null;
				if (!cmdExtract) {
					return res.json({
						success: false,
						error: `No extraction command found for handler: ${handler}`
					});
				}

				// Finally, extract the archive
				cmdRunner(host, cmdExtract).then(async output => {
					logger.info('Extracted archive successfully:', resolvedPath);
					res.json({
						success: true,
						message: 'Archive extracted successfully'
					});
				})
				.catch(e => {
					logger.error('Extract archive error:', e);
					return res.json({
						success: false,
						error: `Cannot extract archive: ${e.error?.message || e.message || 'Unknown error'}`
					});
				});
			})
			.catch(e => {
				return res.json({
					success: false,
					error: `Cannot extract archive: ${e.error.message}`
				});
			});
		})
		.catch(e => {
			logger.error('Failed to resolve symlink:', e);
			return res.json({
				success: false,
				error: `Cannot resolve symlink: ${e.error?.message || e.message || 'Unknown error'}`
			});
		});
	});
});

/**
 * Create a zip archive from a folder
 */
router.post('/:host/zip', validate_session, (req, res) => {
	const host = req.params.host;
	const folderPath = req.query.path;

	if (!folderPath) {
		return res.json({
			success: false,
			error: 'Please enter a folder path'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Creating tar.gz archive for folder:', folderPath);

		const path_obj = require('path');
		
		// Check if source is a symlink and resolve it
		const checkSymlinkCmd = `[ -h "${folderPath}" ] && readlink -f "${folderPath}" || echo "${folderPath}"`;
		
		cmdRunner(host, checkSymlinkCmd).then(result => {
			const targetPath = result.stdout.trim();
			const folderName = path_obj.basename(targetPath);
			const parentDir = path_obj.dirname(targetPath);
			const archiveFileName = `${folderName}.tar.gz`;
			const archiveFilePath = path_obj.join(parentDir, archiveFileName);

			logger.debug('Archiving target:', targetPath);

			// Create tar.gz archive using tar command (universally available on Linux)
			// -czf: create, compress with gzip, file
			// -C: change to directory first
			const cmd = `cd "${parentDir}" && tar -czf "${archiveFileName}" "${folderName}"`;

			cmdRunner(host, cmd).then(() => {
				logger.info('Tar.gz archive created successfully:', archiveFilePath);
				res.json({
					success: true,
					message: 'Archive created successfully',
					archivePath: archiveFilePath
				});
			})
			.catch(e => {
				logger.error('Archive creation error:', e);
				return res.json({
					success: false,
					error: `Cannot create archive: ${e.error?.message || e.message || 'Unknown error'}`
				});
			});
		})
		.catch(e => {
			logger.error('Failed to resolve path:', e);
			return res.json({
				success: false,
				error: `Cannot resolve path: ${e.error?.message || e.message || 'Unknown error'}`
			});
		});
	});
});

/**
 * Duplicate/clone a file or folder on the target host
 */
router.post('/:host/duplicate', validate_session, (req, res) => {
	const host = req.params.host;
	const filePath = req.query.path;

	if (!filePath) {
		return res.json({
			success: false,
			error: 'Please enter a file path'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Duplicating file/folder:', filePath);

		const path_obj = require('path');
		
		// First check if the source is a symlink
		const checkSymlinkCmd = `[ -h "${filePath}" ] && echo "true" || echo "false"`;
		
		cmdRunner(host, checkSymlinkCmd).then(result => {
			const isSymlink = result.stdout.trim() === 'true';
			
			if (isSymlink) {
				// For symlinks: copy the target file and create a new symlink
				logger.debug('Source is a symlink, will copy target and create new symlink');
				
				const resolveCmd = `readlink -f "${filePath}"`;
				cmdRunner(host, resolveCmd).then(resolveResult => {
					const targetPath = resolveResult.stdout.trim();
					const targetDir = path_obj.dirname(targetPath);
					const targetBaseName = path_obj.basename(targetPath);
					
					// Generate new name for the copied target file
					const parts = targetBaseName.split('.');
					let newTargetName;
					
					if (targetBaseName.includes('.') && parts.length > 1) {
						const ext = '.' + parts.pop();
						const nameWithoutExt = parts.join('.');
						newTargetName = `${nameWithoutExt}_copy${ext}`;
					} else {
						newTargetName = `${targetBaseName}_copy`;
					}
					
					const newTargetPath = path_obj.join(targetDir, newTargetName);
					
					// Generate new symlink name in the original directory
					const symlinkDir = path_obj.dirname(filePath);
					const symlinkBaseName = path_obj.basename(filePath);
					const symlinkParts = symlinkBaseName.split('.');
					let newSymlinkName;
					
					if (symlinkBaseName.includes('.') && symlinkParts.length > 1) {
						const ext = '.' + symlinkParts.pop();
						const nameWithoutExt = symlinkParts.join('.');
						newSymlinkName = `${nameWithoutExt}_copy${ext}`;
					} else {
						newSymlinkName = `${symlinkBaseName}_copy`;
					}
					
					const newSymlinkPath = path_obj.join(symlinkDir, newSymlinkName);
					
					logger.debug('Copying target:', targetPath, '->', newTargetPath);
					logger.debug('Creating symlink:', newSymlinkPath, '->', newTargetPath);
					
					// Copy the target file and create new symlink
					const cmd = `cp -r "${targetPath}" "${newTargetPath}" && ` +
						`chown -R $(stat -c%U "${targetPath}"):$(stat -c%G "${targetPath}") "${newTargetPath}" && ` +
						`ln -s "${newTargetPath}" "${newSymlinkPath}"`;
					
					cmdRunner(host, cmd).then(() => {
						logger.info('Symlink duplicated successfully. Target copied:', targetPath, '->', newTargetPath, 'New symlink:', newSymlinkPath);
						res.json({
							success: true,
							message: 'File/folder duplicated successfully',
							newPath: newSymlinkPath,
							targetPath: newTargetPath
						});
					})
					.catch(e => {
						logger.error('Duplicate symlink error:', e);
						return res.json({
							success: false,
							error: `Cannot duplicate file/folder: ${e.error?.message || e.message || 'Unknown error'}`
						});
					});
				})
				.catch(e => {
					logger.error('Failed to resolve symlink:', e);
					return res.json({
						success: false,
						error: `Cannot resolve symlink: ${e.error?.message || e.message || 'Unknown error'}`
					});
				});
			} else {
				// For regular files/folders: just copy normally
				const dirPath = path_obj.dirname(filePath);
				const baseName = path_obj.basename(filePath);
				
				// Generate a new name with _copy suffix
				let newName, newPath;
				const parts = baseName.split('.');
				
				if (baseName.includes('.') && parts.length > 1) {
					// If file has extension, insert _copy before extension
					const ext = '.' + parts.pop();
					const nameWithoutExt = parts.join('.');
					newName = `${nameWithoutExt}_copy${ext}`;
				} else {
					// If no extension, just append _copy
					newName = `${baseName}_copy`;
				}
				
				newPath = path_obj.join(dirPath, newName);

				logger.debug('Duplicating regular file:', filePath, 'to:', newPath);

				// Use cp -r for recursive copying
				const cmd = `cp -r "${filePath}" "${newPath}" && chown -R $(stat -c%U "$(dirname "${filePath}")"):$(stat -c%G "$(dirname "${filePath}")") "${newPath}"`;

				cmdRunner(host, cmd).then(() => {
					logger.info('File/folder duplicated successfully:', filePath, '->', newPath);
					res.json({
						success: true,
						message: 'File/folder duplicated successfully',
						newPath: newPath
					});
				})
				.catch(e => {
					logger.error('Duplicate file/folder error:', e);
					return res.json({
						success: false,
						error: `Cannot duplicate file/folder: ${e.error?.message || e.message || 'Unknown error'}`
					});
				});
			}
		})
		.catch(e => {
			logger.error('Failed to check symlink status:', e);
			return res.json({
				success: false,
				error: `Cannot check file type: ${e.error?.message || e.message || 'Unknown error'}`
			});
		});
	});
});

/**
 * Move/relocate a file or folder on the target host
 * Supports both full paths and relative paths (relative to basePath)
 * Resolves symlinks to prevent breaking them
 */
router.post('/:host/move', validate_session, (req, res) => {
	const host = req.params.host;
	const oldPath = req.query.oldPath;
	const destinationInput = req.query.destination;
	const basePath = req.query.basePath || '';

	if (!oldPath || !destinationInput) {
		return res.json({
			success: false,
			error: 'Old path and destination are required'
		});
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({
				success: false,
				error: 'Requested host is not in the configured HOSTS list'
			});
		}

		logger.info('Moving file/folder:', oldPath, 'to:', destinationInput, 'basePath:', basePath);

		const path_obj = require('path');
		
		// Determine the actual destination path
		let newPath = destinationInput;
		
		// If the destination doesn't start with '/', it's relative to the current directory
		if (!newPath.startsWith('/')) {
			// Get the base path from the old path's directory
			const oldDir = path_obj.dirname(oldPath);
			newPath = path_obj.join(oldDir, newPath);
		}
		
		// Normalize the path
		newPath = newPath.replace(/\/+/g, '/');

		// Validate that both old and new paths are within the basePath (if basePath is provided)
		if (basePath) {
			const normalizedBasePath = path_obj.normalize(basePath).replace(/\/+/g, '/');
			const normalizedOldPath = path_obj.normalize(oldPath).replace(/\/+/g, '/');
			const normalizedNewPath = path_obj.normalize(newPath).replace(/\/+/g, '/');
			
			// Check if oldPath is within basePath
			if (!normalizedOldPath.startsWith(normalizedBasePath + '/') && normalizedOldPath !== normalizedBasePath) {
				return res.json({
					success: false,
					error: `Source path is outside the base directory: ${normalizedBasePath}`
				});
			}
			
			// Check if newPath would be within basePath
			if (!normalizedNewPath.startsWith(normalizedBasePath + '/') && normalizedNewPath !== normalizedBasePath) {
				return res.json({
					success: false,
					error: `Cannot move files outside the base directory: ${normalizedBasePath}`
				});
			}
		}

		logger.debug('Resolved destination path:', newPath);

		// Use mv command to move (works on both files and symlinks)
		const cmd = `mv "${oldPath}" "${newPath}"`;
		
		cmdRunner(host, cmd).then(() => {
			logger.info('File/folder moved successfully:', oldPath, '->', newPath);
			res.json({
				success: true,
				message: 'File/folder moved successfully',
				newPath: newPath
			});
		})
		.catch(e => {
			logger.error('Move file/folder error:', e);
			return res.json({
				success: false,
				error: `Cannot move file/folder: ${e.error?.message || e.message || 'Unknown error'}`
			});
		});
	});
});

module.exports = router;
