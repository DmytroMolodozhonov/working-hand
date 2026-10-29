#!/usr/bin/env node
/**
 * structbench.mjs — does every building the game makes stand by the physics of buildings (src/world/Structure.js)?
 * A world just made must have no block the model would let fall: else the world would come down by itself the
 * first time a blast or a fire touched it. Run:
 *     node tools/structbench.mjs [--seeds 20261015,7,99] [--cells 2] [--test] [--show 12] [--check]
 *
 * For each seed (a new world: generation 6 — seas, caves, the landscape, slopes; --test: the creative test
 * ground too) the places within --cells castle cells of the start (castles and their villages and ports,
 * the wizards' tower and settlements, hamlets, the duel arenas, the Ice Castle) are cut into tiles; each tile
 * is judged with a border round it (what is in the border only holds — it is judged in its own tile).
 * Prints per kind of place: the built blocks looked at; «упало бы» — what the game's own check («as built, so it
 * stands»: Structure.settle with nothing taken away) would let fall (must be none); and the weak places the plain
 * physics finds (no way down «висит», crushed «раздавлен», joints torn «разрыв») — they stand as built, and give way
 * only if a change loads them more (a turret standing on a roof…); a few of each (place, block).
 * --magic: the buildings players make by magic too — «Create a House» (levels 1…5) / «Improve a House», «Create a Castle»,
 * «Create an Ice Castle», «Ice Bridge» — built on flat land for a few seeds and judged the same way.
 * --check: fails if anything would fall.
 */
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { judge, settle } from '../src/world/Structure.js';
import { hangingSearch } from '../src/world/Collapse.js';
import { CASTLE_CELL } from '../src/world/Castles.js';
import { FlatData } from '../tests/unit/structure-fake.mjs';
import { housePlan } from '../src/world/MagicHouse.js';
import { castleCells } from '../src/world/MagicCastle.js';
import { iceCastleMagicPlan, iceBridgePlan } from '../src/world/IceMagicPlan.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SEEDS = (opt('seeds', '20261015,7,99,1234,555')).split(',').map(Number);
const CELLS = Number(opt('cells', '2'));
const SHOW = Number(opt('show', '8'));
const TEST = args.includes('--test');
const CHECK = args.includes('--check');
const TILE = 48, BORDER = 18;

const NAME = Object.fromEntries(Object.entries(BLOCK).map(([k, v]) => [v, k]));
let bad = 0, weak = 0;

function judgeArea(data, X0, X1, Z0, Z1, tally, label) {
    for (let tz = Z0; tz <= Z1; tz += TILE) for (let tx = X0; tx <= X1; tx += TILE) {
        const ix1 = Math.min(X1, tx + TILE - 1), iz1 = Math.min(Z1, tz + TILE - 1);
        const x0 = tx - BORDER, x1 = ix1 + BORDER, z0 = tz - BORDER, z1 = iz1 + BORDER;
        let lo = Infinity, hi = -Infinity;
        for (let z = z0; z <= z1; z += 2) for (let x = x0; x <= x1; x += 2) { const t = data.topLayer(x, z); if (t < lo) lo = t; if (t > hi) hi = t; }
        const L0 = Math.max((data.bedrockTop ?? -17) + 1, lo - 14), L1 = Math.min(120, hi + 1);
        const B = { x0, z0, L0, NX: x1 - x0 + 1, NY: L1 - L0 + 1, NZ: z1 - z0 + 1 };
        const r = judge(data, B);
        const inside = (c) => c[0] >= tx && c[0] <= ix1 && c[2] >= tz && c[2] <= iz1;
        // (what the game made hanging in the air already — not joined to the ground at all, as before: not this model's)
        if (r.lost.length) {
            const S = hangingSearch(data);
            for (const c of r.lost) S.visit(c[0], c[1], c[2]);
            const old = new Set();
            for (const p of S.pieces) for (const c of p.cells) old.add(c[0] + ',' + c[1] + ',' + c[2]);
            const was = r.lost.filter((c) => old.has(c[0] + ',' + c[1] + ',' + c[2]));
            r.lost = r.lost.filter((c) => !old.has(c[0] + ',' + c[1] + ',' + c[2]));
            for (const c of was) if (inside(c)) { tally.floating++; if (tally.fex.length < 3) tally.fex.push(`${c[0]},${c[1]},${c[2]} ${NAME[c[3]]}`); }
        }
        tally.built += r.built;
        // as the game uses it («as built, so it stands»: nothing taken away — nothing may fall)
        settle(data, B, (p) => { for (const c of p.cells) if (inside(c)) { tally.fell++; if (tally.fallEx.length < SHOW) tally.fallEx.push(`упал бы ${c[0]},${c[1]},${c[2]} ${NAME[c[3]]} (${label})`); } },
            (cells) => { for (const c of cells) if (inside(c)) tally.fell++; }, []);
        for (const [k, list] of [['lost', r.lost], ['crushed', r.crushed], ['torn', r.torn]]) for (const c of list) {
            if (!inside(c)) continue;
            tally[k]++;
            if (tally.ex.length < SHOW) tally.ex.push(`${k === 'lost' ? 'висит' : k === 'crushed' ? 'раздавлен' : 'разрыв'} ${c[0]},${c[1]},${c[2]} ${NAME[c[3]] || c[3]}${k === 'torn' ? ' ' + ['+x', '−x', '+z', '−z', 'вверх', 'наискось +x', 'наискось −x', 'наискось +z', 'наискось −z'][c[4]] : ''} (${label})`);
        }
    }
}

