// «Настройки героя» Творческого мира (HeroSetup.js): по умолчанию, мана, броня/мантия, заклинания, дуэль, сохранение, старые миры.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creativeMortal, DEFAULT_HERO, LEGACY_HERO, HERO, normalizeHero, heroOf, heroForSave, creativeInfiniteMana, creativeFiniteMana, manaRules, knownInCreative, duelStrengthOf, duelPercentToPower } from '../../src/game/HeroSetup.js';
import { knows } from '../../src/game/SpellBook.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { isDivine } from '../../src/game/ProtectionGods.js';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { HeroApply } from '../../src/game/HeroApply.js';
import { Steadiness } from '../../src/game/Steadiness.js';

const fakeGame = (hero, mode = 'creative') => {
    const config = { mode, hero };
    const g = { config, hero: heroOf(config), hud: { toast() {}, setVoice() {}, manaShort() {}, setFatigue() {} }, bonus: null };
    g.combat = new Combat(g);
    return g;
};

test('по умолчанию: бесконечная мана, броня и мантия, все заклинания, полная сила, тьма 0, устойчивость 100', () => {
    const d = normalizeHero({});
    assert.deepEqual(d, { infiniteMana: true, cells: 500, armor: true, robe: true, spells: 'all', duelPower: null, dark: 0, breakward: false, steady: 100, health: 'immortal', maxHp: 20, spawn: 'start', noCrew: false });
    assert.deepEqual(d, DEFAULT_HERO);
});

test('границы: ячейки 30…100000, сила 0,4…4,6, тьма 0…100, устойчивость 1…100, мусор → по умолчанию', () => {
    const h = normalizeHero({ cells: 5, duelPower: 0, dark: 500, steady: -3, spells: 'x' });
    assert.equal(h.cells, HERO.CELLS_MIN); assert.equal(h.duelPower, HERO.DUEL_MIN); assert.equal(h.dark, 100); assert.equal(h.steady, 1); assert.equal(h.spells, 'all');
    assert.equal(normalizeHero({ cells: 1e9 }).cells, HERO.CELLS_MAX);
    assert.equal(normalizeHero({ cells: 'abc', duelPower: null }).cells, 500);
    assert.equal(normalizeHero(null).armor, true);
});

test('старый мир без записи: как было — бесконечная мана, все заклинания, БЕЗ брони и мантии', () => {
    const h = heroOf({ mode: 'creative' });
    assert.deepEqual(h, LEGACY_HERO);
    assert.equal(h.armor, false); assert.equal(h.robe, false); assert.equal(h.infiniteMana, true); assert.equal(h.spells, 'all');
    assert.equal(heroForSave({ mode: 'creative' }), undefined);
    assert.equal(heroForSave({ mode: 'freeworld', hero: DEFAULT_HERO }), undefined);
    // запись без поля (в старой версии настроек) дополняется как «старое», а не как «новое»
    assert.equal(heroOf({ mode: 'creative', hero: { cells: 100 } }).armor, false);
});

test('сохранение и загрузка: запись переживает JSON и сеть', () => {
    const cfg = { mode: 'creative', hero: normalizeHero({ infiniteMana: false, cells: 1234, armor: false, robe: true, spells: 'mage', duelPower: 1.8, dark: 7, breakward: true, steady: 55 }) };
    const back = JSON.parse(JSON.stringify(heroForSave(cfg)));
    assert.deepEqual(heroOf({ mode: 'creative', hero: back }), cfg.hero);
});

test('мана: бесконечная / конечная и единая проверка', () => {
    const inf = { config: { mode: 'creative', hero: DEFAULT_HERO }, hero: DEFAULT_HERO, combat: { enabled: false } };
    const fin = { config: { mode: 'creative', hero: { ...DEFAULT_HERO, infiniteMana: false } }, hero: { ...DEFAULT_HERO, infiniteMana: false }, combat: { enabled: false } };
    assert.equal(creativeInfiniteMana(inf), true); assert.equal(creativeFiniteMana(inf), false); assert.equal(manaRules(inf), false);
    assert.equal(creativeInfiniteMana(fin), false); assert.equal(creativeFiniteMana(fin), true); assert.equal(manaRules(fin), true);
    assert.equal(manaRules({ config: { mode: 'freeworld' }, combat: { enabled: true } }), true);
    assert.equal(manaRules({ config: { mode: 'survival' }, combat: { enabled: false } }), false);
});

