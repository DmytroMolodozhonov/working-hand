import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL_COUNT, GOAL_LIST, THEMES, goalOf, heroThemes, fit, roadTogether, mayAsk, askNeeds, reactToMagic, burnoutChance } from '../../src/game/Lives.js';
import { characterOf } from '../../src/game/Attitude.js';

test('about two hundred goals, all different, each of a known theme', () => {
    assert.ok(GOAL_COUNT >= 200, `${GOAL_COUNT}`);
    assert.equal(new Set(GOAL_LIST.map((g) => g.text)).size, GOAL_LIST.length, 'no repeats');
    for (const g of GOAL_LIST) assert.ok(THEMES[g.theme], g.theme);
});

test('a person\'s goal is his own for good, and fits his trade — but not always', () => {
    assert.deepEqual(goalOf(4242, 'knight'), goalOf(4242, 'knight'));
    const count = (role, wiz, themes) => { let n = 0; for (let s = 1; s <= 600; s++) if (themes.includes(goalOf(s * 7919, role, wiz).theme)) n++; return n / 600; };
    const k = count('knight', false, ['valor', 'honor', 'justice', 'fame']), w = count('wizard', true, ['magic', 'knowledge']), f = count('farmer', false, ['land', 'family', 'peace']);
    assert.ok(k > 0.45 && k < 0.9, `knights ${k}`);
    assert.ok(w > 0.55 && w < 0.95, `wizards ${w}`);
    assert.ok(f > 0.45 && f < 0.9, `farmers ${f}`);
    assert.ok(count('knight', false, ['magic']) > 0, 'a knight may dream of magic: "не обязательно"');
    assert.ok(count('knight', false, ['magic', 'knowledge', 'land', 'trade', 'craft']) < 0.3);
});

test('the hero\'s goal in words → themes', () => {
    assert.ok(heroThemes('моя цель убить дракона').includes('valor'));
    assert.ok(heroThemes('я хочу найти клад').includes('adventure'));
    assert.ok(heroThemes('хочу стать великим магом').includes('magic'));
    assert.ok(heroThemes('построить замок').includes('craft'));
    assert.deepEqual(heroThemes('привет как дела'), []);
    assert.equal(fit({ theme: 'valor' }, ['valor']), 1);
    assert.equal(fit({ theme: 'honor' }, ['valor']), 0.5);
    assert.equal(fit({ theme: 'land' }, ['valor']), 0);
});

test('going on the road together: friends join, close ones help for a while, strangers and the stubborn do not', () => {
    const c = { brave: 60, helpful: 60, temper: 30 };
    const knightGoal = { theme: 'valor', importance: 0.5, flex: 0.6 };
    const farmGoal = { theme: 'land', importance: 0.8, flex: 0.4 };
    const hero = ['valor'];
    assert.equal(roadTogether({ sub: 0, fr: 0, lv: 0 }, c, knightGoal, hero).answer, 'refuse');
    assert.equal(roadTogether({ sub: 0, fr: 0, lv: 0 }, c, knightGoal, hero).why, 'stranger');
    assert.equal(roadTogether({ sub: 0, fr: 70, lv: 0 }, c, knightGoal, hero).answer, 'join', 'a close friend whose goal is like mine');
    assert.equal(roadTogether({ sub: 0, fr: 70, lv: 0 }, c, farmGoal, hero).answer === 'join', false, 'a farmer tied to his land does not just leave');
    const farm = roadTogether({ sub: 0, fr: 85, lv: 0 }, c, farmGoal, hero);
    assert.ok(['help', 'later', 'refuse'].includes(farm.answer));
    const help = roadTogether({ sub: 0, fr: 56, lv: 0 }, c, { theme: 'adventure', importance: 0.8, flex: 0.9 }, ['valor']);
    assert.ok(help.answer === 'help' || help.answer === 'later', help.answer);
    assert.equal(roadTogether({ sub: 0, fr: 90, lv: 0 }, c, { theme: 'valor', importance: 0.5 }, hero, { role: 'king' }).answer, 'refuse', 'a king does not go');
});

