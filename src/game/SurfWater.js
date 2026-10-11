/**
 * SurfWater.js — the water a surfboard feels, in one place.
 *
 * The sea (src/world/Sea.js, `game.sea`): real waves — the surface height, its
 * slope, the water's own motion, the wave's speed and direction (towards the
 * shore), whitewater. Off the sea: still block water (lakes, rivers) or land.
 * «Wave Attack» adds a moving wall of water (a transient) that can be ridden on
 * a lake too. Tests inject a long-crested swell (`makeSwell`) as `sea`.
 *
 * Pure apart from the `game` lookups (Node-testable with a fake game).
 */

import { WATER_LEVEL_Y } from '../world/Terrain.js';

export const WAVE_G = 20; // the game's gravity (Character.update: 20 u/s²)

export class SurfWater {
    constructor(game) {
        this.game = game;
        this.sea = null; // (tests inject a swell here)
        this.transients = [];
    }

    get field() { return this.sea || this.game.sea || null; }

    time() {
        const f = this.field;
        if (f?.time) return f.time();
        return (Date.now() + (this.game.clockSkew || 0)) / 1000;
    }

    /**
     * The water under (x, z): {kind: 'sea'|'lake'|'land', surface, h, gx, gz, vx, vz, c, dx, dz, breaking, depth}.
     * The water's top is at surface + h.
     */
    sample(x, z, t = this.time(), o = {}) {
        o.h = o.gx = o.gz = o.vx = o.vz = o.c = o.breaking = 0; o.dx = 1; o.dz = 0;
        const f = this.field;
        const w = this.game.swim?.waterAt?.(x, z);
        if (f && f.sample && f.sample(x, z, t, o) && (this.sea || !w || w.sea)) {
            o.kind = 'sea'; o.surface = WATER_LEVEL_Y;
            if (w && !this.sea) o.depth = w.depth; // (the real blocks: a dug harbour, a sandbank)
        } else if (w) {
            o.h = o.gx = o.gz = o.vx = o.vz = o.c = o.breaking = 0; o.dx = 1; o.dz = 0;
            o.kind = 'lake'; o.surface = w.surface - (w.wave || 0) - 0.12; o.depth = w.depth; // (the drawn surface)
        } else {
            o.kind = 'land'; o.surface = this.game.collision ? this.game.collision.groundY(x, z) : -0.5; o.depth = 0;
        }
        for (const tr of this.transients) addTransient(o, tr, x, z, t);
        return o;
    }

    /** «Wave Attack» made a moving wall of water: rideable while it lives. */
    addTransient({ x, z, dirX, dirZ, speed, height, width, dist }) {
        const l = Math.hypot(dirX, dirZ) || 1;
        this.transients.push({ x, z, dirX: dirX / l, dirZ: dirZ / l, speed, height, width, born: this.time(), life: (dist + 3) / speed });
    }

    update() {
        const t = this.time();
        if (this.transients.length) this.transients = this.transients.filter((w) => t - w.born < w.life);
    }
}

/** A raised-cosine bump travelling along (dirX, dirZ): adds h, the slope, the push, c and the direction. */
export function addTransient(o, w, x, z, t) {
    const rx = x - w.x, rz = z - w.z;
    const along = rx * w.dirX + rz * w.dirZ - w.speed * (t - w.born);
    const across = -rx * w.dirZ + rz * w.dirX;
    const HALF = 2.5;
    if (Math.abs(along) >= HALF || Math.abs(across) >= w.width / 2) return;
    const H = w.height;
    const ph = Math.PI * along / HALF;
    const h = H * 0.5 * (1 + Math.cos(ph));
    const dh = -H * 0.5 * Math.sin(ph) * Math.PI / HALF; // ∂h/∂along
    o.h += h;
    o.gx += dh * w.dirX; o.gz += dh * w.dirZ;
    const d = Math.max(0.5, o.depth || 1);
    o.vx += (h / d) * w.speed * w.dirX; o.vz += (h / d) * w.speed * w.dirZ;
    o.c = w.speed; o.dx = w.dirX; o.dz = w.dirZ;
    o.breaking = Math.max(o.breaking, along > 0 ? 0 : 0.4);
    if (o.kind === 'land' && h > 0.2) { o.kind = 'lake'; o.depth = Math.max(o.depth || 0, h); }
}

/** A stub sea for tests: a long-crested swell (optionally running up a sloping beach). */
export function makeSwell({ dirX = 1, dirZ = 0, height = 1.6, length = 36, depth = 6, shore = null, phase = 0 } = {}) {
    const k = 2 * Math.PI / length, c0 = Math.sqrt(WAVE_G * depth), w = k * c0;
    const l = Math.hypot(dirX, dirZ) || 1;
    dirX /= l; dirZ /= l;
    return {
        time: null,
        sample(x, z, t, o) {
            const s = x * dirX + z * dirZ;
            const d = shore ? Math.min(depth, (shore.s0 - s) * shore.slope) : depth;
            if (!(d > 0.05)) return null;
            const A = Math.min(height / 2 * Math.pow(depth / d, 0.25), 0.39 * d); // shoaling, capped (breaks at H ≈ 0.78 d)
            const ph = k * s - w * t + phase, h = A * Math.sin(ph), dhs = A * k * Math.cos(ph);
            const c = Math.sqrt(WAVE_G * d);
            o.h = h; o.gx = dhs * dirX; o.gz = dhs * dirZ;
            o.vx = (h / d) * c * dirX; o.vz = (h / d) * c * dirZ; // shallow-water orbital speed
            o.c = c; o.dx = dirX; o.dz = dirZ; o.depth = d;
            o.breaking = Math.max(0, Math.min(1, (2 * A / d - 0.6) / 0.18));
            return o;
        },
    };
}
