// The two white pentagrams of protection (ResistRules.js, PentagramResist.js): numbers, the opposites, the fire table, the scrolls, the hooks in the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESIST, fireFactor, darkFactor, canGetDarkWard, canBreakProtection, keepsDarkWard, findFlowers, findFireHeart, FIRE_OK, HELL_FIRE } from '../../src/game/ResistRules.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { figureOf, pentagramScroll } from '../../src/game/PentagramRules.js';
import { pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { PentagramResist } from '../../src/game/PentagramResist.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('обе пентаграммы — БЕЛЫЕ (не чёрная магия), постоянные, по 150 маны, со своим рисунком, именем и свитком', () => {
    for (const id of ['darkward', 'fireward']) {
        const d = PENTAGRAMS[id];
        assert.ok(d && d.dark === false, id + ' белая');
        assert.equal(d.permanent, true); assert.equal(d.cost, 150);
        assert.ok(figureOf(id), 'рисунок ' + id);
        assert.equal(pentagramScroll(id, 'u1').dark, false, 'свиток белый');
    }
    assert.equal(pentagramWords('Pentagranium Albedo'), 'darkward');
    assert.equal(pentagramWords('пентаграниум игнарис'), 'fireward');
    assert.equal(pentagramSpell('darkward'), 'Pentagranium Albedo');
    assert.equal(RESIST.COST, 150); assert.equal(RESIST.DARK_MAX, 10);
});

test('цветы и сердцевина — настоящие вещи игры', () => {
    for (const k of [...RESIST.FLOWERS, RESIST.FIRE_ITEM]) assert.ok(ITEM_INFO[k], 'нет вещи ' + k);
    assert.equal(RESIST.FLOWERS.length, 3); assert.equal(new Set(RESIST.FLOWERS).size, 3);
});

test('защита от тёмной магии: тёмные заклинания вдвое слабее, остальные — как были', () => {
    for (const k of DARK_SPELLS) assert.equal(darkFactor(k), 0.5, k);
    assert.equal(darkFactor('Stupefy'), 1); assert.equal(darkFactor('melee'), 1); assert.equal(darkFactor(undefined), 1);
    const r = new PentagramResist({}); r.dark = true;
    assert.equal(r.filterDamage(25, 'AvadaKedavra'), 12.5);
    assert.equal(r.filterDamage(4, 'Stupefy'), 4);
});

test('защита от огня: обычный огонь — ничего, адский жжёт полностью, змей — вдвое слабее', () => {
    for (const k of FIRE_OK) assert.equal(fireFactor(k), 0, k);
    for (const k of HELL_FIRE) assert.equal(fireFactor(k), 1, k);
    assert.equal(fireFactor('FireSerpent'), 0.5);
    assert.equal(fireFactor('melee'), 1); assert.equal(fireFactor('Avada'), 1);
    const r = new PentagramResist({}); r.fire = true;
    assert.equal(r.filterDamage(10, 'Inferno'), 0);
    assert.equal(r.filterDamage(10, 'Hellfire'), 10);
    assert.equal(r.filterDamage(10, 'FireSerpent'), 5);
    assert.equal(r.fireproof, true);
    // обе защиты вместе: Hellfire — тёмное заклинание (÷2) и адский огонь (целиком) → 5; змей — тоже тёмный: ÷2 и ÷2 → 2.5
    r.dark = true;
    assert.equal(r.filterDamage(10, 'Hellfire'), 5); assert.equal(r.filterDamage(10, 'FireSerpent'), 2.5);
});

test('уровень тёмного мага: > 10 — нельзя получить; потом вырос > 10 — снимается; противоположна слому защиты', () => {
    assert.equal(canGetDarkWard({ level: 10 }).ok, true);
    assert.deepEqual(canGetDarkWard({ level: 11 }), { ok: false, why: 'dark' });
    assert.deepEqual(canGetDarkWard({ level: 0, broken: true }), { ok: false, why: 'broken' });
    assert.equal(canBreakProtection({ ward: true }), false); assert.equal(canBreakProtection({ ward: false }), true);
    assert.equal(keepsDarkWard({ level: 10 }), true); assert.equal(keepsDarkWard({ level: 11 }), false); assert.equal(keepsDarkWard({ level: 0, broken: true }), false);
    // в игре: recheck снимает дар
    const said = [];
    const g = { dark: { level: 5 }, breakward: { marked: false }, hud: { setVoice: (t) => said.push(t) }, perf: { note() {} } };
    const r = new PentagramResist(g); r.dark = true;
    assert.equal(r.recheck(), false); assert.equal(r.dark, true);
    g.dark.level = 11;
    assert.equal(r.recheck(), true); assert.equal(r.dark, false); assert.match(said[0], /слишком сильной/);
    r.dark = true; g.dark.level = 0; g.breakward.marked = true;
    assert.equal(r.recheck(), true); assert.match(said[1], /слома магической защиты/);
});

