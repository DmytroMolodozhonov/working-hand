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
 *
 * Locks (src/game/Alohomora.js): a chest of a village or a castle is locked —
 * the lid only rattles under the hand. «Алохомора» unlocks it: the lid springs
 * up a crack (`picked`), and the hand lifts it (liftTo) the rest of the way.
 */

import * as THREE from 'three';

const SCALE = 3; // (a treasure chest; a household one in a villager's house is smaller — opts.scale)
/** The chest's size in metres per unit of scale: across (its local X), deep (Z), high with the lid shut. */
export const CHEST_W = 1.25, CHEST_D = 0.85, CHEST_H = 0.7;
/** Lid: hinged on its own top-back edge (chest-local y, z), and how far it reaches from there. */
const HINGE_Y = 0.7, HINGE_Z = -0.425;
export const LID_LEN = 0.85;
const _lp = new THREE.Vector3();
const OPEN_ANGLE = Math.PI * 0.62; // ~110°
const OPEN_TIME = 0.9; // seconds
/** The crack a lid springs open to when «Алохомора» unlocks it (rad). */
export const AJAR_ANGLE = 0.16;
/** Lifted by the hand past this angle the lid falls open by itself (rad). */
export const LIFT_OPEN = OPEN_ANGLE * 0.38;

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        // (lit per pixel, each light with its own shadow: a Lambert chest lit by «Люмос» in a cave
        // caught the sun's shadow map — black blots — and lit its big faces only at their corners)
        wood: new THREE.MeshPhongMaterial({ color: 0x8B4513, shininess: 6, specular: 0x111111 }),
        lidWood: new THREE.MeshPhongMaterial({ color: 0x6D3410, shininess: 6, specular: 0x111111 }),
        gold: new THREE.MeshPhongMaterial({ color: 0xFFD700, shininess: 60, specular: 0x886622 }),
        inside: new THREE.MeshPhongMaterial({ color: 0x2a1408, shininess: 0, specular: 0x000000 }),
        bottom: new THREE.BoxGeometry(1.2, 0.5, 0.8),
        lid: new THREE.BoxGeometry(1.25, 0.2, 0.85),
        band: new THREE.BoxGeometry(1.3, 0.08, 0.9),
        lock: new THREE.BoxGeometry(0.15, 0.2, 0.05),
        // (a little bigger than 0.1 so its outer faces stand off the box's sides: flush, they flickered)
        corner: new THREE.BoxGeometry(0.11, 0.6, 0.11),
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
     * @param {{scale?: number}} [opts]  scale: its size (3 — a treasure chest)
     */
    constructor(scene, position, itemType, facing = 0, id = 0, opts = {}) {
        this.scale = opts.scale || SCALE;
        this.scene = scene;
        this.id = id;
        this.itemType = itemType || 'sword';
        this.isOpen = false;
        this.openProgress = 0;
        this.animating = false;
        this.itemSpawned = false;
        this.locked = false; // (a settlement's chest: src/game/Alohomora.js)
        this.openMax = OPEN_ANGLE; // (against a wall: the lid stops on it — setWallGap)
        this.picked = false; // unlocked by «Алохомора»: the lid stands open a crack, the hand lifts it
        this.fromAngle = 0; // where the opening starts (a lid already lifted by the hand)
        this.shakeT = 0;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.mesh.rotation.y = facing;
        this.mesh.scale.setScalar(this.scale);
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

        // Lid pivots on its top-back edge (the hinges): opened, it goes no further back than
        // the chest's back, so a chest standing at a wall opens without going into it
        this.lidGroup = new THREE.Group();
        this.lidGroup.position.set(0, HINGE_Y, HINGE_Z);
        this.lid = new THREE.Mesh(s.lid, s.lidWood);
        this.lid.position.set(0, -0.1, LID_LEN / 2);
        this.lid.castShadow = true;
        this.lidGroup.add(this.lid);
        const lidLock = new THREE.Mesh(s.lock, s.gold);
        lidLock.position.set(0, -0.15, LID_LEN - 0.02);
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

    /**
     * The chest stands `gap` metres in front of a wall: the lid opens until it leans on it
     * (a thrown-back lid would go into the wall).
     */
    setWallGap(gap) {
        const c = -gap / this.scale / LID_LEN; // (cos of the angle past which the lid's front edge reaches the wall)
        this.openMax = Math.min(OPEN_ANGLE, Math.PI / 2 + Math.asin(Math.max(0, Math.min(1, -c))));
    }

    /** Axis-aligned collision box (rotates with the chest). */
    getCollisionBox() {
        const w = CHEST_W * this.scale / 2, d = CHEST_D * this.scale / 2;
        const quarter = Math.round(this.mesh.rotation.y / (Math.PI / 2));
        const swap = Math.abs(quarter) % 2 === 1;
        const hx = swap ? d : w, hz = swap ? w : d;
        const p = this.mesh.position;
        return { minX: p.x - hx, maxX: p.x + hx, minY: p.y - 0.5, maxY: p.y + 0.75 * this.scale, minZ: p.z - hz, maxZ: p.z + hz, kind: 'chest', chest: this }; // (chest: a shut one stops the hand — HandBlocks)
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
        this.fromAngle = -this.lidGroup.rotation.x;
        this.openProgress = this.fromAngle > 0.05 ? 0.15 : 0; // (lifted by the hand / unlocked: no unlock shake)
        return true;
    }

    /** «Алохомора»: the lock clicks open, the lid springs up a crack. */
    setAjar() {
        this.picked = true;
        if (!this.isOpen && -this.lidGroup.rotation.x < AJAR_ANGLE) this.lidGroup.rotation.x = -AJAR_ANGLE;
    }

    /** The hand lifts (or lowers) the lid of an unlocked chest; true when it is up far enough to fall open. */
    liftTo(angle) {
        if (this.isOpen) return false;
        const a = Math.max(AJAR_ANGLE, Math.min(this.openMax, angle));
        this.lidGroup.rotation.x = -a;
        return a >= LIFT_OPEN;
    }

    /** The lid of a locked chest tried by the hand: it rattles. */
    rattle() { this.shakeT = 0.3; }

    /** The angle round the lid's hinge (chest-local y, z from the hinge) of a world point, and its distance. */
    hingeOf(p, out = {}) {
        const l = this.mesh.worldToLocal(_lp.copy(p));
        const dy = l.y - HINGE_Y, dz = l.z - HINGE_Z;
        out.angle = Math.atan2(dy, dz);
        out.r = Math.hypot(dy, dz) * this.scale;
        out.x = l.x * this.scale;
        return out;
    }

    /** The world point of the lid's front edge (where the fingers go under it). */
    lidEdge(out = new THREE.Vector3()) {
        this.lid.updateWorldMatrix(true, false);
        return out.set(0, 0, 0.42).applyMatrix4(this.lid.matrixWorld);
    }

    /** Shut it again (the creative test chest refills): the lid comes down. */
    close() {
        this.isOpen = false;
        this.fromAngle = 0;
        this.animating = false;
        this.openProgress = 0;
        this.lidGroup.rotation.x = 0;
    }

    /** Apply an already-open state instantly (late multiplayer join). */
    setOpenInstant() {
        this.isOpen = true;
        this.animating = false;
        this.openProgress = 1;
        this.lidGroup.rotation.x = -this.openMax;
    }

    update(dt) {
        if (this.shakeT > 0) {
            this.shakeT -= dt;
            this.lidGroup.rotation.x = this.shakeT > 0 ? -Math.abs(Math.sin(this.shakeT * 70)) * 0.03 : 0;
        }
        if (!this.animating) return;
        this.openProgress = Math.min(1, this.openProgress + dt / OPEN_TIME);
        const t = this.openProgress;
        // Short "unlock" shake, then the lid swings open with a soft overshoot.
        if (t < 0.15) {
            this.lidGroup.rotation.x = -0.04 * Math.sin(t * 120);
        } else {
            const k = (t - 0.15) / 0.85;
            const a0 = this.fromAngle || 0;
            this.lidGroup.rotation.x = -(a0 + (this.openMax - a0) * easeOutBack(k));
        }
        if (t >= 1) {
            this.lidGroup.rotation.x = -this.openMax;
            this.animating = false;
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}
