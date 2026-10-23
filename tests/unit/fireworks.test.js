// «Fireworks»: the words (and no clash with Fire / Fire Maxima / Firefighting), the cost and the reward, known from the
// start, the 10 seconds and the pause with the wand down, the same salvo from the same seed, the shapes, the sounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { FIRST_SPELL, firstSpellGain } from '../../src/game/Mana.js';
import { START_SPELLS, knows } from '../../src/game/SpellBook.js';
import { FIREWORKS, FIREWORKS_TARGETS, stepRun, newRun } from '../../src/game/Fireworks.js';
import { mayCast, HELD } from '../../src/game/Concentration.js';
import { planSalvo, burstShape, rng, KINDS, KIND_NAMES, SHOW, starOutline, heartOutline, lod, farSize } from '../../src/fx/FireworkShapes.js';
import { SPELL_SOUND, SPELL_GEN, TUNE_KEYS, HELD_SOUND } from '../../src/audio/SpellMusic.js';
import { FireworksFx, FX } from '../../src/fx/FireworksFx.js';
import { spaceSpellBlock } from '../../src/game/Space.js';

test('«Fireworks»: the ways it is said — and Fire / Fire Maxima / Firefighting stay what they were', () => {
    for (const t of ['Fireworks', 'файрворкс', 'фаерворкс', 'файр воркс', 'фаер воркс', 'файрвокс', 'фаервокс', 'Fire works', 'Файрворкс!']) assert.equal(matchSpell(t), 'Fireworks', t);
    assert.equal(matchSpell('Fire'), 'Fire');
    assert.equal(matchSpell('файр'), 'Fire');
    assert.equal(matchSpell('Fire Maxima'), 'FireMaxima');
    assert.equal(matchSpell('файр максима'), 'FireMaxima');
    assert.equal(matchSpell('Firefighting'), 'Firefighting');
    assert.equal(matchSpell('файр файтинг'), 'Firefighting');
    assert.equal(matchSpell('салют'), null, 'a greeting to a villager is never a spell');
    assert.equal(matchSpell('привет, как дела'), null);
});

test('15 mana once, +3 cells for the first one, known from the start (no scroll), held while it goes', () => {
    assert.equal(SPELL_COST.Fireworks, 15);
    assert.equal(FIRST_SPELL.Fireworks, 3);
    assert.equal(firstSpellGain('Fireworks'), 3);
    assert.ok(START_SPELLS.has('Fireworks'));
    assert.ok(knows('Fireworks', { mode: 'survival' }));
    assert.ok(HELD.Fireworks && HELD_SOUND.Fireworks, 'a held spell has its concentration entry and sound entry');
    assert.equal(mayCast('Fireworks', 'Bombardo'), false, 'no other spell while the salvos go');
    assert.equal(mayCast('Fireworks', 'Stop'), true);
    assert.equal(mayCast('Fireworks', 'Lumos'), true);
});

test('the 10 seconds: a salvo every 1.2…2 s, a lowered wand waits (the time still runs), a raised one goes on after a breath', () => {
    assert.equal(FIREWORKS.LIFE, 10);
    const r = rng(7), run = newRun(r), fired = [];
    for (let t = 0; t < 12; t += 0.05) { if (stepRun(run, 0.05, true, r)) fired.push(run.t); if (run.done) break; }
    assert.ok(run.done, 'over after 10 s');
    assert.ok(run.t >= 10 && run.t < 10.1);
    for (let i = 1; i < fired.length; i++) { const gap = fired[i] - fired[i - 1]; assert.ok(gap >= 1.15 && gap <= 2.1, `gap ${gap}`); }
    assert.ok(fired.length >= 4 && fired.length <= 8, 'salvos in 10 s: ' + fired.length);
    // the wand lowered: nothing goes, though time runs
    const r2 = rng(11), run2 = newRun(r2);
    let n = 0;
    for (let t = 0; t < 6; t += 0.05) if (stepRun(run2, 0.05, false, r2)) n++;
    assert.equal(n, 0, 'nothing with the wand down');
    assert.ok(Math.abs(run2.t - 6) < 0.1, 'the time still runs');
    // raised again: goes on, but not at the same instant
    const t0 = run2.t;
    let first = null;
    for (let t = 0; t < 2 && first == null; t += 0.05) if (stepRun(run2, 0.05, true, r2)) first = run2.t - t0;
    assert.ok(first >= FIREWORKS.SETTLE - 0.06, 'a breath before the first salvo: ' + first);
});

