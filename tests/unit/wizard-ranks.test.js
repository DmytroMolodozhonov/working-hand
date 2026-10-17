import test from 'node:test';
import assert from 'node:assert/strict';
import { WIZ_RANKS, wizardRoster, wizardStats, duelPower, duelStrength, wantsMaxima } from '../../src/game/WizardAI.js';
import { DUEL, maximaPush, clashPush } from '../../src/game/Duel.js';

const tower = (wseed, id = 'wt3_4') => ({ id, kind: 'tower', wseed, stalls: [{}, {}], teachers: 4, houses: [{}, {}, {}] });
const wander = (wseed) => ({ id: 'ww1_2', kind: 'wander', wseed, stalls: [], teachers: 0, houses: [] });

test('ranks: mana in its range, the Master one per tower, more students than teachers, wanderers any rank but master', () => {
    const range = { novice: [43, 57], adept: [85, 115], teacher: [170, 230], master: [450, 550] };
    const count = { novice: 0, adept: 0, teacher: 0, master: 0 };
    for (let s = 0; s < 40; s++) {
        let masters = 0;
        for (let i = 0; i < 40; i++) {
            const e = wizardRoster(tower(s), i);
            assert.ok(e.mana >= range[e.rank][0] && e.mana <= range[e.rank][1], `${e.rank} ${e.mana}`);
            if (e.rank === 'master') masters++;
            if (i === 0) assert.equal(e.rank, 'master');
            count[e.rank]++;
        }
        assert.equal(masters, 1);
        const w = wizardRoster(wander(s), s % 3);
        assert.notEqual(w.rank, 'master');
        assert.ok(WIZ_RANKS[w.rank]);
    }
    assert.ok(count.novice > count.adept && count.adept > count.teacher && count.teacher > count.master, JSON.stringify(count));
    const ws = new Set();
    for (let s = 0; s < 60; s++) ws.add(wizardRoster(wander(s), 0).rank);
    assert.deepEqual([...ws].sort(), ['adept', 'novice', 'teacher']);
});

test('ranks are fixed by the world seed (the same on every computer), another world — others; names stay', () => {
    for (let i = 0; i < 20; i++) assert.deepEqual(wizardRoster(tower(7), i), wizardRoster(tower(7), i));
    let diff = 0;
    for (let i = 1; i < 30; i++) {
        const a = wizardRoster(tower(7), i), b = wizardRoster(tower(8), i);
        assert.equal(a.name, b.name);
        if (a.mana !== b.mana) diff++;
    }
    assert.ok(diff > 20);
});

/**
 * A beam clash as Duel._updateClash plays it: both push with duelPower (mana now, health, luck),
 * both spend 1 mana a second and get 1 back; the player shouts «Максима» every 3 s while he has mana,
 * the wizard as readily as his rank does (WizardFight._inClash). → { won, t }
 */
function clash(playerMana, wizMana, rng, maxima = true, skill = 'student') {
    let p = 0.5, t = 0, pm = playerMana, wm = wizMana, boost = 0, boostB = 0, lastMax = -9, wizT = 1.5, luckA = 0, luckB = 0, lt = 0;
    const dt = 1 / 30;
    while (t < 120) {
        t += dt; lt -= dt;
        if (lt <= 0) { lt = 0.5; luckA = (rng() * 2 - 1) * DUEL.LUCK; luckB = (rng() * 2 - 1) * DUEL.LUCK; }
        if (maxima && t - lastMax >= DUEL.MAXIMA_EVERY && pm >= DUEL.MAXIMA_COST) { lastMax = t; pm -= DUEL.MAXIMA_COST; boost++; }
        wizT -= dt;
        if (wizT <= 0) { wizT = DUEL.MAXIMA_EVERY; if (wantsMaxima(skill, wm, rng)) { wm -= DUEL.MAXIMA_COST; boostB++; } }
        const v = clashPush(duelPower(pm, 1, luckA) - duelPower(wm, 1, luckB)) + maximaPush(boost, boostB);
        p = Math.min(1, Math.max(0, p + v * dt + (rng() - 0.5) * 0.02));
        if (p >= 1) return { won: true, t };
        if (p <= 0) return { won: false, t };
    }
    return { won: false, t };
}
const rngOf = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('a player with 50 mana: a beginner can be beaten (the duel lasts), the Master — never', () => {
    let wins = 0;
    for (let s = 1; s <= 40; s++) {
        const r = clash(50, 57, rngOf(s)); // (the strongest beginner)
        if (r.won) wins++;
        assert.ok(r.t > 3, `a duel with a beginner lasts: ${r.t.toFixed(1)} s`);
    }
    assert.ok(wins >= 20, `wins against a beginner: ${wins}/40`);
    for (let s = 1; s <= 40; s++) {
        const r = clash(50, 450, rngOf(s), true, 'master'); // (the weakest Master)
        assert.equal(r.won, false);
        assert.ok(r.t > 1.5, `even the Master takes a moment: ${r.t.toFixed(1)} s`);
    }
    // a teacher: no chance either
    for (let s = 1; s <= 40; s++) assert.equal(clash(50, 170, rngOf(s), true, 'teacher').won, false);
});

test('a wizard\'s duel strength: his mana now on the player\'s scale; out of mana he hardly pushes', () => {
    const W = wizardStats('student', 'novice', 50);
    assert.equal(W.mana, 50);
    assert.equal(W.regen, 1);
    assert.ok(Math.abs(duelStrength('student', 50, W.hp, 0, W.hp) - duelPower(50, 1)) < 1e-9);
    assert.ok(duelStrength('master', 0, 32, 0, 32) < duelPower(30, 1) / 2);
    assert.ok(duelPower(500) > duelPower(200) && duelPower(200) > duelPower(100) && duelPower(100) > duelPower(50));
});

test('a duel counts the mana LEFT and the health now — «Выживание» and «Хардкор» alike; Creative: the opponent\'s mana', async () => {
    const { Duel } = await import('../../src/game/Duel.js');
    const { duelPower } = await import('../../src/game/WizardAI.js');
    const wiz = { wizard: true, mana: 200, hp: 16, maxHp: 16, role: 'teacher' };
    const strength = (mode, fatigue, maxFatigue, hp = 20) => Duel.prototype._strength.call({
        me: 'me', _npcWizard: (id) => (id === 5 ? wiz : null), _playerMana: Duel.prototype._playerMana,
        game: { config: { mode }, combat: { enabled: mode === 'freeworld', fatigue, maxFatigue, hp, maxHp: 20 }, playerHP: hp, maxHP: 20, remotes: new Map() },
    }, 'me', 0, 5);
    assert.equal(strength('freeworld', 40, 120), duelPower(40, 1));
    assert.equal(strength('survival', 40, 120), strength('freeworld', 40, 120), 'Хардкор = Выживание');
    assert.equal(strength('survival', 40, 120, 10), strength('freeworld', 40, 120, 10));
    assert.equal(strength('creative', 30, 30), duelPower(200, 1), 'Creative: as much mana as the wizard');
});