test('конечная мана в Творческом реально тратится и не уходит в минус; бесконечная — нет', () => {
    const g = fakeGame({ ...DEFAULT_HERO, infiniteMana: false, cells: 100 });
    g.combat.maxFatigue = 100; g.combat.fatigue = 100;
    assert.equal(g.combat.manaOn, true);
    assert.equal(g.combat.check('Bombardo'), null);
    g.combat.pay('Bombardo');
    assert.equal(g.combat.fatigue, 100 - g.combat.costOf('Bombardo'));
    g.combat.fatigue = 1;
    assert.match(g.combat.check('TotalDestruction') || '', /Не хватает маны/);
    g.combat.pay('TotalDestruction');
    assert.equal(g.combat.fatigue, 0);
    assert.equal(g.combat.drain(5, 0.1), false);
    // мана набирается по правилам: +1 в секунду × бонусы
    g.combat._manaTick(2);
    assert.ok(g.combat.fatigue > 1.9 && g.combat.fatigue <= 100);
    const free = fakeGame(DEFAULT_HERO);
    free.combat.fatigue = 7;
    assert.equal(free.combat.manaOn, false);
    free.combat.pay('TotalDestruction');
    assert.equal(free.combat.fatigue, 7);
    assert.equal(free.combat.check('TotalDestruction'), null);
    assert.ok(SPELL_COST.TotalDestruction > 0);
});

test('ячейки: HeroApply ставит максимум; бесконечной мане ничего не меняет', () => {
    const g = fakeGame({ ...DEFAULT_HERO, infiniteMana: false, cells: 800 });
    g.mana = { growth: 3 }; g.bonus = { fatigue: 20 };
    new HeroApply(g).applyMana();
    assert.equal(g.combat.maxFatigue, 823);
    const f = fakeGame(DEFAULT_HERO); const was = f.combat.maxFatigue;
    new HeroApply(f).applyMana();
    assert.equal(f.combat.maxFatigue, was);
});

test('броня и мантия: четыре сочетания', () => {
    for (const [armor, robe] of [[false, false], [true, false], [false, true], [true, true]]) {
        const worn = { helmet: null, chest: null, legs: null, robe: null };
        const g = { config: { mode: 'creative' }, hero: normalizeHero({ armor, robe }), armor: { worn, wear(it) { worn[it.kind === 'robe' ? 'robe' : it.piece] = it; return true; } } };
        new HeroApply(g).dress();
        for (const p of ['helmet', 'chest', 'legs']) assert.equal(!!worn[p], armor, `${p} при armor=${armor}`);
        assert.equal(!!worn.robe, robe);
        for (const it of Object.values(worn)) if (it) assert.equal(it.magic, true);
    }
    // то, что уже надето, не трогаем
    const mine = { kind: 'armor', piece: 'helmet', magic: false };
    const worn = { helmet: mine, chest: null, legs: null, robe: null };
    new HeroApply({ config: { mode: 'creative' }, hero: DEFAULT_HERO, armor: { worn, wear(it) { worn[it.kind === 'robe' ? 'robe' : it.piece] = it; } } }).dress();
    assert.equal(worn.helmet, mine);
});

test('заклинания: «все» — всё; «сильный маг» — всё, кроме божественных и Inspirius', () => {
    const all = { ...DEFAULT_HERO, spells: 'all' }, mage = { ...DEFAULT_HERO, spells: 'mage' };
    for (const s of ['Bombardo', 'TotalDestruction', 'Inspirius', 'FlyingMaxima', 'Boom']) assert.equal(knownInCreative(all, s), true, s);
    for (const s of GOD_SPELLS) { assert.equal(knownInCreative(mage, s), false, s); assert.ok(isDivine(s)); }
    assert.equal(knownInCreative(mage, 'Inspirius'), false);
    for (const s of ['Bombardo', 'TotalDestruction', 'AvadaKedavra', 'Imperius', 'Lumos', 'Hellfire', 'CircleAttack']) assert.equal(knownInCreative(mage, s), true, s);
    // SpellBook: Творческий смотрит на настройки; без настроек (тест, старый мир) — всё как раньше; свиток доучивает
    assert.equal(knows('Boom', { mode: 'creative', hero: mage }), false);
    assert.equal(knows('Boom', { mode: 'creative', hero: mage, spells: { Boom: 1 } }), true);
    assert.equal(knows('Boom', { mode: 'creative', hero: all }), true);
    assert.equal(knows('Boom', { mode: 'creative' }), true);
    assert.equal(knows('Boom', { mode: 'test' }), true);
    assert.equal(knows('Bombardo', { mode: 'creative', hero: mage }), true);
});

