/**
 * Duel spells fly where the hand points: a creature is the target only when the hand
 * points right at it (a few degrees beside its body at most, the nearest along the
 * line); towards it the charge turns only a little (AIM.BEND in all) — never round after
 * it; with no target it flies straight and hits whatever it really touches. In flight
 * the hand's line is taken as the player sees it (without the body's forward tilt).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, AIM, BODY, DUEL, pickBody, bendToward, rayToSegment, segmentToSegment, firstTouched } from '../../src/game/Duel.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
/** A standing body (as a zombie's) whose middle is `ang` rad to the side of the line −Z, `dist` m away. */
const bodyAt = (ang, dist, r = 0.7, id = 'x') => {
    const x = Math.sin(ang) * dist, z = -Math.cos(ang) * dist;
    return { kind: 'z', id, a: V(x, -1, z), b: V(x, 1, z), r };
};
const lineDist = (o, d, p) => p.clone().sub(o).cross(d).length();

test('the closest points of a line and a segment, and of two segments', () => {
    const c = rayToSegment(V(0, 0, 0), V(0, 0, -1), V(2, -1, -5), V(2, 1, -5));
    assert.ok(Math.abs(c.along - 5) < 1e-9 && Math.abs(c.k - 0.5) < 1e-9 && Math.abs(c.dist - 2) < 1e-9, JSON.stringify(c));
    // behind the hand: the line goes forwards only
    const back = rayToSegment(V(0, 0, 0), V(0, 0, -1), V(0, -1, 5), V(0, 1, 5));
    assert.equal(back.along, 0);
    const s = segmentToSegment(V(0, 0, 0), V(0, 0, -10), V(-1, 0.3, -4), V(1, 0.3, -4));
    assert.ok(Math.abs(s.s - 0.4) < 1e-9 && Math.abs(s.k - 0.5) < 1e-9 && Math.abs(s.dist - 0.3) < 1e-9, JSON.stringify(s));
    const far = segmentToSegment(V(0, 0, 0), V(0, 0, -3), V(-1, 0, -4), V(1, 0, -4));
    assert.ok(Math.abs(far.dist - 1) < 1e-9, 'the move ends before the body');
});

test('the target is only a body right on the line of the hand: on it — yes; 14–20° off — no; a few degrees beside it — yes; the nearest one along the line', () => {
    const o = V(0, 0, 0), d = V(0, 0, -1);
    assert.equal(pickBody(o, d, [bodyAt(0, 12)])?.body.id, 'x', 'on the line');
    for (const deg of [14, 16, 20]) assert.equal(pickBody(o, d, [bodyAt(deg * DEG, 12)]), null, `${deg}° off is not pointed at`);
    for (const dist of [8, 12, 25]) assert.equal(pickBody(o, d, [bodyAt(16 * DEG, dist)]), null, `16° off at ${dist} m`);
    // (the help is there: 9° off a body 12 m away is still meant)
    assert.equal(pickBody(o, d, [bodyAt(9 * DEG, 12)])?.body.id, 'x', '9° off at 12 m');
    // (very near, a body fills more of the view: 4 m away 12° off its middle is just beside it — 20° is not)
    assert.equal(pickBody(o, d, [bodyAt(22 * DEG, 4)]), null, '22° off at 4 m');
    // the line passes 0.3 m beside a body 12 m away (~1.4°): still meant
    const near = { kind: 'z', id: 'n', a: V(1.0, -1, -12), b: V(1.0, 1, -12), r: 0.7 };
    const p = pickBody(o, d, [near]);
    assert.ok(p && p.miss > 0 && p.miss < AIM.CONE, `just beside it (${p && (p.miss / DEG).toFixed(2)}°)`);
    // two bodies on the line: the nearer one
    assert.equal(pickBody(o, d, [bodyAt(0, 20, 0.7, 'far'), bodyAt(0.01, 9, 0.7, 'close')]).body.id, 'close');
    // a big body is easier to point at than a small one (its own angular size counts)
    assert.ok(pickBody(o, d, [bodyAt(12 * DEG, 10, 1.6)]), 'a big body 12° off at 10 m');
    assert.equal(pickBody(o, d, [bodyAt(14 * DEG, 10, 0.6)]), null, 'a small one 14° off at 10 m');
    // behind, too far, too close
    assert.equal(pickBody(o, d, [bodyAt(Math.PI, 8)]), null, 'behind');
    assert.equal(pickBody(o, d, [bodyAt(0, DUEL.RANGE + 5)]), null, 'out of range');
});

