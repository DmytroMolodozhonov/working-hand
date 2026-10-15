// Captain Black Moustache and his black ship (Blackbeard.js): one ship in the world on the open sea, the curse
// (no spell burns or holes it), 40 % faster than any ship, the captain's 100 HP and his parry of duel charges,
// the skeletons destroyed only as a living tree is (and by what breaks bones), the grapnels holding a ship alongside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ships, isCursed } from '../../src/game/Ships.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';
import { stepShip, newShipState } from '../../src/game/ShipPhysics.js';
import { SAILOR_STATS, PARRY, pirateBoneDamage } from '../../src/game/Sailors.js';
import { Blackbeard, BB, pirateSea, gunPitch } from '../../src/game/Blackbeard.js';
import { SeaIndex } from '../../src/world/Sea.js';
import { rollPirateLoot } from '../../src/game/ItemTypes.js';

function world() {
    const game = {
        config: { mode: 'creative' }, authority: true, scene: { add() {}, remove() {} }, localId: 'me', remotes: new Map(), isNight: false,
        character: { group: { position: { x: 9999, y: 0, z: 9999 }, rotation: { y: 0 } } }, hud: { setVoice() {} }, collision: { addMover() {}, removeMover() {} }, chests: [],
    };
    const S = new Ships(game);
    game.ships = S;
    game.blackbeard = new Blackbeard(game);
    const B = S.spawn('blackship', 0, 0, 0, { id: BB.ID, wake: false });
    game.blackbeard.ship = B;
    return { game, S, B, bb: game.blackbeard };
}

test('one black ship in a world: the same sea and start for the same seed, a patrol far from every shore', () => {
    for (const seed of [1, 7, 12345]) {
        const seas = new SeaIndex(seed);
        const a = pirateSea(seas, { x: 0, z: 0 }), b = pirateSea(new SeaIndex(seed), { x: 0, z: 0 });
        assert.deepEqual(a, b);
        if (!a) continue;
        for (let i = 0; i < 24; i++) {
            const t = (i / 24) * Math.PI * 2;
            assert.ok(seas.signedDist(a.cx + Math.cos(t) * a.R, a.cz + Math.sin(t) * a.R) > BB.KEEP_OFF, `seed ${seed}: the patrol keeps off the shore`);
        }
    }
    const { S } = world();
    S.spawn('blackship', 5, 5, 0, { id: BB.ID }); // (asked again: the same one)
    assert.equal([...S.list.values()].filter((s) => s.cls.id === 'blackship').length, 1);
});

test('the black ship: no spell burns it, holes it, tears its sails or breaks its masts — but «Инспириус»; until it is taken', () => {
    const { S, B } = world();
    S.wake(B);
    assert.ok(isCursed(B));
    S.blast({ x: B.st.x + 11, y: 2, z: 0 }, 4, 2, 'me'); // («Бомбардо Максима» at its side)
    S.hole(B, 5, 1, 0, 2, 'me');
    S.ignite(B, 0, B.layout.deck, 0, null, 'me');
    S.ignite(B, 0, 0, 0, B.sails[0].id, 'me');
    S.lightningAt({ x: 0, y: 40, z: B.layout.masts[0].z }, 'me');
    S.cannonHit(B, { x: 11, y: 2, z: 0 }, { x: -1, y: 0, z: 0 }, 'me');
    assert.equal(B.hp, SHIP_CLASSES.blackship.hp, 'no harm');
    assert.equal(B.holes.length, 0, 'no holes');
    assert.equal(B.fires.length, 0, 'the fire went out');
    assert.equal(B.broken.size, 0, 'the masts stand');
    assert.ok(B.sails.every((sl) => sl.burnt === 0), 'the sails whole');
    // «Инспириус» — the one spell its curse can't hold: the hull torn open, harm (but no fire on it)
    S.inspiriusHarm({ x: B.st.x + B.layout.B / 2 + 1, y: 2, z: 0 }, 'me');
    assert.ok(B.holes.length > 0, 'Inspirius: holes');
    assert.ok(B.hp < SHIP_CLASSES.blackship.hp, 'Inspirius: harm');
    assert.equal(B.fires.length, 0, 'no fire on it even so');
    assert.ok(isCursed(B), 'still cursed: Bombardo after it does nothing');
    const n = B.holes.length;
    S.hole(B, 5, 1, 0, 2, 'me');
    assert.equal(B.holes.length, n);
    // taken: an ordinary ship
    B.owner = 'me';
    assert.ok(!isCursed(B));
    S.hole(B, 5, 1, 0, 2, 'me');
    assert.equal(B.holes.length, n + 1);
});

