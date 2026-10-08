/**
 * MapEditor.js - 2D Grid-based Map Editor
 * Features: Drag-to-paint, multiple zombies per cell (up to 10)
 */

class MapEditor {
    constructor() {
        this.canvas = document.getElementById('editor-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Grid settings
        this.gridSize = 20;
        this.cellSize = this.canvas.width / this.gridSize;

        // Map data
        this.walls = [];
        this.playerSpawn = null;
        this.winPoint = null;
        this.zombieSpawns = []; // {x, z, count}
        this.chests = [];

        // Current tool
        this.selectedTool = 'wall';
        this.pendingChest = null;

        // Drag painting
        this.isMouseDown = false;
        this.lastCell = null;

        this.init();
    }

    init() {
        console.log('MapEditor init started');
        // this.refreshMapList(); // Don't auto-open modal on init

        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // If it's the erase tool, we keep it for now as visual feedback or backup
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedTool = btn.dataset.tool;

                if (this.selectedTool !== 'chest') {
                    const selector = document.getElementById('chest-item-selector');
                    if (selector) selector.classList.add('hidden');
                }
            });
        });

        // Mouse events for drag painting
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.handlePaint(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            // Visual Cursor Update
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.cellSize);
            const z = Math.floor((e.clientY - rect.top) / this.cellSize);

            if (this.isBorder(x, z)) {
                this.canvas.style.cursor = 'not-allowed';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }

            if (this.isMouseDown) {
                this.handlePaint(e);
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            this.lastCell = null;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseDown = false;
            this.lastCell = null;
        });

        // Disable context menu for Right Click Erase
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        // Save/Load buttons with null checks
        const saveBtn = document.getElementById('save-map-btn');
        const clearBtn = document.getElementById('clear-map-btn');
        const loadBtn = document.getElementById('load-map-btn');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveMap());
            console.log('Save button listener added');
        } else {
            console.error('save-map-btn not found!');
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearMap());
        }

        if (loadBtn) {
            loadBtn.remove(); // Button removed from HTML, but cleaning up possible JS reference
        }

        // Automatic Map List Population
        this.refreshMapList();


        // Chest item selector
        const confirmChest = document.getElementById('confirm-chest');
        if (confirmChest) {
            confirmChest.addEventListener('click', () => {
                if (this.pendingChest) {
                    const item = document.getElementById('chest-item').value;
                    this.chests.push({ x: this.pendingChest.x, z: this.pendingChest.z, item: item });
                    this.pendingChest = null;
                    document.getElementById('chest-item-selector').classList.add('hidden');
                    this.render();
                }
            });
        }

        this.render();
        console.log('MapEditor init complete');
    }

    isBorder(x, z) {
        return x === 0 || z === 0 || x === this.gridSize - 1 || z === this.gridSize - 1;
    }

    handlePaint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const z = Math.floor((e.clientY - rect.top) / this.cellSize);

        // console.log(`Paint at: ${x}, ${z}. Tool: ${this.selectedTool}`);

        if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) return;

        // BORDER PROTECTION REMOVED - allow user to edit borders


        // Skip if same cell as last (for drag)
        if (this.lastCell && this.lastCell.x === x && this.lastCell.z === z) return;
        this.lastCell = { x, z };

        // Right click determines tool
        let toolToUse = this.selectedTool;
        if (e.button === 2 || e.buttons === 2) {
            toolToUse = 'erase';
        }

        switch (toolToUse) {
            case 'wall':
                if (!this.isCellOccupied(x, z)) {
                    this.addWall(x, z);
                }
                break;
            case 'spawn':
                this.clearCell(x, z);
                this.playerSpawn = { x, z };
                break;
            case 'win':
                this.clearCell(x, z);
                this.winPoint = { x, z };
                break;
            case 'zombie':
                // Zombies can stack, but not on other objects
                if (!this.hasNonZombieObject(x, z)) {
                    this.addZombie(x, z);
                }
                break;
            case 'chest':
                if (!this.isCellOccupied(x, z)) {
                    this.pendingChest = { x, z };
                    document.getElementById('chest-item-selector').classList.remove('hidden');
                    return;
                }
                break;
            case 'erase':
                this.eraseAt(x, z);
                break;
        }

        this.render();
    }

    isCellOccupied(x, z) {
        if (this.walls.some(w => w.x === x && w.z === z)) return true;
        if (this.playerSpawn && this.playerSpawn.x === x && this.playerSpawn.z === z) return true;
        if (this.winPoint && this.winPoint.x === x && this.winPoint.z === z) return true;
        if (this.zombieSpawns.some(s => s.x === x && s.z === z)) return true;
        if (this.chests.some(c => c.x === x && c.z === z)) return true;
        return false;
    }

    hasNonZombieObject(x, z) {
        if (this.walls.some(w => w.x === x && w.z === z)) return true;
        if (this.playerSpawn && this.playerSpawn.x === x && this.playerSpawn.z === z) return true;
        if (this.winPoint && this.winPoint.x === x && this.winPoint.z === z) return true;
        if (this.chests.some(c => c.x === x && c.z === z)) return true;
        return false;
    }

    clearCell(x, z) {
        this.walls = this.walls.filter(w => !(w.x === x && w.z === z));
        this.zombieSpawns = this.zombieSpawns.filter(s => !(s.x === x && s.z === z));
        this.chests = this.chests.filter(c => !(c.x === x && c.z === z));
    }

    addWall(x, z) {
        this.walls.push({ x, z });
    }

    addZombie(x, z) {
        const existing = this.zombieSpawns.find(s => s.x === x && s.z === z);
        if (existing) {
            // Increment count up to 10
            if (existing.count < 10) {
                existing.count++;
            }
        } else {
            this.zombieSpawns.push({ x, z, count: 1 });
        }
    }

    eraseAt(x, z) {
        // Prevent deleting border (already handled by isBorder check in handlePaint but safe to keep)
        if (this.isBorder(x, z)) return;

        this.walls = this.walls.filter(w => !(w.x === x && w.z === z));
        this.zombieSpawns = this.zombieSpawns.filter(s => !(s.x === x && s.z === z));
        this.chests = this.chests.filter(c => !(c.x === x && c.z === z));
        if (this.playerSpawn && this.playerSpawn.x === x && this.playerSpawn.z === z) {
            this.playerSpawn = null;
        }
        if (this.winPoint && this.winPoint.x === x && this.winPoint.z === z) {
            this.winPoint = null;
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        for (let i = 0; i <= this.gridSize; i++) {
            ctx.beginPath();
            ctx.moveTo(i * this.cellSize, 0);
            ctx.lineTo(i * this.cellSize, this.canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * this.cellSize);
            ctx.lineTo(this.canvas.width, i * this.cellSize);
            ctx.stroke();
        }

        // Border walls removed from static renderer - user draws them


        // Draw walls
        ctx.fillStyle = '#5D4037';
        this.walls.forEach(w => {
            ctx.fillRect(w.x * this.cellSize + 1, w.z * this.cellSize + 1,
                this.cellSize - 2, this.cellSize - 2);
        });



        // Draw player spawn
        if (this.playerSpawn) {
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc((this.playerSpawn.x + 0.5) * this.cellSize,
                (this.playerSpawn.z + 0.5) * this.cellSize,
                this.cellSize / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('S', (this.playerSpawn.x + 0.5) * this.cellSize,
                (this.playerSpawn.z + 0.65) * this.cellSize);
        }

        // Draw win point
        if (this.winPoint) {
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(this.winPoint.x * this.cellSize + 2,
                this.winPoint.z * this.cellSize + 2,
                this.cellSize - 4, this.cellSize - 4);
            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🏁', (this.winPoint.x + 0.5) * this.cellSize,
                (this.winPoint.z + 0.7) * this.cellSize);
        }

        // Draw zombie spawns (with count)
        this.zombieSpawns.forEach(s => {
            ctx.fillStyle = '#F44336';
            ctx.beginPath();
            ctx.arc((s.x + 0.5) * this.cellSize, (s.z + 0.5) * this.cellSize,
                this.cellSize / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(s.count.toString(), (s.x + 0.5) * this.cellSize, (s.z + 0.6) * this.cellSize);
        });

        // Draw chests
        ctx.fillStyle = '#FF9800';
        this.chests.forEach(c => {
            ctx.fillRect(c.x * this.cellSize + 3, c.z * this.cellSize + 3,
                this.cellSize - 6, this.cellSize - 6);
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('📦', (c.x + 0.5) * this.cellSize, (c.z + 0.7) * this.cellSize);
            ctx.fillStyle = '#FF9800';
        });
    }

    async saveMap() {
        const nameInput = document.getElementById('map-name');
        const name = nameInput.value.trim();
        if (!name) {
            alert('Введите название карты!');
            return;
        }

        if (!this.playerSpawn) {
            alert('Добавьте точку спавна игрока!');
            return;
        }

        const mapData = {
            name: name,
            gridSize: this.gridSize,
            walls: this.walls,
            playerSpawn: this.playerSpawn,
            winPoint: this.winPoint,
            zombieSpawns: this.zombieSpawns,
            chests: this.chests
        };

        try {
            const response = await fetch('/api/maps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapData)
            });

            const result = await response.json();
            if (response.ok) {
                alert('Карта "' + name + '" сохранена!');
                this.refreshMapList();
            } else if (response.status === 409) {
                alert('Ошибка: Карта с таким названием уже существует!');
            } else {
                alert('Ошибка сохранения: ' + result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Ошибка сети при сохранении');
        }
    }

    async loadMap(name, force = false) {
        // Dirty check
        if (!force && this.isDirty()) {
            if (!confirm('Действительно ли вы хотите, чтобы показалась другая карта? Иначе новые настройки не сохранятся.')) {
                return;
            }
        }


        try {
            const response = await fetch('/api/maps');
            const maps = await response.json();
            const mapData = maps[name];

            if (!mapData) {
                alert('Карта не найдена!');
                return;
            }

            this.walls = mapData.walls || [];
            this.playerSpawn = mapData.playerSpawn || null;
            this.winPoint = mapData.winPoint || null;
            this.zombieSpawns = mapData.zombieSpawns || [];
            this.chests = mapData.chests || [];

            this.zombieSpawns = this.zombieSpawns.map(s => ({
                x: s.x,
                z: s.z,
                count: s.count || 1
            }));

            document.getElementById('map-name').value = name;
            this.render();

        } catch (e) {
            console.error(e);
            alert('Ошибка загрузки карты');
        }
    }

    isDirty() {
        return this.walls.length > 0 || this.playerSpawn !== null || this.zombieSpawns.length > 0 || this.chests.length > 0;
    }


    clearMap() {
        this.walls = [];
        this.playerSpawn = null;
        this.winPoint = null;
        this.zombieSpawns = [];
        this.chests = [];
        document.getElementById('map-name').value = '';
        this.render();
    }

    // Updated: Render list directly in the editor bottom area
    async refreshMapList() {
        const listContainer = document.getElementById('editor-map-list');
        if (!listContainer) {
            console.warn("Editor map list container not found!");
            return;
        }

        listContainer.innerHTML = '';

        try {
            const response = await fetch('/api/maps');
            if (!response.ok) throw new Error("Failed to fetch maps");
            const maps = await response.json();
            const mapNames = Object.keys(maps);

            let mapOrder = [];
            try {
                mapOrder = JSON.parse(localStorage.getItem('mapOrder') || '[]');
                if (!Array.isArray(mapOrder)) mapOrder = [];
            } catch (e) { mapOrder = []; }

            mapOrder = mapOrder.filter(n => mapNames.includes(n));
            const remainingNames = mapNames.filter(n => !mapOrder.includes(n)).sort();
            const sortedNames = [...mapOrder, ...remainingNames];

            if (sortedNames.length === 0) {
                listContainer.innerHTML = '<p style="color:#aaa; padding: 10px;">Нет сохраненных карт</p>';
                return;
            }


            if (!this.dragInitialized) {
                this.dragInitialized = true;
                // Drag and Drop reorder logic for Editor
                listContainer.addEventListener('dragover', e => {
                    e.preventDefault();
                    const afterElement = this.getDragAfterElement(listContainer, e.clientX);
                    const draggingItem = document.querySelector('.map-card.dragging');
                    if (draggingItem && listContainer.contains(draggingItem)) {
                        if (afterElement == null) {
                            listContainer.appendChild(draggingItem);
                        } else {
                            listContainer.insertBefore(draggingItem, afterElement);
                        }
                    }
                });

                listContainer.addEventListener('drop', e => {
                    e.preventDefault();
                    const newOrder = Array.from(listContainer.querySelectorAll('.map-card'))
                        .map(card => card.dataset.name)
                        .filter(n => n);

                    localStorage.setItem('mapOrder', JSON.stringify(newOrder));
                    console.log("Editor: New map order saved:", newOrder);
                    // Also update game tab list
                    if (window.updateGameMapList) window.updateGameMapList();
                });
            }


            sortedNames.forEach(name => {
                const mapData = maps[name];

                const card = document.createElement('div');
                card.className = 'map-card';
                card.draggable = true;
                card.dataset.name = name;

                card.addEventListener('dragstart', () => {
                    card.classList.add('dragging');
                });

                card.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                });

                // Canvas Preview
                const cvs = document.createElement('canvas');
                cvs.className = 'map-preview-canvas';
                cvs.width = 80;
                cvs.height = 80;

                const ctx = cvs.getContext('2d');
                const cellSize = 80 / (mapData.gridSize || 20);

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, 80, 80);

                if (mapData.walls) {
                    ctx.fillStyle = '#5D4037';
                    mapData.walls.forEach(w => {
                        ctx.fillRect(w.x * cellSize, w.z * cellSize, cellSize, cellSize);
                    });
                }
                if (mapData.playerSpawn) {
                    ctx.fillStyle = '#4CAF50';
                    ctx.beginPath();
                    ctx.arc((mapData.playerSpawn.x + 0.5) * cellSize, (mapData.playerSpawn.z + 0.5) * cellSize, cellSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Delete Button
                const delBtn = document.createElement('div');
                delBtn.className = 'map-delete-btn';
                delBtn.innerText = '✕';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Удалить карту "${name}"?`)) {
                        await fetch(`/api/maps?name=${name}`, { method: 'DELETE' });
                        this.refreshMapList();
                        if (window.updateGameMapList) window.updateGameMapList(true);
                    }
                };

                const nameDiv = document.createElement('div');
                nameDiv.className = 'map-name';
                nameDiv.innerText = name;

                card.appendChild(delBtn);
                card.appendChild(cvs);
                card.appendChild(nameDiv);

                // Load Action
                card.addEventListener('click', () => {
                    this.loadMap(name);
                });

                listContainer.appendChild(card);
            });
        } catch (e) {
            console.error("Error refreshing map list in editor", e);
        }
    }

    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.map-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }


    static getMapList() {
        return []; // deprecated
    }
}

// Global instance - handled via window.mapEditor in main.js
// let mapEditor = null; 

if (typeof window !== 'undefined') {
    window.MapEditor = MapEditor;
}

