import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';

/**
 * Cave chests (generation 4) stand clear in their chambers: no rock anywhere in the chest
 * (3.6 × 2.4 m, 2.1 m high, turned as it stands), a floor under it, never two side by side.
 * Where two systems cross, the game moves a chest a step up or down, or leaves it out — never in the rock.
 * Chests are rare: under one per cave on average (the creative test cave aside).
 */
test('caves: every chest stands clear of the rock, on a floor, none side by side', () => {
    for (const [seed, testGround] of [[12345, true], [7, false], [99991, false]]) {
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, test: testGround, deepCaves: true });
        const systems = d.cavesNear(0, 0, 500);
        assert.ok(systems.length >= 3, `caves (seed ${seed})`);
        let all = 0, placed = 0, asMade = 0;
        for (const s of systems) {
            s.chests.forEach((c0, k) => {
                for (const o of s.chests.slice(0, k)) assert.ok(Math.hypot(o.x - c0.x, o.z - c0.z) >= 6, `${s.id}: two chests side by side`);
                all++;
                const c = d.chestSpot(c0);
                if (!c) return;
                placed++;
                if (c.y === c0.y) asMade++;
                const cos = Math.cos(c.a), sin = Math.sin(c.a);
                for (let lx = -1.8; lx <= 1.81; lx += 0.6) for (let lz = -1.2; lz <= 1.21; lz += 0.6) {
                    const x = Math.round(c.x + lx * cos + lz * sin), z = Math.round(c.z - lx * sin + lz * cos);
                    for (let L = c.y + 1; L <= c.y + 3; L++) assert.equal(d.get(x, L, z), 0, `${seed} ${s.id}: rock in the chest at ${x},${L},${z}`);
                }
                assert.notEqual(d.get(Math.floor(c.x), c.y, Math.floor(c.z)), 0, `${seed} ${s.id}: a floor under the chest`);
            });
        }
        assert.ok(placed >= 3 && placed >= all * 0.85 && asMade >= all * 0.75, `chests (seed ${seed}): ${asMade} as made, ${placed} placed of ${all}`);
        const natural = systems.filter((s) => !s.test), n = natural.reduce((k, s) => k + s.chests.length, 0);
        assert.ok(n <= natural.length * 1.0 && natural.every((s) => s.chests.length <= 2), `rare (seed ${seed}): ${n} chests in ${natural.length} caves`);
    }
});

test('chest loot: one rare thing (wand, backpack, hammer) at most, and only now and then; the rest plain', async () => {
    // (почему обновлён: автор сознательно сделал свитки, луки, оружие и щиты обычной добычей сундука «поровну с едой» —
    //  см. rollPlainItem; поэтому свиток или волшебный щит может выпасть и рядом с главной находкой. Правило «не больше
    //  одной» теперь относится к редким вещам, которые даёт только rollKeyItem: палочка, рюкзак, молот.)
    const { rollLoot, KEY_CHANCE } = await import('../../src/game/ItemTypes.js');
    const { createRng } = await import('../../src/core/math.js');
    const rare = (it) => it.kind === 'wand' || it.kind === 'backpack' || it.kind === 'hammer';
    const r = createRng(5);
    let withRare = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
        const items = rollLoot(r);
        const k = items.filter(rare).length;
        assert.ok(k <= 1, 'never two rare things in one chest');
        assert.ok(items.length >= 1 && items.length <= 3);
        if (k) withRare++;
    }
    assert.equal(KEY_CHANCE, 0.25);
    assert.ok(withRare / N > 0.04 && withRare / N < KEY_CHANCE, `rare things only now and then (${withRare} of ${N})`);
    // the creative test chests: always a precious thing first
    for (let i = 0; i < 200; i++) assert.ok(rollLoot(r, { key: 1 }).length >= 1 && rollLoot(r, { key: 1 }).some((it) => it.kind === 'wand' || it.kind === 'scroll' || it.kind === 'backpack' || it.kind === 'hammer' || it.magic));
});

test('cave light (as in Minecraft): daylight comes in by the mouth and fades a step a block; deep inside dark; the meadow lit', async () => {
    const { TEST_CAVE } = await import('../../src/world/Terrain.js');
    const d = new TerrainData();
    d.generate({ seed: 12345, mountains: true, seas: true, test: true, deepCaves: true });
    const cv = d.cavesNear(TEST_CAVE.X, TEST_CAVE.Z, 90).find((c) => c.id === 'cvtest');
    const darkAt = (x, y, z) => { const ix = Math.round(x), iz = Math.round(z); return d._skyLight(ix >> 5, iz >> 5)(ix, Math.floor(y + 1.5), iz); };
    const along = cv.segs.slice(0, 12).map((g) => darkAt((g.ax + g.bx) / 2, (g.ay + g.by) / 2 - 1, (g.az + g.bz) / 2));
    assert.ok(along[0] <= 3, `the mouth is lit (${along})`);
    assert.ok(along.slice(6).every((v) => v >= 13), `deeper in, dark (${along})`);
    for (let i = 1; i < 6; i++) assert.ok(along[i] >= along[i - 1] - 1, `it fades going in (${along})`);
    const deep = cv.chambers.slice().sort((a, b) => a.F - b.F)[0];
    assert.ok(d.skyAt(deep.x, deep.F + 2, deep.z) < 0.06, 'the deepest hall: dark');
    assert.equal(d.skyAt(0, 2, 0), 1, 'the pedestals in the open: full daylight');
});

test('cave chests stand flush on the walkable cave floor (not floating above it)', async () => {
    const d = new TerrainData();
    d.generate({ seed: 12345, mountains: true, seas: true, test: true, deepCaves: true });
    const caves = d.cavesNear(0, 0, 500);
    let tested = 0;
    for (const cv of caves) {
        if (!cv.chests?.length) continue;
        for (const sp0 of cv.chests) {
            const sp = cv.segs && d.chestSpot ? d.chestSpot(sp0) : sp0;
            if (!sp) continue;
            const cy = d.floorAt ? d.floorAt(sp.x, sp.z, sp.y) : (d.floorBelow ? d.floorBelow(Math.round(sp.x), Math.round(sp.z), Math.floor(sp.y + 1.5)) - 0.5 : sp.y - 0.5);
            const actualFloor = d.floorAt(sp.x, sp.z, cy);
            assert.ok(Math.abs(cy - actualFloor) < 0.01, 'chest at (' + sp.x + ', ' + cy + ', ' + sp.z + ') rests flush on floor (' + actualFloor + ')');
            tested++;
        }
    }
    assert.ok(tested > 0, 'tested ' + tested + ' cave chests');
});
