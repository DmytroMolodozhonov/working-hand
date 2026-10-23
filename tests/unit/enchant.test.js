import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCHANT, ENCHANTS, ENCHANT_TIERS, ENCHANT_PENTAGRAM, enchantCost, tierChances, enchantTier, canEnchant, applyEnchant, enchantMul, enchantSoak, wearMul, shieldMul, shieldPlain, wandPowerMul, wandCostMul, describeEnchant, enchantValueMul } from '../../src/game/Enchant.js';
import { makePiece, makeRobe, wornCode } from '../../src/game/ArmorTypes.js';
import { wandPower } from '../../src/game/WandMagic.js';
import { itemValue } from '../../src/game/ItemTypes.js';

const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test('the rite takes 30 % of the CURRENT mana, rounded up', () => {
    assert.equal(enchantCost(100), 30);
    assert.equal(enchantCost(10), 3);
    assert.equal(enchantCost(11), 4);
    assert.equal(enchantCost(0), 0);
    assert.equal(ENCHANT.MIN_MANA, 10);
});

test('level chances: little mana → almost always weak; much mana → a real chance of the great one; smooth', () => {
    assert.ok(tierChances(15)[0] > 0.95);
    assert.ok(tierChances(150)[3] > 0.12);
    assert.ok(tierChances(150)[3] < 0.25);
    for (const s of [0, 3, 15, 50, 150, 400]) assert.ok(Math.abs(tierChances(s).reduce((a, b) => a + b) - 1) < 1e-9);
    let prev = tierChances(0);
    for (let s = 1; s <= 400; s++) { // more mana never makes the weak one likelier, never makes the great one rarer
        const p = tierChances(s);
        assert.ok(p[0] <= prev[0] + 1e-12 && p[3] >= prev[3] - 1e-12, 'monotonic at ' + s);
        assert.ok(Math.abs(p[0] - prev[0]) < 0.06, 'smooth at ' + s);
        prev = p;
    }
});

test('enchantTier is deterministic from the rng', () => {
    assert.equal(enchantTier(5, () => 0.5), 0);
    assert.equal(enchantTier(150, () => 0.999), 3);
    assert.equal(enchantTier(150, () => 0), 0);
    const hits = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) hits[enchantTier(100, () => (i + 0.5) / 4000)]++;
    const p = tierChances(100);
    for (let t = 0; t < 4; t++) assert.ok(Math.abs(hits[t] / 4000 - p[t]) < 0.01);
});

test('only equipment can be enchanted, and only once', () => {
    for (const bad of [{ kind: 'res', block: 3, count: 5 }, { kind: 'coins', count: 9 }, { kind: 'apple' }, { kind: 'bread' }, { kind: 'scroll', stat: 'spell' }, { kind: 'book' }, { kind: 'potion' }, { kind: 'iceRod' }, { kind: 'flask' }, { kind: 'arrows' }]) {
        const r = canEnchant(bad);
        assert.equal(r.ok, false, bad.kind);
        assert.equal(r.why, 'Это нельзя зачаровать');
    }
    for (const good of [makePiece('helmet'), makePiece('chest', { magic: true }), makePiece('legs'), makeRobe(false), makeRobe(true), { kind: 'weapon', type: 'sword' }, { kind: 'bow' }, { kind: 'shield', type: 0 }, { kind: 'wand' }, { kind: 'wand', staff: true }, { kind: 'hammer' }, { kind: 'backpack' }]) {
        assert.equal(canEnchant(good).ok, true, good.kind);
    }
    assert.equal(canEnchant({ kind: 'robe', archmage: true }).ok, false);
    const w = { kind: 'wand' };
    assert.ok(applyEnchant(w, 2));
    assert.deepEqual(w.ench, { tier: 2, kind: 'wand' });
    const again = canEnchant(w);
    assert.equal(again.ok, false);
    assert.equal(again.why, 'Предмет уже зачарован');
    assert.equal(applyEnchant(w, 3), null);
    assert.equal(w.ench.tier, 2);
});

test('bonuses rise with the level and are small', () => {
    for (const [kind, row] of Object.entries(ENCHANTS)) {
        for (const [k, arr] of Object.entries(row)) {
            if (!Array.isArray(arr)) continue;
            for (let i = 1; i < 4; i++) assert.ok(arr[i] >= arr[i - 1], `${kind}.${k}`);
        }
    }
    const sword = { kind: 'weapon', type: 'sword' };
    assert.equal(enchantMul(sword), 1);
    applyEnchant(sword, 3);
    assert.ok(Math.abs(enchantMul(sword) - 1.4) < 1e-9);
    const hat = makePiece('helmet'); applyEnchant(hat, 1);
    const robe = makeRobe(true); applyEnchant(robe, 3);
    assert.ok(Math.abs(enchantSoak({ helmet: hat, robe }) - (1 - 0.05) * (1 - 0.15)) < 1e-9);
    assert.ok(wearMul(hat) < 1 && wearMul(makePiece('legs')) === 1);
    const sh = { kind: 'shield', type: 1, magic: true, max: 30 }; applyEnchant(sh, 3);
    assert.equal(shieldMul(sh), 1.8);
    assert.equal(shieldPlain(sh), 20);
});

test('a wand: power and mana', () => {
    const plain = { kind: 'wand', power: 0 };
    const base = wandPower(plain, 'Inferno');
    const w = { kind: 'wand', power: 0 }; applyEnchant(w, 3);
    assert.ok(Math.abs(wandPower(w, 'Inferno') / base - 1.15) < 1e-9);
    assert.ok(Math.abs(wandCostMul(w) - 0.9) < 1e-9);
    assert.equal(wandPowerMul(plain), 1);
});

test('it is carried by the thing: saved, sold dearer, worn code, hologram', () => {
    const w = { kind: 'weapon', type: 'sword', uid: 'x' };
    const before = itemValue(w);
    applyEnchant(w, 3);
    const back = JSON.parse(JSON.stringify(w)); // (a save, a death drop: plain data)
    assert.deepEqual(back.ench, { tier: 3, kind: 'weapon' });
    assert.ok(itemValue(back) > before && enchantValueMul(back) === 3.2);
    const hat = makePiece('helmet'); applyEnchant(hat, 2);
    assert.equal(wornCode({ helmet: hat }).e, 3);
    assert.equal(wornCode({ helmet: makePiece('helmet') }).e, 0);
    const d = describeEnchant(back);
    assert.ok(d.title.includes('Великое') && d.lines.join(' ').includes('+40% урона'));
});

test('the pentagram entry: light, permanent, its own drawing', () => {
    assert.equal(ENCHANT_PENTAGRAM.id, 'enchant');
    assert.equal(ENCHANT_PENTAGRAM.dark, false);
    assert.equal(ENCHANT_PENTAGRAM.permanent, true);
    assert.equal(ENCHANT_TIERS.length, 4);
    const kinds = ENCHANT_PENTAGRAM.draw.map((d) => d.t + (d.r ?? d.pts.length));
    assert.deepEqual(kinds, ['circle1', 'poly4', 'circle0.14']);
    void seq;
});