test('дуэльная сила — число в единицах боя; старые проценты переводятся', () => {
    assert.equal(DEFAULT_HERO.duelPower, null);
    assert.equal(duelStrengthOf(DEFAULT_HERO, 3.2), 3.2);
    assert.equal(duelStrengthOf({ duelPower: 1.5 }, 3.2), 1.5);
    assert.equal(normalizeHero({ duelPower: 99 }).duelPower, null); // выше максимума — полная
    assert.equal(normalizeHero({ duelPower: 0 }).duelPower, HERO.DUEL_MIN);
    assert.equal(normalizeHero({ duel: 100 }).duelPower, null); // старое сохранение: 100 % = полная
    assert.equal(normalizeHero({ duel: 40 }).duelPower, duelPercentToPower(40));
    assert.equal(normalizeHero({ duel: 1 }).duelPower, HERO.DUEL_MIN);
    assert.doesNotThrow(() => normalizeHero({ duel: 'abc', duelPower: 'x' }));
    assert.equal('duel' in normalizeHero({ duel: 40 }), false);
});

test('устойчивость в Творческом берётся из настроек (по умолчанию 100)', () => {
    const mk = (h) => new Steadiness({ config: { mode: 'creative' }, hero: h });
    assert.equal(mk(DEFAULT_HERO).effective, 100);
    assert.equal(mk({ ...DEFAULT_HERO, steady: 30 }).effective, 30);
    assert.equal(new Steadiness({ config: { mode: 'freeworld' } }).effective, 1);
});

test('здоровье: по умолчанию бессмертен; обычное здоровье включает урон (Combat.enabled) и своё число HP', () => {
    assert.equal(normalizeHero({}).health, 'immortal');
    assert.equal(normalizeHero({ health: 'normal', maxHp: 0 }).maxHp, 1);
    assert.equal(normalizeHero({ health: 'normal', maxHp: 99999 }).maxHp, 1000);
    assert.equal(normalizeHero({ health: 'zzz' }).health, 'immortal');
    assert.equal(heroOf({ mode: 'creative' }).health, 'immortal'); // (старый мир)
    const imm = fakeGame(DEFAULT_HERO), mort = fakeGame({ ...DEFAULT_HERO, health: 'normal', maxHp: 35 });
    assert.equal(imm.combat.enabled, false); assert.equal(creativeMortal(imm), false);
    assert.equal(mort.combat.enabled, true); assert.equal(creativeMortal(mort), true);
    // обычное здоровье при бесконечной мане: мана по-прежнему не тратится
    assert.equal(mort.combat.manaOn, false); assert.equal(manaRules(mort), false);
    mort.combat.fatigue = 9; mort.combat.pay('TotalDestruction');
    assert.equal(mort.combat.fatigue, 9);
    // конечная мана + обычное здоровье: и то и другое
    const both = fakeGame({ ...DEFAULT_HERO, health: 'normal', infiniteMana: false, cells: 60 });
    assert.equal(both.combat.enabled, true); assert.equal(both.combat.manaOn, true);
    // HeroApply ставит максимум HP (+ свитки здоровья)
    mort.bonus = { hp: 5 }; mort.maxHP = 20; mort.playerHP = 20;
    new HeroApply(mort).applyHealth();
    assert.equal(mort.combat.maxHp, 40); assert.equal(mort.combat.hp, 35);
    // «Выживание» не затронуто
    const surv = fakeGame(undefined, 'freeworld');
    assert.equal(surv.combat.enabled, true); assert.equal(surv.combat.manaOn, true);
});

import { SPAWN_SPOTS, SPAWN_IDS, spotTarget, safeNear, normalizeSpawn, pointToward, farTarget, lairCells, spiderSpot } from '../../src/game/SpawnSpots.js';
import { TEST_CAVE, TEST_DRAGON_SPOT } from '../../src/world/Terrain.js';

