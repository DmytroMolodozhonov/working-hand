/**
 * «Джолт» is a duel spell like the others: it meets an answering charge — a duel (a meeting point, who
 * pushes harder, a winner); a shield stops it; a wizard has time to answer it; over the network the host
 * decides and the others see the same.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { WizardFight } from '../../src/game/WizardFight.js';
import { WIZ } from '../../src/game/WizardAI.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Me at the origin pointing along −Z, another wizard («foe») 12 m away pointing back at me. */
function world({ authority = true, myMana = 30 } = {}) {
    const foe = { dead: false, position: V(0, -1.25, -12), character: { group: new THREE.Group() }, handPose: () => ({ origin: V(0, 0, -11), dir: V(0, 0, 1) }) };
    foe.character.group.position.copy(foe.position);
    const meGroup = new THREE.Group();
    meGroup.position.set(0, -1.25, 0.3);
    const hand = { o: V(0, 0, 0), d: V(0, 0, -1) };
    const ev = { stunned: [], impacts: [], sent: [] };
    const g = {
        localId: 'me', authority, scene: new THREE.Scene(), remotes: new Map([['foe', foe]]), zombies: [], zombieById: new Map(),
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {}, setDuelBar() {} },
        impact: { apply: (o) => ev.impacts.push(o) },
        castOrigin: (s, out = V()) => out.copy(hand.o),
        character: { group: meGroup, isArmRaised: () => true, getHandWorldPosition: (s, o = V()) => o.copy(hand.o), getHandDirection: (s, o = V()) => o.copy(hand.d), getPointingDirection: (s, o = V()) => o.copy(hand.d) },
        combat: { dead: false, enabled: false, fatigue: myMana, maxFatigue: myMana, center: (o) => o.copy(meGroup.position).add(V(0, 0.6, 0)), shieldFactor: () => 0, _blocked: () => false, stun: (t, by) => ev.stunned.push(by) },
    };
    const d = new Duel(g);
    d._burst = () => {};
    return { g, d, ev };
}
const run = (d, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) d.update(dt); };
const at = (d, ev) => d.log.find((e) => e.ev === ev);

test('«Джолт» flies as fast as the other duel charges (time to answer it)', () => {
    for (const s of ['Jolt', 'JoltMaxima']) assert.ok(DUEL_SPELLS[s].speed >= 15 && DUEL_SPELLS[s].speed <= 16.5, `${s}: ${DUEL_SPELLS[s].speed}`);
});

test('«Джолт» against «Остолбеней»: a duel starts where they meet, and ends — mine stronger, the foe loses', () => {
    const { d } = world({ myMana: 400 });
    d.cast('Jolt', { side: 'right', t: { kind: 'p', id: 'foe' } });
    d.remoteCast({ id: 'foe:1', by: 'foe', s: 'Stupefy', side: 'right', tk: 'p', tid: 'me', o: [0, 0, -11], d: [0, 0, 1] });
    run(d, 1);
    const start = at(d, 'clashStart');
    assert.ok(start, 'a duel');
    assert.ok(start.p > 0.1 && start.p < 0.9, `met between the hands: ${start.p}`);
    assert.equal(d.clashes.length, 1);
    run(d, 30);
    assert.equal(at(d, 'clashEnd')?.loser, 'foe', 'the stronger «Джолт» wins');
    assert.equal(d.bolts.size, 0);
});

test('«Джолт» loses the duel: I get the opponent\'s «Остолбеней»; it wins — the loser is thrown by «Джолт»', () => {
    const { g, d, ev } = world({ myMana: 5 });
    g.remotes.get('foe').fatigue = 400;
    d.remoteCast({ id: 'foe:1', by: 'foe', s: 'Stupefy', side: 'right', tk: 'p', tid: 'me', o: [0, 0, -11], d: [0, 0, 1] });
    d.cast('Jolt', { side: 'right', t: { kind: 'p', id: 'foe' } });
    run(d, 40);
    assert.equal(at(d, 'clashEnd')?.loser, 'me');
    assert.deepEqual(ev.stunned, ['foe'], 'stunned by the winner\'s spell');

    // my «Джолт Максима» beats a tower wizard: he is thrown by it (the host decides the castle people)
    const w = world();
    const wiz = { id: 'wiz1', wizard: true, x: 0, y: -3, z: -12, yaw: 0, model: { getWandTip: (o) => o.set(0, 0, -11), getWandDir: (o) => o.set(0, 0, 1) } };
    w.g.castleLife = { byId: new Map([['wiz1', wiz]]), wardOff: () => false };
    const thrown = [];
    w.d._joltCreature = (c, spell) => thrown.push([c.id, spell]);
    const a = w.d.cast('JoltMaxima', { side: 'right', t: { kind: 'n' } });
    const b = w.d._addBolt({ id: 'wiz1:1', by: 'wiz1', spell: 'Stupefy', side: 'right', tk: 'p', tid: 'me', o: V(0, 0, -11), d: V(0, 0, 1) });
    w.d._startClash(a, b, 0.5);
    w.d._finishClash(w.d.clashes[0], 'wiz1');
    assert.deepEqual(thrown, [['wiz1', 'JoltMaxima']]);
});

