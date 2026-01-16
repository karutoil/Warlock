const express = require('express');
const {validate_session} = require("../../libs/validate_session.mjs");
const {cmdRunner} = require("../../libs/cmd_runner.mjs");
const {validateHostService} = require("../../libs/validate_host_service.mjs");

const router = express.Router();

/**
 * Send a command to a game server console
 */
router.post('/', validate_session, (req, res) => {
	const { guid, host, service, command } = req.body;

	if (!(host && guid && service && command)) {
		return res.json({
			success: false,
			error: 'Host, GUID, service, and command are required'
		});
	}

	validateHostService(host, guid, service)
		.then(dat => {
			const escapedCmd = command.replace(/"/g, '\\"');
			
			// Try systemd socket first, then fall back to RCON
			const cmd = `(SOCKET_UNIT=$(systemctl cat "${service}.service" 2>/dev/null | grep -oP 'Sockets=\\K[^\\s]+') && [ -n "$SOCKET_UNIT" ] && SOCKET_PATH=$(systemctl show -p Listen --value "$SOCKET_UNIT" 2>/dev/null | head -n1 | awk '{print $1}') && [ -n "$SOCKET_PATH" ] && [ -p "$SOCKET_PATH" ] && echo "${escapedCmd}" > "$SOCKET_PATH" && echo "Command sent via systemd socket ($SOCKET_PATH)") || ` +
				`([ -f "${dat.host.path}/manage.py" ] && ${dat.host.path}/manage.py --help 2>&1 | grep -q -- "--rcon" && ${dat.host.path}/manage.py --service ${service} --rcon "${escapedCmd}") || ` +
				`(echo "Console input not available. Service does not have a systemd socket or RCON support." >&2 && exit 1)`;

			cmdRunner(host, cmd)
				.then(result => {
					return res.json({
						success: true,
						output: result.stdout || 'Command sent successfully',
						stderr: result.stderr
					});
				})
				.catch(e => {
					return res.json({
						success: false,
						error: e.error ? e.error.message : e.message
					});
				});
		})
		.catch(e => {
			return res.json({
				success: false,
				error: e.message
			});
		});
});

module.exports = router;
