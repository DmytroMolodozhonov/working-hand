import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { Zombie } from '../../src/entities/Zombie.js';
import { BodyStrikes } from '../../src/game/BodyStrikes.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { Knockdown } from '../../src/game/Knockdown.js';
import { IMPACT } from '../../src/game/Impact.js';

/**
 * Me at the origin facing −Z; my knuckles are wherever the test puts them (the forearm points −Z).
 * Another player stands 2.2 in front of me, facing me.
 */
function arena({ curl = 0.9, host = true } = {}) {
    const scene = new THREE.Scene();
    const hand = { left: new THREE.Vector3(-3, 0, 0), right: new THREE.Vector3(3, 0, 0) };
    const curls = { left: curl, right: curl };
    const offsets = [], hits = [], pushes = [], applied = [], cstrikes = [], localHits = [];
    const victim = new VoxelCharacter(scene, { remote: true });
    victim.group.position.set(0, 0.5, -2.2);
    victim.group.rotation.y = Math.PI;
    victim.group.updateMatrixWorld(true);
    const r = { dead: false, target: {}, character: victim, vel: new THREE.Vector3(), position: victim.group.position, combat: { shield: 0, shieldLeft: 0 } };
    const g = {
        scene, authority: host, localId: 'me', remotes: new Map([['enemy', r]]), currentPose: { hasPose: true },
        zombies: [], weapons: { hands: { left: {}, right: {} } }, items: { held: {} },
        character: {
            group: { position: new THREE.Vector3(0, 0.5, 0) }, isRunning: false,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(hand[side]).add(new THREE.Vector3(0, 0, IMPACT.KNUCKLES)),
            getForearmDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            getGripCurl: (side) => curls[side],
            setHandOffset: (side, d) => offsets.push({ side, d: d.clone() }),
        },
        combat: { enabled: true, dead: false, meleeTarget: (id) => ({ id }), hitRemote: (t, dmg, m, h, x) => hits.push({ to: t.id, dmg, ...x }) },
        sync: { playerPush: (to, x) => pushes.push({ to, ...x }), creatureStrike: (m) => cstrikes.push(m) },
        creatureImpact: { apply: (c, o) => applied.push({ c, o }) },
        onLocalHit: (c, dmg) => localHits.push({ c, dmg }),
    };
    const s = new BodyStrikes(g);
    const headC = victim.head.getWorldPosition(new THREE.Vector3());
    const chest = victim.body.getWorldPosition(new THREE.Vector3());
    return { g, s, hand, curls, offsets, hits, pushes, applied, cstrikes, localHits, victim, r, headC, chest, scene };
}
/** Move a hand's knuckles to `p` over one frame of dt. */
const move = (A, side, p, dt = 1 / 60) => { A.hand[side].copy(p); A.s.update(dt); };
/** A jab: the knuckles from `from` (relative to target) towards the target, `step` per frame. */
function jab(A, side, target, from, step, frames = 1, dt = 1 / 60) {
    move(A, side, target.clone().add(from), dt);
    const dir = from.clone().normalize().negate();
    for (let i = 1; i <= frames; i++) move(A, side, target.clone().add(from).addScaledVector(dir, step * i), dt);
}

test('a fist resting at the face, or a slow fist, does nothing — the drawn hand rests on the skin', () => {
    const A = arena();
    for (let i = 0; i < 5; i++) move(A, 'right', A.headC.clone().add(new THREE.Vector3(0, 0, 0.3 + 0.62 + 0.22)));
    assert.equal(A.hits.length + A.pushes.length, 0);
    // slowly into the face (2 u/s)
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.0), 2 / 60, 20);
    assert.equal(A.hits.length + A.pushes.length, 0, 'a touch is no blow');
    assert.equal(A.s.contact.right?.part, 'head');
    assert.ok(A.offsets.length > 0 && A.offsets.at(-1).d.length() > 0.05, 'the drawn hand is held on the surface, not inside');
});

