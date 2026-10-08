/**
 * Chest.js - Interactable chest that gives items (3x bigger, realistic open)
 */

class Chest {
    constructor(scene, position, itemType) {
        this.scene = scene;
        this.itemType = itemType;
        this.isOpen = false;
        this.openProgress = 0;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.mesh.scale.set(3, 3, 3);

        this.createModel();
        this.scene.add(this.mesh);
    }

    createModel() {
        // Bottom half of chest
        const bottomGeo = new THREE.BoxGeometry(1.2, 0.5, 0.8);
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const bottom = new THREE.Mesh(bottomGeo, woodMat);
        bottom.position.y = 0.25;
        bottom.castShadow = true;
        this.mesh.add(bottom);

        // Lid group (for rotation pivot at back)
        this.lidGroup = new THREE.Group();
        this.lidGroup.position.set(0, 0.5, -0.35);

        // Lid mesh
        const lidGeo = new THREE.BoxGeometry(1.25, 0.2, 0.85);
        const lidMat = new THREE.MeshLambertMaterial({ color: 0x6D3410 });
        this.lid = new THREE.Mesh(lidGeo, lidMat);
        this.lid.position.set(0, 0.1, 0.4);
        this.lid.castShadow = true;
        this.lidGroup.add(this.lid);
        this.mesh.add(this.lidGroup);

        // Gold metal band
        const bandGeo = new THREE.BoxGeometry(1.3, 0.08, 0.9);
        const goldMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
        const band = new THREE.Mesh(bandGeo, goldMat);
        band.position.y = 0.5;
        this.mesh.add(band);

        // Lock on front
        const lockGeo = new THREE.BoxGeometry(0.15, 0.2, 0.05);
        const lock = new THREE.Mesh(lockGeo, goldMat);
        lock.position.set(0, 0.35, 0.43);
        this.mesh.add(lock);

        // Gold corners
        const cornerGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
        [-0.55, 0.55].forEach(x => {
            [-0.35, 0.35].forEach(z => {
                const corner = new THREE.Mesh(cornerGeo, goldMat);
                corner.position.set(x, 0.3, z);
                this.mesh.add(corner);
            });
        });
    }

    open() {
        if (this.isOpen) return null;
        this.isOpen = true;

        // Start smooth animation
        this.animating = true;

        // Create item mesh
        const itemMesh = new THREE.Group();
        if (this.itemType === 'axe') {
            const handleGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
            const handleMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.y = 0.4;
            itemMesh.add(handle);

            const headGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
            const headMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 0.7;
            head.position.x = 0.15;
            itemMesh.add(head);
        } else {
            const handleGeo = new THREE.BoxGeometry(0.1, 0.25, 0.1);
            const handleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.y = 0.125;
            itemMesh.add(handle);

            const bladeGeo = new THREE.BoxGeometry(0.12, 0.8, 0.05);
            const bladeMat = new THREE.MeshLambertMaterial({ color: 0xE0E0E0 });
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.position.y = 0.7;
            itemMesh.add(blade);
        }

        return { type: this.itemType, mesh: itemMesh };
    }

    getPosition() {
        return this.mesh.position;
    }

    update(deltaTime) {
        // Smooth lid opening animation
        if (this.animating && this.openProgress < 1) {
            this.openProgress += deltaTime * 2; // 0.5 seconds to open
            if (this.openProgress > 1) this.openProgress = 1;

            // Rotate lid back (around X axis at the hinge)
            this.lidGroup.rotation.x = -this.openProgress * Math.PI * 0.6; // ~108 degrees
        }
    }
}

if (typeof window !== 'undefined') {
    window.Chest = Chest;
}
