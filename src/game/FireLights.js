/**
 * FireLights.js — fire really lights what is round it: the ground, the walls, the trees, the people.
 *
 * Every fire that should shine (a campfire of «Fire», a burning tree, burning blocks…) asks for a
 * light each frame: `want(x, y, z, power)`. Only the few fires nearest to the player get a real
 * light — LIGHTS warm point lights, made once before the shaders are compiled (a light added later
 * would compile every lit material again; their number never changes, an unused one has
 * intensity 0). A light stays with its fire while it can (no popping), flickers like a flame, and
 * is strong where it is dark: by night, in a cave, under a roof.
 */

import * as THREE from 'three';

export const LIGHTS = 3; // real fire lights at once (the nearest fires)
export const FIRE_LIGHT = {
    COLOR: 0xff9a45,
    DIST: 14, // m it reaches (fades out to nothing there)
    DECAY: 1.4,
    DAY: 0.7, // intensity by day (a fire in the sun hardly shows)
    DARK: 3.4, // …and in the dark (night, cave)
    REACH: 50, // m from the player: farther fires get no light
    APART: 2.5, // two fires nearer than this: one light
};

/**
 * Keep the `n` nearest wishes in `slots` (sorted near → far); a wish next to a kept one merges into it.
 * Pure (tests): slots = [{x, y, z, p, d}], returns the slots' count.
 */
export function pickNearest(slots, count, n, x, y, z, p, d, apart = FIRE_LIGHT.APART) {
    for (let i = 0; i < count; i++) {
        const s = slots[i];
        if (Math.abs(s.x - x) < apart && Math.abs(s.z - z) < apart && Math.abs(s.y - y) < apart * 1.5) {
            if (p > s.p) s.p = p;
            return count;
        }
    }
    let at = count;
    while (at > 0 && slots[at - 1].d > d) at--;
    if (at >= n) return count;
    const keep = Math.min(n, count + 1);
    const last = slots[keep - 1]; // (the farthest one falls out: its object is reused)
    for (let i = keep - 1; i > at; i--) slots[i] = slots[i - 1];
    last.x = x; last.y = y; last.z = z; last.p = p; last.d = d;
    slots[at] = last;
    return keep;
}

export class FireLights {
    constructor(game) {
        this.game = game;
        this.lights = [];
        for (let i = 0; i < LIGHTS; i++) {
            const l = new THREE.PointLight(FIRE_LIGHT.COLOR, 0, FIRE_LIGHT.DIST, FIRE_LIGHT.DECAY);
            l.castShadow = false;
            l.position.set(0, -1000, 0);
            l.userData.want = 0;
            l.userData.ph = i * 2.3;
            game.scene?.add(l);
            this.lights.push(l);
        }
        this._slots = Array.from({ length: LIGHTS }, () => ({ x: 0, y: 0, z: 0, p: 0, d: 0 }));
        this._n = 0;
        this._used = new Array(LIGHTS).fill(false);
        this._take = new Array(LIGHTS).fill(-1);
    }

    /** How dark it is where the player is: 0 (day, open sky) … 1 (night, a deep cave). */
    darkness() {
        const g = this.game;
        const night = g.dayCycle ? (g.world?.nightAmount || 0) : (g.isNight ? 1 : 0);
        return Math.max(night, g._caveK || 0, 0.6 * (g._indoorK || 0));
    }

    /** A fire wants light this frame at (x, y, z) — the flames' middle; power ~1 a campfire. */
    want(x, y, z, power = 1) {
        if (!(power > 0.01)) return;
        const me = this.game.character?.group?.position;
        if (!me) return;
        const d = Math.hypot(x - me.x, (y - me.y) * 1.5, z - me.z);
        if (d > FIRE_LIGHT.REACH) return;
        this._n = pickNearest(this._slots, this._n, LIGHTS, x, y, z, power, d);
    }

    /** After every fire said what it wants (once a frame). */
    update(dt) {
        const n = this._n;
        this._n = 0;
        const L = this.lights, S = this._slots, used = this._used;
        used.fill(false);
        const take = this._take;
        take.fill(-1);
        // a light already at its fire keeps it
        for (let i = 0; i < n; i++) {
            const s = S[i];
            let best = -1, bd = 1.2;
            for (let j = 0; j < L.length; j++) {
                if (used[j] || L[j].intensity <= 0) continue;
                const dd = Math.abs(L[j].position.x - s.x) + Math.abs(L[j].position.z - s.z) + Math.abs(L[j].position.y - s.y);
                if (dd < bd) { bd = dd; best = j; }
            }
            if (best >= 0) { used[best] = true; take[i] = best; }
        }
        // the others go to the free lights (from dark: no popping)
        for (let i = 0; i < n; i++) {
            if (take[i] >= 0) continue;
            const j = used.indexOf(false);
            if (j < 0) break;
            used[j] = true; take[i] = j;
            L[j].intensity = 0;
        }
        const dark = this.darkness();
        const base = FIRE_LIGHT.DAY + (FIRE_LIGHT.DARK - FIRE_LIGHT.DAY) * dark;
        const t = performance.now() / 1000;
        for (let j = 0; j < L.length; j++) L[j].userData.want = 0;
        for (let i = 0; i < n; i++) {
            const l = L[take[i]];
            if (!l) continue;
            const s = S[i];
            l.position.set(s.x, s.y, s.z);
            // farther fires fade out before their light is taken (no light popping at the edge)
            const fade = Math.max(0, Math.min(1, (FIRE_LIGHT.REACH - s.d) / 8));
            l.userData.want = base * Math.min(1.6, s.p) * fade;
        }
        for (const l of L) {
            const ph = l.userData.ph;
            // a flame's flicker: a slow breath and a quick tremble
            const flick = 0.86 + 0.09 * Math.sin(t * 7.3 + ph) + 0.05 * Math.sin(t * 17.1 + ph * 2) + 0.04 * Math.sin(t * 29.7 + ph * 3);
            const want = l.userData.want * flick;
            l.intensity += (want - l.intensity) * Math.min(1, dt * (want > l.intensity ? 10 : 5));
            if (!l.userData.want && l.intensity < 0.02) l.intensity = 0;
        }
    }

    dispose() {
        for (const l of this.lights) l.removeFromParent();
        this.lights = [];
    }
}
