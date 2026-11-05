// Flying on the wings of the potion by the arms' strokes (WingFlight.js): a run and strokes — up; standing — no flight; without strokes
// it goes down (up in the clouds the wings carry longer, but they always tire — 05.11); the torso steers; the arms spread at the ground — a soft landing; the wings folded
// (a dive) into the ground — it hurts; no mana; no wings / growing — no flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WingFlight, HERO_FLY, AIR, LAND, thermalAt, landingHurt, wingStep, cloudAt, WING, TAKEOFF } from '../../src/game/WingFlight.js';
import { HeroWings } from '../../src/game/HeroWings.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';

test('the rules: the currents only high up, never a climb; a soft touch nothing, a hard one hurts and knocks down', () => {
    assert.equal(thermalAt(5), 0);
    assert.equal(thermalAt(100), 1);
    assert.equal(landingHurt(-2, 4).dmg, 0, 'a soft landing');
    assert.equal(landingHurt(-LAND.SAFE_VY, 0).dmg, 0);
    const hard = landingHurt(-20, 18);
    assert.ok(hard.dmg >= 25 && hard.knock, `a dive into the ground: ${hard.dmg}`);
    assert.ok(HERO_FLY.takeoff > 2, 'a run before the take-off');
});

function world() {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(0, PLAYER_GROUND_OFFSET, 0);
    ch.onGround = true;
    let spread = false, down = false;
    ch.isTPose = () => spread; ch.isArmsSpread = () => spread; ch.isArmRaised = () => !down;
    const hurt = [];
    const g = {
        config: { mode: 'freeworld' }, character: ch, scene, smoothHead: { pitch: 0 },
        collision: { groundY: () => 0, groundAt: () => 0, pointBlocked: () => false },
        combat: { enabled: true, hp: 100, damage: (d) => hurt.push(d), dead: false, fatigue: 50 },
        hud: { setVoice() {} }, knock: { down: false, knock() {} }, hurt,
        arms: { set spread(v) { spread = v; }, set down(v) { down = v; } },
    };
    g.wings = new HeroWings(g);
    g.wingFlight = new WingFlight(g);
    return g;
}
/** One frame: the hero runs at `run` m/s (on the ground), a stroke when `stroke` (both hands down fast, then still). */
function frame(g, dt, { run = 0, phase = 0 } = {}) {
    const ch = g.character;
    if (!g.wingFlight.airborne) ch.group.position.z -= run * dt;
    const down = phase > 0 && phase < 0.15 ? -7 : 0; // (m/s: both hands come down together)
    ch.handRelVelocity.left.set(0, down, 0); ch.handRelVelocity.right.set(0, down, 0);
    g.wingFlight.update(dt);
    g.wings.update(dt);
}
const dt = 1 / 30;

test('no wings, or still growing: strokes do nothing', () => {
    const g = world();
    for (let i = 0; i < 200; i++) frame(g, dt, { run: 8, phase: (i * dt) % 0.5 });
    assert.equal(g.wingFlight.airborne, false);
    g.wings.start();
    for (let i = 0; i < 200; i++) frame(g, dt, { run: 8, phase: (i * dt) % 0.5 });
    assert.equal(g.wingFlight.airborne, false, 'the wings still growing');
});

test('standing still the strokes only lift the heels; a run and strokes — up into the air, higher with more strokes; no mana spent', () => {
    const g = world();
    g.wings.grant();
    for (let i = 0; i < 90; i++) frame(g, dt, { run: 0, phase: (i * dt) % 0.45 });
    assert.equal(g.wingFlight.airborne, false, 'no run — no take-off');
    for (let i = 0; i < 45; i++) frame(g, dt, { run: 8 }); // (a real run first: TAKEOFF.RUN_T)
    let top = 0;
    for (let i = 0; i < 300; i++) { frame(g, dt, { run: 8, phase: (i * dt) % 0.45 }); top = Math.max(top, g.character.group.position.y - PLAYER_GROUND_OFFSET); }
    assert.ok(g.wingFlight.airborne, 'it flies');
    assert.ok(top > 12, `up high (${top.toFixed(1)} m)`);
    assert.equal(g.combat.fatigue, 50, 'no mana');
    assert.ok(g.wings.open > 0.8, 'the wings spread in flight');
    assert.ok(g.character.flightTilt > 0.3, 'the body leans forward');
});

// (the author 05.11: «нужно периодически махать крыльями, иначе он упадёт… чем выше, тем легче, но выше — это прямо в облаках… и даже
// очень высоко махать нужно» — the old rule «high up the currents hold it at ≤ CALM m/s» let one fly on without a stroke and never
// come down: replaced by wingStep's `hold`, which always runs out)
test('without strokes it always goes down — in the clouds the wings carry longer, but they tire there too; never a climb on them', () => {
    const sinkAfter = (alt, secs) => {
        const st = { air: true, vf: 12, vy: 0, since: 0 };
        let y = 0, top = 0;
        for (let t = 0; t < secs; t += dt) { wingStep(st, HERO_FLY, { stroke: 0, arms: 'spread', alt, dive: 0 }, dt); y += st.vy * dt; top = Math.max(top, y); }
        return { y, vy: st.vy, top };
    };
    const lowEarly = sinkAfter(10, 3), highEarly = sinkAfter(WING.CLOUD_FULL + 20, 3);
    assert.ok(highEarly.y > lowEarly.y, `in the clouds it sinks slower: ${highEarly.y.toFixed(1)} vs ${lowEarly.y.toFixed(1)}`);
    assert.ok(highEarly.top < 0.01 && lowEarly.top < 0.01, 'never a climb without a stroke');
    const highLate = sinkAfter(WING.CLOUD_FULL + 20, 30);
    assert.ok(highLate.vy < -5, `even in the clouds: no strokes — it falls (${highLate.vy.toFixed(1)} m/s)`);
    const lowLate = sinkAfter(10, 8);
    assert.ok(lowLate.vy < -5, `low down it falls soon (${lowLate.vy.toFixed(1)} m/s)`);
    assert.ok(cloudAt(10) === 0 && cloudAt(WING.CLOUD_FULL) === 1);
});

