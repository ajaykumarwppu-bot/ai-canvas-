/**
 * AI Providers Module
 * 
 * Central registry for supported AI providers.
 * Defines provider configuration and exposes methods for other modules.
 * 
 * Responsibilities:
 * - Define provider metadata (id, name, defaultBaseUrl, models)
 * - Provide lookup methods for provider information
 * - Support custom provider configuration
 * 
 * NOT responsible for:
 * - Storing API keys (belongs to AISettings)
 * - Making network requests (belongs to future ai.client.js)
 * - Creating UI components
 * - Modifying Canvas or settings
 */

(function(global) {
    'use strict';

    // --- Internal Provider Registry (immutable) ---
    const PROVIDER_REGISTRY = {
        openai: {
            id: 'openai',
            name: 'OpenAI',
            defaultBaseUrl: 'https://api.openai.com/v1',
            models: [
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4-turbo',
                'gpt-3.5-turbo'
            ],
            supportsCustomBaseUrl: true,
            supportsCustomModel: true,
            description: 'OpenAI GPT models via official API'
        },
        anthropic: {
            id: 'anthropic',
            name: 'Anthropic',
            defaultBaseUrl: 'https://api.anthropic.com',
            models: [
                'claude-sonnet-4-20250514',
                'claude-3-5-sonnet-20241022',
                'claude-3-opus-20240229',
                'claude-3-haiku-20240307'
            ],
            supportsCustomBaseUrl: false,
            supportsCustomModel: true,
            description: 'Anthropic Claude models'
        },
        google: {
            id: 'google',
            name: 'Google',
            defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            models: [
                'gemini-2.0-flash',
                'gemini-1.5-pro',
                'gemini-1.5-flash',
                'gemini-1.0-pro'
            ],
            supportsCustomBaseUrl: false,
            supportsCustomModel: true,
            description: 'Google Gemini models'
        },
        azure: {
            id: 'azure',
            name: 'Azure OpenAI',
            defaultBaseUrl: '', // Azure requires custom endpoint per deployment
            models: [
                'gpt-4o',
                'gpt-4',
                'gpt-35-turbo'
            ],
            supportsCustomBaseUrl: true,
            supportsCustomModel: false, // Azure model names are tied to deployments
            description: 'Azure OpenAI Service (requires custom endpoint)'
        },
        custom: {
            id: 'custom',
            name: 'Custom/OpenAI-Compatible',
            defaultBaseUrl: '',
            models: [],
            supportsCustomBaseUrl: true,
            supportsCustomModel: true,
            description: 'Custom OpenAI-compatible endpoints'
        }
    };

    // Default provider ID
    const DEFAULT_PROVIDER_ID = 'openai';

    // --- Helper: Normalize provider ID ---
    function normalizeProviderId(providerId) {
        if (typeof providerId !== 'string') {
            return null;
        }
        return providerId.trim().toLowerCase();
    }

    // --- Helper: Create safe copy of provider (prevent mutation) ---
    function createProviderCopy(provider) {
        if (!provider) {
            return null;
        }
        // Deep copy to prevent external modification
        return JSON.parse(JSON.stringify(provider));
    }

    // --- Helper: Get models array (safe copy) ---
    function getModelsCopy(models) {
        if (!Array.isArray(models)) {
            return [];
        }
        return [...models];
    }

    // --- Public API ---
    const AIProviders = {
        /**
         * Get provider by ID
         * Returns null for unknown providers (no crash)
         * @param {string} providerId - Provider identifier
         * @returns {Object|null} Provider object or null
         */
        get: function(providerId) {
            const normalizedId = normalizeProviderId(providerId);
            
            if (!normalizedId || !PROVIDER_REGISTRY.hasOwnProperty(normalizedId)) {
                return null;
            }

            return createProviderCopy(PROVIDER_REGISTRY[normalizedId]);
        },

        /**
         * Get all providers as an array
         * Returns safe copies to prevent registry corruption
         * @returns {Array} Array of provider objects
         */
        getAll: function() {
            const providers = [];
            for (const key in PROVIDER_REGISTRY) {
                if (PROVIDER_REGISTRY.hasOwnProperty(key)) {
                    providers.push(createProviderCopy(PROVIDER_REGISTRY[key]));
                }
            }
            return providers;
        },

        /**
         * Check if a provider exists
         * @param {string} providerId - Provider identifier
         * @returns {boolean} True if provider exists
         */
        exists: function(providerId) {
            const normalizedId = normalizeProviderId(providerId);
            
            if (!normalizedId) {
                return false;
            }

            return PROVIDER_REGISTRY.hasOwnProperty(normalizedId);
        },

        /**
         * Get the default provider
         * @returns {Object} Default provider object
         */
        getDefault: function() {
            return this.get(DEFAULT_PROVIDER_ID);
        },

        /**
         * Get default base URL for a provider
         * Returns empty string if provider has no default URL
         * @param {string} providerId - Provider identifier
         * @returns {string} Default base URL or empty string
         */
        getDefaultBaseUrl: function(providerId) {
            const provider = this.get(providerId);
            
            if (!provider) {
                return '';
            }

            return provider.defaultBaseUrl || '';
        },

        /**
         * Get supported models for a provider
         * Returns empty array for unknown providers
         * @param {string} providerId - Provider identifier
         * @returns {Array} Array of model names
         */
        getSupportedModels: function(providerId) {
            const provider = this.get(providerId);
            
            if (!provider) {
                return [];
            }

            return getModelsCopy(provider.models);
        },

        /**
         * Check if a provider supports custom base URL
         * @param {string} providerId - Provider identifier
         * @returns {boolean} True if custom base URL is supported
         */
        supportsCustomBaseUrl: function(providerId) {
            const provider = this.get(providerId);
            
            if (!provider) {
                return false;
            }

            return !!provider.supportsCustomBaseUrl;
        },

        /**
         * Check if a provider supports custom models
         * @param {string} providerId - Provider identifier
         * @returns {boolean} True if custom models are supported
         */
        supportsCustomModel: function(providerId) {
            const provider = this.get(providerId);
            
            if (!provider) {
                return false;
            }

            return !!provider.supportsCustomModel;
        },

        /**
         * Get list of supported provider IDs
         * @returns {Array} Array of provider ID strings
         */
        getSupportedProviderIds: function() {
            return Object.keys(PROVIDER_REGISTRY);
        },

        /**
         * Resolve effective base URL
         * Uses user-provided URL if available, otherwise falls back to provider default
         * @param {string} providerId - Provider identifier
         * @param {string} userBaseUrl - User-configured base URL (from AISettings)
         * @returns {string} Effective base URL
         */
        resolveBaseUrl: function(providerId, userBaseUrl) {
            // If user provided a custom URL, use it
            if (userBaseUrl && typeof userBaseUrl === 'string' && userBaseUrl.trim() !== '') {
                return userBaseUrl.trim();
            }

            // Otherwise, use provider default
            return this.getDefaultBaseUrl(providerId);
        },

        /**
         * Validate if a model is supported by a provider
         * For providers that support custom models, always returns true
         * @param {string} providerId - Provider identifier
         * @param {string} model - Model name to validate
         * @returns {Object} Validation result with valid boolean and message
         */
        validateModel: function(providerId, model) {
            const provider = this.get(providerId);
            
            if (!provider) {
                return {
                    valid: false,
                    message: 'Unknown provider',
                    isCustomModel: false
                };
            }

            if (!model || typeof model !== 'string' || model.trim() === '') {
                return {
                    valid: false,
                    message: 'Model name is required',
                    isCustomModel: false
                };
            }

            // If provider supports custom models, accept any non-empty model
            if (provider.supportsCustomModel) {
                return {
                    valid: true,
                    message: 'Custom model accepted',
                    isCustomModel: !provider.models.includes(model)
                };
            }

            // For providers without custom model support, check against known models
            const isValid = provider.models.includes(model);
            
            return {
                valid: isValid,
                message: isValid ? 'Model is supported' : 'Model not in supported list',
                isCustomModel: false
            };
        }
    };

    // Expose to global scope
    global.AIProviders = AIProviders;

})(typeof window !== 'undefined' ? window : this);
