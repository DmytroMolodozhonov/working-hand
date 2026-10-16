import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { Knockdown, KNOCK, dizzyTime, fallStrength } from '../../src/game/Knockdown.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { heroBody } from '../../src/game/BodyContact.js';

const IMPACT_KD = 11;
// (the getting-up gesture tests below keep the old short lying time; the author's rule — 5 s at least
// + 1…5 s by chance — has its own test, with the real numbers)
const REAL = { min: KNOCK.MIN_DOWN, extra: [...KNOCK.EXTRA_DOWN] };
KNOCK.MIN_DOWN = 1.5; KNOCK.EXTRA_DOWN = [0, 0];
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

// ── a real, noisy camera: the nose jitters, a frame now and then is wild or missing ──
function noisyCam(seed = 7) {
    let r = seed, crouch = false;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    return (noseY, noseRel = 0.7) => {
        if (rnd() < 0.04) return { hasPose: false };                              // (a dropped frame)
        const y = noseY + (rnd() - 0.5) * 0.05 + (rnd() < 0.03 ? (rnd() - 0.5) * 0.2 : 0);
        if (!crouch) { if (y > 0.5) crouch = true; } else if (y < 0.45) crouch = false;  // (PoseInterpreter's hysteresis)
        return { hasPose: true, isCrouching: crouch, nose: { x: 0.5, y }, torso: { noseRel: noseRel + (rnd() - 0.5) * 0.06 } };
    };
}
const feed = (g, s, mk, dt = 1 / 30) => { for (let t = 0; t < s - 1e-9; t += dt) { g.currentPose = mk(); g.knock.update(dt); } };

test('getting up is easier with a real camera: a shallow squat counts, standing / nodding / jitter never do', () => {
    for (const base of [0.25, 0.15, 0.35]) {                                       // (any framing)
        const { g } = fakeGame(), cam = noisyCam(base * 100);
        feed(g, 1, () => cam(base));                                               // (upright before the fall)
        g.knock.knock({ dir: 'back' });
        feed(g, 20, () => cam(base));
        feed(g, 3, () => cam(base + 0.07 * Math.sin(performance.now())));          // (small nods / sways)
        for (let i = 0; i < 10; i++) { feed(g, 0.08, () => cam(base + 0.22)); feed(g, 0.4, () => cam(base)); } // (twitches)
        assert.equal(g.knock.state, 'down', `framing ${base}: no getting up without a squat`);
        feed(g, 0.3, () => cam(base + 0.21));                                      // (a shallow squat, ~30% less deep than before)
        feed(g, 0.4, () => cam(base + 0.02));
        assert.equal(g.knock.state, 'rising', `framing ${base}: up by a shallow squat`);
    }
});

test('a squat finished just before the lying time is up still counts; a much earlier one does not', () => {
    const { g } = fakeGame(), cam = noisyCam(3);
    feed(g, 1, () => cam(0.25));
    g.knock.knock({ dir: 'back' });
    feed(g, 0.45 + 1.5 - 0.75, () => cam(0.25));
    feed(g, 0.25, () => cam(0.48)); feed(g, 0.15, () => cam(0.25));               // (stood up ~0.35 s early)
    feed(g, 0.5, () => cam(0.25));
    assert.equal(g.knock.state, 'rising');
    const b = fakeGame(), cb = noisyCam(4);
    feed(b.g, 1, () => cb(0.25));
    b.g.knock.knock({ dir: 'back' });
    feed(b.g, 0.6, () => cb(0.25));
    feed(b.g, 0.25, () => cb(0.48)); feed(b.g, 0.15, () => cb(0.25));             // (~1 s early)
    feed(b.g, 2, () => cb(0.25));
    assert.equal(b.g.knock.state, 'down');
});

test('seated: a lighter bow is enough; a nod is not', () => {
    const { g } = fakeGame(), cam = noisyCam(9);
    g.knock.knock({ dir: 'front' });
    feed(g, 2.2, () => cam(0.3, 0.7));
    for (let i = 0; i < 6; i++) { feed(g, 0.3, () => cam(0.33, 0.48)); feed(g, 0.3, () => cam(0.3, 0.7)); }
    assert.equal(g.knock.state, 'down', 'nodding');
    feed(g, 0.3, () => cam(0.36, 0.22)); feed(g, 0.2, () => cam(0.3, 0.7));
    assert.equal(g.knock.state, 'rising');
});