test('the charge corrects its way at most AIM.BEND (~15.6°, 30% more than before) in all, a little at a time', () => {
    assert.ok(AIM.BEND <= 16.5 * DEG && AIM.BEND >= 14 * DEG);
    const d0 = V(0, 0, -1);
    const dir = d0.clone();
    const want = V(Math.sin(30 * DEG), 0, -Math.cos(30 * DEG));
    let prev = dir.clone(), maxStep = 0;
    for (let i = 0; i < 200; i++) {
        bendToward(dir, d0, want, AIM.TURN / 60);
        maxStep = Math.max(maxStep, prev.angleTo(dir));
        prev.copy(dir);
        assert.ok(dir.angleTo(d0) <= AIM.BEND + 1e-9, `never more than BEND off the hand's line (${(dir.angleTo(d0) / DEG).toFixed(2)}°)`);
    }
    assert.ok(Math.abs(dir.angleTo(d0) - AIM.BEND) < 1e-9, 'turned as far as it may');
    assert.ok(maxStep <= AIM.TURN / 60 + 1e-9, 'a little at a time');
    // a target nearly on the line: it turns right at it
    const near = V(Math.sin(2 * DEG), 0, -Math.cos(2 * DEG));
    const d2 = d0.clone();
    for (let i = 0; i < 30; i++) bendToward(d2, d0, near, AIM.TURN / 60);
    assert.ok(d2.angleTo(near) < 1e-6);
});

/** A small world: me with a hand at the origin pointing along −Z, zombies, other wizards. */
function world({ zombies = [], remotes = [], meAt = null } = {}) {
    const z = zombies.map(([id, x, y, zz]) => ({ id, isDead: false, group: { position: V(x, y, zz) }, stunTimer: 0 }));
    const rem = new Map(remotes.map(([id, x, y, zz]) => [id, { dead: false, position: V(x, y, zz), character: { group: new THREE.Group() }, handPose: () => ({ origin: V(x, y + 1.25, zz - 1), dir: V(0, 0, -1) }) }]));
    for (const [id, x, y, zz] of remotes) rem.get(id).character.group.position.set(x, y, zz);
    const meGroup = new THREE.Group();
    if (meAt) meGroup.position.copy(meAt); else meGroup.position.set(0, -1.25, 0.3);
    const hand = { o: V(0, 0, 0), d: V(0, 0, -1) };
    const stunned = [];
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: rem, zombies: z, zombieById: new Map(z.map((q) => [q.id, q])),
        animals: null, castleLife: null, books: null, spiders: null, terrain: null, sync: null, sound: null,
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {} },
        castOrigin: (side, out = new THREE.Vector3()) => out.copy(hand.o),
        character: {
            group: meGroup,
            isArmRaised: () => true,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(hand.o),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(hand.d),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.copy(hand.d),
        },
        combat: { dead: false, enabled: false, center: (out) => out.copy(meGroup.position).add(V(0, 0.6, 0)), shieldFactor: () => 0, stun: (t, by) => stunned.push(by) },
        levitation: { liftMe() {} },
    };
    const d = new Duel(g);
    d._drawBolt = () => {};
    d._burst = () => {};
    return { g, d, z, hand, stunned };
}

/** Fly the charges for `secs`; the fronts seen on the way. */
function run(d, secs = 3, dt = 1 / 30) {
    const fronts = [];
    for (let t = 0; t < secs; t += dt) {
        d.update(dt);
        for (const b of d.bolts.values()) fronts.push({ id: b.id, p: b.front.clone(), state: b.state, dir: b.dir.clone(), d0: b.d0.clone() });
    }
    return fronts;
}

test('a zombie right where the hand points is hit; the charge keeps to the line', () => {
    const { d, z, hand } = world({ zombies: [['z1', 0, -1, -12]] });
    const aim = d.pickSide(false);
    assert.equal(aim?.t.id, 'z1');
    d.cast('Stupefy', aim);
    const fronts = run(d, 2);
    assert.equal(z[0].stunTimer, DUEL.STUN_TIME, 'stunned');
    assert.equal(d.bolts.size, 0);
    for (const f of fronts) assert.ok(lineDist(hand.o, hand.d, f.p) < 0.05, 'on the line of the hand');
});

