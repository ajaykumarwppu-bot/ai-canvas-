/**
 * AI Client Module
 *
 * Responsible for communicating with the configured AI provider.
 * 
 * Responsibilities:
 * - Read current AI settings
 * - Resolve the selected provider
 * - Resolve the effective Base URL
 * - Build API requests
 * - Send requests via fetch
 * - Receive and normalize responses
 * - Handle communication-level errors
 * - Return structured results
 *
 * NOT responsible for:
 * - Modifying Canvas directly
 * - Calling CanvasAPI
 * - Creating nodes or edges
 * - Modifying the DOM
 * - Storing API keys (belongs to AISettings)
 * - Defining providers (belongs to AIProviders)
 */

(function(global) {
    'use strict';

    // --- Configuration ---
    const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

    // --- Error Codes ---
    const ERROR_CODES = {
        CONFIG_MISSING: 'CONFIG_MISSING',
        PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
        INVALID_REQUEST: 'INVALID_REQUEST',
        NETWORK_ERROR: 'NETWORK_ERROR',
        HTTP_ERROR: 'HTTP_ERROR',
        INVALID_RESPONSE: 'INVALID_RESPONSE',
        REQUEST_ABORTED: 'REQUEST_ABORTED',
        REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
        API_KEY_MISSING: 'API_KEY_MISSING',
        MODEL_MISSING: 'MODEL_MISSING'
    };

    // --- Helper: Error Factory ---
    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    // --- Helper: Check dependencies ---
    function checkDependencies() {
        const missing = [];
        if (typeof AISettings === 'undefined') missing.push('AISettings');
        if (typeof AIProviders === 'undefined') missing.push('AIProviders');
        return missing;
    }

    // --- Helper: Mask sensitive data for logging ---
    function maskApiKey(key) {
        if (!key || typeof key !== 'string') return '';
        if (key.length <= 4) return '•'.repeat(key.length);
        return '•'.repeat(key.length - 4) + key.slice(-4);
    }

    // --- Validation: Request Input ---
    function validateRequest(request) {
        const errors = [];

        if (!request || typeof request !== 'object') {
            errors.push(makeError(
                ERROR_CODES.INVALID_REQUEST,
                'Request must be an object'
            ));
            return errors;
        }

        if (!Array.isArray(request.messages)) {
            errors.push(makeError(
                ERROR_CODES.INVALID_REQUEST,
                'Request must contain a "messages" array'
            ));
            return errors;
        }

        if (request.messages.length === 0) {
            errors.push(makeError(
                ERROR_CODES.INVALID_REQUEST,
                'Messages array must contain at least one message'
            ));
            return errors;
        }

        const validRoles = ['system', 'user', 'assistant'];
        
        for (let i = 0; i < request.messages.length; i++) {
            const msg = request.messages[i];
            
            if (!msg || typeof msg !== 'object') {
                errors.push(makeError(
                    ERROR_CODES.INVALID_REQUEST,
                    `Message at index ${i} must be an object`
                ));
                continue;
            }

            if (!msg.hasOwnProperty('role')) {
                errors.push(makeError(
                    ERROR_CODES.INVALID_REQUEST,
                    `Message at index ${i} missing "role" property`
                ));
            } else if (!validRoles.includes(msg.role)) {
                errors.push(makeError(
                    ERROR_CODES.INVALID_REQUEST,
                    `Message at index ${i} has invalid role "${msg.role}". Valid roles: ${validRoles.join(', ')}`
                ));
            }

            if (!msg.hasOwnProperty('content')) {
                errors.push(makeError(
                    ERROR_CODES.INVALID_REQUEST,
                    `Message at index ${i} missing "content" property`
                ));
            } else if (typeof msg.content !== 'string') {
                errors.push(makeError(
                    ERROR_CODES.INVALID_REQUEST,
                    `Message at index ${i} content must be a string`
                ));
            }
        }

        return errors;
    }

    // --- Validation: Configuration ---
    function validateConfig(config) {
        const errors = [];

        if (!config) {
            errors.push(makeError(
                ERROR_CODES.CONFIG_MISSING,
                'Configuration is missing'
            ));
            return errors;
        }

        if (!config.provider || typeof config.provider !== 'string') {
            errors.push(makeError(
                ERROR_CODES.CONFIG_MISSING,
                'Provider is not configured'
            ));
        }

        if (!config.baseUrl || typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
            errors.push(makeError(
                ERROR_CODES.CONFIG_MISSING,
                'Base URL is not configured'
            ));
        }

        if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
            errors.push(makeError(
                ERROR_CODES.MODEL_MISSING,
                'Model is not configured'
            ));
        }

        if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
            errors.push(makeError(
                ERROR_CODES.API_KEY_MISSING,
                'API key is not configured'
            ));
        }

        return errors;
    }

    // --- Get Config ---
    function getConfig() {
        const missingDeps = checkDependencies();
        if (missingDeps.length > 0) {
            return {
                success: false,
                config: null,
                errors: [makeError(
                    ERROR_CODES.CONFIG_MISSING,
                    `Missing dependencies: ${missingDeps.join(', ')}`
                )]
            };
        }

        // Get current settings
        const settings = AISettings.get();

        // Verify provider is selected
        if (!settings.provider) {
            return {
                success: false,
                config: null,
                errors: [makeError(
                    ERROR_CODES.CONFIG_MISSING,
                    'No provider selected in settings'
                )]
            };
        }

        // Resolve provider
        const provider = AIProviders.get(settings.provider);
        if (!provider) {
            return {
                success: false,
                config: null,
                errors: [makeError(
                    ERROR_CODES.PROVIDER_NOT_FOUND,
                    `Provider "${settings.provider}" not found`
                )]
            };
        }

        // Resolve effective base URL
        const baseUrl = AIProviders.resolveBaseUrl(settings.provider, settings.baseUrl);
        if (!baseUrl || baseUrl.trim() === '') {
            return {
                success: false,
                config: null,
                errors: [makeError(
                    ERROR_CODES.CONFIG_MISSING,
                    'No base URL available (neither user-configured nor provider default)'
                )]
            };
        }

        // Determine model
        let model = settings.model;
        if (!model && provider.models && provider.models.length > 0) {
            // Use first provider model as fallback if none specified
            model = provider.models[0];
        }

        if (!model) {
            return {
                success: false,
                config: null,
                errors: [makeError(
                    ERROR_CODES.MODEL_MISSING,
                    'No model configured and provider has no default models'
                )]
            };
        }

        // Build config object (includes API key for internal use)
        const config = {
            provider: settings.provider,
            providerName: provider.name,
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            apiKey: settings.apiKey
        };

        return {
            success: true,
            config: config,
            errors: []
        };
    }

    // --- Build Request Body (Provider-Specific) ---
    function buildRequestBody(config, request) {
        const providerId = config.provider;

        // OpenAI-compatible format (default)
        // Used by: openai, custom, azure (with adjustments)
        const body = {
            model: config.model,
            messages: request.messages
        };

        // Add optional parameters if provided
        if (typeof request.temperature === 'number') {
            body.temperature = request.temperature;
        }
        if (typeof request.maxTokens === 'number') {
            body.max_tokens = request.maxTokens;
        }

        // Provider-specific adjustments
        if (providerId === 'anthropic') {
            // Anthropic uses a different format
            // Note: This is simplified; full Anthropic API has more differences
            return {
                model: config.model,
                messages: request.messages,
                max_tokens: request.maxTokens || 1024
            };
        }

        if (providerId === 'google') {
            // Google Gemini uses yet another format
            // Convert messages to Gemini format
            const contents = request.messages
                .filter(m => m.role !== 'system') // Gemini doesn't support system messages directly
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

            // System instruction if present
            const systemMsg = request.messages.find(m => m.role === 'system');
            
            return {
                contents: contents,
                generationConfig: {
                    temperature: request.temperature || 0.7,
                    maxOutputTokens: request.maxTokens || 1024
                },
                ...(systemMsg && { systemInstruction: { parts: [{ text: systemMsg.content }] } })
            };
        }

        return body;
    }

    // --- Build Headers (Provider-Specific) ---
    function buildRequestHeaders(config) {
        const headers = {
            'Content-Type': 'application/json'
        };

        const providerId = config.provider;

        if (providerId === 'openai' || providerId === 'custom' || providerId === 'azure') {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        } else if (providerId === 'anthropic') {
            headers['x-api-key'] = config.apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else if (providerId === 'google') {
            // Google typically uses query param for API key, but header also works
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        return headers;
    }

    // --- Build Full URL (Provider-Specific) ---
    function buildUrl(config) {
        const providerId = config.provider;
        let url = config.baseUrl;

        // Ensure no trailing slash
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }

        if (providerId === 'openai' || providerId === 'custom' || providerId === 'azure') {
            url += '/chat/completions';
        } else if (providerId === 'anthropic') {
            url += '/v1/messages';
        } else if (providerId === 'google') {
            // Google uses query parameter for API key
            url += `/models/${config.model}:generateContent?key=${config.apiKey}`;
            return url; // Return early as we've added the key
        }

        return url;
    }

    // --- Extract Response Content (Provider-Specific) ---
    function extractResponseContent(providerId, rawData) {
        try {
            if (providerId === 'openai' || providerId === 'custom' || providerId === 'azure') {
                // OpenAI format: { choices: [{ message: { content: "..." } }] }
                if (rawData.choices && Array.isArray(rawData.choices) && rawData.choices.length > 0) {
                    const choice = rawData.choices[0];
                    if (choice.message && typeof choice.message.content === 'string') {
                        return {
                            content: choice.message.content,
                            raw: rawData,
                            finishReason: choice.finish_reason || null
                        };
                    }
                }
            } else if (providerId === 'anthropic') {
                // Anthropic format: { content: [{ type: "text", text: "..." }] }
                if (rawData.content && Array.isArray(rawData.content)) {
                    const textParts = rawData.content
                        .filter(c => c.type === 'text')
                        .map(c => c.text);
                    if (textParts.length > 0) {
                        return {
                            content: textParts.join('\n'),
                            raw: rawData,
                            finishReason: rawData.stop_reason || null
                        };
                    }
                }
            } else if (providerId === 'google') {
                // Google format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
                if (rawData.candidates && Array.isArray(rawData.candidates) && rawData.candidates.length > 0) {
                    const candidate = rawData.candidates[0];
                    if (candidate.content && candidate.content.parts) {
                        const textParts = candidate.content.parts
                            .filter(p => p.text)
                            .map(p => p.text);
                        if (textParts.length > 0) {
                            return {
                                content: textParts.join('\n'),
                                raw: rawData,
                                finishReason: candidate.finishReason || null
                            };
                        }
                    }
                }
            }

            // Fallback: try to find any text-like content
            if (rawData.content && typeof rawData.content === 'string') {
                return {
                    content: rawData.content,
                    raw: rawData,
                    finishReason: null
                };
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    // --- Send Request ---
    async function sendRequest(request, options = {}) {
        const result = {
            success: false,
            response: null,
            errors: []
        };

        // Validate request input
        const validationErrors = validateRequest(request);
        if (validationErrors.length > 0) {
            result.errors = validationErrors;
            return result;
        }

        // Get configuration
        const configResult = getConfig();
        if (!configResult.success) {
            result.errors = configResult.errors;
            return result;
        }

        const config = configResult.config;

        // Validate configuration
        const configErrors = validateConfig(config);
        if (configErrors.length > 0) {
            result.errors = configErrors;
            return result;
        }

        // Prepare request
        const url = buildUrl(config);
        const body = buildRequestBody(config, request);
        const headers = buildRequestHeaders(config);

        // Setup abort controller and timeout
        const controller = new AbortController();
        const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
        
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        // Handle abort signal from options
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                controller.abort();
            });
        }

        try {
            const fetchOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: controller.signal
            };

            const httpResponse = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // Check for abort
            if (controller.signal.aborted) {
                // Check if it was a timeout
                if (!options.signal || !options.signal.aborted) {
                    result.errors = [makeError(
                        ERROR_CODES.REQUEST_TIMEOUT,
                        `Request timed out after ${timeoutMs}ms`
                    )];
                } else {
                    result.errors = [makeError(
                        ERROR_CODES.REQUEST_ABORTED,
                        'Request was cancelled'
                    )];
                }
                return result;
            }

            // Parse response
            let responseData;
            const contentType = httpResponse.headers.get('content-type') || '';
            
            if (contentType.includes('application/json')) {
                responseData = await httpResponse.json();
            } else {
                const text = await httpResponse.text();
                try {
                    responseData = JSON.parse(text);
                } catch (e) {
                    result.errors = [makeError(
                        ERROR_CODES.INVALID_RESPONSE,
                        'Response is not valid JSON',
                        { status: httpResponse.status, contentType }
                    )];
                    return result;
                }
            }

            // Handle HTTP errors
            if (!httpResponse.ok) {
                const errorMessage = responseData?.error?.message || 
                                     responseData?.message || 
                                     `HTTP ${httpResponse.status}`;
                
                result.errors = [makeError(
                    ERROR_CODES.HTTP_ERROR,
                    errorMessage,
                    { 
                        status: httpResponse.status,
                        statusText: httpResponse.statusText
                    }
                )];
                return result;
            }

            // Extract content
            const extracted = extractResponseContent(config.provider, responseData);
            
            if (!extracted) {
                result.errors = [makeError(
                    ERROR_CODES.INVALID_RESPONSE,
                    'Could not extract content from provider response',
                    { provider: config.provider }
                )];
                return result;
            }

            result.success = true;
            result.response = {
                content: extracted.content,
                raw: extracted.raw,
                finishReason: extracted.finishReason,
                provider: config.provider
            };

            return result;

        } catch (error) {
            clearTimeout(timeoutId);

            // Handle abort
            if (error.name === 'AbortError') {
                if (options.signal && options.signal.aborted) {
                    result.errors = [makeError(
                        ERROR_CODES.REQUEST_ABORTED,
                        'Request was cancelled'
                    )];
                } else {
                    result.errors = [makeError(
                        ERROR_CODES.REQUEST_TIMEOUT,
                        `Request timed out after ${timeoutMs}ms`
                    )];
                }
                return result;
            }

            // Handle network errors
            if (error instanceof TypeError && error.message.includes('fetch')) {
                result.errors = [makeError(
                    ERROR_CODES.NETWORK_ERROR,
                    'Network error occurred. Check your connection.',
                    { originalError: error.message }
                )];
                return result;
            }

            // Generic error
            result.errors = [makeError(
                ERROR_CODES.NETWORK_ERROR,
                'Failed to send request',
                { originalError: error.message }
            )];
            return result;
        }
    }

    // --- Test Connection ---
    async function testConnection(options = {}) {
        const result = {
            success: false,
            provider: null,
            errors: []
        };

        // Get configuration
        const configResult = getConfig();
        if (!configResult.success) {
            result.errors = configResult.errors;
            return result;
        }

        const config = configResult.config;
        result.provider = {
            id: config.provider,
            name: config.providerName
        };

        // Validate configuration
        const configErrors = validateConfig(config);
        if (configErrors.length > 0) {
            result.errors = configErrors;
            return result;
        }

        // Build a lightweight test request
        const testRequest = {
            messages: [
                {
                    role: 'user',
                    content: 'Respond with just the word "OK"'
                }
            ],
            maxTokens: 10
        };

        // Send test request
        const sendResult = await sendRequest(testRequest, options);

        if (sendResult.success) {
            result.success = true;
            result.message = 'Connection successful';
        } else {
            result.errors = sendResult.errors;
        }

        return result;
    }

    // --- Public API ---
    const AIClient = {
        /**
         * Get current resolved configuration
         * Returns safe result (API key masked in debug output)
         * @returns {Object} Configuration result
         */
        getConfig: function() {
            const result = getConfig();
            
            if (result.success && result.config) {
                // Return a copy with masked key for safety
                return {
                    success: true,
                    config: {
                        provider: result.config.provider,
                        providerName: result.config.providerName,
                        baseUrl: result.config.baseUrl,
                        model: result.config.model,
                        hasApiKey: !!result.config.apiKey
                    },
                    errors: []
                };
            }
            
            return result;
        },

        /**
         * Send a request to the configured AI provider
         * @param {Object} request - Request object with messages array
         * @param {Object} options - Optional settings (timeout, signal)
         * @returns {Promise<Object>} Structured result
         */
        send: async function(request, options = {}) {
            return sendRequest(request, options);
        },

        /**
         * Test connection to the configured provider
         * Performs a lightweight request to verify configuration
         * @param {Object} options - Optional settings
         * @returns {Promise<Object>} Test result
         */
        testConnection: async function(options = {}) {
            return testConnection(options);
        },

        /**
         * Get error codes for reference
         * @returns {Object} Error codes mapping
         */
        getErrorCodes: function() {
            return { ...ERROR_CODES };
        },

        /**
         * Check if all dependencies are available
         * @returns {Object} Dependency check result
         */
        checkDependencies: function() {
            const missing = checkDependencies();
            return {
                ready: missing.length === 0,
                missing: missing
            };
        }
    };

    // Expose to global scope
    global.AIClient = AIClient;

})(typeof window !== 'undefined' ? window : this);
