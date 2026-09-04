/**
 * AI Context Module
 * 
 * Prepares relevant context for future AI requests.
 * 
 * Responsibilities:
 * - Read current Canvas state through public APIs (CanvasAPI)
 * - Collect and organize information about nodes, edges, and metadata
 * - Support different context modes (full, selected, summary-only)
 * - Implement size limits to prevent excessively large contexts
 * - Return structured context objects for use by AIClient
 * 
 * This module does NOT:
 * - Call fetch or send API requests
 * - Modify the Canvas (read-only)
 * - Execute AI actions
 * - Create UI elements
 * - Store API keys
 */

(function(global) {
    'use strict';

    // --- Configuration & Limits ---
    const CONFIG = {
        MAX_NODES: 100,           // Maximum nodes to include in full context
        MAX_CONNECTIONS: 200,     // Maximum edges to include
        MAX_CONTENT_LENGTH: 500,  // Maximum text length per node
        MAX_TOTAL_SIZE: 50000,    // Maximum total characters in context
        DEFAULT_MODE: 'full'      // Default context building mode
    };

    // --- Error Codes ---
    const ERROR_CODES = {
        CANVAS_UNAVAILABLE: 'CANVAS_UNAVAILABLE',
        INVALID_CONTEXT_OPTIONS: 'INVALID_CONTEXT_OPTIONS',
        CONTEXT_BUILD_FAILED: 'CONTEXT_BUILD_FAILED',
        CONTEXT_SIZE_EXCEEDED: 'CONTEXT_SIZE_EXCEEDED'
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
        if (typeof CanvasAPI === 'undefined') missing.push('CanvasAPI');
        return missing;
    }

    // --- Helper: Truncate text safely ---
    function truncateText(text, maxLength) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }

    // --- Helper: Safely convert value to string ---
    function safeToString(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return String(value);
        } catch (e) {
            return '';
        }
    }

    // --- Helper: Estimate context size ---
    function estimateContextSize(context) {
        let size = 0;
        try {
            size += JSON.stringify(context).length;
        } catch (e) {
            return Infinity;
        }
        return size;
    }

    // --- Get Canvas State ---
    function getCanvasState() {
        if (typeof CanvasAPI === 'undefined') {
            return {
                success: false,
                nodes: [],
                edges: [],
                errors: [makeError(
                    ERROR_CODES.CANVAS_UNAVAILABLE,
                    'CanvasAPI not available'
                )]
            };
        }

        try {
            const state = CanvasAPI.getState();
            return {
                success: true,
                nodes: state.nodes || [],
                edges: state.edges || [],
                errors: []
            };
        } catch (e) {
            return {
                success: false,
                nodes: [],
                edges: [],
                errors: [makeError(
                    ERROR_CODES.CONTEXT_BUILD_FAILED,
                    'Failed to read Canvas state: ' + e.message
                )]
            };
        }
    }

    // --- Get Selection State ---
    function getSelectionState() {
        // Try to get selection from window.selection (set by canvas.js)
        if (typeof window !== 'undefined' && window.selection) {
            return {
                nodes: (window.selection.nodes || []).map(n => n.id),
                edges: (window.selection.edges || []).map(e => e.id)
            };
        }
        
        // No selection available
        return {
            nodes: [],
            edges: []
        };
    }

    // --- Build Node Context ---
    function buildNodeContext(node, options) {
        const includeContent = options.includeContent !== false;
        const maxContentLength = options.maxContentLength || CONFIG.MAX_CONTENT_LENGTH;

        const nodeContext = {
            id: node.id || '',
            title: node.text ? truncateText(safeToString(node.text), maxContentLength) : '',
            type: node.type || 'default'
        };

        // Include position if useful for layout understanding
        if (typeof node.x === 'number' && typeof node.y === 'number') {
            nodeContext.position = {
                x: node.x,
                y: node.y
            };
        }

        // Include dimensions if available
        if (typeof node.w === 'number' && typeof node.h === 'number') {
            nodeContext.size = {
                w: node.w,
                h: node.h
            };
        }

        // Include tags if available
        if (Array.isArray(node.tags) && node.tags.length > 0) {
            nodeContext.tags = [...node.tags];
        }

        // Include color if available
        if (node.color) {
            nodeContext.color = node.color;
        }

        return nodeContext;
    }

    // --- Build Edge/Connection Context ---
    function buildEdgeContext(edge, options) {
        const connectionContext = {
            id: edge.id || '',
            from: edge.fromNode || '',
            to: edge.toNode || ''
        };

        // Include label if present
        if (edge.text && typeof edge.text === 'string' && edge.text.trim() !== '') {
            connectionContext.label = truncateText(edge.text, CONFIG.MAX_CONTENT_LENGTH);
        }

        // Include direction info if available
        if (edge.fromSide) {
            connectionContext.fromSide = edge.fromSide;
        }
        if (edge.toSide) {
            connectionContext.toSide = edge.toSide;
        }

        return connectionContext;
    }

    // --- Get Canvas Context ---
    function getCanvasContext(options = {}) {
        const result = {
            success: false,
            context: {
                nodes: [],
                connections: [],
                metadata: {}
            },
            warnings: [],
            errors: []
        };

        // Validate options
        const validatedOptions = validateOptions(options);
        if (!validatedOptions.valid) {
            result.errors = validatedOptions.errors;
            return result;
        }

        const opts = validatedOptions.options;

        // Get Canvas state
        const stateResult = getCanvasState();
        if (!stateResult.success) {
            result.errors = stateResult.errors;
            return result;
        }

        const nodes = stateResult.nodes;
        const edges = stateResult.edges;

        // Handle empty Canvas
        if (nodes.length === 0 && edges.length === 0) {
            result.success = true;
            result.context.metadata = {
                isEmpty: true,
                nodeCount: 0,
                connectionCount: 0,
                mode: opts.mode
            };
            return result;
        }

        // Determine which nodes to include based on mode and selection
        let nodesToInclude = nodes;
        let edgesToInclude = edges;

        if (opts.mode === 'selected' || opts.mode === 'focus') {
            const selection = getSelectionState();
            
            if (selection.nodes.length > 0) {
                const selectedNodeIds = new Set(selection.nodes);
                
                // Include selected nodes
                nodesToInclude = nodes.filter(n => selectedNodeIds.has(n.id));
                
                // If includeConnections is true, include edges connected to selected nodes
                if (opts.includeConnections) {
                    edgesToInclude = edges.filter(e => 
                        selectedNodeIds.has(e.fromNode) || selectedNodeIds.has(e.toNode)
                    );
                } else {
                    edgesToInclude = [];
                }
            } else {
                // No selection - fall back to empty or first few nodes
                nodesToInclude = [];
                edgesToInclude = [];
                result.warnings.push(makeWarning(
                    'NO_SELECTION',
                    'No nodes selected, returning empty context'
                ));
            }
        }

        // Apply limits
        const originalNodeCount = nodesToInclude.length;
        const originalEdgeCount = edgesToInclude.length;

        if (nodesToInclude.length > opts.maxItems) {
            nodesToInclude = nodesToInclude.slice(0, opts.maxItems);
            result.warnings.push(makeWarning(
                'NODE_LIMIT_APPLIED',
                `Limited nodes from ${originalNodeCount} to ${opts.maxItems}`
            ));
        }

        if (edgesToInclude.length > CONFIG.MAX_CONNECTIONS) {
            edgesToInclude = edgesToInclude.slice(0, CONFIG.MAX_CONNECTIONS);
            result.warnings.push(makeWarning(
                'CONNECTION_LIMIT_APPLIED',
                `Limited connections from ${originalEdgeCount} to ${CONFIG.MAX_CONNECTIONS}`
            ));
        }

        // Build context arrays
        result.context.nodes = nodesToInclude.map(node => 
            buildNodeContext(node, opts)
        );

        result.context.connections = edgesToInclude.map(edge => 
            buildEdgeContext(edge, opts)
        );

        // Build metadata
        result.context.metadata = {
            isEmpty: false,
            nodeCount: nodes.length,
            includedNodeCount: result.context.nodes.length,
            connectionCount: edges.length,
            includedConnectionCount: result.context.connections.length,
            mode: opts.mode,
            hasPartialData: result.context.nodes.length < nodes.length || 
                           result.context.connections.length < edges.length
        };

        // Check total size limit
        const estimatedSize = estimateContextSize(result.context);
        if (estimatedSize > CONFIG.MAX_TOTAL_SIZE) {
            result.warnings.push(makeWarning(
                'CONTEXT_SIZE_WARNING',
                `Context size (${estimatedSize} chars) may be large for AI requests`
            ));
        }

        result.success = true;
        return result;
    }

    // --- Validate Options ---
    function validateOptions(options) {
        const result = {
            valid: true,
            options: {
                mode: CONFIG.DEFAULT_MODE,
                selectedNodeIds: [],
                includeConnections: true,
                includeContent: true,
                maxContentLength: CONFIG.MAX_CONTENT_LENGTH,
                maxItems: CONFIG.MAX_NODES
            },
            errors: []
        };

        if (!options || typeof options !== 'object') {
            // Use defaults
            return result;
        }

        // Validate mode
        if (options.mode !== undefined) {
            const validModes = ['full', 'selected', 'focus', 'summary'];
            if (!validModes.includes(options.mode)) {
                result.errors.push(makeError(
                    ERROR_CODES.INVALID_CONTEXT_OPTIONS,
                    `Invalid mode '${options.mode}'. Valid modes: ${validModes.join(', ')}`
                ));
                result.valid = false;
            } else {
                result.options.mode = options.mode;
            }
        }

        // Validate selectedNodeIds
        if (options.selectedNodeIds !== undefined) {
            if (!Array.isArray(options.selectedNodeIds)) {
                result.errors.push(makeError(
                    ERROR_CODES.INVALID_CONTEXT_OPTIONS,
                    'selectedNodeIds must be an array'
                ));
                result.valid = false;
            } else {
                result.options.selectedNodeIds = options.selectedNodeIds;
            }
        }

        // Validate boolean options
        if (typeof options.includeConnections === 'boolean') {
            result.options.includeConnections = options.includeConnections;
        }

        if (typeof options.includeContent === 'boolean') {
            result.options.includeContent = options.includeContent;
        }

        // Validate numeric limits
        if (typeof options.maxContentLength === 'number' && options.maxContentLength > 0) {
            result.options.maxContentLength = Math.min(options.maxContentLength, 2000);
        }

        if (typeof options.maxItems === 'number' && options.maxItems > 0) {
            result.options.maxItems = Math.min(options.maxItems, CONFIG.MAX_NODES);
        }

        return result;
    }

    // --- Build Summary ---
    function getSummary(options = {}) {
        const result = {
            success: false,
            summary: {
                nodeCount: 0,
                connectionCount: 0,
                isEmpty: true,
                titles: [],
                structure: 'empty'
            },
            warnings: [],
            errors: []
        };

        // Get Canvas state
        const stateResult = getCanvasState();
        if (!stateResult.success) {
            result.errors = stateResult.errors;
            return result;
        }

        const nodes = stateResult.nodes;
        const edges = stateResult.edges;

        // Basic counts
        result.summary.nodeCount = nodes.length;
        result.summary.connectionCount = edges.length;
        result.summary.isEmpty = nodes.length === 0;

        // Determine structure type
        if (nodes.length > 0) {
            if (edges.length === 0) {
                result.summary.structure = 'isolated';
            } else if (edges.length >= nodes.length - 1) {
                result.summary.structure = 'connected';
            } else {
                result.summary.structure = 'partial';
            }
        }

        // Include node titles (limited)
        const maxTitles = options.maxTitles || 10;
        result.summary.titles = nodes
            .slice(0, maxTitles)
            .map(n => {
                if (n.text && typeof n.text === 'string') {
                    return truncateText(n.text, 50);
                }
                return '';
            })
            .filter(t => t !== '');

        if (nodes.length > maxTitles) {
            result.warnings.push(makeWarning(
                'TITLE_LIMIT_APPLIED',
                `Limited titles to ${maxTitles} of ${nodes.length} nodes`
            ));
        }

        // Add high-level metadata
        result.summary.metadata = {
            hasCycles: detectCycles(nodes, edges),
            rootCount: countRoots(nodes, edges),
            leafCount: countLeaves(nodes, edges)
        };

        result.success = true;
        return result;
    }

    // --- Detect Cycles (simple check) ---
    function detectCycles(nodes, edges) {
        if (nodes.length === 0 || edges.length === 0) {
            return false;
        }

        // Build adjacency list
        const adj = {};
        nodes.forEach(n => { adj[n.id] = []; });
        edges.forEach(e => {
            if (adj[e.fromNode]) {
                adj[e.fromNode].push(e.toNode);
            }
        });

        // Simple DFS cycle detection
        const visited = new Set();
        const recStack = new Set();

        function dfs(node) {
            if (recStack.has(node)) return true;
            if (visited.has(node)) return false;

            visited.add(node);
            recStack.add(node);

            if (adj[node]) {
                for (let neighbor of adj[node]) {
                    if (dfs(neighbor)) return true;
                }
            }

            recStack.delete(node);
            return false;
        }

        for (let nodeId in adj) {
            if (!visited.has(nodeId)) {
                if (dfs(nodeId)) return true;
            }
        }

        return false;
    }

    // --- Count Root Nodes (no incoming edges) ---
    function countRoots(nodes, edges) {
        if (nodes.length === 0) return 0;

        const hasIncoming = new Set();
        edges.forEach(e => hasIncoming.add(e.toNode));

        return nodes.filter(n => !hasIncoming.has(n.id)).length;
    }

    // --- Count Leaf Nodes (no outgoing edges) ---
    function countLeaves(nodes, edges) {
        if (nodes.length === 0) return 0;

        const hasOutgoing = new Set();
        edges.forEach(e => hasOutgoing.add(e.fromNode));

        return nodes.filter(n => !hasOutgoing.has(n.id)).length;
    }

    // --- Main Build Method ---
    function build(options = {}) {
        const result = {
            success: false,
            context: null,
            summary: null,
            warnings: [],
            errors: []
        };

        // Validate options first
        const validatedOptions = validateOptions(options);
        if (!validatedOptions.valid) {
            result.errors = validatedOptions.errors;
            return result;
        }

        const opts = validatedOptions.options;

        // Check Canvas availability
        const deps = checkDependencies();
        if (deps.length > 0) {
            result.errors.push(makeError(
                ERROR_CODES.CANVAS_UNAVAILABLE,
                `Missing dependencies: ${deps.join(', ')}`
            ));
            return result;
        }

        // Get Canvas state
        const stateResult = getCanvasState();
        if (!stateResult.success) {
            result.errors = stateResult.errors;
            return result;
        }

        // Build based on mode
        if (opts.mode === 'summary') {
            const summaryResult = getSummary(options);
            if (!summaryResult.success) {
                result.errors = summaryResult.errors;
                return result;
            }
            result.summary = summaryResult.summary;
            result.warnings = summaryResult.warnings;
        } else {
            // Full or selected context
            const contextResult = getCanvasContext(options);
            if (!contextResult.success) {
                result.errors = contextResult.errors;
                return result;
            }
            result.context = contextResult.context;
            result.warnings = contextResult.warnings;

            // Also include summary
            const summaryResult = getSummary(options);
            if (summaryResult.success) {
                result.summary = summaryResult.summary;
                result.warnings.push(...summaryResult.warnings);
            }
        }

        result.success = true;
        return result;
    }

    // --- Cache Management (optional, simple implementation) ---
    let contextCache = null;
    let cacheTimestamp = 0;
    const CACHE_TTL_MS = 5000; // 5 second cache validity

    function getCachedContext() {
        const now = Date.now();
        if (contextCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return contextCache;
        }
        return null;
    }

    function setCachedContext(context) {
        contextCache = context;
        cacheTimestamp = Date.now();
    }

    function clearCache() {
        contextCache = null;
        cacheTimestamp = 0;
    }

    // --- Public API ---
    const AIContext = {
        /**
         * Build context for AI requests
         * @param {Object} options - Context building options
         * @returns {Object} Structured context result
         */
        build: build,

        /**
         * Get Canvas context with optional filtering
         * @param {Object} options - Context options
         * @returns {Object} Canvas context result
         */
        getCanvasContext: getCanvasContext,

        /**
         * Get a lightweight summary of the Canvas
         * @param {Object} options - Summary options
         * @returns {Object} Summary result
         */
        getSummary: getSummary,

        /**
         * Clear any cached context data
         */
        clearCache: clearCache,

        /**
         * Get error codes for reference
         * @returns {Object} Error codes mapping
         */
        getErrorCodes: function() {
            return { ...ERROR_CODES };
        },

        /**
         * Get configuration limits
         * @returns {Object} Configuration object
         */
        getConfig: function() {
            return { ...CONFIG };
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
    global.AIContext = AIContext;

})(typeof window !== 'undefined' ? window : this);
