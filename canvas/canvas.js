// modules/canvas/canvas.js

const FreeCanvasManager = {
    containerId: 'view-canvas',
    
    setup: function() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        if (!document.getElementById('canvas-dynamic-styles')) {
            const style = document.createElement('style');
            style.id = 'canvas-dynamic-styles';
            
            // 🌟 UI मॉड्यूल से CSS मंगवा रहे हैं + वाइट स्क्रॉलबार हटाने का कोड जोड़ रहे हैं
            style.innerHTML = CanvasUI.styles + `
                /* 🚀 FIX: कार्ड्स (Nodes) से गंदा वाइट स्क्रॉलबार हमेशा के लिए हटाने के लिए */
                .node, .node-content {
                    scrollbar-width: none !important; /* Firefox के लिए */
                    -ms-overflow-style: none !important; /* Edge/IE के लिए */
                }
                .node::-webkit-scrollbar, .node-content::-webkit-scrollbar {
                    display: none !important; /* Chrome, Safari, Opera के लिए */
                    width: 0px !important;
                    height: 0px !important;
                    background: transparent !important;
                }
            `;
            document.head.appendChild(style);
        }
        
        // 🌟 UI मॉड्यूल से HTML ढाँचा मंगवा रहे हैं
        container.innerHTML = CanvasUI.layoutHTML;
    },

    insertTag: function(tag, event) {
        event.preventDefault(); 
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        
        range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
        range.deleteContents();
        
        const textNode = document.createTextNode(tag + ' ');
        range.insertNode(textNode);
        
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        
        document.getElementById('tag-dropdown').style.display = 'none';
    },

    // 🌟 पुराना कनेक्शन ना टूटे इसलिए ये यहीं रहेगा, पर कॉल UI को करेगा
    formatNodeHTML: function(text) {
        return CanvasUI.formatNodeHTML(text);
    },

    // 🌟 पुराना कनेक्शन ना टूटे इसलिए ये यहीं रहेगा, पर कॉल Engine को करेगा
    extractGlobalTasks: function(canvasId, nodes) {
        CanvasEngine.extractGlobalTasks(canvasId, nodes);
    },

    render: function() {
        if (!document.getElementById('canvas-manager-view')) this.setup();
        document.getElementById('canvas-manager-view').style.display = 'block';
        const workspace = document.getElementById('canvas-workspace');
        if(workspace) workspace.style.display = 'none';
        
        const canvasList = Storage.load('app_canvas_list') || [];
        const grid = document.getElementById('canvas-grid');
        grid.innerHTML = '';

        if (canvasList.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; color: #888;">No canvases yet. Click "+ Add New Canvas" to start.</p>';
            return;
        }

        canvasList.forEach(c => {
            const dateStr = new Date(c.createdAt).toLocaleDateString();
            const card = document.createElement('div');
            card.className = 'canvas-card';
            card.innerHTML = `
                <h3>${c.name}</h3>
                <p>Created: ${dateStr}</p>
                <button class="delete-canvas-btn" onclick="event.stopPropagation(); FreeCanvasManager.deleteCanvas('${c.id}')">Delete</button>
            `;
            card.onclick = () => this.openCanvas(c.id, c.name);
            grid.appendChild(card);
        });
    },

    openModal: function() {
        document.getElementById('canvas-modal').style.display = 'flex';
        document.getElementById('new-canvas-name').focus();
    },

    closeModal: function() {
        document.getElementById('canvas-modal').style.display = 'none';
        document.getElementById('new-canvas-name').value = '';
    },

    createCanvas: function() {
        const name = document.getElementById('new-canvas-name').value.trim();
        if (!name) return alert("Please enter a name for your Canvas.");
        const canvasList = Storage.load('app_canvas_list') || [];
        const newId = 'canvas_data_' + Date.now();
        canvasList.push({ id: newId, name: name, createdAt: Date.now() });
        Storage.save('app_canvas_list', canvasList);
        this.closeModal();
        this.render(); 
    },

    deleteCanvas: function(id) {
        if(confirm("Are you sure you want to delete this canvas?")) {
            let canvasList = Storage.load('app_canvas_list') || [];
            canvasList = canvasList.filter(c => c.id !== id);
            Storage.save('app_canvas_list', canvasList);
            Storage.remove(id + '_nodes');
            Storage.remove(id + '_edges');
            let globalTasks = Storage.load('global_canvas_tasks') || [];
            globalTasks = globalTasks.filter(t => t.canvasId !== id);
            Storage.save('global_canvas_tasks', globalTasks);
            this.render();
        }
    },

    openCanvas: function(canvasId, canvasName) {
        const managerView = document.getElementById('canvas-manager-view');
        if(managerView) managerView.style.display = 'none';
        const workspace = document.getElementById('canvas-workspace');
        document.body.appendChild(workspace);
        workspace.style.display = 'block';
        this.startEngine(canvasId);
    },

    closeWorkspace: function() {
        const workspace = document.getElementById('canvas-workspace');
        workspace.style.display = 'none';
        const container = document.getElementById(this.containerId);
        if(container) container.appendChild(workspace);
        const managerView = document.getElementById('canvas-manager-view');
        if(managerView) managerView.style.display = 'block';
    },

    startEngine: function(dataId) {
        const workspace = document.getElementById('canvas-workspace');
        const viewport = document.getElementById('viewport');
        const canvas = document.getElementById('canvas');
        const nodesContainer = document.getElementById('nodes-container');
        const svgLayer = document.getElementById('svg-layer');
        const edgeTextEditor = document.getElementById('edge-text-editor');
        const nodeToolbar = document.getElementById('node-toolbar');
        const edgeToolbar = document.getElementById('edge-toolbar');
        const tagDropdown = document.getElementById('tag-dropdown');
        const colorPopover = document.getElementById('color-popover');
        const popoverPicker = document.getElementById('popover-color-picker');

        // 🌟 Engine से मैथ्स और लॉजिक इम्पोर्ट करना
        const getSideCoords = CanvasEngine.getSideCoords;
        const generateBezier = CanvasEngine.generateBezier;
        const getBezierMidpoint = CanvasEngine.getBezierMidpoint;

        let scale = 1, panX = -4000, panY = -4000;
        let isPanning = false, startClientX = 0, startClientY = 0;
        let nodes = [], edges = [];
        let nextNodeId = 1, nextEdgeId = 1;
        
        let selectedNodeId = null, selectedEdgeId = null, isReadOnly = false;
        let history = [], historyIndex = -1;
        let isDragging = false, draggingNode = null, resizingNode = null, connectingEdge = null;
        let activeEditEdge = null;
        let activeColorTarget = null; 

        // --- EXPOSE STATE FOR API (Stage 2 Integration) ---
        // Expose arrays and functions to window for CanvasAPI access
        window.canvasState = {
            getNodes: () => nodes,
            setNodes: (newNodes) => { nodes = newNodes; },
            getEdges: () => edges,
            setEdges: (newEdges) => { edges = newEdges; },
            getNextNodeId: () => nextNodeId++,
            getNextEdgeId: () => nextEdgeId++,
            renderNodes: null,
            renderEdges: null,
            saveToHistory: null,
            dataId: dataId
        };
        // --------------------------------------------------

        const updateSwatchesUI = () => {
            const colors = JSON.parse(localStorage.getItem('canvas_saved_colors') || '[]');
            document.getElementById('popover-swatches').innerHTML = colors.map(c => `<div class="swatch" style="background:${c}" data-color="${c}"></div>`).join('');
        };
        updateSwatchesUI();

        document.getElementById('btn-node-color-pop').onclick = (e) => {
            e.stopPropagation();
            activeColorTarget = 'node';
            const rect = nodeToolbar.getBoundingClientRect();
            colorPopover.style.display = 'flex';
            colorPopover.style.left = rect.left + 'px';
            colorPopover.style.top = (rect.bottom + 5) + 'px';
            const n = nodes.find(x => x.id === selectedNodeId);
            if(n) popoverPicker.value = n.color;
        };

        document.getElementById('btn-edge-color-pop').onclick = (e) => {
            e.stopPropagation();
            activeColorTarget = 'edge';
            const rect = edgeToolbar.getBoundingClientRect();
            colorPopover.style.display = 'flex';
            colorPopover.style.left = rect.left + 'px';
            colorPopover.style.top = (rect.bottom + 5) + 'px';
            const edge = edges.find(x => x.id === selectedEdgeId);
            if(edge) popoverPicker.value = edge.color;
        };

        popoverPicker.oninput = (e) => {
            const color = e.target.value;
            if (activeColorTarget === 'node' && selectedNodeId) {
                const n = nodes.find(x => x.id === selectedNodeId);
                if(n) { n.color = color; renderNodes(); }
            } else if (activeColorTarget === 'edge' && selectedEdgeId) {
                const edge = edges.find(x => x.id === selectedEdgeId);
                if(edge) { edge.color = color; renderEdges(); }
            }
        };

        popoverPicker.onchange = (e) => saveToHistory();

        document.getElementById('btn-popover-save').onclick = () => {
            const color = popoverPicker.value;
            let colors = JSON.parse(localStorage.getItem('canvas_saved_colors') || '[]');
            if(!colors.includes(color)) { 
                colors.push(color); 
                localStorage.setItem('canvas_saved_colors', JSON.stringify(colors)); 
                updateSwatchesUI(); 
            }
        };

        document.getElementById('popover-swatches').onclick = (e) => {
            if(e.target.classList.contains('swatch')) {
                const color = e.target.getAttribute('data-color');
                popoverPicker.value = color;
                if (activeColorTarget === 'node' && selectedNodeId) {
                    const n = nodes.find(x => x.id === selectedNodeId);
                    if(n) { n.color = color; renderNodes(); saveToHistory(); }
                } else if (activeColorTarget === 'edge' && selectedEdgeId) {
                    const edge = edges.find(x => x.id === selectedEdgeId);
                    if(edge) { edge.color = color; renderEdges(); saveToHistory(); }
                }
            }
        };

        const saveToHistory = () => {
            history = history.slice(0, historyIndex + 1);
            history.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
            historyIndex++;
            Storage.save(dataId + '_nodes', nodes);
            Storage.save(dataId + '_edges', edges);
            FreeCanvasManager.extractGlobalTasks(dataId, nodes);
        };
        
        // Expose saveToHistory and render functions to canvasState for API
        window.canvasState.saveToHistory = saveToHistory;

        const loadState = () => {
            const sNodes = Storage.load(dataId + '_nodes');
            const sEdges = Storage.load(dataId + '_edges');
            if (sNodes && sEdges) {
                nodes = sNodes; edges = sEdges;
                if(nodes.length > 0) nextNodeId = Math.max(...nodes.map(n => parseInt(n.id.substring(1)))) + 1;
                if(edges.length > 0) nextEdgeId = Math.max(...edges.map(e => parseInt(e.id.substring(1)))) + 1;
            } else {
                nodes = [{ id: 'n1', text: 'Double click anywhere to create nodes!', x: 4800, y: 4800, w: 200, h: 80, color: '#1e1e1e' }];
                edges = []; nextNodeId = 2; nextEdgeId = 1;
            }
            history = [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }];
            historyIndex = 0;
        };

        const updateTransform = () => { canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; };
        
        const clearSelection = () => {
            selectedNodeId = null; selectedEdgeId = null;
            nodeToolbar.style.display = 'none'; edgeToolbar.style.display = 'none';
            colorPopover.style.display = 'none'; 
            
            const bottomToolbar = document.getElementById('node-bottom-toolbar');
            if(bottomToolbar) bottomToolbar.style.display = 'none';
            
            renderNodes(); renderEdges();
        };

        const focusOnTarget = (targetX, targetY, targetScale = 1.5) => {
            const vW = viewport.clientWidth; const vH = viewport.clientHeight;
            scale = targetScale;
            panX = (vW / 2) - (targetX * scale); panY = (vH / 2) - (targetY * scale);
            canvas.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            updateTransform(); positionToolbars();
        };

        const getCanvasCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
        };

        const positionToolbars = () => {
            nodeToolbar.style.display = 'none'; edgeToolbar.style.display = 'none';
            colorPopover.style.display = 'none'; 
            if (isReadOnly) return;
            if (selectedNodeId) {
                const nodeEl = document.getElementById(selectedNodeId);
                if (nodeEl) {
                    const rect = nodeEl.getBoundingClientRect();
                    nodeToolbar.style.display = 'flex';
                    nodeToolbar.style.left = `${rect.left + (rect.width/2) - (nodeToolbar.offsetWidth/2)}px`;
                    nodeToolbar.style.top = `${rect.top - nodeToolbar.offsetHeight - 15}px`;
                    
                    const bottomToolbar = document.getElementById('node-bottom-toolbar');
                    if(bottomToolbar) {
                        bottomToolbar.style.display = 'flex';
                        bottomToolbar.style.left = `${rect.left + (rect.width/2) - (bottomToolbar.offsetWidth/2)}px`;
                        bottomToolbar.style.top = `${rect.bottom + 15}px`;
                    }
                }
            } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                const n1 = nodes.find(n => n.id === edge.fromNode); const n2 = nodes.find(n => n.id === edge.toNode);
                if(n1 && n2) {
                    const p1 = getSideCoords(n1, edge.fromSide); const p2 = getSideCoords(n2, edge.toSide);
                    const mid = getBezierMidpoint(p1.x, p1.y, p2.x, p2.y, edge.fromSide, edge.toSide);
                    const rect = canvas.getBoundingClientRect();
                    edgeToolbar.style.display = 'flex';
                    edgeToolbar.style.left = `${(mid.x * scale) + rect.left - (edgeToolbar.offsetWidth/2)}px`;
                    edgeToolbar.style.top = `${(mid.y * scale) + rect.top - edgeToolbar.offsetHeight - 15}px`;
                }
            }
        };

        const activateNodeEditor = (contentEl, nodeObj) => {
            contentEl.contentEditable = "true";
            contentEl.innerText = nodeObj.text; 
            contentEl.focus();
            
            const range = document.createRange(); 
            const sel = window.getSelection();
            range.selectNodeContents(contentEl); 
            range.collapse(false);
            sel.removeAllRanges(); 
            sel.addRange(range);

            // 🌟 FIXED: Opening/Closing दोनों tags को \n बनाएगा और खाली लाइनों को इग्नोर करेगा!
            contentEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const selection = window.getSelection();
                    if (!selection.rangeCount) return;
                    const currentRange = selection.getRangeAt(0);
                    
                    const preCaretRange = currentRange.cloneRange();
                    preCaretRange.selectNodeContents(contentEl);
                    preCaretRange.setEnd(currentRange.startContainer, currentRange.startOffset);
                    
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(preCaretRange.cloneContents());
                    
                    let htmlStr = tempDiv.innerHTML;
                    
                    // 🚀 FIX: सभी HTML ब्लॉक टैग्स को न्यू-लाइन में कन्वर्ट किया
                    htmlStr = htmlStr
                        .replace(/<br\s*[\/]?>/gi, '\n')
                        .replace(/<div[^>]*>/gi, '\n')
                        .replace(/<\/div>/gi, '\n')
                        .replace(/<p[^>]*>/gi, '\n')
                        .replace(/<\/p>/gi, '\n')
                        .replace(/<li[^>]*>/gi, '\n')
                        .replace(/<\/li>/gi, '\n');
                        
                    let textBefore = htmlStr.replace(/<[^>]+>/g, '');
                    textBefore = textBefore.replace(/&nbsp;/g, ' ');
                    
                    // 🚀 FIX: खाली न्यू-लाइन्स को हटाकर सही आखिरी लाइन निकाली
                    let lines = textBefore.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    let trimmedLine = lines[lines.length - 1] || '';
                    
                    let nextPrefix = null;
                    if (trimmedLine.startsWith('•')) {
                        nextPrefix = '• ';
                    } else if (trimmedLine.startsWith('[ ]') || trimmedLine.startsWith('[x]') || trimmedLine.startsWith('[X]') || trimmedLine.startsWith('☐') || trimmedLine.startsWith('☑')) {
                        nextPrefix = '[ ] ';
                    } else {
                        // 🚀 FIX: स्पेस ना होने पर भी सही नंबर पकड़ेगा
                        let match = trimmedLine.match(/^(\d+)\.\s*/);
                        if (match) {
                            let nextNum = parseInt(match[1]) + 1;
                            nextPrefix = `${nextNum}. `;
                        }
                    }
                    
                    if (nextPrefix) {
                        e.preventDefault();
                        document.execCommand('insertText', false, '\n' + nextPrefix);
                    }
                }
            });

            contentEl.addEventListener('input', () => {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const r = selection.getRangeAt(0);
                const textBeforeCursor = r.startContainer.textContent.substring(0, r.startOffset);
                
                if (textBeforeCursor.endsWith('@')) {
                    const rect = contentEl.getBoundingClientRect();
                    tagDropdown.style.display = 'block';
                    tagDropdown.style.left = rect.left + 'px';
                    tagDropdown.style.top = (rect.bottom + 5) + 'px';
                } else {
                    tagDropdown.style.display = 'none';
                }
            });

            contentEl.onblur = () => {
                if (contentEl.contentEditable === "true") {
                    contentEl.contentEditable = "false";
                    nodeObj.text = contentEl.innerText.trim();
                    contentEl.innerHTML = FreeCanvasManager.formatNodeHTML(nodeObj.text);
                    tagDropdown.style.display = 'none';
                    saveToHistory();
                }
            };
        };

        const renderNodes = () => {
            nodesContainer.innerHTML = '';
            nodes.forEach(node => {
                const el = document.createElement('div');
                el.className = `node ${selectedNodeId === node.id ? 'selected' : ''}`;
                el.id = node.id; 
                el.style.left = `${node.x}px`; 
                el.style.top = `${node.y}px`;
                el.style.width = `${node.w}px`; 
                el.style.height = `${node.h}px`; 
                
                let borderColor = '#444';
                let bgColor = '#1e1e1e';

                if (node.color && node.color !== '#1e1e1e') {
                    borderColor = node.color;
                    if (node.color.startsWith('#') && node.color.length === 7) {
                        const r = parseInt(node.color.slice(1, 3), 16);
                        const g = parseInt(node.color.slice(3, 5), 16);
                        const b = parseInt(node.color.slice(5, 7), 16);
                        bgColor = `rgba(${r}, ${g}, ${b}, 0.15)`; 
                    } else {
                        bgColor = node.color;
                    }
                }

                el.style.setProperty('--node-color', borderColor);
                el.style.setProperty('--node-bg', bgColor);
                
                const content = document.createElement('div');
                content.className = 'node-content'; 
                content.innerHTML = FreeCanvasManager.formatNodeHTML(node.text);
                el.appendChild(content);

                // ... rest of renderNodes logic
                content.querySelectorAll('.todo-box').forEach(box => {
                    box.addEventListener('mousedown', (e) => e.stopPropagation());
                    box.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if(isReadOnly) return;
                        const lineIdx = parseInt(box.getAttribute('data-line'));
                        let lines = node.text.split('\n');
                        if (lines[lineIdx]) {
                            if (lines[lineIdx].trim().startsWith('[ ]')) lines[lineIdx] = lines[lineIdx].replace('[ ]', '[x]');
                            else lines[lineIdx] = lines[lineIdx].replace(/\[[xX]\]/, '[ ]');
                            node.text = lines.join('\n');
                            content.innerHTML = FreeCanvasManager.formatNodeHTML(node.text);
                            saveToHistory(); renderNodes();
                        }
                    });
                });

                el.addEventListener('mousedown', (e) => {
                    if (isReadOnly || e.target.classList.contains('handle')) return; 
                    if (content.contentEditable === "true") { e.stopPropagation(); return; }
                    e.stopPropagation();
                    if(connectingEdge) return;
                    hideEdgeEditor();
                    selectedNodeId = node.id; selectedEdgeId = null; draggingNode = node.id;
                    renderNodes(); renderEdges(); positionToolbars();
                    tagDropdown.style.display = 'none';
                });

                el.addEventListener('dblclick', (e) => {
                    if (isReadOnly) return; e.stopPropagation();
                    activateNodeEditor(content, node); 
                });

                if (selectedNodeId === node.id && !isReadOnly) {
                    ['nw', 'ne', 'sw', 'se'].forEach(c => {
                        const h = document.createElement('div'); h.className = `handle resize-handle ${c}`;
                        h.addEventListener('mousedown', (e) => { e.stopPropagation(); resizingNode = { id: node.id, corner: c }; });
                        el.appendChild(h);
                    });
                    ['n', 's', 'e', 'w'].forEach(s => {
                        const h = document.createElement('div'); h.className = `handle connect-handle ${s}-side`;
                        h.addEventListener('mousedown', (e) => {
                            e.stopPropagation(); const rect = h.getBoundingClientRect();
                            const sCoords = getCanvasCoords({ clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 });
                            connectingEdge = { fromNode: node.id, fromSide: s, startX: sCoords.x, startY: sCoords.y };
                        });
                        el.appendChild(h);
                    });
                }
                nodesContainer.appendChild(el);
            });
        };
        
        // Expose renderNodes to canvasState for API
        window.canvasState.renderNodes = renderNodes;

        const renderEdges = () => {
            const defs = svgLayer.querySelector('defs');
            svgLayer.innerHTML = ''; svgLayer.appendChild(defs);
            edges.forEach(edge => {
                const n1 = nodes.find(n => n.id === edge.fromNode); const n2 = nodes.find(n => n.id === edge.toNode);
                if (!n1 || !n2) return;
                const p1 = getSideCoords(n1, edge.fromSide); const p2 = getSideCoords(n2, edge.toSide);
                const d = generateBezier(p1.x, p1.y, p2.x, p2.y, edge.fromSide, edge.toSide);

                const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.setAttribute("class", `edge-group ${selectedEdgeId === edge.id ? 'selected' : ''}`);
                
                const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                hitPath.setAttribute("d", d); hitPath.setAttribute("class", "edge-hit-path");
                
                const visPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                visPath.setAttribute("d", d); visPath.setAttribute("class", "edge-visible-path"); visPath.setAttribute("stroke", edge.color);
                
                if(edge.direction === 'forward' || edge.direction === 'both') visPath.setAttribute("marker-end", "url(#arrow-end)");
                if(edge.direction === 'both') visPath.setAttribute("marker-start", "url(#arrow-start)");
                g.appendChild(hitPath); g.appendChild(visPath);

                if (edge.text) {
                    const isRightToLeft = p1.x > p2.x;
                    const textPathD = isRightToLeft ? generateBezier(p2.x, p2.y, p1.x, p1.y, edge.toSide, edge.fromSide) : d;
                    const hiddenTextPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    hiddenTextPath.setAttribute("d", textPathD); hiddenTextPath.setAttribute("id", `tpath-${edge.id}`);
                    hiddenTextPath.setAttribute("fill", "none"); hiddenTextPath.setAttribute("stroke", "none");
                    g.appendChild(hiddenTextPath);

                    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    textEl.setAttribute("class", "edge-svg-text"); textEl.setAttribute("dy", "-6"); textEl.setAttribute("fill", edge.color);
                    const textPathEl = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
                    textPathEl.setAttribute("href", `#tpath-${edge.id}`); textPathEl.setAttribute("startOffset", "50%"); textPathEl.setAttribute("text-anchor", "middle"); textPathEl.textContent = edge.text;
                    textEl.appendChild(textPathEl); g.appendChild(textEl);
                }
                svgLayer.appendChild(g);

                hitPath.addEventListener('mousedown', (e) => {
                    if (isReadOnly) return; e.stopPropagation(); hideEdgeEditor();
                    selectedEdgeId = edge.id; selectedNodeId = null;
                    renderNodes(); renderEdges(); positionToolbars();
                    tagDropdown.style.display = 'none';
                });
                hitPath.addEventListener('dblclick', (e) => { if (isReadOnly) return; e.stopPropagation(); openEdgeEditor(edge); });
            });
        };
        
        // Expose renderEdges to canvasState for API
        window.canvasState.renderEdges = renderEdges;

        const openEdgeEditor = (edge) => {
            activeEditEdge = edge;
            const n1 = nodes.find(n => n.id === edge.fromNode); const n2 = nodes.find(n => n.id === edge.toNode);
            const p1 = getSideCoords(n1, edge.fromSide); const p2 = getSideCoords(n2, edge.toSide);
            const mid = getBezierMidpoint(p1.x, p1.y, p2.x, p2.y, edge.fromSide, edge.toSide);
            edgeTextEditor.style.display = 'block'; edgeTextEditor.style.left = `${mid.x}px`; edgeTextEditor.style.top = `${mid.y}px`;
            edgeTextEditor.innerText = edge.text || ""; edgeTextEditor.focus();
            const range = document.createRange(); const sel = window.getSelection(); range.selectNodeContents(edgeTextEditor); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
            edgeTextEditor.onblur = () => { if (activeEditEdge === edge) saveEdgeText(edge); };
            edgeTextEditor.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdgeText(edge); } };
        };

        const saveEdgeText = (edge) => {
            edge.text = edgeTextEditor.innerText.trim(); 
            edgeTextEditor.style.display = 'none';
            activeEditEdge = null;
            saveToHistory(); renderEdges();
        };

        const hideEdgeEditor = () => { if (activeEditEdge) saveEdgeText(activeEditEdge); };

        viewport.onmousedown = (e) => {
            tagDropdown.style.display = 'none';
            if (!e.target.closest('#color-popover') && !e.target.closest('#btn-node-color-pop') && !e.target.closest('#btn-edge-color-pop')) {
                colorPopover.style.display = 'none';
            }
            if (e.target.closest('.node') || e.target.closest('.toolbar') || e.target.closest('.edge-group') || e.target.closest('#side-toolbar') || e.target.id === 'edge-text-editor' || e.target.id === 'btn-back-to-manager' || e.target.closest('#tag-dropdown')) return;
            isPanning = true; canvas.style.transition = 'none';
            startClientX = e.clientX - panX; startClientY = e.clientY - panY;
            clearSelection(); hideEdgeEditor();
        };

        window.onmousemove = (e) => {
            if(workspace.style.display === 'none') return;
            const mx = e.movementX / scale; const my = e.movementY / scale;
            if (isPanning) {
                panX = e.clientX - startClientX; panY = e.clientY - startClientY; updateTransform();
            } else if (!isReadOnly) {
                if (draggingNode) {
                    isDragging = true; const node = nodes.find(n => n.id === draggingNode);
                    node.x += mx; node.y += my; renderNodes(); renderEdges(); positionToolbars();
                } else if (resizingNode) {
                    isDragging = true; 
                    const node = nodes.find(n => n.id === resizingNode.id); const minW = 100, minH = 40;
                    if(resizingNode.corner.includes('e')) { node.w = Math.max(minW, node.w + mx); }
                    if(resizingNode.corner.includes('w')) { let ow = node.w; node.w = Math.max(minW, node.w - mx); if(node.w > minW) node.x += mx; }
                    if(resizingNode.corner.includes('s')) { node.h = Math.max(minH, node.h + my); }
                    if(resizingNode.corner.includes('n')) { let oh = node.h; node.h = Math.max(minH, node.h - my); if(node.h > minH) node.y += my; }
                    renderNodes(); renderEdges(); positionToolbars();
                } else if (connectingEdge) {
                    let temp = document.getElementById('temp-line');
                    if (!temp) {
                        temp = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        temp.id = 'temp-line'; temp.setAttribute("stroke", "#888"); temp.setAttribute("stroke-width", "2"); temp.setAttribute("fill", "none"); temp.setAttribute("marker-end", "url(#arrow-end)"); svgLayer.appendChild(temp);
                    }
                    const cur = getCanvasCoords(e);
                    temp.setAttribute("d", generateBezier(connectingEdge.startX, connectingEdge.startY, cur.x, cur.y, connectingEdge.fromSide, 'any'));
                }
            }
        };

        window.onmouseup = (e) => {
            if(workspace.style.display === 'none') return;
            if (connectingEdge && !isReadOnly) {
                const targetEl = document.elementFromPoint(e.clientX, e.clientY);
                const targetNodeEl = targetEl ? targetEl.closest('.node') : null;
                if (targetNodeEl && targetNodeEl.id !== connectingEdge.fromNode) {
                    const toNodeId = targetNodeEl.id; const rect = targetNodeEl.getBoundingClientRect();
                    const dx = e.clientX - (rect.left + rect.width/2); const dy = e.clientY - (rect.top + rect.height/2);
                    let toSide = 'w'; if (Math.abs(dx) > Math.abs(dy)) { toSide = dx > 0 ? 'e' : 'w'; } else { toSide = dy > 0 ? 's' : 'n'; }
                    edges.push({ id: `e${nextEdgeId++}`, fromNode: connectingEdge.fromNode, fromSide: connectingEdge.fromSide, toNode: toNodeId, toSide: toSide, text: "", color: "#888", direction: "forward" });
                    saveToHistory();
                }
                renderEdges();
            }
            if (isDragging) saveToHistory();
            isPanning = false; isDragging = false; draggingNode = null; resizingNode = null; connectingEdge = null;
            const temp = document.getElementById('temp-line'); if(temp) temp.remove();
        };

        viewport.onwheel = (e) => {
            e.preventDefault(); canvas.style.transition = 'none';
            const delta = e.deltaY * -0.001; const newScale = Math.min(Math.max(0.1, scale * (1 + delta)), 3);
            const rect = viewport.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
            panX = mouseX - (mouseX - panX) * (newScale / scale); panY = mouseY - (mouseY - panY) * (newScale / scale);
            scale = newScale; updateTransform(); positionToolbars();
        };

        viewport.ondblclick = (e) => {
            if (isReadOnly || e.target.closest('.node') || e.target.closest('.toolbar') || e.target.closest('.edge-group') || e.target.closest('#side-toolbar') || e.target.id === 'edge-text-editor' || e.target.id === 'btn-back-to-manager' || e.target.closest('#tag-dropdown') || e.target.closest('#color-popover')) return;
            const coords = getCanvasCoords(e);
            
            const newNodeId = `n${nextNodeId++}`;
            const newNode = { id: newNodeId, text: '', x: coords.x, y: coords.y, w: 150, h: 60, color: '#1e1e1e' };
            nodes.push(newNode);
            
            selectedNodeId = newNodeId;
            selectedEdgeId = null;
            
            saveToHistory(); 
            renderNodes();
            positionToolbars();
            
            const el = document.getElementById(newNodeId);
            if (el) {
                const content = el.querySelector('.node-content');
                if (content) {
                    activateNodeEditor(content, newNode);
                }
            }
        };

        document.getElementById('btn-undo').onclick = () => { if (historyIndex > 0) { historyIndex--; const state = history[historyIndex]; nodes = JSON.parse(JSON.stringify(state.nodes)); edges = JSON.parse(JSON.stringify(state.edges)); clearSelection(); hideEdgeEditor(); Storage.save(dataId + '_nodes', nodes); Storage.save(dataId + '_edges', edges); FreeCanvasManager.extractGlobalTasks(dataId, nodes); } };
        document.getElementById('btn-redo').onclick = () => { if (historyIndex < history.length - 1) { historyIndex++; const state = history[historyIndex]; nodes = JSON.parse(JSON.stringify(state.nodes)); edges = JSON.parse(JSON.stringify(state.edges)); clearSelection(); hideEdgeEditor(); Storage.save(dataId + '_nodes', nodes); Storage.save(dataId + '_edges', edges); FreeCanvasManager.extractGlobalTasks(dataId, nodes); } };
        
        document.getElementById('btn-mode').onclick = (e) => {
            isReadOnly = !isReadOnly; const btn = e.target;
            if (isReadOnly) { btn.innerText = '👁️'; btn.title = "Read Only"; workspace.classList.add('read-only'); clearSelection(); hideEdgeEditor(); } 
            else { btn.innerText = '✏️'; btn.title = "Edit Mode"; workspace.classList.remove('read-only'); }
        };
        
        document.getElementById('btn-global-focus').onclick = () => {
            if (nodes.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(n => { if(n.x < minX) minX = n.x; if(n.y < minY) minY = n.y; if(n.x + n.w > maxX) maxX = n.x + n.w; if(n.y + n.h > maxY) maxY = n.y + n.h; });
            const bWidth = maxX - minX; const bHeight = maxY - minY;
            const cX = minX + bWidth/2; const cY = minY + bHeight/2;
            const scaleX = viewport.clientWidth / (bWidth + 200); const scaleY = viewport.clientHeight / (bHeight + 200);
            focusOnTarget(cX, cY, Math.min(scaleX, scaleY, 1.5));
        };

        document.getElementById('btn-node-focus').onclick = () => { const n = nodes.find(n => n.id === selectedNodeId); if(n) focusOnTarget(n.x + n.w/2, n.y + n.h/2, 1.5); };
        document.getElementById('btn-edge-focus').onclick = () => { const edge = edges.find(e => e.id === selectedEdgeId); if(edge) { const n1 = nodes.find(n => n.id === edge.fromNode); const n2 = nodes.find(n => n.id === edge.toNode); const p1 = getSideCoords(n1, edge.fromSide); const p2 = getSideCoords(n2, edge.toSide); const mid = getBezierMidpoint(p1.x, p1.y, p2.x, p2.y, edge.fromSide, edge.toSide); focusOnTarget(mid.x, mid.y, 1.5); } };
        
        document.getElementById('btn-node-delete').onclick = () => { nodes = nodes.filter(n => n.id !== selectedNodeId); edges = edges.filter(e => e.fromNode !== selectedNodeId && e.toNode !== selectedNodeId); clearSelection(); saveToHistory(); };
        
        document.getElementById('btn-node-edit').onclick = () => { 
            const el = document.getElementById(selectedNodeId); 
            const content = el.querySelector('.node-content'); 
            const node = nodes.find(n => n.id === selectedNodeId);
            if(content && node) activateNodeEditor(content, node); 
        };
        
        document.getElementById('btn-edge-delete').onclick = () => { edges = edges.filter(e => e.id !== selectedEdgeId); clearSelection(); saveToHistory(); };
        document.getElementById('btn-edge-direction').onclick = () => { const e = edges.find(ed => ed.id === selectedEdgeId); if(e) { const dirs = ['forward', 'both', 'none']; e.direction = dirs[(dirs.indexOf(e.direction) + 1) % dirs.length]; renderEdges(); saveToHistory(); } };
        document.getElementById('btn-edge-text').onclick = () => { const edge = edges.find(e => e.id === selectedEdgeId); if (edge) openEdgeEditor(edge); };

        const insertListFormat = (prefix) => {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (!node) return;
            const el = document.getElementById(selectedNodeId);
            const contentEl = el ? el.querySelector('.node-content') : null;
            if (contentEl) {
                if (contentEl.contentEditable !== "true") activateNodeEditor(contentEl, node);
                if (prefix === 'num') {
                    let lines = contentEl.innerText.split('\n');
                    let maxNum = 0;
                    lines.forEach(l => {
                        let m = l.trim().match(/^(\d+)\./);
                        if (m && parseInt(m[1]) > maxNum) maxNum = parseInt(m[1]);
                    });
                    prefix = `${maxNum + 1}. `;
                }
                let needsNewline = contentEl.innerText.trim().length > 0 && !contentEl.innerText.endsWith('\n');
                document.execCommand('insertText', false, (needsNewline ? '\n' : '') + prefix);
            }
        };

        document.getElementById('btn-list-bullet').onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); insertListFormat('• '); };
        document.getElementById('btn-list-num').onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); insertListFormat('num'); };
        document.getElementById('btn-list-todo').onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); insertListFormat('[ ] '); };

        loadState(); updateTransform(); renderNodes(); renderEdges();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    FreeCanvasManager.setup();
});