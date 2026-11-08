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