test('a salvo is the same on every computer (seeded) and is 1…3 rockets of 35–70 m, 12–25 m wide, 80–300 sparks', () => {
    assert.deepEqual(planSalvo(12345), planSalvo(12345));
    assert.notDeepEqual(planSalvo(12345), planSalvo(12346));
    const seen = new Set(), counts = new Set();
    for (let s = 1; s < 400; s++) {
        const p = planSalvo(s * 7919);
        counts.add(p.rockets.length);
        assert.ok(p.rockets.length >= 1 && p.rockets.length <= 3);
        for (const R of p.rockets) {
            seen.add(R.kind);
            assert.ok(R.height >= 35 && R.height <= 70, 'height ' + R.height);
            assert.ok(R.rise >= 0.9 && R.rise <= 1.3);
            assert.ok(R.radius >= 12 && R.radius <= 25);
            assert.ok(R.count >= 80 && R.count <= 300, 'count ' + R.count);
            assert.ok(KINDS[R.kind] && R.colors.length === 2);
        }
    }
    assert.deepEqual([...seen].sort(), [...KIND_NAMES].sort(), 'every kind turns up');
    assert.deepEqual([...counts].sort(), [1, 2, 3]);
    assert.equal(KIND_NAMES.length, 9);
});

test('the shapes: every burst keeps inside its radius, a ring is flat, a star has five points, a heart is a heart, the same each time', () => {
    for (const kind of KIND_NAMES) {
        const a = burstShape(kind, rng(5), 120, [0xff0000, 0x00ff00]), b = burstShape(kind, rng(5), 120, [0xff0000, 0x00ff00]);
        assert.deepEqual(a, b, kind + ' is deterministic');
        assert.ok(a.parts.length >= 60, kind);
        for (const p of a.parts) {
            assert.ok(Math.hypot(...p.o) <= 1.2, `${kind}: a spark at ${Math.hypot(...p.o)} radii`);
            assert.ok(p.c > 0);
        }
    }
    // the ring: all in one plane
    const ring = burstShape('ring', rng(3), 100, [1, 2], { normal: [0.3, 1, 0.2] }).parts.filter((p) => p.c === 1 || p.c === 2);
    const n = [0.3, 1, 0.2], L = Math.hypot(...n);
    for (const p of ring) assert.ok(Math.abs((p.o[0] * n[0] + p.o[1] * n[1] + p.o[2] * n[2]) / L) < 0.02, 'flat');
    // the star: its outline reaches out to 1 at 5 points and in to 0.42 between
    const st = starOutline(300), rr = st.map(([x, y]) => Math.hypot(x, y));
    assert.ok(Math.max(...rr) > 0.99 && Math.min(...rr) < 0.45);
    let peaks = 0;
    for (let i = 0; i < 300; i++) if (rr[i] > 0.95 && rr[i] >= rr[(i + 299) % 300] && rr[i] > rr[(i + 1) % 300]) peaks++;
    assert.equal(peaks, 5, 'five points');
    // the heart: wider at the top than at the bottom point, symmetric left to right
    const h = heartOutline(200);
    assert.ok(h.every(([x, y]) => Math.abs(x) <= 1 && y >= -1 && y <= 1));
    const left = h.filter(([x]) => x < -0.05).length, right = h.filter(([x]) => x > 0.05).length;
    assert.ok(Math.abs(left - right) <= 2);
    // the double has two layers of two colours
    const dbl = burstShape('double', rng(9), 200, [11, 22]).parts;
    const inner = dbl.filter((p) => p.c === 22), outer = dbl.filter((p) => p.c === 11);
    assert.ok(Math.max(...inner.map((p) => Math.hypot(...p.o))) < Math.min(...outer.map((p) => Math.hypot(...p.o))) + 0.2);
});

