const express = require('express');
const { validate_session } = require('../../libs/validate_session.mjs');
const { cmdRunner } = require('../../libs/cmd_runner.mjs');
const { Host } = require('../../db');
const { logger } = require('../../libs/logger.mjs');

const router = express.Router();

// Helper validators
function isValidIdentifier(id) {
	if (!id || typeof id !== 'string') return false;
	// Allow alnum, underscore, dot, colon, dash
	return /^[A-Za-z0-9_.:-]+$/.test(id);
}

function validateSchedule(schedule) {
	if (!schedule || typeof schedule !== 'string') return false;
	const s = schedule.trim();
	if (s.length === 0) return false;
	// Accept either @special or five-field cron (very basic check)
	if (s.startsWith('@')) return true;
	const parts = s.split(/\s+/);
	return parts.length === 5;
}

function hasWarlockTag(line) {
	return line && line.indexOf('#warlock:') !== -1;
}

function parseIdentifier(line) {
	if (!line) return null;
	const m = line.match(/#warlock:id=([A-Za-z0-9_.:-]+)/);
	return m ? m[1] : null;
}

// GET /api/cron/:host - list warlock-managed cron lines
router.get('/:host', validate_session, (req, res) => {
	const host = req.params.host;

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({ success: false, error: 'Requested host is not in the configured HOSTS list' });
		}

		const cmd = "crontab -l 2>/dev/null || true";
		cmdRunner(host, cmd).then(result => {
			const out = (result.stdout || '').split(/\r?\n/);
			const jobs = [];
			for (let line of out) {
				if (!line) continue;
				if (!hasWarlockTag(line)) continue; // only manage lines with #warlock:
				const is_comment = line.trim().startsWith('#');
				const identifier = parseIdentifier(line);
				let schedule = null;
				let command = null;
				// Extract portion before the first #warlock: tag
				const idx = line.indexOf('#warlock:');
				const pre = (idx >= 0) ? line.substring(0, idx).trim() : line.trim();
				if (!is_comment) {
					// Determine schedule and command
					const tokens = pre.split(/\s+/);
					if (tokens[0] && tokens[0].startsWith('@')) {
						schedule = tokens[0];
						command = tokens.slice(1).join(' ').trim() || null;
					} else if (tokens.length >= 6) {
						schedule = tokens.slice(0,5).join(' ');
						command = tokens.slice(5).join(' ').trim() || null;
					} else {
						// Could be malformed; provide raw pre as command
						command = pre || null;
					}
				}
				jobs.push({ raw: line, is_comment, schedule, command, identifier });
			}

			return res.json({ success: true, jobs: jobs });
		}).catch(e => {
			logger.error('Error reading crontab:', e);
			return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
		});
	});
});

