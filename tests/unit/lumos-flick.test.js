import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// (No gesture throws the Lumos any more — the author: only «Ahead» sends the light on.)
test('Lumos: no throwing by gesture — the module has no throw detector', async () => {
    const hr = await import('../../src/game/HandRelease.js');
    assert.equal(hr.LumosThrow, undefined);
    assert.equal(hr.LUMOS_THROW, undefined);
});

test('«Lightning Writing»: another player\'s drawing comes as points — joined into lines, broken where they broke it', async () => {
    const { WandMagic } = await import('../../src/game/WandMagic.js');
    const added = [];
    const game = { scene: { add: (o) => added.push(o), remove: () => {} } };
    const w = new WandMagic(game);
    w.remoteDraw('p1', 0xff8800, [[0, 1, 0], [0.1, 1, 0], [0.2, 1.05, 0], null, [5, 1, 0], [5.1, 1, 0]]);
    const e = w.remoteDrawings.get('p1');
    assert.equal(e.lines.length, 3, 'two strokes, a break, one stroke');
    // the next batch goes on from the last point
    w.remoteDraw('p1', 0xff8800, [[5.2, 1, 0]]);
    assert.equal(e.lines.length, 4);
    // garbage from the network draws nothing
    w.remoteDraw('p1', 0xff8800, [['x', 1, 0], [1e9]]);
    assert.equal(e.lines.length, 4);
});

test('a thrown Lumos is seen flying: it slows down by itself, bounces off a wall instead of sticking to it, and hangs in the air', async () => {
    const { WandMagic } = await import('../../src/game/WandMagic.js');
    // a wall 3 m ahead (z < -3), the ground below y = 0
    const blocked = (x, y, z) => z < -3 || y < 0;
    const game = { scene: { add() {}, remove() {} }, collision: { pointBlocked: blocked } };
    const w = new WandMagic(game);
    w._flick = 0;
    const throwOne = (wm) => { const t = { glow: { position: new THREE.Vector3(), scale: { setScalar() {} }, material: {} }, pos: new THREE.Vector3(0, 1.5, 0), vel: new THREE.Vector3(0, 0, -LUMOS.THROW_SPEED), flown: 0, stuck: false, bounces: 0, age: 0, level: 2, mine: true }; wm.thrown.push(t); return t; };
    const t = throwOne(w);
    const path = [];
    for (let i = 0; i < 300 && !t.stuck; i++) { w._flyThrown(t, 1 / 60); path.push(t.pos.z); }
    // not a jump: after a tenth of a second it is still on its way to the wall
    assert.ok(path[5] > -2, 'still flying after 0.1 s: ' + path[5].toFixed(2));
    assert.ok(Math.min(...path) > -3.01, 'never inside the wall');
    assert.ok(t.bounces >= 1, 'it bounced off the wall');
    assert.ok(t.pos.z > Math.min(...path) + 0.3, 'and came back off it (not stuck on it)');
    // in the open it slows down and stops by itself, short of its range
    const open = new WandMagic({ scene: { add() {}, remove() {} }, collision: { pointBlocked: () => false } });
    open._flick = 0;
    const o = throwOne(open);
    for (let i = 0; i < 60 * 15 && !o.stuck; i++) open._flyThrown(o, 1 / 60);
    assert.ok(o.stuck && o.flown > 15 && o.flown <= LUMOS.THROW_RANGE + 0.5, `drifted ${o.flown.toFixed(1)} m and hangs there`);
});

