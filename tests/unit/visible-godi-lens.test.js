// «Visible Godi», the LENS: in the open air (no wall within reach of the gaze) the cloud is a magnifying glass. The mode
// by the first solid thing, the enlargement (×3 by default, denser/longer → more, never over ×8), the cloud nearest the
// gaze, the lens ray (a wall on the way stays a wall, a chink is passed), the +5 cells once, the picture (own small
// picture, 24 times a second, narrow view, the steam hidden in the pass, freed after) and nothing without steam.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SEE, LENS, VISIBLE_TARGETS, modeOf, lensZoom, lensCloud, traceLens, lensNear, lensFar, traceView, puffStrength } from '../../src/game/VisibleGodi.js';
import { SeeThroughFx } from '../../src/fx/SeeThroughFx.js';
import { SteamBodies } from '../../src/fx/SteamFx.js';
import { VisibleGodi } from '../../src/game/VisibleGodi.js';
import { firstSpellGain } from '../../src/game/Mana.js';

const O = { x: 0, y: 0, z: 0 }, D = { x: 0, y: 0, z: 1 };
const wallAt = (z0, n = 1) => (x, y, z) => (z >= z0 && z < z0 + n ? 7 : 0);
const puff = (x, y, z, t0, seed) => ({ x, y, z, t0, seed });

test('lens: the mode comes from the first solid thing on the gaze (within reach — the wall look, as before; farther or none — the lens)', () => {
    assert.equal(modeOf(traceView(() => 0, O, D)), 'lens', 'open air');
    assert.equal(modeOf(traceView(wallAt(20), O, D)), 'lens', 'a wall 20 m away is not «возле стены»');
    assert.equal(modeOf(traceView(wallAt(SEE.REACH + 0.5), O, D)), 'lens', 'just past the reach');
    assert.equal(modeOf(traceView(wallAt(2), O, D)), 'wall', 'a wall within reach: through the wall, unchanged');
    assert.equal(modeOf({ state: 'blocked' }), 'blocked');
    assert.equal(modeOf(null), 'lens');
});

test('lens: the enlargement — ×3 by default, more for a thick cloud and a long jet, never over ×8 or under ×2', () => {
    assert.equal(LENS.ZOOM_DEFAULT, 3);
    assert.equal(LENS.ZOOM_MAX, 8);
    assert.equal(lensZoom(1, 0, 99), 3, 'one puff: ×3');
    assert.ok(lensZoom(1, 0, 0) >= LENS.ZOOM_MIN && lensZoom(1, 0, 0) < 2.2, 'a puff just born: the glass is still opening');
    let prev = 0;
    for (let n = 1; n <= 40; n++) { const z = lensZoom(n, 0, 99); assert.ok(z >= prev - 1e-9, 'denser never less'); assert.ok(z <= 8 + 1e-9); prev = z; }
    prev = 0;
    for (let s = 0; s <= 20; s += 0.5) { const z = lensZoom(3, s, 99); assert.ok(z >= prev - 1e-9, 'longer never less'); prev = z; }
    assert.ok(lensZoom(8, 3, 99) > 3 && lensZoom(8, 3, 99) < 8, 'in between: smooth, not a jump');
    assert.equal(lensZoom(LENS.DENSE_N, 99, 99), 8, 'thick + long: ×8');
    assert.ok(lensZoom(500, 1e6, 99) <= 8, 'nothing goes over ×8');
    assert.ok(lensZoom(-3, -5, -5) >= 2, 'nonsense stays inside the range');
    // a step of one puff changes the zoom by less than one unit (smooth)
    for (let n = 1; n < 30; n++) assert.ok(lensZoom(n + 1, 4, 99) - lensZoom(n, 4, 99) < 0.6);
});

