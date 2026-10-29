/**
 * ghost-castle-probe.mjs — the Castle of Ghosts on real voxels (GhostBuild.js), for tools/ghostbench.mjs and tests/unit/ghost-castle-build.test.js.
 *
 * A synthetic site (a GhostSite made by hand: no world generation), a rolling ground between its `lo` and `hi`, the castle's parts laid the
 * way Terrain._buildCastles lays them (a box, a disc, a ring's sector; the ramp marks ignored), and the checks:
 *   reach   — a hero (a floor under him, 5 free layers over it, steps of one layer) gets from the entrance to every chest, spot, prop and door;
 *   wide    — the doorways and the chests are reached by ways 3 blocks wide (every cell of the way and its 4 neighbours standable within a layer);
 *   top     — no block above site.top or above local layer 78;
 *   land    — no air carved below layer hi + 1 (the land is never cut);
 *   bounds  — nothing outside the ±96 square nor outside the cell;
 *   things  — chests, props and spots stand on a floor with air over them;
 *   hang    — every block is joined (6 sides) to the ground through other blocks;
 *   counts  — 4 chests with the 4 ids, ≤ 8000 parts.
 */
import { BLOCK } from '../../src/world/Terrain.js';
import { GhostSite } from '../../src/world/GhostCastle.js';
import { GHOST_CASTLE as GC, GHOST_CHESTS } from '../../src/game/GhostRules.js';

const GROUND = 250;
const TAU = Math.PI * 2;

/** A castle site by hand: (x, z) its middle, the ground between lo and hi, rot 0…3. */
export function makeSite({ seed = 1, x = 0, z = 0, rot = 0, lo = 6, hi = 14, gx = 0, gz = 0 } = {}) {
    const F = hi + GC.PLINTH;
    return new GhostSite({
        id: 'gc' + gx + '_' + gz, gx, gz, seed, name: 'Замок призраков', x, z, rot, F, lo, hi, cx: x, cz: z, zone: GC.HALF,
        x0: x - GC.HALF, x1: x + GC.HALF, z0: z - GC.HALF, z1: z + GC.HALF, top: F + 1 + 80,
    });
}

/** The synthetic ground's top layer at (x, z): rolls between lo and hi. */
export function groundAt(site, x, z) {
    const t = 0.5 + 0.5 * Math.sin((x - site.x) / 23 + site.seed) * Math.cos((z - site.z) / 31);
    return Math.round(site.lo + (site.hi - site.lo) * t);
}

/** The voxels: the ground, then the castle's parts in order. */
export function voxelize(site, built) {
    const M = GC.HALF + 2;
    const x0 = site.x - M, z0 = site.z - M, W = 2 * M + 1, D = 2 * M + 1;
    const L0 = site.lo - 6, L1 = site.F + 1 + 84, H = L1 - L0 + 1;
    const data = new Uint8Array(W * D * H);
    const idx = (x, L, z) => ((L - L0) * D + (z - z0)) * W + (x - x0);
    for (let z = z0; z < z0 + D; z++) for (let x = x0; x < x0 + W; x++) {
        const h = groundAt(site, x, z);
        for (let L = L0; L <= h; L++) data[idx(x, L, z)] = GROUND;
    }
    for (const p of built.parts) {
        if (p.k === 3) continue;
        const ax = Math.max(p.x0, x0), bx = Math.min(p.x1, x0 + W - 1), az = Math.max(p.z0, z0), bz = Math.min(p.z1, z0 + D - 1);
        const La = Math.max(p.L0, L0), Lb = Math.min(p.L1, L1);
        if (ax > bx || az > bz || La > Lb) continue;
        const cyl = p.k === 1 || p.k === 2;
        const r2 = cyl ? p.r * p.r + p.r * 0.6 : 0, h2 = cyl && p.hr >= 0 ? p.hr * p.hr + p.hr * 0.6 : -1;
        for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
            if (cyl) {
                const d2 = (x - p.cx) * (x - p.cx) + (z - p.cz) * (z - p.cz);
                if (d2 > r2 || d2 <= h2) continue;
                if (p.k === 2) { let a = Math.atan2(z - p.cz, x - p.cx) - p.a0w; a -= Math.floor(a / TAU) * TAU; if (a >= p.span) continue; }
            }
            for (let L = La; L <= Lb; L++) data[idx(x, L, z)] = p.t;
        }
    }
    const inside = (x, L, z) => x >= x0 && x < x0 + W && z >= z0 && z < z0 + D && L >= L0 && L <= L1;
    const get = (x, L, z) => (inside(x, L, z) ? data[idx(x, L, z)] : (L <= groundAt(site, x, z) ? GROUND : 0));
    return { x0, z0, W, D, L0, L1, H, data, idx, get, inside };
}

