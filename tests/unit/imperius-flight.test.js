// «Империус Максима»: flying a winged creature with the arms (ImperiusFlight.js) and the dragon's fire at a long «У»
// (DragonHowl.js) — the author's rules: strokes of the arms, the dragon must run first, the fire once in 7 s, louder — bigger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAP, FLYERS, HEAD, FlapReader, flyStep, headPath, strokeStrength } from '../../src/game/ImperiusFlight.js';
import { HOWL, HowlReader, isHowl, flameSize } from '../../src/game/DragonHowl.js';

const DT = 1 / 60;
/** n frames of both hands at these speeds (y: up m/s against the body). */
const hands = (R, n, yL, yR = yL) => { let s = 0; for (let i = 0; i < n; i++) s = Math.max(s, R.update(DT, { y: yL }, { y: yR })); return s; };

test('a stroke: both arms down together, fast; one arm, a slow drift, a raise — none', () => {
    const R = new FlapReader();
    assert.equal(hands(R, 20, 0), 0, 'still arms');
    assert.equal(hands(R, 10, -5, 0), 0, 'one arm alone');
    hands(R, 20, 0);
    assert.equal(hands(R, 10, -1.2), 0, 'too slow');
    hands(R, 20, 3); // (up)
    assert.equal(hands(R, 6, -6) + 0, 0, 'still going down: counted when it ends');
    const s = hands(R, 3, 0);
    assert.ok(s > 0.5 && s <= 1, 'a fast stroke: strong ' + s);
    hands(R, 20, 3);
    hands(R, 6, -2.5);
    const w = hands(R, 3, 0);
    assert.ok(w >= 0.3 && w < s, 'a gentler one: weaker ' + w);
    assert.equal(strokeStrength(FLAP.FULL * 2), 1);
});

test('the flight: strokes lift and push it; between them it glides down; arms down — it drops; low and slow — it lands', () => {
    const P = FLYERS.owl;
    const st = { air: false, vf: 0, vy: 0 };
    flyStep(st, P, { stroke: 0.8, ground: 0, alt: 0 }, DT);
    assert.ok(st.air && st.took && st.vy > 0, 'an owl takes off from the spot');
    let alt = 0;
    // a stroke every 0.5 s: it climbs
    for (let i = 0; i < 180; i++) { flyStep(st, P, { stroke: i % 30 === 0 ? 0.8 : 0, alt: alt + 5 }, DT); alt += st.vy * DT; }
    assert.ok(alt > 3, 'flapping, it climbed: ' + alt.toFixed(1));
    const vf = st.vf;
    assert.ok(vf > 3, 'and flies forward: ' + vf.toFixed(1));
    // no strokes: it glides down slowly; arms down: much faster
    const g = { ...st }; let glide = 0; for (let i = 0; i < 60; i++) { flyStep(g, P, { stroke: 0, arms: 'spread', alt: 50 }, DT); glide += g.vy * DT; }
    const d = { ...st }; let drop = 0; for (let i = 0; i < 60; i++) { flyStep(d, P, { stroke: 0, arms: 'down', alt: 50 }, DT); drop += d.vy * DT; }
    assert.ok(glide < 0 && drop < glide * 1.5, `glide ${glide.toFixed(2)} m, folded ${drop.toFixed(2)} m in 1 s`);
    // low over the ground and coming down: it lands
    flyStep(d, P, { stroke: 0, arms: 'down', alt: 0.2 }, DT);
    assert.ok(!d.air && d.landed, 'landed');
});

test('the dragon must run to take off; the book, the owl, the phoenix from the spot', () => {
    const D = FLYERS.dragon;
    assert.ok(D.takeoff > 0 && FLYERS.bookbird.takeoff === 0 && FLYERS.owl.takeoff === 0 && FLYERS.phoenix.takeoff === 0);
    const st = { air: false, vf: 0, vy: 0 };
    flyStep(st, D, { stroke: 1, ground: 0, alt: 0 }, DT);
    assert.ok(!st.air, 'standing: a stroke does not lift it');
    flyStep(st, D, { stroke: 1, ground: D.takeoff * 0.6, alt: 0 }, DT);
    assert.ok(!st.air, 'walking: not yet');
    flyStep(st, D, { stroke: 1, ground: D.takeoff + 0.5, alt: 0 }, DT);
    assert.ok(st.air && st.vf >= D.takeoff, 'running: it takes off');
    // heavier: a dragon climbs less per stroke than an owl climbs relative to its size, but flies far faster
    assert.ok(D.maxFwd > FLYERS.owl.maxFwd && D.maxFwd > FLYERS.bookbird.maxFwd);
});

