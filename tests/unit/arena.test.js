/**
 * The duel arenas: the enchanted stone (EnchantedStone.js — a blast is, the stone stays; only «Бум»,
 * «Инспириус» and «Total Destruction Максима» break it, near their middle), the arena beside a tower
 * (DuelArenas.js), the rules (ArenaRules.js): 5 minutes at most, a kill is a foul — a part of the wizards
 * attack, a fall after «Вингардиум Левиоса» is an accident.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { isEnchanted, breaking, applyingDone, ENCHANT_BREAKERS, ENCHANTED_VS } from '../../src/world/EnchantedStone.js';
import { ruinArea } from '../../src/world/Ruin.js';
import { runBoom } from '../../src/world/BoomCarve.js';
import { onArenaFloor } from '../../src/world/DuelArenas.js';
import { ARENA_DUEL, ARENA_SPELLS, isBanned, killVerdict, avengers, duelClock, arenaSpell, arenaDefence, arenaDownTime, softBlow } from '../../src/game/ArenaRules.js';

/** A cell of the tower's wall (the drum, r 15…17 — not a window). */
function wallCell(t, tw) {
    for (let L = 1; L < 12; L++) for (const d of [16, 17, 15]) if (t.get(tw.x + d, L, tw.z) === BLOCK.ARCANE_WARD) return [tw.x + d, L, tw.z];
    return null;
}

function world() {
    const t = new TerrainData();
    t.generate({ seed: 7, mountains: true, seas: true, lush: true, deepCaves: true });
    const towers = t.towers.near(0, 0, 2000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const tw of towers) { const a = t.sites.arenas.ofTower(tw); if (a) return { t, a, tw }; }
    throw new Error('no arena');
}

test('an arena stands beside a tower: floor and stands of the enchanted stone, seats, gates, the lectern', () => {
    const { t, a, tw } = world();
    const cx = Math.round(a.centre.x), cz = Math.round(a.centre.z), L = t.topLayer(cx + 6, cz);
    assert.equal(t.get(cx + 6, L, cz), BLOCK.ENCHANTED, 'the floor');
    assert.ok(a.seats.length > 200, 'seats: ' + a.seats.length);
    const s = a.seats[a.seats.length - 1], sL = t.topLayer(Math.round(s.x), Math.round(s.z));
    assert.ok(isEnchanted(t.get(Math.round(s.x), sL, Math.round(s.z))), 'a seat on the stands');
    assert.ok(onArenaFloor(a, a.gates[0].mark.x, a.gates[0].mark.z) && onArenaFloor(a, a.gates[1].mark.x, a.gates[1].mark.z), 'the two marks on the floor');
    assert.equal(t.get(Math.round(a.desk.book.x), Math.round(a.desk.book.y), Math.round(a.desk.book.z)), BLOCK.BOOKS, 'the book of duels');
    assert.ok(wallCell(t, tw), 'the tower\'s wall: the same enchanted stone');
    // the same arena on another computer (from the seed)
    const b = world().a;
    assert.deepEqual([b.x, b.z, b.rot, b.F, b.seats.length], [a.x, a.z, a.rot, a.F, a.seats.length]);
});

test('«Бомбардо» and the deforming spells: the blast is, the enchanted stone stays (and the plain Total Destruction)', () => {
    const { t, a, tw } = world();
    const cx = Math.round(a.centre.x), cz = Math.round(a.centre.z), L = t.topLayer(cx + 6, cz);
    const out = t.removeSphere(cx + 6, L - 1, cz, 5); // (Bombardo on the floor)
    assert.equal(out.filter((b) => isEnchanted(b.type)).length, 0);
    assert.equal(t.get(cx + 6, L, cz), BLOCK.ENCHANTED);
    const w = wallCell(t, tw);
    t.removeSphere(w[0], w[1] - 1, w[2], 4); // (and on the tower's wall)
    assert.equal(t.get(w[0], w[1], w[2]), BLOCK.ARCANE_WARD);
    // a spell that changes a block (Stitching, Gather, Liquidation, ice…) — refused; never made by a spell either
    t.set(cx + 6, L, cz, BLOCK.AIR);
    assert.equal(t.get(cx + 6, L, cz), BLOCK.ENCHANTED);
    t.set(cx + 6, L + 1, cz, BLOCK.ENCHANTED);
    assert.equal(t.get(cx + 6, L + 1, cz), BLOCK.AIR);
    // the plain «Total Destruction» (a ruin of 28 m): the arena stands
    ruinArea(t, cx, L, cz, 28);
    assert.equal(t.get(cx + 6, L, cz), BLOCK.ENCHANTED);
    assert.equal(t.get(cx, L, cz + 20), BLOCK.ENCHANTED);
    // what the host's world already did (the network, a save) — obeyed
    applyingDone(t, () => t.set(cx + 6, L, cz, BLOCK.AIR));
    assert.equal(t.get(cx + 6, L, cz), BLOCK.AIR);
    assert.ok(Object.keys(ENCHANTED_VS).length >= 15);
});

