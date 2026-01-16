/**
 * Operations required to be performed on hosts as soon as they are added.
 *
 * Most systems are functional out-of-the-box, but this ensures that all will be fully prepared.
 *
 * @module host_post_add
 */
import {cmdRunner} from "./cmd_runner.mjs";
import {installAgent, isAgentInstalled} from "./agent_manager.mjs";
import {logger} from "./logger.mjs";

export async function hostPostAdd(host, panelUrl = null) {
	return new Promise((resolve, reject) => {
		// Ensure `file` is installed.  Most distros have it by default, but some minimal installs may not.
		// This is required for proper OS detection later.
		const installFileCmds = {
			'debian': 'which file || apt-get install -y file',
			'ubuntu': 'which file ||  apt-get install -y file',
			'centos': 'which file || yum install -y file',
			'rocky': 'which file || yum install -y file',
			'almalinux': 'which file || yum install -y file',
			'amazon linux': 'which file || yum install -y file',
			'fedora': 'which file || dnf install -y file',
			'arch': 'which file || pacman -Sy --noconfirm file',
		};

		// Query the server for the OS type; this will determine which install command to use.
		cmdRunner('lsb_release -i 2>/dev/null | sed "s#.*:\\t##"', host)
			.then(async result => {
				const osRelease = result.stdout.toLowerCase().trim();
				if (installFileCmds[osRelease]) {
					await cmdRunner(installFileCmds[osRelease], host);
				}
				else {
					logger.warn(`Could not determine OS type for host ${host}; skipping package installation.`);
				}

				// Check if agent is already installed
				const agentInstalled = await isAgentInstalled(host);
				
				if (!agentInstalled) {
					logger.info(`Installing Warlock Agent on ${host}...`);
					
					// Determine panel URL
					const url = panelUrl || process.env.PANEL_URL || `http://${process.env.IP || '127.0.0.1'}:${process.env.PORT || 3077}`;
					
					// Install agent (this creates the connection record and gets the token)
					const installResult = await installAgent(host, url);
					
					if (installResult.success) {
						logger.info(`Warlock Agent successfully installed on ${host}`);
						resolve({ fileInstalled: true, agentInstalled: true });
					} else {
						logger.error(`Failed to install agent on ${host}: ${installResult.error}`);
						resolve({ fileInstalled: true, agentInstalled: false, agentError: installResult.error });
					}
				} else {
					logger.info(`Warlock Agent already installed on ${host}`);
					resolve({ fileInstalled: true, agentInstalled: true, agentAlreadyInstalled: true });
				}
			})
			.catch(err => {
				logger.error(`Error in hostPostAdd for ${host}:`, err);
				reject(err);
			});
	});
}