// POST /api/cron/:host - add or update a job (identifier REQUIRED)
router.post('/:host', validate_session, (req, res) => {
	const host = req.params.host;
	const { schedule, command, identifier } = req.body || {};

	if (!identifier) {
		return res.json({ success: false, error: 'Identifier is required' });
	}
	if (!isValidIdentifier(identifier)) {
		return res.json({ success: false, error: 'Identifier contains invalid characters' });
	}
	if (!validateSchedule(schedule)) {
		return res.json({ success: false, error: 'Schedule must be a @special or 5-field cron expression' });
	}
	if (!command || typeof command !== 'string' || command.trim().length === 0) {
		return res.json({ success: false, error: 'Command is required' });
	}
	if (command.indexOf('\n') !== -1 || command.indexOf('\r') !== -1) {
		return res.json({ success: false, error: 'Command cannot contain newline characters' });
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({ success: false, error: 'Requested host is not in the configured HOSTS list' });
		}

		const readCmd = "crontab -l 2>/dev/null || true";
		cmdRunner(host, readCmd).then(result => {
			const existing = result.stdout || '';
			const timestamp = Date.now();
			const backupPath = `/root/warlock_crontab_backups/warlock_crontab_${timestamp}.cron`;
			const dl = `EOF_${timestamp}`;

			// Backup current crontab on remote host
			const backupCmd = `mkdir -p /root/warlock_crontab_backups && cat > ${backupPath} <<${dl}\n${existing}\n${dl}`;
			cmdRunner(host, backupCmd).then(() => {
				// Remove existing entries for this identifier
				const lines = existing.split(/\r?\n/).filter(Boolean);
				const filtered = lines.filter(l => l.indexOf(`#warlock:id=${identifier}`) === -1);
				// Append new line
				const newLine = `${schedule} ${command} #warlock:id=${identifier}`;
				filtered.push(newLine);
				const newCron = filtered.join('\n') + '\n';

				// Write new crontab and activate it
				const tmp = `/tmp/warlock_cron_${timestamp}`;
				const writeCmd = `cat > ${tmp} <<${dl}\n${newCron}\n${dl}\ncrontab ${tmp} && rm -f ${tmp}`;
				cmdRunner(host, writeCmd).then(() => {
					// Verify
					cmdRunner(host, readCmd).then(check => {
						const found = (check.stdout || '').split(/\r?\n/).some(l => l.indexOf(`#warlock:id=${identifier}`) !== -1);
						if (!found) {
							logger.error('Verification failed after writing crontab for identifier', identifier);
							return res.json({ success: false, error: 'Failed to verify written crontab' });
						}
						return res.json({ success: true, data: { identifier, raw: newLine } });
					}).catch(e => {
						logger.error('Error verifying crontab:', e);
						return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
					});
				}).catch(e => {
					logger.error('Error writing new crontab:', e);
					return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
				});
			}).catch(e => {
				logger.error('Error backing up crontab:', e);
				return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
			});
		}).catch(e => {
			logger.error('Error reading existing crontab:', e);
			return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
		});
	});
});

// DELETE /api/cron/:host - remove a job by identifier (required)
router.delete('/:host', validate_session, (req, res) => {
	const host = req.params.host;
	const { identifier } = req.body || {};

	if (!identifier) {
		return res.json({ success: false, error: 'Identifier is required' });
	}
	if (!isValidIdentifier(identifier)) {
		return res.json({ success: false, error: 'Identifier contains invalid characters' });
	}

	Host.count({ where: { ip: host } }).then(count => {
		if (count === 0) {
			return res.json({ success: false, error: 'Requested host is not in the configured HOSTS list' });
		}

		const readCmd = "crontab -l 2>/dev/null || true";
		cmdRunner(host, readCmd).then(result => {
			const existing = result.stdout || '';
			const lines = existing.split(/\r?\n/).filter(Boolean);
			const filtered = lines.filter(l => l.indexOf(`#warlock:id=${identifier}`) === -1);
			if (filtered.length === lines.length) {
				// Not found!  (but still a "success" for idempotency)
				return res.json({ success: true });
			}

			const timestamp = Date.now();
			const backupPath = `/root/warlock_crontab_backups/warlock_crontab_${timestamp}.cron`;
			const dl = `EOF_${timestamp}`;

			// Backup current crontab
			const backupCmd = `mkdir -p /root/warlock_crontab_backups && cat > ${backupPath} <<${dl}\n${existing}\n${dl}`;
			cmdRunner(host, backupCmd).then(() => {
				// Write filtered crontab
				const newCron = filtered.join('\n') + (filtered.length ? '\n' : '');
				const tmp = `/tmp/warlock_cron_${timestamp}`;
				const writeCmd = `cat > ${tmp} <<${dl}\n${newCron}\n${dl}\ncrontab ${tmp} && rm -f ${tmp}`;
				cmdRunner(host, writeCmd).then(() => {
					// Verify removal
					cmdRunner(host, readCmd).then(check => {
						const found = (check.stdout || '').split(/\r?\n/).some(l => l.indexOf(`#warlock:id=${identifier}`) !== -1);
						if (found) {
							return res.json({ success: false, error: 'Failed to remove identifier' });
						}
						return res.json({ success: true });
					}).catch(e => {
						logger.error('Error verifying crontab after delete:', e);
						return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
					});
				}).catch(e => {
					logger.error('Error writing crontab after delete:', e);
					return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
				});
			}).catch(e => {
				logger.error('Error backing up crontab before delete:', e);
				return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
			});
		}).catch(e => {
			logger.error('Error reading crontab for delete:', e);
			return res.json({ success: false, error: e && e.error ? e.error.message || String(e.error) : String(e) });
		});
	});
});

module.exports = router;