test('the head spins after a fall: 5 s for a light one … 10 s for the hardest; not after the ice or a stun', () => {
    assert.equal(dizzyTime(0), 5); assert.equal(dizzyTime(1), 10); assert.equal(dizzyTime(3), 10);
    assert.ok(fallStrength({ v: IMPACT_KD }) === 0 && fallStrength({ v: 40 }) === 1);
    assert.ok(fallStrength({ drop: 5, speed: 13 }) === 0 && fallStrength({ drop: 25, speed: 30 }) === 1);
    for (const [s, dur] of [[0, 5], [0.5, 7.5], [1, 10]]) {
        const { g } = fakeGame();
        g.knock.knock({ dir: 'back', strength: s });
        const d0 = g.knock.dizzy;
        let t = 0;
        while (g.knock.dizzy > 0 && t < 20) { run(g, 0.1, STAND, 0.1); t += 0.1; }
        assert.ok(Math.abs(t - dur) < 0.15, `strength ${s}: ${t} s`);
        assert.ok(d0 > 0.3 && d0 <= 1);
    }
    const weak = fakeGame(), strong = fakeGame();
    weak.g.knock.knock({ strength: 0 }); strong.g.knock.knock({ strength: 1 });
    assert.ok(strong.g.knock.dizzy > weak.g.knock.dizzy * 2, 'a harder fall: stronger');
    const f = fakeGame(); f.g.combat.frozen = true; f.g.knock.knock({ strength: 1 });
    assert.equal(f.g.knock.dizzy, 0, 'frozen');
    const st = fakeGame(); st.g.combat.stunned = true; st.g.knock.knock({ strength: 1 });
    assert.equal(st.g.knock.dizzy, 0, 'stunned');
    const sp = fakeGame(); sp.g.knock.knock({ kind: 'Stupefy', strength: 1 });
    assert.equal(sp.g.knock.dizzy, 0, 'Stupefy');
    // a hard landing: dizzy by how hard; a blow by its speed
    const l = fakeGame();
    l.g.character.landing = { drop: 20, speed: 25, at: performance.now() + 1 };
    l.g.knock.update(1 / 60);
    assert.ok(l.g.knock.dizzyLeft > 9, `landing ${l.g.knock.dizzyLeft}`);
    const h = fakeGame();
    h.g.impact.apply({ v: new THREE.Vector3(0, 0, 14), spell: 'Thunderwave' });
    assert.ok(h.g.knock.dizzyLeft > 5 && h.g.knock.dizzyLeft < 7, `blow ${h.g.knock.dizzyLeft}`);
});

test('lying: looking round (down, aside, a tilted head) never counts as getting up', () => {
    const { g } = fakeGame(), cam = noisyCam(21);
    feed(g, 1, () => cam(0.25));
    g.knock.knock({ dir: 'back' });
    for (let i = 0; i < 20; i++) {
        feed(g, 0.5, () => cam(0.25 + 0.06, 0.42));                               // (the chin down: looking at the feet)
        feed(g, 0.5, () => cam(0.25 - 0.03, 0.85));                               // (the head back)
        feed(g, 0.5, () => cam(0.27, 0.6));                                       // (aside)
    }
    assert.equal(g.knock.state, 'down');
});

test('lying: the head turns further than standing and alone (blended, clamped)', async () => {
    const { lyingHead, LIE_GAIN } = await import('../../src/game/HeadTurn.js');
    assert.deepEqual(lyingHead(0.5, 0.2, 0), { yaw: 0.5, pitch: 0.2 });
    const l = lyingHead(0.5, 0.2, 1);
    assert.ok(Math.abs(l.yaw - 0.5 * LIE_GAIN.yaw) < 1e-9 && Math.abs(l.pitch - 0.2 * LIE_GAIN.pitch) < 1e-9);
    const h = lyingHead(0.5, 0.2, 0.5);
    assert.ok(h.yaw > 0.5 && h.yaw < l.yaw, 'blended: no jump');
    assert.equal(lyingHead(3, -3, 1).yaw, LIE_GAIN.yawMax);
    assert.equal(lyingHead(3, -3, 1).pitch, -LIE_GAIN.pitchMax);
});

test('the author: knocked down, one lies 5 s at least and 1…5 s more by chance (no getting up sooner)', () => {
    const keep = { min: KNOCK.MIN_DOWN, extra: KNOCK.EXTRA_DOWN };
    KNOCK.MIN_DOWN = REAL.min; KNOCK.EXTRA_DOWN = REAL.extra;
    try {
        assert.equal(KNOCK.MIN_DOWN, 5);
        for (let i = 0; i < 20; i++) {
            const { g } = fakeGame();
            g.knock.knock({ dir: 'back', down: 1.5 });
            assert.ok(g.knock.minDown >= 6 - 1e-9 && g.knock.minDown <= 10 + 1e-9, `minDown ${g.knock.minDown}`);
            run(g, 0.5, STAND); run(g, 4, STAND);
            run(g, 0.3, SQUAT); run(g, 0.1, STAND);
            assert.equal(g.knock.state, 'down', 'a squat at 5 s: still too early');
        }
        const { g } = fakeGame();
        g.knock.knock({ dir: 'back' });
        run(g, g.knock.minDown + 0.6, STAND);
        run(g, 0.3, SQUAT); run(g, 0.1, STAND);
        assert.equal(g.knock.state, 'rising', 'after it: a squat gets one up');
    } finally { KNOCK.MIN_DOWN = keep.min; KNOCK.EXTRA_DOWN = keep.extra; }
});
