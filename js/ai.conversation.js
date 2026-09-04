/**
 * AI Conversation Module
 * 
 * Main orchestration layer for one AI conversation request.
 * 
 * Responsibilities:
 * - Receive user message and options
 * - Validate user input
 * - Build context using AIContext
 * - Build request messages for AIClient
 * - Send request via AIClient
 * - Pass response to AICanvasAdapter
 * - Maintain conversation history
 * - Return structured final result
 * 
 * This module does NOT:
 * - Create UI elements
 * - Directly modify the Canvas
 * - Call fetch directly
 * - Store API keys
 * - Execute AI actions (delegates to AICanvasAdapter)
 */

(function(global) {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        MAX_HISTORY_ENTRIES: 50,      // Maximum conversation history entries
        MAX_MESSAGE_LENGTH: 10000,    // Maximum user message length
        DEFAULT_CONTEXT_MODE: 'full'  // Default context mode for AI requests
    };

    // --- Error Codes ---
    const ERROR_CODES = {
        INVALID_USER_MESSAGE: 'INVALID_USER_MESSAGE',
        CONTEXT_BUILD_FAILED: 'CONTEXT_BUILD_FAILED',
        CLIENT_SEND_FAILED: 'CLIENT_SEND_FAILED',
        ADAPTER_PROCESSING_FAILED: 'ADAPTER_PROCESSING_FAILED',
        CONVERSATION_FAILED: 'CONVERSATION_FAILED'
    };

    // --- Helper: Error Factory ---
    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    // --- Helper: Warning Factory ---
    function makeWarning(code, message) {
        return { code, message };
    }

    // --- Helper: Check dependencies ---
    function checkDependencies() {
        const missing = [];
        if (typeof AIContext === 'undefined') missing.push('AIContext');
        if (typeof AIClient === 'undefined') missing.push('AIClient');
        if (typeof AICanvasAdapter === 'undefined') missing.push('AICanvasAdapter');
        return missing;
    }

    // --- Conversation History Management ---
    let conversationHistory = [];

    /**
     * Add entry to conversation history
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message content
     */
    function addToHistory(role, content) {
        // Only store text content, not full objects
        const entry = {
            role: role,
            content: typeof content === 'string' ? content : String(content),
            timestamp: Date.now()
        };

        conversationHistory.push(entry);

        // Enforce maximum history limit
        while (conversationHistory.length > CONFIG.MAX_HISTORY_ENTRIES) {
            conversationHistory.shift(); // Remove oldest entry
        }
    }

    /**
     * Get a safe copy of conversation history
     * @returns {Array} Copy of history entries
     */
    function getHistoryCopy() {
        return conversationHistory.map(entry => ({ ...entry }));
    }

    /**
     * Clear conversation history
     */
    function clearHistoryData() {
        conversationHistory = [];
    }

    // --- Validation: User Message ---
    function validateUserMessage(message) {
        const errors = [];

        // Check if message exists
        if (message === null || message === undefined) {
            errors.push(makeError(
                ERROR_CODES.INVALID_USER_MESSAGE,
                'Message is required'
            ));
            return errors;
        }

        // Convert to string if safely convertible
        let messageText;
        if (typeof message === 'string') {
            messageText = message;
        } else if (typeof message.toString === 'function') {
            try {
                messageText = String(message);
            } catch (e) {
                errors.push(makeError(
                    ERROR_CODES.INVALID_USER_MESSAGE,
                    'Message cannot be converted to text'
                ));
                return errors;
            }
        } else {
            errors.push(makeError(
                ERROR_CODES.INVALID_USER_MESSAGE,
                'Message must be a string or convertible to text'
            ));
            return errors;
        }

        // Check for empty message
        const trimmed = messageText.trim();
        if (trimmed === '') {
            errors.push(makeError(
                ERROR_CODES.INVALID_USER_MESSAGE,
                'Message cannot be empty'
            ));
            return errors;
        }

        // Check for excessively large messages
        if (trimmed.length > CONFIG.MAX_MESSAGE_LENGTH) {
            errors.push(makeError(
                ERROR_CODES.INVALID_USER_MESSAGE,
                `Message exceeds maximum length of ${CONFIG.MAX_MESSAGE_LENGTH} characters`,
                { actualLength: trimmed.length, maxLength: CONFIG.MAX_MESSAGE_LENGTH }
            ));
            return errors;
        }

        return errors;
    }

    // --- Build Request Messages ---
    function buildRequestMessages(userMessage, contextResult, options = {}) {
        const messages = [];

        // Build system prompt that clearly separates context from instructions
        const systemParts = [];

        // Add application context header
        systemParts.push('You are an AI assistant helping users with their Canvas project.');

        // Include Canvas context if available
        if (contextResult && contextResult.success && contextResult.context) {
            const ctx = contextResult.context;
            
            if (ctx.nodes && ctx.nodes.length > 0) {
                systemParts.push('\n--- Current Canvas Context ---');
                systemParts.push(`The Canvas contains ${ctx.nodes.length} node(s) and ${ctx.connections ? ctx.connections.length : 0} connection(s).`);
                
                // Include node information as data (not executable)
                if (options.includeContent !== false) {
                    systemParts.push('\nNodes:');
                    ctx.nodes.forEach((node, idx) => {
                        const nodeInfo = `- [${node.id}] "${node.title}" (type: ${node.type})`;
                        systemParts.push(nodeInfo);
                    });
                }
                
                // Include connections if requested
                if (options.includeConnections !== false && ctx.connections && ctx.connections.length > 0) {
                    systemParts.push('\nConnections:');
                    ctx.connections.forEach(conn => {
                        const connInfo = `- ${conn.from} → ${conn.to}${conn.label ? ` (${conn.label})` : ''}`;
                        systemParts.push(connInfo);
                    });
                }
                
                // Note if data is partial
                if (ctx.metadata && ctx.metadata.hasPartialData) {
                    systemParts.push('\n(Note: Some Canvas data may be omitted due to size limits.)');
                }
            } else if (ctx.metadata && ctx.metadata.isEmpty) {
                systemParts.push('\nThe Canvas is currently empty.');
            }
        }

        systemParts.push('\n--- Instructions ---');
        systemParts.push('Respond to the user\'s request. If the user asks for Canvas changes, provide structured Canvas data in your response.');
        systemParts.push('For normal questions, respond with helpful text without Canvas instructions.');

        // Add system message
        messages.push({
            role: 'system',
            content: systemParts.join('')
        });

        // Add conversation history (if any)
        const historyLimit = options.historyLimit || 10;
        const recentHistory = conversationHistory.slice(-historyLimit);
        
        recentHistory.forEach(entry => {
            messages.push({
                role: entry.role,
                content: entry.content
            });
        });

        // Add current user message
        messages.push({
            role: 'user',
            content: typeof userMessage === 'string' ? userMessage.trim() : String(userMessage).trim()
        });

        return messages;
    }

    // --- Build Request Object ---
    function buildRequest(userMessage, contextResult, options = {}) {
        const messages = buildRequestMessages(userMessage, contextResult, options);

        const request = {
            messages: messages
        };

        // Add optional parameters if provided
        if (typeof options.temperature === 'number') {
            request.temperature = options.temperature;
        }
        if (typeof options.maxTokens === 'number') {
            request.maxTokens = options.maxTokens;
        }

        return request;
    }

    // --- Main Send Method ---
    async function send(message, options = {}) {
        const result = {
            success: false,
            type: 'error',
            content: null,
            canvasProcessed: false,
            data: null,
            actions: null,
            adapterResult: null,
            contextUsed: false,
            errors: [],
            warnings: []
        };

        // Step 1: Check dependencies
        const missingDeps = checkDependencies();
        if (missingDeps.length > 0) {
            result.errors.push(makeError(
                ERROR_CODES.CONVERSATION_FAILED,
                `Missing dependencies: ${missingDeps.join(', ')}`
            ));
            return result;
        }

        // Step 2: Validate user message
        const validationErrors = validateUserMessage(message);
        if (validationErrors.length > 0) {
            result.errors = validationErrors;
            return result;
        }

        // Normalize message to trimmed string
        const userMessage = typeof message === 'string' ? message.trim() : String(message).trim();

        // Step 3: Build context using AIContext
        // Only build context if not explicitly disabled
        let contextResult = null;
        if (options.skipContext !== true) {
            const contextOptions = {
                mode: options.contextMode || CONFIG.DEFAULT_CONTEXT_MODE,
                includeConnections: options.includeConnections !== false,
                includeContent: options.includeContent !== false,
                maxItems: options.maxContextItems || 50
            };

            // Pass through selected node IDs if provided
            if (options.selectedNodeIds) {
                contextOptions.selectedNodeIds = options.selectedNodeIds;
            }

            contextResult = AIContext.build(contextOptions);

            if (!contextResult.success) {
                // Context build failed - add warnings but continue if partial data available
                if (contextResult.errors && contextResult.errors.length > 0) {
                    // Check if we can continue with partial/empty context
                    const hasFatalError = contextResult.errors.some(e => 
                        e.code === ERROR_CODES.CONTEXT_BUILD_FAILED ||
                        e.code === 'CANVAS_UNAVAILABLE'
                    );
                    
                    if (hasFatalError) {
                        result.errors.push(makeError(
                            ERROR_CODES.CONTEXT_BUILD_FAILED,
                            'Failed to build Canvas context',
                            { originalErrors: contextResult.errors }
                        ));
                        return result;
                    }
                }
                
                // Add warnings but continue
                if (contextResult.warnings) {
                    result.warnings.push(...contextResult.warnings);
                }
            } else {
                result.contextUsed = true;
            }
        }

        // Step 4: Build request messages
        let request;
        try {
            request = buildRequest(userMessage, contextResult, options);
        } catch (e) {
            result.errors.push(makeError(
                ERROR_CODES.CONVERSATION_FAILED,
                'Failed to build request: ' + e.message
            ));
            return result;
        }

        // Step 5: Send request via AIClient
        let clientResult;
        try {
            const clientOptions = {};
            
            // Pass through abort signal if provided
            if (options.signal) {
                clientOptions.signal = options.signal;
            }
            
            // Pass through timeout if provided
            if (options.timeout) {
                clientOptions.timeout = options.timeout;
            }

            clientResult = await AIClient.send(request, clientOptions);
        } catch (e) {
            result.errors.push(makeError(
                ERROR_CODES.CLIENT_SEND_FAILED,
                'Failed to send request to AI: ' + e.message
            ));
            return result;
        }

        // Step 6: Handle client failure
        if (!clientResult.success) {
            result.errors = clientResult.errors || [makeError(
                ERROR_CODES.CLIENT_SEND_FAILED,
                'AI request failed'
            )];
            return result;
        }

        // Step 7: Pass response to AICanvasAdapter
        let adapterResult;
        try {
            adapterResult = AICanvasAdapter.process(clientResult);
        } catch (e) {
            result.errors.push(makeError(
                ERROR_CODES.ADAPTER_PROCESSING_FAILED,
                'Failed to process AI response: ' + e.message
            ));
            return result;
        }

        // Store adapter result for reference
        result.adapterResult = adapterResult;

        // Step 8: Handle adapter failure
        if (!adapterResult.success) {
            result.success = false;
            result.type = adapterResult.type || 'error';
            result.canvasProcessed = adapterResult.canvasProcessed || false;
            result.data = adapterResult.data || null;
            result.actions = adapterResult.actions || null;
            result.errors = adapterResult.errors || [];
            result.warnings = adapterResult.warnings || [];
            
            return result;
        }

        // Step 9: Success - update conversation history
        // Store user message
        addToHistory('user', userMessage);
        
        // Store AI response content (only text content, not full objects)
        let aiContentForHistory = '';
        if (adapterResult.type === 'text' && adapterResult.content) {
            aiContentForHistory = adapterResult.content;
        } else if (adapterResult.type === 'canvas' && adapterResult.content) {
            // For Canvas responses, store a brief description
            aiContentForHistory = `[Canvas action: ${adapterResult.content}]`;
        }
        
        if (aiContentForHistory) {
            addToHistory('assistant', aiContentForHistory);
        }

        // Step 10: Build final successful result
        result.success = true;
        result.type = adapterResult.type || 'text';
        result.content = adapterResult.content || null;
        result.canvasProcessed = adapterResult.canvasProcessed || false;
        result.data = adapterResult.data || null;
        result.actions = adapterResult.actions || null;
        result.warnings = adapterResult.warnings || [];

        return result;
    }

    // --- Public API ---
    const AIConversation = {
        /**
         * Send a user message and coordinate the full AI request flow
         * @param {string|Object} message - User message (string or convertible)
         * @param {Object} options - Optional settings
         * @param {string} options.contextMode - Context mode ('full', 'selected', 'summary')
         * @param {boolean} options.includeConnections - Whether to include connections in context
         * @param {boolean} options.includeContent - Whether to include node content
         * @param {number} options.maxContextItems - Maximum items in context
         * @param {Array} options.selectedNodeIds - Specific nodes to include
         * @param {boolean} options.skipContext - Skip context building entirely
         * @param {AbortSignal} options.signal - Abort signal for cancellation
         * @param {number} options.timeout - Request timeout in ms
         * @param {number} options.temperature - AI temperature setting
         * @param {number} options.maxTokens - Maximum tokens in response
         * @returns {Promise<Object>} Structured result
         */
        send: send,

        /**
         * Build request messages without sending
         * Useful for preview or debugging
         * @param {string} message - User message
         * @param {Object} options - Options same as send()
         * @returns {Object} Request object with messages array
         */
        buildRequest: function(message, options = {}) {
            // Validate message first
            const validationErrors = validateUserMessage(message);
            if (validationErrors.length > 0) {
                return {
                    success: false,
                    request: null,
                    errors: validationErrors
                };
            }

            // Build context (synchronously)
            let contextResult = null;
            if (options.skipContext !== true) {
                const contextOptions = {
                    mode: options.contextMode || CONFIG.DEFAULT_CONTEXT_MODE,
                    includeConnections: options.includeConnections !== false,
                    includeContent: options.includeContent !== false,
                    maxItems: options.maxContextItems || 50
                };
                
                if (options.selectedNodeIds) {
                    contextOptions.selectedNodeIds = options.selectedNodeIds;
                }
                
                contextResult = AIContext.build(contextOptions);
            }

            const request = buildRequest(message, contextResult, options);
            
            return {
                success: true,
                request: request,
                errors: []
            };
        },

        /**
         * Get a safe copy of conversation history
         * @returns {Array} Array of history entries
         */
        getHistory: getHistoryCopy,

        /**
         * Clear conversation history
         * Does not affect Canvas, settings, or other data
         */
        clearHistory: clearHistoryData,

        /**
         * Get error codes for reference
         * @returns {Object} Error codes mapping
         */
        getErrorCodes: function() {
            return { ...ERROR_CODES };
        },

        /**
         * Get configuration values
         * @returns {Object} Configuration object
         */
        getConfig: function() {
            return { ...CONFIG };
        },

        /**
         * Check if all dependencies are available
         * @returns {Object} Dependency check result
         */
        checkDependencies: checkDependencies
    };

    // Expose to global scope
    global.AIConversation = AIConversation;

})(typeof window !== 'undefined' ? window : this);
