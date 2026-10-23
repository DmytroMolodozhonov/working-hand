// Слежка внутри замка (CastleWatch.js) и нерв короля (KingNerve.js): кто следит, кто наблюдатель, когда король прячется, бежит, дерётся.
// Числа — на настоящих замках мира (блок 1 м, герой ~3,5 м).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { WATCH, inGuardedLand, needsWatch, canWatch, pickWatcher, nextPhase, standDist, maySay } from '../../src/game/CastleWatch.js';
import { NERVE, killLimit, guardRadius, guardsKilled, kingFights } from '../../src/game/KingNerve.js';

const d = new TerrainData(); d.generate({ seed: 20261015, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true });
const castles = []; for (let gz = -2; gz <= 2; gz++) for (let gx = -2; gx <= 2; gx++) { const c = d.castles.cellOf(gx, gz); if (c && c.walls && c.kind !== 'hamlet') castles.push(c); }

test('real castles: the throne, the gate yard and the keep are guarded land; the village outside is not', () => {
    assert.ok(castles.length >= 2);
    for (const c of castles) {
        assert.ok(inGuardedLand(c.walls, c.throne), c.name + ' throne');
        assert.ok(inGuardedLand(c.walls, c.gateIn), c.name + ' gate yard');
        assert.ok(!inGuardedLand(c.walls, { x: c.walls.x1 + 8, z: c.z }), c.name + ' outside');
        assert.ok(!inGuardedLand(c.walls, { x: c.x, z: c.walls.z0 - 8 }), c.name + ' outside z');
    }
});

test('real castles: distances fit the walls (stand 9.5 m, near 5 m, watcher is not tighter than the hero\'s width)', () => {
    for (const c of castles) {
        const w = Math.min(c.walls.x1 - c.walls.x0, c.walls.z1 - c.walls.z0);
        assert.ok(w > WATCH.STAND * 3, c.name + ' walls ' + w);
    }
    assert.ok(WATCH.NEAR > 3.5 * 1.2, 'never shoulder to shoulder with a 3.5 m hero');
    assert.ok(WATCH.STAND > WATCH.NEAR && WATCH.FAR > WATCH.STAND);
});

test('who is watched: a stranger inside the walls; not the owner, not the one the castle fights already, not outside', () => {
    assert.ok(needsWatch({ inside: true, isOwner: false, kingDead: false, hostile: false }));
    assert.ok(!needsWatch({ inside: true, isOwner: true, kingDead: true, hostile: false }));
    assert.ok(!needsWatch({ inside: true, isOwner: false, kingDead: false, hostile: true }));
    assert.ok(!needsWatch({ inside: false, isOwner: false, kingDead: false, hostile: false }));
});

test('who watches: a free yard/patrol knight, never the main guard (throne, gate), never a busy or sleeping one', () => {
    const k = (o = {}) => ({ role: 'knight', job: 'yard', ...o });
    assert.ok(canWatch(k())); assert.ok(canWatch(k({ job: 'patrol' })));
    for (const bad of [{ job: 'guard' }, { job: 'king' }, { role: 'king' }, { role: 'farmer' }, { dead: true }, { foe: 'p' }, { sleep: {} }, { gOwner: 'p' }, { tac: {} }, { order: {} }, { stunT: 1 }, { fleeT: 2 }, { removable: true }]) assert.ok(!canWatch(k(bad)), JSON.stringify(bad));
    assert.equal(pickWatcher([{ v: 'far', d: 40 }, { v: 'near', d: 12 }]), 'near');
    assert.equal(pickWatcher([{ v: 'x', d: WATCH.PICK_R + 1 }]), null);
    assert.equal(pickWatcher([]), null);
});

test('rhythm: stand off, now and then come close, back again; a line is rare', () => {
    assert.equal(standDist('stand'), WATCH.STAND); assert.equal(standDist('close'), WATCH.NEAR);
    let ph = 'stand';
    for (let i = 0; i < 6; i++) { const [n, t] = nextPhase(ph, 0.5); assert.notEqual(n, ph); assert.ok(t > 0); ph = n; }
    assert.ok(!maySay(10, 4)); assert.ok(!maySay(500, 20)); assert.ok(maySay(500, 4));
});

test('the king: the limit of dead knights follows the castle; guards-near radius follows its size', () => {
    assert.equal(killLimit(0), NERVE.KILLS_MIN); assert.equal(killLimit(100), NERVE.KILLS_MAX);
    for (const c of castles) {
        const lim = killLimit(c.knights);
        assert.ok(lim >= NERVE.KILLS_MIN && lim <= NERVE.KILLS_MAX, `${c.name} ${c.knights} → ${lim}`);
        const R = guardRadius(c.walls);
        assert.ok(R >= NERVE.R_MIN && R <= NERVE.R_MAX);
        assert.ok(NERVE.CORNER_IN < R, 'cornered distance inside the guard radius');
    }
    assert.equal(guardsKilled(new Set([1, 2, 5, 9, -1, 0]), 6), 3);
});

test('the king: hides by default; fights after many dead guards, or cornered with no guard near; not twitching at the edge', () => {
    const base = { killed: 0, knights: 10, guardNear: 5, heroDist: 4, fighting: false };
    assert.deepEqual(kingFights(base), { fight: false, why: 'no' }); // (hero on him, but the guard is here: hides)
    assert.equal(kingFights({ ...base, guardNear: 0, heroDist: 30 }).fight, false); // (no guard, but the hero is far: runs)
    assert.deepEqual(kingFights({ ...base, guardNear: 0, heroDist: 5 }), { fight: true, why: 'cornered' });
    assert.equal(kingFights({ ...base, guardNear: 0, heroDist: 9 }).fight, false);
    assert.equal(kingFights({ ...base, guardNear: 0, heroDist: 9, fighting: true }).fight, true); // (already fighting: not dropped at 9 m)
    assert.equal(kingFights({ ...base, guardNear: 0, heroDist: 13, fighting: true }).fight, false);
    assert.equal(kingFights({ ...base, guardNear: 2, heroDist: 5, fighting: true }).fight, false); // (the guard came back)
    assert.deepEqual(kingFights({ ...base, killed: killLimit(10), heroDist: 40 }), { fight: true, why: 'kills' });
    assert.equal(kingFights({ ...base, killed: killLimit(10) - 1 }).fight, false);
    assert.equal(kingFights({ ...base, killed: 9, heroDist: Infinity }).fight, false); // (nobody to fight)
});