test('a zombie 16° off the line is not the target and is not hit: the charge flies straight past it', () => {
    const off = 16 * DEG;
    const { d, z, hand } = world({ zombies: [['z1', Math.sin(off) * 12, -1, -Math.cos(off) * 12]] });
    assert.equal(d.pickSide(false), null, 'nothing pointed at');
    const b = d.cast('Stupefy', null, 'right');
    assert.equal(b.tk, 'n');
    const fronts = run(d, 3);
    assert.equal(z[0].stunTimer, 0, 'not hit');
    assert.ok(fronts.length > 20);
    for (const f of fronts) assert.ok(lineDist(hand.o, hand.d, f.p) < 1e-6, 'exactly along the hand');
    assert.equal(d.bolts.size, 0, 'gone out of range');
});

test('a charge given a target far off the hand\'s line turns only a little and misses it (no hard turn)', () => {
    const off = 25 * DEG;
    const { d, z, hand } = world({ zombies: [['z1', Math.sin(off) * 10, -1, -Math.cos(off) * 10]] });
    d.cast('Stupefy', { side: 'right', t: { kind: 'z', id: 'z1' } });
    const fronts = run(d, 3);
    assert.equal(z[0].stunTimer, 0, 'not hit');
    for (const f of fronts) {
        assert.ok(f.dir.angleTo(f.d0) <= AIM.BEND + 1e-6, 'never more than ~12° off');
        const along = f.p.clone().sub(hand.o).dot(hand.d);
        assert.ok(lineDist(hand.o, hand.d, f.p) <= along * Math.tan(AIM.BEND) + 1e-6, 'within the narrow cone round the hand\'s line');
    }
});

test('a zombie a few degrees beside the line: the charge corrects its way a little and hits', () => {
    // the line passes 0.25 m beside its body, 12 m away
    const { d, z, hand } = world({ zombies: [['z1', BODY.ZOMBIE.R + 0.25, -1, -12]] });
    const aim = d.pickSide(false);
    assert.equal(aim?.t.id, 'z1');
    d.cast('Stupefy', aim);
    const fronts = run(d, 2);
    assert.equal(z[0].stunTimer, DUEL.STUN_TIME, 'hit');
    const maxOff = Math.max(...fronts.map((f) => f.dir.angleTo(f.d0)));
    assert.ok(maxOff > 0 && maxOff <= AIM.BEND + 1e-6, `a small correction (${(maxOff / DEG).toFixed(2)}°)`);
    for (const f of fronts) {
        const along = f.p.clone().sub(hand.o).dot(hand.d);
        assert.ok(lineDist(hand.o, hand.d, f.p) <= along * Math.tan(AIM.BEND) + 1e-6 && lineDist(hand.o, hand.d, f.p) < 1.0, 'close to the line of the hand');
    }
});

test('whatever the charge really touches on its way is hit: a zombie in front of the one pointed at', () => {
    const { d, z } = world({ zombies: [['far', 0, -1, -15], ['near', 0.5, -1, -7]] });
    // the line goes through the edge of «near» (0.5 m from its middle): nearer along the line — the target
    const aim = d.pickSide(false);
    assert.equal(aim?.t.id, 'near');
    d.cast('Stupefy', { side: 'right', t: { kind: 'z', id: 'far' } }); // (even when told the far one)
    run(d, 2);
    assert.equal(z[1].stunTimer, DUEL.STUN_TIME, 'the one in the way is hit');
    assert.equal(z[0].stunTimer, 0);
});

test('a free charge from another wizard flying through me hits me (my own computer decides); one past me does not', () => {
    const { d, stunned } = world({ meAt: V(0, -1.25, -10), remotes: [['foe', 0, -1.25, 5]] });
    d.remoteCast({ id: 'foe:1', by: 'foe', s: 'Stupefy', side: 'right', tk: 'n', tid: null, o: [0, 0, 3], d: [0, 0, -1] });
    run(d, 2);
    assert.deepEqual(stunned, ['foe'], 'hit');
    const w2 = world({ meAt: V(4, -1.25, -10), remotes: [['foe', 0, -1.25, 5]] });
    w2.d.remoteCast({ id: 'foe:2', by: 'foe', s: 'Stupefy', side: 'right', tk: 'n', tid: null, o: [0, 0, 3], d: [0, 0, -1] });
    run(w2.d, 3);
    assert.deepEqual(w2.stunned, [], '4 m beside me: missed');
});

