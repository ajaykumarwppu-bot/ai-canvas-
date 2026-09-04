/**
 * Canvas Public API
 * Provides a controlled interface for external modules (e.g., future AI) 
 * to manipulate the Canvas without directly touching DOM or internal state.
 */

const CanvasAPI = (function() {
    // Internal reference to global state via canvasState object exposed by canvas.js
    
    // Helper: Get nodes array
    function getNodes() {
        if (!window.canvasState || typeof window.canvasState.getNodes !== 'function') {
            return [];
        }
        return window.canvasState.getNodes();
    }
    
    // Helper: Set nodes array
    function setNodes(newNodes) {
        if (!window.canvasState || typeof window.canvasState.setNodes !== 'function') {
            return false;
        }
        window.canvasState.setNodes(newNodes);
        return true;
    }
    
    // Helper: Get edges array
    function getEdges() {
        if (!window.canvasState || typeof window.canvasState.getEdges !== 'function') {
            return [];
        }
        return window.canvasState.getEdges();
    }
    
    // Helper: Set edges array
    function setEdges(newEdges) {
        if (!window.canvasState || typeof window.canvasState.setEdges !== 'function') {
            return false;
        }
        window.canvasState.setEdges(newEdges);
        return true;
    }

    // Helper: Generate ID using existing logic
    function generateId() {
        if (!window.canvasState || typeof window.canvasState.getNextNodeId !== 'function') {
            return 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        }
        return 'n' + window.canvasState.getNextNodeId();
    }

    function generateEdgeId() {
        if (!window.canvasState || typeof window.canvasState.getNextEdgeId !== 'function') {
            return 'e_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        }
        return 'e' + window.canvasState.getNextEdgeId();
    }

    // Helper: Validate Node Data
    function validateNode(data) {
        if (!data || typeof data.text === 'undefined') {
            return { success: false, error: "Node data missing or 'text' is required." };
        }
        // Defaults
        const node = {
            id: data.id || generateId(),
            text: String(data.text),
            x: typeof data.x === 'number' ? data.x : 100,
            y: typeof data.y === 'number' ? data.y : 100,
            w: typeof data.w === 'number' && data.w > 0 ? data.w : 150,
            h: typeof data.h === 'number' && data.h > 0 ? data.h : 60,
            color: data.color || "#1e1e1e",
            tags: Array.isArray(data.tags) ? data.tags : [],
            type: data.type || "default"
        };
        return { success: true, data: node };
    }

    // Helper: Validate Edge Data
    function validateEdge(data) {
        if (!data || !data.fromNode || !data.toNode) {
            return { success: false, error: "Edge requires 'fromNode' and 'toNode'." };
        }
        
        // Check if nodes exist
        const nodes = getNodes();
        const fromExists = nodes.some(n => n.id === data.fromNode);
        const toExists = nodes.some(n => n.id === data.toNode);
        
        if (!fromExists) {
            return { success: false, error: `Source node '${data.fromNode}' not found.` };
        }
        if (!toExists) {
            return { success: false, error: `Target node '${data.toNode}' not found.` };
        }

        const edge = {
            id: data.id || generateEdgeId(),
            fromNode: data.fromNode,
            fromSide: data.fromSide || "e",
            toNode: data.toNode,
            toSide: data.toSide || "w",
            text: data.text || "",
            color: data.color || "#888",
            direction: data.direction || "forward"
        };
        return { success: true, data: edge };
    }

    // Helper: Trigger Render and Save
    function refreshCanvas() {
        if (!window.canvasState) {
            console.warn('Canvas state not initialized');
            return;
        }
        
        // Re-render nodes and edges
        if (typeof window.canvasState.renderNodes === 'function') {
            window.canvasState.renderNodes();
        }
        if (typeof window.canvasState.renderEdges === 'function') {
            window.canvasState.renderEdges();
        }
        
        // Save to history/storage
        if (typeof window.canvasState.saveToHistory === 'function') {
            window.canvasState.saveToHistory();
        }
    }

    // --- Public Methods ---

    return {
        /**
         * Get a safe copy of the current state
         */
        getState: function() {
            const nodes = getNodes();
            const edges = getEdges();
            return {
                nodes: nodes.map(n => ({...n})),
                edges: edges.map(e => ({...e}))
            };
        },

        /**
         * Add a single node
         * @param {Object} data - { text, x, y, w, h, color, tags }
         */
        addNode: function(data) {
            const nodes = getNodes();
            if (!nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }

            const validation = validateNode(data);
            if (!validation.success) return validation;

            const newNode = validation.data;
            
            // Check for duplicate ID
            if (nodes.some(n => n.id === newNode.id)) {
                return { success: false, error: "Node ID already exists." };
            }

            nodes.push(newNode);
            setNodes(nodes);
            refreshCanvas();
            return { success: true, node: newNode };
        },

        /**
         * Add multiple nodes at once
         * @param {Array} dataArray 
         */
        addNodes: function(dataArray) {
            const nodes = getNodes();
            if (!nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }
            if (!Array.isArray(dataArray)) {
                return { success: false, error: "Expected an array of node data." };
            }

            const addedNodes = [];
            const errors = [];

            dataArray.forEach((data, index) => {
                const validation = validateNode(data);
                if (validation.success) {
                    // Ensure unique ID even in batch
                    if (!nodes.some(n => n.id === validation.data.id)) {
                        nodes.push(validation.data);
                        addedNodes.push(validation.data);
                    } else {
                        errors.push(`Index ${index}: Duplicate ID`);
                    }
                } else {
                    errors.push(`Index ${index}: ${validation.error}`);
                }
            });

            if (addedNodes.length > 0) {
                setNodes(nodes);
                refreshCanvas();
            }

            return {
                success: addedNodes.length > 0,
                added: addedNodes,
                errors: errors
            };
        },

        /**
         * Update an existing node
         * @param {string} id 
         * @param {Object} changes - { text, x, y, w, h, color }
         */
        updateNode: function(id, changes) {
            const nodes = getNodes();
            if (!nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const nodeIndex = nodes.findIndex(n => n.id === id);
            if (nodeIndex === -1) {
                return { success: false, error: "Node not found." };
            }

            const node = nodes[nodeIndex];
            
            // Apply allowed changes safely
            if (typeof changes.text !== 'undefined') node.text = String(changes.text);
            if (typeof changes.x === 'number') node.x = changes.x;
            if (typeof changes.y === 'number') node.y = changes.y;
            if (typeof changes.w === 'number' && changes.w > 0) node.w = changes.w;
            if (typeof changes.h === 'number' && changes.h > 0) node.h = changes.h;
            if (typeof changes.color !== 'undefined') node.color = changes.color;
            if (Array.isArray(changes.tags)) node.tags = changes.tags;

            setNodes(nodes);
            refreshCanvas();
            return { success: true, node: node };
        },

        /**
         * Delete a node (and associated edges)
         * @param {string} id 
         */
        deleteNode: function(id) {
            const nodes = getNodes();
            if (!nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const initialCount = nodes.length;
            const newNodes = nodes.filter(n => n.id !== id);
            
            // Remove connected edges
            let edges = getEdges();
            if (edges) {
                const initialEdges = edges.length;
                edges = edges.filter(e => e.fromNode !== id && e.toNode !== id);
                setEdges(edges);
                
                if (newNodes.length < initialCount) {
                    setNodes(newNodes);
                    refreshCanvas();
                    return { success: true, removedEdges: initialEdges - edges.length };
                }
            } else if (newNodes.length < initialCount) {
                setNodes(newNodes);
                refreshCanvas();
                return { success: true, removedEdges: 0 };
            }
            
            return { success: false, error: "Node not found." };
        },

        /**
         * Add a single edge
         * @param {Object} data - { fromNode, toNode, fromSide, toSide, text, color }
         */
        addEdge: function(data) {
            const edges = getEdges();
            const nodes = getNodes();
            if (!edges || !nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const validation = validateEdge(data);
            if (!validation.success) return validation;

            const newEdge = validation.data;

            if (edges.some(e => e.id === newEdge.id)) {
                return { success: false, error: "Edge ID already exists." };
            }

            edges.push(newEdge);
            setEdges(edges);
            refreshCanvas();
            return { success: true, edge: newEdge };
        },

        /**
         * Add multiple edges
         * @param {Array} dataArray 
         */
        addEdges: function(dataArray) {
            const edges = getEdges();
            const nodes = getNodes();
            if (!edges || !nodes) {
                return { success: false, error: "Canvas system not initialized." };
            }
            if (!Array.isArray(dataArray)) {
                return { success: false, error: "Expected an array of edge data." };
            }

            const addedEdges = [];
            const errors = [];

            dataArray.forEach((data, index) => {
                const validation = validateEdge(data);
                if (validation.success) {
                    if (!edges.some(e => e.id === validation.data.id)) {
                        edges.push(validation.data);
                        addedEdges.push(validation.data);
                    } else {
                        errors.push(`Index ${index}: Duplicate ID`);
                    }
                } else {
                    errors.push(`Index ${index}: ${validation.error}`);
                }
            });

            if (addedEdges.length > 0) {
                setEdges(edges);
                refreshCanvas();
            }

            return {
                success: addedEdges.length > 0,
                added: addedEdges,
                errors: errors
            };
        },

        /**
         * Update an edge
         * @param {string} id 
         * @param {Object} changes 
         */
        updateEdge: function(id, changes) {
            const edges = getEdges();
            const nodes = getNodes();
            if (!edges) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const edgeIndex = edges.findIndex(e => e.id === id);
            if (edgeIndex === -1) {
                return { success: false, error: "Edge not found." };
            }

            const edge = edges[edgeIndex];
            
            if (typeof changes.text !== 'undefined') edge.text = String(changes.text);
            if (typeof changes.color !== 'undefined') edge.color = changes.color;
            if (typeof changes.fromSide !== 'undefined') edge.fromSide = changes.fromSide;
            if (typeof changes.toSide !== 'undefined') edge.toSide = changes.toSide;
            
            // Prevent breaking connections
            if (changes.fromNode && nodes.some(n => n.id === changes.fromNode)) {
                edge.fromNode = changes.fromNode;
            }
            if (changes.toNode && nodes.some(n => n.id === changes.toNode)) {
                edge.toNode = changes.toNode;
            }

            setEdges(edges);
            refreshCanvas();
            return { success: true, edge: edge };
        },

        /**
         * Delete an edge
         * @param {string} id 
         */
        deleteEdge: function(id) {
            const edges = getEdges();
            if (!edges) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const initialCount = edges.length;
            const newEdges = edges.filter(e => e.id !== id);

            if (newEdges.length < initialCount) {
                setEdges(newEdges);
                refreshCanvas();
                return { success: true };
            }
            return { success: false, error: "Edge not found." };
        },

        /**
         * Apply a batch of operations
         * Operations: { type: 'ADD_NODE'|'ADD_EDGE'|'UPDATE_NODE'|'DELETE_NODE', ... }
         */
        applyBatch: function(operations) {
            if (!window.canvasState) {
                return { success: false, error: "Canvas system not initialized." };
            }
            if (!Array.isArray(operations)) {
                return { success: false, error: "Operations must be an array." };
            }

            const results = [];
            let hasChanges = false;

            // Phase 1: Validation (Optional but recommended for atomic-like behavior)
            // For Stage 1, we will apply sequentially but collect errors
            
            operations.forEach((op, index) => {
                let result = { index, type: op.type, success: false };

                try {
                    switch(op.type) {
                        case 'ADD_NODE':
                            result = this.addNode(op.data);
                            break;
                        case 'ADD_EDGE':
                            result = this.addEdge(op.data);
                            break;
                        case 'UPDATE_NODE':
                            result = this.updateNode(op.data.id, op.data.changes);
                            break;
                        case 'DELETE_NODE':
                            result = this.deleteNode(op.data.id);
                            break;
                        case 'DELETE_EDGE':
                            result = this.deleteEdge(op.data.id);
                            break;
                        default:
                            result.error = "Unknown operation type";
                    }
                } catch (e) {
                    result.error = e.message;
                }

                if (result.success) hasChanges = true;
                results.push(result);
            });

            if (hasChanges) {
                // Single render/save for the whole batch
                refreshCanvas();
            }

            return {
                success: hasChanges,
                results: results
            };
        },

        /**
         * Explicitly save state
         */
        save: function() {
            refreshCanvas(); // Triggers save internally
            return { success: true };
        },

        /**
         * Focus/Select a node programmatically
         */
        focusNode: function(id) {
            const nodes = getNodes();
            if (!nodes || !window.selection) {
                return { success: false, error: "Canvas system not initialized." };
            }
            const node = nodes.find(n => n.id === id);
            if (!node) {
                return { success: false, error: "Node not found." };
            }

            // Clear existing selection (if selection object exists)
            if (window.selection) {
                window.selection.nodes = [];
                window.selection.edges = [];
                
                // Add target to selection
                window.selection.nodes.push(node);
            }
            
            if (typeof window.FreeCanvasManager !== 'undefined' && typeof window.FreeCanvasManager.render === 'function') {
                window.FreeCanvasManager.render();
                // If there's a specific focus logic in UI, trigger it here
                if (typeof window.FreeCanvasManager.focusNode === 'function') {
                    window.FreeCanvasManager.focusNode(id);
                }
            }
            return { success: true };
        },

        /**
         * Focus all (select all)
         */
        focusAll: function() {
            const nodes = getNodes();
            const edges = getEdges();
            if (!nodes || !edges || !window.selection) {
                return { success: false, error: "Canvas system not initialized." };
            }
            window.selection.nodes = [...nodes];
            window.selection.edges = [...edges];
            
            if (typeof window.FreeCanvasManager !== 'undefined' && typeof window.FreeCanvasManager.render === 'function') {
                window.FreeCanvasManager.render();
            }
            return { success: true };
        }
    };
})();
