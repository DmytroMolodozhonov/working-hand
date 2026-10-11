import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation, fallDamage, HOLD_FATIGUE } from '../../src/game/Levitation.js';

/**
 * A small world: flat ground at y 0, me at the origin looking along −Z, my right hand
 * at (0.6, 1.5, −1) pointing where `aim` says. A cow 4 m ahead.
 */
function world({ authority = true, freeworld = false } = {}) {
    const hits = [], sent = [], voice = [];
    const aim = new THREE.Vector3(0, 0, -1);
    const hand = new THREE.Vector3(0.6, 1.5, -1);
    const cow = { id: 7, type: 'cow', group: new THREE.Group(), vel: new THREE.Vector3(), airborne: false, dead: false };
    cow.group.position.set(0.6, 0.5, -5);
    const remoteHand = { origin: new THREE.Vector3(5, 1.5, 0), dir: new THREE.Vector3(0, 0, -1) };
    const remotes = new Map([['friend', { dead: false, lastUpdate: performance.now(), handPose: () => remoteHand }]]);
    const g = {
        localId: 'me', authority, remotes,
        config: { mode: freeworld ? 'freeworld' : 'creative' },
        zombies: [], zombieById: new Map(),
        weapons: { weapons: [] }, water: { resting: [] },
        animals: {
            byId: new Map([[7, cow]]), riding: null,
            targets: () => (cow.dead ? [] : [cow]),
            push(a, v) { a.vel.add(v); a.airborne = v.y > 0.5 || a.airborne; },
            hit: (a, d, dir, by) => hits.push({ who: 'cow', d, by }),
            _animate() {},
        },
        duel: {
            _animalBody: () => ({ y: 0.8, r: 1.2 }),
            _handOf: (by, side, pos, dir) => {
                if (by === 'me') { pos.copy(hand); dir.copy(aim).normalize(); return true; }
                const r = remotes.get(by); if (!r) return false;
                pos.copy(r.handPose().origin); dir.copy(r.handPose().dir); return true;
            },
        },
        collision: { surfaceY: () => 0, groundY: () => 0, resolveCylinder() {} },
        character: {
            group: new THREE.Group(),
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(hand),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(aim).normalize(),
            onGround: true, verticalVelocity: 0,
        },
        combat: { enabled: freeworld, fatigue: 30, dead: false, shield: null, center: (out = new THREE.Vector3()) => out.copy(g.character.group.position).add(new THREE.Vector3(0, 0.6, 0)), shieldFactor: () => 1, _blocked() {}, damage: (d, by) => hits.push({ who: 'me', d, by }) },
        knockback: new THREE.Vector3(),
        hud: { setVoice: (t) => voice.push(t) },
        fx: { spark() {} },
        sync: { lev: (...a) => sent.push(['lev', ...a]), lift: (...a) => sent.push(['lift', ...a]), levNo: (...a) => sent.push(['levno', ...a]) },
        playerName: () => 'Друг',
        damageLocalPlayer: (d) => hits.push({ who: 'me', d }),
    };
    g.character.group.position.set(0, 2, 0);
    const lev = new Levitation(g);
    g.levitation = lev;
    const run = (secs, each) => { for (let i = 0; i < secs * 60; i++) { each?.(i); lev.update(1 / 60); } };
    return { g, lev, cow, hand, aim, hits, sent, voice, run, remoteHand };
}

const cowMiddle = (cow) => cow.group.position.y + 0.8;

test('a fall hurts only from high up: none up to 3.5 m, then 2 a metre', () => {
    assert.equal(fallDamage(2), 0);
    assert.equal(fallDamage(3.5), 0);
    assert.equal(fallDamage(6), 5);
    assert.equal(fallDamage(10), 13);
    assert.ok(HOLD_FATIGUE.wizard > HOLD_FATIGUE.heavy && HOLD_FATIGUE.heavy > HOLD_FATIGUE.light);
});

