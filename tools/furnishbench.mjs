#!/usr/bin/env node
/**
 * furnishbench.mjs — what stands in the rooms of the castles (the keep's rooms: size, furniture, chests).
 *     node tools/furnishbench.mjs [--seeds 20261015,7,99] [--gen 7|8] [--cells 2] [--rooms]
 * Per castle: every room's floor (blocks), its height, the furniture blocks standing on the floor (layers l..l+4, not
 * counting walls), the chests in it. Totals per kind of room.
 */
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { CASTLE_CELL } from '../src/world/Castles.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SEEDS = opt('seeds', '20261015,7,99,1234,555').split(',').map(Number);
const GEN = Number(opt('gen', '8'));
const CELLS = Number(opt('cells', '2'));
const SHOW = args.includes('--rooms');
const MAP = opt('map', null); // a castle id (cs1_1) [--kind king]: its rooms as a plan
const KIND = opt('kind', null);
const HEIGHTS = args.includes('--h');
const LOW = Number(opt('low', 7)); // look only at the layers up to this height over the floor (2: the tables, beds, chests)

export function raster(castle, rect, L0, L1) {
    const g = new Map();
    for (const q of castle.parts) {
        if (q.k !== 0 || q.x1 < rect.x0 || q.x0 > rect.x1 || q.z1 < rect.z0 || q.z0 > rect.z1) continue;
        for (let x = Math.max(q.x0, rect.x0); x <= Math.min(q.x1, rect.x1); x++) for (let z = Math.max(q.z0, rect.z0); z <= Math.min(q.z1, rect.z1); z++) {
            for (let L = Math.max(q.L0, L0); L <= Math.min(q.L1, L1); L++) g.set(x + ',' + L + ',' + z, q.t);
        }
    }
    return g;
}

const CH = {};
for (const [k, v] of Object.entries(BLOCK)) CH[v] = ({ PLANKS: 'p', PLANKS_DARK: 'P', FENCE: 'f', BOOKS: 'B', LANTERN: '*', CLOTH_WHITE: 'w', CARPET_RED: 'c', CARPET_BLUE: 'c', CARPET_GREEN: 'c', CLOTH_YELLOW: 'y', GOLD: 'G', COBBLE: 'o', CS_GREY: 's', CS_DARK: 'S', CS_WHITE: 'W', CS_SAND: 's', CS_MOSSY: 's', POTION: 'i', HAY: 'h', VEG: 'v', FLOWERS: 'x', WOOD: 'L', ARCANE_LAMP: '+', ARCANE_LAMP_VIOLET: '+', CARPET_PURPLE: 'c', BRICK: 'b' })[k] || '#';
function plan(c, r, g) {
    const l = r.l || 0, floorL = c.F + 1 + l;
    const x0 = Math.floor(r.x0), x1 = Math.floor(r.x1), z0 = Math.floor(r.z0), z1 = Math.floor(r.z1);
    const rows = [];
    for (let z = z0; z <= z1; z++) {
        let line = '';
        for (let x = x0; x <= x1; x++) {
            let ch = '.', top = -1;
            for (let L = floorL + LOW; L >= floorL - 1; L--) {
                const t = g.get(x + ',' + L + ',' + z);
                if (t === undefined) continue;
                if (t) { ch = HEIGHTS ? String(Math.min(9, L - floorL + 1)) : CH[t] || '#'; top = L; break; }
            }
            if (ch === '.') { const f = g.get(x + ',' + (floorL - 1) + ',' + z); if (f && f !== BLOCK.COBBLE && f !== BLOCK.PLANKS_DARK && f !== BLOCK.CS_GREY && f !== BLOCK.CS_DARK) ch = ':'; }
            line += ch;
        }
        rows.push(line);
    }
    for (const ch of c.chests) { const x = Math.floor(ch.x), z = Math.floor(ch.z); if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && Math.abs(ch.y - (floorL - 1.5)) < 1.5) { const row = rows[z - z0].split(''); row[x - x0] = ch.room === 'king' ? 'K' : 'C'; rows[z - z0] = row.join(''); } }
    return rows;
}
const sum = {};
for (const seed of SEEDS) {
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: GEN >= 7, furnish: GEN >= 8 });
    const seen = new Set();
    for (let gz = -CELLS; gz <= CELLS; gz++) for (let gx = -CELLS; gx <= CELLS; gx++) {
        const c = d.castles.cellOf(gx, gz);
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        const rows = [];
        const chestsBy = {};
        for (const ch of c.chests) chestsBy[ch.room] = (chestsBy[ch.room] || 0) + 1;
        for (const r of c.rooms) {
            if (r.kind === 'stairs') continue;
            const l = r.l || 0, floorL = c.F + 1 + l;
            const g = raster(c, { x0: Math.floor(r.x0), x1: Math.floor(r.x1), z0: Math.floor(r.z0), z1: Math.floor(r.z1) }, floorL, floorL + 4);
            let n = 0;
            for (const [, t] of g) if (t) n++;
            const W = Math.floor(r.x1) - Math.floor(r.x0) + 1, D = Math.floor(r.z1) - Math.floor(r.z0) + 1;
            rows.push({ kind: r.kind, W, D, furn: n, l });
        }
        for (const r of rows) {
            const s = sum[r.kind] || (sum[r.kind] = { n: 0, area: 0, furn: 0, chests: 0, min: 1e9 });
            s.n++; s.area += r.W * r.D; s.furn += r.furn; s.min = Math.min(s.min, r.furn);
        }
        for (const [k, v] of Object.entries(chestsBy)) (sum[k] || (sum[k] = { n: 0, area: 0, furn: 0, chests: 0, min: 0 })).chests += v;
        sum._all = sum._all || { n: 0, chests: 0, castles: 0 };
        sum._all.castles++; sum._all.chests += c.chests.length;
        if (MAP && c.id === MAP) {
            for (const r of c.rooms) {
                if (KIND && r.kind !== KIND) continue;
                const g = raster(c, { x0: Math.floor(r.x0) - 1, x1: Math.floor(r.x1) + 1, z0: Math.floor(r.z0) - 1, z1: Math.floor(r.z1) + 1 }, c.F + 1 + (r.l || 0) - 1, c.F + 1 + (r.l || 0) + 8);
                console.log(`\n${r.kind}${r.l ? '^' : ''} ${Math.floor(r.x1) - Math.floor(r.x0) + 1}x${Math.floor(r.z1) - Math.floor(r.z0) + 1} items ${r.items ?? '-'}   (x →, z ↓)`);
                console.log(plan(c, r, g).join('\n'));
            }
        }
        if (SHOW) console.log(`${c.id} ${c.style}: ` + rows.map((r) => `${r.kind}${r.l ? '^' : ''} ${r.W}x${r.D} f${r.furn}`).join(' | ') + ` | сундуков ${c.chests.length}`);
    }
}
console.log(`gen ${GEN}:`);
for (const [k, s] of Object.entries(sum)) {
    if (k === '_all') { console.log(`  замков ${s.castles}, сундуков всего ${s.chests}, в среднем ${(s.chests / s.castles).toFixed(1)}`); continue; }
    console.log(`  ${k.padEnd(10)} комнат ${String(s.n).padStart(3)}  средняя площадь ${s.n ? (s.area / s.n).toFixed(0) : '-'}  мебели (блоков) в среднем ${s.n ? (s.furn / s.n).toFixed(1) : '-'} (мин ${s.min})  сундуков ${s.chests}`);
}
