/**
 * Chest.js — map chest that opens when the player comes close.
 *
 * Fixes vs. the original:
 *   - the game crashed on opening ("Критическая ошибка (Game Loop)"): open()
 *     handed a bare mesh to Character.equip(), which expects an item;
 *     now the chest spawns a real physical weapon that rises out of the chest,
 *   - the chest is rotated so its front (lid + lock) faces open space, never a
 *     wall, and its collision box rotates with it,
 *   - the lid opens with a smooth eased animation (hinge at the back), with a
 *     little bounce and a sound.
 */

import * as THREE from 'three';

const SCALE = 3;
const OPEN_ANGLE = Math.PI * 0.62; // ~110°
const OPEN_TIME = 0.9; // seconds

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        wood: new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
        lidWood: new THREE.MeshLambertMaterial({ color: 0x6D3410 }),
        gold: new THREE.MeshLambertMaterial({ color: 0xFFD700 }),
        inside: new THREE.MeshLambertMaterial({ color: 0x2a1408 }),
        bottom: new THREE.BoxGeometry(1.2, 0.5, 0.8),
        lid: new THREE.BoxGeometry(1.25, 0.2, 0.85),
        band: new THREE.BoxGeometry(1.3, 0.08, 0.9),
        lidBand: new THREE.BoxGeometry(1.3, 0.06, 0.9),
        lock: new THREE.BoxGeometry(0.15, 0.2, 0.05),
        corner: new THREE.BoxGeometry(0.1, 0.6, 0.1),
        hollow: new THREE.BoxGeometry(1.08, 0.02, 0.68),
    };
    return SHARED;
}

const easeOutBack = (t) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Chest {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position  floor position (y is the floor level)
     * @param {string} itemType  'sword' | 'axe'
     * @param {number} facing  rotation.y so the front (+Z) faces open space
     * @param {string|number} id
     */
    constructor(scene, position, itemType, facing = 0, id = 0) {
        this.scene = scene;
        this.id = id;
        this.itemType = itemType || 'sword';
        this.isOpen = false;
        this.openProgress = 0;
        this.animating = false;
        this.itemSpawned = false;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.mesh.rotation.y = facing;
        this.mesh.scale.setScalar(SCALE);
        this.createModel();
        scene.add(this.mesh);
    }

    createModel() {
        const s = shared();
        const bottom = new THREE.Mesh(s.bottom, s.wood);
        bottom.position.y = 0.25;
        bottom.castShadow = true;
        bottom.receiveShadow = true;
        this.mesh.add(bottom);

        // Dark inside, visible once the lid is up
        const hollow = new THREE.Mesh(s.hollow, s.inside);
        hollow.position.y = 0.505;
        this.mesh.add(hollow);

        // Lid pivots on the back edge (hinge)
        this.lidGroup = new THREE.Group();
        this.lidGroup.position.set(0, 0.5, -0.4);
        this.lid = new THREE.Mesh(s.lid, s.lidWood);
        this.lid.position.set(0, 0.1, 0.4);
        this.lid.castShadow = true;
        this.lidGroup.add(this.lid);
        const lidBand = new THREE.Mesh(s.lidBand, s.gold);
        lidBand.position.set(0, 0.0, 0.4);
        this.lidGroup.add(lidBand);
        const lidLock = new THREE.Mesh(s.lock, s.gold);
        lidLock.position.set(0, 0.05, 0.83);
        lidLock.scale.set(1, 0.6, 1);
        this.lidGroup.add(lidLock);
        this.mesh.add(this.lidGroup);

        const lock = new THREE.Mesh(s.lock, s.gold);
        lock.position.set(0, 0.35, 0.43);
        this.mesh.add(lock);

        for (const x of [-0.55, 0.55]) {
            for (const z of [-0.35, 0.35]) {
                const corner = new THREE.Mesh(s.corner, s.gold);
                corner.position.set(x, 0.3, z);
                this.mesh.add(corner);
            }
        }
    }

    /** Axis-aligned collision box (rotates with the chest). */
    getCollisionBox() {
        const w = 1.25 * SCALE / 2, d = 0.85 * SCALE / 2;
        const quarter = Math.round(this.mesh.rotation.y / (Math.PI / 2));
        const swap = Math.abs(quarter) % 2 === 1;
        const hx = swap ? d : w, hz = swap ? w : d;
        const p = this.mesh.position;
        return { minX: p.x - hx, maxX: p.x + hx, minY: p.y - 0.5, maxY: p.y + 0.75 * SCALE, minZ: p.z - hz, maxZ: p.z + hz, kind: 'chest' };
    }

    /** World position where the reward appears (just above the opening). */
    getRewardPosition(out = new THREE.Vector3()) {
        return out.set(0, 0.62, 0).applyMatrix4(this.mesh.matrixWorld);
    }

    getPosition() {
        return this.mesh.position;
    }

    /** Start opening. Returns true if it actually started now. */
    open() {
        if (this.isOpen) return false;
        this.isOpen = true;
        this.animating = true;
        this.openProgress = 0;
        return true;
    }

    /** Apply an already-open state instantly (late multiplayer join). */
    setOpenInstant() {
        this.isOpen = true;
        this.animating = false;
        this.openProgress = 1;
        this.lidGroup.rotation.x = -OPEN_ANGLE;
    }

    update(dt) {
        if (!this.animating) return;
        this.openProgress = Math.min(1, this.openProgress + dt / OPEN_TIME);
        const t = this.openProgress;
        // Short "unlock" shake, then the lid swings open with a soft overshoot.
        if (t < 0.15) {
            this.lidGroup.rotation.x = -0.04 * Math.sin(t * 120);
        } else {
            const k = (t - 0.15) / 0.85;
            this.lidGroup.rotation.x = -OPEN_ANGLE * easeOutBack(k);
        }
        if (t >= 1) {
            this.lidGroup.rotation.x = -OPEN_ANGLE;
            this.animating = false;
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}