test('lens: the window is the cloud nearest to the gaze; puffs chained together are one cloud; nothing without steam', () => {
    const out = {};
    assert.equal(lensCloud([], 10, O, D, out), null, 'no steam: no lens');
    assert.equal(lensCloud([puff(0, 0, -4, 0, 1)], 10, O, D, out), null, 'behind the gaze: no lens');
    assert.equal(lensCloud([puff(0, 0, 4, 9.9, 1), puff(0, 0, 4, 9.95, 2)].map((p) => ({ ...p, t0: 9.99 })), 10, O, D, out), null, 'puffs just born (nearly nothing yet) are not a glass');
    // a cloud of five puffs 0.7 m apart straight ahead and a lone puff to the side
    const cloud = [0, 1, 2, 3, 4].map((i) => puff(0.7 * i - 1.4, 0, 4, 0, 10 + i));
    const side = puff(6, 0, 4, 0, 99); // (about 56° off the gaze)
    const r = lensCloud([side, ...cloud], 8, O, D, out);
    assert.ok(r);
    assert.equal(r.n, 5, 'the five are one cloud, the lone one is not part of it');
    assert.ok(!r.seeds.has(99));
    assert.ok(Math.abs(r.x) < 0.2 && Math.abs(r.z - 4) < 0.01, 'the centre is the cloud\'s middle');
    assert.ok(r.zoom > 3 && r.zoom <= 8);
    // turn the gaze to the side: the lone puff becomes the window
    const r2 = lensCloud([side, ...cloud], 8, O, { x: 0.8, y: 0, z: 0.6 }, out);
    assert.equal(r2.n, 1);
    assert.equal(r2.seed, 99);
    assert.ok(Math.abs(r2.zoom - 3) < 1e-9, 'a lone puff: ×3');
    // a faded-out puff is not a glass any more
    assert.equal(lensCloud([puff(0, 0, 4, 8 - SEE.PUFF_LIFE, 1)], 8, O, D, out), null);
    assert.ok(puffStrength(SEE.PUFF_LIFE) < 0.01);
    // a chain longer than the whole sheet of steam stays within what the steam can make
    const chain = Array.from({ length: SEE.OWNER_MAX }, (_, i) => puff(0.7 * (i % 8), 0.7 * Math.floor(i / 8), 4 + i * 0.001, 0, 200 + i));
    const big = lensCloud(chain, 9, O, D, out);
    assert.ok(big.n <= SEE.OWNER_MAX && big.zoom <= 8);
});

test('lens: the lens ray — a wall on the way stays in the picture, a chink is passed, the near plane never goes through a wall', () => {
    const open = traceLens(() => 0, O, D);
    assert.equal(open.first, Infinity);
    assert.ok(lensFar(open), 'nothing in the way: a far look');
    assert.equal(lensNear(open), LENS.NEAR);
    const far = traceLens(wallAt(30, 3), O, D);
    assert.ok(far.first >= 29.5 && far.first <= 30.01 && !far.thin);
    assert.ok(lensFar(far), 'a wall 30 m away: the look is far');
    const wall = traceLens(wallAt(1.2, 2), O, D);
    assert.ok(!lensFar(wall), 'a wall 1.2 m from the eyes: not a far look');
    assert.ok(lensNear(wall) <= wall.first, 'the near plane is before the wall, so the wall is in the picture: ' + lensNear(wall));
    const mid = traceLens(wallAt(7, 2), O, D);
    assert.ok(lensNear(mid) <= mid.first - 0.04 && lensNear(mid) <= LENS.NEAR, 'a wall at 7 m: near plane stays at the hands\' distance');
    const chink = traceLens((x, y, z) => (z >= 5 && z < 5.2 ? 9 : 0), O, D);
    assert.ok(chink.thin, 'a chink thinner than GAP_MAX');
    assert.ok(lensNear(chink) > chink.exit, 'passed like in the wall mode');
    assert.ok(!lensFar(chink));
});

test('lens: +5 cells at the first far look once; the codex row «lens» exists and nothing is asked of the land', () => {
    assert.equal(firstSpellGain('VisibleGodiLens'), LENS.FIRST);
    assert.equal(firstSpellGain('VisibleGodi'), 5, 'the wall look keeps its own +5');
    const row = VISIBLE_TARGETS.lens;
    assert.ok(row && row.does === 'see' && /Спенсера|призраки/.test(row.why) && /прямой видимости/.test(row.why));
});

// ------------------------------------------------------------------ the picture
function fakeRenderer() {
    return {
        calls: [], target: null, autoClear: true, shadowMap: { autoUpdate: true, needsUpdate: true },
        getDrawingBufferSize(v) { return v.set(1280, 720); }, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
        render(scene, cam) { this.calls.push({ scene, cam, target: this.target, near: cam.near, far: cam.far, fov: cam.fov, view: cam.view && { ...cam.view }, hidden: this.steamHidden }); }, compile() {},
    };
}

