// «Волшебник-спаситель» (the author 08.11): 10 wizards in 2 min → 50 %; beaten → 2 game days of peace, then 1500 mana after 5 killed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVIOR, STAGES, stageOf, KillWatch, saviorComes, saviorLine, SAVIOR_LINES, WHITE_SPELLS, SAVIOR_SPECIAL, pickSpecial, dangerNow, saviorEntry, GX0, SAVIOR_TARGETS } from '../../src/game/SaviorRules.js';
import { WIZ, WIZ_RANKS, wizardStats, pickSpell, WIZARD_ROLES } from '../../src/game/WizardAI.js';
import { Savior } from '../../src/game/Savior.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';

test('the first one: 10 killed within 2 minutes; the window slides; the count is emptied after it', () => {
    const w = new KillWatch();
    for (let i = 0; i < 9; i++) assert.equal(w.note('p', i * 10), false);
    assert.equal(w.note('p', 100), true); // (the tenth, 100 s: inside the 120 s)
    assert.equal(w.note('p', 101), false);
    const s = new KillWatch();
    for (let i = 0; i < 9; i++) s.note('q', i * 20); // (one in 20 s: the first falls out of the window)
    assert.equal(s.note('q', 180), false);
});

test('later ones: 5 killed are enough; the roll is 50 %', () => {
    const w = new KillWatch();
    for (let i = 0; i < 4; i++) assert.equal(w.note('p', i, STAGES[1].kills), false);
    assert.equal(w.note('p', 5, STAGES[1].kills), true);
    let k = 0; for (let i = 0; i < 4000; i++) if (saviorComes(() => i / 4000)) k++;
    assert.ok(Math.abs(k / 4000 - 0.5) < 0.01);
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
    const g = { authority: true, castleLife: life, hud: { setVoice() {} } };
    const S = new Savior(g);
    S._spawn = (by) => { spawned.push(by); return true; };
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
    try { for (let i = 0; i < 4; i++) S.noteKill('p', wiz); assert.equal(spawned.length, 1); S.noteKill('p', wiz); } finally { Math.random = realRandom; }
    assert.equal(spawned.length, 2, 'five wizards after the peace bring the next one');
    // saved
    const S2 = new Savior(g); S2.restore(JSON.parse(JSON.stringify(S.snapshot())));
    assert.equal(S2.stageOf('p').mana, 1500);
});
