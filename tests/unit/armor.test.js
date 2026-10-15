// Armour and robes (ArmorTypes.js / Armor.js): what is found where, what the steel and the robe stop,
// the named armour's perks, where on the body a piece is put on, «Suit Up» / «Disarmor».
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, ARMOR, PERKS, makePiece, makeRobe, rollNamedSet, rollChestArmor, wornEffects, spellGuard, soakBlow, wearSpot, pieceMax } from '../../src/game/ArmorTypes.js';
import { rollLoot } from '../../src/game/ItemTypes.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HAT_HIDDEN, HATS, randomLook } from '../../src/entities/Appearance.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('chests: one piece at a time, magic ones half as often; the royal chest mostly fine things', () => {
    const r = rng(7);
    let plain = 0, magic = 0, royalMagic = 0, royalPlain = 0;
    for (let i = 0; i < 20000; i++) {
        const a = rollChestArmor(r);
        if (a?.kind === 'armor') a.magic ? magic++ : plain++;
        const b = rollChestArmor(r, { royal: true });
        if (b?.kind === 'armor') b.magic ? royalMagic++ : royalPlain++;
    }
    assert.ok(magic > plain * 0.35 && magic < plain * 0.65, `magic ${magic} vs plain ${plain}`);
    assert.ok(royalMagic > royalPlain * 3, `royal: magic ${royalMagic} vs plain ${royalPlain}`);
    for (let i = 0; i < 3000; i++) {
        const loot = rollLoot(r);
        assert.ok(loot.filter((it) => it.kind === 'armor').length <= 1, 'never a whole set in a chest');
    }
    // a royal chest: precious things outnumber the plain food / arrows
    let fine = 0, common = 0;
    for (let i = 0; i < 3000; i++) for (const it of rollLoot(r, { key: 1, royal: true })) (it.magic || ['wand', 'scroll', 'hammer', 'backpack', 'robe'].includes(it.kind) ? fine++ : common++);
    assert.ok(fine > common * 3, `fine ${fine} common ${common}`);
});

test('the magic set turns the simplest magic away, the robe all of it — strong spells and «Максима» get through', () => {
    const set = { helmet: makePiece('helmet', { magic: true }), chest: makePiece('chest', { magic: true }), legs: makePiece('legs', { magic: true }) };
    const fx = wornEffects(set);
    assert.ok(fx.magicSet);
    for (const s of ['LevitateDuel', 'Stupefy', 'IceDuel', 'chill', 'Jolt']) assert.equal(spellGuard(fx, s).block, true, s);
    for (const s of ['AvadaKedavra', 'JoltMaxima', 'Thunderwave', 'SapiraDuel']) assert.equal(spellGuard(fx, s).block, false, s);
    assert.equal(spellGuard(fx, 'Inferno').mult, 0.5);
    // two magic pieces are not the set
    assert.equal(spellGuard(wornEffects({ helmet: set.helmet, chest: set.chest }), 'Stupefy').block, false);
    const robe = wornEffects({ robe: makeRobe(true, rng(3)) });
    for (const s of ['Inferno', 'Stupefy', 'LevitateDuel', 'IceDuel', 'SapiraDuel', 'Disarmor', 'cold']) assert.equal(spellGuard(robe, s).block, true, s);
    assert.equal(spellGuard(robe, 'AvadaKedavra').block, false);
    assert.equal(spellGuard(wornEffects({ robe: makeRobe(false) }), 'Stupefy').block, false, 'a plain robe is only clothes');
    // a robe with «Авада» softened: half
    const soft = wornEffects({ robe: { kind: 'robe', magic: true, strong: ['AvadaKedavra', 'Hellfire'] } });
    assert.equal(soakBlow({}, soft, 25, 'AvadaKedavra').hp, 12.5);
});

