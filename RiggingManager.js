/**
 * RiggingManager.js
 * Handles bone selection, manipulation (Gizmos), and persistence of Rig Data.
 */

class RiggingManager {
    constructor(scene, camera, renderer, orbitControls) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.orbitControls = orbitControls; // To disable orbit when dragging gizmo

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.transformControl = null;

        this.selectedBone = null;
        this.rigConfig = {}; // Structure: { "BoneName": { x, y, z, w } } (Quaternion offsets) or Euler?
        // Euler is easier for gizmos. Storing Euler offsets.

        this.isActive = false;

        this.initGizmos();
        this.bindEvents();
        this.loadConfig();
    }

    initGizmos() {
        if (!THREE.TransformControls) {
            console.error("TransformControls not loaded!");
            return;
        }

        this.transformControl = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControl.setMode('rotate'); // Mostly rotating bones
        this.transformControl.setSpace('local'); // Local rotation is what we want for joints

        this.transformControl.addEventListener('dragging-changed', (event) => {
            if (this.orbitControls) {
                this.orbitControls.enabled = !event.value;
            }
        });

        this.transformControl.addEventListener('change', () => {
            if (this.selectedBone && this.selectedBone.userData.boneName) {
                // Update config on change
                const rot = this.selectedBone.rotation;
                // We are adding an OFFSET. 
                // However, manipulating the bone directly in the scene might conflict with the `update` loop 
                // which overwrites rotation every frame from tracking.
                //
                // SOLUTION: 
                // We pause tracking updates for the SELECTED bone, OR we manipulate a "ghost" offset.
                // Better: We invoke a callback or handle the offset logic in Hand.js.
                //
                // For now, let's assume we are editing the "Base Offset".
                // In `Hand.js`, we will add `this.rigOffset` rotation.
                // When we rotate gizmo, we update `rigConfig[boneName]`.

                this.rigConfig[this.selectedBone.userData.boneName] = {
                    x: rot.x,
                    y: rot.y,
                    z: rot.z
                };
            }
        });

        this.scene.add(this.transformControl);
    }

    bindEvents() {
        window.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
    }

    onPointerDown(event) {
        if (!this.isActive) return;

        // Calculate pointer position in normalized device coordinates (-1 to +1)
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);

        // Intersect recursive
        // We want to hit bones. Bones usually have meshes (boxes).
        // We filter for objects that are part of a Hand.
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            const obj = intersects[i].object;
            // Traverse up to find a group with user data or specific name
            let target = obj;
            while (target) {
                if (target.userData && target.userData.boneName) {
                    this.selectBone(target);
                    return;
                }
                target = target.parent;
            }
        }

        // If clicked nothing, deselect? Only if not clicking gizmo
        // TransformControls usually handles its own interaction
    }

    onKeyDown(event) {
        if (!this.isActive) return;

        switch (event.key.toLowerCase()) {
            case 'r':
                this.transformControl.setMode('rotate');
                break;
            case 't':
                this.transformControl.setMode('translate');
                break;
            case 'escape':
                this.detach();
                break;
        }
    }

    selectBone(bone) {
        // Detach previous
        this.transformControl.detach();

        this.selectedBone = bone;
        console.log("Selected Bone:", bone.userData.boneName);

        // Attach
        this.transformControl.attach(bone);
    }

    detach() {
        this.transformControl.detach();
        this.selectedBone = null;
    }

    async loadConfig() {
        try {
            const res = await fetch('/api/rig');
            if (res.ok) {
                this.rigConfig = await res.json();
                console.log("Rig Loaded:", this.rigConfig);
                // Apply to scene? 
                // Hand.js should likely apply this autonomously if we pass it globally or via setConfig
                if (window.VoxelCharacter && window.character) {
                    // Notify character/hands to refresh config
                    // We'll implement this connection in main.js
                }
            }
        } catch (e) {
            console.error("Failed to load rig:", e);
        }
    }

    async saveConfig() {
        try {
            const res = await fetch('/api/rig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.rigConfig)
            });
            if (res.ok) {
                console.log("Rig Saved!");
                // Show floating notification
                this.showNotification("Rig Saved!");
            }
        } catch (e) {
            console.error("Failed to save rig:", e);
        }
    }

    showNotification(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        div.style.position = 'absolute';
        div.style.top = '100px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.padding = '10px 20px';
        div.style.background = '#27ae60';
        div.style.color = 'white';
        div.style.borderRadius = '5px';
        div.style.zIndex = '10000';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2000);
    }

    enable() {
        this.isActive = true;
        this.transformControl.enabled = true;
        document.getElementById('save-rig-btn')?.classList.remove('hidden');
    }

    disable() {
        this.isActive = false;
        this.detach();
        this.transformControl.enabled = false;
        document.getElementById('save-rig-btn')?.classList.add('hidden');
    }
}
