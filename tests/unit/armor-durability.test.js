// Magic durability («запас магической прочности»): the reserve of a magic robe / magic armour (ArmorTypes.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, ROBE_TIERS, MAG, makePiece, makeRobe, ensureMag, magOf, hasMag, magPrice, armorValue, wornEffects, spellGuard,
    guardSpend, soakBlow, describeArmor, wornCode, tierOfMag } from '../../src/game/ArmorTypes.js';

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fullSet = (r = rng(1)) => ({ helmet: makePiece('helmet', { magic: true }, r), chest: makePiece('chest', { magic: true }, r), legs: makePiece('legs', { magic: true }, r), robe: null });

test('ranges: robe kinds 100…300 / 301…600 / 601…1000, armour 100…500, plain has none', () => {
    const r = rng(7);
    for (let i = 0; i < 400; i++) {
        for (const t of Object.keys(ROBE_TIERS)) {
            const rb = makeRobe(true, r, t);
            assert.ok(rb.mag >= ROBE_TIERS[t].range[0] && rb.mag <= ROBE_TIERS[t].range[1] && rb.tier === t && tierOfMag(rb.mag) === t);
        }
        const p = makePiece(PIECES[i % 3], { magic: true }, r);
        assert.ok(p.mag >= 100 && p.mag <= 500 && p.mag === p.magMax);
    }
    assert.equal(makePiece('chest').mag, undefined);
    assert.equal(hasMag(makeRobe(false)), false);
    assert.equal(magOf(makePiece('legs')), 0);
});

test('chests: simple often, strong rarely', () => {
    const r = rng(3), n = { simple: 0, mid: 0, strong: 0 };
    for (let i = 0; i < 3000; i++) n[makeRobe(true, r).tier]++;
    assert.ok(n.simple > n.mid && n.mid > n.strong && n.strong > 100);
});

test('prices: 1000 points = 10 000 coins, proportional; pieces 2 coins a point', () => {
    const strong = makeRobe(true, rng(1), 'strong'); strong.mag = strong.magMax = 1000;
    assert.equal(armorValue(strong), 10000);
    const simple = makeRobe(true, rng(1), 'simple'); simple.mag = 100;
    assert.equal(armorValue(simple), 1000);
    assert.ok(magPrice({ kind: 'robe', mag: 500 }) * 2 === 10000);
    const p = makePiece('chest', { magic: true }, rng(2)); p.mag = 500;
    assert.equal(armorValue(p), 1000);
});

test('old things without a reserve get one from their id, the same every time, in their range', () => {
    const old = { kind: 'robe', uid: 'abc1', magic: true };
    const again = { kind: 'robe', uid: 'abc1', magic: true };
    ensureMag(old); ensureMag(again);
    assert.equal(old.mag, again.mag);
    assert.ok(old.mag >= 100 && old.mag <= 1000 && tierOfMag(old.mag) === old.tier);
    const op = ensureMag({ kind: 'armor', uid: 'p9', piece: 'chest', magic: true, hp: 40 });
    assert.ok(op.mag >= 100 && op.mag <= 500);
    const suit = { kind: 'robe', uid: 'z', magic: true, archmage: true };
    assert.equal(ensureMag(suit).mag, undefined);
});

test('a turned-away spell costs its mana off the reserve: the armour first, then the robe', () => {
    const worn = fullSet(); worn.robe = makeRobe(true, rng(5), 'mid');
    worn.chest.mag = 8; worn.helmet.mag = 4; worn.legs.mag = 0; worn.robe.mag = 400;
    const fx = wornEffects(worn);
    assert.equal(fx.magicSet, true);
    assert.equal(spellGuard(fx, 'Stupefy').block, true);
    const { spent } = guardSpend(worn, fx, 'Stupefy', 12); // 12 mana: chest 8 + helmet 4
    assert.deepEqual(spent, { chest: 8, helmet: 4 });
    const more = guardSpend(worn, fx, 'Stupefy', 20); // 12 left in armour, 8 on the robe
    assert.equal(more.spent.robe, 8);
    // a spell only the robe turns away (Sapira): the armour is not touched
    const sap = guardSpend(worn, fx, 'Sapira', 20);
    assert.deepEqual(sap.spent, { robe: 20 });
});