test('the dragon\'s fire: a long «У» — after a moment; as big as the voice; once in 7 s', () => {
    assert.equal(HOWL.EVERY, 7);
    for (const w of ['у', 'ууу', 'у-у-у', 'Ууу!', 'u', 'ую']) assert.ok(isHowl(w), w);
    for (const w of ['', 'да', 'уходи', 'ну', 'империус', 'у меня']) assert.ok(!isHowl(w), w);
    assert.ok(flameSize(-20, -60) > flameSize(-45, -60), 'louder — bigger');
    assert.ok(flameSize(-59, -60) >= 0.3 && flameSize(0, -60) <= 1.7);
    const H = new HowlReader();
    for (let i = 0; i < 60; i++) { H.level(-62); H.update(DT); } // (the room's quiet)
    let started = 0, on = 0;
    const howl = (sec, db) => { for (let i = 0; i < sec * 60; i++) { H.level(db); if (i % 9 === 0) H.letters('ууу'); const r = H.update(DT); if (r.start) started++; if (r.on) on++; } };
    howl(0.2, -30);
    assert.equal(started, 0, 'not at once: the «У» must go on a moment');
    howl(1.5, -30);
    assert.equal(started, 1, 'the fire came');
    assert.ok(on > 30, 'and burns while the «У» goes on');
    const size = H.size;
    for (let i = 0; i < 40; i++) { H.level(-62); H.update(DT); } // (quiet: it stops)
    assert.ok(!H.update(DT).on, 'quiet: the fire is out');
    howl(2, -30);
    assert.equal(started, 1, 'not again before 7 s');
    for (let i = 0; i < 4 * 60; i++) { H.level(-62); H.update(DT); }
    howl(1, -12); // (shouted)
    assert.equal(started, 2, 'after 7 s — again');
    assert.ok(H.size > size, `shouted — bigger: ${H.size.toFixed(2)} > ${size.toFixed(2)}`);
    // the browser's recognizer: a phrase «у»
    const B = new HowlReader();
    B.t = 100;
    assert.ok(B.phrase('ууу') && B.update(DT).start);
    assert.ok(!B.phrase('ууу'), 'not twice in 7 s');
});

// (the author: «наклонил голову вниз, как во Flight, — дракон никак не пикировал»)
test('the head steers the height for every flyer, as in «Flight»: bowed — down, steeper with the angle; ahead — it keeps its height; raised — up on its speed', () => {
    assert.equal(headPath(0), 0); assert.equal(headPath(-0.05), 0, 'a small nod: still ahead');
    assert.ok(headPath(-0.3) < 0 && headPath(-0.6) < headPath(-0.3) && headPath(-1) === -HEAD.DIVE);
    assert.ok(headPath(0.4) > 0);
    for (const kind of Object.keys(FLYERS)) {
        const P = FLYERS[kind];
        const fly = (pitch, secs, alt = 200) => {
            const st = { air: true, vf: P.maxFwd * 0.8, vy: 0 };
            let dy = 0;
            for (let i = 0; i < secs * 60; i++) { flyStep(st, P, { stroke: 0, arms: '', alt: alt + dy, pitch }, DT); dy += st.vy * DT; }
            return { dy, st };
        };
        const ahead = fly(0, 2), bow = fly(-0.25, 2), deep = fly(-0.6, 2), up = fly(0.4, 1.5);
        assert.ok(Math.abs(ahead.dy) < 1.2, `${kind}: ahead keeps its height (${ahead.dy.toFixed(2)} m in 2 s)`);
        assert.ok(bow.dy < -3, `${kind}: the head bowed — it comes down (${bow.dy.toFixed(1)} m)`);
        assert.ok(deep.dy < bow.dy * 1.5, `${kind}: bowed more — steeper (${deep.dy.toFixed(1)} < ${bow.dy.toFixed(1)})`);
        assert.ok(deep.st.vf > ahead.st.vf + 1, `${kind}: a dive gathers speed (${deep.st.vf.toFixed(1)} > ${ahead.st.vf.toFixed(1)} m/s)`);
        assert.ok(up.dy > 1, `${kind}: the head raised — up (${up.dy.toFixed(1)} m)`);
    }
});

test('a dive down to the ground: checked near it (≤ FLARE_VY m/s), lands on its feet; slow and ahead — it sinks', () => {
    const P = FLYERS.dragon;
    const st = { air: true, vf: P.maxFwd, vy: 0 };
    let alt = 60, vyNear = -Infinity, frames = 0;
    while (st.air && frames++ < 60 * 30) {
        flyStep(st, P, { stroke: 0, arms: '', alt, pitch: -0.7 }, DT);
        alt = Math.max(0, alt + st.vy * DT);
        if (alt < 0.6 && st.air) vyNear = Math.max(vyNear, -st.vy);
    }
    assert.ok(!st.air && st.landed !== undefined, 'landed after ' + (frames / 60).toFixed(1) + ' s');
    assert.ok(frames < 60 * 12, 'a dive is quick: ' + (frames / 60).toFixed(1) + ' s from 60 m');
    assert.ok(vyNear <= HEAD.FLARE_VY + 1, 'touching down softly: ' + vyNear.toFixed(2) + ' m/s');
    // too slow to be held: looking ahead it sinks
    const slow = { air: true, vf: 2, vy: 0 };
    let dy = 0; for (let i = 0; i < 120; i++) { flyStep(slow, P, { stroke: 0, arms: '', alt: 100, pitch: 0 }, DT); dy += slow.vy * DT; }
    assert.ok(dy < -2, 'slow: it sinks ' + dy.toFixed(1));
});
