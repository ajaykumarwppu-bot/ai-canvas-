/**
 * Canvas Layout Engine
 * Calculates professional-looking node positions from a logical graph structure.
 * 
 * This module is independent from Canvas rendering - it only calculates coordinates.
 * The actual Canvas rendering remains the responsibility of the existing Canvas system.
 * 
 * Architecture:
 *   Logical Graph → Analyze Relationships → Calculate Layout → Return Node Coordinates
 */

const CanvasLayout = (function() {
    'use strict';

    // Default configuration options
    const defaultOptions = {
        direction: 'vertical',      // 'vertical' for top-down hierarchy
        startX: 100,                // Starting X coordinate
        startY: 100,                // Starting Y coordinate
        levelGap: 180,              // Vertical gap between levels
        nodeGap: 80,                // Horizontal gap between nodes
        defaultNodeWidth: 180,      // Default node width if not specified
        defaultNodeHeight: 80,      // Default node height if not specified
        padding: 100                // Padding around the entire layout
    };

    /**
     * Get default layout options
     * @returns {Object} Default options object
     */
    function getDefaultOptions() {
        return { ...defaultOptions };
    }

    /**
     * Validate input graph structure
     * @param {Object} graph - Input graph with nodes and edges
     * @returns {Object} Validation result with valid, errors, warnings arrays
     */
    function validateGraph(graph) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Check graph object exists
        if (!graph || typeof graph !== 'object') {
            result.valid = false;
            result.errors.push('Graph must be an object');
            return result;
        }

        // Check nodes array exists
        if (!Array.isArray(graph.nodes)) {
            result.valid = false;
            result.errors.push('Graph must have a nodes array');
            return result;
        }

        // Default edges to empty array if not provided
        if (!graph.edges) {
            graph.edges = [];
        } else if (!Array.isArray(graph.edges)) {
            result.valid = false;
            result.errors.push('Edges must be an array');
            return result;
        }

        // Validate nodes
        const nodeIds = new Set();
        graph.nodes.forEach((node, index) => {
            if (!node.id) {
                result.valid = false;
                result.errors.push(`Node at index ${index} missing ID`);
            } else if (nodeIds.has(node.id)) {
                result.valid = false;
                result.errors.push(`Duplicate node ID: ${node.id}`);
            } else {
                nodeIds.add(node.id);
            }

            if (typeof node.text === 'undefined') {
                result.warnings.push(`Node ${node.id} missing text property`);
            }
        });

        // Validate edges
        graph.edges.forEach((edge, index) => {
            // Support aliases: from/source/fromNode, to/target/toNode
            const fromNode = edge.from || edge.source || edge.fromNode;
            const toNode = edge.to || edge.target || edge.toNode;

            if (!fromNode) {
                result.valid = false;
                result.errors.push(`Edge at index ${index} missing source node`);
            } else if (!nodeIds.has(fromNode)) {
                result.valid = false;
                result.errors.push(`Edge at index ${index} references non-existent node: ${fromNode}`);
            }

            if (!toNode) {
                result.valid = false;
                result.errors.push(`Edge at index ${index} missing target node`);
            } else if (!nodeIds.has(toNode)) {
                result.valid = false;
                result.errors.push(`Edge at index ${index} references non-existent node: ${toNode}`);
            }
        });

        return result;
    }

    /**
     * Normalize graph data to consistent internal format
     * @param {Object} graph - Input graph
     * @returns {Object} Normalized graph
     */
    function normalizeGraph(graph) {
        const normalized = {
            nodes: [],
            edges: []
        };

        // Normalize nodes
        graph.nodes.forEach(node => {
            normalized.nodes.push({
                id: node.id,
                text: node.text || '',
                width: node.width || node.w || defaultOptions.defaultNodeWidth,
                height: node.height || node.h || defaultOptions.defaultNodeHeight
            });
        });

        // Normalize edges
        graph.edges.forEach(edge => {
            normalized.edges.push({
                from: edge.from || edge.source || edge.fromNode,
                to: edge.to || edge.target || edge.toNode
            });
        });

        return normalized;
    }

    /**
     * Find root nodes (nodes with no incoming edges)
     * @param {Array} nodes - All nodes
     * @param {Array} edges - All edges
     * @returns {Array} Array of root node IDs
     */
    function findRoots(nodes, edges) {
        const hasIncomingEdge = new Set();
        
        edges.forEach(edge => {
            hasIncomingEdge.add(edge.to);
        });

        const roots = [];
        nodes.forEach(node => {
            if (!hasIncomingEdge.has(node.id)) {
                roots.push(node.id);
            }
        });

        return roots;
    }

    /**
     * Calculate hierarchical levels using BFS
     * @param {Object} graph - Normalized graph
     * @returns {Object} Level assignment and cycle warnings
     */
    function calculateLevels(graph) {
        const levels = {};
        const visited = new Set();
        const warnings = [];
        const roots = findRoots(graph.nodes, graph.edges);

        // Build adjacency list
        const adjacency = {};
        graph.nodes.forEach(node => {
            adjacency[node.id] = [];
        });
        graph.edges.forEach(edge => {
            if (adjacency[edge.from]) {
                adjacency[edge.from].push(edge.to);
            }
        });

        // Handle disconnected nodes - assign them to level 0 if they have no connections
        const connectedNodes = new Set();
        graph.edges.forEach(edge => {
            connectedNodes.add(edge.from);
            connectedNodes.add(edge.to);
        });

        // BFS from each root
        roots.forEach(rootId => {
            if (visited.has(rootId)) return;

            const queue = [{ id: rootId, level: 0 }];
            
            while (queue.length > 0) {
                const { id, level } = queue.shift();
                
                if (visited.has(id)) {
                    // Cycle detected - skip but warn
                    continue;
                }
                
                visited.add(id);
                levels[id] = level;

                const children = adjacency[id] || [];
                children.forEach(childId => {
                    if (!visited.has(childId)) {
                        queue.push({ id: childId, level: level + 1 });
                    } else if (levels[childId] <= level) {
                        // Edge goes backward or same level - potential cycle
                        warnings.push(`Cycle detected involving nodes: ${id} → ${childId}`);
                    }
                });
            }
        });

        // Assign disconnected nodes to max level + 1
        const maxLevel = Math.max(-1, ...Object.values(levels));
        graph.nodes.forEach(node => {
            if (!(node.id in levels)) {
                levels[node.id] = maxLevel + 1;
            }
        });

        return { levels, warnings };
    }

    /**
     * Group nodes by their level
     * @param {Array} nodes - All nodes
     * @param {Object} levels - Level assignment map
     * @returns {Object} Nodes grouped by level
     */
    function groupByLevel(nodes, levels) {
        const grouped = {};
        
        nodes.forEach(node => {
            const level = levels[node.id];
            if (!grouped[level]) {
                grouped[level] = [];
            }
            grouped[level].push(node);
        });

        return grouped;
    }

    /**
     * Calculate subtree widths for proper spacing
     * @param {string} nodeId - Root of subtree
     * @param {Object} adjacency - Adjacency list
     * @param {Object} nodes - Node map
     * @param {Object} options - Layout options
     * @returns {number} Subtree width
     */
    function calculateSubtreeWidth(nodeId, adjacency, nodes, options) {
        const node = nodes[nodeId];
        if (!node) return 0;

        let width = node.width + options.nodeGap;
        const children = adjacency[nodeId] || [];
        
        children.forEach(childId => {
            width += calculateSubtreeWidth(childId, adjacency, nodes, options);
        });

        return width;
    }

    /**
     * Position nodes within a level using Reingold-Tilford inspired algorithm
     * @param {Array} levelNodes - Nodes at this level
     * @param {number} level - Current level number
     * @param {Object} adjacency - Adjacency list
     * @param {Object} nodes - Node map
     * @param {Object} options - Layout options
     * @param {Object} positions - Current position assignments
     * @returns {number} Total width used
     */
    function positionLevel(levelNodes, level, adjacency, nodes, options, positions) {
        let currentX = options.startX;
        let maxWidth = 0;

        levelNodes.forEach(node => {
            const nodeId = node.id;
            const nodeWidth = node.width || options.defaultNodeWidth;
            
            // Calculate ideal position based on parent
            let idealX = currentX;
            
            // Check if this node has a parent above
            const parents = graph.edges.filter(e => e.to === nodeId);
            if (parents.length > 0) {
                const parentPositions = parents.map(p => positions[p.from]);
                if (parentPositions.some(p => p !== undefined)) {
                    // Average parent positions for better centering
                    const validParents = parentPositions.filter(p => p !== undefined);
                    if (validParents.length > 0) {
                        const avgParentX = validParents.reduce((sum, x) => sum + x, 0) / validParents.length;
                        idealX = avgParentX - (nodeWidth / 2);
                    }
                }
            }

            // Ensure minimum spacing
            positions[nodeId] = Math.max(currentX, idealX);
            
            currentX = positions[nodeId] + nodeWidth + options.nodeGap;
            maxWidth = Math.max(maxWidth, currentX);
        });

        return maxWidth;
    }

    // Reference to graph for use in positionLevel
    let graph = null;

    /**
     * Main layout calculation function
     * @param {Object} inputGraph - Input graph with nodes and edges
     * @param {Object} options - Optional layout configuration
     * @returns {Object} Layout result with positioned nodes
     */
    function layout(inputGraph, options = {}) {
        // Merge user options with defaults
        const opts = { ...defaultOptions, ...options };
        
        // Validate graph
        const validation = validateGraph(inputGraph);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors,
                warnings: validation.warnings
            };
        }

        // Normalize graph
        const normalizedGraph = normalizeGraph(inputGraph);
        graph = normalizedGraph; // Set for use in helper functions

        // Create node map for quick lookup
        const nodeMap = {};
        normalizedGraph.nodes.forEach(node => {
            nodeMap[node.id] = node;
        });

        // Build adjacency list
        const adjacency = {};
        normalizedGraph.nodes.forEach(node => {
            adjacency[node.id] = [];
        });
        normalizedGraph.edges.forEach(edge => {
            if (adjacency[edge.from]) {
                adjacency[edge.from].push(edge.to);
            }
        });

        // Calculate levels
        const { levels, warnings } = calculateLevels(normalizedGraph);
        
        // Group nodes by level
        const groupedByLevel = groupByLevel(normalizedGraph.nodes, levels);
        
        // Get sorted level numbers
        const levelNumbers = Object.keys(groupedByLevel).map(Number).sort((a, b) => a - b);

        // Calculate positions
        const positions = {}; // nodeId -> x coordinate
        let currentY = opts.startY;
        let maxX = 0;

        levelNumbers.forEach(levelNum => {
            const levelNodes = groupedByLevel[levelNum];
            
            // Sort nodes within level (optional: could sort by subtree size)
            levelNodes.sort((a, b) => a.id.localeCompare(b.id));
            
            // Position this level
            const levelMaxX = positionLevel(
                levelNodes, 
                levelNum, 
                adjacency, 
                nodeMap, 
                opts, 
                positions
            );
            
            maxX = Math.max(maxX, levelMaxX);
            currentY += opts.levelGap;
        });

        // Handle disconnected nodes - place them below main graph
        const disconnectedNodes = normalizedGraph.nodes.filter(n => {
            const hasConnection = normalizedGraph.edges.some(e => 
                e.from === n.id || e.to === n.id
            );
            return !hasConnection;
        });

        if (disconnectedNodes.length > 0) {
            currentY += opts.padding; // Extra gap before disconnected section
            
            disconnectedNodes.forEach(node => {
                positions[node.id] = opts.startX;
                levels[node.id] = levelNumbers.length + 1;
                currentY += node.height + opts.nodeGap;
            });
        }

        // Build result with final coordinates
        const positionedNodes = normalizedGraph.nodes.map(node => ({
            id: node.id,
            x: positions[node.id] || opts.startX,
            y: opts.startY + (levels[node.id] || 0) * opts.levelGap,
            width: node.width,
            height: node.height
        }));

        // Recalculate Y to account for proper level spacing
        const finalNodes = positionedNodes.map(node => ({
            id: node.id,
            x: node.x,
            y: opts.startY + (levels[node.id] || 0) * opts.levelGap
        }));

        return {
            success: true,
            nodes: finalNodes,
            meta: {
                direction: opts.direction,
                levels: levelNumbers.length + (disconnectedNodes.length > 0 ? 1 : 0)
            },
            warnings: warnings
        };
    }

    /**
     * Apply layout directly to Canvas via CanvasAPI
     * This is a convenience method that uses the public CanvasAPI
     * @param {Object} graph - Input graph
     * @param {Object} options - Layout options
     * @returns {Object} Result of applying the layout
     */
    function applyToCanvas(graph, options = {}) {
        // Check if CanvasAPI is available
        if (typeof CanvasAPI === 'undefined') {
            return {
                success: false,
                error: 'CanvasAPI not available'
            };
        }

        // Calculate layout
        const layoutResult = layout(graph, options);
        
        if (!layoutResult.success) {
            return layoutResult;
        }

        // Build batch operations
        const operations = [];
        
        // First, add all nodes with calculated positions
        layoutResult.nodes.forEach(nodeData => {
            const originalNode = graph.nodes.find(n => n.id === nodeData.id);
            operations.push({
                type: 'ADD_NODE',
                data: {
                    id: nodeData.id,
                    text: originalNode.text,
                    x: nodeData.x,
                    y: nodeData.y,
                    w: nodeData.width || originalNode.width,
                    h: nodeData.height || originalNode.height,
                    color: originalNode.color || '#1e1e1e'
                }
            });
        });

        // Then add all edges
        graph.edges.forEach(edge => {
            const fromNode = edge.from || edge.source || edge.fromNode;
            const toNode = edge.to || edge.target || edge.toNode;
            
            operations.push({
                type: 'ADD_EDGE',
                data: {
                    fromNode: fromNode,
                    toNode: toNode,
                    fromSide: edge.fromSide || 'e',
                    toSide: edge.toSide || 'w',
                    text: edge.text || '',
                    color: edge.color || '#888',
                    direction: edge.direction || 'forward'
                }
            });
        });

        // Apply all operations as a batch
        const batchResult = CanvasAPI.applyBatch(operations);
        
        return {
            success: batchResult.success,
            layoutResult: layoutResult,
            batchResult: batchResult
        };
    }

    // Public API
    return {
        layout: layout,
        validateGraph: validateGraph,
        getDefaultOptions: getDefaultOptions,
        applyToCanvas: applyToCanvas
    };
})();
