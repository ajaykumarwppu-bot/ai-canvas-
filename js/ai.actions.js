/**
 * AI Actions Module
 * 
 * Converts validated plans from AISchema into safe, structured application actions
 * and executes them through CanvasAPI.
 * 
 * Architecture:
 * Validated Plan → Create Action Objects → Execute Actions through CanvasAPI
 * 
 * This module does NOT:
 * - Call AI models
 * - Store API keys
 * - Make fetch requests
 * - Process audio
 * - Directly manipulate DOM
 */

const AIActions = (function() {
    "use strict";

    // --- Configuration ---
    const SUPPORTED_ACTION_TYPES = [
        'ADD_NODE',
        'ADD_EDGE',
        'UPDATE_NODE',
        'DELETE_NODE',
        'UPDATE_EDGE',
        'DELETE_EDGE'
    ];

    // Track which CanvasAPI methods are available
    function isCanvasAPIAvailable() {
        return typeof CanvasAPI !== 'undefined';
    }

    // Helper: Create error object
    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    // Helper: Create warning object
    function makeWarning(code, message) {
        return { code, message };
    }

    // --- Action Validation ---

    /**
     * Validate a single action structure
     * @param {Object} action - Action to validate
     * @returns {Object} Validation result
     */
    function validateAction(action) {
        const errors = [];

        // Check action exists
        if (!action || typeof action !== 'object') {
            return {
                valid: false,
                errors: [makeError('INVALID_ACTION', 'Action must be an object')]
            };
        }

        // Check type exists
        if (!action.type) {
            errors.push(makeError('MISSING_ACTION_TYPE', 'Action type is required'));
        } else if (typeof action.type !== 'string') {
            errors.push(makeError('INVALID_ACTION_TYPE', 'Action type must be a string'));
        } else if (!SUPPORTED_ACTION_TYPES.includes(action.type)) {
            errors.push(makeError('UNSUPPORTED_ACTION_TYPE', 
                `Action type '${action.type}' is not supported. Supported: ${SUPPORTED_ACTION_TYPES.join(', ')}`));
        }

        // Check payload exists
        if (!action.payload) {
            errors.push(makeError('MISSING_PAYLOAD', 'Action payload is required'));
        } else if (typeof action.payload !== 'object') {
            errors.push(makeError('INVALID_PAYLOAD', 'Payload must be an object'));
        } else {
            // Type-specific validation
            const payloadErrors = validatePayload(action.type, action.payload);
            errors.push(...payloadErrors);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate action payload based on action type
     * @param {string} actionType - Type of action
     * @param {Object} payload - Payload to validate
     * @returns {Array} Array of errors
     */
    function validatePayload(actionType, payload) {
        const errors = [];

        switch (actionType) {
            case 'ADD_NODE':
            case 'UPDATE_NODE':
                // Node requires id and text
                if (!payload.id || typeof payload.id !== 'string') {
                    errors.push(makeError('INVALID_NODE_ID', 'Node ID is required and must be a string'));
                }
                if (typeof payload.text === 'undefined') {
                    errors.push(makeError('MISSING_NODE_TEXT', 'Node text is required'));
                }
                break;

            case 'DELETE_NODE':
                if (!payload.id || typeof payload.id !== 'string') {
                    errors.push(makeError('INVALID_NODE_ID', 'Node ID is required for deletion'));
                }
                break;

            case 'ADD_EDGE':
                // Edge requires from and to
                if (!payload.from || typeof payload.from !== 'string') {
                    errors.push(makeError('INVALID_EDGE_SOURCE', 'Edge source (from) is required'));
                }
                if (!payload.to || typeof payload.to !== 'string') {
                    errors.push(makeError('INVALID_EDGE_TARGET', 'Edge target (to) is required'));
                }
                break;

            case 'UPDATE_EDGE':
            case 'DELETE_EDGE':
                if (!payload.id || typeof payload.id !== 'string') {
                    errors.push(makeError('INVALID_EDGE_ID', 'Edge ID is required'));
                }
                break;
        }

        return errors;
    }

    /**
     * Validate that referenced node IDs exist in canvas
     * @param {string} nodeId - Node ID to check
     * @param {Array} existingNodes - Array of existing node IDs
     * @returns {boolean} True if node exists
     */
    function nodeExists(nodeId, existingNodes) {
        return existingNodes.includes(nodeId);
    }

    // --- Action Creation ---

    /**
     * Convert a validated plan into ordered actions
     * Nodes are created before edges
     * @param {Object} validatedPlan - Plan from AISchema.process()
     * @returns {Object} Result with actions or errors
     */
    function createActions(validatedPlan) {
        const actions = [];
        const errors = [];
        const warnings = [];

        if (!validatedPlan || !validatedPlan.success || !validatedPlan.data) {
            return {
                success: false,
                actions: [],
                errors: [makeError('INVALID_PLAN', 'Validated plan is missing or invalid')],
                warnings: []
            };
        }

        const plan = validatedPlan.data;

        // Check nodes array
        if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) {
            warnings.push(makeWarning('NO_NODES', 'Plan contains no nodes'));
        }

        // Create ADD_NODE actions first
        plan.nodes.forEach(node => {
            actions.push({
                type: 'ADD_NODE',
                payload: {
                    id: node.id,
                    text: node.text,
                    x: node.x,
                    y: node.y,
                    w: node.width,
                    h: node.height,
                    color: node.color
                }
            });
        });

        // Then create ADD_EDGE actions
        if (Array.isArray(plan.edges)) {
            plan.edges.forEach(edge => {
                actions.push({
                    type: 'ADD_EDGE',
                    payload: {
                        from: edge.from,
                        to: edge.to,
                        text: edge.text,
                        color: edge.color,
                        fromSide: edge.fromSide,
                        toSide: edge.toSide,
                        direction: edge.direction
                    }
                });
            });
        }

        return {
            success: true,
            actions,
            errors,
            warnings
        };
    }

    /**
     * Convert action to CanvasAPI-compatible format
     * @param {Object} action - Internal action
     * @returns {Object} CanvasAPI operation
     */
    function actionToOperation(action) {
        const operation = {
            type: action.type,
            data: {}
        };

        switch (action.type) {
            case 'ADD_NODE':
                operation.data = {
                    id: action.payload.id,
                    text: action.payload.text,
                    x: action.payload.x,
                    y: action.payload.y,
                    w: action.payload.w,
                    h: action.payload.h,
                    color: action.payload.color
                };
                break;

            case 'ADD_EDGE':
                operation.data = {
                    fromNode: action.payload.from,
                    toNode: action.payload.to,
                    text: action.payload.text || '',
                    color: action.payload.color || '#888',
                    fromSide: action.payload.fromSide || 'e',
                    toSide: action.payload.toSide || 'w',
                    direction: action.payload.direction || 'forward'
                };
                break;

            case 'UPDATE_NODE':
                operation.data = {
                    id: action.payload.id,
                    changes: action.payload.changes || {}
                };
                break;

            case 'DELETE_NODE':
                operation.data = {
                    id: action.payload.id
                };
                break;

            case 'UPDATE_EDGE':
                operation.data = {
                    id: action.payload.id,
                    changes: action.payload.changes || {}
                };
                break;

            case 'DELETE_EDGE':
                operation.data = {
                    id: action.payload.id
                };
                break;
        }

        return operation;
    }

    // --- Execution ---

    /**
     * Execute a single action through CanvasAPI
     * @param {Object} action - Action to execute
     * @param {Array} existingNodeIds - List of existing node IDs for reference validation
     * @param {Array} newlyCreatedNodeIds - List of node IDs created in this batch
     * @returns {Object} Execution result
     */
    function executeAction(action, existingNodeIds, newlyCreatedNodeIds = []) {
        if (!isCanvasAPIAvailable()) {
            return {
                success: false,
                error: 'CanvasAPI not available'
            };
        }

        // Combine existing and newly created node IDs for validation
        const allAvailableNodeIds = [...existingNodeIds, ...newlyCreatedNodeIds];

        // For ADD_EDGE, verify referenced nodes exist (including newly created ones)
        if (action.type === 'ADD_EDGE') {
            if (!allAvailableNodeIds.includes(action.payload.from)) {
                return {
                    success: false,
                    error: `Source node '${action.payload.from}' does not exist`
                };
            }
            if (!allAvailableNodeIds.includes(action.payload.to)) {
                return {
                    success: false,
                    error: `Target node '${action.payload.to}' does not exist`
                };
            }
        }

        // Convert to CanvasAPI operation
        const operation = actionToOperation(action);

        // Execute through CanvasAPI.applyBatch with single operation
        const result = CanvasAPI.applyBatch([operation]);

        return result;
    }

    /**
     * Execute multiple actions in order
     * Stops on first failure
     * @param {Array} actions - Actions to execute
     * @returns {Object} Execution results
     */
    function execute(actions) {
        if (!isCanvasAPIAvailable()) {
            return {
                success: false,
                actions: actions || [],
                results: [],
                errors: [makeError('CANVAS_API_UNAVAILABLE', 'CanvasAPI is not available')],
                warnings: []
            };
        }

        if (!Array.isArray(actions) || actions.length === 0) {
            return {
                success: false,
                actions: [],
                results: [],
                errors: [makeError('NO_ACTIONS', 'No actions to execute')],
                warnings: []
            };
        }

        const results = [];
        const errors = [];
        const warnings = [];
        const executedActions = [];
        const newlyCreatedNodeIds = []; // Track nodes created in this batch

        // Get current state to track existing nodes
        const currentState = CanvasAPI.getState();
        let existingNodeIds = currentState.nodes.map(n => n.id);

        // Execute actions in order
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];

            // Validate action first
            const validation = validateAction(action);
            if (!validation.valid) {
                const result = {
                    index: i,
                    action: action,
                    success: false,
                    errors: validation.errors
                };
                results.push(result);
                errors.push(...validation.errors.map(e => ({
                    ...e,
                    actionIndex: i,
                    actionType: action.type
                })));
                // Stop execution on validation failure
                return {
                    success: false,
                    actions: executedActions,
                    results,
                    errors,
                    warnings
                };
            }

            // Execute the action - pass both existing and newly created node IDs
            const execResult = executeAction(action, existingNodeIds, newlyCreatedNodeIds);

            const result = {
                index: i,
                action: action,
                success: execResult.success,
                data: execResult.node || execResult.edge || execResult.added || null
            };

            if (!execResult.success) {
                result.error = execResult.error || 'Unknown error';
                errors.push(makeError('ACTION_EXECUTION_FAILED', 
                    `Action ${i} (${action.type}) failed: ${result.error}`,
                    { actionIndex: i, actionType: action.type }
                ));
                results.push(result);
                // Stop execution on failure to avoid corrupted state
                return {
                    success: false,
                    actions: executedActions,
                    results,
                    errors,
                    warnings
                };
            }

            // Track successful execution
            executedActions.push(action);
            results.push(result);

            // Track newly created node IDs for edge validation within same batch
            if (action.type === 'ADD_NODE' && action.payload.id) {
                newlyCreatedNodeIds.push(action.payload.id);
            }
        }

        return {
            success: true,
            actions: executedActions,
            results,
            errors,
            warnings
        };
    }

    /**
     * Main processing method: validates plan, creates actions, executes them
     * @param {Object} validatedPlan - Plan from AISchema.process()
     * @returns {Object} Processing result
     */
    function process(validatedPlan) {
        // Step 1: Create actions from validated plan
        const createActionResult = createActions(validatedPlan);

        if (!createActionResult.success) {
            return {
                success: false,
                actions: [],
                results: [],
                errors: createActionResult.errors,
                warnings: createActionResult.warnings
            };
        }

        // Step 2: Apply layout if available and nodes don't have positions
        const actions = createActionResult.actions;
        const needsLayout = actions.some(a => 
            a.type === 'ADD_NODE' && 
            (a.payload.x === undefined || a.payload.y === undefined)
        );

        if (needsLayout && typeof CanvasLayout !== 'undefined') {
            // Extract graph for layout
            const graph = {
                nodes: validatedPlan.data.nodes.map(n => ({
                    id: n.id,
                    text: n.text,
                    width: n.width,
                    height: n.height
                })),
                edges: validatedPlan.data.edges || []
            };

            const layoutResult = CanvasLayout.layout(graph);

            if (layoutResult.success) {
                // Create position map
                const positionMap = {};
                layoutResult.nodes.forEach(node => {
                    positionMap[node.id] = { x: node.x, y: node.y };
                });

                // Apply positions to ADD_NODE actions
                actions.forEach(action => {
                    if (action.type === 'ADD_NODE' && positionMap[action.payload.id]) {
                        action.payload.x = positionMap[action.payload.id].x;
                        action.payload.y = positionMap[action.payload.id].y;
                    }
                });
            } else {
                // Layout failed, add warnings but continue
                createActionResult.warnings.push(
                    makeWarning('LAYOUT_FAILED', 'Layout calculation failed, using default positions')
                );
            }
        } else if (needsLayout) {
            // No layout engine available
            createActionResult.warnings.push(
                makeWarning('NO_LAYOUT_ENGINE', 'CanvasLayout not available, nodes will use default positions')
            );
        }

        // Step 3: Execute actions
        const execResult = execute(actions);

        return {
            success: execResult.success,
            actions: execResult.actions,
            results: execResult.results,
            errors: execResult.errors,
            warnings: [...createActionResult.warnings, ...execResult.warnings]
        };
    }

    // --- Public API ---
    return {
        /**
         * Create actions from a validated plan
         * @param {Object} validatedPlan - Output from AISchema.process()
         * @returns {Object} { success, actions, errors, warnings }
         */
        createActions: createActions,

        /**
         * Validate a single action
         * @param {Object} action - Action to validate
         * @returns {Object} { valid, errors }
         */
        validateAction: validateAction,

        /**
         * Execute an array of actions
         * @param {Array} actions - Actions to execute
         * @returns {Object} { success, actions, results, errors, warnings }
         */
        execute: execute,

        /**
         * Main processing method: plan -> actions -> execution
         * @param {Object} validatedPlan - Output from AISchema.process()
         * @returns {Object} { success, actions, results, errors, warnings }
         */
        process: process,

        /**
         * Get list of supported action types
         * @returns {Array} Array of supported action type strings
         */
        getSupportedActionTypes: () => [...SUPPORTED_ACTION_TYPES],

        /**
         * Check if CanvasAPI is available
         * @returns {boolean} True if CanvasAPI is available
         */
        isCanvasAPIAvailable: isCanvasAPIAvailable
    };

})();
