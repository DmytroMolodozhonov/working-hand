/**
 * FallingBlocks.js — a piece of a building falling after a blast (src/world/Collapse.js, Structure.js).
 *
 * The world data already holds the piece where it lands (the same on every computer);
 * here the piece is seen falling: its blocks are drawn as one instanced mesh that drops
 * with gravity from where they hung, and the landed blocks are hidden from the terrain
 * mesh until it gets there. On landing: dust, the broken blocks fly apart, a thud.
 * A chain of collapse (a roof, then the wall it overloaded…) comes down round after round:
 * a fall of round `stage` hangs where it was STRUCT.STAGE s × stage first (a creak and a
 * crack as it gives way), then drops. Blocks crushed under their load (`crushed`) stand
 * till their round and burst where they stood.
 */

import * as THREE from 'three';
import { BASE_COLORS } from '../world/Terrain.js';
import { STRUCT } from '../world/Structure.js';

const G = 22; // m/s² (as everything else that falls in the game)
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class FallingBlocks {
    constructor(scene, terrain) {
        this.scene = scene;
        this.terrain = terrain; // class Terrain (meshes); its .data holds the blocks
        this.geo = new THREE.BoxGeometry(1, 1, 1);
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.pieces = [];
        this.onLand = null; // (piece) => {} — dust, debris, sound, who was under it
        this.onStart = null; // (piece) => {} — a piece of a chain gives way (the crack)
        // one sample now: the shader is compiled at the start (prewarm)
        const sample = new THREE.InstancedMesh(this.geo, this.mat, 1);
        sample.setColorAt(0, _c.setHex(0xffffff));
        sample.visible = false;
        sample.frustumCulled = false;
        scene.add(sample);
        this.sample = sample;
    }

    /** A fall worked out by Collapse (its blocks are already down in the data). */
    add(fall) {
        if (!fall || !fall.cells.length || (fall.d <= 0 && !fall.crushed)) return;
        const data = this.terrain?.data;
        const cells = fall.cells;
        const mesh = new THREE.InstancedMesh(this.geo, this.mat, cells.length);
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        cells.forEach(([x, L, z, t], i) => {
            _m.makeTranslation(x, L - 1, z);
            mesh.setMatrixAt(i, _m);
            mesh.setColorAt(i, _c.setHex(BASE_COLORS[t] ?? 0x888888));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.scene.add(mesh);
        const keys = fall.landed.map(([x, L, z]) => `${x},${L},${z}`);
        if (keys.length) data?.hideCells?.(keys);
        // (a round of a chain: it holds a moment longer — the one before it is seen coming down first)
        this.pieces.push({ fall, mesh, keys, y: 0, vy: 0, wait: (fall.stage || 0) * STRUCT.STAGE, started: !(fall.stage > 0) });
    }

    update(dt) {
        if (!this.pieces.length) return;
        for (const p of [...this.pieces]) {
            if (p.wait > 0) {
                p.wait -= dt;
                // (it shudders before it gives way)
                if (p.wait < 0.25) p.mesh.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
                continue;
            }
            if (!p.started) { p.started = true; p.mesh.position.set(0, 0, 0); this.onStart?.(p.fall); }
            if (p.fall.crushed) { this._land(p); continue; }
            p.vy += G * dt;
            p.y = Math.min(p.fall.d, p.y + p.vy * dt);
            p.mesh.position.y = -p.y;
            if (p.y >= p.fall.d) this._land(p);
        }
    }

    _land(p) {
        this.pieces.splice(this.pieces.indexOf(p), 1);
        this.scene.remove(p.mesh);
        p.mesh.dispose();
        if (p.keys.length) this.terrain?.data?.showCells?.(p.keys);
        this.onLand?.(p.fall);
    }

    /** Everything still falling lands now (a new world, the game ends). */
    clear() { for (const p of [...this.pieces]) this._land(p); }
}
