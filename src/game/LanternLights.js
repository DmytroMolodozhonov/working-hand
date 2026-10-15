/**
 * LanternLights.js — the lamps of the houses really shine.
 *
 * A lantern (and a wizard's crystal lamp) is a block: every computer has the same blocks, so every
 * computer lights the same lamps by itself — a friend sees them shine as I do. Only the few lamps
 * nearest to the player get a real light (each light costs every pixel drawn): LIGHTS of them, made
 * before the shaders are compiled (a light added later would compile every material again), the
 * lamps a few blocks apart (a row of lanterns side by side is one light).
 *
 * By night they are what lights the rooms; by day they add a little warmth (the windows do the rest).
 */

import * as THREE from 'three';
import { BLOCK, CHUNK, MIN_LAYER, MAX_LAYER } from '../world/Terrain.js';

export const LIGHTS = 3; // real lights at once (the nearest lamps)
const REACH = 22; // lamps this near (m, across) are looked for
const UP = 14, DOWN = 8; // …and this many layers above / below the player's feet
const APART = 3.5; // two lamps nearer than this: one light
const SCAN = 0.5; // s between the looks round (sooner when the blocks changed and the player moved)
const LAMPS = new Map([
    [BLOCK.LANTERN, { color: 0xffc46b, power: 1 }],
    [BLOCK.ARCANE_LAMP, { color: 0x8fe3ff, power: 0.8 }],
    [BLOCK.ARCANE_LAMP_VIOLET, { color: 0xc58bff, power: 0.8 }],
]);

/** The nearest lamps round (x, L, z), at most `n`, each `apart` from the others: [{x, y, z, d, t}]. */
export function nearestLamps(data, x, L, z, { n = LIGHTS, reach = REACH, up = UP, down = DOWN, apart = APART } = {}) {
    const found = [];
    const x0 = Math.floor(x - reach), x1 = Math.ceil(x + reach), z0 = Math.floor(z - reach), z1 = Math.ceil(z + reach);
    const fast = typeof data.chunk === 'function' && !!data.chunk(0, 0)?.blocks;
    if (fast) {
        // straight through the chunks' blocks (no lookup per cell)
        const S = CHUNK, M = MIN_LAYER;
        const L0 = Math.max(M, L - down), L1 = Math.min(MAX_LAYER, L + up);
        for (let cx = Math.floor(x0 / S); cx <= Math.floor(x1 / S); cx++) for (let cz = Math.floor(z0 / S); cz <= Math.floor(z1 / S); cz++) {
            const c = data.chunk(cx, cz), b = c.blocks;
            if (c.maxTop != null && c.maxTop < L0) continue;
            const ax = Math.max(x0, cx * S), bx = Math.min(x1, cx * S + S - 1), az = Math.max(z0, cz * S), bz = Math.min(z1, cz * S + S - 1);
            for (let l = L0; l <= Math.min(L1, c.maxTop ?? L1); l++) {
                const base = (l - M) * S * S;
                for (let wz = az; wz <= bz; wz++) {
                    const row = base + (wz - cz * S) * S - cx * S;
                    for (let wx = ax; wx <= bx; wx++) { const t = b[row + wx]; if (t >= BLOCK.LANTERN && LAMPS.has(t)) found.push({ x: wx, L: l, z: wz, t }); }
                }
            }
        }
    } else {
        for (let wx = x0; wx <= x1; wx++) for (let wz = z0; wz <= z1; wz++) for (let l = Math.max(MIN_LAYER, L - down); l <= L + up; l++) {
            const t = data.get(wx, l, wz);
            if (LAMPS.has(t)) found.push({ x: wx, L: l, z: wz, t });
        }
    }
    for (const f of found) f.d = Math.hypot(f.x - x, (f.L - L) * 1.5, f.z - z);
    found.sort((a, b) => a.d - b.d);
    const out = [];
    for (const f of found) {
        if (f.d > reach) break;
        if (out.some((o) => Math.hypot(o.x - f.x, o.L - f.L, o.z - f.z) < apart)) continue;
        // (the light just under the block: a lantern hangs from the ceiling, its light falls into the room)
        out.push({ x: f.x, L: f.L, y: f.L - 1.7, z: f.z, d: f.d, t: f.t });
        if (out.length >= n) break;
    }
    return out;
}

export class LanternLights {
    constructor(game) {
        this.game = game;
        this.lights = [];
        for (let i = 0; i < LIGHTS; i++) {
            const l = new THREE.PointLight(0xffc46b, 0, 16, 1.6);
            l.castShadow = false;
            l.userData.want = 0;
            game.scene?.add(l);
            this.lights.push(l);
        }
        this.lamps = [];
        this._t = 0;
        this._at = null;
        this._ver = -1;
    }

    update(dt) {
        const g = this.game, data = g.world?.terrain?.data;
        const me = g.character?.group?.position;
        if (!data || !me) return;
        this._t -= dt;
        const L = Math.floor(me.y - 0.9); // (the layer of the feet: the hero's origin is ~2.4 m over them)
        const moved = !this._at || Math.hypot(me.x - this._at.x, me.z - this._at.z) > 2 || Math.abs(L - this._at.L) > 2;
        if (this._t <= 0 && (moved || data.version !== this._ver)) {
            this._t = SCAN;
            this._at = { x: me.x, z: me.z, L };
            this._ver = data.version;
            this.lamps = nearestLamps(data, me.x, L, me.z);
            this.lights.forEach((l, i) => {
                const p = this.lamps[i];
                if (!p) { l.userData.want = 0; return; }
                if (l.intensity < 0.05 || l.position.distanceTo(_v.set(p.x, p.y, p.z)) > 0.5) { l.position.set(p.x, p.y, p.z); l.intensity = 0; }
                const k = LAMPS.get(p.t);
                l.color.setHex(k.color);
                l.userData.want = k.power;
            });
        }
        // by night the rooms' light; by day a little warmth; far ones fade out (no light popping)
        const night = g.world?.nightAmount ?? 0;
        const base = 0.9 + 2.6 * night;
        for (const l of this.lights) {
            const fade = Math.max(0, Math.min(1, (REACH - l.position.distanceTo(me)) / 6));
            const want = l.userData.want * base * fade;
            l.intensity += (want - l.intensity) * Math.min(1, dt * 4);
            if (l.intensity < 0.01 && !want) l.intensity = 0;
        }
    }

    dispose() {
        for (const l of this.lights) l.removeFromParent();
        this.lights = [];
    }
}

const _v = new THREE.Vector3();