test('armour with the set at 0 turns nothing; the piece stays; a spent robe is only clothes', () => {
    const worn = fullSet(); for (const p of PIECES) worn[p].mag = 0;
    assert.equal(wornEffects(worn).magicSet, false);
    assert.equal(spellGuard(wornEffects(worn), 'Stupefy').block, false);
    const w2 = { robe: makeRobe(true, rng(1), 'simple') };
    assert.equal(spellGuard(wornEffects(w2), 'Inferno').block, true);
    w2.robe.mag = 0; // (Armor.js drops it: a magic robe at 0 falls apart)
    const fx = wornEffects(w2);
    assert.equal(fx.robe, 'plain');
    assert.equal(spellGuard(fx, 'Inferno').block, false);
    assert.equal(soakBlow(w2, fx, 3, 'cold').hp, 3, 'cold takes it again');
});

test('the High Mage suit: free, no reserve', () => {
    const w = { robe: { kind: 'robe', uid: 'q', magic: true, archmage: true } };
    const fx = wornEffects(w);
    assert.equal(spellGuard(fx, 'Stupefy').block, true);
    assert.deepEqual(guardSpend(w, fx, 'Stupefy', 12).spent, {});
});

test('«Авада Кедавра»: cut by the reserve, never turned away, never fully; wounded not dead at full health', () => {
    const hp = 20;
    const none = soakBlow({}, wornEffects({}), 25, 'AvadaKedavra');
    assert.equal(none.hp, 25);
    const w = fullSet(); for (const p of PIECES) w[p].mag = 500; w.robe = makeRobe(true, rng(2), 'strong'); w.robe.mag = 1000;
    const r = soakBlow(w, wornEffects(w), 25, 'AvadaKedavra');
    assert.ok(r.hp > 0 && r.hp < hp, `passes ${r.hp}`);
    assert.ok(Math.abs(r.hp - 25 * (1 - MAG.AVADA_CAP)) < 1e-9 || r.hp >= 25 * (1 - MAG.AVADA_CAP) - 1e-9);
    const spent = Object.values(r.mag).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(spent - 20 * MAG.AVADA_K) < 1e-6, 'a full cut costs 8 a HP');
    // small reserve: partial cut — the armour first, then the robe
    const w2 = { chest: makePiece('chest', { magic: true }, rng(1)), robe: makeRobe(true, rng(3), 'simple') };
    w2.chest.mag = 80; w2.robe.mag = 80;
    const r2 = soakBlow(w2, wornEffects(w2), 25, 'AvadaKedavra');
    assert.equal(r2.mag.chest, 80); assert.equal(r2.mag.robe, 80);
    assert.ok(Math.abs(r2.hp - (25 - 20)) < 1e-9);
    // the robe that softens Avada by half still counts, then the cut: 12.5 → 12.5 − 10
    const w3 = { robe: { ...makeRobe(true, rng(4), 'strong'), strong: ['AvadaKedavra'], mag: 1000 } };
    assert.ok(Math.abs(soakBlow(w3, wornEffects(w3), 25, 'AvadaKedavra').hp - 2.5) < 1e-9);
});

test('save/load: the reserve is part of the thing (JSON), the robe kind shows in the look code', () => {
    const rb = makeRobe(true, rng(8), 'strong'); rb.mag = 777;
    const back = JSON.parse(JSON.stringify(rb));
    assert.equal(back.mag, 777); assert.equal(back.magMax, rb.magMax); assert.equal(back.tier, 'strong');
    assert.equal(wornCode({ robe: back }).rt, 2);
    assert.equal(wornCode({ robe: makeRobe(true, rng(8), 'simple') }).rt, 0);
    assert.match(describeArmor(back).lines.join('|'), /Запас прочности: <b>777<\/b>/);
    assert.match(describeArmor(makePiece('helmet', { magic: true })).lines.join('|'), /Запас магической прочности/);
});
