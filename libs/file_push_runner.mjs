/*const { exec } = require('child_process');
const {Host} = require("../db");
const {logger} = require("./logger");
const {cmdRunner} = require("./cmd_runner");*/
import { exec } from 'child_process';
import { Host } from "../db.js";
import { logger } from "./logger.mjs";
import { cmdRunner } from "./cmd_runner.mjs";

/**
 * Push a local file to a remote target via SCP
 * or copy locally if target is localhost
 *
 * @param {string} target Target hostname or IP address
 * @param {string} src Local source file, (usually within /tmp)
 * @param {string} dest Fully resolved pathname of target file
 * @param extraFields {*}
 * @returns {Promise<{stdout: string, stderr: string, extraFields: *}>|Promise<{error: Error, stdout: string, stderr: string, extraFields: *}>}
 */
export async function filePushRunner(target, src, dest, extraFields = {}) {
	return new Promise((resolve, reject) => {
		// Confirm the host exists in the database first
		Host.count({where: {ip: target}})
			.then(count => {
				let sshCommand = null,
					cmdOptions = {timeout: 120000, maxBuffer: 1024 * 1024 * 20},
					permissionCmd = `chown $(stat -c%U "$(dirname "${dest}")"):$(stat -c%U "$(dirname "${dest}")") "${dest}"`;

				if (count === 0) {
					return reject({
						error: new Error(`Target host '${target}' not found in database.`),
						stdout: '',
						stderr: '',
						extraFields
					});
				}

				if (target === 'localhost' || target === '127.0.0.1') {
					sshCommand = `cp "${src}" "${dest}"`;
					logger.debug('filePushRunner: Copying local file', dest);
				} else {
					sshCommand = `scp -o LogLevel=quiet -o StrictHostKeyChecking=no "${src}" root@${target}:"${dest}"`;
					logger.debug('filePushRunner: Pushing file to ' + target, dest);
				}

				exec(sshCommand, cmdOptions, (error, stdout, stderr) => {
					if (error) {
						logger.error('filePushRunner: Received error:', stderr || error);
						if (stderr) {
							return reject({error: new Error(stderr), stdout, stderr, extraFields});
						} else {
							return reject({error, stdout, stderr, extraFields});
						}
					}

					logger.debug('filePushRunner: file transfer completed');
					// Now that the file is uploaded, ssh to the host to change the ownership to the correct user.
					// We have no way of knowing exactly which user should have access,
					// but we can guess based on the parent directory.
					cmdRunner(target, permissionCmd)
						.then(dat => {
							return resolve({
								stdout: stdout + dat.stdout,
								stderr: stderr + dat.stderr,
								extraFields
							});
						})
						.catch(e => {
							return reject(e);
						});
				});
			});
	});
}
