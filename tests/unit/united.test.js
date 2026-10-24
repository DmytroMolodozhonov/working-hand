// «Пентаграмма объединённой силы» (UnitedRules.js, UnitedPower.js): бафы складываются, повторное объединение, отказы, +30 тьмы, свой рисунок.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UNITED, LIMIT, bodyOk, canUnite, mergeItems, wandBonuses, UNITED_PALETTE, describeUnited } from '../../src/game/UnitedRules.js';
import { ENCHANTS, enchantSums, wandCostMul, shieldMul, enchantAdd } from '../../src/game/Enchant.js';
import { wandPower } from '../../src/game/WandMagic.js';
import { pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { CAST_COST, figureOf } from '../../src/game/PentagramRules.js';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { rollWand, describeItem } from '../../src/game/ItemTypes.js';

const wand = (o) => ({ kind: 'wand', uid: 'w' + Math.random(), model: 1, color: 0x123456, dir: null, fav: null, power: 0, ...o });
const opts = (extra = {}) => ({ uid: 'new', rnd: () => 0.3, ench: ENCHANTS.wand, enchSum: enchantSums, ...extra });

test('the author\'s example: +5 combat & fire +40 with +10% & a water buff — one wand, everything summed; the two are replaced by one new', () => {
    const a = wand({ power: 5, fav: 'Inferno' }), b = wand({ power: 10, fav: 'Waterball', dir: 'gather' });
    const r = mergeItems(a, b, opts());
    assert.ok(r.ok);
    const w = r.item;
    assert.equal(w.kind, 'wand');
    assert.equal(w.power, 15);
    assert.equal(w.favs.Inferno, 40); assert.equal(w.favs.Waterball, 40);
    assert.equal(w.dirs.gather, 25);
    assert.equal(w.united, 2);
    assert.ok(UNITED_PALETTE.includes(w.color));
    assert.notEqual(w.uid, a.uid);
});

test('it can be united again and again: the colour stays, the sums grow, the same favourite adds up', () => {
    let w = mergeItems(wand({ power: 5, fav: 'Inferno' }), wand({ power: 10 }), opts()).item;
    const col = w.ucol;
    for (let i = 0; i < 5; i++) w = mergeItems(w, wand({ power: 7, fav: 'Inferno' }), opts({ rnd: () => 0.9 })).item;
    assert.equal(w.ucol, col);
    assert.equal(w.power, 15 + 35);
    assert.equal(w.favs.Inferno, 40 * 6);
    assert.equal(w.united, 7);
});

test('the enchantment of a wand goes into the sums; the numbers have only a very high technical limit', () => {
    const e = wand({ power: 1, ench: { tier: 3, kind: 'wand' } });
    const b = wandBonuses(e, ENCHANTS.wand);
    assert.equal(b.power, 1 + ENCHANTS.wand.power[3]);
    assert.ok(Math.abs(b.save - ENCHANTS.wand.save[3]) < 1e-9);
    let w = wand({ power: LIMIT.power - 1 });
    const r = mergeItems(w, wand({ power: 50 }), opts());
    assert.equal(r.item.power, LIMIT.power);
    assert.ok(r.capped);
});

test('the sums reach the spells and the mana: favourites, directions, power, saving', () => {
    const w = mergeItems(wand({ power: 10, fav: 'Inferno', dir: 'destroy' }), wand({ power: 10, fav: 'Inferno' }), opts()).item;
    const base = 1.15 * 1.2 * (1 + 0.8) * 1.25; // (power 20 %, favourite 80 %, destroy direction 25 %)
    assert.ok(Math.abs(wandPower(w, 'Inferno') - base) < 1e-9);
    assert.ok(Math.abs(wandPower(w, 'Lumos') - 1.15 * 1.2) < 1e-9, 'other spells: only the common power');
    const s = mergeItems(wand({ ench: { tier: 2, kind: 'wand' } }), wand({ ench: { tier: 1, kind: 'wand' } }), opts()).item;
    assert.ok(Math.abs(wandCostMul(s) - (1 - ENCHANTS.wand.save[2] - ENCHANTS.wand.save[1])) < 1e-9);
});

test('other things: shields, swords, bows, armour — the numbers and the enchantments are summed; only one kind with one kind', () => {
    const s1 = { kind: 'shield', uid: 's1', type: 1, magic: true, max: 30, ench: { tier: 1, kind: 'shield' } }, s2 = { kind: 'shield', uid: 's2', type: 0, magic: true, max: 25, ench: { tier: 2, kind: 'shield' } };
    const r = mergeItems(s1, s2, opts());
    assert.ok(r.ok);
    assert.equal(r.item.max, 55);
    assert.ok(Math.abs(shieldMul(r.item) - (1 + 0.3 + 0.5)) < 1e-9, 'shield strength multipliers add');
    const x1 = { kind: 'weapon', type: 'sword', magic: true, bonus: 20 }, x2 = { kind: 'weapon', type: 'sword', magic: false, bonus: 5, ench: { tier: 0, kind: 'weapon' } };
    const m = mergeItems(x1, x2, opts()).item;
    assert.equal(m.bonus, 25);
    assert.ok(Math.abs(enchantAdd(m, 'atk') - ENCHANTS.weapon.atk[0]) < 1e-9);
    assert.ok(!canUnite(s1, x1).ok && /разного вида/.test(canUnite(s1, x1).why), 'a shield and a sword');
    assert.ok(!canUnite({ kind: 'weapon', type: 'sword', magic: true }, { kind: 'weapon', type: 'axe', magic: true }).ok, 'a sword and an axe');
    assert.ok(!canUnite({ kind: 'armor', piece: 'helmet', magic: true }, { kind: 'armor', piece: 'legs', magic: true }).ok);
    assert.ok(canUnite({ kind: 'armor', piece: 'helmet', magic: true }, { kind: 'armor', piece: 'helmet' }).ok);
});

test('refusals with a clear hint: plain wand, bread, bones, a hero\'s body, an animal', () => {
    assert.ok(!canUnite({ kind: 'wand', plain: true }, wand({})).ok);
    assert.match(canUnite(wand({}), { kind: 'bread' }).why, /не объединить/);
    assert.ok(!canUnite(null, wand({})).ok);
    assert.ok(bodyOk({ k: 'v', role: 'knight' }).ok && bodyOk({ k: 'v', wz: 1, mm: 90 }).ok);
    assert.match(bodyOk({ k: 'v', bones: {} }).why, /Кости/);
    assert.ok(!bodyOk({ k: 'p' }).ok && !bodyOk({ k: 'v', lg: 1 }).ok && !bodyOk(null).ok);
});

test('«Pentagranium Unitas»: its own word and picture, a black pentagram, 120 mana, +30 dark at the word (100 at most); no scroll of its own besides the pentagram\'s', () => {
    assert.equal(pentagramWords('пентаграниум унитас'), 'unity');
    assert.equal(pentagramSpell('unity'), 'Pentagranium Unitas');
    assert.ok(PENTAGRAMS.unity.dark && PENTAGRAMS.unity.darkBonus === UNITED.DARK && CAST_COST.unity === UNITED.COST && figureOf('unity'));
    const said = [];
    const g = {
        config: { mode: 'freeworld' }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue: 200, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1, raycast(o, d) { const t = (0.5 - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, y: 0.5, z: o.z + d.z * t } : null; } } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(0, 0, 0) } }, sync: { pentagram() {} },
        mana: { success() {} }, dark: { level: 0, skin: 0, onGrow() {} }, castleLife: { alarm() {} }, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailPulse() {}, trailLine() {}, trailBreak() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    p.learnFigure('unity');
    const aim = () => ({ origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() });
    g.combat.fatigue = 100;
    assert.equal(p.cast(true, 'пентаграниум унитас', aim()), null, 'not enough mana');
    assert.equal(g.dark.level, 0);
    g.combat.fatigue = 200;
    assert.equal(p.cast(true, 'пентаграниум унитас', aim()), 'Pentagranium');
    assert.equal(g.combat.fatigue, 80);
    assert.equal(g.dark.level, 30, '+30 at once');
    g.dark.level = 90; p._castId = null; g.combat.fatigue = 200;
    p.cast(true, 'пентаграниум унитас', aim());
    assert.equal(g.dark.level, 100, 'never above 100');
});

test('the united wand: not found anywhere, described for the player', () => {
    const w = mergeItems(wand({ power: 5, fav: 'Inferno' }), wand({ power: 10, dir: 'gather' }), opts()).item;
    const d = describeItem(w);
    assert.match(d.title, /Объединённая палочка/);
    assert.ok(d.lines.some((l) => /\+15%/.test(l)) && describeUnited(w).lines.some((l) => /Inferno/.test(l)));
    for (let i = 0; i < 2000; i++) assert.ok(!rollWand().united);
});
