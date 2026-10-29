// «Pentagranium Sanguinis» — чудовищная живучесть: максимум ХП растёт на максимум ХП жертвы, убитой ЧЁРНОЙ магией; каждый обряд прибавляет;
// смерть забирает в тело (Legacy), «Give Me My Power» возвращает. Учтённые «а если»: кости, тело не от чёрной магии, тело героя с силой, двое в круге, выход из круга.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VITAL, bodyOk, gainOf, grownMax, standersOk, darkHit, DARK_DEATH, VITALITY_TARGETS } from '../../src/game/VitalityRules.js';
import { isDark, DarkHero } from '../../src/game/DarkMagic.js';
import { PENT_NAMES, pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { CAST_COST, figureOf, figureIds } from '../../src/game/PentagramRules.js';
import { Vitality } from '../../src/game/Vitality.js';
import { Mana } from '../../src/game/Mana.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('the pentagram: its own name, black, 250 mana, its own drawing, a scroll that any source of scrolls can give', () => {
    assert.equal(PENT_NAMES.vitality.en, 'Sanguinis');
    assert.equal(pentagramSpell('vitality'), 'Pentagranium Sanguinis');
    assert.equal(pentagramWords('pentagranium sanguinis'), 'vitality');
    assert.equal(pentagramWords('пентаграниум сангвинис'), 'vitality');
    assert.equal(pentagramWords('пентаграниум вита'), 'life', 'Vita is another pentagram');
    assert.equal(matchSpell('пентаграниум сангвинис'), 'Pentagranium');
    assert.equal(PENTAGRAMS.vitality.dark, true);
    assert.equal(CAST_COST.vitality, 250);
    assert.equal(VITAL.COST, 250);
    assert.ok(figureOf('vitality') && figureIds().includes('vitality'));
});

test('the body: only a humanoid killed by BLACK magic, not bones, not a hero with his power, not used twice', () => {
    assert.equal(bodyOk({ k: 'v', dk: 1, mh: 20 }).ok, true);
    assert.equal(bodyOk({ k: 'p', dk: 1, mh: 40 }).ok, true, 'a killed player');
    assert.equal(bodyOk({ k: 'v', dk: 1 }, { multiplayer: true }).ok, true, 'online: any humanoid killed by black magic');
    assert.match(bodyOk({ k: 'v', mh: 20 }).why, /не годится.*не чёрной магией/, 'killed by a plain blow');
    assert.match(bodyOk({ k: 'v', dk: 1, bones: true }).why, /Кости/);
    assert.match(bodyOk({ k: 'v', dk: 1, stage: 'bones' }).why, /Кости/);
    assert.match(bodyOk({ k: 'p', dk: 1, lg: { hp: 4 } }).why, /сила героя/);
    assert.match(bodyOk({ k: 'v', dk: 1, rit: 1 }).why, /уже отдано/);
    assert.match(bodyOk({ k: 'a', dk: 1 }).why, /человекоподобного/, 'an animal');
    assert.equal(bodyOk(null).ok, false);
});

test('black blows: the black spells, the Hellfire, the living tree; not a plain spell or a blade', () => {
    assert.ok(darkHit({ hell: true }) && darkHit({ dark: true }) && darkHit({ via: 'alive' }));
    assert.ok(darkHit({ kind: 'AvadaKedavra' }, isDark) && darkHit({ kind: 'Accentric' }, isDark));
    assert.ok(!darkHit({ kind: 'Bombardo' }, isDark) && !darkHit({ spell: true }) && !darkHit({ weapon: true }) && !darkHit(null));
    assert.ok(DARK_DEATH.has('avada') && DARK_DEATH.has('Hellfire') && !DARK_DEATH.has('fall'));
});

test('the gain is the victim\'s MAXIMUM (20, 23, 60…), never zero; every rite adds', () => {
    assert.equal(gainOf({ mh: 20 }), 20);
    assert.equal(gainOf({ mh: 23 }), 23);
    assert.equal(gainOf({ mh: 60 }), 60);
    assert.equal(gainOf({}), VITAL.BASE_HP, 'no record: a man has 20');
    assert.equal(gainOf({ mh: 0 }), VITAL.BASE_HP);
    assert.ok(gainOf({ mh: 1e12 }) <= VITAL.GAIN_MAX);
    assert.equal(grownMax(20, 20), 40);
    assert.equal(grownMax(40, 20), 60);
    assert.equal(grownMax(60, 20), 80);
    assert.ok(standersOk(1) && !standersOk(2) && !standersOk(0), 'one hero in the circle');
});