if (args.includes('--magic')) {
    const tallies = new Map();
    const tallyOf = (k) => { if (!tallies.has(k)) tallies.set(k, { n: 0, built: 0, lost: 0, crushed: 0, torn: 0, floating: 0, fell: 0, ex: [], fex: [], fallEx: [] }); return tallies.get(k); };
    const put = (d, cells, fill) => {
        for (const c of fill || []) if (!d.get(c[0], c[1], c[2])) d.set(c[0], c[1], c[2], c[3]);
        for (const c of cells) d.set(c[0], c[1], c[2], c[3]);
    };
    for (const seed of SEEDS.slice(0, 4)) {
        for (let level = 1; level <= 5; level++) {
            const d = new FlatData(), pl = housePlan({ seed, level, x: 0, z: 0, G: 0, face: seed & 3, woods: [BLOCK.WOOD] });
            put(d, pl.cells, pl.fill);
            const T = tallyOf('дом ' + level); T.n++;
            judgeArea(d, -40, 40, -40, 40, T, `сид ${seed}`);
        }
        {
            const d = new FlatData(), r = castleCells({ seed, x: 0, z: 0, G: 0, face: seed & 3 });
            const cells = [];
            for (let i = 0; i < r.n; i++) cells.push([r.cells[i * 5], r.cells[i * 5 + 1], r.cells[i * 5 + 2], r.cells[i * 5 + 3]]);
            const fill = [];
            for (let i = 0; i < (r.fill?.length || 0); i += 4) fill.push([r.fill[i], r.fill[i + 1], r.fill[i + 2], r.fill[i + 3]]);
            put(d, cells, fill);
            const T = tallyOf('замок магией'); T.n++;
            judgeArea(d, -90, 90, -90, 90, T, `сид ${seed}`);
        }
        {
            const d = new FlatData(), pl = iceCastleMagicPlan({ x: 0, z: 0, G: 0, rot: seed & 3, pil: [] });
            put(d, pl.cells, pl.floor);
            const T = tallyOf('ледяной магией'); T.n++;
            judgeArea(d, -70, 70, -70, 70, T, `сид ${seed}`);
        }
        {
            const d = new FlatData(), len = 20 + (seed % 5) * 8, pl = iceBridgePlan({ ax: 0, az: 0, aL: 1, bx: len, bz: 0, bL: 1 });
            put(d, pl.cells);
            const T = tallyOf('ледяной мост'); T.n++;
            judgeArea(d, -10, len + 10, -15, 15, T, `длина ${len}`);
        }
    }
    console.log('\nпостройки магией:');
    for (const [k, T] of tallies) {
        bad += T.fell;
        weak += T.lost + T.crushed + T.torn;
        console.log(`  ${k.padEnd(14)} штук ${String(T.n).padStart(3)}  блоков ${String(T.built).padStart(8)}  упало бы ${T.fell}  | слабые места «как построено»: висит ${T.lost}  раздавлен ${T.crushed}  разрыв ${T.torn}` +
            (T.floating ? `   (и ${T.floating} висели в воздухе вовсе)` : ''));
        for (const e of [...T.fallEx, ...T.ex]) console.log('      ' + e);
    }
}