test('lens picture: own small picture at 24 a second, narrow view along the cloud, the steam hidden in the pass, nothing without steam, freed after', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 600);
    camera.updateMatrixWorld(true);
    const steam = { pauses: [], pause(on) { this.pauses.push(on); renderer.steamHidden = on; } };
    const fx = new SeeThroughFx({ renderer, scene, camera, steam, quality: { current: { pixelRatio: 1 } } });
    const clouds = (t) => [puff(0, 0, -4, t - 5, 1), puff(0.7, 0, -4, t - 5, 2), puff(1.4, 0, -4, t - 5, 3)];
    const rec = { x: 0.7, y: 0, z: -4, n: 3, span: 2, newest: 5, zoom: 4, seed: 1, seeds: new Set([1, 2, 3]), ray: { first: Infinity, thin: false, exit: 0 }, near: LENS.NEAR };
    const run = (t0, n, puffs) => { for (let i = 0; i < n; i++) { const t = t0 + i / 60; fx.setPuffs(puffs ? puffs(t) : [], t); fx.render(t); } };
    run(0, 30);
    assert.equal(renderer.calls.length, 0, 'off: nothing');
    fx.setOn(true);
    fx.setTarget({ state: 'far', first: 30 });
    fx.setLens(rec);
    run(1, 30, () => []);
    assert.equal(renderer.calls.length, 0, 'on but no steam on the screen: no draw call');
    assert.equal(fx.stats.rtMade, 0);
    run(2, 120, clouds); // 2 s
    assert.equal(fx.stats.rtMade, 1, 'one small picture');
    assert.ok(fx.stats.lensPasses >= 44 && fx.stats.lensPasses <= 52, 'about 24 a second: ' + fx.stats.lensPasses);
    const lens = renderer.calls.filter((c) => c.scene === scene);
    assert.ok(lens.every((c) => c.target === fx.rt && c.cam !== camera), 'into the small picture from a camera of its own');
    assert.ok(lens.every((c) => c.hidden === true), 'the steam is hidden while the lens picture is drawn');
    assert.equal(steam.pauses.filter((x) => x).length, steam.pauses.filter((x) => !x).length, 'and shown again every time');
    assert.ok(lens.every((c) => c.fov < 30 && c.fov > 8), 'a narrow view: about 75° / zoom: ' + lens[0].fov);
    assert.ok(lens.every((c) => Math.abs(c.near - LENS.NEAR) < 1e-9 && Math.abs(c.far - 600) < 1e-9), 'near past the hands, far as the game draws');
    assert.ok(lens.every((c) => c.view && c.view.enabled), 'cropped to the window\'s box');
    assert.ok(!fx.cam2.view || fx.cam2.view.enabled === false, 'the crop is taken off afterwards (the wall look is not spoiled)');
    assert.equal(renderer.target, null);
    assert.ok(fx.mat.uniforms.uLens.value > 0.9, 'the lens is open');
    // the lens enlarges more for a denser cloud: the zoom follows smoothly
    rec.zoom = 8;
    run(5, 120, clouds);
    assert.ok(fx.zoom > 7.5 && fx.zoom <= 8 + 1e-9, 'smoothly to ×8: ' + fx.zoom);
    rec.zoom = 300; // (nonsense from outside cannot push the view past the rules? the rules cap it)
    // a wall within reach: the wall look takes over (never both), the lens closes
    fx.setTarget({ state: 'see', clear: 0.88, first: 1, exit: 2, stopAt: Infinity, thick: 1, segs: [] });
    fx.setLens(rec);
    assert.equal(fx.target.lens, 0, 'with a near wall there is no lens');
    rec.zoom = 3;
    run(8, 60, clouds);
    assert.ok(fx.lens < 0.05);
    assert.ok(renderer.calls.filter((c) => c.scene === scene).slice(-3).every((c) => c.near !== LENS.NEAR), 'the second pass is the wall\'s');
    // off: freed once, nothing after
    fx.setOn(false);
    run(10, 60, clouds);
    assert.equal(fx.rt, null);
    assert.equal(fx.stats.rtFreed, 1);
    const n = renderer.calls.length;
    run(12, 30, clouds);
    assert.equal(renderer.calls.length, n, 'closed: nothing is drawn');
    fx.dispose();
});

test('lens picture: in the open the weak computer draws fewer, a cloud behind the eyes opens no window', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 600);
    camera.updateMatrixWorld(true);
    const fx = new SeeThroughFx({ renderer, scene, camera, quality: { current: { pixelRatio: 0.6 } } });
    const rec = { x: 0, y: 0, z: -4, n: 1, span: 0, newest: 9, zoom: 3, seed: 1, seeds: new Set([1]), ray: { first: Infinity, thin: false, exit: 0 }, near: LENS.NEAR };
    fx.setOn(true); fx.setTarget({ state: 'open' }); fx.setLens(rec);
    for (let i = 0; i < 120; i++) { const t = i / 60; fx.setPuffs([puff(0, 0, -4, t - 5, 1)], t); fx.render(t); }
    assert.ok(fx.stats.lensPasses >= 28 && fx.stats.lensPasses <= 32, 'about 15 a second: ' + fx.stats.lensPasses);
    assert.ok(fx.rt.width < 500, 'a ninth of the screen');
    const behind = { ...rec, z: 4, seeds: new Set([2]) };
    fx.setLens(behind);
    const before = fx.stats.lensPasses;
    for (let i = 0; i < 60; i++) { const t = 3 + i / 60; fx.setPuffs([puff(0, 0, 4, t - 5, 2)], t); fx.render(t); }
    assert.equal(fx.stats.lensPasses, before, 'behind the eyes: no lens picture');
    fx.dispose();
});

