// The author 20.11: the black magic −1 per game day (24 min) of REAL play; pause / standing / circling in place do not count; level 100 is not touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityClock, DarkDecay, DECAY } from '../../src/game/DarkDecay.js';
import { DarkHero, DARK } from '../../src/game/DarkMagic.js';

const run = (clock, secs, pos, ok = true) => { let n = 0; for (let t = 0; t < secs; t += 0.5) n += clock.feed(...pos(t), ok, 0.5); return n; };
const walk = (t) => [t * 4, 0]; // 4 m/s along a line

test('a day of walking: exactly one step down; a day of standing, circling in a small yard or paused: none', () => {
    assert.equal(run(new ActivityClock(), DECAY.DAY_S + 60, walk), 1);
    assert.equal(run(new ActivityClock(), DECAY.DAY_S * 2, () => [100, 100]), 0, 'standing');
    assert.equal(run(new ActivityClock(), DECAY.DAY_S * 2, (t) => [Math.cos(t) * 5, Math.sin(t) * 5]), 0, 'running circles of 5 m');
    assert.equal(run(new ActivityClock(), DECAY.DAY_S * 2, walk, false), 0, 'paused / tab hidden');
    assert.equal(run(new ActivityClock(), DECAY.DAY_S * 2 + 60, (t) => [Math.cos(t / 6) * 40, Math.sin(t / 6) * 40]), 2, 'a big loop of 40 m is real walking');
});

test('in the game: level −1 (the skin with it); level 100 and a clean hero are not touched; the hero dying / paused does not count', () => {
    const mk = (level) => { const g = { paused: false, revealed: true, character: { group: { position: { x: 0, z: 0 } } }, hud: { setVoice() {} } }; g.dark = new DarkHero(g); g.dark.level = level; g.dark.skin = level; return { g, d: new DarkDecay(g) }; };
    const go = (o, secs) => { for (let t = 0; t < secs; t += 0.5) { o.g.character.group.position.x += 2; o.d.update(0.5); } };
    const a = mk(30); go(a, DECAY.DAY_S + 30); assert.equal(a.g.dark.level, 29); assert.equal(a.g.dark.skin, 29);
    const b = mk(DARK.MAX); go(b, DECAY.DAY_S * 2); assert.equal(b.g.dark.level, DARK.MAX, 'level 100: the rule does not apply');
    const c = mk(0); go(c, DECAY.DAY_S * 2); assert.equal(c.g.dark.level, 0);
    const p = mk(30); p.g.paused = true; go(p, DECAY.DAY_S * 2); assert.equal(p.g.dark.level, 30);
});
