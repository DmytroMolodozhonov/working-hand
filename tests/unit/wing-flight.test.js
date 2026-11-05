// Flying on the wings of the potion by the arms' strokes (WingFlight.js): a run and strokes — up; standing — no flight; without strokes
// it goes down (high up the air's currents hold it, but never up); the arms spread at the ground — a soft landing; the wings folded
// (a dive) into the ground — it hurts; no mana; no wings / growing — no flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WingFlight, HERO_FLY, AIR, LAND, thermalAt, landingHurt } from '../../src/game/WingFlight.js';
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
    for (let i = 0; i < 30; i++) frame(g, dt, { run: 8 });
    let top = 0;
    for (let i = 0; i < 300; i++) { frame(g, dt, { run: 8, phase: (i * dt) % 0.45 }); top = Math.max(top, g.character.group.position.y - PLAYER_GROUND_OFFSET); }
    assert.ok(g.wingFlight.airborne, 'it flies');
    assert.ok(top > 12, `up high (${top.toFixed(1)} m)`);
    assert.equal(g.combat.fatigue, 50, 'no mana');
    assert.ok(g.wings.open > 0.8, 'the wings spread in flight');
    assert.ok(g.character.flightTilt > 0.3, 'the body leans forward');
});

test('without strokes it goes down; high up the currents hold it (≤ CALM m/s down) — but it never climbs on them', () => {
    const g = world();
    g.wings.grant();
    const ch = g.character;
    ch.group.position.y = PLAYER_GROUND_OFFSET + 60;
    ch.onGround = false; ch.verticalVelocity = -8;
    frame(g, dt);
    assert.ok(g.wingFlight.airborne, 'falling from high: the wings caught the air');
    g.arms.spread = true;
    g.wingFlight.st.vf = 10;
    let y0 = ch.group.position.y;
    for (let i = 0; i < 150; i++) frame(g, dt);
    const sink = (y0 - ch.group.position.y) / 5;
    assert.ok(sink > 0, 'it goes down');
    assert.ok(sink <= AIR.CALM + 0.3, `high up the currents hold it: ${sink.toFixed(2)} m/s`);
    // low down it sinks faster
    ch.group.position.y = PLAYER_GROUND_OFFSET + 10; g.wingFlight.st.vy = 0; g.wingFlight.st.vf = 4;
    y0 = ch.group.position.y;
    for (let i = 0; i < 30; i++) frame(g, dt);
    assert.ok((y0 - ch.group.position.y) > AIR.CALM, 'low down it sinks more');
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
