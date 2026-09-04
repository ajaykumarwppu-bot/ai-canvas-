/**
 * AI UI Module
 * 
 * Browser user-interface controller for text-based AI interaction.
 * 
 * Responsibilities:
 * - Provide chat/message UI panel
 * - Handle user input (text message, send button, Enter key)
 * - Display user messages and AI responses
 * - Show loading state during AI requests
 * - Show status/error messages
 * - Display Canvas processing status when relevant
 * 
 * This module does NOT:
 * - Call AIClient directly (uses AIConversation)
 * - Modify Canvas directly
 * - Store API keys or configuration
 * - Create duplicate conversation history
 */

(function(global) {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        MAX_INPUT_LENGTH: 5000,
        SCROLL_THRESHOLD: 50 // pixels from bottom to auto-scroll
    };

    // --- Error Codes ---
    const ERROR_CODES = {
        UI_NOT_INITIALIZED: 'UI_NOT_INITIALIZED',
        SEND_FAILED: 'SEND_FAILED',
        INVALID_MESSAGE: 'INVALID_MESSAGE'
    };

    // --- Helper: Error Factory ---
    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    // --- State ---
    let isInitialized = false;
    let isSending = false;
    let elements = {};

    // --- DOM Element Cache ---
    function cacheElements() {
        elements = {
            panel: document.getElementById('ai-panel'),
            messagesContainer: document.getElementById('ai-messages'),
            input: document.getElementById('ai-input'),
            sendButton: document.getElementById('ai-send-btn'),
            statusArea: document.getElementById('ai-status'),
            loadingIndicator: document.getElementById('ai-loading')
        };
        return Object.values(elements).every(el => el !== null && el !== undefined);
    }

    // --- Initialize UI ---
    function init() {
        if (isInitialized) {
            // Already initialized - do not add duplicate listeners
            return {
                success: true,
                message: 'AI UI already initialized'
            };
        }

        // Wait for DOM to be ready if needed
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function onReady() {
                document.removeEventListener('DOMContentLoaded', onReady);
                initInternal();
            });
            return {
                success: true,
                message: 'AI UI initialization deferred until DOM ready'
            };
        }

        initInternal();

        return {
            success: true,
            message: 'AI UI initialized successfully'
        };
    }

    // --- Internal Initialization ---
    function initInternal() {
        if (!cacheElements()) {
            console.warn('AIUI: Required DOM elements not found. Ensure index.html includes AI panel structure.');
            return;
        }

        // Attach event listeners
        attachEventListeners();

        isInitialized = true;
    }

    // --- Attach Event Listeners ---
    function attachEventListeners() {
        if (!elements.sendButton || !elements.input) {
            return;
        }

        // Send button click
        elements.sendButton.addEventListener('click', handleSendClick);

        // Input keydown (Enter to send, Shift+Enter for new line)
        elements.input.addEventListener('keydown', handleInputKeydown);

        // Input change - clear status when user starts typing
        elements.input.addEventListener('input', handleInputChange);
    }

    // --- Event Handlers ---
    function handleSendClick() {
        if (isSending) {
            return; // Prevent duplicate sends while loading
        }
        sendMessage();
    }

    function handleInputKeydown(event) {
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                // Shift+Enter: allow new line in textarea
                return;
            }
            // Enter without Shift: send message
            event.preventDefault();
            if (isSending) {
                return; // Prevent duplicate sends while loading
            }
            sendMessage();
        }
    }

    function handleInputChange() {
        // Clear status area when user starts typing a new message
        if (elements.statusArea) {
            elements.statusArea.textContent = '';
            elements.statusArea.className = 'ai-status';
        }
    }

    // --- Send Message Flow ---
    function sendMessage() {
        if (!elements.input) {
            return;
        }

        // Read and validate input
        const rawMessage = elements.input.value;
        
        if (!rawMessage || typeof rawMessage !== 'string') {
            showStatus('Please enter a message', 'error');
            return;
        }

        const trimmedMessage = rawMessage.trim();

        // Check for empty message
        if (trimmedMessage === '') {
            showStatus('Message cannot be empty', 'error');
            return;
        }

        // Check length limit
        if (trimmedMessage.length > CONFIG.MAX_INPUT_LENGTH) {
            showStatus(`Message exceeds maximum length of ${CONFIG.MAX_INPUT_LENGTH} characters`, 'error');
            return;
        }

        // Check if AIConversation is available
        if (typeof AIConversation === 'undefined') {
            showStatus('AI conversation system not available', 'error');
            return;
        }

        // Add user message to UI
        addMessage('user', trimmedMessage);

        // Clear input after message is accepted
        elements.input.value = '';

        // Set loading state
        setLoading(true);

        // Send via AIConversation (do not call AIClient directly)
        AIConversation.send(trimmedMessage)
            .then(function(result) {
                handleConversationResult(result);
            })
            .catch(function(error) {
                handleConversationError(error);
            })
            .finally(function() {
                // Restore controls
                setLoading(false);
            });
    }

    // --- Handle Conversation Result ---
    function handleConversationResult(result) {
        if (!result) {
            showStatus('Received empty response from AI', 'error');
            return;
        }

        // Check for errors in result
        if (result.success === false) {
            const errorMessage = getSafeErrorMessage(result.errors);
            showStatus(errorMessage || 'AI request failed', 'error');
            return;
        }

        // Success - render AI response
        if (result.type === 'text' && result.content) {
            addMessage('assistant', result.content);
        } else if (result.type === 'canvas' && result.content) {
            // Canvas action was performed
            addMessage('assistant', result.content);
            
            // Show Canvas processing status
            showCanvasStatus();
        } else if (result.content) {
            // Generic content display
            addMessage('assistant', result.content);
        } else {
            // No content but successful
            showStatus('Request completed', 'success');
        }

        // Include warnings if present
        if (result.warnings && result.warnings.length > 0) {
            const warningMessages = result.warnings.map(w => w.message || String(w)).join('; ');
            if (warningMessages) {
                showStatus(warningMessages, 'warning');
            }
        }
    }

    // --- Handle Conversation Error ---
    function handleConversationError(error) {
        let safeMessage = 'Failed to send message';
        
        if (error && typeof error === 'object') {
            if (error.message) {
                safeMessage = error.message;
            } else if (error.code) {
                safeMessage = `Error: ${error.code}`;
            }
        } else if (typeof error === 'string') {
            safeMessage = error;
        }

        showStatus(safeMessage, 'error');
    }

    // --- Get Safe Error Message ---
    function getSafeErrorMessage(errors) {
        if (!errors || !Array.isArray(errors) || errors.length === 0) {
            return null;
        }

        // Get first error message (safe, non-sensitive)
        const firstError = errors[0];
        
        if (typeof firstError === 'string') {
            return firstError;
        }
        
        if (firstError && typeof firstError === 'object' && firstError.message) {
            // Do not expose sensitive details
            const msg = firstError.message;
            // Filter out any potentially sensitive information
            if (msg.toLowerCase().includes('api key') || 
                msg.toLowerCase().includes('authorization') ||
                msg.toLowerCase().includes('token')) {
                return 'Authentication failed. Please check your settings.';
            }
            return msg;
        }

        return null;
    }

    // --- Add Message to UI ---
    function addMessage(type, content) {
        if (!elements.messagesContainer) {
            return;
        }

        // Validate content
        if (content === null || content === undefined) {
            return;
        }

        const messageText = typeof content === 'string' ? content : String(content);

        // Create message element safely (no innerHTML with user/AI content)
        const messageEl = document.createElement('div');
        messageEl.className = `ai-message ai-message-${type}`;
        messageEl.setAttribute('data-message-type', type);

        // Use textContent for safety (prevents XSS)
        const contentEl = document.createElement('div');
        contentEl.className = 'ai-message-content';
        contentEl.textContent = messageText;

        // Add type label
        const labelEl = document.createElement('div');
        labelEl.className = 'ai-message-label';
        labelEl.textContent = type === 'user' ? 'You' : 'AI';

        messageEl.appendChild(labelEl);
        messageEl.appendChild(contentEl);

        elements.messagesContainer.appendChild(messageEl);

        // Scroll to show latest message
        scrollToBottom();
    }

    // --- Set Loading State ---
    function setLoading(isLoading) {
        isSending = isLoading;

        if (!elements.sendButton || !elements.input || !elements.loadingIndicator) {
            return;
        }

        if (isLoading) {
            // Disable controls
            elements.sendButton.disabled = true;
            elements.input.disabled = true;
            
            // Show loading indicator
            elements.loadingIndicator.style.display = 'block';
            elements.loadingIndicator.setAttribute('aria-hidden', 'false');
        } else {
            // Enable controls
            elements.sendButton.disabled = false;
            elements.input.disabled = false;
            
            // Hide loading indicator
            elements.loadingIndicator.style.display = 'none';
            elements.loadingIndicator.setAttribute('aria-hidden', 'true');
            
            // Focus input for next message
            elements.input.focus();
        }
    }

    // --- Show Status Message ---
    function showStatus(message, type) {
        if (!elements.statusArea) {
            return;
        }

        if (!message || typeof message !== 'string') {
            elements.statusArea.textContent = '';
            elements.statusArea.className = 'ai-status';
            return;
        }

        elements.statusArea.textContent = message;
        
        // Set status type class
        const validTypes = ['error', 'warning', 'success', 'info'];
        const statusType = validTypes.includes(type) ? type : 'info';
        elements.statusArea.className = `ai-status ai-status-${statusType}`;
    }

    // --- Show Canvas Processing Status ---
    function showCanvasStatus() {
        if (!elements.statusArea) {
            return;
        }

        // Show brief Canvas update notification
        const canvasStatusEl = document.createElement('span');
        canvasStatusEl.className = 'ai-canvas-status';
        canvasStatusEl.textContent = 'Canvas updated';
        
        // Append to existing status or show alone
        if (elements.statusArea.textContent) {
            elements.statusArea.textContent += ' | ';
        }
        elements.statusArea.appendChild(canvasStatusEl);
    }

    // --- Scroll to Bottom ---
    function scrollToBottom() {
        if (!elements.messagesContainer) {
            return;
        }

        const container = elements.messagesContainer;
        const scrollThreshold = CONFIG.SCROLL_THRESHOLD;

        // Check if user is near bottom
        const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < scrollThreshold;

        if (isNearBottom || container.children.length <= 1) {
            // Auto-scroll to bottom
            container.scrollTop = container.scrollHeight;
        }
        // If user scrolled up to read older messages, don't force scroll
    }

    // --- Clear Messages ---
    function clearMessages() {
        if (!elements.messagesContainer) {
            return;
        }

        elements.messagesContainer.innerHTML = '';
    }

    // --- Get Current Input ---
    function getInputValue() {
        if (!elements.input) {
            return '';
        }
        return elements.input.value;
    }

    // --- Set Input Value ---
    function setInputValue(value) {
        if (!elements.input) {
            return;
        }
        elements.input.value = value || '';
    }

    // --- Focus Input ---
    function focusInput() {
        if (!elements.input) {
            return;
        }
        elements.input.focus();
    }

    // --- Check Initialization Status ---
    function isReady() {
        return isInitialized && cacheElements();
    }

    // --- Public API ---
    const AIUI = {
        /**
         * Initialize the AI UI panel
         * @returns {Object} Initialization result
         */
        init: init,

        /**
         * Send a message through the conversation system
         * Validates input and manages loading state
         */
        sendMessage: sendMessage,

        /**
         * Add a message to the message area
         * @param {string} type - Message type ('user', 'assistant', 'system')
         * @param {string} content - Message content
         */
        addMessage: addMessage,

        /**
         * Set loading state (disables input, shows indicator)
         * @param {boolean} isLoading - Whether loading is active
         */
        setLoading: setLoading,

        /**
         * Show a status message
         * @param {string} message - Status message text
         * @param {string} type - Status type ('error', 'warning', 'success', 'info')
         */
        showStatus: showStatus,

        /**
         * Clear all messages from the message area
         */
        clearMessages: clearMessages,

        /**
         * Get current input value
         * @returns {string} Current input text
         */
        getInputValue: getInputValue,

        /**
         * Set input value
         * @param {string} value - Text to set
         */
        setInputValue: setInputValue,

        /**
         * Focus the input field
         */
        focusInput: focusInput,

        /**
         * Check if UI is initialized and ready
         * @returns {boolean} True if ready
         */
        isReady: isReady,

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
        }
    };

    // Expose to global scope
    global.AIUI = AIUI;

})(typeof window !== 'undefined' ? window : this);
