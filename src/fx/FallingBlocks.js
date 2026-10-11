/**
 * FallingBlocks.js — a piece of a building falling after a blast (src/world/Collapse.js).
 *
 * The world data already holds the piece where it lands (the same on every computer);
 * here the piece is seen falling: its blocks are drawn as one instanced mesh that drops
 * with gravity from where they hung, and the landed blocks are hidden from the terrain
 * mesh until it gets there. On landing: dust, the broken blocks fly apart, a thud.
 */

import * as THREE from 'three';
import { BASE_COLORS } from '../world/Terrain.js';

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
        if (!fall || fall.d <= 0 || !fall.cells.length) return;
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
        data?.hideCells?.(keys);
        this.pieces.push({ fall, mesh, keys, y: 0, vy: 0 });
    }

    update(dt) {
        if (!this.pieces.length) return;
        for (const p of [...this.pieces]) {
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
        this.terrain?.data?.showCells?.(p.keys);
        this.onLand?.(p.fall);
    }

    /** Everything still falling lands now (a new world, the game ends). */
    clear() { for (const p of [...this.pieces]) this._land(p); }
}