// ---- the Lumos' modes and «Lumos Following»
import { LUMOS, WandMagic, FOLLOW, followStep } from '../../src/game/WandMagic.js';
// (the glow's picture is painted on a canvas: a stand-in one here)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
function lumosGame() {
    const scene = new THREE.Scene();
    const voice = [];
    const ch = { group: new THREE.Group(), _planar: { x: 0, z: 0 }, isArmRaised: () => true, getHandDirection: (s, o) => o.set(0, 0, -1), getHandWorldPosition: (s, o) => o.set(0.5, 1.5, -0.5) };
    const g = {
        scene, character: ch, config: { mode: 'creative' }, hud: { setVoice: (t) => voice.push(t) }, items: { heldOf: () => null, wand: null, held: {} },
        combat: { enabled: true, fatigue: 100, check: () => null, pay(n) { this.fatigue -= { LumosFlashlight: 3, LumosAhead: 3, LumosFollowing: 15, Lumos: 2 }[n] || 0; } },
        collision: { pointBlocked: () => false }, remotes: new Map(), dom: 'right', voice,
    };
    return g;
}

test('«Flashlight»: only while the Lumos shines; a narrow beam where the wand points (the system\'s one spot light); again — the plain light', () => {
    const g = lumosGame(), W = new WandMagic(g);
    const lights = () => { let n = 0; g.scene.traverse((o) => { if (o.isLight) n++; }); return n; };
    const n0 = lights();
    assert.equal(W.cast('LumosFlashlight', true), null, 'no Lumos: nothing');
    W.cast('Lumos', true);
    assert.equal(W.cast('LumosFlashlight', true), 'LumosFlashlight');
    assert.equal(g.combat.fatigue, 100 - 2 - 3);
    W.update(1 / 60);
    assert.ok(W.beam.intensity > 0 && W.beamCone.visible, 'the beam shines');
    assert.ok(W.beam.angle < 0.3, 'narrow');
    assert.equal(lights(), n0, 'no new light in the scene (the shaders stay)');
    W._said.LumosFlashlight = -1e9;
    W.cast('LumosFlashlight', true);
    W.update(1 / 60);
    assert.equal(W.beam.intensity, 0, 'said again: the plain light');
});

test('«Ahead»: the light flies where the wand points; «Lumos Following» floats beside me smoothly; «Нокс» puts out all of it', () => {
    const g = lumosGame(), W = new WandMagic(g);
    assert.equal(W.cast('LumosAhead', true), null, 'no Lumos: nothing');
    W.cast('Lumos', true);
    assert.equal(W.cast('LumosAhead', true), 'LumosAhead');
    assert.equal(W.light, null, 'the light left the wand');
    assert.ok(W.thrown[0] && W.thrown[0].vel.z < -5, 'flying ahead');
    // following
    assert.equal(W.cast('LumosFollowing', true), 'LumosFollowing');
    assert.ok(W.follow);
    for (let i = 0; i < 180; i++) W.update(1 / 60);
    const t = W._followTarget(new THREE.Vector3());
    assert.ok(W.follow.pos.distanceTo(t) < 0.5, 'by me now: ' + W.follow.pos.distanceTo(t));
    // I run off 10 m: it comes after me smoothly — never a jump
    let maxStep = 0;
    for (let i = 0; i < 120; i++) { g.character.group.position.z -= 9.75 / 60; g.character._planar.z = -9.75; const p = W.follow.pos.clone(); W.update(1 / 60); maxStep = Math.max(maxStep, p.distanceTo(W.follow.pos)); }
    assert.ok(maxStep < FOLLOW.MAX_SPEED / 60 + 1e-6, 'no jumps');
    assert.ok(W.follow.pos.z < g.character.group.position.z - 0.3, 'running: a little ahead, lighting the way');
    // «Нокс»: all of it
    W._nox(false);
    assert.equal(W.follow, null);
    assert.equal(W.thrown.filter((x) => x.mine).length, 0);
});

test('followStep: a damped spring — it reaches its place without wobbling round it', () => {
    const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 }, target = { x: 3, y: 0, z: 0 };
    let over = 0;
    for (let i = 0; i < 240; i++) { followStep(p, v, target, 1 / 60); over = Math.max(over, p.x - 3); }
    assert.ok(Math.abs(p.x - 3) < 0.02, 'there: ' + p.x);
    assert.ok(over < 0.1, 'hardly past it: ' + over);
});