test('the torso steers as in «Флайн»: leaning forward — down (faster), back — up on its speed; the wings: fewer strokes up high', () => {
    const run = (dive, secs = 2) => { const st = { air: true, vf: 14, vy: 0, since: 0 }; let y = 0; for (let t = 0; t < secs; t += dt) { wingStep(st, HERO_FLY, { stroke: 0, arms: null, alt: 80, dive }, dt); y += st.vy * dt; } return { y, vf: st.vf }; };
    const flat = run(0), fwd = run(1), back = run(-1);
    assert.ok(fwd.y < flat.y - 3 && fwd.vf > flat.vf, `a dive: ${fwd.y.toFixed(1)} / ${flat.y.toFixed(1)}`);
    assert.ok(back.y > flat.y + 3 && back.vf < flat.vf, `leaning back: up, the speed spent (${back.y.toFixed(1)})`);
    // the WingFlight reads the torso's lean from its pose at the take-off (Flight.steering's rule)
    const g = world();
    g.wings.grant();
    const wf = g.wingFlight;
    wf.st.air = true;
    for (let i = 0; i < 25; i++) wf._steer({ lateral: 0, noseRel: 0.5, depth: null }, 0, dt);
    assert.ok(wf._steer({ lateral: 0, noseRel: 0.2, depth: null }, 0, dt).dive > 0.3, 'the head and shoulders forward: a dive');
    assert.ok(wf._steer({ lateral: 0, noseRel: 0.8, depth: null }, 0, dt).dive < -0.3, 'back: up');
    assert.ok(Math.abs(wf._steer({ lateral: 0.3, noseRel: 0.5, depth: null }, 0, dt).turn) > 0.3, 'sideways: a turn');
});

test('a soft landing with the arms spread does not hurt; a dive with the wings folded into the ground hurts', () => {
    const soft = world();
    soft.wings.grant();
    const ch = soft.character;
    ch.group.position.y = PLAYER_GROUND_OFFSET + 8; ch.onGround = false; ch.verticalVelocity = -7;
    frame(soft, dt);
    soft.arms.spread = true;
    for (let i = 0; i < 400 && soft.wingFlight.airborne; i++) frame(soft, dt);
    assert.equal(soft.wingFlight.airborne, false, 'landed');
    assert.deepEqual(soft.hurt, [], 'not hurt');
    const hard = world();
    hard.wings.grant();
    const c2 = hard.character;
    c2.group.position.y = PLAYER_GROUND_OFFSET + 40; c2.onGround = false; c2.verticalVelocity = -9;
    frame(hard, dt);
    hard.arms.down = true; // (the wings folded: a stoop)
    hard.smoothHead.pitch = -0.6; // (the head bowed: a dive)
    for (let i = 0; i < 600 && hard.wingFlight.airborne; i++) frame(hard, dt);
    assert.equal(hard.wingFlight.airborne, false);
    assert.ok(hard.hurt.length && hard.hurt[0] > 0, `hurt: ${hard.hurt}`);
});

test('dead or knocked down in the air: the wings let go — the body falls by itself', () => {
    const g = world();
    g.wings.grant();
    const ch = g.character;
    ch.group.position.y = PLAYER_GROUND_OFFSET + 30; ch.onGround = false; ch.verticalVelocity = -8;
    frame(g, dt);
    assert.ok(g.wingFlight.airborne);
    g.knock.down = true;
    frame(g, dt);
    assert.equal(g.wingFlight.airborne, false);
    assert.equal(ch.flying, false);
});

// (the author 05.11: «очень легко взлететь… ты должен прям разбежаться; нельзя просто взмахнуть руками и сразу полететь»)
test('no take-off from a few steps and a stroke: a real run (≥ 6 m/s for over a second) and two strong strokes are needed', () => {
    const g = world();
    g.wings.grant();
    for (let i = 0; i < 12; i++) frame(g, dt, { run: 5 }); // (a few quick steps, slower than a run)
    for (let i = 0; i < 30; i++) frame(g, dt, { run: 5, phase: (i * dt) % 0.45 });
    assert.equal(g.wingFlight.airborne, false, 'a jog and strokes: no');
    const h = world();
    h.wings.grant();
    for (let i = 0; i < 15; i++) frame(h, dt, { run: 8 }); // (half a second of running)
    frame(h, dt, { run: 8, phase: 0.05 });
    assert.equal(h.wingFlight.airborne, false, 'a short run and one stroke: no');
    assert.ok(TAKEOFF.RUN_T >= 1 && HERO_FLY.takeoff >= 6);
});