test('«Джолт» into «Protection»: stopped by the shield, nothing thrown', () => {
    const { g, d, ev } = world();
    g.combat.shieldFactor = () => 1;
    g.combat._blocked = (from, kind) => kind === 'Jolt';
    d.remoteCast({ id: 'foe:1', by: 'foe', s: 'Jolt', side: 'right', tk: 'p', tid: 'me', o: [0, 0, -11], d: [0, 0, 1] });
    const ends = [];
    g.sync = { duelEnd: (id, res) => ends.push(res), duelClash() {}, duelCast() {} };
    run(d, 3);
    assert.deepEqual(ends, ['blocked']);
    assert.equal(ev.impacts.length, 0, 'not thrown back');
});

test('a guest: the host says my duel against «Джолт» is lost — I am thrown by «Джолт»; «…Максима» said late upgrades the flying charge', () => {
    const { d, ev } = world({ authority: false });
    d.remoteCast({ id: 'foe:1', by: 'foe', s: 'Jolt', side: 'right', tk: 'p', tid: 'me', o: [0, 0, -11], d: [0, 0, 1] });
    assert.ok(d.underFire(), 'a charge flies at me: «Джолт» may go before the phrase ends');
    const mine = d.cast('Jolt', { side: 'right', t: { kind: 'p', id: 'foe' } });
    d.update(1 / 30);
    d.remoteClash({ a: 'foe:1', b: mine.id, p: 0.5 });
    assert.equal(d.clashes.length, 1, 'the guest sees the duel too');
    assert.ok(d.upgradeJolt(), '«Джолт Максима» said: my charge becomes the Maxima');
    assert.equal(mine.spell, 'JoltMaxima');
    d.remoteClashEnd({ a: 'foe:1', b: mine.id, loser: 'me' });
    assert.equal(ev.impacts.at(-1)?.spell, 'Jolt', 'thrown by the winner\'s «Джолт»');
    assert.ok(ev.impacts.at(-1).fly);

    // the others see the upgrade; an upgrade of a charge already gone there makes no new one
    const o = world();
    o.d.remoteCast({ id: 'x:1', by: 'x', s: 'Jolt', side: 'right', tk: 'n', o: [0, 0, -11], d: [0, 0, 1] });
    o.d.remoteCast({ id: 'x:1', by: 'x', s: 'JoltMaxima', side: 'right', tk: 'n', o: [0, 0, -11], d: [0, 0, 1], up: 1 });
    assert.equal(o.d.bolts.get('x:1').spell, 'JoltMaxima');
    o.d.remoteCast({ id: 'x:9', by: 'x', s: 'JoltMaxima', side: 'right', tk: 'n', o: [0, 0, -11], d: [0, 0, 1], up: 1 });
    assert.ok(!o.d.bolts.has('x:9'));
});

test('a wizard answers a «Джолт» flying at him with a spell back (a duel), as he does a «Остолбеней»', () => {
    const answered = [];
    // (far enough to say a spell back first — a second, WizardAI.CAST_PREP: from nearer only the hand shield)
    const v = { id: 'wiz1', x: 0, y: 0, z: -21, yaw: 0, mana: 100, role: 'teacher', fx: 0, shieldT: 0, foe: 'me', W: WIZ.teacher };
    const fight = Object.create(WizardFight.prototype);
    const b = { id: 'me:1', by: 'me', spell: 'Jolt', state: 'flying', tk: 'v', tid: 'wiz1', front: V(0, 0, 0), o: V(0, 0, 0), dir: V(0, 0, -1) };
    Object.assign(fight, { game: { duel: { bolts: new Map([[b.id, b]]) } }, life: { _isPlayer: () => true, _say() {} }, _counter: (w, x) => { answered.push(x.spell); return true; } });
    // (the wizard looks at me: yaw 0 looks along −Z, so turn him round to face +Z)
    v.yaw = Math.PI;
    const rnd = Math.random;
    Math.random = () => 0.1;
    try { fight._react(v, 0.2); } finally { Math.random = rnd; }
    assert.deepEqual(answered, ['Jolt'], 'a spell back at the «Джолт»');
});
