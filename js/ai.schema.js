/**
 * AI Schema Module
 * 
 * Provides a strict data contract, validation, and normalization layer
 * between future AI providers and the application core.
 * 
 * Architecture:
 * Raw AI Output -> Parse -> Normalize -> Validate -> Sanitize -> Safe Plan
 */

const AISchema = (function() {
    "use strict";

    // --- Configuration & Limits ---
    const CONFIG = {
        MAX_NODES: 1000,          // Prevent freezing on low-resource devices
        MAX_EDGES: 2000,          // Reasonable limit for browser rendering
        MAX_TEXT_LENGTH: 500,     // Prevent massive DOM nodes
        MAX_ID_LENGTH: 64,        // Sanity check for IDs
        SUPPORTED_INTENTS: ['create_canvas', 'update_canvas'],
        DEFAULT_VERSION: '1.0',
        DEFAULT_INTENT: 'create_canvas',
        REQUIRE_ROOT_NODE: true   // Enforce root/main node creation
    };

    // --- Aliases Mapping ---
    const ALIASES = {
        node: {
            text: ['label', 'title', 'name', 'content'],
            id: ['nodeId', 'key', 'identifier'],
            width: ['w', 'nodeWidth'],
            height: ['h', 'nodeHeight'],
            color: ['colour', 'bgColor', 'background']
        },
        edge: {
            from: ['source', 'fromNode', 'start', 'src'],
            to: ['target', 'toNode', 'end', 'dst', 'dest'],
            text: ['label', 'edgeLabel', 'caption']
        }
    };

    function safeClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return {};
        }
    }

    function makeError(code, message, details = {}) {
        return { code, message, details };
    }

    function makeWarning(code, message) {
        return { code, message };
    }

    // --- 1. Parsing ---
    function parse(input) {
        const errors = [];
        let data = null;

        if (typeof input === 'string') {
            try {
                data = JSON.parse(input);
            } catch (e) {
                errors.push(makeError('INVALID_JSON', `Failed to parse JSON: ${e.message}`));
                return { success: false, data: null, errors, warnings: [] };
            }
        } else if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
            data = safeClone(input);
        } else {
            errors.push(makeError('INVALID_INPUT_TYPE', 'Input must be a non-null Object or a JSON string.'));
            return { success: false, data: null, errors, warnings: [] };
        }

        if (typeof data !== 'object') {
            errors.push(makeError('INVALID_STRUCTURE', 'Parsed data is not an object.'));
            return { success: false, data: null, errors, warnings: [] };
        }

        return { success: true, data, errors, warnings: [] };
    }

    // --- 2. Normalization ---
    function normalize(data) {
        const normalized = {
            version: data.version || CONFIG.DEFAULT_VERSION,
            intent: data.intent || CONFIG.DEFAULT_INTENT,
            title: data.title || null,
            nodes: [],
            edges: [],
            layout: data.layout || { mode: 'hierarchical' },
            metadata: data.metadata || {}
        };

        // Check if root node generation is required
        let needsRootGeneration = false;
        let userRequestedTitle = '';
        
        if (CONFIG.REQUIRE_ROOT_NODE && normalized.intent === 'create_canvas') {
            userRequestedTitle = data.title || '';
            
            if (Array.isArray(data.nodes) && data.nodes.length > 0) {
                const hasExplicitRoot = data.nodes.some(n => 
                    n.type === 'root' || 
                    n.type === 'project' || 
                    n.isRoot === true ||
                    n.isMain === true
                );
                
                if (!hasExplicitRoot) {
                    needsRootGeneration = true;
                }
            } else if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
                needsRootGeneration = true;
            }
        }

        // Generate root node if needed
        if (needsRootGeneration) {
            const rootId = 'root_' + Date.now();
            const rootTitle = userRequestedTitle || 'Project Plan';
            
            data.nodes = data.nodes || [];
            data.nodes.unshift({
                id: rootId,
                text: rootTitle,
                type: 'root',
                isRoot: true
            });
            
            normalized.title = rootTitle;
            
            if (data.nodes.length > 1) {
                data.edges = data.edges || [];
                const rootNodeId = rootId;
                
                const targetNodeIds = new Set(data.edges.map(e => e.to || e.target));
                const topLevelNodes = data.nodes.slice(1).filter(n => !targetNodeIds.has(n.id));
                
                if (topLevelNodes.length > 0) {
                    topLevelNodes.forEach(n => {
                        data.edges.push({ from: rootNodeId, to: n.id });
                    });
                } else {
                    const sourceNodeIds = new Set(data.edges.map(e => e.from || e.source));
                    data.nodes.slice(1).forEach(n => {
                        if (sourceNodeIds.has(n.id)) {
                            data.edges.push({ from: rootNodeId, to: n.id });
                        }
                    });
                }
            }
        }

        // Normalize Nodes
        if (Array.isArray(data.nodes)) {
            normalized.nodes = data.nodes.map(node => {
                const n = {};
                n.id = node.id || node.nodeId || node.key || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                let textVal = node.text;
                if (textVal === undefined) {
                    for (let alias of ALIASES.node.text) {
                        if (node[alias] !== undefined) {
                            textVal = node[alias];
                            break;
                        }
                    }
                }
                n.text = (textVal !== undefined) ? String(textVal) : "";

                n.width = (node.width || node.w || node.nodeWidth);
                n.height = (node.height || node.h || node.nodeHeight);
                n.color = node.color || node.colour || node.bgColor;

                if (node.tags) n.tags = node.tags;
                if (node.type) n.type = node.type;

                return n;
            });
        }

        // Normalize Edges
        if (Array.isArray(data.edges)) {
            normalized.edges = data.edges.map(edge => {
                const e = {};
                let fromVal = edge.from;
                if (fromVal === undefined) {
                    for (let alias of ALIASES.edge.from) {
                        if (edge[alias] !== undefined) {
                            fromVal = edge[alias];
                            break;
                        }
                    }
                }
                e.from = fromVal;

                let toVal = edge.to;
                if (toVal === undefined) {
                    for (let alias of ALIASES.edge.to) {
                        if (edge[alias] !== undefined) {
                            toVal = edge[alias];
                            break;
                        }
                    }
                }
                e.to = toVal;

                let textVal = edge.text;
                if (textVal === undefined) {
                    for (let alias of ALIASES.edge.text) {
                        if (edge[alias] !== undefined) {
                            textVal = edge[alias];
                            break;
                        }
                    }
                }
                e.text = textVal || "";

                if (edge.color) e.color = edge.color;
                if (edge.fromSide) e.fromSide = edge.fromSide;
                if (edge.toSide) e.toSide = edge.toSide;

                return e;
            });
        }

        return normalized;
    }

    // --- 3. Validation ---
    function validate(data) {
        const errors = [];
        const warnings = [];

        if (!CONFIG.SUPPORTED_INTENTS.includes(data.intent)) {
            errors.push(makeError('UNSUPPORTED_INTENT', `Intent '${data.intent}' is not supported.`));
        }

        if (!Array.isArray(data.nodes)) {
            errors.push(makeError('MISSING_NODES', 'Nodes array is missing.'));
            return { success: false, errors, warnings };
        }

        if (data.nodes.length > CONFIG.MAX_NODES) {
            errors.push(makeError('NODE_LIMIT_EXCEEDED', `Too many nodes (${data.nodes.length}).`));
        }

        const nodeIds = new Set();
        for (let i = 0; i < data.nodes.length; i++) {
            const node = data.nodes[i];

            if (!node.id || typeof node.id !== 'string') {
                errors.push(makeError('INVALID_NODE_ID', `Node at index ${i} has invalid ID.`));
                continue;
            }
            if (node.id.length > CONFIG.MAX_ID_LENGTH) {
                errors.push(makeError('ID_TOO_LONG', `Node ID '${node.id}' exceeds max length.`));
            }
            if (nodeIds.has(node.id)) {
                errors.push(makeError('DUPLICATE_NODE_ID', `Duplicate node ID: '${node.id}'`));
            } else {
                nodeIds.add(node.id);
            }

            if (typeof node.text !== 'string') {
                errors.push(makeError('INVALID_NODE_TEXT', `Node '${node.id}' has invalid text.`));
            } else if (node.text.length > CONFIG.MAX_TEXT_LENGTH) {
                warnings.push(makeWarning('TEXT_TRUNCATED', `Node '${node.id}' text exceeds limit.`));
            }

            if (node.width !== undefined && (typeof node.width !== 'number' || node.width <= 0 || node.width > 5000)) {
                errors.push(makeError('INVALID_WIDTH', `Node '${node.id}' has invalid width.`));
            }
            if (node.height !== undefined && (typeof node.height !== 'number' || node.height <= 0 || node.height > 5000)) {
                errors.push(makeError('INVALID_HEIGHT', `Node '${node.id}' has invalid height.`));
            }
        }

        if (!Array.isArray(data.edges)) {
            data.edges = [];
        }

        if (data.edges.length > CONFIG.MAX_EDGES) {
            errors.push(makeError('EDGE_LIMIT_EXCEEDED', `Too many edges (${data.edges.length}).`));
        }

        for (let i = 0; i < data.edges.length; i++) {
            const edge = data.edges[i];
            
            if (!edge.from || typeof edge.from !== 'string') {
                errors.push(makeError('INVALID_EDGE_SOURCE', `Edge at index ${i} has invalid source.`));
                continue;
            }
            if (!edge.to || typeof edge.to !== 'string') {
                errors.push(makeError('INVALID_EDGE_TARGET', `Edge at index ${i} has invalid target.`));
                continue;
            }

            if (!nodeIds.has(edge.from)) {
                errors.push(makeError('BROKEN_EDGE_SOURCE', `Edge references non-existent node: '${edge.from}'`));
            }
            if (!nodeIds.has(edge.to)) {
                errors.push(makeError('BROKEN_EDGE_TARGET', `Edge references non-existent node: '${edge.to}'`));
            }
        }

        const adj = {};
        nodeIds.forEach(id => adj[id] = []);
        data.edges.forEach(e => {
            if (adj[e.from]) adj[e.from].push(e.to);
        });

        const visited = new Set();
        const recStack = new Set();
        let hasCycle = false;

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

        for (let id of nodeIds) {
            if (!visited.has(id)) {
                if (dfs(id)) {
                    hasCycle = true;
                    break;
                }
            }
        }

        if (hasCycle) {
            warnings.push(makeWarning('CYCLE_DETECTED', 'The graph contains a cycle.'));
        }

        return { success: errors.length === 0, errors, warnings };
    }

    // --- 4. Public Process Method ---
    function process(input) {
        const parseResult = parse(input);
        if (!parseResult.success) {
            return parseResult;
        }

        const normalizedData = normalize(parseResult.data);
        const validationResult = validate(normalizedData);
        
        if (!validationResult.success) {
            return {
                success: false,
                data: null,
                errors: validationResult.errors,
                warnings: validationResult.warnings
            };
        }

        return {
            success: true,
            data: normalizedData,
            errors: [],
            warnings: validationResult.warnings
        };
    }

    return {
        process: process,
        parse: parse,
        normalize: normalize,
        validate: validate,
        getSchema: () => ({
            version: CONFIG.DEFAULT_VERSION,
            intents: CONFIG.SUPPORTED_INTENTS,
            limits: {
                maxNodes: CONFIG.MAX_NODES,
                maxEdges: CONFIG.MAX_EDGES,
                maxTextLength: CONFIG.MAX_TEXT_LENGTH
            }
        })
    };

})();