test('Leviosa on a cow: it rises and hangs in front of the hand like a thing, and follows the hand', () => {
    const { lev, cow, hand, aim, run } = world();
    assert.equal(lev.cast(), null);
    assert.equal(lev.state.kind, 'creature');
    assert.ok(cow.lev, 'held');
    // the hand lifted: pointing up and ahead
    aim.set(0, 0.8, -1);
    run(3);
    const want = hand.clone().addScaledVector(aim.clone().normalize(), lev.state.hold);
    assert.ok(cowMiddle(cow) > 3, `it rose (${cowMiddle(cow).toFixed(2)} m)`);
    assert.ok(Math.abs(cowMiddle(cow) - (want.y + 0.3)) < 0.5, 'its middle at the held point');
    // the hand goes 2 m to the right: the cow comes along
    const x0 = cow.group.position.x;
    run(1, () => { hand.x += 2 / 60; }); // (a slow move of the hand, not a jerk)
    run(1.5);
    assert.ok(cow.group.position.x - x0 > 1.6, `followed (${(cow.group.position.x - x0).toFixed(2)} m)`);
});

test('a jerk lets the cow go up there: it falls and the fall hurts; said again, it is set down softly', () => {
    const { lev, cow, aim, hits, run } = world();
    lev.cast();
    aim.set(0, 1.6, -1); // high
    run(3);
    const top = cow.group.position.y - 0.5;
    assert.ok(top > 3.6, `up high (${top.toFixed(1)} m)`);
    lev.release(false); // (as a jerk does)
    assert.equal(cow.lev, null);
    assert.ok(cow.airborne, 'falling');
    // (the animal's own body falls; here: straight down)
    cow.group.position.y = 0.5; cow.airborne = false;
    run(0.2);
    assert.equal(hits.length, 1, 'hurt by the fall');
    assert.equal(hits[0].d, fallDamage(top), `${hits[0].d} for ${top.toFixed(1)} m`);
    // again, then the words once more: set down gently, no hurt
    const w2 = world();
    w2.lev.cast();
    w2.aim.set(0, 1.6, -1);
    w2.run(3);
    w2.lev.cast(); // («Вингардиум Левиоса» again)
    w2.run(6);
    assert.equal(w2.cow.lev, null, 'down');
    assert.ok(w2.cow.group.position.y - 0.5 < 0.2, 'on the ground');
    assert.equal(w2.hits.length, 0, 'no hurt');
});

test('free world: holding a heavy cow costs 3 strength a second; with none left it is dropped', () => {
    const { g, lev, cow, run } = world({ freeworld: true });
    lev.cast();
    run(2);
    assert.ok(Math.abs(g.combat.fatigue - (30 - 2 * HOLD_FATIGUE.heavy)) < 0.2, `${g.combat.fatigue}`);
    run(9);
    assert.equal(lev.state, null, 'dropped');
    assert.equal(cow.lev, null);
});

test('a guest\'s Leviosa: the host carries the body by the guest\'s hand; a taken body is refused', () => {
    // the guest asks
    const guest = world({ authority: false });
    guest.lev.cast();
    assert.equal(guest.cow.lev, undefined, 'not moved on the guest');
    assert.deepEqual(guest.sent[0].slice(0, 3), ['lev', 'a', 7]);
    // the host gets the message (the friend points at the cow): taken where it is, no jump
    const host = world();
    const cowAt = host.cow.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    host.remoteHand.dir.copy(cowAt).sub(host.remoteHand.origin).normalize();
    host.lev.onNetLev({ by: 'friend', k: 'a', id: 7, side: 'right', h: 4, on: 1 });
    assert.equal(host.cow.lev.by, 'friend');
    host.run(1);
    assert.ok(Math.abs(host.cow.group.position.x - 0.6) < 0.4, `stays where it was taken (${host.cow.group.position.x.toFixed(2)})`);
    // the friend's hand turns: the cow comes along
    host.remoteHand.dir.set(0, 0, -1);
    host.run(3);
    assert.ok(Math.abs(host.cow.group.position.x - 5) < 0.6, `follows the friend's hand (${host.cow.group.position.x.toFixed(2)})`);
    // a second wizard: refused
    host.lev.onNetLev({ by: 'other', k: 'a', id: 7, side: 'right', h: 4, on: 1 });
    assert.deepEqual(host.sent.at(-1).slice(0, 2), ['levno', 'other']);
    // the friend lets go
    host.lev.onNetLev({ by: 'friend', k: 'a', id: 7, on: 0 });
    assert.equal(host.cow.lev, null);
    // the friend leaves while holding: it falls
    host.lev.onNetLev({ by: 'friend', k: 'a', id: 7, side: 'right', h: 4, on: 1 });
    host.lev.onLeave('friend');
    assert.equal(host.cow.lev, null);
});

