// The blocks of the Castle of Ghosts (GhostBuild.js) on real voxels, for synthetic sites made by hand (tests/unit/ghost-castle-probe.mjs):
// a hero walks from the entrance to every chest, room spot, prop and doorway (doorways and chests by ways 3 wide), nothing is above l 78,
// outside the ±96 square or the cell, no air is carved into the land, nothing hangs in the air, no place traps a hero, 4 chests, ≤ 8000 parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGhostCastle } from '../../src/world/GhostBuild.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { GHOST_CHESTS, GHOST_CASTLE as GC } from '../../src/game/GhostRules.js';
import { makeSite, voxelize, checkCastle, frame } from './ghost-castle-probe.mjs';

const C = GC.CELL;
// (different rotations, flat and spread ground, the highest ground allowed)
const SITES = [
    { seed: 1, rot: 0, lo: 4, hi: 11 },
    { seed: 7, rot: 1, lo: 11, hi: 23 },
    { seed: 99, rot: 2, lo: 2, hi: 2 },
    { seed: 12, rot: 3, lo: 7, hi: 19 },
].map((o) => makeSite({ ...o, x: 2 * C + 400 + o.seed, z: 3 * C + 600 + o.seed, gx: 2, gz: 3 }));

for (const site of SITES) {
    test(`castle of ghosts on voxels: seed ${site.seed}, rot ${site.rot}, ground ${site.lo}…${site.hi}`, () => {
        const t0 = performance.now();
        const built = buildGhostCastle(site);
        const ms = performance.now() - t0;
        assert.ok(ms < 1500, `built in ${ms.toFixed(0)} ms`); // (≈ 70–90 ms on the bench machine; a slow CI keeps a margin)
        const res = checkCastle(site, built, voxelize(site, built));
        assert.deepEqual(res.problems, [], res.problems.join('\n'));
        assert.ok(built.parts.length <= 8000, `parts ${built.parts.length}`);
        assert.ok(res.stats.maxL <= 78, `top ${res.stats.maxL}`);
    });
}

test('castle of ghosts: the contract (chests, props, rooms, spots, entrance)', () => {
    const site = SITES[0];
    const b = buildGhostCastle(site);
    // four chests, one of each id, in four different parts of the castle, each in its own room
    assert.deepEqual(b.chests.map((c) => c.id).sort(), GHOST_CHESTS.map((c) => c.id).sort());
    for (const c of b.chests) {
        const g = GHOST_CHESTS.find((q) => q.id === c.id);
        assert.equal(c.look, g.look); assert.equal(c.flavor, 'ghost'); assert.equal(c.part, g.where);
        for (const k of ['x', 'y', 'z', 'a']) assert.ok(Number.isFinite(c[k]), c.id + ' ' + k);
    }
    const ys = Object.fromEntries(b.chests.map((c) => [c.id, c.y]));
    assert.ok(ys.tower > site.F + 40, 'the tower chest is high up'); // (the top of the great tower)
    assert.ok(ys.crypt < site.F && ys.cellar < site.F, 'the crypt and the cellar are inside the terrace');
    assert.ok(ys.crypt > site.hi && ys.cellar > site.hi, '…but above the ground');
    assert.ok(Math.abs(ys.throne - (site.F - 0.5)) < 1e-9, 'the throne chest on the ground floor (the top face of the terrace layer F)');
    // props: the kinds the ghosts move; spots and rooms: enough of them, names for the player in Russian
    assert.ok(b.props.length >= 60 && b.props.length <= 160, `props ${b.props.length}`);
    for (const p of b.props) assert.ok(['chair', 'stool', 'candle', 'candelabra', 'urn'].includes(p.kind), p.kind);
    assert.ok(b.spots.length >= 80 && b.spots.length <= 220, `spots ${b.spots.length}`);
    const kinds = new Set(b.rooms.map((r) => r.kind));
    for (const k of ['throne', 'hall', 'gallery', 'mirror', 'library', 'chapel', 'bedroom', 'kitchen', 'dining', 'armoury', 'crypt', 'cell', 'tower', 'ballroom', 'study', 'courtyard', 'gate']) assert.ok(kinds.has(k), 'a room of kind ' + k);
    for (const r of b.rooms) { assert.match(r.name, /[А-Яа-яЁё]/, r.id); assert.ok(r.x0 < r.x1 && r.z0 < r.z1 && r.y0 < r.y1, r.id); }
    // the entrance: outside, in front of the gate (local −v), on the grand stair above the highest ground
    const f = frame(site);
    const ev = site.rot === 0 ? b.entrance.z - site.z : null;
    assert.ok(ev < -72 && ev > -96, 'the entrance on the front stair');
    assert.ok(Math.abs(b.entrance.y - (site.hi - 0.5)) < 1e-9, 'standing on the step level with the highest ground');
    void f;
});

test('castle of ghosts: the same site gives the same castle (no Math.random, no order effects)', () => {
    const a = JSON.stringify(buildGhostCastle(SITES[1]));
    const b = JSON.stringify(buildGhostCastle(SITES[1]));
    assert.equal(a, b);
    for (const file of ['GhostBuild.js', 'GhostKit.js', 'GhostRooms.js']) {
        const src = fs.readFileSync(new URL('../../src/world/' + file, import.meta.url), 'utf8');
        assert.ok(!/Math\.random/.test(src), file + ' uses Math.random');
    }
});

test('castle of ghosts: black enchanted stone outside, ordinary blocks only for furniture', () => {
    const b = buildGhostCastle(SITES[0]);
    const ghost = new Set([BLOCK.GHOST_STONE, BLOCK.GHOST_BRICK, BLOCK.GHOST_TILE, BLOCK.GHOST_ROOF, BLOCK.GHOST_LAMP]);
    let g = 0, other = 0;
    for (const p of b.parts) { if (p.k === 3 || !p.t) continue; if (ghost.has(p.t)) g++; else other++; }
    assert.ok(g > 1.5 * other, `ghost-stone parts ${g}, others ${other}`);
    // the terrace and the curtain: GHOST_STONE
    assert.equal(b.parts[0].t, BLOCK.GHOST_STONE);
});