test('«Бум», «Инспириус», «Total Destruction Максима» break it — only near their middle', () => {
    {
        const { t, a } = world();
        const cx = Math.round(a.centre.x), cz = Math.round(a.centre.z), L = t.topLayer(cx + 6, cz);
        breaking(t, 'TotalDestructionMaxima', cx, cz, () => ruinArea(t, cx, L, cz, 28));
        assert.notEqual(t.get(cx + 3, L, cz), BLOCK.ENCHANTED, 'within 6 m: broken');
        assert.equal(t.get(cx, L, cz + 12), BLOCK.ENCHANTED, 'beyond: whole');
    }
    {
        const { t, a } = world();
        const cx = Math.round(a.centre.x), cz = Math.round(a.centre.z), L = t.topLayer(cx + 6, cz);
        runBoom(t, { boom: 1, p: [cx, L, cz], b: L - 10, r: 56 }); // («Бум» right under the arena)
        assert.notEqual(t.get(cx + 5, L, cz), BLOCK.ENCHANTED, 'near the middle: broken');
        const r = ENCHANT_BREAKERS.Boom.r + 6;
        assert.equal(t.get(cx, L, cz + r), BLOCK.ENCHANTED, 'beyond its circle: the stone holds');
        assert.ok(t.get(cx, L - 1, cz + r) !== BLOCK.AIR, 'and the ground under it stays (nothing hangs)');
    }
    {
        const { t, a } = world();
        const cx = Math.round(a.centre.x), cz = Math.round(a.centre.z), L = t.topLayer(cx + 6, cz);
        breaking(t, 'Inspirius', cx, cz, () => t.removeSphere(cx, L - 1, cz, 14));
        assert.ok(!isEnchanted(t.get(cx + 4, L, cz)) && !isEnchanted(t.get(cx, L, cz + 4)));
        assert.ok(isEnchanted(t.get(cx + 11, L, cz)) && isEnchanted(t.get(cx, L, cz + 11)));
    }
});

test('the rules: a duel ends at 5 minutes (the bots\' too); deadly spells banned; the bots never cast them', () => {
    assert.equal(ARENA_DUEL.MAX_T, 300);
    assert.equal(duelClock(299.9), 'on');
    assert.equal(duelClock(300), 'draw');
    assert.ok(isBanned('AvadaKedavra') && !isBanned('Stupefy') && !isBanned('LevitateDuel') && !isBanned('Bombardo'));
    for (const s of ['Stupefy', 'Jolt', 'JoltMaxima', 'Wind', 'WindMaxima', 'Expelliarmus', 'LevitateDuel']) assert.equal(ARENA_SPELLS[s].rule, 'ok', s);
    for (const s of ['IceDuel', 'Levitation', 'Bombardo']) assert.equal(ARENA_SPELLS[s].rule, 'care', s);
    for (let i = 0; i < 500; i++) {
        const s = arenaSpell({ role: ['student', 'adept', 'teacher'][i % 3], foeHp: i % 2 ? 30 : 10 });
        assert.ok(!isBanned(s), s);
        if (i % 2 === 0) assert.notEqual(s, 'SapiraDuel', 'never the hurting one at a weak foe');
    }
    assert.equal(arenaSpell({ finish: true }), 'Expelliarmus');
    // fresh, a duellist meets most charges; tired — fewer (the duel is long, but it ends)
    let fresh = 0, tired = 0;
    for (let i = 0; i < 2000; i++) {
        if (arenaDefence({ skill: 1, mana: 100, maxMana: 100, eta: 1, canCounter: true })) fresh++;
        if (arenaDefence({ skill: 1, mana: 8, maxMana: 100, eta: 1, canCounter: true })) tired++;
    }
    assert.ok(fresh / 2000 > 0.9 && tired < fresh * 0.85, `${fresh} ${tired}`);
    for (let i = 0; i < 300; i++) assert.ok(!['SapiraDuel', 'JoltMaxima'].includes(arenaSpell({ role: 'teacher', foeHp: 40, player: true })), 'never the hurting ones at a player');
    // a fresh duellist is up again in a moment, a worn-out one stays down; two wizards never kill each other
    assert.ok(arenaDownTime(1) < 3 && arenaDownTime(0) > 10);
    assert.equal(softBlow(10, 12), 10);
    assert.equal(softBlow(10, 4), 3);
    assert.equal(softBlow(10, 1), 0);
});

test('a kill at the arena is a foul: a part of the wizards attack (never all); a fall after «Вингардиум Левиоса» is an accident', () => {
    assert.equal(killVerdict({ byOpponent: true }), 'foul');
    assert.equal(killVerdict({ byOpponent: true, kind: 'SapiraDuel' }), 'foul');
    assert.equal(killVerdict({ byOpponent: true, via: 'leviosa' }), 'accident');
    assert.equal(killVerdict({ byOpponent: true, kind: 'fall' }), 'accident');
    assert.equal(killVerdict({ byOpponent: false }), 'none');
    const ten = Array.from({ length: 10 }, (_, i) => i);
    const a = avengers(ten);
    assert.ok(a.length >= 1 && a.length < ten.length, 'a part: ' + a.length);
    assert.equal(avengers([1]).length, 1);
    assert.equal(avengers([]).length, 0);
});

test('arena: the duellists vary their spells and move by how worn out they are', async () => {
    const { arenaSpell, arenaStance } = await import('../../src/game/ArenaRules.js');
    const seen = new Set(); let last = null, repeats = 0;
    for (let i = 0; i < 60; i++) { const s = arenaSpell({ role: 'teacher', foeHp: 40, last }); if (s === last) repeats++; seen.add(s); last = s; }
    assert.ok(seen.size >= 4, 'at least 4 different spells: ' + [...seen]);
    assert.ok(repeats < 30);
    assert.equal(arenaStance({ mana: 3, maxMana: 40, foeMana: 40, foeMaxMana: 40 }).mood, 'back');
    assert.equal(arenaStance({ mana: 40, maxMana: 40, foeMana: 3, foeMaxMana: 40 }).mood, 'press');
    assert.equal(arenaStance({}).mood, 'even');
});
