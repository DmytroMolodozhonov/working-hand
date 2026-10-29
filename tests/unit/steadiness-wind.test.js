import test from 'node:test';
import assert from 'node:assert/strict';
import { Steadiness, STEADY } from '../../src/game/Steadiness.js';

const mk = (mode = 'survival') => { const toasts = []; const g = { config: { mode }, hud: { toast: (t) => toasts.push(t) } }; return { s: new Steadiness(g), toasts }; };

test('Wind and Wind Maxima knock = +1, shown', () => {
    const { s, toasts } = mk();
    assert.ok(s.windFell('Wind', 0)); assert.equal(s.skill, 2);
    assert.ok(s.windFell('WindMaxima', 5000)); assert.equal(s.skill, 3);
    assert.deepEqual(toasts, ['+1 к устойчивости', '+1 к устойчивости']);
});
test('repeated ticks of one gust give one +1; a later fall gives another', () => {
    const { s } = mk();
    s.windFell('Wind', 0); s.windFell('Wind', 500); s.windFell('Wind', 1900);
    assert.equal(s.skill, 2);
    s.windFell('Wind', 2500);
    assert.equal(s.skill, 3);
});
test('other spells, Creative, cap 100, death', () => {
    const { s } = mk();
    assert.equal(s.windFell('Bombardo', 0), false); assert.equal(s.skill, 1);
    const c = mk('creative'); assert.equal(c.s.windFell('Wind', 0), false); assert.equal(c.s.skill, 1);
    s.skill = STEADY.MAX; s.windFell('Wind', 0); assert.equal(s.skill, STEADY.MAX);
    s.onDeath(); assert.equal(s.skill, 1); assert.ok(s.windFell('Wind', 1));
});
