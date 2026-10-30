#!/usr/bin/env node
/**
 * loadbench.mjs — where the processor's time goes when the land around the hero is made (as the terrain worker does it).
 *   node tools/loadbench.mjs [--seed 20261015] [--radius 5] [--at x,z] [--gen 20]
 * Makes every chunk in a square round a point, the way terrain.worker.js 'build' does (ground of the chunk and its
 * neighbours, the caves' daylight, the mesh), and splits the time: generation / daylight (_skyLight) / faces
 * (greedy meshing + colours) / the rest. Also the grass and flowers (FloraBuild) of each chunk.
 */
import { TerrainData, mergeBuffers } from '../src/world/Terrain.js';
import { buildFlora } from '../src/world/FloraBuild.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('seed', '20261015'), R = +opt('radius', '5');
const AT = opt('at', '0,0').split(',').map(Number);
const GEN = +opt('gen', '20');
const opts = {
    seed: SEED, mountains: true, seas: GEN >= 2, test: GEN >= 3, deepCaves: GEN >= 4, lush: GEN >= 5, slopes: GEN >= 6, wizHuts: GEN >= 7,
    furnish: GEN >= 8, apart: GEN >= 11, bigHouses: GEN >= 14, dungeons: GEN >= 15, arenaEntries: GEN >= 16, buildings: GEN >= 17,
    ghostCastle: GEN >= 18, arenaX2: GEN >= 19, iceArena: GEN >= 20, queenMap: GEN >= 22,
};
const t = { gen: 0, sky: 0, mesh: 0, merge: 0, flora: 0, init: 0 };
let n0 = performance.now();
const d = new TerrainData(); d.generate(opts); d.skipSeaTop = true;
t.init = performance.now() - n0;
// time the generation of a chunk apart from the meshing: chunk() made fresh = generation
const chunk0 = d.chunk.bind(d);
let inGen = 0;
d.chunk = (cx, cz) => {
    if (inGen || d.hasChunk(cx, cz)) return chunk0(cx, cz);
    inGen++; const a = performance.now();
    try { return chunk0(cx, cz); } finally { inGen--; t.gen += performance.now() - a; }
};
const sky0 = d._skyLight.bind(d);
d._skyLight = (cx, cz) => {
    const g = t.gen, a = performance.now();
    try { return sky0(cx, cz); } finally { t.sky += performance.now() - a - (t.gen - g); }
};
const cx0 = Math.floor(AT[0] / 32), cz0 = Math.floor(AT[1] / 32);
let chunks = 0, verts = 0, caved = 0;
const all = performance.now();
for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const g = t.gen, s = t.sky, a = performance.now();
    const arr = d.buildChunkArrays(cx0 + dx, cz0 + dz);
    t.mesh += performance.now() - a - (t.gen - g) - (t.sky - s);
    const b = performance.now();
    const land = mergeBuffers(arr.ground, arr.raised);
    t.merge += performance.now() - b;
    verts += land.positions.length / 3;
    const c = d.chunk(cx0 + dx, cz0 + dz);
    if (c.sky) caved++;
    const f = performance.now();
    buildFlora(d, c);
    t.flora += performance.now() - f;
    chunks++;
}
const total = performance.now() - all;
const row = (k, v) => console.log(`${k.padEnd(28)} ${v.toFixed(0).padStart(7)} мс  ${(v / chunks).toFixed(2).padStart(6)} мс/чанк  ${(100 * v / total).toFixed(0).padStart(3)} %`);
console.log(`сид ${SEED}, поколение ${GEN}, точка ${AT}, чанков ${chunks} (с пещерным светом ${caved}), вершин суши ${verts}`);
console.log(`подготовка мира (generate)   ${t.init.toFixed(0)} мс`);
row('генерация земли', t.gen);
row('свет пещер (_skyLight)', t.sky);
row('грани/цвета (меш)', t.mesh);
row('слияние буферов', t.merge);
row('трава и цветы (Flora)', t.flora);
row('ВСЕГО', total);
