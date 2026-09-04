/**
 * AppStorage
 * A lightweight, namespaced storage wrapper for the Canvas Application.
 * 
 * Purpose:
 * Provides a safe, consistent interface for localStorage operations.
 * Handles JSON serialization, parsing errors, and browser storage restrictions gracefully.
 * 
 * Usage:
 *   AppStorage.save('settings', { theme: 'dark' });
 *   const settings = AppStorage.load('settings', { theme: 'light' });
 *   AppStorage.remove('settings');
 *   if (AppStorage.has('settings')) { ... }
 */

(function(global) {
    'use strict';

    // Configuration
    const NAMESPACE_PREFIX = 'canvas_ai_app:';
    
    // Internal helper to get the full namespaced key
    function makeKey(key) {
        if (typeof key !== 'string') {
            console.warn('AppStorage: Key must be a string.');
            return null;
        }
        return NAMESPACE_PREFIX + key;
    }

    // Internal helper to safely get localStorage
    function getStorage() {
        try {
            if (!window.localStorage) {
                return null;
            }
            // Test if localStorage is actually usable (handles private browsing modes in some browsers)
            const testKey = '__storage_test__';
            window.localStorage.setItem(testKey, testKey);
            window.localStorage.removeItem(testKey);
            return window.localStorage;
        } catch (e) {
            console.warn('AppStorage: localStorage is unavailable or disabled.', e);
            return null;
        }
    }

    const storage = getStorage();

    // Public API
    const AppStorage = {
        /**
         * Save a value to storage.
         * @param {string} key - The storage key (namespaced automatically).
         * @param {*} value - The value to store (will be JSON.stringify-ed).
         * @returns {boolean} True if successful, false otherwise.
         */
        save: function(key, value) {
            const fullKey = makeKey(key);
            if (!fullKey || !storage) return false;

            try {
                const serialized = JSON.stringify(value);
                storage.setItem(fullKey, serialized);
                return true;
            } catch (e) {
                console.error('AppStorage: Failed to save data.', e);
                // Handle QuotaExceededError
                if (e.name === 'QuotaExceededError') {
                    console.warn('AppStorage: LocalStorage quota exceeded.');
                }
                return false;
            }
        },

        /**
         * Load a value from storage.
         * @param {string} key - The storage key.
         * @param {*} fallback - The value to return if key not found or data is corrupted.
         * @returns {*} The parsed value or the fallback.
         */
        load: function(key, fallback) {
            const fullKey = makeKey(key);
            if (!fullKey || !storage) return fallback;

            try {
                const item = storage.getItem(fullKey);
                if (item === null) {
                    return fallback;
                }
                return JSON.parse(item);
            } catch (e) {
                console.warn('AppStorage: Failed to parse data for key "' + key + '". Data may be corrupted.', e);
                // If data is corrupted, return fallback to prevent app crashes
                return fallback;
            }
        },

        /**
         * Remove a value from storage.
         * @param {string} key - The storage key.
         * @returns {boolean} True if removed, false otherwise.
         */
        remove: function(key) {
            const fullKey = makeKey(key);
            if (!fullKey || !storage) return false;

            try {
                storage.removeItem(fullKey);
                return true;
            } catch (e) {
                console.error('AppStorage: Failed to remove data.', e);
                return false;
            }
        },

        /**
         * Check if a key exists in storage.
         * @param {string} key - The storage key.
         * @returns {boolean} True if exists, false otherwise.
         */
        has: function(key) {
            const fullKey = makeKey(key);
            if (!fullKey || !storage) return false;

            try {
                return storage.getItem(fullKey) !== null;
            } catch (e) {
                console.warn('AppStorage: Error checking key existence.', e);
                return false;
            }
        },

        /**
         * Clear all application-specific data (optional utility for future debug/reset).
         * WARNING: This only clears keys with our namespace prefix.
         * @returns {number} Number of items cleared.
         */
        clearAll: function() {
            if (!storage) return 0;
            
            let count = 0;
            try {
                const keysToRemove = [];
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith(NAMESPACE_PREFIX)) {
                        keysToRemove.push(key);
                    }
                }
                
                keysToRemove.forEach(key => {
                    storage.removeItem(key);
                    count++;
                });
            } catch (e) {
                console.error('AppStorage: Failed to clear data.', e);
            }
            return count;
        }
    };

    // Expose to global scope
    global.AppStorage = AppStorage;
    
    // Also expose as 'Storage' for backward compatibility with existing Canvas code
    // The Canvas files (canvas.js, canvas.engine.js) expect a global 'Storage' object
    global.Storage = AppStorage;

})(typeof window !== 'undefined' ? window : this);