test('the black ship is 40 % faster than any other ship under the same wind', () => {
    const top = (C, gain) => {
        const st = newShipState(0, 0, 0); st.tau = Infinity; st.spellWind = { x: 0, z: -gain };
        for (let i = 0; i < 30 * 120; i++) stepShip(st, C, { wind: { x: 0, z: 0 }, openFrac: 1, moorings: [], solidAt: null, onHit: () => {} }, 1 / 30);
        return st.u;
    };
    for (const gain of [5, 21, 42]) { // (a breeze, «Вайнд», «Вайнд Максима»)
        const best = Math.max(...['pinnace', 'fluyt', 'galleon'].map((k) => top(SHIP_CLASSES[k], gain)));
        const k = top(SHIP_CLASSES.blackship, gain) / best;
        assert.ok(k > 1.33 && k < 1.47, `wind ${gain}: ×${k.toFixed(2)}`);
    }
});

test('the crew: Captain Black Moustache 100 HP and his rapier; skeletons no stronger than knights', () => {
    const { S, B } = world();
    S.wake(B);
    const list = S.crew.crews.get(B.id);
    const cap = list.find((v) => v.role === 'blackbeard');
    assert.equal(cap.hp, 100);
    assert.equal(cap.name, 'Чёрные Усы');
    assert.equal(cap.model.toolKind, 'rapier');
    const sk = list.filter((v) => v.role === 'skeleton');
    assert.equal(sk.length, 12);
    assert.ok(SAILOR_STATS.skeleton.hp + SAILOR_STATS.skeleton.armor <= 20 + 50 && SAILOR_STATS.skeleton.dmg <= 3);
    assert.ok(sk.every((v) => v.pirate && v.crew === B));
});

test('the captain parries a duel charge from in front — not from behind, not twice in a row, not when tired', () => {
    const { S, B } = world();
    S.wake(B);
    const cap = S.crew.crews.get(B.id).find((v) => v.role === 'blackbeard');
    S.crew._place(B);
    const r = Math.random;
    Math.random = () => 0; // (his chance always holds)
    try {
        const yaw = B.st.yaw + cap.lyaw;
        const front = { x: cap.x - Math.sin(yaw) * 10, z: cap.z - Math.cos(yaw) * 10 };
        const back = { x: cap.x + Math.sin(yaw) * 10, z: cap.z + Math.cos(yaw) * 10 };
        let t = 100000;
        assert.equal(S.crew.parryBolt(cap, back, t), false, 'from behind: it gets through');
        assert.equal(S.crew.parryBolt(cap, front, t), true, 'from in front: beaten aside');
        assert.equal(S.crew.parryBolt(cap, front, t + 200), false, 'the second charge right after: it gets through');
        // tired: parry after parry
        let n = 1;
        for (let i = 1; i < 12; i++) { t += PARRY.GAP * 1000 + 50; if (S.crew.parryBolt(cap, front, t)) n++; }
        assert.ok(n < 12, `he tires (${n} of 12)`);
        cap.stunT = 2;
        assert.equal(S.crew.parryBolt(cap, front, t + 1e6), false, 'stunned: no parry');
    } finally { Math.random = r; }
});

test('a skeleton is destroyed as a living tree is (and by what breaks bones): «Авада» and the other charges — nothing', () => {
    assert.equal(pirateBoneDamage('AvadaKedavra', 25, true), 0);
    assert.equal(pirateBoneDamage('SapiraDuel', 10, true), 0);
    assert.equal(pirateBoneDamage(undefined, 10, true), 0, 'an unnamed spell: nothing');
    for (const k of ['Inferno', 'Hellfire', 'FireMaxima', 'Lightning', 'Bombardo', 'BombardoMaxima', 'TotalDestruction', 'Inspirius', 'CircleAttack']) assert.equal(pirateBoneDamage(k, 10, true), 10, k);
    for (const k of ['melee', 'fist', 'arrow', 'cannon', 'crush', 'fall']) assert.equal(pirateBoneDamage(k, 10), 10, k);
    const { S, B } = world();
    S.wake(B);
    const sk = S.crew.crews.get(B.id).find((v) => v.role === 'skeleton');
    S.crew.hit(sk, 30, null, 'me', { spell: true, kind: 'SapiraDuel' });
    assert.equal(sk.hp, 12);
    S.crew.hit(sk, 30, null, 'me', { spell: true, kind: 'Inferno' });
    assert.ok(sk.dead);
});

