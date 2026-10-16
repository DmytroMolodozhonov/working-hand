/**
 * CaveMap.js — the map of a cave, as far as the hero has explored it (the author: «Когда заходишь в
 * пещеру, карта должна рисовать пещеру — но только ту часть, которую ты уже исследовал»).
 *
 *  - In a cave the minimap shows the cave from above, at the hero's level (Hud.drawMinimap → cave).
 *  - What the hero saw (in ~12 m and in the line of sight — never through the rock) is opened as they
 *    go: rays from the eyes along the floor, a few a frame (CaveExplorer.step); the rest is dark.
 *  - The memory: bit masks of 8 × 8 m tiles (one bit a column), with a limit (oldest tiles dropped);
 *    the ways in/out where they were seen. Kept with the hero (WorldSave.playerSnapshot: each player
 *    their own). It is the hero's knowledge: death takes it with the rest (Legacy.js), «Give Me My
 *    Power» gives it back.
 *
 * Pure (no THREE): the terrain is TerrainData (get / hasChunk).
 */

export const CAVE_MAP = {
    TILE: 8, // m: a tile of the memory (8 × 8 columns: 64 bits)
    MAX_TILES: 3000, // the memory's limit (~48 KB saved at most; a whole cave system is a few hundred)
    MAX_WAYS: 40, // ways in/out remembered
    SIGHT: 12, // m: how far the hero sees in the dark of a cave
    RAYS: 96, // rays round the hero for one look
    RAYS_PER_STEP: 16, // … cast a frame (a whole look in 6 frames)
    MAX_FRESH: 4096, // newly opened columns waiting for the map (more: the map is drawn anew)
    SCALE: 4, // the cave map's pixels a metre (the surface map: 2) — tunnels are narrow
};

const T = CAVE_MAP.TILE;
const tileKey = (tx, tz) => (tx + 0x8000) * 0x10000 + (tz + 0x8000);

/** What the hero knows of the caves: the opened columns and the ways in. */
export class CaveMemory {
    constructor() {
        this.tiles = new Map(); // tile key -> Uint32Array(2): bit (z % 8) * 8 + (x % 8)
        this.ways = []; // [{x, z}] ways in/out seen
        this.fresh = []; // [x, z, x, z…] opened since the map took them (Hud)
        this.redraw = false; // too many at once / restored / wiped: draw the cave map anew
        this.version = 0;
    }

    /** Has the hero seen this column? */
    has(x, z) {
        const ix = Math.floor(x), iz = Math.floor(z);
        const m = this.tiles.get(tileKey(Math.floor(ix / T), Math.floor(iz / T)));
        if (!m) return false;
        const b = (((iz % T) + T) % T) * T + (((ix % T) + T) % T);
        return (m[b >> 5] & (1 << (b & 31))) !== 0;
    }

    /** Open a column; true if it is new. */
    open(ix, iz) {
        const tx = Math.floor(ix / T), tz = Math.floor(iz / T);
        if (tx < -0x8000 || tx >= 0x8000 || tz < -0x8000 || tz >= 0x8000) return false;
        const k = tileKey(tx, tz);
        let m = this.tiles.get(k);
        if (!m) {
            m = new Uint32Array(2);
            this.tiles.set(k, m);
            if (this.tiles.size > CAVE_MAP.MAX_TILES) this.tiles.delete(this.tiles.keys().next().value); // (the oldest tile)
        }
        const b = (iz - tz * T) * T + (ix - tx * T);
        const bit = 1 << (b & 31);
        if (m[b >> 5] & bit) return false;
        m[b >> 5] |= bit;
        // (a tile walked in again moves to the end: the oldest — the long forgotten — go first)
        if (this.tiles.size > 1) { this.tiles.delete(k); this.tiles.set(k, m); }
        if (this.fresh.length < CAVE_MAP.MAX_FRESH * 2) this.fresh.push(ix, iz); else this.redraw = true;
        this.version++;
        return true;
    }

    /** A way in/out of a cave (where the hero went in or came out). */
    addWay(x, z) {
        for (const w of this.ways) if (Math.hypot(w.x - x, w.z - z) < 10) return;
        this.ways.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
        if (this.ways.length > CAVE_MAP.MAX_WAYS) this.ways.shift();
        this.version++;
    }

    get empty() {
        return !this.tiles.size && !this.ways.length;
    }

    clear() {
        this.tiles.clear();
        this.ways.length = 0;
        this.fresh.length = 0;
        this.redraw = true;
        this.version++;
    }

