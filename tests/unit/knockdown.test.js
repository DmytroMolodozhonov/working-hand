import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { Knockdown, KNOCK } from '../../src/game/Knockdown.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { heroBody } from '../../src/game/BodyContact.js';

const STAND = { hasPose: true, isCrouching: false, torso: { noseRel: 0.6 } };
const SQUAT = { hasPose: true, isCrouching: true, torso: { noseRel: 0.6 } };

function fakeGame() {
    const voice = [];
    const g = {
        character: new VoxelCharacter(new THREE.Scene()),
        knockback: new THREE.Vector3(),
        fx: { shake: 0 },
        hud: { setVoice: (t) => voice.push(t), setStatus() {}, flashColor() {} },
        combat: { dead: false, stunned: false, frozen: false, shield: null, shieldFactor: () => 0, center: (o = new THREE.Vector3()) => o.copy(g.character.group.position), die() { g.combat.dead = true; } },
        currentPose: STAND,
        localId: 'me',
    };
    g.knock = new Knockdown(g);
    g.impact = new BodyImpact(g);
    return { g, voice };
}
const run = (g, s, pose, dt = 1 / 30) => { for (let t = 0; t < s - 1e-9; t += dt) { g.currentPose = pose; g.knock.update(dt); g.character.update(dt, null, true); } };

test('knocked down: falls, lies, and gets up only with a real squat after 1.5 s', () => {
    const { g } = fakeGame();
    const k = g.knock;
    k.knock({ dir: 'back' });
    assert.equal(k.state, 'falling');
    assert.equal(g.character.knockedDown, true);
    assert.equal(g.character.fallDir, 'back');
    assert.equal(k.netCode(), 2);
    run(g, 0.5, STAND);
    assert.equal(k.state, 'down');
    run(g, 0.5, STAND);
    run(g, 0.3, SQUAT); run(g, 0.2, STAND);
    assert.equal(k.state, 'down', 'stood up too early: does not count');
    run(g, 0.6, STAND);
    run(g, 0.1, SQUAT); run(g, 0.2, STAND);
    assert.equal(k.state, 'down', 'a twitch is no squat');
    run(g, 0.3, SQUAT); run(g, 0.1, STAND);
    assert.equal(k.state, 'rising');
    assert.equal(g.character.knockedDown, false);
    assert.equal(k.netCode(), 0);
    run(g, KNOCK.RISE_T + 0.05, STAND);
    assert.equal(k.state, 'up');
});

test('getting up seated: a deep bow and back', () => {
    const { g } = fakeGame();
    g.knock.knock({ dir: 'front' });
    run(g, 2.2, STAND);
    run(g, 0.3, { hasPose: true, isCrouching: false, torso: { noseRel: 0.1 } });
    run(g, 0.1, STAND);
    assert.equal(g.knock.state, 'rising');
});

test('stunned on the ground: no getting up until the stun ends', () => {
    const { g } = fakeGame();
    g.knock.knock({ dir: 'back' });
    g.combat.stunned = true;
    for (let i = 0; i < 5; i++) { run(g, 0.3, SQUAT); run(g, 0.3, STAND); }
    assert.equal(g.knock.state, 'down');
    g.combat.stunned = false;
    run(g, 0.3, SQUAT); run(g, 0.1, STAND);
    assert.equal(g.knock.state, 'rising');
});

test('no camera: up by itself after 6 s; a camera without the gesture keeps it down', () => {
    const { g } = fakeGame();
    g.knock.knock({ dir: 'left' });
    let t = 0;
    while (g.knock.state !== 'rising' && t < 10) { run(g, 0.05, null, 0.05); t += 0.05; }
    assert.ok(t >= 6.0 && t <= 6.6, `rose at ${t}`);
    const b = fakeGame();
    b.g.knock.knock({ dir: 'left' });
    run(b.g, 20, STAND, 0.1);
    assert.equal(b.g.knock.state, 'down');
});

test('a second knock while down: keeps lying (not a new fall), longer', () => {
    const { g } = fakeGame();
    g.knock.knock({ dir: 'back' });
    run(g, 1.2, STAND);
    g.knock.knock({ dir: 'front', down: 2.5 });
    assert.equal(g.knock.state, 'down');
    assert.ok(g.knock.minDown >= 2.5 + 0.7 - 1e-6, `minDown ${g.knock.minDown}`);
});

test('a high fall knocks over; a low one, water or a gentle release do not', () => {
    const cases = [[{ drop: 6, speed: 15 }, 'down'], [{ drop: 3, speed: 7.7 }, 'up']];
    for (const [L, want] of cases) {
        const { g } = fakeGame();
        g.character.landing = { ...L, at: performance.now() + 1 };
        g.knock.update(1 / 60);
        assert.equal(g.knock.state, want, JSON.stringify(L));
    }
    const w = fakeGame();
    w.g.character.swimY = 0;
    w.g.character.landing = { drop: 8, speed: 18, at: performance.now() + 1 };
    w.g.knock.update(1 / 60);
    assert.equal(w.g.knock.state, 'up', 'in water');
    const s = fakeGame();
    s.g.impact.gentleUntil = performance.now() + 3000;
    s.g.character.landing = { drop: 8, speed: 18, at: performance.now() + 1 };
    s.g.knock.update(1 / 60);
    assert.equal(s.g.knock.state, 'up', 'set down gently');
});

