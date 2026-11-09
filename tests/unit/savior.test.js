// Author 09.11: each wizard killed has a separate chance equal to the killer’s true black-magic level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVIOR, STAGES, stageOf, VisitCooldown, saviorComes, saviorLine, SAVIOR_LINES, WHITE_SPELLS, SAVIOR_SPECIAL, pickSpecial, dangerNow, saviorEntry, GX0, SAVIOR_TARGETS } from '../../src/game/SaviorRules.js';
import { WIZ, WIZ_RANKS, wizardStats, pickSpell, WIZARD_ROLES } from '../../src/game/WizardAI.js';
import { Savior } from '../../src/game/Savior.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';

test('each wizard kill uses black-magic level as its percentage chance, without a count or time window', () => {
    for (const level of [0, 1, 5, 20, 50, 85, 100]) {
        let yes = 0;
        for (let i = 0; i < 10000; i++) yes += saviorComes(level, () => i / 10000);
        assert.equal(yes, level * 100);
    }
    assert.equal(saviorComes(-1, () => 0), false);
    assert.equal(saviorComes(1000, () => 0.99999), true);
});

test('visit cooldown expires and removes old sessions without a kill-history collection', () => {
    const w = new VisitCooldown(); w.rest('p', 0);
    assert.equal(w.resting('p', 1), true);
    assert.equal(w.resting('p', SAVIOR.COOLDOWN_S + 1), false);
    assert.equal(w.until.size, 0);
});

test('the stages: 700 mana, then 1500 for good; the entry is the same on every computer', () => {
    assert.equal(STAGES[0].mana, 700); assert.equal(STAGES[1].mana, 1500);
    assert.equal(stageOf(5).n, 1);
    const a = saviorEntry(GX0 + 3, 1), b = saviorEntry(GX0 + 3, 1);
    assert.deepEqual(a, b);
    assert.equal(a.mana, 1500); assert.equal(a.rank, 'savior'); assert.equal(a.role, 'savior');
    assert.notEqual(saviorEntry(GX0, 0).name, saviorEntry(GX0, 1).name); // (a little different)
    assert.equal(WIZ_RANKS.savior.mana, 700);
    assert.ok(WIZARD_ROLES.includes('savior'));
    assert.equal(wizardStats('savior', 'savior', 1500).mana, 1500);
});

test('only BLUE spells (the author 08.11): the duel charge is «Электром» alone; no Dust, Stupefy, Jolt, Ice, Expelliarmus, nothing dark', () => {
    assert.deepEqual(Object.keys(WIZ.savior.spells), ['Electrum']);
    assert.deepEqual([...SAVIOR_SPECIAL].sort(), ['Bombardo', 'BombardoMaxima', 'WindMaxima']);
    for (const s of [...WHITE_SPELLS, ...Object.keys(WIZ.savior.spells)]) assert.ok(!DARK_SPELLS.has(s) && !/Sands|Stupefy|Jolt|Ice|Expelliarmus|Sapira|Avada/.test(s), s);
    for (let i = 0; i < 500; i++) assert.equal(pickSpell('savior', () => (i + 0.5) / 500), 'Electrum');
    assert.ok(WIZ.savior.dome.hits > WIZ.master.dome.hits && WIZ.savior.dome.t > WIZ.master.dome.t && WIZ.savior.dome.cd < WIZ.master.dome.cd);
    assert.ok(SAVIOR.SPEED_K > 1);
});

test('Bombardo Maxima only if he saw the player use it; the plain Bombardo if the player used any; the wind close or now and then', () => {
    const base = { cd: {}, dist: 20, mana: 500 };
    assert.equal(pickSpecial({ ...base, seen: {}, rng: () => 0.5 }), null, 'a bomb never out of the blue');
    assert.equal(pickSpecial({ ...base, seen: { BombardoMaxima: 5 }, rng: () => 0.5 }), 'BombardoMaxima');
    assert.equal(pickSpecial({ ...base, seen: { Bombardo: 5 }, rng: () => 0.5 }), 'Bombardo');
    assert.equal(pickSpecial({ ...base, seen: { Bombardo: 100 }, rng: () => 0.5 }), null, 'seen long ago: not counted');
    assert.equal(pickSpecial({ ...base, seen: { BombardoMaxima: 5 }, cd: { BombardoMaxima: 4 }, rng: () => 0.5 }), 'Bombardo', 'the Maxima rests: the plain one');
    assert.equal(pickSpecial({ ...base, dist: 5, seen: {}, rng: () => 0.5 }), 'WindMaxima');
    assert.equal(pickSpecial({ ...base, dist: 5, seen: {}, mana: 3, rng: () => 0.5 }), null, 'no mana: nothing');
});

