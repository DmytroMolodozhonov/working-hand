// «Firefighting» / «Firefighting Maxima»: the words, the cone, and what the water puts out
// (campfires, «Инферно», «Fire Maxima», the Hellfire — a burst only knocks it back, the hose drowns it).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { Firefighting, inCone, FIREFIGHT } from '../../src/game/Firefighting.js';
import { Hellfire, HELLFIRE } from '../../src/game/Hellfire.js';
import { SPELL_COST } from '../../src/game/Combat.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('the words: every way the recognizer writes it; never «Fire», «Fire Maxima», Hellfire, «Инферно» or talk', () => {
    for (const t of ['Firefighting', 'файрфайтинг', 'фаерфайтинг', 'файр файтинг', 'фаер файтинг', 'файрфайтин', 'firefighting', 'fire fighting', 'файер файтинг'])
        assert.equal(matchSpell(t), 'Firefighting', t);
    for (const t of ['Firefighting Maxima', 'файрфайтинг максима', 'фаер файтинг макс']) assert.equal(matchSpell(t), 'FirefightingMaxima', t);
    assert.equal(matchSpell('Fire'), 'Fire');
    assert.equal(matchSpell('файр максима'), 'FireMaxima');
    assert.equal(matchSpell('лет зе хеллфаер кам'), 'Hellfire');
    assert.equal(matchSpell('Инферно'), 'Inferno');
    for (const t of ['я люблю файтинги', 'файтинг', 'пожарные приехали']) assert.equal(matchSpell(t), null, t);
    assert.equal(SPELL_COST.Firefighting, 5);
    assert.equal(SPELL_COST.FirefightingMaxima, 20);
});

test('the cone: ahead and inside — yes; behind, aside or too far — no', () => {
    const o = V(0, 1, 0), d = V(0, 0, -1);
    assert.ok(inCone(o, d, 15, FIREFIGHT.HALF, V(0, 1, -10)));
    assert.ok(inCone(o, d, 15, FIREFIGHT.HALF, V(2.5, 1, -10)));
    assert.ok(!inCone(o, d, 15, FIREFIGHT.HALF, V(8, 1, -10)));
    assert.ok(!inCone(o, d, 15, FIREFIGHT.HALF, V(0, 1, 5)));
    assert.ok(!inCone(o, d, 15, FIREFIGHT.HALF, V(0, 1, -20)));
    assert.ok(inCone(o, d, 25, FIREFIGHT.MAX_HALF, V(0, 1, -20)));
});

/** A small world: a campfire, an «Инферно» held by another wizard, a «Fire Maxima» in flight. */
function world() {
    const out = [];
    const cf = { id: 'c1', x: 0, y: 0, z: -8 };
    const game = {
        authority: true, localId: 'me',
        character: { group: { position: V(0, 0, 0) } },
        campfires: { list: new Map([['c1', cf]]), _out(f) { out.push(f.id); this.list.delete(f.id); } },
        fire: { douse: () => 0 },
        spells: { spells: [{ kind: 'Inferno', by: 'w2', life: 3, flame: { o: V(6, 1, -10), d: V(-1, 0, 0), len: 10 } }] },
        vortex: { effects: [{ kind: 'fire', by: 'w3', o: V(0, 1, -20), p: V(0, 1, -5), t: 0.1, travel: 0.35, bloomed: false }] },
        livingTrees: { list: [] },
        hud: { setVoice() {} },
    };
    return { game, out };
}

test('a plain burst puts out a campfire, an «Инферно» stream and a «Fire Maxima» in flight — at once, once', () => {
    const { game, out } = world();
    const ff = new Firefighting(game);
    const sp = { o: V(0, 1, 0), d: V(0, 0, -1), max: false, t: 0, by: 'me' };
    sp.t = 0.05; assert.equal(ff.act(sp, 0.05), false, 'the water is still flying');
    sp.t = 0.2;
    assert.equal(ff.act(sp, 0.05), true);
    assert.deepEqual(out, ['c1']);
    assert.equal(game.spells.spells[0].life, 0, 'the flame went out');
    assert.equal(game.vortex.effects.length, 0, 'the fire spiral went out');
    sp.t = 0.3;
    assert.equal(ff.act(sp, 0.05), false, 'a burst acts once');
});

function hellGame() {
    const game = { localId: 'me', character: { group: { position: V(0, 0, 0) } }, hud: { setVoice() {} }, collision: { groundY: () => 0 } };
    const H = new Hellfire(game);
    H.state = { c: V(0, 2, -10), R: 4, k: 0, ang: 0, rr: 5, rw: HELLFIRE.RING_W, rh: HELLFIRE.RING_H, t: 3, worked: true };
    game.hellfire = H;
    return { game, H };
}

test('the Hellfire: a burst only knocks it back; «Firefighting Maxima» held on it drowns it', () => {
    const { H } = hellGame();
    const hit = (c, r) => inCone(V(0, 2, 0), V(0, 0, -1), 15, FIREFIGHT.HALF, c, r);
    assert.ok(H.douse(hit, 0));
    assert.ok(Math.abs(H.state.R - (4 - HELLFIRE.DOUSE_KNOCK)) < 1e-9, 'smaller');
    assert.ok(H.state.dousedT > 0, 'it can not grow back yet');
    assert.ok(H.state, 'one burst does not put it out');
    let t = 0;
    while (H.state && t < 5) { H.douse(hit, 0.1); t += 0.1; }
    assert.equal(H.state, null, 'the hose drowned it');
    assert.ok(t < 5, 'within the 5 s of the hose');
    assert.ok(H.log.some((e) => e.ev === 'out' && e.why === 'water'));
});

test('the Hellfire\'s fires left on the ground: a burst puts out the small ones (the ring\'s parts), a big one only shrinks', () => {
    const { H } = hellGame();
    H.state = null;
    H.left.push({ by: 'w', c: V(0, 1, -8), R0: 1.4, R: 1.4, k: 0, t: 0 }, { by: 'w', c: V(0, 2, -12), R0: 5, R: 5, k: 0, t: 0 });
    const hit = (c, r) => inCone(V(0, 2, 0), V(0, 0, -1), 15, FIREFIGHT.HALF, c, r);
    assert.ok(H.douse(hit, 0));
    assert.equal(H.left.length, 1);
    assert.ok(Math.abs(H.left[0].R0 - (5 - HELLFIRE.LEFT_KNOCK)) < 1e-9);
});
