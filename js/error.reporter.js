/**
 * Error Reporter Module
 * 
 * Centralized error reporting system for the AI-to-Canvas pipeline.
 * Provides clear, actionable error messages when problems occur.
 * 
 * Features:
 * - Collects errors from all pipeline stages
 * - Displays user-friendly error messages in the UI
 * - Logs detailed technical information to console
 * - Tracks error history for debugging
 */

(function(global) {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        MAX_ERROR_HISTORY: 50,
        SHOW_TECHNICAL_DETAILS: false // Set to true for debugging
    };

    // --- State ---
    let errorHistory = [];
    let isInitialized = false;
    let elements = {};

    // --- Error Severity Levels ---
    const SEVERITY = {
        CRITICAL: 'critical',  // Pipeline broken, action failed
        ERROR: 'error',        // Action failed but recoverable
        WARNING: 'warning',    // Non-fatal issue
        INFO: 'info'          // Informational message
    };

    // --- Pipeline Stages ---
    const STAGE = {
        UI_INPUT: 'UI Input',
        CONVERSATION: 'Conversation',
        CONTEXT_BUILD: 'Context Building',
        AI_REQUEST: 'AI Request',
        RESPONSE_PARSE: 'Response Parsing',
        CANVAS_DETECT: 'Canvas Detection',
        SCHEMA_VALIDATE: 'Schema Validation',
        ACTION_CREATE: 'Action Creation',
        ACTION_EXECUTE: 'Action Execution',
        CANVAS_UPDATE: 'Canvas Update',
        UI_DISPLAY: 'UI Display'
    };

    // --- Helper: Create error object ---
    function createError(stage, severity, code, message, details = {}) {
        return {
            id: 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            stage: stage,
            severity: severity,
            code: code,
            message: message,
            details: details,
            stack: details.stack || (details.originalError ? details.originalError.stack : null)
        };
    }

    // --- Helper: Get user-friendly message ---
    function getUserMessage(error) {
        const messages = {
            'CANVAS_API_UNAVAILABLE': 'Canvas system is not ready. Please refresh the page.',
            'INVALID_JSON': 'The AI response could not be understood. Please try again.',
            'SCHEMA_VALIDATION_FAILED': 'The AI response format was invalid. The request may have been misunderstood.',
            'ACTION_EXECUTION_FAILED': 'Failed to apply changes to the canvas. Some actions may not have completed.',
            'NODE_LIMIT_EXCEEDED': 'Too many nodes requested. Please reduce the complexity of your request.',
            'BROKEN_EDGE_SOURCE': 'An edge references a node that does not exist.',
            'BROKEN_EDGE_TARGET': 'An edge references a node that does not exist.',
            'AI_RESPONSE_FAILED': 'The AI service did not respond. Please check your connection and settings.',
            'AUTHENTICATION_FAILED': 'Authentication failed. Please check your API key in settings.',
            'NETWORK_ERROR': 'Network error. Please check your internet connection.',
            'TIMEOUT': 'The request took too long. Please try again or reduce the complexity.'
        };

        if (messages[error.code]) {
            return messages[error.code];
        }

        // Generic message based on stage
        const stageMessages = {
            [STAGE.UI_INPUT]: 'There was a problem with your input.',
            [STAGE.CONVERSATION]: 'Failed to process your conversation request.',
            [STAGE.CONTEXT_BUILD]: 'Failed to read the current canvas state.',
            [STAGE.AI_REQUEST]: 'Failed to communicate with the AI service.',
            [STAGE.RESPONSE_PARSE]: 'Could not parse the AI response.',
            [STAGE.CANVAS_DETECT]: 'Could not determine if the response contains canvas data.',
            [STAGE.SCHEMA_VALIDATE]: 'The response format was invalid.',
            [STAGE.ACTION_CREATE]: 'Failed to create canvas actions from the response.',
            [STAGE.ACTION_EXECUTE]: 'Failed to execute canvas actions.',
            [STAGE.CANVAS_UPDATE]: 'Failed to update the canvas.',
            [STAGE.UI_DISPLAY]: 'Failed to display the response.'
        };

        return stageMessages[error.stage] || 'An unexpected error occurred.';
    }

    // --- Cache DOM Elements ---
    function cacheElements() {
        elements = {
            errorPanel: document.getElementById('pipeline-error-panel'),
            errorList: document.getElementById('pipeline-error-list'),
            errorCloseBtn: document.getElementById('pipeline-error-close-btn'),
            aiStatus: document.getElementById('ai-status')
        };
        return Object.values(elements).every(el => el !== null && el !== undefined);
    }

    // --- Initialize Error Reporter ---
    function init() {
        if (isInitialized) {
            return;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function onReady() {
                document.removeEventListener('DOMContentLoaded', onReady);
                initInternal();
            });
            return;
        }

        initInternal();
    }

    function initInternal() {
        if (!cacheElements()) {
            // Elements not found - will use console only
            console.warn('ErrorReporter: Some DOM elements not found. Using console-only mode.');
        }

        // Attach close button handler
        if (elements.errorCloseBtn) {
            elements.errorCloseBtn.addEventListener('click', hideErrorPanel);
        }

        isInitialized = true;
    }

    // --- Report Error ---
    function report(stage, severity, code, message, details = {}) {
        const error = createError(stage, severity, code, message, details);

        // Add to history
        errorHistory.push(error);
        if (errorHistory.length > CONFIG.MAX_ERROR_HISTORY) {
            errorHistory.shift();
        }

        // Log to console with full details
        logToConsole(error);

        // Show in UI for critical/error severity
        if (severity === SEVERITY.CRITICAL || severity === SEVERITY.ERROR) {
            showInUI(error);
        }

        // Trigger custom event for other modules to listen
        window.dispatchEvent(new CustomEvent('pipeline:error', { detail: error }));

        return error;
    }

    // --- Log to Console ---
    function logToConsole(error) {
        const prefix = `[Pipeline Error][${error.stage}]`;
        const color = getSeverityColor(error.severity);

        console.groupCollapsed(`%c${prefix} ${error.code}`, `color: ${color}; font-weight: bold;`);
        console.log('Timestamp:', error.timestamp);
        console.log('Severity:', error.severity);
        console.log('Message:', error.message);
        console.log('Details:', error.details);
        if (error.stack) {
            console.log('Stack:', error.stack);
        }
        console.groupEnd();
    }

    function getSeverityColor(severity) {
        switch (severity) {
            case SEVERITY.CRITICAL: return '#dc3545';
            case SEVERITY.ERROR: return '#fd7e14';
            case SEVERITY.WARNING: return '#ffc107';
            case SEVERITY.INFO: return '#17a2b8';
            default: return '#6c757d';
        }
    }

    // --- Show in UI ---
    function showInUI(error) {
        const userMessage = getUserMessage(error);

        // Show in AI status area if available
        if (elements.aiStatus) {
            elements.aiStatus.textContent = userMessage;
            elements.aiStatus.className = `ai-status ai-status-${error.severity === SEVERITY.WARNING ? 'warning' : 'error'}`;

            // Auto-clear after 10 seconds for non-critical errors
            if (error.severity !== SEVERITY.CRITICAL) {
                setTimeout(() => {
                    if (elements.aiStatus && elements.aiStatus.textContent === userMessage) {
                        elements.aiStatus.textContent = '';
                        elements.aiStatus.className = 'ai-status';
                    }
                }, 10000);
            }
        }

        // Show in error panel for critical errors
        if (error.severity === SEVERITY.CRITICAL && elements.errorPanel) {
            addErrorToPanel(error, userMessage);
            showErrorPanel();
        }
    }

    // --- Add Error to Panel ---
    function addErrorToPanel(error, userMessage) {
        if (!elements.errorList) return;

        const errorItem = document.createElement('div');
        errorItem.className = 'pipeline-error-item';
        errorItem.setAttribute('data-error-id', error.id);

        const header = document.createElement('div');
        header.className = 'pipeline-error-header';
        header.innerHTML = `
            <span class="pipeline-error-stage">${escapeHtml(error.stage)}</span>
            <span class="pipeline-error-code">${escapeHtml(error.code)}</span>
        `;

        const message = document.createElement('div');
        message.className = 'pipeline-error-message';
        message.textContent = userMessage;

        const details = document.createElement('div');
        details.className = 'pipeline-error-details';
        details.innerHTML = `
            <strong>Technical Details:</strong><br>
            <code>${escapeHtml(JSON.stringify(error.details, null, 2))}</code>
        `;
        details.style.display = 'none';

        // Toggle details on click
        header.addEventListener('click', () => {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });

        errorItem.appendChild(header);
        errorItem.appendChild(message);
        errorItem.appendChild(details);

        // Insert at top
        elements.errorList.insertBefore(errorItem, elements.errorList.firstChild);
    }

    // --- Show/Hide Error Panel ---
    function showErrorPanel() {
        if (elements.errorPanel) {
            elements.errorPanel.style.display = 'block';
        }
    }

    function hideErrorPanel() {
        if (elements.errorPanel) {
            elements.errorPanel.style.display = 'none';
        }
    }

    // --- Clear Errors ---
    function clearErrors() {
        errorHistory = [];
        if (elements.errorList) {
            elements.errorList.innerHTML = '';
        }
        if (elements.aiStatus) {
            elements.aiStatus.textContent = '';
            elements.aiStatus.className = 'ai-status';
        }
        hideErrorPanel();
    }

    // --- Get Error History ---
    function getHistory() {
        return [...errorHistory];
    }

    // --- Get Errors by Stage ---
    function getErrorsByStage(stage) {
        return errorHistory.filter(e => e.stage === stage);
    }

    // --- Get Recent Errors ---
    function getRecentErrors(count = 10) {
        return errorHistory.slice(-count);
    }

    // --- Helper: Escape HTML ---
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Convenience Methods for Common Errors ---
    function reportCritical(stage, code, message, details) {
        return report(stage, SEVERITY.CRITICAL, code, message, details);
    }

    function reportError(stage, code, message, details) {
        return report(stage, SEVERITY.ERROR, code, message, details);
    }

    function reportWarning(stage, code, message, details) {
        return report(stage, SEVERITY.WARNING, code, message, details);
    }

    // --- Public API ---
    const ErrorReporter = {
        init: init,
        report: report,
        reportCritical: reportCritical,
        reportError: reportError,
        reportWarning: reportWarning,
        clearErrors: clearErrors,
        getHistory: getHistory,
        getErrorsByStage: getErrorsByStage,
        getRecentErrors: getRecentErrors,
        hidePanel: hideErrorPanel,
        SEVERITY: SEVERITY,
        STAGE: STAGE
    };

    // Expose to global scope
    global.ErrorReporter = ErrorReporter;

})(typeof window !== 'undefined' ? window : this);