test('a fast fist into the face: one punch at the head (the face side), pushed along the punch', () => {
    const A = arena();
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(A.hits.length, 1, JSON.stringify(A.s.log));
    const h = A.hits[0];
    assert.equal(h.k, 'punch'); assert.equal(h.pt, 'head'); assert.equal(h.to, 'enemy');
    assert.ok(h.lp[2] < -0.4, `the face (local −Z): ${h.lp}`);
    assert.ok(h.i[2] < 0, 'pushed along the punch');
    assert.ok(Math.abs(Math.hypot(...h.i) - IMPACT.PUNCH_HEAD_BODY * h.sp) < 0.05);
    // the same hand again at once: nothing more
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(A.hits.length, 1, 'one blow per hand per 0.35 s');
});

test('arms swinging on the run never punch; a body beyond reach is not hit', () => {
    const A = arena();
    A.g.character.isRunning = true;
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(A.hits.length, 0);
    const B = arena();
    jab(B, 'right', B.headC.clone().add(new THREE.Vector3(0, 0, 4)), new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(B.hits.length + B.pushes.length, 0);
});

test('an open palm in the face is a slap (no harm), a forearm across the face is a guard', () => {
    const A = arena({ curl: 0.1 });
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(A.hits.length, 0);
    assert.equal(A.pushes.length, 1);
    assert.equal(A.pushes[0].k, 'slap');
    // the victim's right forearm held across in front of its face
    const B = arena();
    const el = B.victim.rightElbowAnchor;
    el.parent.updateMatrixWorld(true);
    const want = B.headC.clone().add(new THREE.Vector3(0.45, 0, 0.75));
    el.position.copy(el.parent.worldToLocal(want.clone()));
    el.lookAt(B.headC.clone().add(new THREE.Vector3(-0.6, 0, 0.75)));
    el.updateMatrixWorld(true);
    jab(B, 'right', B.headC, new THREE.Vector3(0, 0, 1.6), 0.2333, 4);
    assert.equal(B.hits.length, 0, 'no punch through a guard');
    assert.equal(B.pushes[0]?.k, 'guard');
});

test('both palms into the chest together: one shove; apart: two one-hand pushes', () => {
    const setUp = () => {
        const A = arena({ curl: 0 });
        const L = A.chest.clone().add(new THREE.Vector3(-0.3, 0, 0.95)), R = A.chest.clone().add(new THREE.Vector3(0.3, 0, 0.95));
        A.hand.left.copy(L); A.hand.right.copy(R);
        for (let i = 0; i < 10; i++) A.s.update(1 / 60); // (the hands held still before the chest)
        return { A, L, R, IN: new THREE.Vector3(0, 0, -0.45) };
    };
    const { A, L, R, IN } = setUp();
    A.hand.left.copy(L).add(IN); A.hand.right.copy(R).add(IN);
    for (let i = 0; i < 20; i++) A.s.update(1 / 60);
    assert.equal(A.pushes.length, 1, JSON.stringify(A.s.log));
    assert.equal(A.pushes[0].k, 'shove'); assert.equal(A.pushes[0].n, 2);
    const b = setUp(), B = b.A;
    B.hand.left.copy(b.L).add(b.IN);
    for (let i = 0; i < 18; i++) B.s.update(1 / 60);
    B.hand.right.copy(b.R).add(b.IN);
    for (let i = 0; i < 18; i++) B.s.update(1 / 60);
    assert.equal(B.pushes.length, 2, JSON.stringify(B.s.log));
    assert.ok(B.pushes.every((p) => p.k === 'push' && p.n === 1));
    assert.ok(Math.hypot(...B.pushes[0].i) < Math.hypot(...A.pushes[0].i), 'one hand pushes less');
});

test('a running two-hand shove is strong enough to throw someone off their feet', () => {
    const A = arena({ curl: 0 });
    A.s.bodyVel.set(0, 0, -7.5);
    A.s._bodyPrev = null;
    A.s._sendPush({ key: 'p:enemy', id: 'enemy', player: A.r }, [{ side: 'left', speed: 6, dir: new THREE.Vector3(0, 0, -1) }, { side: 'right', speed: 6, dir: new THREE.Vector3(0, 0, -1) }]);
    assert.ok(Math.hypot(...A.pushes[0].i) >= 11, `${A.pushes[0].i}`);
});

test('tunnelling: a fist passing right through the head in one frame still lands', () => {
    const A = arena();
    move(A, 'right', A.headC.clone().add(new THREE.Vector3(0, 0, 0.8 + 0.22 + 0.05)));
    move(A, 'right', A.headC.clone().add(new THREE.Vector3(0, 0, -0.6)), 1 / 30);
    assert.equal(A.hits.length, 1);
});

test('their dome: hands cannot get in', () => {
    const A = arena();
    A.r.combat.shield = 2; A.r.combat.shieldLeft = 3;
    jab(A, 'right', A.headC, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
    assert.equal(A.hits.length + A.pushes.length, 0);
});

test('creatures too: a punch in a zombie\'s face hurts it and jolts its head; a guest sends it to the host', () => {
    for (const host of [true, false]) {
        const A = arena({ host });
        A.g.remotes.clear();
        const z = new Zombie(A.scene, new THREE.Vector3(0, 0, -2.2), 5, {});
        z.group.position.y = 0.5;
        z.group.lookAt(0, 0.5, 0); // looks at me
        z.group.updateMatrixWorld(true);
        A.g.zombies.push(z);
        const hc = z.head.getWorldPosition(new THREE.Vector3());
        jab(A, 'right', hc, new THREE.Vector3(0, 0, 1.05), 0.2333, 2);
        assert.equal(A.localHits.length, 1, 'the punch hurts it (1)');
        if (host) {
            assert.equal(A.applied.length, 1);
            assert.equal(A.applied[0].o.kind, 'punch');
            assert.ok(A.applied[0].o.head, 'at the head');
        } else {
            assert.equal(A.cstrikes.length, 1);
            assert.equal(A.cstrikes[0].ck, 'z');
            assert.ok(A.cstrikes[0].h);
        }
    }
});

test('the victim checks the blow: near, not too often, capped; the head snaps back', () => {
    const scene = new THREE.Scene();
    const attacker = { dead: false, position: new THREE.Vector3(0, 0.5, -2) };
    const g = {
        character: new VoxelCharacter(scene), knockback: new THREE.Vector3(), fx: { shake: 0 }, localId: 'me',
        hud: { setVoice() {}, flashColor() {} }, remotes: new Map([['a', attacker]]), currentPose: null,
        combat: { dead: false, shield: null, frozen: false, shieldFactor: () => 0, center: (o = new THREE.Vector3()) => o.copy(g.character.group.position), die() {} },
    };
    g.character.group.position.set(0, 0.5, 0);
    g.impact = new BodyImpact(g); g.knock = new Knockdown(g);
    const punch = { by: 'a', k: 'punch', pt: 'head', lp: [0, 0.1, -0.6], i: [0, 0, 1.75], sp: 7, s: 'right' };
    assert.equal(g.impact.onStrike(punch), 'none', 'a punch moves the body less than a stagger…');
    let peak = 0;
    for (let i = 0; i < 12; i++) peak = Math.max(peak, g.impact.step(1 / 60).pitch);
    assert.ok(peak > 0.1, `…but the head snaps back: ${peak}`);
    assert.equal(g.knock.state, 'up');
    assert.equal(g.impact.onStrike(punch), 'none');
    const kb = g.knockback.length();
    g.impact.onStrike({ ...punch, s: 'right' });
    assert.equal(g.knockback.length(), kb, 'the same hand again at once: ignored');
    g.impact.onStrike({ by: 'a', k: 'shove', pt: 'body', i: [0, 0, 40], s: 'left' });
    assert.ok(g.knockback.length() <= IMPACT.MAX_IMPULSE + kb + 1e-6, 'capped');
    attacker.position.set(0, 0.5, -10);
    const before = g.knockback.length();
    g.impact.onStrike({ by: 'a', k: 'shove', pt: 'body', i: [0, 0, 8], s: 'right' });
    assert.equal(g.knockback.length(), before, 'from 10 units away: ignored');
});
