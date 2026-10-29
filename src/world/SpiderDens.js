/**
 * SpiderDens.js — the giant spider's cave (worlds of generation SPAWN_MAPS_FROM_GEN, the Creative test ground: «Логово паучихи»).
 *
 * (the author: «там вообще должна быть ТЕМНОТА — пещерное логово, паучиху я реально должен видеть — в каком-то ближайшем месте
 * (не прямо близко), чтобы мог сразиться»)
 *
 * Natural mountains high enough for a hall a spider can stand up in are rare (a lair of the dragons' kind was found in one seed of
 * ten within five kilometres), so — like the Ice Castle — the den has a mountain of its own: ONE rocky butte, lifted out of the land
 * at a spot of the seed (DenSite: 450–1050 m from the spawn, on dry flat land away from every other site), flat on top with
 * steep flanks. Under it the same making as a dragon's lair (DragonLairs.lairAtPeak: a hall under the summit and a mouth in its
 * side) with the spider's own numbers: a closed hall (rock over it: dark inside, only a Lumos or a block's light), NO chests (the
 * spider has none — CLAUDE.md «Боссы»), a hall roomy for a spider twice the size (Spider.SIZE).
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same den on every computer.
 */

import { createRng, createNoise2D, smoothstep } from '../core/math.js';
import { lairAtPeak } from './DragonLairs.js';

export const DEN = {
    ID: 'den',
    MIN_SPAWN: 200,
    PEAK_MIN: 40, // the summit's top layer
    DROP: 18, DROP_MAX: 26, // layers from the summit down to the mouth's floor (= the hall's floor)
    R_MIN: 25, R_MAX: 28, // m: the hall's radius (a great cave: the spider is 2× — body ~7 m across, ~9 m high — and the hero stands 20 m from her)
    H: 12, // the hall's dome (layers above its floor) where the rock allows — higher than the spider
    MOUTH_R: 5.5, // m: the entrance's radius (11 m wide, ~10 m high)
    OUT: 8, // m the entrance reaches beyond the mouth spot
    NEED: 17, // layers of rock over the hall's floor all round it (the dome 12 + a roof of several blocks)
    NO_CHESTS: true,
    CHANCE: 1,
};

/** The butte: the flat top's top layer, the flat part's radius, and the width of the flank falling to the land. */
export const MESA = { TOP: 60, PLATEAU: 52, FLANK: 28, SEARCH: [450, 1050], KEEP: 120 };

const TAU = Math.PI * 2;

/**
 * The den's mountain and the den under it. `raw(x, z)` is the land's top layer (`raw.water` / `raw.sea` after the call);
 * `busy(x, z, r)` says another site (a castle, a village, an arena, the ice castle…) stands within `r`.
 */
export class DenSite {
    constructor(seed, raw, busy, lairNear = null) {
        this.seed = seed; this.raw = raw; this.busy = busy; this.lairNear = lairNear; // (lairNear(x, z, r): a dragon's lair within r — the places are apart)
        this._n = createNoise2D((seed ^ 0xde5a11) >>> 0);
        this._spot = undefined;
        this.lifted = false;
        this._sys = undefined;
    }

    /** {x, z} of the butte (null: no fitting land in this world — a world of seas). */
    get spot() {
        if (this._spot !== undefined) return this._spot;
        const raw = this.raw, rng = createRng(((this.seed * 6007) ^ 0xd3a5) >>> 0);
        const R = MESA.PLATEAU + MESA.FLANK + 10;
        const a0 = rng() * TAU;
        let best = null;
        for (let i = 0; i < 48 && !best; i++) {
            const a = a0 + (i / 48) * TAU * 7, d = MESA.SEARCH[0] + rng() * (MESA.SEARCH[1] - MESA.SEARCH[0]);
            const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
            let ok = !this.busy(x, z, MESA.KEEP + R) && !(this.lairNear && this.lairNear(x, z, 420)), lo = 99, hi = -99;
            for (let k = 0; k < 13 && ok; k++) {
                const q = k ? R * 0.92 : 0, b = (k / 12) * TAU;
                const h = raw(Math.round(x + Math.cos(b) * q), Math.round(z + Math.sin(b) * q));
                if (raw.water || raw.sea) ok = false;
                lo = Math.min(lo, h); hi = Math.max(hi, h);
            }
            // (dry, gently lying land: the flanks fall from the top to it; no mountain already taller than the butte)
            if (ok && lo >= 3 && hi <= MESA.TOP - 18) best = { x, z };
        }
        return (this._spot = best);
    }

