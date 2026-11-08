// The sea's bottom (SeaFloor.js): plants only where the sea is ≥ 2 m deep (never on the land, never a lake), the same for every
// computer (the seed); the deep holds kelp and lilies, the shallows seagrass and corals; the shapes and the fish build; laid a few cells a
// frame (the budget), capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cellPlants, SeaFloor, FLOOR } from '../../src/fx/SeaFloor.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('only in the sea, ≥ 2 m deep; the same from the same seed; the deep and the shallows differ', () => {
    const depth = (x) => (x < 0 ? 0 : x < 400 ? 3 : 12);
    let land = 0, shallow = {}, deep = {};
    for (let cx = -30; cx < 120; cx++) for (let cz = 0; cz < 20; cz++) {
        const a = cellPlants(cx, cz, 9, (x) => depth(x)), b = cellPlants(cx, cz, 9, (x) => depth(x));
        assert.deepEqual(a, b);
        for (const p of a) {
            if (p.x < 0) land++;
            const bag = p.x < 400 ? shallow : deep;
            bag[p.kind] = (bag[p.kind] || 0) + 1;
        }
    }
    assert.equal(land, 0, 'nothing on the land');
    assert.ok(!shallow.kelp && !shallow.lily, 'no kelp in the shallows');
    assert.ok(deep.kelp > 0 && deep.lily > 0 && shallow.grass > 0, JSON.stringify({ shallow, deep }));
    // (the author 07.11: «на берегу очень много кораллов — кораллы там не живут»: the shallows hold no corals at all)
    for (const k of ['staghorn', 'fan', 'brain', 'table', 'tube', 'soft', 'anemone', 'glowcoral', 'glowfan', 'glowbrain', 'crystal']) assert.ok(!shallow[k], 'no ' + k + ' in the shallows');
});

test('it builds and lays the plants round the player within the caps; the fish swim in the water', () => {
    const SEA = (x) => x > 0;
    const t = {
        get: (x, y) => (SEA(x) ? (y <= 0 ? BLOCK.STONE : y <= 10 ? BLOCK.WATER : 0) : (y <= 11 ? BLOCK.GRASS : 0)),
        topLayer: (x) => (SEA(x) ? 0 : 11), floorBelow: (x) => (SEA(x) ? 0 : 11), landMade: () => true, isSeaColumn: (x) => SEA(x),
    };
    const g = { scene: new THREE.Scene(), seed: 3, terrain: { data: t }, sea: { s: (x) => x }, character: { group: { position: new THREE.Vector3(30, 5, 0) } }, world: {} };
    const F = new SeaFloor(g);
    for (let i = 0; i < 400 && (F.job || !F.center); i++) F.update(1 / 30);
    let n = 0;
    for (const [k, m] of Object.entries(F.meshes)) { assert.ok(m.count <= FLOOR.CAP[k]); n += m.count; }
    assert.ok(n > 50, `plants laid: ${n}`);
    for (let i = 0; i < 60; i++) F.update(1 / 30);
    assert.ok(F.fish.count > 0, 'fish');
    for (const p of F.fish.positions()) assert.ok(p.y > -0.5 && p.y < 9.5, `a fish in the water: ${p.y}`);
    assert.ok(F.critters.count('crab') > 0, 'crabs on the bottom');
});

test('a hundred kinds of fish: twenty shapes × five colourings, ten of them magic; all different', async () => {
    const { FISH_SPECIES } = await import('../../src/fx/ReefFish.js');
    assert.equal(FISH_SPECIES.length, 100);
    assert.equal(FISH_SPECIES.filter((s) => s.magic).length, 10);
    const looks = new Set(FISH_SPECIES.map((s) => s.arch + ':' + s.cols.map((c) => c.getHexString()).join(',') + ':' + s.pat));
    assert.equal(looks.size, 100, 'each its own look');
    assert.equal(new Set(FISH_SPECIES.map((s) => s.name)).size, 100, 'each its own name');
});

test('kelp never reaches out of the water: ≤ depth − 3 and ≤ KELP_MAX (the author 05.11: «водоросли выходят выше моря»)', async () => {
    const { KELP_MAX } = await import('../../src/fx/SeaFloor.js');
    const depth = (x, z) => 4 + (((Math.floor(x) * 7 + Math.floor(z) * 3) % 50) + 50) % 50;
    let n = 0;
    for (let cx = -30; cx < 30; cx++) for (let cz = -30; cz < 30; cz++) for (const p of cellPlants(cx, cz, 11, depth)) {
        if (p.kind !== 'kelp') continue;
        n++;
        assert.ok(p.s <= depth(p.x, p.z) - 3 + 1e-9 && p.s <= KELP_MAX && p.s >= 2, `kelp ${p.s.toFixed(2)} m in ${depth(p.x, p.z)} m of water`);
    }
    assert.ok(n > 100, 'there is kelp');
});


test('reef formations (the author 07.11: «целые структуры»): only in deep water, whole foot and top under it; the same from the seed; all seven build within the triangle budget', async () => {
    const { reefStructures, reefGeo, reefTris, REEF_KINDS, REEF } = await import('../../src/fx/ReefStructures.js');
    const depth = (x, z) => (x < 0 ? 0 : x < 400 ? 3 : x < 700 ? 9 : 26);
    const kinds = {}; let shallowOnes = 0, n = 0;
    for (let rx = -5; rx < 40; rx++) for (let rz = -10; rz < 10; rz++) {
        const a = reefStructures(rx, rz, 7, depth), b = reefStructures(rx, rz, 7, depth);
        assert.deepEqual(a, b);
        for (const st of a) {
            n++; kinds[st.kind] = (kinds[st.kind] || 0) + 1;
            if (st.x < 400) shallowOnes++;
            assert.ok(st.s >= REEF.MIN_SCALE);
            assert.ok(REEF_KINDS[st.kind].H * st.s <= depth(st.x, st.z) - REEF.TOP_GAP + 1e-9, 'the top is under the water: ' + st.kind);
        }
    }
    assert.equal(shallowOnes, 0, 'no formation in the shallows or on a beach');
    assert.ok(n > 30 && Object.keys(kinds).length >= 5, JSON.stringify(kinds));
    for (const k of Object.keys(REEF_KINDS)) {
        const tris = reefTris(k);
        assert.ok(tris > 3000 && tris < 26000, `${k}: ${tris} triangles`);
        const g = reefGeo(k); g.computeBoundingBox();
        const h = g.boundingBox.max.y, w = Math.max(g.boundingBox.max.x - g.boundingBox.min.x, g.boundingBox.max.z - g.boundingBox.min.z);
        assert.ok(h > REEF_KINDS[k].H * 0.6 && h < REEF_KINDS[k].H * 1.6, `${k} height ${h.toFixed(1)} vs ${REEF_KINDS[k].H}`);
        assert.ok(w > 4, `${k} width ${w.toFixed(1)}`);
        assert.ok(g.getAttribute('color') && g.getAttribute('normal'));
    }
});
