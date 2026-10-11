import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrokeDetector, SwimMotion, SWIM } from '../../src/game/SwimStroke.js';

// A person in the picture: shoulders 0.2 apart, arms 0.3 long (0.15 + 0.15). The image is not
// mirrored: the person's LEFT shoulder is on the picture's right.
const SH = { left: { x: 0.6, y: 0.42 }, right: { x: 0.4, y: 0.42 } };
const HANG = { left: [0.6, 0.72], right: [0.4, 0.72] };

/** A pose with the wrists at `w` = {left:[x,y], right:[x,y]} (the elbows half-way). */
function pose(w = {}, aspect) {
    const p = { aspect };
    for (const side of ['left', 'right']) {
        const s = SH[side], [x, y] = w[side] || HANG[side];
        p[side + 'Shoulder'] = { x: s.x, y: s.y, z: 0 };
        p[side + 'Elbow'] = { x: (s.x + x) / 2, y: (s.y + y) / 2, z: 0 };
        p[side + 'Wrist'] = { x, y, z: 0 };
    }
    return p;
}

/** Feed frames at 30 FPS; returns every stroke seen. */
function run(det, frames) {
    const out = [];
    for (const f of frames) out.push(...det.update(1 / 30, f));
    return out;
}

const lerp = (a, b, k) => a + (b - a) * k;
/** One arm in front of the body, from straight up (k=0) to hanging (k=1). */
const frontArm = (side, k) => [SH[side].x, lerp(SH[side].y - 0.3, SH[side].y + 0.3, k)];
const hold = (w, n) => Array.from({ length: n }, () => pose(w));
const move = (from, to, n) => Array.from({ length: n }, (_, i) => pose(to(i / (n - 1))));

test('crawl: an arm reaching up and pulling down to the hip is one stroke; it must come up again for the next', () => {
    const det = new StrokeDetector();
    const up = { left: frontArm('left', 0) };
    let ev = run(det, [...hold(HANG, 10), ...hold(up, 10), ...move(up, (k) => ({ left: frontArm('left', k) }), 15), ...hold({ left: frontArm('left', 1) }, 15)]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].kind, 'pull');
    assert.equal(ev[0].side, 'left');
    assert.ok(ev[0].power >= 0.5 && ev[0].power <= 1.3);
    // jiggling the hand down at the hip is no new stroke
    ev = run(det, Array.from({ length: 30 }, (_, i) => pose({ left: [0.6, 0.7 + (i % 2) * 0.03] })));
    assert.equal(ev.length, 0);
    // the next stroke, with the right arm (alternating, like a real crawl)
    ev = run(det, [...hold({ right: frontArm('right', 0) }, 8), ...move(null, (k) => ({ right: frontArm('right', k) }), 12), ...hold(HANG, 5)]);
    assert.deepEqual(ev.map((e) => [e.kind, e.side]), [['pull', 'right']]);
});

test('the camera\'s jitter never makes a stroke', () => {
    const det = new StrokeDetector();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    // arms hanging, arms held forward at the shoulders, arms raised — each with ±0.03 noise for 5 s
    for (const base of [HANG, { left: [0.6, 0.44], right: [0.4, 0.44] }, { left: frontArm('left', 0), right: frontArm('right', 0) }]) {
        const frames = Array.from({ length: 150 }, () => pose({
            left: [base.left[0] + rnd() * 0.06, base.left[1] + rnd() * 0.06],
            right: [base.right[0] + rnd() * 0.06, base.right[1] + rnd() * 0.06],
        }));
        assert.equal(run(det, frames).length, 0);
    }
});

test('slowly lowering an arm (3 s) and a one-frame glitch are not strokes', () => {
    const det = new StrokeDetector();
    const up = { left: frontArm('left', 0) };
    let ev = run(det, [...hold(up, 10), ...move(up, (k) => ({ left: frontArm('left', k) }), 90), ...hold(HANG, 10)]);
    assert.equal(ev.length, 0, 'slow');
    ev = run(det, [...hold(up, 10), pose({ left: frontArm('left', 1) }), ...hold(up, 10)]);
    assert.equal(ev.length, 0, 'glitch');
});

test('breaststroke: the hands together in front, then both wide out — one sweep; held out, nothing more', () => {
    const det = new StrokeDetector();
    const together = { left: [0.53, 0.47], right: [0.47, 0.47] };
    const wide = { left: [0.85, 0.5], right: [0.15, 0.5] };
    const at = (k) => ({ left: [lerp(0.53, 0.85, k), lerp(0.47, 0.5, k)], right: [lerp(0.47, 0.15, k), lerp(0.47, 0.5, k)] });
    // (the arms seen hanging first: their length is known — folded in front they look short)
    let ev = run(det, [...hold(HANG, 5), ...hold(together, 10), ...move(null, at, 15), ...hold(wide, 30)]);
    assert.deepEqual(ev.map((e) => e.kind), ['sweep']);
    // back together (recovery) and out again: the second stroke
    ev = run(det, [...move(null, (k) => at(1 - k), 12), ...hold(together, 5), ...move(null, at, 15), ...hold(wide, 5)]);
    assert.deepEqual(ev.map((e) => e.kind), ['sweep']);
    // one arm only out to the side is no breaststroke
    ev = run(new StrokeDetector(), [...hold(HANG, 5), ...hold(together, 10), ...move(null, (k) => ({ left: at(k).left, right: together.right }), 15), ...hold({ left: wide.left, right: together.right }, 10)]);
    assert.equal(ev.length, 0);
});