test('точки появления: список, по умолчанию «Начальная площадка», безопасность, сохранение', () => {
    assert.deepEqual(SPAWN_IDS, ['start', 'dragon', 'queen', 'castle', 'port', 'tower', 'arena', 'village', 'spider', 'blackship']);
    assert.equal(normalizeHero({}).spawn, 'start');
    assert.equal(normalizeHero({ spawn: 'nope' }).spawn, 'start');
    assert.equal(normalizeHero({ spawn: 'dragon' }).spawn, 'dragon');
    assert.equal(spotTarget('start'), null);
    for (const s of SPAWN_SPOTS) assert.ok(s.label && s.hint, s.id);
    // дракон: ~55 м от него, не внутри (его площадка r = 14), ближе к постаментам
    const d = spotTarget('dragon');
    const dd = Math.hypot(d.x - TEST_DRAGON_SPOT.x, d.z - TEST_DRAGON_SPOT.z);
    assert.ok(dd > TEST_DRAGON_SPOT.r + 20 && dd < 70, `dragon distance ${dd}`);
    assert.ok(Math.hypot(d.x, d.z) < Math.hypot(TEST_DRAGON_SPOT.x, TEST_DRAGON_SPOT.z));
    // Королева: перед дворцом (радиус 26), не в нём
    const q = spotTarget('queen');
    const qd = Math.hypot(q.x - (TEST_CAVE.X - 6), q.z - (TEST_CAVE.Z - 4));
    assert.ok(qd > 26 && qd < 60, `queen distance ${qd}`);
    // замок: ворота даёт мир; нет ворот — нет точки (остаёмся на старте)
    assert.equal(spotTarget('castle', { castleGate: () => null }), null);
    assert.deepEqual(spotTarget('castle', { castleGate: () => ({ x: 10.4, z: -90.2, yaw: 1 }) }), { x: 10, z: -90, yaw: 1 });
    // безопасное место: вода пропускается, кольцо вокруг цели
    const t = { x: 0, z: 0 };
    assert.deepEqual(safeNear(t, () => true), { x: 0, z: 0 });
    const at = safeNear(t, (x, z) => Math.hypot(x, z) >= 5.5);
    assert.ok(at && Math.hypot(at.x, at.z) >= 5.5);
    assert.equal(safeNear(t, () => false), null);
    assert.deepEqual(pointToward({ x: 100, z: 0 }, { x: 0, z: 0 }, 40), { x: 60, z: 0 });
    // сохранение в мире
    const cfg = { mode: 'creative', hero: normalizeHero({ spawn: 'queen' }) };
    assert.equal(heroOf({ mode: 'creative', hero: JSON.parse(JSON.stringify(heroForSave(cfg))) }).spawn, 'queen');
    assert.equal(heroOf({ mode: 'creative' }).spawn, 'start'); // старый мир
    assert.equal(normalizeSpawn('castle'), 'castle');
});

test('дальние места старта: башня, арена, поселение, порт, паучиха; «без моряков»', () => {
    const tower = { gate: { x: 100.4, z: -50.2 }, gateYaw: 2 };
    const sites = { towers: { only: () => tower }, arenas: { ofTower: () => ({ gates: [{ out: { x: 10, z: 0 } }], centre: { x: 10, z: 20 } }) }, villages: { spawnVillage: () => ({ gx: 1, gz: 2, x: 500, z: 600 }), tpSpot: () => ({ x: 490, z: 600 }) } };
    assert.deepEqual(farTarget('tower', { sites }), { x: 100, z: -50, yaw: 2 });
    const a = farTarget('arena', { sites });
    assert.equal(a.x, 10); assert.ok(Math.abs(a.yaw) < 1e-9); // (faces the arena's middle: +z)
    assert.equal(farTarget('village', { sites }).x, 490);
    assert.deepEqual(farTarget('port', {}, { port: () => ({ x: 5.2, z: 7 }) }), { x: 5, z: 7, yaw: Math.PI });
    for (const id of ['tower', 'arena', 'village', 'port']) assert.equal(farTarget(id, {}), null, id); // (no such place: the hero stays at the start)
    const cells = lairCells(400, 2, { x: 0, z: 0 });
    assert.equal(cells.length, 25);
    assert.ok(Math.hypot(cells[0].gx + 0.5, cells[0].gz + 0.5) <= Math.hypot(cells[24].gx + 0.5, cells[24].gz + 0.5));
    const sp = spiderSpot({ x: 300, z: 0 }, { x: 0, z: 0 });
    assert.equal(sp.x, 272);
    assert.equal(normalizeHero({}).noCrew, false);
    assert.equal(normalizeHero({ noCrew: true }).noCrew, true);
});
