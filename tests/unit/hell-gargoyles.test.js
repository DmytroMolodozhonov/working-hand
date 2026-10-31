// The underworld's gargoyles (HellGargoyleRules.js): groups of 1–3, 35 % per meeting, never more than 3 on a player, the head 25 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HELL_GARGOYLE as H, packSize, rollAttack, dropsHead, groupSizeOf, groupCount, circleOf, circlePoint, newGroup, stepGroup, isAttacker, mayHunt, underworldFactor } from '../../src/game/HellGargoyleRules.js';

const N = 10000;
test('numbers: the pack never above 3, mostly 1; attack chance 35 %; head 25 % (a sample of 10 000)', () => {
    assert.equal(H.PACK_MAX, 3);
    const c = [0, 0, 0, 0]; let atk = 0, head = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; c[packSize(u, 3)]++; if (rollAttack(u)) atk++; if (dropsHead(u)) head++; }
    assert.equal(c[0] + c[1] + c[2] + c[3], N); assert.equal(c[0], 0);
    assert.ok(c[1] > c[2] && c[2] > c[3] && c[3] > 0, 'mostly one');
    assert.ok(Math.abs(atk / N - 0.35) < 0.005 && Math.abs(head / N - 0.25) < 0.005);
    assert.equal(packSize(0.99, 2), 2, 'a group of two sends two at most');
    assert.equal(packSize(0.99, 1), 1);
    // with a random source too
    let a = 0, h = 0; for (let i = 0; i < N; i++) { if (rollAttack(Math.random())) a++; if (dropsHead(Math.random())) h++; }
    assert.ok(Math.abs(a / N - 0.35) < 0.03 && Math.abs(h / N - 0.25) < 0.03);
});

test('groups: 4…8 of 1…3, circles 80…200 m, 26…70 m up', () => {
    for (let seed = 1; seed < 200; seed++) {
        const n = groupCount(seed, 10);
        assert.ok(n >= 4 && n <= 8);
        assert.equal(groupCount(seed, 3), 3, 'not more than the lairs');
        for (let i = 0; i < n; i++) {
            const s = groupSizeOf(seed, i), c = circleOf(seed, i);
            assert.ok(s >= 1 && s <= 3);
            assert.ok(c.r >= 80 && c.r <= 200 && c.alt >= 26 && c.alt <= 70);
            const p = circlePoint(c, 123.4, 1);
            assert.ok(Math.hypot(p.x, p.z) <= c.r * 1.1 && Math.hypot(p.x, p.z) >= c.r * 0.9);
        }
    }
});

test('the group\'s mind: one roll per meeting, 1–3 attackers, then return; no re-roll before the gap', () => {
    let attacks = 0, rolls = 0;
    for (let k = 0; k < 2000; k++) {
        const st = newGroup(3); let max = 0;
        // the player comes into sight, stays, leaves, comes again within the gap
        const ev1 = stepGroup(st, 0.1, { seen: true });
        const ev2 = stepGroup(st, 0.1, { seen: false });
        const ev3 = stepGroup(st, 0.1, { seen: true });
        assert.ok(ev1.includes('roll'));
        assert.ok(!ev3.includes('roll'), 'the gap holds');
        rolls++;
        if (ev1.includes('attack')) { attacks++; max = st.attackers; assert.ok(max >= 1 && max <= 3); assert.ok(isAttacker(st, 0)); assert.ok(!isAttacker(st, 3)); for (let t = 0; t < 400 && st.mode === 'attack'; t++) stepGroup(st, 0.1, { seen: true }); assert.equal(st.mode, 'return'); for (let t = 0; t < 60; t++) stepGroup(st, 0.1, {}); assert.equal(st.mode, 'circle'); }
        void ev2;
    }
    assert.ok(Math.abs(attacks / rolls - 0.35) < 0.04, 'about 35 % of meetings: ' + attacks / rolls);
});

test('the underworld: fire does nothing, Tarons/Devil untouched', () => {
    assert.equal(underworldFactor('Inferno'), 0); assert.equal(underworldFactor('Hellfire'), 0); assert.equal(underworldFactor('CircleAttack'), 1);
    assert.ok(!mayHunt('taron') && !mayHunt('devil') && mayHunt('player'));
});