/** The local frame of a site: (u, v) → world (x, z), as Castles.Plan. */
export function frame(site) {
    const r = site.rot;
    return {
        wx: (u, v) => site.x + (r === 0 ? u : r === 1 ? -v : r === 2 ? -u : v),
        wz: (u, v) => site.z + (r === 0 ? v : r === 1 ? u : r === 2 ? -v : -u),
        L: (l) => site.F + 1 + l,
    };
}

/** All the checks; returns { problems: [string], stats }. */
export function checkCastle(site, built, g, { wideAll = false } = {}) {
    const problems = [];
    const res_ = {};
    const B = BLOCK;
    const r = site.rot;
    const lc = (x, L, z) => { const dx = x - site.x, dz = z - site.z; const u = r === 0 ? dx : r === 1 ? dz : r === 2 ? -dx : -dz, v = r === 0 ? dz : r === 1 ? -dx : r === 2 ? -dz : dx; return `${u},${L - site.F - 1},${v}`; };
    const { get } = g;
    const solid = (x, L, z) => get(x, L, z) !== 0;
    const floorOk = (x, L, z) => { const t = get(x, L, z); return t !== 0 && t !== B.FENCE; };
    const stand = (x, L, z) => floorOk(x, L - 1, z) && !solid(x, L, z) && !solid(x, L + 1, z) && !solid(x, L + 2, z) && !solid(x, L + 3, z) && !solid(x, L + 4, z);
    const { x0, z0, W, D, L0, L1 } = g;
    // ---- counts, top, bounds, land
    const ids = built.chests.map((c) => c.id).sort().join(',');
    const want = GHOST_CHESTS.map((c) => c.id).sort().join(',');
    if (built.chests.length !== 4 || ids !== want) problems.push(`сундуки: ${ids} (нужно ${want})`);
    if (built.parts.length > 8000) problems.push(`частей ${built.parts.length} > 8000`);
    const topL = Math.min(site.top, site.F + 1 + 78);
    const C = GC.CELL, cx0 = site.gx * C, cz0 = site.gz * C;
    let hiAir = 0, outSq = 0, outCell = 0, over = 0;
    for (const p of built.parts) {
        if (p.k === 3) continue;
        if (p.t === 0 && p.L0 <= site.hi) hiAir++;
        if (p.t !== 0 && p.L1 > topL) over++;
        const r = p.k ? Math.ceil(p.r) : 0;
        const bx0 = p.k ? p.cx - r : p.x0, bx1 = p.k ? p.cx + r : p.x1, bz0 = p.k ? p.cz - r : p.z0, bz1 = p.k ? p.cz + r : p.z1;
        if (p.t !== 0 && (bx0 < site.x - GC.HALF || bx1 > site.x + GC.HALF || bz0 < site.z - GC.HALF || bz1 > site.z + GC.HALF)) outSq++;
        if (bx0 < cx0 || bx1 >= cx0 + C || bz0 < cz0 || bz1 >= cz0 + C) outCell++;
    }
    if (hiAir) problems.push(`воздух ниже hi+1 (режет землю): ${hiAir} частей`);
    if (over) problems.push(`выше потолка (l 78): ${over} частей`);
    if (outSq) problems.push(`за квадратом ±96: ${outSq} частей`);
    if (outCell) problems.push(`за клеткой: ${outCell} частей`);
    // ---- the voxel scan: the top block, the ±96 square on real voxels
    let maxL = -1e9;
    for (let L = L1; L >= L0 && maxL < -1e8; L--) for (let z = z0; z < z0 + D && maxL < -1e8; z++) for (let x = x0; x < x0 + W; x++) { const t = get(x, L, z); if (t && t !== 250) { maxL = L; break; } }
    if (maxL > topL) problems.push(`самый высокий блок на слое ${maxL - site.F - 1} (местный), больше 78`);
    // ---- reach: a hero's flood from the entrance
    const vis = new Uint8Array(g.data.length);
    const e = built.entrance;
    const ex = Math.round(e.x), ez = Math.round(e.z), eL = Math.round(e.y + 1.5);
    const q = [];
    const startL = [eL, eL + 1, eL - 1].find((L) => stand(ex, L, ez));
    if (startL == null) problems.push(`вход (${ex}, ${eL}, ${ez}): нельзя стоять`);
    else { vis[g.idx(ex, startL, ez)] = 1; q.push(ex, startL, ez); }
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
        const z = q.pop(), L = q.pop(), x = q.pop();
        for (const [dx, dz] of N4) {
            const nx = x + dx, nz = z + dz;
            if (nx < x0 || nz < z0 || nx >= x0 + W || nz >= z0 + D) continue;
            for (const dL of [0, 1, -1]) {
                const nL = L + dL;
                if (nL <= L0 || nL + 5 > L1) continue;
                const i = g.idx(nx, nL, nz);
                if (vis[i] || !stand(nx, nL, nz)) continue;
                vis[i] = 1; q.push(nx, nL, nz);
            }
        }
    }
    const reached = (x, L, z) => g.inside(x, L, z) && vis[g.idx(x, L, z)] === 1;
    const reachNear = (x, L, z, r = 0) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (reached(x + dx, L, z + dz)) return true; return false; };
    // ---- wide: cells whose 3 × 3 is standable (within a layer), flooded from the entrance
    // (the centre and its four neighbours: a straight doorway or corridor 2 wide fails it, a curved band of a spiral stair 3.7 m wide passes)
    const wideAt = (x, L, z) => {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!stand(x + dx, L, z + dz) && !stand(x + dx, L - 1, z + dz) && !stand(x + dx, L + 1, z + dz)) return false;
        return true;
    };
    const wv = new Uint8Array(g.data.length);
    if (startL != null) {
        // (the entrance's own wide cell: the stair is 15 wide)
        const sq = [];
        if (wideAt(ex, startL, ez)) { wv[g.idx(ex, startL, ez)] = 1; sq.push(ex, startL, ez); }
        while (sq.length) {
            const z = sq.pop(), L = sq.pop(), x = sq.pop();
            for (const [dx, dz] of N4) {
                const nx = x + dx, nz = z + dz;
                for (const dL of [0, 1, -1]) {
                    const nL = L + dL;
                    if (!g.inside(nx, nL, nz) || nL + 5 > L1) continue;
                    const i = g.idx(nx, nL, nz);
                    if (wv[i] || !vis[i] || !wideAt(nx, nL, nz)) continue;
                    wv[i] = 1; sq.push(nx, nL, nz);
                }
            }
        }
    }
    const wideNear = (x, L, z, r = 1) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) for (const dL of [0]) if (g.inside(x + dx, L + dL, z + dz) && wv[g.idx(x + dx, L + dL, z + dz)]) return true; return false; };
    // ---- things: chests, spots, props, doors
    const bad = { chestReach: [], chestWide: [], chestBox: [], spotReach: [], spotAir: [], propAir: [], propReach: [], doorReach: [], doorWide: [], spotWide: [] };
    for (const c of built.chests) {
        const x = Math.round(c.x), z = Math.round(c.z), L = Math.round(c.y + 1.5);
        // its footprint (3.75 × 2.55 m): 5 × 3 cells, 3 layers of air, a floor
        const fx = Math.round(Math.sin(c.a)), fz = Math.round(Math.cos(c.a));
        let ok = true;
        for (let a = -2; a <= 2; a++) for (let d = -1; d <= 1; d++) {
            const cx = x + (fx ? d * fx : a), cz = z + (fz ? d * fz : a);
            if (!floorOk(cx, L - 1, cz)) ok = false;
            for (let k = 0; k < 3; k++) if (solid(cx, L + k, cz)) ok = false;
        }
        if (!ok) bad.chestBox.push(c.id);
        const fxp = x + 2 * fx, fzp = z + 2 * fz; // (where the hero stands to open it)
        if (!reachNear(fxp, L, fzp, 1)) bad.chestReach.push(c.id);
        if (!wideNear(fxp, L, fzp, 1)) bad.chestWide.push(c.id);
    }
    for (const s of built.spots) {
        const x = Math.round(s.x), z = Math.round(s.z), L = Math.round(s.y + 1.5);
        let air = floorOk(x, L - 1, z);
        for (let k = 0; k < 6; k++) if (solid(x, L + k, z)) air = false;
        if (!air) bad.spotAir.push(`${s.room}@${lc(x, L, z)}`);
        else if (!reached(x, L, z)) bad.spotReach.push(`${s.room}@${lc(x, L, z)}`);
        else if (!wideNear(x, L, z, 1)) bad.spotWide.push(`${s.room}@${lc(x, L, z)}`);
    }
    for (const pr of built.props) {
        const x = Math.round(pr.x), z = Math.round(pr.z), Ls = Math.round(pr.y + 0.5);
        if (!solid(x, Ls, z) || solid(x, Ls + 1, z)) bad.propAir.push(`${pr.kind}@${lc(x, Ls, z)}`);
        else if (![Ls + 1, Ls, Ls - 1, Ls - 2, Ls + 2].some((L) => reachNear(x, L, z, 2))) bad.propReach.push(`${pr.kind}@${lc(x, Ls, z)}`);
    }
    for (const d of built.doors || []) {
        const x = Math.round(d.x), z = Math.round(d.z), L = Math.round(d.y + 1.5);
        if (!reachNear(x, L, z, 1)) bad.doorReach.push(`${d.room}@${lc(x, L, z)}`);
        else if (!wideNear(x, L, z, 2)) bad.doorWide.push(`${d.room}@${lc(x, L, z)}`);
    }
    const say = (k, what) => { if (bad[k].length) problems.push(`${what} (${bad[k].length}): ${bad[k].slice(0, 12).join('  ')}`); };
    say('chestBox', 'сундук не помещается (камень/нет пола)');
    say('chestReach', 'до сундука не дойти');
    say('chestWide', 'к сундуку нет пути шириной 3');
    say('spotAir', 'место призрака в камне/без пола/ниже 6 слоёв');
    say('spotReach', 'до места призрака не дойти');
    say('propAir', 'вещь в блоке или без опоры');
    say('propReach', 'до вещи не дойти');
    say('doorReach', 'до двери не дойти');
    say('doorWide', 'дверь/проход уже 3');
    if (wideAll) say('spotWide', 'место призрака без пути шириной 3');
    // ---- hang: every block joined to the ground through blocks (6 sides)
    const seen = new Uint8Array(g.data.length);
    const st = [];
    for (let z = z0; z < z0 + D; z++) for (let x = x0; x < x0 + W; x++) { const i = g.idx(x, L0, z); if (g.data[i]) { seen[i] = 1; st.push(i); } }
    const WD = W * D;
    while (st.length) {
        const i = st.pop();
        const x = i % W, rest = (i - x) / W, z = rest % D, l = (rest - z) / D;
        const nb = [];
        if (x > 0) nb.push(i - 1); if (x < W - 1) nb.push(i + 1);
        if (z > 0) nb.push(i - W); if (z < D - 1) nb.push(i + W);
        if (l > 0) nb.push(i - WD); if (l < g.H - 1) nb.push(i + WD);
        for (const j of nb) if (g.data[j] && !seen[j]) { seen[j] = 1; st.push(j); }
    }
    const floating = new Map();
    let nFloat = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i] && !seen[i]) {
        nFloat++;
        const t = g.data[i];
        if (!floating.has(t)) { const x = i % W, rest = (i - x) / W, z = rest % D, l = (rest - z) / D; floating.set(t, { n: 0, at: lc(x + x0, l + L0, z + z0) }); }
        floating.get(t).n++;
    }
    if (nFloat) problems.push(`висит в воздухе ${nFloat} блоков: ` + [...floating].map(([t, f]) => `${Object.keys(B).find((k) => B[k] === t) || t}×${f.n} (${f.at})`).join(', '));
    // ---- traps: a place a hero may land on (flying, «Левиоса») from which he can neither walk nor drop back to the reached castle
    const back = new Uint8Array(g.data.length);
    const bq = [];
    for (let i = 0; i < vis.length; i++) if (vis[i]) { back[i] = 1; bq.push(i); }
    const WD0 = W * D;
    while (bq.length) {
        const i = bq.pop();
        const x = i % W, rest = (i - x) / W, z = rest % D, l = (rest - z) / D;
        for (const [dx, dz] of N4) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            // a cell beside it from which the hero steps up one layer onto it, or walks off and drops (any height) onto it:
            // the drop needs this column (x, z) free from his feet here (l) up to the head of the one who walks off (nl + 4)
            for (let nl = l - 1; nl < g.H - 5; nl++) {
                if (nl + 4 >= l + 5 && g.data[(nl + 4) * WD0 + z * W + x]) break;
                const j = nl * WD0 + nz * W + nx;
                if (!back[j] && stand(nx + x0, nl + L0, nz + z0)) { back[j] = 1; bq.push(j); }
            }
        }
    }
    // where he can get to: walking and dropping down from the reached castle, or landing from the open sky
    const into = new Uint8Array(g.data.length);
    const fq = [];
    for (let i = 0; i < vis.length; i++) if (vis[i]) { into[i] = 1; fq.push(i); }
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        let l = g.H - 1;
        while (l > 0 && !g.data[l * WD0 + z * W + x]) l--;
        const i = (l + 1) * WD0 + z * W + x;
        if (l + 6 < g.H && !into[i] && stand(x + x0, l + 1 + L0, z + z0)) { into[i] = 1; fq.push(i); } // (the highest floor of a column: open to the sky)
    }
    while (fq.length) {
        const i = fq.pop();
        const x = i % W, rest = (i - x) / W, z = rest % D, l = (rest - z) / D;
        for (const [dx, dz] of N4) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D || l + 6 >= g.H) continue;
            const up = (l + 1) * WD0 + nz * W + nx;
            if (!into[up] && stand(nx + x0, l + 1 + L0, nz + z0)) { into[up] = 1; fq.push(up); }
            let free = true;
            for (let k = 0; k < 5; k++) if (g.data[(l + k) * WD0 + nz * W + nx]) { free = false; break; }
            if (!free) continue;
            let m = l - 1;
            while (m > 0 && !g.data[m * WD0 + nz * W + nx]) m--;
            const j = (m + 1) * WD0 + nz * W + nx;
            if (!into[j] && stand(nx + x0, m + 1 + L0, nz + z0)) { into[j] = 1; fq.push(j); }
        }
    }
    const traps = [];
    for (let i = 0; i < into.length; i++) {
        if (!into[i] || back[i]) continue;
        const x = i % W, rest = (i - x) / W, z = rest % D, l = (rest - z) / D;
        if (Math.abs(x + x0 - site.x) > GC.HALF || Math.abs(z + z0 - site.z) > GC.HALF) continue;
        traps.push(lc(x + x0, l + L0, z + z0));
    }
    if (traps.length) problems.push(`ловушки — встав туда, не выйти (${traps.length}): ${traps.slice(0, 10).join('  ')}`);
    let nReach = 0; for (let i = 0; i < vis.length; i++) nReach += vis[i];
    res_.vis = vis; res_.wv = wv; res_.stand = stand;
    return { ...res_, problems, stats: { parts: built.parts.length, chests: built.chests.length, props: built.props.length, rooms: built.rooms.length, spots: built.spots.length, doors: (built.doors || []).length, reach: nReach, maxL: maxL - site.F - 1, spotWide: bad.spotWide.length } };
}