test('a stagger: the body leans and the legs step, others see it; over in under a second', () => {
    const { g } = fakeGame();
    g.knock.stagger({ dir: 'back', v: 6 });
    assert.equal(g.knock.state, 'stagger');
    assert.ok(g.character.stepping > 0 && g.character.staggerLean > 0);
    const pose = g.character.serializePose();
    assert.ok(Array.isArray(pose.sg) && pose.sg[0] > 0, 'sent with the pose');
    assert.ok(pose.run >= 0, 'the legs step');
    run(g, 0.2, STAND);
    assert.ok(g.character.group.rotation.x > 0.05, 'leaning back');
    run(g, 0.8, STAND);
    assert.equal(g.knock.state, 'up');
    run(g, 1.5, STAND);
    assert.equal(g.character.group.rotation.x, 0, 'upright again (and the pitch let go exactly)');
});

test('the hero lies the way it fell: on the back, on a side; others are told', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.knockedDown = true; ch.fallDir = 'back';
    for (let i = 0; i < 60; i++) ch.update(1 / 60, null, true);
    assert.ok(Math.abs(ch.group.rotation.x - 1.45) < 0.05, `x ${ch.group.rotation.x}`);
    assert.ok(Math.abs(ch.group.rotation.z) < 0.01);
    assert.equal(ch.serializePose().kd, 2);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ch.group.quaternion);
    assert.ok(Math.hypot(up.x, up.z) >= 0.5, 'BodyContact sees a lying body (a capsule along the ground)');
    const body = heroBody(ch.group.position.x, ch.group.position.y, ch.group.position.z, ch.group.rotation.y, up);
    assert.ok(Math.hypot(body.bx - body.ax, body.bz - body.az) > 2, 'the lying body is still solid, from the legs to the head');
    ch.fallDir = 'right';
    for (let i = 0; i < 60; i++) ch.update(1 / 60, null, true);
    assert.ok(Math.abs(ch.group.rotation.z + 1.4) < 0.05, `z ${ch.group.rotation.z}`);
    ch.knockedDown = false;
    for (let i = 0; i < 120; i++) ch.update(1 / 60, null, true);
    assert.equal(ch.group.rotation.x, 0);
    assert.ok(Math.abs(ch.group.rotation.z) < 0.01);
});

test('landing is measured: how far the body fell and how fast it hit the ground', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    const ground = { groundY: () => -0.5 };
    ch.group.position.y = -0.5 + 2 + 8;
    for (let i = 0; i < 200 && !ch.landing; i++) ch.update(1 / 120, ground, true);
    assert.ok(ch.landing, 'landed');
    assert.ok(Math.abs(ch.landing.drop - 8) < 0.3, `drop ${ch.landing.drop}`);
    assert.ok(Math.abs(ch.landing.speed - 17.9) < 1, `speed ${ch.landing.speed}`);
});

test('my body: a blow classified (stagger / knockdown / nothing), pushed and its head kicked', () => {
    const { g } = fakeGame();
    assert.equal(g.impact.apply({ v: new THREE.Vector3(0, 0, 2) }), 'none');
    assert.equal(g.impact.apply({ v: new THREE.Vector3(0, 0, 6) }), 'stagger');
    assert.ok(g.knockback.z > 7, 'the push slides the body');
    assert.equal(g.knock.state, 'stagger');
    assert.equal(g.impact.apply({ v: new THREE.Vector3(0, 0, 14), spell: 'Thunderwave' }), 'knockdown');
    assert.equal(g.knock.state, 'falling');
    assert.equal(g.knock.dir, 'back', 'pushed from the front: on the back');
    // a blow on the head jolts it
    const b = fakeGame();
    b.g.impact.apply({ v: new THREE.Vector3(0, 0, 1.75), head: { lp: [0, 0.1, -0.6], dir: [0, 0, 1], speed: 7 } });
    let peak = 0;
    for (let i = 0; i < 12; i++) peak = Math.max(peak, b.g.impact.step(1 / 60).pitch);
    assert.ok(peak > 0.1, `head pitch ${peak}`);
    assert.equal(b.g.knock.state, 'up');
    // the dome: nothing moves me; frozen: a shove shatters the statue
    const d = fakeGame();
    d.g.combat.shield = { type: 2, left: 3 };
    assert.equal(d.g.impact.apply({ v: new THREE.Vector3(0, 0, 30), from: new THREE.Vector3(0, 0, -5) }), 'blocked');
    assert.equal(d.g.knockback.length(), 0);
    const f = fakeGame();
    f.g.combat.frozen = true;
    assert.equal(f.g.impact.apply({ v: new THREE.Vector3(0, 0, 4) }), 'shatter');
    assert.equal(f.g.combat.dead, true);
});
