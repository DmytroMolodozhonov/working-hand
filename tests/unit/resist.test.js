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

// ---- «Pentagranium Murus»: protection from blasts (the author 08.11: «Бомбардо и Бомбардо Максима — иммунитет, толкать можно; Бум и Инспириус — вдвое слабее»)
import { blastFactor, findArmorLeaf, RESIST as RES_B } from '../../src/game/ResistRules.js';
import { floraHarm as _fh, FLORA_KINDS as _FK, FLORA_ITEMS as _FI } from '../../src/game/MagicFlora.js';
import { PENT_NAMES as _PN } from '../../src/game/PentagramWords.js';

test('blast ward: Bombardo (both) none, Boom / Inspirius / a cannonball half, the rest whole', () => {
    for (const k of ['Bombardo', 'BombardoMaxima']) assert.equal(blastFactor(k), 0, k);
    for (const k of ['Boom', 'Inspirius', 'Cannon']) assert.equal(blastFactor(k), 0.5, k);
    for (const k of ['Inferno', 'AvadaKedavra', 'melee', 'Sectura']) assert.equal(blastFactor(k), 1, k);
});

test('blast ward: the gift cuts the harm, saves and goes with death, needs the leaf of the Armourleaf', () => {
    const r = new PentagramResist({ perf: { note() {} } });
    assert.equal(r.filterDamage(100, 'Bombardo'), 100);
    r.blast = true;
    assert.equal(r.filterDamage(100, 'Bombardo'), 0);
    assert.equal(r.filterDamage(100, 'Inspirius'), 50);
    assert.equal(r.filterDamage(40, 'Inferno'), 40);
    const snap = r.snapshot(), r2 = new PentagramResist({ perf: { note() {} } });
    r2.restore(snap);
    assert.equal(r2.blast, true);
    r2.onDeath();
    assert.equal(r2.blast, false);
    assert.equal(r2.snapshot(), null);
    assert.equal(findArmorLeaf([{ item: { kind: 'apple' } }]), null);
    assert.ok(findArmorLeaf([{ item: { kind: RES_B.BLAST_ITEM, count: 1 } }]));
});

test('blast ward: used in a circle — a leaf is burnt and 150 mana paid; nothing without them', () => {
    const hints = [], loose = new Map(), gone = [];
    const g = { isDeadLocal: false, combat: { fatigue: 300, dead: false }, perf: { note() {} }, hud: { setVoice() {} },
        items: { loose, removeLoose: (u) => { loose.delete(u); gone.push(u); } } };
    const r = new PentagramResist(g);
    const m = { x: 0, y: 0, z: 0, r: 5 };
    const ctx = { m, pays: true, mana: 300, hint: (s) => hints.push(s) };
    assert.equal(r.useCircle('blast', ctx), false); // (no leaf)
    assert.ok(hints.length && !r.blast);
    loose.set(1, { item: { kind: 'armor_leaf', count: 1 }, model: { position: { x: 1, y: 0, z: 1 } }, rest: true });
    assert.equal(r.useCircle('blast', { ...ctx, mana: 100 }), false); // (no mana)
    assert.equal(g.combat.fatigue, 300);
    assert.equal(r.useCircle('blast', ctx), true);
    assert.equal(r.blast, true);
    assert.deepEqual(gone, [1]);
    assert.equal(g.combat.fatigue, 150);
    assert.equal(r.useCircle('blast', ctx), false); // (already have)
});

test('blast ward: the name, the picture, the price, the plant (only worlds of generation 28+) and its «who/what»', () => {
    assert.equal(_PN.blastward.en, 'Murus');
    const def = PENTAGRAMS.blastward;
    assert.equal(def.dark, false);
    assert.equal(def.cost, 150);
    assert.ok(def.lines.length >= 5);
    const K = _FK.armourleaf;
    assert.equal(K.fromGen, 28);
    assert.equal(K.item, 'armor_leaf');
    assert.ok(_FI.armor_leaf.name);
    assert.equal(_fh('armourleaf', 'Bombardo'), 'destroy');
    assert.equal(_fh('armourleaf', 'Inferno'), 'burn');
});