test('dolphin: both arms pulling down together', () => {
    const det = new StrokeDetector();
    const ev = run(det, [...hold({ left: frontArm('left', 0), right: frontArm('right', 0) }, 10),
        ...move(null, (k) => ({ left: frontArm('left', k), right: frontArm('right', k) }), 15), ...hold(HANG, 5)]);
    assert.deepEqual(ev.map((e) => e.kind).sort(), ['double', 'pull', 'pull']);
});

test('a wide camera picture (16:9) is measured the same', () => {
    const det = new StrokeDetector();
    const a = 16 / 9;
    // the same person in a wider picture: x squeezed by the aspect around the middle
    const sq = (w) => { const p = pose(w, a); for (const k of Object.keys(p)) if (p[k]?.x != null) p[k].x = 0.5 + (p[k].x - 0.5) / a; return p; };
    const frames = [...Array.from({ length: 10 }, () => sq({ left: frontArm('left', 0) })),
        ...Array.from({ length: 15 }, (_, i) => sq({ left: frontArm('left', i / 14) })), ...Array.from({ length: 5 }, () => sq(HANG))];
    assert.deepEqual(run(det, frames).map((e) => e.kind), ['pull']);
});

test('swim physics: strokes push forward, the water slows the body; on top it stays on top', () => {
    const m = new SwimMotion();
    let o = m.step(0.1, { under: false });
    assert.equal(o.forward, 0);
    m.stroke({ kind: 'pull', power: 1 }, { under: false, look: 0 });
    o = m.step(1 / 60, { under: false, look: 0 });
    assert.ok(o.forward > 1, `pushed forward ${o.forward}`);
    assert.equal(o.up, 0, 'on top of the water');
    let dist = 0;
    for (let i = 0; i < 600; i++) dist += m.step(1 / 60, { under: false }).forward / 60;
    assert.ok(dist > 1 && dist < 2.5, `one stroke glides ~1.4 m (${dist.toFixed(2)})`);
    assert.equal(m.speed, 0, 'and stops');
    // a steady crawl (2 pulls a second) reaches a good speed, never more than the top one
    for (let i = 0; i < 600; i++) { if (i % 30 === 0) m.stroke({ kind: 'pull', power: 1.3 }); m.step(1 / 60, { under: false }); }
    assert.ok(m.speed > 2 && m.speed <= SWIM.MAX_SPEED);
    // swimming flat, treading water upright
    assert.ok(m.tilt > 1.1, `flat ${m.tilt}`);
    for (let i = 0; i < 600; i++) m.step(1 / 60, { under: false });
    assert.ok(m.tilt < 0.6, `upright ${m.tilt}`);
});

test('swim physics: look down and stroke — a dive; under water the way follows the look; no strokes — up', () => {
    const m = new SwimMotion();
    // looking straight ahead a stroke never takes the body under
    m.stroke({ kind: 'sweep', power: 1 }, { under: false, look: -0.1 });
    assert.equal(m.step(1 / 60, { under: false, look: -0.1 }).up, 0);
    m.stroke({ kind: 'sweep', power: 1 }, { under: false, look: -0.8 });
    assert.ok(m.step(1 / 60, { under: false, look: -0.8 }).up < -0.5, 'diving');
    // under the water: looking down + breaststroke = deeper, looking up = up
    for (let i = 0; i < 60; i++) m.step(1 / 60, { under: true, look: -0.8 });
    m.stroke({ kind: 'sweep', power: 1 }, { under: true });
    assert.ok(m.step(1 / 60, { under: true, look: -0.8 }).up < -0.5, 'deeper');
    m.stroke({ kind: 'sweep', power: 1 }, { under: true });
    for (let i = 0; i < 60; i++) m.step(1 / 60, { under: true, look: 0.8 });
    assert.ok(m.step(1 / 60, { under: true, look: 0.8 }).up > 1, 'up towards the light');
    // the body lies along the way (head down when diving)
    const d = new SwimMotion();
    for (let i = 0; i < 120; i++) { if (i % 20 === 0) d.stroke({ kind: 'sweep', power: 1 }, { under: true }); d.step(1 / 60, { under: true, look: -1 }); }
    assert.ok(d.tilt > Math.PI / 2 + 0.3, `head down ${d.tilt}`);
    // no strokes: it floats up
    const f = new SwimMotion();
    assert.equal(f.step(1 / 60, { under: true, look: -1 }).up, SWIM.BUOYANCY);
    // under the water the breaststroke is the stroke; a lone crawl arm does little
    const a = new SwimMotion(), b = new SwimMotion();
    a.stroke({ kind: 'sweep', power: 1 }, { under: true });
    b.stroke({ kind: 'pull', power: 1 }, { under: true });
    assert.ok(a.speed > b.speed * 2);
});

test('lifting both arms sideways from hanging (a jumping jack) is no breaststroke', () => {
    const det = new StrokeDetector();
    const side = (deg) => { const a = deg * Math.PI / 180, dx = Math.sin(a) * 0.3, dy = Math.cos(a) * 0.3; return { left: [0.6 + dx, 0.42 + dy], right: [0.4 - dx, 0.42 + dy] }; };
    const ev = run(det, [...hold(side(0), 10), ...move(null, (k) => side(100 * k), 12), ...hold(side(100), 10)]);
    assert.equal(ev.filter((e) => e.kind === 'sweep').length, 0);
});
