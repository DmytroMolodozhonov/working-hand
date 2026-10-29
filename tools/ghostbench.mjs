#!/usr/bin/env node
/**
 * ghostbench.mjs — the Castle of Ghosts (src/world/GhostBuild.js) on real voxels: plans seen from above, layer by layer, and the checks.
 *     node tools/ghostbench.mjs [--seeds 1,7,99] [--layers 0,8,16,30,60] [--check] [--rot 0] [--lo 6 --hi 14] [--top] [--area u0,u1,v0,v1] [--wide]
 * Each seed builds a synthetic site by hand (no world generation): rot from the seed unless --rot, the ground rolling between lo and hi.
 * The plan is drawn in the castle's own frame (u →, v ↓: the gate at the top). Checks (tests/unit/ghost-castle-probe.mjs): the hero reaches
 * every chest, spot, prop and doorway from the entrance; doorways and chests by ways 3 wide; nothing above l 78, outside ±96 or the cell;
 * no air below hi + 1; nothing hangs in the air; 4 chests; ≤ 8000 parts. --check exits with 1 on a problem.
 */
import { BLOCK } from '../src/world/Terrain.js';
import { buildGhostCastle } from '../src/world/GhostBuild.js';
import { makeSite, voxelize, checkCastle, frame } from '../tests/unit/ghost-castle-probe.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const seeds = opt('seeds', '1,7,99').split(',').map(Number);
const layers = args.includes('--layers') ? opt('layers', '').split(',').filter(Boolean).map(Number) : (args.includes('--check') ? [] : [0, 8, 16, -13]);
const CHECK = args.includes('--check');
const area = opt('area', '-96,96,-96,96').split(',').map(Number);
void BLOCK;
const CH = {};
const set = (names, ch) => { for (const n of names.split(' ')) if (BLOCK[n] != null) CH[BLOCK[n]] = ch; };
set('GHOST_STONE', '#'); set('GHOST_BRICK', 'b'); set('GHOST_TILE', '.'); set('GHOST_ROOF', '^'); set('GHOST_LAMP', '*');
set('PLANKS', 'p'); set('PLANKS_DARK', 'P'); set('FENCE', 'f'); set('BOOKS', 'B'); set('CLOTH_WHITE', 'w'); set('CARPET_RED CARPET_BLUE CARPET_GREEN CARPET_PURPLE', 'c');
set('CLOTH_YELLOW', 'y'); set('GOLD', 'G'); set('CS_WHITE', 's'); set('CS_DARK', 'S'); set('WOOD', 'L'); set('ARCANE_DARK', 'a'); set('RUNE', 'r'); set('HAY', 'h'); set('POTION', 'i');
CH[250] = ',';
let fail = 0;
for (const seed of seeds) {
    const rot = args.includes('--rot') ? Number(opt('rot', 0)) : seed % 4;
    const hi = Number(opt('hi', 10 + (seed % 9))), lo = Number(opt('lo', hi - (seed * 7) % 13));
    const site = makeSite({ seed, rot, lo, hi, x: 1536 * 2 + 400 + seed, z: 1536 * 3 + 500 + 2 * seed, gx: 2, gz: 3 });
    const t0 = performance.now();
    const built = buildGhostCastle(site);
    const ms = performance.now() - t0;
    const g = voxelize(site, built);
    const f = frame(site);
    const pick = (u, v, L) => { const t = g.get(f.wx(u, v), L, f.wz(u, v)); return t === 0 ? ' ' : CH[t] || '?'; };
    for (const l of layers) {
        console.log(`\n-- seed ${seed}: layer ${l} (u ${area[0]}…${area[1]} →, v ${area[2]}…${area[3]} ↓; the gate at the top)`);
        for (let v = area[2]; v <= area[3]; v++) { let s = ''; for (let u = area[0]; u <= area[1]; u++) s += pick(u, v, f.L(l)); console.log(s.replace(/\s+$/, '')); }
    }
    if (args.includes('--top')) {
        console.log(`\n-- seed ${seed}: from above (the height of the highest block, 0-9 a-z = every 3 layers)`);
        const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
        for (let v = area[2]; v <= area[3]; v++) { let s = ''; for (let u = area[0]; u <= area[1]; u++) { let c = ' '; for (let L = f.L(80); L >= f.L(-1); L--) { const t = g.get(f.wx(u, v), L, f.wz(u, v)); if (t && t !== 250) { c = digits[Math.max(0, Math.min(35, Math.floor((L - f.L(-1)) / 3)))]; break; } } s += c; } console.log(s.replace(/\s+$/, '')); }
    }
    const t1 = performance.now();
    const res = checkCastle(site, built, g, { wideAll: args.includes('--wide') });
    const S = res.stats;
    console.log(`\nseed ${seed}  rot ${rot}  lo ${lo} hi ${hi} F ${site.F}: частей ${S.parts}, построено за ${ms.toFixed(0)} мс; сундуков ${S.chests}, вещей ${S.props}, комнат ${S.rooms}, мест призраков ${S.spots} (без пути 3 в ширину ${S.spotWide}), дверей ${S.doors}; самый высокий блок l ${S.maxL}; проверка ${(performance.now() - t1).toFixed(0)} мс`);
    if (args.includes('--reach')) for (const l of opt('reach', '0').split(',').map(Number)) {
        console.log(`\n-- seed ${seed}: where the hero stands on layer ${l} (W: by a way 3 wide, R: reached, o: could stand but never reached)`);
        for (let v = area[2]; v <= area[3]; v++) {
            let s = '';
            for (let u = area[0]; u <= area[1]; u++) {
                const x = f.wx(u, v), z = f.wz(u, v), L = f.L(l);
                if (g.inside(x, L, z) && res.wv[g.idx(x, L, z)]) s += 'W';
                else if (g.inside(x, L, z) && res.vis[g.idx(x, L, z)]) s += 'R';
                else if (res.stand(x, L, z)) s += 'o';
                else s += pick(u, v, L);
            }
            console.log(s.replace(/\s+$/, ''));
        }
    }
    for (const m of res.problems) console.log('  ПРОБЛЕМА: ' + m);
    if (!res.problems.length) console.log('  проверки: ок');
    else fail++;
}
if (CHECK && fail) process.exit(1);
