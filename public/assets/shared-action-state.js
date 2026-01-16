/**
 * Shared Action State Manager
 * Synchronizes server action state (start/stop/restart) across multiple pages/tabs
 * Uses localStorage to persist state across tabs + custom events for same-page updates
 */

const SharedActionState = {
    STORAGE_KEY: 'warlock_server_action',
    _customEventName: 'warlock-action-state-changed',
    _listeners: [],

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
            const oldState = this.get();
            const state = {
                guid,
                host,
                service,
                action,
                startTime: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
            
            console.log('[SharedActionState] SET:', state);
            
            // Dispatch custom event for same-page listeners
            this._dispatchCustomEvent(state, oldState);
        } catch (e) {
            console.error('Error writing action state to localStorage:', e);
        }
    },

    /**
     * Clear action state
     */
    clear() {
        try {
            const oldState = this.get();
            localStorage.removeItem(this.STORAGE_KEY);
            
            console.log('[SharedActionState] CLEAR:', oldState);
            
            // Dispatch custom event for same-page listeners
            this._dispatchCustomEvent(null, oldState);
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
    },

    /**
     * Dispatch custom event for same-page listeners
     */
    _dispatchCustomEvent(newState, oldState) {
        const event = new CustomEvent(this._customEventName, {
            detail: {
                newState: newState,
                oldState: oldState
            }
        });
        document.dispatchEvent(event);
    }
};

/**
 * Listen for action state changes across tabs/pages and within same page
 * Handles both storage events (cross-tab) and custom events (same-page)
 */
function onSharedActionStateChange(callback) {
    console.log('[SharedActionState] Registering listener');
    
    // Listen to custom events for same-page updates
    document.addEventListener(SharedActionState._customEventName, (event) => {
        const { newState, oldState } = event.detail;
        console.log('[SharedActionState] Custom event received:', newState, oldState);
        callback(newState, oldState);
    });

    // Listen to storage events for cross-tab updates
    window.addEventListener('storage', (event) => {
        if (event.key === SharedActionState.STORAGE_KEY) {
            try {
                const newState = event.newValue ? JSON.parse(event.newValue) : null;
                const oldState = event.oldValue ? JSON.parse(event.oldValue) : null;
                console.log('[SharedActionState] Storage event received:', newState, oldState);
                callback(newState, oldState);
            } catch (e) {
                console.error('Error parsing storage event:', e);
            }
        }
    });
}
