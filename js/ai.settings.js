/**
 * AI Settings Module
 * 
 * Manages AI connection settings (provider, API key, base URL, model).
 * Does not create UI or make AI API requests.
 * Only manages configuration data.
 * 
 * Architecture:
 * - Uses existing AppStorage for persistence
 * - Provides validation, save, update, reset operations
 * - Supports safe/public settings retrieval (masks API key)
 */

(function(global) {
    'use strict';

    // --- Configuration ---
    const STORAGE_KEY = 'ai_settings';
    
    // Default unconfigured settings
    const DEFAULT_SETTINGS = {
        provider: '',
        apiKey: '',
        baseUrl: '',
        model: ''
    };

    // Supported providers (lightweight validation only)
    const SUPPORTED_PROVIDERS = [
        'openai',
        'anthropic',
        'google',
        'azure',
        'custom'
    ];

    // --- Helper: Error Factory ---
    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    // --- Helper: Warning Factory ---
    function makeWarning(code, message) {
        return { code, message };
    }

    // --- Helper: Check AppStorage availability ---
    function isStorageAvailable() {
        return typeof AppStorage !== 'undefined';
    }

    // --- Helper: Validate settings structure ---
    function validateSettings(settings) {
        const errors = [];
        const warnings = [];

        // Check settings is an object
        if (!settings || typeof settings !== 'object') {
            errors.push(makeError('INVALID_SETTINGS', 'Settings must be an object'));
            return { valid: false, errors, warnings };
        }

        // Validate provider (optional but must be valid string when provided)
        if (settings.provider !== undefined && settings.provider !== '') {
            if (typeof settings.provider !== 'string') {
                errors.push(makeError('INVALID_PROVIDER', 'Provider must be a string'));
            } else if (settings.provider.trim() === '') {
                warnings.push(makeWarning('EMPTY_PROVIDER', 'Provider is empty'));
            }
            // Note: We don't enforce specific provider names to allow future extensibility
        }

        // Validate API key (optional but must be string when provided)
        if (settings.apiKey !== undefined) {
            if (typeof settings.apiKey !== 'string') {
                errors.push(makeError('INVALID_API_KEY', 'API key must be a string'));
            }
            // Don't require API key immediately (user may be filling settings gradually)
        }

        // Validate base URL (optional but must be non-empty string when provided)
        if (settings.baseUrl !== undefined && settings.baseUrl !== '') {
            if (typeof settings.baseUrl !== 'string') {
                errors.push(makeError('INVALID_BASE_URL', 'Base URL must be a string'));
            } else if (settings.baseUrl.trim() === '') {
                warnings.push(makeWarning('EMPTY_BASE_URL', 'Base URL is empty'));
            } else {
                // Basic URL format check (not too strict)
                try {
                    // Allow relative URLs or absolute URLs
                    if (settings.baseUrl.startsWith('http://') || 
                        settings.baseUrl.startsWith('https://') ||
                        settings.baseUrl.startsWith('/')) {
                        // Valid format
                    } else {
                        // Might still be valid, just warn
                        warnings.push(makeWarning('URL_FORMAT', 'Base URL may need http:// or https:// prefix'));
                    }
                } catch (e) {
                    warnings.push(makeWarning('URL_PARSE', 'Could not parse base URL format'));
                }
            }
        }

        // Validate model (optional but must be string when provided)
        if (settings.model !== undefined && settings.model !== '') {
            if (typeof settings.model !== 'string') {
                errors.push(makeError('INVALID_MODEL', 'Model must be a string'));
            } else if (settings.model.trim() === '') {
                warnings.push(makeWarning('EMPTY_MODEL', 'Model is empty'));
            }
        }

        const valid = errors.length === 0;
        return { valid, errors, warnings };
    }

    // --- Helper: Normalize settings (ensure consistent structure) ---
    function normalizeSettings(settings) {
        const normalized = {
            provider: '',
            apiKey: '',
            baseUrl: '',
            model: ''
        };

        if (!settings || typeof settings !== 'object') {
            return normalized;
        }

        // Copy known fields, trim strings
        if (typeof settings.provider === 'string') {
            normalized.provider = settings.provider.trim();
        }
        if (typeof settings.apiKey === 'string') {
            normalized.apiKey = settings.apiKey; // Don't trim API key (may have intentional spaces)
        }
        if (typeof settings.baseUrl === 'string') {
            normalized.baseUrl = settings.baseUrl.trim();
        }
        if (typeof settings.model === 'string') {
            normalized.model = settings.model.trim();
        }

        return normalized;
    }

    // --- Helper: Create safe settings (mask API key) ---
    function createSafeSettings(settings) {
        const safe = {
            provider: settings.provider || '',
            baseUrl: settings.baseUrl || '',
            model: settings.model || '',
            hasApiKey: !!(settings.apiKey && settings.apiKey.length > 0)
        };

        // Optionally include masked key indicator
        if (safe.hasApiKey) {
            const keyLength = settings.apiKey.length;
            if (keyLength > 4) {
                safe.apiKeyMasked = '••••' + settings.apiKey.slice(-4);
            } else {
                safe.apiKeyMasked = '••••';
            }
        }

        return safe;
    }

    // --- Public API ---
    const AISettings = {
        /**
         * Get current settings (full settings with API key)
         * Returns default settings if nothing saved yet
         * @returns {Object} Settings object
         */
        get: function() {
            if (!isStorageAvailable()) {
                console.warn('AISettings: AppStorage not available, returning defaults');
                return { ...DEFAULT_SETTINGS };
            }

            const stored = AppStorage.load(STORAGE_KEY, null);
            
            if (stored === null) {
                return { ...DEFAULT_SETTINGS };
            }

            // Merge with defaults to ensure all fields exist
            return {
                ...DEFAULT_SETTINGS,
                ...stored
            };
        },

        /**
         * Get safe settings (API key masked/omitted)
         * Useful for UI display or logging
         * @returns {Object} Safe settings object
         */
        getSafe: function() {
            const settings = this.get();
            return createSafeSettings(settings);
        },

        /**
         * Save complete settings
         * Validates before saving
         * @param {Object} settings - Complete settings object
         * @returns {Object} Result with success status
         */
        save: function(settings) {
            // Step 1: Validate
            const validation = validateSettings(settings);
            
            if (!validation.valid) {
                return {
                    success: false,
                    saved: null,
                    errors: validation.errors,
                    warnings: validation.warnings
                };
            }

            // Step 2: Normalize
            const normalized = normalizeSettings(settings);

            // Step 3: Store
            if (!isStorageAvailable()) {
                return {
                    success: false,
                    saved: null,
                    errors: [makeError('STORAGE_UNAVAILABLE', 'AppStorage is not available')],
                    warnings: []
                };
            }

            const saveSuccess = AppStorage.save(STORAGE_KEY, normalized);
            
            if (!saveSuccess) {
                return {
                    success: false,
                    saved: null,
                    errors: [makeError('SAVE_FAILED', 'Failed to save settings to storage')],
                    warnings: []
                };
            }

            return {
                success: true,
                saved: normalized,
                errors: [],
                warnings: validation.warnings
            };
        },

        /**
         * Update partial settings
         * Merges provided fields with existing settings
         * @param {Object} partialSettings - Fields to update
         * @returns {Object} Result with success status
         */
        update: function(partialSettings) {
            // Step 1: Load current settings
            const currentSettings = this.get();

            // Step 2: Merge (only explicitly supplied fields change)
            const merged = {
                ...currentSettings
            };

            if (partialSettings && typeof partialSettings === 'object') {
                // Only merge known fields
                const knownFields = ['provider', 'apiKey', 'baseUrl', 'model'];
                knownFields.forEach(field => {
                    if (partialSettings.hasOwnProperty(field)) {
                        merged[field] = partialSettings[field];
                    }
                });
            }

            // Step 3: Validate merged result
            const validation = validateSettings(merged);
            
            if (!validation.valid) {
                return {
                    success: false,
                    saved: null,
                    errors: validation.errors,
                    warnings: validation.warnings
                };
            }

            // Step 4: Save
            return this.save(merged);
        },

        /**
         * Reset settings to defaults
         * Only affects AI settings, does not touch Canvas data
         * @returns {Object} Result with success status
         */
        reset: function() {
            if (!isStorageAvailable()) {
                return {
                    success: false,
                    errors: [makeError('STORAGE_UNAVAILABLE', 'AppStorage is not available')]
                };
            }

            // Remove AI settings from storage
            const removeSuccess = AppStorage.remove(STORAGE_KEY);
            
            if (!removeSuccess) {
                return {
                    success: false,
                    errors: [makeError('RESET_FAILED', 'Failed to reset settings')]
                };
            }

            return {
                success: true,
                resetTo: { ...DEFAULT_SETTINGS }
            };
        },

        /**
         * Validate settings without saving
         * @param {Object} settings - Settings to validate
         * @returns {Object} Validation result
         */
        validate: function(settings) {
            return validateSettings(settings);
        },

        /**
         * Check if API key is configured
         * @returns {boolean} True if API key exists and is non-empty
         */
        hasApiKey: function() {
            const settings = this.get();
            return !!(settings.apiKey && settings.apiKey.length > 0);
        },

        /**
         * Get list of supported providers (for reference)
         * @returns {Array} Array of provider names
         */
        getSupportedProviders: function() {
            return [...SUPPORTED_PROVIDERS];
        },

        /**
         * Get default settings template
         * @returns {Object} Default settings
         */
        getDefaults: function() {
            return { ...DEFAULT_SETTINGS };
        }
    };

    // Expose to global scope
    global.AISettings = AISettings;

})(typeof window !== 'undefined' ? window : this);
