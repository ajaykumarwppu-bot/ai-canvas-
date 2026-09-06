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
    let isSettingsViewActive = false;

    // --- DOM Element Cache ---
    function cacheElements() {
        elements = {
            panel: document.getElementById('ai-panel'),
            messagesContainer: document.getElementById('ai-messages'),
            input: document.getElementById('ai-input'),
            sendButton: document.getElementById('ai-send-btn'),
            statusArea: document.getElementById('ai-status'),
            loadingIndicator: document.getElementById('ai-loading'),
            // Settings view elements
            settingsView: document.getElementById('ai-settings-view'),
            settingsBtn: document.getElementById('ai-settings-btn'),
            newChatBtn: document.getElementById('ai-new-chat-btn'),
            settingsBackBtn: document.getElementById('ai-settings-back-btn'),
            settingsProvider: document.getElementById('ai-settings-provider'),
            settingsCustomProvider: document.getElementById('ai-settings-custom-provider'),
            settingsApiKey: document.getElementById('ai-settings-apikey'),
            settingsBaseUrl: document.getElementById('ai-settings-baseurl'),
            settingsModel: document.getElementById('ai-settings-model'),
            settingsCustomModel: document.getElementById('ai-settings-custom-model'),
            settingsSaveBtn: document.getElementById('ai-settings-save-btn'),
            settingsCancelBtn: document.getElementById('ai-settings-cancel-btn'),
            settingsStatus: document.getElementById('ai-settings-status')
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

        // Settings button click
        if (elements.settingsBtn) {
            elements.settingsBtn.addEventListener('click', showSettingsView);
        }

        // New Chat button click
        if (elements.newChatBtn) {
            elements.newChatBtn.addEventListener('click', handleNewChat);
        }

        // Settings back button click
        if (elements.settingsBackBtn) {
            elements.settingsBackBtn.addEventListener('click', hideSettingsView);
        }

        // Settings cancel button click
        if (elements.settingsCancelBtn) {
            elements.settingsCancelBtn.addEventListener('click', hideSettingsView);
        }

        // Settings save button click
        if (elements.settingsSaveBtn) {
            elements.settingsSaveBtn.addEventListener('click', handleSettingsSave);
        }

        // Provider change - update models and base URL
        if (elements.settingsProvider) {
            elements.settingsProvider.addEventListener('change', handleProviderChange);
        }

        // Custom provider input change
        if (elements.settingsCustomProvider) {
            elements.settingsCustomProvider.addEventListener('input', handleCustomProviderInput);
        }

        // Model change
        if (elements.settingsModel) {
            elements.settingsModel.addEventListener('change', handleModelChange);
        }

        // Custom model input change
        if (elements.settingsCustomModel) {
            elements.settingsCustomModel.addEventListener('input', handleCustomModelInput);
        }
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
        console.log('[AIUI] Handling conversation result:', result);
        
        if (!result) {
            showStatus('Received empty response from AI', 'error');
            return;
        }

        // Check for errors in result
        if (result.success === false) {
            const errorDetails = getDetailedErrorInfo(result);
            console.error('[AIUI] Conversation result error:', errorDetails);
            
            // Show detailed error message to user
            const errorMessage = errorDetails.userMessage || 'AI request failed';
            showStatus(errorMessage, 'error');
            
            // If there are technical details, also log them for debugging
            if (errorDetails.techDetails && errorDetails.techDetails.length > 0) {
                console.error('[AIUI] Technical details:', errorDetails.techDetails);
            }
            return;
        }

        // Success - render AI response
        if (result.type === 'text' && result.content) {
            addMessage('assistant', result.content);
        } else if (result.type === 'canvas' && result.canvasProcessed) {
            // Canvas action was performed - do NOT display JSON in chat
            // Instead, show a user-friendly message
            let successMessage = 'I have created the plan on the canvas.';
            
            // Include summary of what was created if data is available
            if (result.data && result.data.nodes) {
                const nodeCount = result.data.nodes.length;
                const edgeCount = result.data.edges ? result.data.edges.length : 0;
                successMessage = `I've created ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`;
                if (edgeCount > 0) {
                    successMessage += ` and ${edgeCount} connection${edgeCount !== 1 ? 's' : ''}`;
                }
                successMessage += ' on the canvas.';
            }
            
            addMessage('assistant', successMessage);
            
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

    // --- Get Detailed Error Info ---
    function getDetailedErrorInfo(result) {
        const errorInfo = {
            userMessage: 'An error occurred',
            techDetails: []
        };

        if (!result.errors || !Array.isArray(result.errors)) {
            return errorInfo;
        }

        const userMessages = [];
        const techDetails = [];

        for (const err of result.errors) {
            const code = err.code || 'UNKNOWN_ERROR';
            const message = err.message || 'Unknown error';
            const details = err.details || {};

            // Build user-friendly message based on error code
            let userMsg = message;
            
            switch (code) {
                case 'SCHEMA_VALIDATION_FAILED':
                    userMsg = 'The AI response had invalid data format. Some nodes or connections could not be created.';
                    break;
                case 'ACTION_PROCESSING_FAILED':
                    userMsg = 'Failed to update the canvas. Please try again.';
                    break;
                case 'AI_RESPONSE_FAILED':
                    userMsg = 'The AI service did not respond correctly.';
                    break;
                case 'INVALID_CANVAS_DATA':
                    userMsg = 'Could not understand the canvas data from the AI.';
                    break;
                case 'CANVAS_API_UNAVAILABLE':
                    userMsg = 'Canvas system is not ready. Please refresh the page.';
                    break;
                default:
                    // Keep original message for unknown errors
                    break;
            }

            userMessages.push(userMsg);
            techDetails.push(`${code}: ${message}`, details);
        }

        errorInfo.userMessage = userMessages.join(' ');
        errorInfo.techDetails = techDetails;

        return errorInfo;
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

    // --- Settings View Functions ---

    // --- Show Settings View ---
    function showSettingsView() {
        if (!elements.settingsView || !elements.panel) {
            return;
        }

        // Populate settings form with current values
        populateSettingsForm();

        // Show settings view, hide chat view
        elements.settingsView.setAttribute('aria-hidden', 'false');
        elements.panel.classList.add('ai-view-settings');
        isSettingsViewActive = true;

        // Focus provider selector
        if (elements.settingsProvider) {
            elements.settingsProvider.focus();
        }
    }

    // --- Hide Settings View ---
    function hideSettingsView() {
        if (!elements.settingsView || !elements.panel) {
            return;
        }

        // Hide settings view, show chat view
        elements.settingsView.setAttribute('aria-hidden', 'true');
        elements.panel.classList.remove('ai-view-settings');
        isSettingsViewActive = false;

        // Clear settings status
        if (elements.settingsStatus) {
            elements.settingsStatus.textContent = '';
            elements.settingsStatus.className = 'ai-settings-status';
        }

        // Focus input for next message
        if (elements.input) {
            elements.input.focus();
        }
    }

    // --- Populate Settings Form ---
    function populateSettingsForm() {
        if (typeof AISettings === 'undefined') {
            return;
        }

        const settings = AISettings.get();

        // Set provider
        if (elements.settingsProvider) {
            elements.settingsProvider.value = settings.provider || '';
        }

        // Set API key (masked - just show it's set)
        if (elements.settingsApiKey) {
            elements.settingsApiKey.value = settings.apiKey || '';
        }

        // Set base URL
        if (elements.settingsBaseUrl) {
            elements.settingsBaseUrl.value = settings.baseUrl || '';
        }

        // Set model
        if (elements.settingsModel) {
            elements.settingsModel.value = settings.model || '';
        }

        // Populate providers dropdown
        populateProvidersDropdown(settings.provider);

        // Populate models based on selected provider
        if (settings.provider) {
            populateModelsDropdown(settings.provider, settings.model);
        }

        // Update base URL field state based on provider
        if (settings.provider) {
            updateBaseUrlFieldState(settings.provider);
        }
    }

    // --- Populate Providers Dropdown ---
    function populateProvidersDropdown(selectedProvider) {
        if (!elements.settingsProvider || typeof AIProviders === 'undefined') {
            return;
        }

        const providers = AIProviders.getAll();
        
        // Clear existing options
        elements.settingsProvider.innerHTML = '<option value="">Select Provider</option>';

        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = provider.name;
            elements.settingsProvider.appendChild(option);
        });

        // Add "Custom Provider" option at the end
        const customOption = document.createElement('option');
        customOption.value = '__custom__';
        customOption.textContent = 'Custom Provider...';
        elements.settingsProvider.appendChild(customOption);

        // Restore selection - check if it's a predefined provider or custom
        if (selectedProvider) {
            if (AIProviders.exists(selectedProvider)) {
                elements.settingsProvider.value = selectedProvider;
                // Hide custom input since a predefined provider is selected
                setCustomProviderVisible(false);
            } else {
                // Custom provider - select "Custom Provider..." option and show input
                elements.settingsProvider.value = '__custom__';
                setCustomProviderVisible(true);
                if (elements.settingsCustomProvider) {
                    elements.settingsCustomProvider.value = selectedProvider;
                }
            }
        } else {
            setCustomProviderVisible(false);
        }
    }

    // --- Set Custom Provider Input Visibility ---
    function setCustomProviderVisible(visible) {
        if (!elements.settingsCustomProvider) {
            return;
        }
        if (visible) {
            elements.settingsCustomProvider.style.display = 'block';
            elements.settingsCustomProvider.setAttribute('aria-hidden', 'false');
        } else {
            elements.settingsCustomProvider.style.display = 'none';
            elements.settingsCustomProvider.setAttribute('aria-hidden', 'true');
        }
    }

    // --- Set Custom Model Input Visibility ---
    function setCustomModelInputVisible(visible) {
        if (!elements.settingsCustomModel) {
            return;
        }
        if (visible) {
            elements.settingsCustomModel.style.display = 'block';
            elements.settingsCustomModel.setAttribute('aria-hidden', 'false');
        } else {
            elements.settingsCustomModel.style.display = 'none';
            elements.settingsCustomModel.setAttribute('aria-hidden', 'true');
        }
    }

    // --- Populate Models Dropdown ---
    function populateModelsDropdown(providerId, selectedModel) {
        if (!elements.settingsModel || typeof AIProviders === 'undefined') {
            return;
        }

        const models = AIProviders.getSupportedModels(providerId);
        const supportsCustomModel = AIProviders.supportsCustomModel(providerId);

        // Clear existing options
        elements.settingsModel.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = supportsCustomModel ? 'Enter or select model' : 'Select Model';
        elements.settingsModel.appendChild(defaultOption);

        // Add predefined model options
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            elements.settingsModel.appendChild(option);
        });

        // Add "Custom Model" option if custom models are supported
        if (supportsCustomModel) {
            const customModelOption = document.createElement('option');
            customModelOption.value = '__custom__';
            customModelOption.textContent = 'Custom Model...';
            elements.settingsModel.appendChild(customModelOption);
        }

        // Restore selection - check if it's a predefined model or custom
        if (selectedModel) {
            if (models.includes(selectedModel)) {
                elements.settingsModel.value = selectedModel;
                setCustomModelInputVisible(false);
            } else {
                // Custom model - select "Custom Model..." option and show input
                elements.settingsModel.value = '__custom__';
                setCustomModelInputVisible(true);
                if (elements.settingsCustomModel) {
                    elements.settingsCustomModel.value = selectedModel;
                }
            }
        } else {
            setCustomModelInputVisible(false);
        }
    }

    // --- Update Base URL Field State ---
    function updateBaseUrlFieldState(providerId) {
        if (!elements.settingsBaseUrl || typeof AIProviders === 'undefined') {
            return;
        }

        const supportsCustomBaseUrl = AIProviders.supportsCustomBaseUrl(providerId);
        const defaultBaseUrl = AIProviders.getDefaultBaseUrl(providerId);

        if (!supportsCustomBaseUrl) {
            // Disable field and show default
            elements.settingsBaseUrl.disabled = true;
            elements.settingsBaseUrl.value = defaultBaseUrl;
            elements.settingsBaseUrl.placeholder = 'Set by provider';
        } else {
            // Enable field
            elements.settingsBaseUrl.disabled = false;
            // Only set default if currently empty
            if (!elements.settingsBaseUrl.value || elements.settingsBaseUrl.value === defaultBaseUrl) {
                elements.settingsBaseUrl.value = defaultBaseUrl;
            }
            elements.settingsBaseUrl.placeholder = 'https://...';
        }
    }

    // --- Handle Provider Change ---
    function handleProviderChange() {
        if (!elements.settingsProvider || typeof AIProviders === 'undefined') {
            return;
        }

        const providerId = elements.settingsProvider.value;

        if (!providerId) {
            // No provider selected - clear models and base URL
            if (elements.settingsModel) {
                elements.settingsModel.innerHTML = '<option value="">Select Model</option>';
            }
            if (elements.settingsBaseUrl) {
                elements.settingsBaseUrl.value = '';
                elements.settingsBaseUrl.disabled = false;
                elements.settingsBaseUrl.placeholder = 'https://...';
            }
            setCustomProviderVisible(false);
            setCustomModelInputVisible(false);
            return;
        }

        if (providerId === '__custom__') {
            // Custom provider selected - show custom input
            setCustomProviderVisible(true);
            // Clear models dropdown for custom provider
            if (elements.settingsModel) {
                elements.settingsModel.innerHTML = '<option value=\"\">Enter or select model</option><option value="__custom__">Custom Model...</option>';
            }
            // Enable base URL field for custom provider
            if (elements.settingsBaseUrl) {
                elements.settingsBaseUrl.disabled = false;
                elements.settingsBaseUrl.placeholder = 'https://...';
            }
            setCustomModelInputVisible(false);
        } else {
            // Predefined provider selected
            setCustomProviderVisible(false);
            // Update models dropdown
            populateModelsDropdown(providerId, '');
            // Update base URL field
            updateBaseUrlFieldState(providerId);
        }
    }

    // --- Handle Custom Provider Input ---
    function handleCustomProviderInput() {
        // Just track that user is typing - actual value is read on save
        // No special action needed here
    }

    // --- Handle Model Change ---
    function handleModelChange() {
        if (!elements.settingsModel) {
            return;
        }

        const modelValue = elements.settingsModel.value;

        if (modelValue === '__custom__') {
            // Custom model selected - show custom input
            setCustomModelInputVisible(true);
        } else {
            // Predefined model or empty selection
            setCustomModelInputVisible(false);
        }
    }

    // --- Handle Custom Model Input ---
    function handleCustomModelInput() {
        // Just track that user is typing - actual value is read on save
        // No special action needed here
    }

    // --- Handle New Chat ---
    function handleNewChat() {
        // Clear conversation history
        if (typeof AIConversation !== 'undefined' && typeof AIConversation.clearHistory === 'function') {
            AIConversation.clearHistory();
        }

        // Clear visible messages
        clearMessages();

        // Clear status
        if (elements.statusArea) {
            elements.statusArea.textContent = '';
            elements.statusArea.className = 'ai-status';
        }

        // Focus input
        if (elements.input) {
            elements.input.focus();
        }
    }

    // --- Handle Settings Save ---
    function handleSettingsSave() {
        if (typeof AISettings === 'undefined') {
            showSettingsStatus('Settings system not available', 'error');
            return;
        }

        // Read form values
        let provider = elements.settingsProvider ? elements.settingsProvider.value.trim() : '';
        const apiKey = elements.settingsApiKey ? elements.settingsApiKey.value : '';
        let baseUrl = elements.settingsBaseUrl ? elements.settingsBaseUrl.value.trim() : '';
        let model = elements.settingsModel ? elements.settingsModel.value.trim() : '';

        // Resolve custom provider value
        if (provider === '__custom__') {
            if (elements.settingsCustomProvider) {
                provider = elements.settingsCustomProvider.value.trim();
            }
        }

        // Resolve custom model value
        if (model === '__custom__') {
            if (elements.settingsCustomModel) {
                model = elements.settingsCustomModel.value.trim();
            }
        }

        // Validation for custom provider
        if (provider === '' || provider === '__custom__') {
            showSettingsStatus('Please enter a custom provider name or select a predefined provider', 'error');
            return;
        }

        // Validation for custom model
        if (model === '' || model === '__custom__') {
            showSettingsStatus('Please enter a custom model name or select a predefined model', 'error');
            return;
        }

        // Build settings object
        const settings = {
            provider: provider,
            apiKey: apiKey,
            baseUrl: baseUrl,
            model: model
        };

        // Validate and save
        const result = AISettings.save(settings);

        if (result.success) {
            showSettingsStatus('Settings saved successfully', 'success');
            
            // Wait briefly then return to chat view
            setTimeout(function() {
                hideSettingsView();
            }, 800);
        } else {
            // Display errors
            let errorMessage = 'Failed to save settings';
            if (result.errors && result.errors.length > 0) {
                const firstError = result.errors[0];
                if (firstError.message) {
                    errorMessage = firstError.message;
                } else if (typeof firstError === 'string') {
                    errorMessage = firstError;
                }
            }
            showSettingsStatus(errorMessage, 'error');

            // Also show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                const warningMessages = result.warnings.map(w => w.message || String(w)).join('; ');
                if (warningMessages) {
                    console.warn('AI Settings warnings:', warningMessages);
                }
            }
        }
    }

    // --- Show Settings Status ---
    function showSettingsStatus(message, type) {
        if (!elements.settingsStatus) {
            return;
        }

        if (!message || typeof message !== 'string') {
            elements.settingsStatus.textContent = '';
            elements.settingsStatus.className = 'ai-settings-status';
            return;
        }

        elements.settingsStatus.textContent = message;

        // Set status type class
        const validTypes = ['error', 'warning', 'success', 'info'];
        const statusType = validTypes.includes(type) ? type : 'info';
        elements.settingsStatus.className = 'ai-settings-status ai-settings-status-' + statusType;
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