test('the steel takes its share of a blow (fire less), magic twice the points; nothing goes through for free', () => {
    const chest = makePiece('chest');
    assert.equal(pieceMax(chest), ARMOR.HP.chest);
    assert.equal(pieceMax(makePiece('chest', { magic: true })), 2 * ARMOR.HP.chest);
    const onChest = () => 0.5; // (lands on the breastplate: helmet 0–0.2, chest 0.2–0.7)
    const r = soakBlow({ chest }, wornEffects({ chest }), 10, 'melee', onChest);
    assert.equal(r.wear.chest, 10 * ARMOR.SOAK);
    assert.ok(Math.abs(r.hp - 10 * (1 - ARMOR.SOAK)) < 1e-9);
    const f = soakBlow({ chest }, wornEffects({ chest }), 10, 'Inferno', onChest);
    assert.equal(f.wear.chest, 10 * ARMOR.FIRE_SOAK);
    assert.equal(soakBlow({ chest }, wornEffects({ chest }), 5, 'poison', onChest).hp, 5, 'poison is no blow');
    assert.equal(soakBlow({}, wornEffects({}), 5, 'melee', onChest).hp, 5, 'bare');
});

test('a named set: three magic pieces of one knight, its perks only on the whole set; the perks are many', () => {
    assert.ok(PERKS.length >= 20);
    assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
    const set = rollNamedSet(rng(11));
    assert.deepEqual(set.map((it) => it.piece), PIECES);
    assert.ok(set.every((it) => it.magic && it.named && it.set === set[0].set));
    assert.match(set[0].set.name, /^Доспех /);
    const worn = Object.fromEntries(set.map((it) => [it.piece, it]));
    const all = wornEffects(worn);
    for (const p of set[0].set.perks) assert.ok(all.perks.includes(p), p);
    const two = wornEffects({ helmet: worn.helmet, chest: worn.chest });
    for (const p of set[0].set.perks) if (!set.some((it) => it.perks.includes(p))) assert.ok(!two.perks.includes(p), 'set perk without the whole set');
    // rolled every time anew
    const names = new Set();
    for (let i = 0; i < 30; i++) names.add(rollNamedSet().map((it) => it.set.perks.join()).join('|'));
    assert.ok(names.size > 20);
});

test('put on by hand: the helmet at the head, the breastplate / robe at the chest, the greaves at the knee — not elsewhere', () => {
    assert.ok(wearSpot('armor', 'helmet', { x: 0, y: 2.3, z: 0 }));
    assert.ok(!wearSpot('armor', 'helmet', { x: 0, y: 0.9, z: -0.6 }));
    assert.ok(wearSpot('armor', 'chest', { x: 0, y: 0.9, z: -0.6 }));
    assert.ok(!wearSpot('armor', 'chest', { x: 0, y: 0.9, z: -1.8 }), 'the arm stretched out holds it, does not put it on');
    assert.ok(wearSpot('armor', 'legs', { x: 0.3, y: -1.0, z: -0.4 }));
    assert.ok(!wearSpot('armor', 'legs', { x: 0, y: 2.3, z: 0 }));
    assert.ok(wearSpot('robe', undefined, { x: 0.1, y: 1.0, z: -0.5 }));
    // the camera's picture is surer than the arm's depth: a hand held out before the chest is not on it
    assert.ok(!wearSpot('armor', 'chest', { x: 0, y: 0.9, z: -1.2 }, { head: false, chest: false, knee: false }));
    assert.ok(wearSpot('armor', 'chest', { x: 0, y: 0.9, z: -1.2 }, { head: false, chest: true, knee: false }));
    assert.ok(wearSpot('armor', 'helmet', { x: 0.35, y: 1.6, z: -1.26 }, { head: true, chest: false, knee: false }), 'a hand at the face (the depth guessed in front)');
});

test('«Suit Up» and «Disarmor»: said, priced; the crown is not for heroes', () => {
    for (const w of ['сьют ап', 'Suit Up', 'одеть всё']) assert.equal(matchSpell(w), 'SuitUp', w);
    for (const w of ['дизармор', 'Disarmor', 'раздень его']) assert.equal(matchSpell(w), 'Disarmor', w);
    assert.equal(matchSpell('ап'), 'Up');
    assert.equal(matchSpell('экспеллиармус'), 'Expelliarmus');
    assert.equal(SPELL_COST.SuitUp, 5);
    assert.ok(SPELL_COST.Disarmor > 0);
    assert.equal(HATS[5], 'Корона');
    assert.ok(HAT_HIDDEN.has(5));
    for (let i = 0; i < 300; i++) { const L = randomLook(); assert.ok(!HAT_HIDDEN.has(L.hat) && L.hat !== 9 && L.top !== 2 && L.top !== 5 && L.bottom !== 8 && L.shoes !== 6, 'the editor: the look only, no things with powers'); }
});