// ------------------------------------------------------------------ anyone who looks through the steam (the author's rule)
function viewer(eyeAt, lookAt = { x: 0, y: 0, z: 10 }) {
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 600);
    cam.position.set(eyeAt.x, eyeAt.y, eyeAt.z);
    cam.lookAt(lookAt.x, lookAt.y, lookAt.z);
    cam.updateMatrixWorld(true);
    const sb = new SteamBodies({ scene: new THREE.Scene(), renderer: { domElement: { height: 720 } }, camera: cam });
    const calls = [];
    const g = {
        localId: 'me', camera: cam, terrain: { data: null }, ships: { list: new Map() }, wards: { list: new Map(), mine: () => false }, doors: null,
        combat: { dead: false, drain() { return true; } }, hud: { setVoice() {} }, perf: { note() {} }, mana: { calls, success(n) { calls.push(n); } },
        steam: sb, seeFx: { on: null, coverage: 1, lens: 1, setOn(o) { this.on = o; }, setTarget(i) { this.target = i; }, setLens(l) { this.l = l; }, setPuffs(p) { this.puffs = p; } },
    };
    return { g, v: new VisibleGodi(g), sb, calls };
}
const tick = (v, n = 3) => { for (let i = 0; i < n; i++) v.update(0.1); };

test('anyone looks through the steam: a viewer who is NOT the caster gets the window when another hero\'s steam is in front of the eyes; looking away — nothing', () => {
    const now = performance.now() / 1000;
    const { g, v, sb, calls } = viewer({ x: 0, y: 0, z: 0 });
    tick(v);
    assert.ok(!v.on && g.seeFx.on !== true, 'no steam at all: nothing is followed');
    v.onNet('bob', { k: 'p', p: [0, 0, 6], s: 11 }); // bob's puff six metres ahead
    sb.update(0.1, now);
    for (let i = 0; i < 3; i++) { sb.bodies.get('bob').births.fill(now - 3, 0, 1); }
    tick(v);
    assert.equal(g.seeFx.on, true, 'bob\'s steam is in front of my eyes: my window works');
    assert.ok(v.all.length >= 1 && g.seeFx.puffs.length >= 1, 'his puffs are the ones I look through');
    assert.ok(g.seeFx.l, 'open air: the lens, from my own camera');
    assert.equal(v.on, false);
    v.update(1); // (more seconds: still not the caster)
    assert.deepEqual(calls, [], 'the +5 cells and the mana are the caster\'s only');
    // I turn my back to it: nothing
    g.camera.lookAt(0, 0, -10); g.camera.updateMatrixWorld(true);
    tick(v);
    assert.equal(g.seeFx.on, false, 'not looking through it: only the steam itself');
    // bob\'s steam ends: nothing
    v.onNet('bob', { k: 'o', q: 1 });
    g.camera.lookAt(0, 0, 10); g.camera.updateMatrixWorld(true);
    tick(v);
    assert.equal(g.seeFx.on, false);
});

test('anyone: a viewer who walked INTO the steam gets the window / lens all round (a disc over the whole screen), the lens looks where he looks', () => {
    const now = performance.now() / 1000;
    const out = {};
    const r = lensCloud([puff(0, 0, 0.5, now - 3, 5), puff(0.7, 0, 0.5, now - 3, 6)], now, O, D, out);
    assert.ok(r && r.inside === true, 'the eyes inside a puff');
    assert.ok(Math.abs(r.z - LENS.NEAR) < 1e-9 && Math.abs(r.x) < 1e-9, 'the lens looks along the gaze');
    const front = lensCloud([puff(0, 0, 6, now - 3, 5)], now, O, D, {});
    assert.ok(front && !front.inside);
    // the picture: an inside viewer's disc covers the screen even when no puff is projectable
    const renderer = fakeRenderer();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 600);
    camera.updateMatrixWorld(true);
    const fx = new SeeThroughFx({ renderer, scene: new THREE.Scene(), camera, quality: { current: { pixelRatio: 1 } } });
    fx.setOn(true);
    fx.setTarget({ state: 'open' });
    fx.setLens(r);
    for (let i = 0; i < 90; i++) { const t = i / 60; fx.setPuffs([puff(0, 0, 0.5, t - 3, 5)], t); fx.render(t); }
    assert.ok(fx.coverage >= 1, 'a disc over the screen');
    assert.ok(fx.stats.lensPasses > 20, 'the lens picture is drawn: ' + fx.stats.lensPasses);
    assert.equal(fx.mat.uniforms.uN.value >= 1, true);
    fx.dispose();
});

