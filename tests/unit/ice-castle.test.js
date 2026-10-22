// The Ice Castle (src/world/IceCastle.js) and its life (src/game/IceQueen.js): one castle per world from
// the seed alone; on the creative test ground — on the mountain by the start; the queen, the snowmen,
// the monsters by their tables; the Ice Rod's «Frozen».
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, TEST_CAVE } from '../../src/world/Terrain.js';
import { ICE_BLOCK, ICE_CASTLE } from '../../src/world/IceCastle.js';

const world = (seed, test = false) => {
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, test });
    return d;
};

test('one Ice Castle per world: the same from the same seed, far from the start, built of ice', () => {
    for (const k of ['WALL', 'GLOW', 'FLOOR', 'DARK']) assert.equal(BLOCK['ICE_' + k], ICE_BLOCK[k]);
    const a = world(12345).iceCastle.plan, b = world(12345).iceCastle.plan;
    assert.ok(a, 'a castle in the world');
    assert.deepEqual([a.x, a.z, a.F, a.rot], [b.x, b.z, b.F, b.rot], 'the same seed — the same castle (every computer, the workers)');
    const d = Math.hypot(a.x, a.z);
    assert.ok(d > ICE_CASTLE.MIN * 0.8 && d < ICE_CASTLE.MAX * 1.15, `far from the start, but reachable: ${Math.round(d)} m`);
    // it is ONE: the index knows exactly one castle, whatever is asked
    const t = world(12345);
    assert.equal(t.sites.ice, t.iceCastle);
    assert.ok(t.sites.landAt(Math.round(a.x), Math.round(a.z))?.ice, 'its summit is levelled');
    // its blocks are in the chunks: the hall's snowflake floor under the throne, glacier ice in the walls
    const thr = a.throne;
    let ice = 0;
    for (let L = a.F; L <= a.F + 6; L++) if (t.get(Math.round(thr.x), L, Math.round(thr.z)) >= BLOCK.ICE_WALL) ice++;
    assert.ok(ice >= 2, 'the throne and its dais are ice');
    const floor = t.get(Math.round(a.hall.x), a.floor, Math.round(a.hall.z));
    assert.ok(floor === BLOCK.ICE_FLOOR || floor === BLOCK.ICE_GLOW, 'the hall floor: ice with a snowflake');
    // the gates: an opening through the wall (the leaves are doors)
    assert.equal(t.get(Math.round(a.gate.x), a.floor + 2, Math.round(a.gate.z)), BLOCK.AIR);
    // a different world, a different place
    const c = world(777).iceCastle.plan;
    assert.ok(c && (c.x !== a.x || c.z !== a.z));
});

test('Creative: the castle stands on the mountain right by the start (seen at once)', () => {
    const p = world(42, true).iceCastle.plan;
    assert.ok(p);
    assert.ok(Math.hypot(p.x - TEST_CAVE.X, p.z - TEST_CAVE.Z) < TEST_CAVE.R, 'on the test mountain');
    assert.ok(Math.hypot(p.x, p.z) < 150, 'by the start');
});

test('the Ice Queen: the plain spells (known without a scroll) do nothing on her; fire hurts her more, the stronger the fire; scroll spells and blades as usual', async () => {
    const { iceDamage, iceBolt, ICE } = await import('../../src/game/IceQueen.js');
    assert.equal(ICE.QUEEN.HP, 350);
    for (const k of ['Bombardo', 'Sapira', 'Thunderwave' === 'x' ? '' : 'Wind', 'CircleAttack', 'WaveAttack', 'Ice', 'Frozen', 'Liquidation', 'Earthquake']) assert.equal(iceDamage('queen', k, 10), 0, k);
    for (const s of ['Stupefy', 'SapiraDuel', 'IceDuel', 'Jolt', 'Expelliarmus', 'SandsDuel']) assert.equal(iceBolt('queen', s).dmg, 0, s);
    assert.ok(iceDamage('queen', 'Inferno', 10) > 10, 'Inferno: more than its damage');
    assert.ok(iceDamage('queen', 'FireMaxima', 10) > iceDamage('queen', 'Inferno', 10), 'Fire Maxima stronger');
    assert.ok(iceDamage('queen', 'Hellfire', 10) > iceDamage('queen', 'FireMaxima', 10), 'the Hellfire the strongest');
    assert.equal(iceDamage('queen', 'Lightning', 20), 20, 'a scroll spell: as usual');
    assert.equal(iceBolt('queen', 'AvadaKedavra').dmg, 25, '«Авада Кедавра» (a scroll): −25');
    assert.equal(iceDamage('queen', 'melee', 12), 12, 'a sword: as usual');
    // the monsters: fire hurts; a blade only chips the ice
    assert.ok(iceDamage('monster', 'Inferno', 10) > 10);
    assert.equal(iceDamage('monster', 'melee', 10), 5);
    assert.equal(ICE.MONSTER.S, 2, 'twice a villager');
    assert.equal(ICE.QUEEN.S, 1.5, 'one and a half villagers tall');
});

