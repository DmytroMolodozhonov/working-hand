// NpcArmor: people wear the player's pieces and every blow goes through the player's functions (the author 07.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { npcWorn, npcSoak, npcGuard, npcKind, npcRegen } from '../../src/game/NpcArmor.js';

const man = (role, extra = {}) => ({ id: role + '1', role, armor: 0, maxArmor: 0, ...extra });

test('a knight wears three plain pieces, bars = their points (40)', () => {
    const v = man('knight');
    const w = npcWorn(v);
    assert.ok(w.helmet && w.chest && w.legs && !w.helmet.magic);
    assert.equal(v.maxArmor, 40);
    assert.equal(v.armor, 40);
});
test('the king wears the whole magic set (80), an advisor — two magic pieces', () => {
    const k = man('king'); npcWorn(k); assert.equal(k.maxArmor, 80);
    const a = man('advisor'); npcWorn(a); assert.equal(a.maxArmor, 60);
});
test('a blow: the steel takes 80 % of it and loses that, the rest reaches the health (same as the player)', () => {
    const v = man('knight'); npcWorn(v);
    let reach = 0, hits = 0;
    for (let i = 0; i < 200; i++) { const u = man('knight', { id: 'k' + i }); npcWorn(u); reach += npcSoak(u, 10, 'blow', () => 0.5); hits++; }
    assert.equal(Math.round(reach / hits * 10) / 10, 2); // (the chest, 0.5 of the cover: 80 % soaked)
    npcSoak(v, 10, 'blow', () => 0.5);
    assert.ok(v.armor < 40 && v.armor >= 32);
});
test('Thunderwave goes through plain steel, a magic piece holds it', () => {
    const v = man('knight'); npcWorn(v);
    assert.equal(npcSoak(v, 10, 'Thunderwave', () => 0.5), 10);
    const k = man('king'); npcWorn(k);
    assert.ok(npcSoak(k, 10, 'Thunderwave', () => 0.5) < 10);
});
test('a magic robe turns away the simplest spells, pays its reserve, falls apart at 0', () => {
    const v = man('student', { robe: true, wizard: true }); const w = npcWorn(v);
    assert.ok(w.robe?.magic);
    const m0 = w.robe.mag;
    const r = npcGuard(v, 'Stupefy', 4);
    assert.equal(r.block, true);
    assert.ok(w.robe.mag < m0);
    w.robe.mag = 0.5;
    npcGuard(v, 'Stupefy', 4);
    assert.equal(v.worn.robe, null);
    assert.equal(npcGuard(v, 'Stupefy', 4).block, false);
});
test('plain steel does not turn spells, a king in the magic set does', () => {
    const kn = man('knight'); assert.equal(npcGuard(kn, 'Stupefy', 4).block, false);
    const k = man('king'); assert.equal(npcGuard(k, 'Stupefy', 4).block, true);
});
test('a stripped man has no steel; a worn-down plain piece falls off; magic pieces mend', () => {
    const v = man('knight'); npcWorn(v);
    v.stripped = true; assert.equal(npcSoak(v, 10, 'blow', () => 0.5), 10);
    const k = man('king'); npcWorn(k);
    for (let i = 0; i < 30; i++) npcSoak(k, 10, 'blow', () => 0.5);
    const low = k.armor; npcRegen(k, 20);
    assert.ok(k.armor > low);
});
test('Bombardo Maxima is the blast, fire is fire', () => {
    assert.equal(npcKind({ kind: 'BombardoMaxima' }), 'Bombardo');
    assert.equal(npcKind({ fire: true }), 'fire');
});

// --- взрыв (Бомбардо): урон просто снимается с очков брони, по третям тела (автор 07.11)
import { blastSoak, wornEffects, makePiece, makeRobe } from '../../src/game/ArmorTypes.js';
const set = (magic, parts = ['helmet', 'chest', 'legs']) => Object.fromEntries(parts.map((p) => [p, makePiece(p, { magic })]));
const blast = (worn, a) => blastSoak(worn, wornEffects(worn), a);

test('полный комплект обычной брони: Бомбардо не ранит, только снимает очки', () => {
    const w = set(false);
    const r = blast(w, 8);
    assert.ok(r.hp < 1e-9);
    assert.ok(Math.abs(Object.values(r.wear).reduce((a, b) => a + b, 0) - 8) < 1e-9);
});
test('магическая броня берёт вдвое меньше урона с очков', () => {
    const r = blast(set(true), 9);
    assert.equal(r.hp, 0);
    assert.ok(Math.abs(Object.values(r.wear).reduce((a, b) => a + b, 0) - 4.5) < 1e-9);
});
test('нет детали — её треть урона идёт в здоровье (шлем+нагрудник: 33 %, только шлем: 66 %)', () => {
    assert.ok(Math.abs(blast(set(false, ['helmet', 'chest']), 9).hp - 3) < 1e-9);
    assert.ok(Math.abs(blast(set(false, ['helmet']), 9).hp - 6) < 1e-9);
});
test('смешанный комплект считается по тем же третям', () => {
    const w = { helmet: makePiece('helmet', { magic: true }), chest: makePiece('chest', { magic: false }) };
    const r = blast(w, 9);
    assert.ok(Math.abs(r.hp - 3) < 1e-9); // (только поножей нет)
    assert.ok(Math.abs(r.wear.helmet - 1.5) < 1e-9 && Math.abs(r.wear.chest - 3) < 1e-9);
});
test('изношенная деталь пропускает остаток в здоровье', () => {
    const w = set(false); w.chest.hp = 1;
    const r = blast(w, 30); // треть 10: шлем 10 из 10, поножи 10 из 10, нагрудник 1 из 10
    assert.ok(Math.abs(r.hp - 9) < 1e-9);
});
test('живая магическая мантия забирает взрыв на себя (половина урона из запаса), обычная не помогает', () => {
    const robe = makeRobe(true); robe.mag = robe.magMax = 100;
    const r = blast({ robe }, 20);
    assert.equal(r.hp, 0);
    assert.ok(Math.abs(r.mag.robe - 10) < 1e-9);
    const plain = blast({ robe: makeRobe(false) }, 20);
    assert.ok(Math.abs(plain.hp - 20) < 1e-9);
    robe.mag = 4; // запас кончается: остаток идёт дальше
    assert.ok(Math.abs(blast({ robe }, 20).hp - 12) < 1e-9);
});

test('все взрывы — по новой системе: пушка, обрушение, давление считаются как Бомбардо', async () => {
    const { BLAST_KINDS, soakBlow } = await import('../../src/game/ArmorTypes.js');
    for (const k of ['Bombardo', 'BombardoMaxima', 'Cannon', 'collapse', 'crush']) {
        assert.ok(BLAST_KINDS.has(k));
        const w = set(false);
        assert.ok(soakBlow(w, wornEffects(w), 8, k).hp < 1e-9, k);
    }
});
