/**
 * Shared Action State Manager
 * Synchronizes server action state (start/stop/restart) across multiple pages
 * Uses localStorage to persist state and storage events to sync across tabs
 */

const SharedActionState = {
    STORAGE_KEY: 'warlock_server_action',

    /**
     * Get current action state
     */
    get() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error reading action state from localStorage:', e);
            return null;
        }
    },

    /**
     * Set action state
     */
    set(guid, host, service, action) {
        try {
            const state = {
                guid,
                host,
                service,
                action,
                startTime: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Error writing action state to localStorage:', e);
        }
    },

    /**
     * Clear action state
     */
    clear() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.error('Error clearing action state from localStorage:', e);
        }
    },

    /**
     * Check if action is for a specific server
     */
    isActionFor(guid, host, service) {
        const state = this.get();
        if (!state) return false;
        return state.guid === guid && state.host === host && state.service === service;
    },

    /**
     * Check if any action is in progress
     */
    hasAction() {
        return this.get() !== null;
    },

    /**
     * Get the action type for a server
     */
    getActionFor(guid, host, service) {
        if (this.isActionFor(guid, host, service)) {
            const state = this.get();
            return state ? state.action : null;
        }
        return null;
    }
};

/**
 * Listen for storage changes across tabs/pages
 * Call the callback whenever the shared action state changes
 */
function onSharedActionStateChange(callback) {
    window.addEventListener('storage', (event) => {
        if (event.key === SharedActionState.STORAGE_KEY) {
            try {
                const newState = event.newValue ? JSON.parse(event.newValue) : null;
                const oldState = event.oldValue ? JSON.parse(event.oldValue) : null;
                callback(newState, oldState);
            } catch (e) {
                console.error('Error parsing storage event:', e);
            }
        }
    });
}