test('the grapnels: a ship is hauled in alongside the black ship and held there, her gangway abreast of its own', () => {
    const { S, B, bb } = world();
    const T = S.spawn('pinnace', 40, 6, 0.3, { id: 'T', wake: false });
    B.awake = T.awake = true; // (as near a player)
    bb._grapple(B, T);
    assert.equal(T.lashTo, B.id);
    for (let i = 0; i < 30 * 15; i++) { bb.lashStep(T, 1 / 30); B.st.x += 0.1; S._place(B); S._place(T); }
    B.pose.toLocal(T.st.x, B.pose.y, T.st.z, bb._l || (bb._l = {}));
    const l = bb._l;
    assert.ok(Math.abs(Math.abs(l.x) - ((B.layout.B + T.layout.B) / 2 + BB.GAP)) < 0.3, `alongside: ${l.x}`);
    assert.ok(bb.lash.planks, 'the plank laid');
    const gw = bb._gangways(bb.lash, {});
    T.pose.toWorld(gw.b.x, gw.b.y, gw.b.z, l);
    const tz = l.z, tx = l.x;
    B.pose.toWorld(gw.a.x, gw.a.y, gw.a.z, l);
    assert.ok(Math.hypot(l.x - tx, l.z - tz) < 7, 'the gangways abreast');
});

test('the captain\'s chests: his gold and plunder; the barrel raised to reach', () => {
    const cap = rollPirateLoot(Math.random, 'captain');
    assert.ok(cap.filter((i) => i.kind === 'coins').reduce((a, i) => a + i.count, 0) >= 400);
    assert.ok(cap.some((i) => i.kind === 'weapon' && i.magic));
    assert.ok(rollPirateLoot(Math.random, 'store').some((i) => i.kind === 'cannonball'));
    // a ball fired at gunPitch lands where it was aimed
    for (const [D, h] of [[60, 0], [150, -5], [260, 2]]) {
        const p = gunPitch(D, h), v = 70;
        const vx = v * Math.cos(p), vy = v * Math.sin(p), t = D / vx;
        assert.ok(Math.abs(vy * t - 4.9 * t * t - h) < 0.5, `${D} m`);
    }
});

test('a ship\'s doors: a pair of leaves in each bulkhead\'s doorway, moving with the ship; shut — a wall, open — the way through', async () => {
    const { Doors } = await import('../../src/game/Doors.js');
    const { game, S, B } = world();
    game.collision.addBox = () => 1; game.collision.removeBox = () => {};
    game.doors = new Doors(game);
    S.wake(B);
    assert.equal(B.doors.length, B.layout.doors.length * 2);
    const d = B.layout.doors.find((x) => x.id === 'cabin');
    const at = {};
    B.pose.toWorld(0.8, d.y + 2, d.z, at);
    assert.ok(B.collider.pointBlocked(at.x, at.y, at.z), 'shut: a wall');
    const leaf = B.doors.find((x) => x.local.x > 0 && x.local.z === d.z);
    game.doors._setAngle(leaf, 1.4);
    assert.ok(!B.collider.pointBlocked(at.x, at.y, at.z), 'open: the way through');
    // it goes with the ship
    B.st.x += 30; B.st.yaw += 0.4; S._place(B); S._placeDoors(B, 0);
    B.pose.toWorld(leaf.local.x, leaf.local.y, leaf.local.z, at);
    assert.ok(Math.hypot(leaf.x - at.x, leaf.z - at.z) < 1e-6 && Math.abs(leaf.ry - B.pose.yaw) < 1e-9);
    S.sleep(B);
    assert.ok(![...game.doors.list.keys()].some((k) => k.startsWith(B.id)), 'asleep: its doors put away');
});

test('Captain Black Moustache is met once in a world: killed, he never comes back (saved with his ship)', () => {
    const { S, B } = world();
    S.wake(B);
    const cap = S.crew.crews.get(B.id).find((v) => v.role === 'blackbeard');
    S.crew.hit(cap, 500, null, 'me', { pierce: true });
    assert.ok(cap.dead && B.crewKilled.has(cap.idx));
    const save = S.snapshot();
    const w2 = world(); // (the world loaded again: the same ship from the save)
    w2.S.restore(save);
    const B2 = w2.S.list.get(BB.ID);
    w2.S.wake(B2);
    assert.ok(!w2.S.crew.crews.get(B2.id).some((v) => v.role === 'blackbeard'), 'no captain any more');
    assert.ok(!w2.S.crew.captainAlive(B2));
});
