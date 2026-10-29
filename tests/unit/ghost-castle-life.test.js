// The Castle of Ghosts in the game (GhostCastleLife.js): who has it in the land, the hero set down outside when it comes up under him, the seers who walk in
// vanish for the ones who do not see it, chests put away with it, the achievement, the haze.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostCastleLife, GHOST_ACH } from '../../src/game/GhostCastleLife.js';
import { GHOST_CASTLE as GC } from '../../src/game/GhostRules.js';
import { GhostCastleIndex } from '../../src/world/GhostCastle.js';

const SITE = { id: 'gc0_0', gx: 0, gz: 0, seed: 1, name: 'Замок призраков', x: 500, z: 500, rot: 0, F: 34, lo: 10, hi: 20, cx: 500, cz: 500, zone: GC.HALF, x0: 500 - GC.HALF, x1: 500 + GC.HALF, z0: 500 - GC.HALF, z1: 500 + GC.HALF, top: 115 };

function fake({ sees = true, pos = [0, 40, 0] } = {}) {
    const idx = new GhostCastleIndex(1, () => 5, () => false);
    idx.adopt([{ gx: 0, gz: 0, f: SITE }]);
    const site = idx.cellOf(0, 0);
    const calls = [];
    const data = {
        ghost: idx,
        heightAt: () => 12,
        landMade: () => true,
        setGhostSeen(on) { if (idx.on === !!on) return false; idx.on = !!on; return true; },
        ghostApply(s) { s.shown = idx.on; return []; },
        ghostNear: (x, z, r) => (idx.on ? idx.near(x, z, r).filter((s) => s.shown) : []),
    };
    const view = { data, _workers: null, ghostSync(on, x, z) { calls.push(['sync', on]); data.setGhostSeen(on); for (const s of idx.list()) if (s.shown !== idx.on) data.ghostApply(s); }, ghostAsk() {} };
    const hazes = [], gained = [], disposed = [];
    const chests = [{ cave: 'gc0_0', id: 'gc0_0:1', isOpen: true, boxId: 7, dispose() { disposed.push('c1'); } }, { cave: 'dg1_1', id: 'dg1_1', boxId: 8, dispose() { disposed.push('dg'); } }];
    const g = {
        config: { mode: 'freeworld' }, space: {}, combat: {}, isDeadLocal: false, sight: { sees }, localId: 'me',
        character: { group: { position: { x: pos[0], y: pos[1], z: pos[2], set(x, y, z) { this.x = x; this.y = y; this.z = z; } } } },
        world: { terrain: view, setGhostHaze: (k) => hazes.push(k) },
        collision: { groundY: () => 12, removeBox() {} }, chests, _caveChests: new Set(['gc0_0', 'dg1_1']),
        remotes: new Map(), achievements: { done: new Set(), gain(k) { gained.push(k); this.done.add(k); return true; } },
    };
    return { g, site, idx, calls, hazes, gained, disposed, chests, life: new GhostCastleLife(g) };
}
const tick = (life, n = 1) => { for (let i = 0; i < n; i++) life.update(0.5); };

test('a hero who does not see the invisible has no castle: nothing is asked of the land, no haze', () => {
    const f = fake({ sees: false });
    tick(f.life, 3);
    assert.equal(f.idx.on, false);
    assert.equal(f.life.sees, false);
    assert.ok(f.calls.every(([, on]) => on === false));
    assert.equal(f.life.site, null);
});

test('with the sight the castle comes into this computer\'s land; the haze comes with it', () => {
    const f = fake({ sees: true, pos: [500, 60, 400] });
    tick(f.life, 6);
    assert.equal(f.idx.on, true);
    assert.equal(f.life.sees, true);
    assert.equal(f.life.site?.id, 'gc0_0');
    assert.ok(f.hazes.length && f.hazes[f.hazes.length - 1] > 0.5, 'a cold mist near it');
});

test('the castle comes up UNDER the hero: he is set down outside the walls first (never in the stone)', () => {
    const f = fake({ sees: true, pos: [510, 60, 520] }); // (inside the footprint)
    tick(f.life, 1);
    const p = f.g.character.group.position;
    assert.ok(Math.abs(p.x - 500) > GC.HALF || Math.abs(p.z - 500) > GC.HALF, 'outside the footprint now');
    assert.ok(f.idx.on, 'and the castle is in the land');
});

test('the sight is lost (death): the castle goes out, its chests are put away, the haze is gone — other chests stay', () => {
    const f = fake({ sees: true, pos: [500, 60, 400] });
    tick(f.life, 6);
    f.g.sight.sees = false;
    tick(f.life, 2);
    assert.equal(f.idx.on, false);
    assert.deepEqual(f.disposed, ['c1'], 'only the ghosts\' chest');
    assert.equal(f.g.chests.length, 1);
    assert.ok(f.g._openedChests.has('gc0_0:1'), 'an opened chest is remembered by id');
    assert.equal(f.hazes[f.hazes.length - 1], 0);
    assert.equal(f.life.site, null);
});

test('a dead hero, a hero off the Earth, a map or a test ground never have the castle', () => {
    for (const mut of [(g) => { g.isDeadLocal = true; }, (g) => { g.space = { offEarth: true }; }, (g) => { g.config.map = 'x'; }, (g) => { g.config.mode = 'test'; }]) {
        const f = fake({ sees: true, pos: [500, 60, 400] });
        mut(f.g);
        tick(f.life, 4);
        assert.equal(f.idx.on, false);
    }
});

test('a seer who walks into a castle that this computer does not see is not drawn here; he comes back when he leaves', () => {
    const f = fake({ sees: false, pos: [0, 40, 0] });
    const grp = { visible: true };
    const r = { sees: true, dead: false, position: { x: 520, y: 40, z: 500 }, character: { group: grp } };
    f.g.remotes.set('friend', r);
    tick(f.life, 2);
    assert.equal(grp.visible, false, 'vanished inside the castle');
    r.position = { x: 900, y: 12, z: 900 };
    tick(f.life, 2);
    assert.equal(grp.visible, true, 'seen again outside');
    // a friend without the sight inside it is just walking on empty land: drawn as always
    const grp2 = { visible: true };
    f.g.remotes.set('plain', { sees: false, dead: false, position: { x: 520, y: 40, z: 500 }, character: { group: grp2 } });
    tick(f.life, 2);
    assert.equal(grp2.visible, true);
    // and one who sees it too (this computer has the castle): seen
    const f2 = fake({ sees: true, pos: [500, 60, 400] });
    const grp3 = { visible: true };
    f2.g.remotes.set('seer', { sees: true, dead: false, position: { x: 520, y: 40, z: 500 }, character: { group: grp3 } });
    tick(f2.life, 6);
    assert.equal(grp3.visible, true);
});

test('the achievement comes once the hero stands inside the walls — not before, outside', () => {
    const f = fake({ sees: true, pos: [500, 60, 380] }); // (outside the walls, in the footprint's stair part)
    tick(f.life, 6);
    assert.deepEqual(f.gained, []);
    f.g.character.group.position.set(500, 60, 480);
    tick(f.life, 2);
    assert.deepEqual(f.gained, [GHOST_ACH]);
});