for (const seed of args.includes('--magic') && !args.includes('--seeds') ? [] : SEEDS) {
    const data = new TerrainData();
    data.generate({ seed, mountains: true, seas: true, test: TEST, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: !args.includes('--no-furnish'), buildings: !args.includes('--no-buildings') }); // (the newest generation; --no-furnish: the castles' rooms empty, as before generation 8)
    data.skipSeaTop = true;
    const tallies = new Map();
    const tallyOf = (k) => { if (!tallies.has(k)) tallies.set(k, { n: 0, built: 0, lost: 0, crushed: 0, torn: 0, floating: 0, fell: 0, ex: [], fex: [], fallEx: [] }); return tallies.get(k); };
    const seen = new Set();
    const t0 = performance.now();
    const R = CELLS * CASTLE_CELL;
    for (let gz = -R; gz <= R; gz += CASTLE_CELL / 2) for (let gx = -R; gx <= R; gx += CASTLE_CELL / 2) {
        const list = [...data.sites.near(gx, gz, CASTLE_CELL / 2), ...data.sites.arenasNear(gx, gz, CASTLE_CELL / 2)];
        for (const s of list) {
            const id = s.id || `${s.x},${s.z}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const kind = s.style || s.kind || (String(id).slice(0, 2));
            const z = (s.zone || 24) + 6;
            const T = tallyOf(kind);
            T.n++;
            judgeArea(data, Math.floor(s.x - z), Math.ceil(s.x + z), Math.floor(s.z - z), Math.ceil(s.z + z), T, id);
            // a castle's port and its ships' quay reach beyond the zone
            if (s.port?.rect) { const q = s.port.rect; judgeArea(data, Math.floor(q.x0 - 4), Math.ceil(q.x1 + 4), Math.floor(q.z0 - 4), Math.ceil(q.z1 + 4), tallyOf('port'), id); }
        }
    }
    const ice = data.iceCastle?.plan;
    if (ice && Math.max(Math.abs(ice.x), Math.abs(ice.z)) < R + CASTLE_CELL) { const T = tallyOf('ice castle'); T.n++; judgeArea(data, Math.floor(ice.x0), Math.ceil(ice.x1), Math.floor(ice.z0), Math.ceil(ice.z1), T, 'ice'); }
    console.log(`\nсид ${seed}${TEST ? ' (Творческий)' : ''}: ${((performance.now() - t0) / 1000).toFixed(1)} с`);
    for (const [k, T] of tallies) {
        bad += T.fell;
        weak += T.lost + T.crushed + T.torn;
        console.log(`  ${k.padEnd(14)} мест ${String(T.n).padStart(3)}  блоков ${String(T.built).padStart(8)}  упало бы ${T.fell}  | слабые места «как построено»: висит ${T.lost}  раздавлен ${T.crushed}  разрыв ${T.torn}` +
            (T.floating ? `   (и ${T.floating} висели в воздухе и раньше — не соединены с землёй вовсе: ${T.fex.join('; ')})` : ''));
        for (const e of [...T.fallEx, ...T.ex]) console.log('      ' + e);
    }
}
console.log(bad ? `\nупало бы в нетронутом мире: ${bad}` : '\nвсё стоит', `(слабых мест, что держатся «как построено» — рухнут, если их нагрузить сильнее: ${weak})`);
if (CHECK && bad) process.exit(1);
