import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { ruinArea, ruinSample, RUIN } from '../../src/world/Ruin.js';

function flat() { const d = new TerrainData(); d.generate({ seed: 1 }); return d; }
/** A stone keep: 4 walls 12 high on the grass, a floor halfway, a roof, a tree beside it. */
function keep(d, x0, z0, n = 10) {
    for (let L = 1; L <= 12; L++) for (let i = 0; i <= n; i++) {
        d.set(x0 + i, L, z0, BLOCK.CS_GREY); d.set(x0 + i, L, z0 + n, BLOCK.CS_GREY);
        d.set(x0, L, z0 + i, BLOCK.CS_GREY); d.set(x0 + n, L, z0 + i, BLOCK.CS_GREY);
    }
    for (let i = 0; i <= n; i++) for (let k = 0; k <= n; k++) { d.set(x0 + i, 6, z0 + k, BLOCK.PLANKS); d.set(x0 + i, 13, z0 + k, BLOCK.ROOF_RED); }
    for (let L = 1; L <= 6; L++) d.set(x0 - 3, L, z0 - 3, BLOCK.WOOD);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) d.set(x0 - 3 + i, 7, z0 - 3 + k, BLOCK.LEAVES);
}
const count = (d, x0, x1, z0, z1, L0, L1, ok) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let L = L0; L <= L1; L++) if (ok(d.get(x, L, z))) n++;
    return n;
};

test('«Total Destruction»: the keep falls into ruins — no tall walls, rubble on the ground, the ground sank a little, no crater', () => {
    const d = flat();
    keep(d, -5, -5);
    const before = count(d, -8, 5, -8, 5, 1, 14, (t) => t >= BLOCK.CS_GREY || t === BLOCK.WOOD);
    assert.ok(ruinSample(d, 0, 0).length > 50, 'the walls are there to crack');
    const r = ruinArea(d, 0, -0.5, 0);
    assert.ok(r.removed.length > 0.7 * before, 'most of the keep came down');
    assert.ok(r.rubble.length > 20, 'rubble lies in heaps');
    assert.ok(r.sunk > 100, 'the ground sank');
    // nothing tall stands: the stubs and heaps are a few blocks high at most
    assert.equal(count(d, -8, 5, -8, 5, 6, 20, (t) => t !== BLOCK.AIR && t !== BLOCK.WATER), 0, 'no wall, floor, roof or crown higher up');
    // a dip, not a crater: the ground is at most 2 blocks lower
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        let g = 0;
        while (g > -6 && d.get(x, g, z) === BLOCK.AIR) g--;
        assert.ok(g >= -2, `the ground at ${x},${z} is only a little lower (${g})`);
    }
    assert.ok(d.get(0, -1, 0) !== BLOCK.AIR || d.get(0, -2, 0) !== BLOCK.AIR, 'the ground is still under the middle');
});

test('«Total Destruction» leaves the same ruins on every computer; far away nothing changes', () => {
    const a = flat(), b = flat();
    for (const d of [a, b]) { keep(d, -5, -5); keep(d, 40, 40, 4); ruinArea(d, 1, -0.5, 2); }
    for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) for (let L = -3; L <= 14; L++) assert.equal(a.get(x, L, z), b.get(x, L, z));
    assert.equal(a.get(40, 12, 40), BLOCK.CS_GREY, 'a house 50 m away still stands');
    assert.ok(RUIN.RADIUS >= 12, 'much bigger than «Бомбардо Максима»');
});

test('«Total Destruction» is heard in English and in Russian', async () => {
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    for (const t of ['Total Destruction', 'тотал дестракшн', 'Тотал Дестракшен', 'тотал дистракшн']) assert.equal(matchSpell(t), 'TotalDestruction', t);
    for (const t of ['Total Destruction Maxima', 'тотал дестракшн максима']) assert.equal(matchSpell(t), 'TotalDestructionMaxima', t);
    assert.equal(matchSpell('бомбардо максима'), 'BombardoMaxima');
    assert.equal(matchSpell('стоп'), 'Stand');
});

test('«Total Destruction» over a cave: its ceiling breaks off and lies on its floor as heaps of stones (a cave-in)', () => {
    const d = flat();
    // a cave hall 21×21, 4 high, under 5 blocks of ground
    const air = () => { let n = 0; for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) for (let L = -8; L <= -5; L++) if (d.get(x, L, z) === BLOCK.AIR) n++; return n; };
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) for (let L = -8; L <= -5; L++) d.set(x, L, z, BLOCK.AIR);
    const before = air();
    const r = ruinArea(d, 0, -0.5, 0);
    let heaps = 0, higher = 0;
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
        if (d.get(x, -8, z) !== BLOCK.AIR) heaps++;
        if (d.get(x, -4, z) === BLOCK.AIR) higher++;
    }
    assert.ok(air() < before * 0.85, `the cave is partly filled (${before} → ${air()})`);
    assert.ok(heaps > 150, 'stones lie on the cave floor');
    assert.ok(higher > 150, 'the ceiling broke off: the cave is higher and ragged');
    assert.ok(r.removed.filter(([, L]) => L < 0).length > 300, 'the falling ceiling is seen falling');
    // the same cave-in on another computer
    const e = flat();
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) for (let L = -8; L <= -5; L++) e.set(x, L, z, BLOCK.AIR);
    ruinArea(e, 0, -0.5, 0);
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let L = -9; L <= 2; L++) assert.equal(d.get(x, L, z), e.get(x, L, z));
});