    /** Compact: {t: base64 of [int16 tx, int16 tz, uint32 lo, uint32 hi]…, w: [[x, z]…]} or null. */
    snapshot() {
        if (this.empty) return null;
        const buf = new DataView(new ArrayBuffer(this.tiles.size * 12));
        let o = 0;
        for (const [k, m] of this.tiles) {
            buf.setInt16(o, Math.floor(k / 0x10000) - 0x8000, true);
            buf.setInt16(o + 2, (k % 0x10000) - 0x8000, true);
            buf.setUint32(o + 4, m[0], true);
            buf.setUint32(o + 8, m[1], true);
            o += 12;
        }
        return { t: toBase64(new Uint8Array(buf.buffer)), w: this.ways.map((w) => [w.x, w.z]) };
    }

    /** Add a saved memory to this one (restore, or a legacy taken back). */
    merge(s) {
        if (!s || typeof s !== 'object') return;
        if (typeof s.t === 'string' && s.t) {
            let bytes;
            try { bytes = fromBase64(s.t); } catch { bytes = null; }
            if (bytes) {
                const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const n = Math.min(CAVE_MAP.MAX_TILES, Math.floor(bytes.byteLength / 12));
                for (let i = 0; i < n; i++) {
                    const o = i * 12, k = tileKey(v.getInt16(o, true), v.getInt16(o + 2, true));
                    let m = this.tiles.get(k);
                    if (!m) {
                        m = new Uint32Array(2);
                        this.tiles.set(k, m);
                        if (this.tiles.size > CAVE_MAP.MAX_TILES) this.tiles.delete(this.tiles.keys().next().value);
                    }
                    m[0] |= v.getUint32(o + 4, true);
                    m[1] |= v.getUint32(o + 8, true);
                }
            }
        }
        if (Array.isArray(s.w)) for (const w of s.w) if (Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1])) this.addWay(w[0], w[1]);
        this.redraw = true;
        this.version++;
    }

    restore(s) {
        this.clear();
        this.merge(s);
    }
}

function toBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

function fromBase64(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const s = atob(str), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

// the blocks: 0 air, 8 water, 11 the inside of frozen water shapes (Terrain.BLOCK) — air and water are open
const open = (b) => b === 0 || b === 8;

/**
 * What a column looks like on the cave map at the hero's level L (the layer of their feet):
 *  a number −6…+3 — a floor this many layers above / below; WALL — rock; PIT — open, no floor near.
 */
export const WALL = -100, PIT = 100;
const LOOK = [0, 1, -1, 2, -2, 3, -3, -4, -5, -6];
export function columnLook(d, x, z, L) {
    for (const k of LOOK) {
        const l = L + k;
        if (open(d.get(x, l, z)) && open(d.get(x, l + 1, z)) && !open(d.get(x, l - 1, z))) return k;
    }
    return open(d.get(x, L, z)) || open(d.get(x, L + 1, z)) ? PIT : WALL;
}

/**
 * The hero's eyes in a cave: rays along the floor from where they stand — up and down the slopes,
 * stopped by the rock (never through it). A few rays a frame.
 */
export class CaveExplorer {
    constructor(memory) {
        this.mem = memory;
        this.ray = 0;
    }

    /** Cast the next few rays from the feet (x, y, z: the world point of the feet). */
    step(d, x, y, z, n = CAVE_MAP.RAYS_PER_STEP) {
        const L0 = Math.floor(y + 1.5 + 0.01); // (the layer the feet are in: Terrain.isSolidAt)
        const R = CAVE_MAP.RAYS, S = CAVE_MAP.SIGHT;
        const ready = (ix, iz) => !d.hasChunk || d.hasChunk(ix >> 5, iz >> 5); // (CHUNK 32: never makes land for the map)
        const ix0 = Math.floor(x + 0.5), iz0 = Math.floor(z + 0.5);
        if (!ready(ix0, iz0)) return;
        this.mem.open(ix0, iz0);
        for (let r = 0; r < n; r++) {
            const a = ((this.ray++ % R) / R) * Math.PI * 2;
            const dx = Math.cos(a), dz = Math.sin(a);
            let L = L0, lx = ix0, lz = iz0;
            for (let s = 0.5; s <= S; s += 0.5) {
                const ix = Math.floor(x + 0.5 + dx * s), iz = Math.floor(z + 0.5 + dz * s);
                if (ix === lx && iz === lz) continue;
                if (!ready(ix, iz)) break;
                lx = ix; lz = iz;
                // the way along the floor: on, a step up, or down a slope (≤ 2 layers a column)
                if (open(d.get(ix, L, iz)) && open(d.get(ix, L + 1, iz))) {
                    if (open(d.get(ix, L - 1, iz))) { L--; if (open(d.get(ix, L - 1, iz))) L--; }
                } else if (open(d.get(ix, L + 1, iz)) && open(d.get(ix, L + 2, iz))) L++;
                else { this.mem.open(ix, iz); break; } // (the wall: seen, and no further)
                this.mem.open(ix, iz);
                if (Math.abs(L - L0) > 8) break;
            }
        }
    }
}
