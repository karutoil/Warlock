/**
 * A simple logger utility that provides debug, info, warn, and error logging methods.
 *
 * Behavior:
 * - If `LOG_LEVEL` is set (error|warn|info|debug) it determines which messages are emitted.
 * - If `LOG_LEVEL` is not set, `NODE_ENV === 'development'` enables `debug`, otherwise `info`.
 *
 * Usage examples:
 *   LOG_LEVEL=info npm run dev    # show info/warn/error
 *   LOG_LEVEL=debug npm run dev   # show debug/info/warn/error
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function getCurrentLevel() {
	const envLevel = process.env.LOG_LEVEL;
	if (envLevel) {
		const name = String(envLevel).toLowerCase();
		if (Object.prototype.hasOwnProperty.call(LEVELS, name)) {
			return LEVELS[name];
		}
		// If numeric value provided, use it
		const n = Number(envLevel);
		if (!Number.isNaN(n)) {
			return n;
		}
	}

	return process.env.NODE_ENV === 'development' ? LEVELS.debug : LEVELS.info;
}

function prefix(levelName) {
	return '[' + (new Date()).toISOString() + ']' + ' [' + levelName + ']';
}

export const logger = {
	/**
	 * Log debug messages
	 */
	debug: (...args) => {
		if (getCurrentLevel() >= LEVELS.debug) {
			console.debug(prefix('debug'), ...args);
		}
	},

	/**
	 * Log informational messages
	 */
	info: (...args) => {
		if (getCurrentLevel() >= LEVELS.info) {
			console.log(prefix('info'), ...args);
		}
	},

	/**
	 * Log warning messages
	 */
	warn: (...args) => {
		if (getCurrentLevel() >= LEVELS.warn) {
			console.warn(prefix('warn'), ...args);
		}
	},

	/**
	 * Log error messages
	 */
	error: (...args) => {
		if (getCurrentLevel() >= LEVELS.error) {
			console.error(prefix('error'), ...args);
		}	}
};