test('a snowman: 10 HP, a snowflake −1; a blast shatters it, fire melts it; ice does nothing', async () => {
    const { iceDamage, ICE } = await import('../../src/game/IceQueen.js');
    assert.equal(ICE.SNOW.HP, 10);
    assert.equal(ICE.SNOW.DMG, 1, 'one snowflake: −1 HP');
    assert.ok(iceDamage('snowman', 'Bombardo', 5) >= 10, 'Bombardo shatters it');
    assert.ok(iceDamage('snowman', 'Inferno', 3) >= 10, 'fire melts it');
    assert.equal(iceDamage('snowman', 'IceDuel', 10), 0);
    assert.equal(iceDamage('snowman', 'Sapira', 10), 10, 'any other blow: as it is');
});

test('the castle stands high up on bare rock and snow: no grass, no trees round it', () => {
    for (const [seed, t] of [[12345, false], [777, false], [42, true]]) {
        const d = world(seed, t), P = d.iceCastle.plan;
        assert.ok(P.F >= (t ? ICE_CASTLE.TEST_PEAK : ICE_CASTLE.PEAK_MIN), `high: ${P.F}`);
        let grass = 0, n = 0;
        for (let dx = -70; dx <= 70; dx += 3) for (let dz = -70; dz <= 70; dz += 3) {
            const x = P.x + dx, z = P.z + dz;
            if (!d.iceCastle.rocky(x, z)) continue;
            n++;
            if (d.get(x, d.topLayer(x, z), z) === BLOCK.GRASS) grass++;
        }
        assert.ok(n > 100);
        assert.equal(grass, 0, `seed ${seed}: grass on the castle's mountain`);
    }
});

test('the Ice Queen\'s chests (every boss has chests): ice things — her robe, mana crystals, potions, treasure', async () => {
    const { rollIceQueenLoot, isGodGift } = await import('../../src/game/ItemTypes.js');
    const P = world(12345).iceCastle.plan;
    assert.equal(P.chests.length, 2, 'two chests by the throne');
    const a = rollIceQueenLoot(Math.random, true);
    assert.ok(a.some((it) => it.kind === 'robe' && it.magic), 'her robe');
    assert.ok(a.some((it) => it.kind === 'crystal'), 'mana crystals');
    assert.ok(a.some((it) => it.kind === 'potion'), 'potions');
    // gifts of the gods: the Ice Rod — no spell destroys it
    assert.ok(isGodGift({ kind: 'iceRod' }));
    assert.ok(!isGodGift({ kind: 'wand' }));
    const fs = await import('node:fs');
    assert.match(fs.readFileSync(new URL('../../src/game/Liquidation.js', import.meta.url), 'utf8'), /isGodGift\(L\.item\)/, '«Liquidation» never takes it');
    assert.match(fs.readFileSync(new URL('../../src/world/World.js', import.meta.url), 'utf8'), /godGift: true/, 'the creative pedestals');
});

test('the queen\'s ice is dense: a blast breaks several times less of it than of the same ice elsewhere', () => {
    const d = world(42, true);
    const p = d.iceCastle.plan;
    const isIce = (t) => t >= ICE_BLOCK.WALL && t <= ICE_BLOCK.DARK;
    // the hall's wall, at the gates' side: a blast of radius 4 on it
    const g = p.gate;
    let L = Math.round(g.y + 4);
    let x = Math.round(g.x), z = Math.round(g.z);
    for (let i = 0; i < 6 && !isIce(d.get(x, L, z)); i++) L++;
    const before = d.removeSphere(x, L - 1, z, 4).filter((b) => isIce(b.type)).length;
    // the same ice outside the palace: a block of it far away, the same blast
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) d.set(500 + i, 60 + k, 500 + j, ICE_BLOCK.WALL);
    const plain = d.removeSphere(500, 59, 500, 4).filter((b) => isIce(b.type)).length;
    assert.ok(plain > 150, `plain ice: ${plain}`);
    assert.ok(before > 0, 'the heart of the blast still breaks it');
    assert.ok(before < plain / 4, `the queen's ice: ${before} < ${plain} / 4`);
});
