// modules/canvas/canvas.ui.js

const CanvasUI = {
    // 🌟 यहाँ आपका पूरा CSS है (Flexbox Alignment Bug Fixed)
    styles: `
        /* --- Canvas Manager UI Styles --- */
        #canvas-manager-view { padding: 20px; color: #fff; height: 100%; overflow-y: auto; }
        .canvas-header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .canvas-header-flex h2 { margin: 0; font-size: 24px; }
        .btn-add-canvas { background: #a371f7; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; transition: 0.2s; }
        .btn-add-canvas:hover { background: #8c52ea; }
        
        .canvas-divider { border: 0; height: 2px; background: linear-gradient(to right, #a371f7, transparent); margin-bottom: 25px; }
        
        .canvas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
        .canvas-card { background: #1e1e1e; border: 1px solid #444; border-radius: 10px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        
        .canvas-card:hover { border-color: #a371f7; transform: translateY(-5px); box-shadow: 0 12px 25px rgba(163, 113, 247, 0.4); }
        .canvas-card h3 { margin: 0 0 10px 0; font-size: 18px; }
        .canvas-card p { margin: 0; font-size: 12px; color: #888; }
        .delete-canvas-btn { margin-top: 15px; background: transparent; color: #ff5555; border: 1px solid #ff5555; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; transition: 0.2s; }
        .delete-canvas-btn:hover { background: #ff5555; color: white; box-shadow: 0 0 8px rgba(255,85,85,0.5); }

        #canvas-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; justify-content: center; align-items: center; }
        .canvas-modal-content { background: #2a2a2a; padding: 25px; border-radius: 10px; border: 1px solid #a371f7; width: 300px; text-align: center; }
        .canvas-modal-content input { width: 90%; padding: 10px; margin: 15px 0; background: #111; border: 1px solid #444; color: white; border-radius: 5px; outline: none; }
        .canvas-modal-content input:focus { border-color: #a371f7; box-shadow: 0 0 5px rgba(163,113,247,0.5); }
        .modal-btns { display: flex; justify-content: space-between; }
        .modal-btns button { padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        .btn-cancel { background: #444; color: white; }
        .btn-cancel:hover { background: #555; }
        .btn-create { background: #a371f7; color: white; }
        
        #canvas-workspace { display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; overflow: hidden; background-color: #000000; font-family: Arial, sans-serif; color: #ffffff; }
        #btn-back-to-manager { position: absolute; top: 20px; left: 20px; z-index: 10000; background-color: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.4); transition: 0.2s; }
        #btn-back-to-manager:hover { background-color: #333; border-color: #a371f7; box-shadow: 0 0 10px rgba(163,113,247,0.3); }

        #viewport { width: 100%; height: 100%; position: absolute; top:0; left:0; cursor: grab; }
        #viewport:active { cursor: grabbing; }
        #canvas-workspace.read-only #viewport { cursor: move; }
        #canvas-workspace.read-only .node { cursor: default; }
        #canvas-workspace.read-only .edge-hit-path { cursor: default; }
        #canvas { position: absolute; transform-origin: 0 0; width: 10000px; height: 10000px; background-image: radial-gradient(circle, #333 1px, transparent 1px); background-size: 24px 24px; }
        #svg-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        .edge-hit-path { stroke: transparent; stroke-width: 20; fill: none; pointer-events: visibleStroke; cursor: pointer; }
        .edge-visible-path { stroke-width: 2; fill: none; pointer-events: none; transition: stroke 0.2s; }
        .edge-group.selected .edge-visible-path { stroke: #a371f7 !important; stroke-width: 3; filter: drop-shadow(0 0 5px rgba(163,113,247,0.5)); }
        .edge-svg-text { font-size: 14px; font-weight: bold; pointer-events: none; user-select: none; }
        
        .node { 
            position: absolute; 
            background-color: var(--node-bg, #1e1e1e); 
            border: 1px solid var(--node-color, #444); 
            border-radius: 8px; 
            padding: 15px; 
            min-width: 100px; 
            min-height: 40px; 
            box-sizing: border-box; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.2); 
            transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s; 
        }
        .node.selected { border-color: #a371f7 !important; box-shadow: 0 0 15px rgba(163,113,247,0.3); }
        
        /* 🌟 FIXED: display: block करने से span लाइन के ऊपर नहीं जाएंगे, एक ही लाइन में रहेंगे! */
        .node-content { width: 100%; height: 100%; display: block; text-align: left; outline: none; cursor: pointer; word-break: break-word; user-select: none; box-sizing: border-box; overflow-y: auto; }
        .node-content[contenteditable="true"] { cursor: text; user-select: text; }
        
        .glow-tag { color: #00e5ff; text-shadow: 0 0 8px rgba(0, 229, 255, 0.6); font-weight: bold; background: rgba(0, 229, 255, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px; }

        .handle { position: absolute; display: none; background: #a371f7; z-index: 10; box-shadow: 0 0 5px rgba(163,113,247,0.8); }
        .node.selected .handle { display: block; }
        #canvas-workspace.read-only .handle { display: none !important; }
        .resize-handle { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #fff; }
        .nw { top: -6px; left: -6px; cursor: nwse-resize; } .ne { top: -6px; right: -6px; cursor: nesw-resize; }
        .sw { bottom: -6px; left: -6px; cursor: nesw-resize; } .se { bottom: -6px; right: -6px; cursor: nwse-resize; }
        .connect-handle { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; }
        .n-side { top: -8px; left: calc(50% - 6px); cursor: crosshair; } .s-side { bottom: -8px; left: calc(50% - 6px); cursor: crosshair; }
        .e-side { top: calc(50% - 6px); right: -8px; cursor: crosshair; } .w-side { top: calc(50% - 6px); left: -8px; cursor: crosshair; }
        
        .toolbar { position: absolute; background-color: #2a2a2a; border: 1px solid #444; border-radius: 6px; padding: 5px; display: none; gap: 5px; z-index: 1000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); cursor: default; }
        .toolbar button, .toolbar label { background-color: #444; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; display: inline-block; }
        .toolbar button:hover, .toolbar label:hover { background-color: #555; }
        .toolbar button.btn-focus { background-color: #a371f7; font-weight: bold; }
        
        #color-popover { position: absolute; background-color: #1e1e1e; border: 1px solid #a371f7; border-radius: 6px; padding: 10px; display: none; z-index: 1001; box-shadow: 0 4px 15px rgba(0,0,0,0.6); flex-direction: column; width: 140px; }
        .popover-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
        .color-palette { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; border-top: 1px solid #444; }
        .swatch { width: 20px; height: 20px; border-radius: 4px; cursor: pointer; border: 1px solid #555; transition: 0.1s; }
        .swatch:hover { border-color: #fff; transform: scale(1.1); }
        input[type="color"] { border: none; border-radius: 4px; cursor: pointer; padding: 0; background: transparent; width: 30px; height: 30px; }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: 1px solid #555; border-radius: 4px; }
        
        .edge-text-editor { position: absolute; background: #000; color: #fff; border: 1px solid #a371f7; border-radius: 4px; padding: 4px 8px; font-size: 14px; transform: translate(-50%, -50%); outline: none; z-index: 100; display: none; min-width: 50px; text-align: center; }
        
        #side-toolbar { position: absolute; top: 50%; right: 20px; transform: translateY(-50%); display: flex; flex-direction: column; gap: 10px; z-index: 1000; }
        .side-btn { background-color: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 8px; width: 45px; height: 45px; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.4); transition: 0.2s; }
        .side-btn:hover { background-color: #333; box-shadow: 0 0 10px rgba(163,113,247,0.3); }
        .side-btn.active { border-color: #a371f7; color: #a371f7; }

        #tag-dropdown { position: absolute; background: #1e1e1e; border: 1px solid #a371f7; border-radius: 6px; display: none; z-index: 10001; box-shadow: 0 4px 15px rgba(0,0,0,0.6); overflow: hidden; width: 120px; }
        .tag-option { padding: 10px 12px; cursor: pointer; color: #fff; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; }
        .tag-option:last-child { border-bottom: none; }
        .tag-option:hover { background: #a371f7; }

        /* 🌟 FIXED: inline डिस्प्ले करने से लिस्ट और टेक्स्ट एकदम सीध में रहेंगे */
        #node-bottom-toolbar { position: absolute; background-color: #2a2a2a; border: 1px solid #a371f7; border-radius: 6px; padding: 5px; display: none; gap: 6px; z-index: 1000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        #node-bottom-toolbar button { background-color: #1e1e1e; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s; }
        #node-bottom-toolbar button:hover { background-color: #a371f7; border-color: #fff; box-shadow: 0 0 8px rgba(163,113,247,0.5); }
        
        .todo-box { cursor: pointer; font-size: 16px; margin-right: 6px; color: #a371f7; display: inline-block; vertical-align: middle; transition: 0.2s; user-select: none; }
        .todo-box:hover { transform: scale(1.2); text-shadow: 0 0 8px rgba(163,113,247,0.8); }
        .todo-box.checked { color: #03dac6; }
        .bullet-dot { color: #a371f7; font-weight: bold; margin-right: 6px; display: inline; }
        .list-num { color: #03dac6; font-weight: bold; margin-right: 6px; display: inline; }
    `,

    // 🌟 यहाँ आपका पूरा HTML ढाँचा है
    layoutHTML: `
        <div id="canvas-manager-view">
            <div class="canvas-header-flex">
                <h2>Your Canvases</h2>
                <button class="btn-add-canvas" onclick="FreeCanvasManager.openModal()">+ Add New Canvas</button>
            </div>
            <hr class="canvas-divider">
            <div id="canvas-grid" class="canvas-grid"></div>
        </div>

        <div id="canvas-modal">
            <div class="canvas-modal-content">
                <h3>Name Your Canvas</h3>
                <input type="text" id="new-canvas-name" placeholder="e.g. Science Concepts..." autocomplete="off">
                <div class="modal-btns">
                    <button class="btn-cancel" onclick="FreeCanvasManager.closeModal()">Cancel</button>
                    <button class="btn-create" onclick="FreeCanvasManager.createCanvas()">Create</button>
                </div>
            </div>
        </div>

        <div id="canvas-workspace">
            <button id="btn-back-to-manager" onclick="FreeCanvasManager.closeWorkspace()">⬅ Back</button>
            
            <div id="side-toolbar">
                <button class="side-btn" id="btn-global-focus" title="Search/Focus All">🔍</button>
                <button class="side-btn" id="btn-undo" title="Undo">↩️</button>
                <button class="side-btn" id="btn-redo" title="Redo">↪️</button>
                <button class="side-btn" id="btn-mode" title="Toggle Edit/Read-Only">✏️</button>
            </div>

            <div id="viewport">
                <div id="canvas" style="transform: translate(0px, 0px) scale(1);">
                    <svg id="svg-layer">
                        <defs>
                            <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" class="marker-path"/>
                            </marker>
                            <marker id="arrow-start" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                                <path d="M 10 0 L 0 5 L 10 10 z" fill="#888" class="marker-path"/>
                            </marker>
                        </defs>
                    </svg>
                    <div id="edges-ui-container">
                        <div id="edge-text-editor" contenteditable="true" class="edge-text-editor"></div>
                    </div>
                    <div id="nodes-container"></div>
                </div>
            </div>

            <div id="node-toolbar" class="toolbar">
                <button id="btn-node-focus" class="btn-focus">Focus</button>
                <button id="btn-node-edit">Edit Text</button>
                <button id="btn-node-color-pop">Color</button>
                <button id="btn-node-delete" style="background:#ff5555;">Delete</button>
            </div>

            <div id="node-bottom-toolbar" class="toolbar">
                <button id="btn-list-bullet" title="Add Bullet">• Bullet</button>
                <button id="btn-list-num" title="Add Number">1. Number</button>
                <button id="btn-list-todo" title="Add Checklist">☑ To-Do</button>
            </div>

            <div id="edge-toolbar" class="toolbar">
                <button id="btn-edge-focus" class="btn-focus">Focus</button>
                <button id="btn-edge-text">Text</button>
                <button id="btn-edge-direction">Direction</button>
                <button id="btn-edge-color-pop">Color</button>
                <button id="btn-edge-delete" style="background:#ff5555;">Delete</button>
            </div>
            
            <div id="color-popover">
                <div class="popover-row">
                    <input type="color" id="popover-color-picker">
                    <button id="btn-popover-save" style="background:#03dac6; color:#000; border:none; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer; flex:1;">Save</button>
                </div>
                <div id="popover-swatches" class="color-palette"></div>
            </div>
        </div>
        
        <div id="tag-dropdown">
            <div class="tag-option" onmousedown="FreeCanvasManager.insertTag('@task', event)">@task</div>
            <div class="tag-option" onmousedown="FreeCanvasManager.insertTag('@date', event)">@date</div>
        </div>
    `,

    // 🌟 डिज़ाइन रेंडर करने वाला फॉर्मेटिंग फंक्शन
    formatNodeHTML: function(text) {
        if(!text) return "";
        let lines = text.split('\n');
        let formattedLines = lines.map((line, index) => {
            let trimmed = line.trim();
            if (trimmed.startsWith('[ ]')) {
                return line.replace(/\[\s*\]/, `<span class="todo-box" data-line="${index}">☐</span>`);
            } else if (trimmed.startsWith('[x]') || trimmed.startsWith('[X]')) {
                return line.replace(/\[[xX]\]/, `<span class="todo-box checked" data-line="${index}">☑</span>`);
            } else if (trimmed.startsWith('•')) {
                return line.replace('•', `<span class="bullet-dot">•</span>`);
            } else if (/^\d+\.\s/.test(trimmed)) {
                return line.replace(/^(\s*?)(\d+\.\s)/, `$1<span class="list-num">$2</span>`);
            }
            return line;
        });
        let html = formattedLines.join('<br>');
        html = html.replace(/(@task)/gi, '<span class="glow-tag">$1</span>');
        const datePattern = /(@date\s+\d{2}\s+\d{2}\s+\d{4}(?:\s+to\s+\d{2}\s+\d{2}\s+\d{4})?)/gi;
        html = html.replace(datePattern, '<span class="glow-tag">$1</span>');
        return html;
    }
};