function hero() {
    const g = {
        localId: 'me', authority: true, remotes: new Map(), maxHP: 20, playerHP: 20,
        character: { group: { position: { x: 0, y: 0, z: 0, clone() { return { ...this }; } } } },
        combat: {
            enabled: true, maxFatigue: 30, fatigue: 30, maxHp: 20, hp: 20,
            addMaxFatigue(n) { this.maxFatigue += n; },
            addMaxHp(n) { this.maxHp += n; this.hp = Math.min(this.maxHp, this.hp + n); },
        },
        sync: { achCredit() {}, ach() {} },
        hud: { notify() {}, setVoice() {}, update() {} }, perf: { note() {} },
        books: { learned: new Set() },
        bonus: { hp: 0, fatigue: 0 }, dark: new DarkHero(null),
    };
    g.mana = new Mana(g);
    g.achievements = { onDeath() {}, gain() { return false; }, done: new Set() };
    return g;
}

test('the blood is taken in: the maximum health grows (the bar gets longer), +10 black; again and again', () => {
    const g = hero(), v = new Vitality(g);
    assert.equal(v.apply(20), 40);
    assert.equal(g.combat.maxHp, 40);
    assert.equal(g.combat.hp, 40, 'the new cells are full');
    assert.equal(g.bonus.hp, 20);
    assert.equal(g.dark.level, VITAL.DARK);
    assert.equal(v.apply(23), 63);
    assert.equal(g.maxHP, 63);
    assert.equal(g.bonus.hp, 43);
    assert.equal(g.dark.level, 20);
    for (let i = 0; i < 12; i++) v.apply(20);
    assert.equal(g.dark.level, 100, 'the darkness stops at 100');
    assert.equal(g.maxHP, 63 + 240);
});

test('a hurt hero keeps his wound: only the maximum and the new cells grow', () => {
    const g = hero(), v = new Vitality(g);
    g.combat.hp = 5; g.playerHP = 5;
    v.apply(20);
    assert.equal(g.combat.maxHp, 40);
    assert.equal(g.combat.hp, 25);
});

test('free world without the combat module: the plain counters grow', () => {
    const g = hero(), v = new Vitality(g);
    g.combat.enabled = false;
    v.apply(20);
    assert.equal(g.maxHP, 40);
    assert.equal(g.playerHP, 40);
    assert.equal(g.bonus.hp, 20);
});

test('death takes the grown health into the body; «Give Me My Power» brings it back, and it replaces — it is not added', () => {
    const g = hero(), v = new Vitality(g);
    v.apply(20); v.apply(20);
    assert.equal(g.combat.maxHp, 60);
    const lg = captureLegacy(g);
    assert.equal(lg.hp, 40, 'the legacy holds the ritual health');
    wipeHero(g);
    assert.equal(g.combat.maxHp, 20, 'death took it');
    assert.equal(g.bonus.hp, 0);
    g.combat.hp = 20;
    absorbLegacy(g, lg);
    assert.equal(g.combat.maxHp, 60);
    assert.equal(g.bonus.hp, 40);
});

test('the table «who / what» is written for every kind', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'iceCastle', 'dragon', 'bodies', 'items', 'ground', 'spells']) assert.ok(VITALITY_TARGETS[k]?.why, k);
});

test('scan: a hint for every wrong thing and no rite (no body, stranger body, two in the circle, flying)', () => {
    const said = [];
    const g = hero();
    g.hud.setVoice = (t) => said.push(t);
    g.character.onGround = true;
    g.character.group.position.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; };
    g.death = { bodies: new Map(), falling: new Set() };
    const mark = { id: 'm1', pent: 'vitality', fade: 1, x: 0, y: 0, z: 0, r: 3.5, anim: null };
    g.pentagranium = { marks: new Map([['m1', mark]]) };
    g.character.group.position.y = 2; // (feet at 0: PLAYER_GROUND_OFFSET 2)
    const v = new Vitality(g);
    const tick = () => { v._scanT = 0; v.update(0.4); };
    tick();
    assert.ok(said.at(-1)?.includes('тело'), 'no body: the hint');
    g.death.bodies.set('b1', { id: 'b1', k: 'v', x: 1, y: 0, z: 0, mh: 20 });
    tick();
    assert.match(said.at(-1), /не годится/, 'a body killed by a plain blow');
    g.death.bodies.set('b1', { id: 'b1', k: 'v', x: 1, y: 0, z: 0, mh: 20, dk: 1 });
    g.remotes.set('p2', { position: { x: 1, y: 2, z: 1 } });
    tick();
    assert.match(said.at(-1), /вдвоём/, 'two in the circle');
    g.remotes.clear();
    g.character.onGround = false;
    tick();
    assert.match(said.at(-1), /летите|плывёте/, 'in the air');
    assert.equal(v.run, null, 'no rite started in any of them');
});
