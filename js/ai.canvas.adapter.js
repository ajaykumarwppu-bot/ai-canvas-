/**
 * AI Canvas Adapter Module
 * 
 * Connects AI responses with the existing Canvas processing pipeline.
 * 
 * Responsibilities:
 * - Receive normalized AI response from AIClient
 * - Detect whether response contains Canvas data
 * - Extract Canvas data safely (no eval, no executable parsing)
 * - Pass valid Canvas data through AISchema for validation
 * - Pass validated data to AIActions for execution
 * - Return structured results
 * 
 * This module does NOT:
 * - Directly manipulate Canvas DOM elements
 * - Bypass AIActions or CanvasAPI
 * - Call fetch or send AI requests
 * - Store API keys
 * - Create UI elements
 */

(function(global) {
    'use strict';

    // --- Error Codes ---
    const ERROR_CODES = {
        AI_RESPONSE_FAILED: 'AI_RESPONSE_FAILED',
        UNSUPPORTED_RESPONSE: 'UNSUPPORTED_RESPONSE',
        INVALID_CANVAS_DATA: 'INVALID_CANVAS_DATA',
        SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
        ACTION_PROCESSING_FAILED: 'ACTION_PROCESSING_FAILED',
        CANVAS_API_UNAVAILABLE: 'CANVAS_API_UNAVAILABLE'
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
        if (typeof AISchema === 'undefined') missing.push('AISchema');
        if (typeof AIActions === 'undefined') missing.push('AIActions');
        return missing;
    }

    // --- Helper: Create result object ---
    function createResult(success, type, options = {}) {
        return {
            success: success,
            type: type,
            content: options.content || null,
            canvasProcessed: options.canvasProcessed || false,
            data: options.data || null,
            actions: options.actions || null,
            errors: options.errors || [],
            warnings: options.warnings || []
        };
    }

    // --- Detection: Is this a failed AI response? ---
    function isFailedResponse(response) {
        if (!response || typeof response !== 'object') {
            return false;
        }
        // AIClient returns { success: false, response: null, errors: [...] } on failure
        return response.success === false;
    }

    // --- Detection: Does response contain Canvas data? ---
    function isCanvasResponse(response) {
        if (!response || typeof response !== 'object') {
            return false;
        }

        // Get the actual content from AIClient response format
        // AIClient returns: { success: true/false, response: {...}, errors: [...] }
        // On success: response.response = { content: string|object, raw: ..., finishReason: ... }
        const content = getContentFromResponse(response);
        
        if (content === null || content === undefined) {
            return false;
        }

        // If content is already an object that looks like Canvas data
        if (typeof content === 'object' && !Array.isArray(content)) {
            // Check for Canvas-like structure: must have nodes array
            if (content.nodes && Array.isArray(content.nodes)) {
                return true;
            }
            // Or has intent indicating canvas operation
            if (content.intent && typeof content.intent === 'string') {
                return true;
            }
        }

        // If content is a string, use robust JSON extraction
        if (typeof content === 'string') {
            // Use extractJsonFromMarkdown to handle fenced blocks and pure JSON
            const parsed = extractJsonFromMarkdown(content);
            
            if (parsed && typeof parsed === 'object') {
                // Has nodes array - likely Canvas data
                if (parsed.nodes && Array.isArray(parsed.nodes)) {
                    return true;
                }
                // Has intent indicating canvas operation
                if (parsed.intent && typeof parsed.intent === 'string') {
                    return true;
                }
            }
            
            return false;
        }

        return false;
    }

    // --- Helper: Extract content from AIClient response ---
    function getContentFromResponse(response) {
        if (!response || typeof response !== 'object') {
            return null;
        }
        
        // AIClient successful response format: { success: true, response: { content: ... } }
        if (response.response && typeof response.response === 'object') {
            return response.response.content;
        }
        
        // Fallback: direct content field (for compatibility)
        if (response.content !== undefined) {
            return response.content;
        }
        
        return null;
    }

    // --- Helper: Safely strip JavaScript-style line comments from JSON content ---
    /**
     * Removes JavaScript-style single-line comments (// ...) from JSON-like content
     * while preserving // characters that appear inside quoted strings.
     * 
     * This function performs a character-by-character scan to distinguish between:
     * - Comments outside strings: removed
     * - // inside string values: preserved exactly
     * 
     * Correctly handles:
     * - Escaped quotes: \"
     * - Escaped backslashes: \\
     * - Windows CRLF and Unix LF line endings
     * 
     * @param {string} content - The content to process
     * @returns {string} Content with comments removed, strings preserved
     */
    function stripJsonLineCommentsSafely(content) {
        if (typeof content !== 'string') {
            return content;
        }

        let result = '';
        let i = 0;
        const len = content.length;
        let inString = false;

        while (i < len) {
            const char = content[i];
            const nextChar = i + 1 < len ? content[i + 1] : '';

            // If we're inside a string
            if (inString) {
                // Check for escape sequence
                if (char === '\\' && nextChar !== '') {
                    // Include both the backslash and the escaped character
                    result += char + nextChar;
                    i += 2;
                    continue;
                }

                // Check for closing quote
                if (char === '"') {
                    inString = false;
                    result += char;
                    i++;
                    continue;
                }

                // Inside string: preserve everything
                result += char;
                i++;
                continue;
            }

            // Not inside a string

            // Check for opening quote
            if (char === '"') {
                inString = true;
                result += char;
                i++;
                continue;
            }

            // Check for // comment start
            if (char === '/' && nextChar === '/') {
                // Skip characters until end of line
                i += 2; // Skip the //
                while (i < len) {
                    const c = content[i];
                    // Stop at newline (handle both \r\n and \n)
                    if (c === '\n' || c === '\r') {
                        // Preserve the newline character(s)
                        if (c === '\r' && i + 1 < len && content[i + 1] === '\n') {
                            result += '\r\n';
                            i += 2;
                        } else {
                            result += c;
                            i++;
                        }
                        break;
                    }
                    i++;
                }
                continue;
            }

            // Regular character outside string
            result += char;
            i++;
        }

        return result;
    }

    // --- Helper: Extract JSON from Markdown-fenced code blocks ---
    /**
     * Extracts JSON content from a string that may contain Markdown code fences.
     * Supports formats:
     * - Pure JSON: {"nodes": [...], "edges": [...]}
     * - Fenced JSON: ```json {...} ```
     * - Generic fenced code: ``` {...} ```
     * - Text before/after JSON blocks
     * 
     * @param {string} content - The string content to parse
     * @returns {Object|null} Parsed JSON object or null if no valid JSON found
     */
    function extractJsonFromMarkdown(content) {
        if (typeof content !== 'string') {
            return null;
        }

        const trimmed = content.trim();
        
        // Try to find fenced code blocks first (```json or ```)
        // Pattern matches: ```json, ```, or ``` followed by optional whitespace and newline
        const fencePattern = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/gi;
        let match = fencePattern.exec(trimmed);
        
        while (match) {
            let codeContent = match[1].trim();
            
            // Strip JavaScript-style line comments safely before parsing
            codeContent = stripJsonLineCommentsSafely(codeContent);
            
            // Try to parse the extracted code content
            if (codeContent.startsWith('{') || codeContent.startsWith('[')) {
                try {
                    return JSON.parse(codeContent);
                } catch (e) {
                    // Try next fence block if this one fails
                }
            }
            
            match = fencePattern.exec(trimmed);
        }

        // No fenced blocks found or none contained valid JSON
        // Try parsing the entire content as raw JSON
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            let cleanedContent = stripJsonLineCommentsSafely(trimmed);
            try {
                return JSON.parse(cleanedContent);
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    // --- Extraction: Extract Canvas data from response ---
    function extractCanvasData(response) {
        const result = {
            success: false,
            data: null,
            errors: [],
            warnings: []
        };

        if (!response || typeof response !== 'object') {
            result.errors.push(makeError(
                ERROR_CODES.INVALID_CANVAS_DATA,
                'Response must be an object'
            ));
            return result;
        }

        // Get content using the AIClient response format helper
        const content = getContentFromResponse(response);
        
        if (content === null || content === undefined) {
            result.errors.push(makeError(
                ERROR_CODES.INVALID_CANVAS_DATA,
                'No content found in response'
            ));
            return result;
        }

        // Case 1: Content is already an object
        if (typeof content === 'object' && !Array.isArray(content)) {
            result.success = true;
            result.data = content;
            return result;
        }

        // Case 2: Content is a string - use robust JSON extraction
        if (typeof content === 'string') {
            // Use extractJsonFromMarkdown to handle fenced blocks and pure JSON
            const parsed = extractJsonFromMarkdown(content);
            
            if (parsed && typeof parsed === 'object') {
                result.success = true;
                result.data = parsed;
                return result;
            } else {
                result.errors.push(makeError(
                    ERROR_CODES.INVALID_CANVAS_DATA,
                    'Content does not contain valid JSON'
                ));
                return result;
            }
        }

        // No Canvas data found
        result.errors.push(makeError(
            ERROR_CODES.UNSUPPORTED_RESPONSE,
            'No Canvas data found in response'
        ));
        return result;
    }

    // --- Processing: Schema validation ---
    function processSchema(canvasData) {
        // Check if AISchema is available
        if (typeof AISchema === 'undefined') {
            return {
                success: false,
                data: null,
                errors: [makeError(
                    ERROR_CODES.SCHEMA_VALIDATION_FAILED,
                    'AISchema module not available'
                )],
                warnings: []
            };
        }

        // Use AISchema.process() - it handles parse, normalize, validate
        return AISchema.process(canvasData);
    }

    // --- Processing: Action execution ---
    function processActions(validatedPlan) {
        // Check if AIActions is available
        if (typeof AIActions === 'undefined') {
            return {
                success: false,
                actions: [],
                results: [],
                errors: [makeError(
                    ERROR_CODES.ACTION_PROCESSING_FAILED,
                    'AIActions module not available'
                )],
                warnings: []
            };
        }

        // Check if CanvasAPI is available
        if (typeof CanvasAPI === 'undefined') {
            return {
                success: false,
                actions: [],
                results: [],
                errors: [makeError(
                    ERROR_CODES.CANVAS_API_UNAVAILABLE,
                    'CanvasAPI not available'
                )],
                warnings: []
            };
        }

        // Use AIActions.process() - it handles createActions and execute
        return AIActions.process(validatedPlan);
    }

    // --- Main Process Method ---
    function process(response) {
        // Check dependencies first
        const missingDeps = checkDependencies();
        if (missingDeps.length > 0) {
            return createResult(false, 'error', {
                errors: [makeError(
                    ERROR_CODES.AI_RESPONSE_FAILED,
                    `Missing dependencies: ${missingDeps.join(', ')}`
                )]
            });
        }

        // Step 1: Check for failed AI response
        if (isFailedResponse(response)) {
            // Preserve error information from the original response
            const errors = response.errors || [makeError(
                ERROR_CODES.AI_RESPONSE_FAILED,
                'AI request failed'
            )];

            return createResult(false, 'error', {
                content: null,
                canvasProcessed: false,
                errors: errors
            });
        }

        // Get content from AIClient response format
        const content = getContentFromResponse(response);
        
        // Step 2: Check if response has content
        if (content === null || content === undefined) {
            return createResult(false, 'error', {
                errors: [makeError(
                    ERROR_CODES.INVALID_CANVAS_DATA,
                    'Response missing content field'
                )]
            });
        }

        // Step 3: Detect if this is a Canvas response
        if (!isCanvasResponse(response)) {
            // Normal text response - return success without Canvas processing
            return createResult(true, 'text', {
                content: typeof content === 'string' ? content : String(content),
                canvasProcessed: false
            });
        }

        // Step 4: Extract Canvas data
        const extractionResult = extractCanvasData(response);
        
        if (!extractionResult.success) {
            return createResult(false, 'error', {
                content: typeof content === 'string' ? content : null,
                canvasProcessed: false,
                errors: extractionResult.errors,
                warnings: extractionResult.warnings
            });
        }

        // Step 5: Validate through AISchema
        const schemaResult = processSchema(extractionResult.data);

        if (!schemaResult.success) {
            return createResult(false, 'error', {
                content: null,
                canvasProcessed: false,
                errors: schemaResult.errors.map(e => makeError(
                    ERROR_CODES.SCHEMA_VALIDATION_FAILED,
                    e.message || 'Schema validation failed',
                    e.details
                )),
                warnings: schemaResult.warnings || []
            });
        }

        // Step 6: Execute actions through AIActions
        const actionResult = processActions({
            success: true,
            data: schemaResult.data,
            errors: [],
            warnings: schemaResult.warnings || []
        });

        if (!actionResult.success) {
            return createResult(false, 'error', {
                content: null,
                canvasProcessed: true,
                data: schemaResult.data,
                actions: actionResult.actions || [],
                errors: actionResult.errors.map(e => makeError(
                    ERROR_CODES.ACTION_PROCESSING_FAILED,
                    e.message || 'Action processing failed',
                    e.details
                )),
                warnings: actionResult.warnings || []
            });
        }

        // Success: Canvas processed and actions executed
        return createResult(true, 'canvas', {
            content: schemaResult.data.title || null,
            canvasProcessed: true,
            data: schemaResult.data,
            actions: actionResult.actions || [],
            warnings: actionResult.warnings || []
        });
    }

    // --- Public API ---
    const AICanvasAdapter = {
        /**
         * Process an AI response and determine if it contains Canvas data
         * @param {Object} response - Normalized response from AIClient
         * @returns {Object} Structured result
         */
        process: process,

        /**
         * Check if a response contains Canvas data
         * @param {Object} response - Response to check
         * @returns {boolean} True if response contains Canvas data
         */
        isCanvasResponse: isCanvasResponse,

        /**
         * Extract Canvas data from a response
         * @param {Object} response - Response to extract from
         * @returns {Object} Result with success, data, errors, warnings
         */
        extractCanvasData: extractCanvasData,

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
    global.AICanvasAdapter = AICanvasAdapter;

})(typeof window !== 'undefined' ? window : this);