test('the flight is the insurance: a danger = hurt badly, little mana, or a burst of damage', () => {
    assert.equal(dangerNow({ hpK: 1, manaK: 1, burst: 0 }), false);
    assert.equal(dangerNow({ hpK: 0.45 }), true);
    assert.equal(dangerNow({ manaK: 0.1 }), true);
    assert.equal(dangerNow({ burst: 0.35 }), true);
    assert.ok(SAVIOR.SKY_H > 10 && SAVIOR.AIR_SPEED > 10 && SAVIOR.FLY_H < SAVIOR.SKY_H);
});

test('up to ten prepared lines, never the same twice in a row', () => {
    const all = Object.values(SAVIOR_LINES).flat();
    assert.ok(all.length >= 6 && all.length <= 10, String(all.length));
    assert.ok(SAVIOR_LINES.fly.length >= 1, 'a line for the flight away');
    let last = null; for (let i = 0; i < 50; i++) { const s = saviorLine('attack', last); assert.notEqual(s, last); last = s; }
    assert.ok(SAVIOR_TARGETS.me.why);
});

test('the system: kills of wizards only; one at a time; a beaten Saviour → stage 1 and two game days of peace', () => {
    const spawned = [];
    const life = { _isPlayer: (id) => id === 'p', _playerPos: () => ({ x: 0, y: 0, z: 0 }) };
    const g = { authority: true, localId: 'H', dark: { level: 0 }, remotes: new Map([['p', { blackLevel: 50, dark: 0 }]]), castleLife: life, hud: { setVoice() {} } };
    const S = new Savior(g);
    S._spawn = (by) => { spawned.push(by); S.v = { dead: false }; return true; };
    const wiz = { wizard: true }, man = { wizard: false };
    for (let i = 0; i < 10; i++) S.noteKill('p', man); // (not wizards: nothing is counted)
    assert.equal(spawned.length, 0);
    const realRandom = Math.random; Math.random = () => 0.1; // (the roll passes)
    try { for (let i = 0; i < 10; i++) S.noteKill('p', wiz); } finally { Math.random = realRandom; }
    assert.deepEqual(spawned, ['p']);
    // beaten
    const v = { savior: 0 }; S.v = v;
    S.onDeath(v, 'p');
    assert.equal(S.stageOf('p').mana, 1500);
    assert.ok(S.resting('p'));
    S.watch.until.clear();
    Math.random = () => 0.1;
    try { for (let i = 0; i < 12; i++) S.noteKill('p', wiz); } finally { Math.random = realRandom; }
    assert.equal(spawned.length, 1, 'two game days of peace: nobody comes');
    S.update(2 * 24 * 60 + 5); // two game days pass
    assert.ok(!S.resting('p'));
    Math.random = () => 0.1;
    try { S.noteKill('p', wiz); } finally { Math.random = realRandom; }
    assert.equal(spawned.length, 2, 'the very first wizard kill after the rest has its own roll');
    // saved
    const S2 = new Savior(g); S2.restore(JSON.parse(JSON.stringify(S.snapshot())));
    assert.equal(S2.stageOf('p').mana, 1500);
});

test('a crowd of enemies: he blasts and winds without having seen a Bombardo', () => {
    assert.equal(pickSpecial({ seen: {}, cd: {}, dist: 20, mana: 200, crowd: 3, rng: () => 0.9 }), 'Bombardo');
    assert.equal(pickSpecial({ seen: {}, cd: { Bombardo: 5 }, dist: 20, mana: 200, crowd: 3, rng: () => 0.9 }), 'WindMaxima');
    assert.equal(pickSpecial({ seen: {}, cd: {}, dist: 20, mana: 200, crowd: 1, rng: () => 0.9 }), null);
});

