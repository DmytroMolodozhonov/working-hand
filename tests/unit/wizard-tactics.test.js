// The tower wizards' circle: their own plans (duel spells, shields, the Master), switching when one fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePlan, reviewPlan, remember, begin, newMemory } from '../../src/game/KnightTactics.js';
import { WIZ_PLANS, wizardRoles, planSpell } from '../../src/game/WizardTactics.js';

const base = (o = {}) => ({
    n: 4, start: 4, lost: 0, lostRecent: 0, hpK: 1, manaK: 1, dist: 12, near: 10, air: false, high: false, water: false,
    lying: false, busy: false, noMana: false, shield: false, melee: false, masterAlive: true, masterThreat: false, upper: false, t: 20, ...o,
});
const plan = (sit, mem = newMemory(), now = 100) => choosePlan(sit, mem, now, () => 0, WIZ_PLANS).id;

test('wizard tactics: about ten plans of their own', () => {
    assert.ok(Object.keys(WIZ_PLANS).length >= 10);
});

test('wizard tactics: the opening is a duel; the situation picks the rest', () => {
    assert.equal(plan(base({ t: 0 })), 'duel');
    assert.equal(plan(base({ air: true })), 'ground');
    assert.equal(plan(base({ high: true })), 'ground');
    assert.equal(plan(base({ shield: true })), 'crossfire');
    assert.equal(plan(base({ busy: true })), 'punish');
    assert.equal(plan(base({ noMana: true })), 'punish');
    assert.equal(plan(base({ melee: true, near: 3 })), 'kite');
    assert.equal(plan(base({ n: 1, start: 4, lost: 3 })), 'regroup');
    assert.equal(plan(base({ masterThreat: true })), 'guardMaster');
    assert.equal(plan(base({ lying: true })), 'pin');
    assert.equal(plan(base({ lostRecent: 1, hpK: 0.5 })), 'screen');
});

test('wizard tactics: everything blocked → another way, not the same plan again', () => {
    const mem = newMemory();
    begin(mem, 'duel', 100);
    const res = reviewPlan('duel', base(), { t: 13, hurt: 0, casts: 6, binds: 0, lost: 0 }, WIZ_PLANS);
    assert.equal(res?.fail, true);
    remember(mem, 'duel', res, 113);
    for (let i = 0; i < 30; i++) assert.notEqual(choosePlan(base(), mem, 114, Math.random, WIZ_PLANS).id, 'duel');
    // he came down from the air: «ground» is over
    assert.deepEqual(reviewPlan('ground', base(), { t: 3, hurt: 0, casts: 1, binds: 0, lost: 0 }, WIZ_PLANS), { done: true, why: 'unfit' });
});

test('wizard tactics: roles — the Master leads, students hold the shields, a teacher binds', () => {
    const men = [
        { id: 'm', idx: 0, role: 'master', d: 12, dm: 0 },
        { id: 't', idx: 3, role: 'teacher', d: 10, dm: 5 },
        { id: 's1', idx: 7, role: 'student', d: 9, dm: 6 },
        { id: 's2', idx: 8, role: 'student', d: 11, dm: 7 },
    ];
    const lead = {};
    const sc = wizardRoles('screen', men, { leader: lead });
    assert.equal(lead.id, 'm');
    assert.equal(sc.get('s1'), 'shield');
    assert.equal(sc.get('s2'), 'shield');
    assert.equal(sc.get('m'), 'caster');
    const pin = wizardRoles('pin', men);
    assert.equal(pin.get('t'), 'binder');
    assert.equal(planSpell('pin', 'binder', 'teacher', () => 0.9), 'Stupefy');
    assert.equal(planSpell('ground', 'caster', 'teacher', () => 0.1), 'IceDuel');
    assert.equal(planSpell('ground', 'caster', 'student', () => 0.1), 'Stupefy', 'a student has no Ice');
    const g = wizardRoles('guardMaster', men);
    assert.ok(g.get('m') !== 'guard' && [...g.values()].includes('guard'));
});