test('my charge touching another wizard waits for his computer\'s word (his shield), then fizzles quietly; the caster\'s own body is never hit', () => {
    const { d } = world({ remotes: [['foe', 0, -1.25, -10]] });
    const aim = d.pickSide(true);
    assert.equal(aim?.t.kind, 'p');
    const b = d.cast('Stupefy', aim);
    run(d, 1);
    assert.equal(b.state, 'arrived', 'touched him: waiting');
    assert.ok(Math.abs(b.front.z + 10) < BODY.HERO.R + 0.1, 'at his body');
    run(d, 2.5);
    assert.equal(d.bolts.size, 0, 'no word: gone');
    // (my own body right behind my hand is not in the way)
    const w = world({ meAt: V(0, -1.25, 0.3) });
    const own = w.d.cast('Stupefy', null, 'right');
    w.d.update(1 / 30);
    assert.equal(own.state, 'flying');
});

test('a hand hanging down does not cast at what is below it; the raised hand pointing at a target does', () => {
    const { d, g } = world({ zombies: [['below', 0, -12, 0]] });
    g.character.getPointingDirection = (side, out = new THREE.Vector3()) => out.set(0, side === 'left' ? -1 : 0, side === 'left' ? 0 : -1);
    g.character.getHandDirection = g.character.getPointingDirection;
    g.character.isArmRaised = (side) => side === 'right';
    assert.equal(d.pickSide(false), null, 'the hanging left hand points at the zombie below — no');
    g.character.isArmRaised = () => true;
    assert.equal(d.pickSide(false)?.side, 'left', '(raised, it would)');
});

test('in flight the hand points as the player sees it: the body\'s forward tilt is taken out (hovering and cruising)', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    const interp = new PoseInterpreter();
    const pose = interp.process({ poseLandmarks: frame({ arms: 'forward' }).poseLandmarks }, { videoWidth: 640, videoHeight: 480 });
    const settle = () => { for (let i = 0; i < 60; i++) { ch.updateArmsLookAt(pose, 1 / 60); ch.update(1 / 60, null, false); } };
    ch.group.rotation.y = 0.7;
    settle();
    const ground = ch.getPointingDirection('right', new THREE.Vector3());
    assert.ok(ground.angleTo(ch.getHandDirection('right', new THREE.Vector3())) < 1e-9, 'on the ground: the hand\'s own direction');
    // «Паузин»: hovering, the body leans forward a little (0.15 rad)
    ch.setFlightTilt(0.15);
    settle();
    const hand = ch.getHandDirection('right', new THREE.Vector3());
    const point = ch.getPointingDirection('right', new THREE.Vector3());
    assert.ok(Math.abs(hand.angleTo(ground) - 0.15) < 0.02, `the forearm tips down with the body (${(hand.angleTo(ground) / DEG).toFixed(1)}°)`);
    assert.ok(point.angleTo(ground) < 0.01, `pointing: as on the ground (${(point.angleTo(ground) / DEG).toFixed(2)}°)`);
    // cruising like Superman (flat), the view climbing along the flight (0.2 rad)
    ch.setFlightTilt(1.35);
    ch.flightView = 0.2;
    settle();
    const cruise = ch.getPointingDirection('right', new THREE.Vector3());
    const pitch = (v) => Math.asin(v.y);
    assert.ok(Math.abs(pitch(cruise) - (pitch(ground) + 0.2)) < 0.02, 'along the view');
    assert.ok(Math.abs(Math.atan2(cruise.x, cruise.z) - Math.atan2(ground.x, ground.z)) < 0.02, 'the same way round');
    // an arm stretched at the camera is raised in flight too (flat like Superman)…
    assert.equal(ch.isArmRaised('right'), true);
    // …and an arm hanging straight along the body is not — standing, hovering or cruising
    // (in the world it then points backwards-down: it must not count as raised)
    const hangArm = () => {
        ch.rightArmAnchor.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, -1, 0));
        ch.rightElbowAnchor.quaternion.identity();
        ch.group.updateMatrixWorld(true);
    };
    for (const tilt of [0, 0.15, 1.35]) {
        ch.setFlightTilt(tilt);
        hangArm();
        assert.equal(ch.isArmRaised('right'), false, `tilt ${tilt}: a hanging arm is not raised`);
    }
    // another player's hero: the tilt comes as the body's rotation
    const remote = new VoxelCharacter(new THREE.Scene(), { remote: true });
    remote.flying = true;
    remote.group.rotation.x = -0.15;
    assert.ok(Math.abs(remote.aimTilt() - 0.15) < 1e-9);
});