    /**
     * The land at a column as the butte makes it (`h` the land without it). Sets this.lifted (its own rock there:
     * bare, no grass, no trees — the same flag as the Ice Castle's mountain).
     */
    liftAt(ix, iz, h) {
        this.lifted = false;
        const s = this.spot;
        if (!s) return h;
        const dx = ix - s.x, dz = iz - s.z, L = MESA.PLATEAU + MESA.FLANK + 8;
        if (Math.abs(dx) > L || Math.abs(dz) > L) return h;
        const d = Math.hypot(dx, dz);
        // the edge ragged (spurs and bays), the top rough by a block or two
        const e = this._n(ix / 17, iz / 17) * 7 + this._n(ix / 6 + 9, iz / 6 - 9) * 2.5;
        const k = 1 - smoothstep(MESA.PLATEAU + e * 0.6, MESA.PLATEAU + MESA.FLANK + e, d);
        if (k <= 0) return h;
        const rough = this._n(ix / 5 + 31, iz / 5) * 1.6 + this._n(ix / 2.2, iz / 2.2 + 5) * 0.6;
        const m = Math.round(h + (MESA.TOP - h) * k + rough * k);
        if (m <= h) return h;
        this.lifted = true;
        return m;
    }

    /** Bare rock here (the butte's own rock plus a margin)? */
    rocky(ix, iz) {
        const s = this.spot;
        if (!s) return false;
        const R = MESA.PLATEAU + MESA.FLANK + 6;
        return (ix - s.x) ** 2 + (iz - s.z) ** 2 <= R * R;
    }

    /**
     * The den under the butte (a cave system like a lair's — `.lair` says where the hall and the mouth are), or null. `H(x, z)` is
     * the land WITH the butte (Terrain.heightAt), `blocked(x, z)` water / another site. Made once, on first need.
     */
    system(H, blocked) {
        if (this._sys !== undefined) return this._sys;
        const s = this.spot;
        let sys = null;
        if (s) {
            // the summit: the highest of the flat top, climbed
            let p = null;
            for (let i = 0; i < 30; i++) {
                const a = i * 2.4, q = i ? 4 + (i % 6) * 4 : 0;
                const x = s.x + Math.cos(a) * q, z = s.z + Math.sin(a) * q, h = H(Math.round(x), Math.round(z));
                if (!p || h > p.h) p = { x, z, h };
            }
            const rng = createRng(((this.seed * 4241) ^ 0x5b1de) >>> 0);
            if (p && p.h >= DEN.PEAK_MIN) sys = lairAtPeak(0, 0, p, rng, H, blocked, DEN, 'spider');
        }
        return (this._sys = sys);
    }
}

/** The points along the hall's axis (as shares of the hall's radius, from the back (−) to the mouth (+)): their ground must be there before the spots are worked out. */
export const DEN_AXIS = [-0.75, -0.4, 0, 0.4, 0.75];
export const denAxisPoints = (L) => DEN_AXIS.map((d) => ({ x: L.x + L.dx * L.r * d, z: L.z + L.dz * L.r * d }));

/**
 * Where the spider lies and where the hero stands to see her. The spider lies in the back half of the hall under the dome's high
 * middle: the first place on the axis (from −0.4 r) with `HEAD` free layers over the floor (she is ~9 m tall); the hero stands
 * `SIGHT` m from her towards the mouth, inside the roofed hall (rock over both: dark), facing her.
 * `free(x, z)` = free layers over the hall's floor at a column (the caller reads the blocks; the ground there must be made).
 * @returns {{spider:{x:number,z:number}, hero:{x:number,z:number,yaw:number}}}
 */
export const DEN_SIGHT = 22, DEN_HEAD = 10;
export function denSpots(L, free) {
    let best = null;
    for (const d of [-0.4, -0.3, -0.2, -0.5, -0.1, -0.6, 0]) {
        const x = L.x + L.dx * L.r * d, z = L.z + L.dz * L.r * d, h = free(x, z);
        if (h >= DEN_HEAD) { best = { x, z, h, d }; break; }
        if (!best || h > best.h) best = { x, z, h, d };
    }
    const along = Math.min(DEN_SIGHT, L.r * 0.8 - best.d * L.r); // (not past the hall's roofed part)
    const hero = { x: best.x + L.dx * along, z: best.z + L.dz * along, yaw: Math.atan2(-L.dx, -L.dz) };
    return { spider: { x: best.x, z: best.z }, hero };
}