test('love can go where friendship stays', () => {
    const c = { brave: 50, helpful: 50 };
    const g = { theme: 'adventure', importance: 0.7, flex: 0.5 };
    assert.notEqual(roadTogether({ sub: 0, fr: 20, lv: 0 }, c, g, []).answer, 'join');
    assert.equal(roadTogether({ sub: 0, fr: 20, lv: 80 }, c, g, []).answer, 'join');
});

test('a wizard keeps his house, money and wand: friends get little; love gets more; the wand only for love', () => {
    const c = { greed: 40, trust: 45 };
    const eff = (fr, lv = 0) => ({ sub: 0, fr, lv });
    assert.equal(mayAsk('enter', eff(45), c, 'wizard', true).yes, true);
    assert.equal(mayAsk('enter', eff(20), c, 'wizard', true).yes, false);
    assert.equal(mayAsk('rummage', eff(60), c, 'wizard', true).yes, false, 'a wizard guards his things more');
    assert.equal(mayAsk('rummage', eff(75), c, 'wizard', true).yes, true);
    assert.equal(mayAsk('loan', eff(75), c, 'wizard', true).yes, false);
    assert.equal(mayAsk('wand', eff(100), c, 'wizard', true).yes, false, 'even the best friend does not get the wand');
    assert.equal(mayAsk('wand', eff(100, 95), c, 'wizard', true).yes, true);
    assert.equal(mayAsk('wand', eff(100, 95), c, 'wizard', true).by, 'love');
    assert.equal(mayAsk('house', eff(100, 99), c, 'wizard', true).yes, false, 'the house — only total love');
    assert.equal(mayAsk('house', eff(100, 100), c, 'wizard', true).yes, true);
    // a greedy man asks more for money
    assert.ok(askNeeds('loan', { greed: 90 }, 'merchant').fr > askNeeds('loan', { greed: 10 }, 'farmer').fr);
});

test('seeing magic: the kind and the impressed praise it, the proud wizard and the sour sneer; a great spell frightens the timid', () => {
    const eff = { sub: 0, fr: 10, lv: 0 };
    assert.equal(reactToMagic(0.9, eff, { trust: 70, kindness: 80, brave: 60 }, 0.4, 0.8).kind, 'wow');
    assert.ok(['sneer', 'meh'].includes(reactToMagic(0.2, eff, { trust: 20, kindness: 20, brave: 70 }, -0.5, 0.2).kind));
    assert.equal(reactToMagic(0.2, eff, { trust: 20, kindness: 20, brave: 70 }, -0.5, 0.1).kind, 'sneer');
    assert.equal(reactToMagic(0.9, { sub: 0, fr: 0, lv: 0 }, { trust: 20, kindness: 30, brave: 10 }, -0.3, 0.3).kind, 'afraid');
    assert.notEqual(reactToMagic(0.5, eff, { trust: 60, kindness: 60, brave: 50 }, 0, 0.5, { wizard: true }).kind, 'wow', 'a wizard is hard to impress');
    assert.ok(reactToMagic(0.2, eff, { kindness: 20 }, -0.5, 0.1).f < 0);
});

test('tired of friendship: a forgotten, wronged friend with a short temper; a kind one in love hardly ever', () => {
    const base = { sub: 0, fr: 40, lv: 0 };
    assert.equal(burnoutChance({ sub: 0, fr: 0, lv: 0 }, {}, { minutesSinceTalk: 999 }), 0);
    const neglected = burnoutChance(base, { temper: 70, kindness: 30 }, { minutesSinceTalk: 100, grievances: 3 });
    const loved = burnoutChance({ sub: 0, fr: 40, lv: 70 }, { temper: 20, kindness: 80 }, { minutesSinceTalk: 100, grievances: 0 });
    assert.ok(neglected > loved * 2 && neglected > 0.05);
    assert.equal(burnoutChance(base, characterOf(5, 'farmer'), { minutesSinceTalk: 5 }) < 0.02, true, 'a friend seen lately is fine');
});