test('a wizard lifted by a duel charge: hangs at the caster\'s hand, my shield towards them breaks it, a fall hurts', () => {
    const { g, lev, run, sent, hits, remoteHand } = world({ freeworld: true });
    remoteHand.origin.y = 4; // (the friend stands up on a hill)
    lev.liftMe('friend', 'right');
    assert.ok(lev.lifted);
    assert.deepEqual(sent[0].slice(0, 4), ['lift', 'friend', 'right', lev.lifted.hold]);
    remoteHand.dir.set(-1, 0.9, 0).normalize(); // the friend points up at me
    run(3);
    const me = g.character.group.position;
    assert.ok(me.y > 7, `up in the air (${me.y.toFixed(1)})`);
    const top = me.y;
    // they let go: I fall; on the ground it hurts
    lev.onNetLev({ by: 'friend', k: 'p', id: 'me', on: 0 });
    assert.equal(lev.lifted, null);
    me.y = 2; g.character.onGround = true;
    run(0.1);
    assert.equal(hits.at(-1).d, fallDamage(top - 2));
    // lifted again: a shield towards them frees me
    lev.liftMe('friend', 'right');
    g.combat.shield = { type: 1 };
    run(0.1);
    assert.equal(lev.lifted, null);
    assert.ok(sent.some((m) => m[0] === 'lift' && m[4] === false && m[5] === true), 'everyone hears I broke free');
});

test('the caster: «I am held» from the wizard makes my hold a wizard\'s (it costs 4 a second); a jerk-free let go tells them', () => {
    const { g, lev, run, sent } = world({ freeworld: true });
    lev.onNetLift({ by: 'me', to: 'friend', side: 'right', h: 3, on: 1 });
    assert.equal(lev.state.kind, 'player');
    run(1);
    assert.ok(Math.abs(g.combat.fatigue - (30 - HOLD_FATIGUE.wizard)) < 0.2);
    lev.release(true);
    assert.deepEqual(sent.at(-1).slice(0, 3), ['lev', 'p', 'friend']);
    assert.equal(sent.at(-1)[6], true, 'gently');
});

test('steadyDir: a one-moment jump of the hand\'s line (camera glitch) is not followed; a lasting turn is; a smooth turn goes through', async () => {
    const { steadyDir, LEVITATE } = await import('../../src/game/Levitation.js');
    const st = {}, dt = 1 / 60;
    const d = (a) => new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    steadyDir(st, d(0), dt);
    // the fingers lost for a moment: the line jumps 60° aside and back
    assert.ok(steadyDir(st, d(1.05), dt).angleTo(d(0)) < 1e-6, 'the jump is held back');
    assert.ok(steadyDir(st, d(1.05), dt).angleTo(d(0)) < 1e-6);
    assert.ok(steadyDir(st, d(0), dt).angleTo(d(0)) < 1e-6);
    // a real turn of the hand, a little each frame: followed at once
    let a = 0;
    for (let i = 0; i < 20; i++) { a += 0.05; assert.ok(steadyDir(st, d(a), dt).angleTo(d(a)) < 1e-6); }
    // a jump that lasts longer than GLITCH_T: believed
    let got;
    for (let t = 0; t < LEVITATE.GLITCH_T + 0.1; t += dt) got = steadyDir(st, d(a + 1.5), dt);
    assert.ok(got.angleTo(d(a + 1.5)) < 1e-6);
});
