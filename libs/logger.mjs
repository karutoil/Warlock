/**
 * A simple logger utility that provides debug, info, warn, and error logging methods.
 * Debug messages are only logged in development mode.
 */
export const logger = {
	/**
	 * Log debug messages (only in development mode)
	 *
	 * @param args
	 */
	debug: (...args) => {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[' + (new Date()).toISOString() + ']', '[debug]', ...args);
		}
	},
	/**
	 * Log informational messages
	 * @param args
	 */
	info: (...args) => {
		console.log('[' + (new Date()).toISOString() + ']', '[info]', ...args);
	},
	/**
	 * Log warning messages
	 * @param args
	 */
	warn: (...args) => {
		console.warn('[' + (new Date()).toISOString() + ']', '[warn]', ...args);
	},
	/**
	 * Log error messages
	 * @param args
	 */
	error: (...args) => {
		console.error('[' + (new Date()).toISOString() + ']', '[error]', ...args);
	}
};
