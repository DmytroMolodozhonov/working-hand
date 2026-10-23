// A tiny flat world for the building tests (Structure.js): grass at layer 0, bedrock under it; chunks as TerrainData's.
import { BLOCK, MIN_LAYER, MAX_LAYER, CHUNK } from '../../src/world/Terrain.js';
const H = MAX_LAYER - MIN_LAYER + 1;
export class FlatData {
    constructor() { this.chunks = new Map(); this.bedrockTop = MIN_LAYER; }
    chunk(cx, cz) {
        const k = cx + ',' + cz;
        let c = this.chunks.get(k);
        if (!c) {
            c = { cx, cz, blocks: new Uint8Array(H * CHUNK * CHUNK), top: new Int16Array(CHUNK * CHUNK).fill(0) };
            for (let L = MIN_LAYER; L <= 0; L++) c.blocks.fill(L === MIN_LAYER ? BLOCK.BEDROCK : L === 0 ? BLOCK.GRASS : BLOCK.DIRT, (L - MIN_LAYER) * CHUNK * CHUNK, (L - MIN_LAYER + 1) * CHUNK * CHUNK);
            this.chunks.set(k, c);
        }
        return c;
    }
    get(x, L, z) { if (L < MIN_LAYER || L > MAX_LAYER) return BLOCK.AIR; const c = this.chunk(x >> 5, z >> 5); return c.blocks[(L - MIN_LAYER) * CHUNK * CHUNK + (z & 31) * CHUNK + (x & 31)]; }
    set(x, L, z, t) {
        if (L < MIN_LAYER || L > MAX_LAYER) return;
        const c = this.chunk(x >> 5, z >> 5), col = (z & 31) * CHUNK + (x & 31);
        c.blocks[(L - MIN_LAYER) * CHUNK * CHUNK + col] = t;
        if (t !== BLOCK.AIR && L > c.top[col]) c.top[col] = L;
        else if (t === BLOCK.AIR && L === c.top[col]) { let l = L; while (l > MIN_LAYER && c.blocks[(l - MIN_LAYER) * CHUNK * CHUNK + col] === BLOCK.AIR) l--; c.top[col] = l; }
    }
    topLayer(x, z) { return this.chunk(x >> 5, z >> 5).top[(z & 31) * CHUNK + (x & 31)]; }
    shapeAt() { return 0; }
    box(x0, L0, z0, x1, L1, z1, t) { for (let L = L0; L <= L1; L++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, L, z, t); }
    count(x0, L0, z0, x1, L1, z1, t) { let n = 0; for (let L = L0; L <= L1; L++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.get(x, L, z) === t) n++; return n; }
}