test('far bursts keep the ball and lose the detail: fewer sparks, no trails, bigger sparks (seen to ~1 km)', () => {
    assert.ok(lod(100).parts > lod(500).parts && lod(500).parts > lod(1000).parts - 1e-9);
    assert.equal(lod(100).trails, true);
    assert.equal(lod(900).trails, false);
    assert.ok(farSize(600) > farSize(60) && farSize(1000) <= 8);
    assert.ok(FX.SEE_R >= 600, 'visible farther than 600 m');
});

test('FireworksFx: rockets rise and burst, the comets and the pool stay bounded, nothing is left over', () => {
    const spawned = [];
    const pool = { active: 0, capacity: 3500, spawn: (...a) => { spawned.push(a); pool.active = Math.min(pool.capacity, pool.active + 1); } };
    const game = { fx: { fireworks: pool, lightFlash() { game.flashes = (game.flashes || 0) + 1; } }, character: { group: { position: { x: 0, y: 0, z: 0 } } }, sound: { playSpellFxAt(k) { (game.heard ||= []).push(k); } } };
    const fx = new FireworksFx(game);
    for (let s = 1; s <= 30; s++) fx.launchSalvo({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }, s * 101, 'me');
    let frames = 0, maxComets = 0;
    for (let t = 0; t < 12; t += 1 / 60) { fx.update(1 / 60); frames++; maxComets = Math.max(maxComets, fx.c.n); pool.active = Math.max(0, pool.active - 20); }
    assert.ok(fx.bursts > 20, 'bursts: ' + fx.bursts);
    assert.ok(maxComets <= FX.COMETS);
    assert.equal(fx.c.n, 0, 'every comet is gone');
    assert.ok(fx.shells.every((s) => !s.on));
    assert.ok(game.flashes > 0 && game.heard.includes('fxFwBoom') && game.heard.includes('fxFwLaunch'));
    assert.ok(spawned.length > 3000);
    assert.ok(spawned.every((a) => a.slice(0, 6).every(Number.isFinite)), 'no NaN');
    // a burst 1.5 km away is not drawn at all
    spawned.length = 0;
    fx.launchSalvo({ x: 1500, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }, 5, 'x');
    for (let t = 0; t < 3; t += 1 / 60) fx.update(1 / 60);
    assert.equal(spawned.length, 0);
});

test('in the airless sky: no sound, no drag, no haze — a spark flies straight', () => {
    const spawned = [], game = { fx: { fireworks: { active: 0, capacity: 3500, spawn: (...a) => spawned.push(a) } }, character: { group: { position: { x: 0, y: 0, z: 0 } } }, sound: { playSpellFxAt() { (game.heard ||= []).push(1); } } };
    const fx = new FireworksFx(game);
    fx.launchSalvo({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }, 77, 'me', true);
    for (let t = 0; t < 4; t += 1 / 60) fx.update(1 / 60);
    assert.ok(!game.heard, 'silent');
    assert.ok(spawned.length > 100);
});

test('the sounds: the fanfare is a tune, the whistle, the boom and the crackle are made ahead, all on the card', () => {
    const e = SPELL_SOUND.Fireworks;
    assert.ok(e && e.theme === 'thFireworks' && TUNE_KEYS.includes('thFireworks'));
    for (const k of ['fxFwLaunch', 'fxFwBoom', 'fxFwCrackle']) assert.ok(SPELL_GEN[k] && e.own.includes(k), k);
});

test('«ON WHOM AND ON WHAT»: nobody is hurt, nothing is broken, the people are pleased not afraid', () => {
    for (const [k, v] of Object.entries(FIREWORKS_TARGETS)) {
        assert.ok(v.does && v.why, k);
        assert.ok(!/ранит|урон|поджигает/.test(v.does), k);
    }
    assert.equal(FIREWORKS_TARGETS.castlePeople.does, 'cheer');
    assert.equal(FIREWORKS_TARGETS.space.does, 'vacuum');
    assert.equal(spaceSpellBlock('Fireworks', 'space', 'space'), null, 'works (silently) in space');
    assert.equal(spaceSpellBlock('Fireworks', 'mars', 'none'), null);
});