test('круг тёмной защиты: тянет по цветку каждого вида; нет цветка / тьмы много / метка слома — отказ ничего не тратя; платит 150', () => {
    const loose = (...kinds) => kinds.map((k, i) => ({ uid: 'u' + i, item: { kind: k, count: 1 } }));
    assert.equal(findFlowers(loose('sun_herb', 'glowcap_mushroom')).ok, false);
    assert.deepEqual(findFlowers(loose('sun_herb', 'glowcap_mushroom')).missing, ['лазурница']);
    assert.equal(findFlowers(loose('sun_herb', 'glowcap_mushroom', 'azure_berry')).ok, true);
    assert.ok(findFireHeart(loose('brightCore')) && !findFireHeart(loose('apple')));
    const mk = (level, broken) => {
        const taken = [], said = [], g = { dark: { level }, breakward: { marked: broken }, isDeadLocal: false, combat: { dead: false, fatigue: 200, _hudKey: '' }, hud: { setVoice: (t) => said.push(t) }, perf: { note() {} },
            items: { loose: new Map(loose('sun_herb', 'glowcap_mushroom', 'azure_berry').map((L) => [L.uid, { item: L.item, model: { position: { x: 0, y: 0, z: 0 } } }])), removeLoose: (u) => taken.push(u) }, burning: {} };
        return { g, taken, said, r: new PentagramResist(g) };
    };
    const ctx = (said, mana = 200) => ({ m: { x: 0, y: 0, z: 0, r: 3 }, pays: true, mana, hint: (t) => said.push(t) });
    let t = mk(11, false); assert.equal(t.r.useCircle('dark', ctx(t.said)), false); assert.equal(t.taken.length, 0); assert.equal(t.g.combat.fatigue, 200);
    t = mk(0, true); assert.equal(t.r.useCircle('dark', ctx(t.said)), false); assert.equal(t.r.dark, false);
    t = mk(3, false); assert.equal(t.r.useCircle('dark', ctx(t.said, 100)), false); assert.equal(t.taken.length, 0, 'мало маны — цветы целы');
    t = mk(10, false); assert.equal(t.r.useCircle('dark', ctx(t.said)), true); assert.equal(t.r.dark, true); assert.equal(t.taken.length, 3); assert.equal(t.g.combat.fatigue, 50);
    assert.equal(t.r.useCircle('dark', ctx(t.said)), false, 'второй раз — «уже есть», ничего не платится'); assert.equal(t.g.combat.fatigue, 50);
});

test('сохранение: дар живёт в записи героя, смерть забирает', () => {
    const r = new PentagramResist({ perf: { note() {} } });
    assert.equal(r.snapshot(), null);
    r.dark = true; r.fire = true;
    const s = r.snapshot(); const r2 = new PentagramResist({}); r2.restore(s);
    assert.ok(r2.dark && r2.fire);
    r2.onDeath(); assert.ok(!r2.dark && !r2.fire); assert.equal(r2.snapshot(), null);
});

test('подключено в игре: урон, поджог, сохранение, наследие, круг, противоположность слому защиты', () => {
    assert.match(src('src/game/Combat.js'), /this\.game\.resist\.filterDamage\(amount, kind\)/);
    assert.match(src('src/game/Burning.js'), /g\.resist\?\.fireproof\) return false/);
    assert.match(src('src/game/Game.js'), /this\.resist = new PentagramResist\(this\)/);
    assert.match(src('src/game/WorldSave.js'), /resist: game\.resist\?\.snapshot\(\)/);
    assert.match(src('src/game/Legacy.js'), /g\.resist\?\.onDeath\(\)/);
    assert.match(src('src/game/Pentagranium.js'), /g\.resist\?\.useCircle\(/);
    assert.match(src('src/game/BreakwardMark.js'), /g\.resist\?\.dark/, 'слом защиты не ставится при защите от тёмной магии');
    assert.match(src('src/game/Offerings.js'), /g\.resist\?\.dark/);
    assert.match(src('src/game/ItemTypes.js'), /pent:darkward/); assert.match(src('src/game/ItemTypes.js'), /pent:fireward/);
});