// ------------------------------------------------------------------ the end: the steam melts away (SEE.FADE_T), not a click
test('the end of the spell: the steam melts away over FADE_T — monotonic, the window with it, the body emptied after; death / a new cast — at once; the net says the same', () => {
    const scene = new THREE.Scene();
    const sb = new SteamBodies({ scene, renderer: { domElement: { height: 720 } }, camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100) });
    const t0 = 100;
    for (let i = 0; i < 5; i++) sb.addPuff('bob', i * 0.7, 0, 5, 40 + i, t0 - 3);
    const out = [];
    sb.gather(out, t0);
    assert.equal(out.length, 5);
    assert.ok(out.every((q) => q.k === 1), 'before the end: full');
    sb.fade('bob', t0);
    assert.ok(SEE.FADE_T >= 1.5 && SEE.FADE_T <= 2.5, 'melts in 1.5–2.5 s: ' + SEE.FADE_T);
    let prev = 2, prevU = -1;
    for (let t = 0; t <= SEE.FADE_T + 0.05; t += 0.1) {
        sb.update(0.1, t0 + t);
        sb.gather(out, t0 + t);
        if (!out.length) break; // (melted: emptied)
        const k = out[0].k, u = sb.bodies.get('bob').mat.uniforms.uFade.value;
        assert.ok(k <= prev + 1e-9, 'the strength only goes down: ' + k);
        assert.ok(u >= prevU - 1e-9, 'the melting only goes on');
        prev = k; prevU = u;
    }
    assert.ok(out.length === 0, 'after FADE_T the puffs are gone (the slots are free)');
    assert.equal(sb.alive('bob', t0 + 3), 0);
    // half way: about half strength (a smooth curve)
    for (let i = 0; i < 5; i++) sb.addPuff('bob', i * 0.7, 0, 5, 40 + i, t0 + 10 - 3);
    sb.fade('bob', t0 + 10);
    sb.gather(out, t0 + 10 + SEE.FADE_T / 2);
    assert.ok(Math.abs(out[0].k - 0.5) < 0.05, 'half way: ' + out[0].k);
    // a new spell on a melting cloud: the old goes at once
    sb.addPuff('bob', 0, 0, 5, 99, t0 + 10.2);
    sb.gather(out, t0 + 10.2);
    assert.equal(out.length, 1);
    assert.equal(out[0].k, 1);
    // the net: «o» melts them, «o» with q — at once
    const { g, v } = viewer({ x: 0, y: 0, z: 0 });
    const now = performance.now() / 1000;
    v.onNet('amy', { k: 'p', p: [0, 0, 6], s: 1 });
    v.onNet('amy', { k: 'o' });
    assert.ok(g.steam.fadeOf('amy', now + 0.5) > 0.1 && g.steam.fadeOf('amy', now + 0.5) < 0.9, 'melting, not cut');
    v.onNet('bea', { k: 'p', p: [0, 0, 6], s: 2 });
    v.onNet('bea', { k: 'o', q: 1 });
    assert.equal(g.steam.alive('bea', now), 0, 'death: at once');
    // the window narrows with the steam
    const renderer = fakeRenderer();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 600);
    camera.updateMatrixWorld(true);
    const fx = new SeeThroughFx({ renderer, scene: new THREE.Scene(), camera, quality: { current: { pixelRatio: 1 } } });
    fx.setOn(true); fx.setTarget({ state: 'far' });
    fx.setLens({ x: 0, y: 0, z: -4, n: 1, span: 0, newest: 9, zoom: 3, seed: 1, seeds: new Set([1]), ray: { first: Infinity, thin: false, exit: 0 }, near: LENS.NEAR });
    const w = (k) => { fx.setPuffs([{ x: 0, y: 0, z: -4, t0: -5, seed: 1, k }], 10); fx._now = 10; fx.open = 1; fx._project(); return fx.mat.uniforms.uPuffs.value[0].w; };
    assert.ok(w(1) > w(0.6) && w(0.6) > w(0.3), 'the mask thins as the steam melts');
    fx.dispose();
});
