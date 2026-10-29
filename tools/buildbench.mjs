#!/usr/bin/env node
/**
 * buildbench.mjs — the settlement buildings (src/world/Buildings.js) as plans seen from above, layer by layer, and their checks.
 *     node tools/buildbench.mjs [kind ...] [--layers 0,2,5] [--face 0] [--top]
 * Each building is built alone on a flat plan (floor layer 0): the blocks of each layer in ASCII (x →, z ↓: the door is at the top),
 * what the checks say (a way 3 wide from the door to everything that is used).
 */
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { Plan } from '../src/world/Castles.js';
import { buildBuilding, BUILDING_IDS } from '../src/world/Buildings.js';
import { createRng } from '../src/core/math.js';
import { rasterParts, makeStyle, checkBuilding, fitsMap } from '../tests/unit/building-util.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const kinds = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['layers', 'face', 'seed'].includes(args[i - 1].slice(2)))).filter((k) => BUILDING_IDS.includes(k));
const layers = opt('layers', '0,1,2,3,5,8').split(',').map(Number);
const face = Number(opt('face', 0));
const TOP = args.includes('--top');
void new TerrainData();
const CH = {};
const set = (names, ch) => { for (const n of names.split(' ')) if (BLOCK[n] != null) CH[BLOCK[n]] = ch; };
set('PLANKS', 'p'); set('PLANKS_DARK', 'P'); set('FENCE', 'f'); set('BOOKS', 'B'); set('LANTERN', '*'); set('CLOTH_WHITE', 'w'); set('CARPET_RED CARPET_BLUE CARPET_GREEN CARPET_PURPLE', 'c'); set('CLOTH_YELLOW', 'y');
set('GOLD', 'G'); set('COBBLE', 'o'); set('CS_GREY CS_SAND CS_WHITE CS_MOSSY', 's'); set('CS_DARK', 'S'); set('POTION', 'i'); set('HAY', 'h'); set('VEG', 'v'); set('FLOWERS', 'x'); set('WOOD', 'L');
set('BRICK', 'b'); set('PLASTER', 'g'); set('ROOF_RED ROOF_BLUE ROOF_SLATE THATCH ROOF_PURPLE', '^'); set('PATH', ':'); set('WATER', '~'); set('DEEPSTONE', 'd'); set('WHEAT', 'W'); set('FARMLAND', '_'); set('GRAVEL', '.');
for (const kind of kinds.length ? kinds : BUILDING_IDS) {
    const p = new Plan(0, 0, 0, 0);
    const out = { houses: [], stalls: [], fields: [], pens: [] };
    const s = makeStyle();
    const door = buildBuilding(p, kind, 0, 0, face, createRng(7), s, out);
    const g = rasterParts(p.parts);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const k of g.keys()) { const [x, , z] = k.split(',').map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    console.log(`\n===== ${kind}  (${x1 - x0 + 1} × ${z1 - z0 + 1} blocks, x ${x0}…${x1}, z ${z0}…${z1}) =====`);
    const F = p.F;
    const draw = (title, pick) => {
        console.log('-- ' + title);
        for (let z = z0; z <= z1; z++) { let line = ''; for (let x = x0; x <= x1; x++) line += pick(x, z); console.log(line); }
    };
    for (const l of layers) {
        const L = F + 1 + l;
        draw(`layer ${l}`, (x, z) => { const t = g.get(`${x},${L},${z}`); return t == null ? ' ' : t === 0 ? ' ' : CH[t] || '#'; });
    }
    if (TOP) draw('from above', (x, z) => { for (let L = F + 40; L >= F; L--) { const t = g.get(`${x},${L},${z}`); if (t) return CH[t] || '#'; } return ' '; });
    if (args.includes('--fits')) { const fit = fitsMap(p, g); draw('free 3×3 (.)', (x, z) => (fit(x, z) ? '.' : '#')); }
    const c = checkBuilding(p, out, kind, g);
    console.log(`house: beds ${out.houses.at(-1)?.beds ?? '-'} chests ${out.houses.at(-1)?.chests.length ?? '-'} windows ${out.houses.at(-1)?.windows.length ?? '-'} stalls ${out.stalls.length} fx ${(out.fx || []).length}`);
    for (const m of c.problems) console.log('  ПРОБЛЕМА: ' + m);
    if (!c.problems.length) console.log('  проверки: ок');
}