test('Saviour: hovering, rocket and every aerial phase spend mana; exhaustion grounds him and cancels magic', async () => {
    const { FLIGHT } = await import('../../src/game/Flight.js');
    const { FX } = await import('../../src/fx/WizardFx.js');
    for (const phase of ['hover', 'rocket', 'up', 'away', 'strafe', 'land']) {
        const S = new Savior({ authority: true, castleLife: { wizards: { fight: { _shatter() {} } } } });
        const v = S.v = { mana: 100, maxMana: 700, fly: true, hp: 60, speed: 0, fx: 0 };
        if (phase === 'rocket') S.rocket = true;
        else if (phase !== 'hover') S.air = { st: phase };
        S.manaStep(v, 1);
        assert.equal(v.mana, 101 - (phase === 'hover' ? FLIGHT.HOVER_COST : FLIGHT.COST), phase);
        v.fx = FX.DOME; v.domeT = 1000; v.prep = { spell: 'Bombardo' };
        for (let i = 0; i < 200 && v.fly; i++) S.manaStep(v, 1);
        assert.equal(v.fly, false, `${phase}: cannot fly forever`);
        assert.equal(v.mana, 0); assert.ok(v.vy < 0);
        assert.equal(v.prep, null); assert.equal(v.fx & FX.DOME, 0); assert.equal(S.air, null);
        S.manaStep(v, 1);
        assert.equal(v.mana, 1, 'regenerates on the ground');
        assert.equal(v.fly, false, 'regeneration does not restore free flight');
    }
});

test('Saviour: spells cost the same as player spells, are paid once at release, and cannot cast when short', async () => {
    const { SPELL_COST } = await import('../../src/game/Combat.js');
    const { WizardFight } = await import('../../src/game/WizardFight.js');
    const foe = { x: 0, y: 1.95, z: -10 };
    const F = new WizardFight({ life: { _playerPos: () => foe }, game: { duel: { clashes: [] } } });
    F.clearShot = () => true; F._cast = () => true;
    for (const spell of WHITE_SPELLS) {
        const v = { id: 's', savior: 0, x: 0, y: 0, z: 0, yaw: 0, mana: 100, W: { cast: 1 } };
        assert.ok(F._begin(v, spell, 'p', foe, { cost: 1 }));
        assert.equal(v.mana, 100, 'preparation alone does not pay');
        F._prepTick(v, 0.5);
        assert.equal(v.mana, 100 - SPELL_COST[spell], spell);
        F._prepTick(v, 0.5);
        assert.equal(v.mana, 100 - SPELL_COST[spell], 'no double charge');
        v.mana = SPELL_COST[spell] - 1;
        assert.equal(F._begin(v, spell, 'p', foe), false, spell + ': not enough mana');
    }
});

test('Saviour: blink and aerial healing have a budget; failed blink is free', async () => {
    const { WizardFight } = await import('../../src/game/WizardFight.js');
    const { SPELL_COST } = await import('../../src/game/Combat.js');
    const L = { _groundSpot: () => ({ x: 0, y: 0, z: -12 }), _walkable: () => true, _say() {} };
    const F = new WizardFight({ life: L, game: {}, fx: { smoke() {} } });
    const v = { savior: 0, mana: SPELL_COST.Flight, x: 0, y: 0, z: 0, W: { blink: { cd: 12 } } };
    F._blink(v, { x: 0, z: 1 });
    assert.equal(v.mana, 0); assert.equal(v.z, -12);
    v.z = 0; F._blink(v, { x: 0, z: 1 });
    assert.equal(v.z, 0, 'no free blink at zero');
    v.mana = 30; L._walkable = () => false;
    F._blink(v, { x: 0, z: 1 }); assert.equal(v.mana, 30, 'failed blink is not paid');
    const S = new Savior({});
    Object.assign(v, { hp: 55, maxHp: 60, mana: 2 });
    S._heal(v, 4); assert.equal(v.hp, 57); assert.equal(v.mana, 0);
    S._heal(v, 4); assert.equal(v.hp, 57, 'cannot heal with empty mana');
});
