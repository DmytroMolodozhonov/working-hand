// Замер данжей без игры (Dungeons.js, DungeonBuild.js, DungeonRuins.js): сколько их на карту, размеры, число сундуков, связность проходов.
//   node tools/dungeonbench.mjs [--seed 7] [--radius 12] [--kind mine] [--check] [--map [id]] [--seeds 1,2,3]
// --check  : по каждому данжу — сундуки не в камне, к каждому можно дойти от входа (настоящие блоки мира), всё внутри своей клетки; падает при проблемах
// --map id : карта сверху (под землёй — этаж комнат; на земле — верхний блок) и список сундуков одного данжа (по id или по виду: --map mine)
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { KINDS, DUNGEON } from '../src/world/DungeonRules.js';
import { checkDungeon, makeLand } from '../src/world/DungeonCheck.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const seeds = String(opt('seeds', opt('seed', '7'))).split(',').map(Number);
const R = +opt('radius', 10), only = opt('kind', null), check = !!opt('check', false), mapArg = opt('map', null);

const GLYPH = {};
const B = BLOCK;
for (const [k, g] of Object.entries({ GRASS: ',', DIRT: ';', STONE: 's', WOOD: 'w', LEAVES: 'l', BIRCH_LEAVES: 'l', DARK_LEAVES: 'l', SAND: ':', CS_GREY: '#', CS_SAND: '%', CS_DARK: 'D', CS_WHITE: 'W', CS_MOSSY: 'm', COBBLE: 'c', BRICK: 'b', PLANKS: 'p', PLANKS_DARK: 'P', ARCANE: 'A', ARCANE_DARK: 'a', ARCANE_LAMP: '*', ARCANE_LAMP_VIOLET: '*', RUNE: 'R', GRAVEL: 'g', DEEPSTONE: 'd', PATH: '.', HAY: 'h', LANTERN: '*', BOOKS: 'B', GOLD: '$', FLOWERS: 'f', FENCE: '|', CARPET_RED: 'r', FARMLAND: 'F', VEG: 'v', WHEAT: 'v', BIRCH: 'w', DARK: 'w' })) GLYPH[B[k]] = g;

let failed = 0;
for (const seed of seeds) {
    const t = new TerrainData();
    t.generate({ seed, mountains: true, seas: true, lush: true, deepCaves: true, slopes: true, wizHuts: true, furnish: true, dungeons: true });
    const found = [];
    for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const s = t.dungeons.cellOf(gx, gz); if (s) found.push(s); }
    const cells = (2 * R + 1) ** 2, km2 = (cells * DUNGEON.CELL * DUNGEON.CELL) / 1e6;
    const by = {};
    for (const s of found) (by[s.type] ||= []).push(s);
    console.log(`\nмир ${seed}: ${found.length} данжей на ${cells} клеток (${km2.toFixed(1)} км²) — один на ${(km2 / Math.max(1, found.length)).toFixed(2)} км²`);
    for (const id of Object.keys(KINDS)) {
        const list = by[id] || [];
        if (only && only !== id) continue;
        const K = KINDS[id];
        let parts = 0, ch = 0, ms = 0, bad = 0, unreached = 0;
        const ts = performance.now();
        for (const s of list) { const b = s.ready(); parts += b.parts.length; ch += b.chests.length; if (b.chests.length < K.chests[0] || b.chests.length > K.chests[1]) bad++; }
        ms = performance.now() - ts;
        let problems = 0;
        if (check) for (const s of list) {
            const c = checkDungeon(t, s);
            unreached += c.chests - c.reached;
            if (c.problems.length) { problems += c.problems.length; console.log(`  ✗ ${s.id} ${id} (${s.x},${s.z}): ${c.problems.slice(0, 4).join('; ')}`); }
        }
        console.log(`${K.under ? 'под землёй' : K.magic ? 'магия    ' : 'обычный  '} ${id.padEnd(11)} ${String(list.length).padStart(3)} шт; частей ${list.length ? Math.round(parts / list.length) : 0}; сундуков ${list.length ? (ch / list.length).toFixed(1) : '-'} (нужно ${K.chests.join('–')}${bad ? `, вне границ: ${bad}` : ''}); постройка ${list.length ? (ms / list.length).toFixed(1) : 0} мс${check ? `; проблем ${problems}, недоступных сундуков ${unreached}` : ''}`);
        if (bad || problems || unreached) failed++;
    }
    if (mapArg) {
        const s = found.find((d) => d.id === mapArg || d.type === mapArg);
        if (!s) console.log('нет такого данжа');
        else {
            const b = s.ready();
            makeLand(t, s);
            console.log(`\n${s.id} ${s.name} @ ${s.x},${s.z} F=${s.F} rot=${s.rot}; сундуки:`, b.chests.map((c) => `${c.room}@${c.x},${c.z}`).join(' '));
            const x0 = Math.max(s.x0, s.x - 60), x1 = Math.min(s.x1, s.x + 60), z0 = Math.max(s.z0, s.z - 60), z1 = Math.min(s.z1, s.z + 60);
            const level = s.under ? s.F + 1 : null;
            for (let z = z0; z <= z1; z++) {
                let row = '';
                for (let x = x0; x <= x1; x++) {
                    if (b.chests.some((c) => Math.round(c.x) === x && Math.round(c.z) === z)) { row += 'C'; continue; }
                    if (s.under) {
                        const air = [0, 1, 2, 3].every((d) => t.get(x, level + d, z) === 0);
                        let c = air ? ' ' : '#';
                        if (!air && t.get(x, level, z) !== 0) c = GLYPH[t.get(x, level, z)] || '#';
                        row += c; continue;
                    }
                    let top = null;
                    for (let L = 60; L >= -2; L--) { const v = t.get(x, L, z); if (v !== 0 && v !== 8) { top = v; break; } }
                    row += GLYPH[top] || (top ? '?' : ' ');
                }
                console.log(row);
            }
        }
    }
}
if (check && failed) { console.log('\nЕСТЬ ПРОБЛЕМЫ'); process.exit(1); }
