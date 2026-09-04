// modules/canvas.engine.js

const CanvasEngine = {
    // 🌟 आपके @task और @date को निकालकर ग्लोबल लिस्ट में भेजने वाला लॉजिक
    extractGlobalTasks: function(canvasId, nodes) {
        let globalTasks = Storage.load('global_canvas_tasks') || [];
        let canvasList = Storage.load('app_canvas_list') || [];
        let currentCanvas = canvasList.find(c => c.id === canvasId);
        let canvasName = currentCanvas ? currentCanvas.name : "Canvas";

        globalTasks = globalTasks.filter(t => t.canvasId !== canvasId);

        const taskRegex = /@task\s+([\s\S]*?)@date\s+(\d{2}\s+\d{2}\s+\d{4})(?:\s+to\s+(\d{2}\s+\d{2}\s+\d{4}))?/gi;

        nodes.forEach(node => {
            if(!node.text) return;
            let match;
            while ((match = taskRegex.exec(node.text)) !== null) {
                let rawTaskName = match[1].trim(); 
                let startDate = match[2].trim();
                let endDate = match[3] ? match[3].trim() : startDate;
                let dateRaw = match[3] ? `${startDate} to ${endDate}` : startDate;

                globalTasks.push({
                    id: 'ctask_' + Date.now() + '_' + Math.floor(Math.random()*10000),
                    canvasId: canvasId,
                    canvasName: canvasName,
                    nodeId: node.id,
                    dateRaw: dateRaw,            
                    taskName: rawTaskName, 
                    category: "Canvas",          
                    isCompleted: false,
                    createdAt: Date.now()
                });
            }
        });
        Storage.save('global_canvas_tasks', globalTasks);
    },

    // 🌟 गणित वाले फंक्शन्स (Math Engine)
    getSideCoords: function(node, side) {
        switch(side) {
            case 'n': return { x: node.x + node.w/2, y: node.y }; 
            case 's': return { x: node.x + node.w/2, y: node.y + node.h };
            case 'e': return { x: node.x + node.w, y: node.y + node.h/2 }; 
            case 'w': return { x: node.x, y: node.y + node.h/2 };
        }
    },

    generateBezier: function(x1, y1, x2, y2, s1, s2) {
        const off = 100; let cx1 = x1, cy1 = y1, cx2 = x2, cy2 = y2;
        if(s1 === 'n') cy1 -= off; else if(s1 === 's') cy1 += off; else if(s1 === 'e') cx1 += off; else if(s1 === 'w') cx1 -= off;
        if(s2 === 'n') cy2 -= off; else if(s2 === 's') cy2 += off; else if(s2 === 'e') cx2 += off; else if(s2 === 'w') cx2 -= off;
        else { cx2 = cx1; cy2 = cy1; }
        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    },

    getBezierMidpoint: function(x1, y1, x2, y2, s1, s2) {
        const off = 100; let cx1 = x1, cy1 = y1, cx2 = x2, cy2 = y2;
        if(s1 === 'n') cy1 -= off; else if(s1 === 's') cy1 += off; else if(s1 === 'e') cx1 += off; else if(s1 === 'w') cx1 -= off;
        if(s2 === 'n') cy2 -= off; else if(s2 === 's') cy2 += off; else if(s2 === 'e') cx2 += off; else if(s2 === 'w') cx2 -= off;
        return { x: 0.125*x1 + 0.375*cx1 + 0.375*cx2 + 0.125*x2, y: 0.125*y1 + 0.375*cy1 + 0.375*cy2 + 0.125*y2 };
    }
};