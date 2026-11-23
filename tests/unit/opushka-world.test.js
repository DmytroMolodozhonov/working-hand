import test from 'node:test';
import assert from 'node:assert/strict';
import { geography, heightTriangle, markShoreSand, SHORE_SAND, WATER_KIND, OpushkaCaves } from '../../special/opushka-world.js';
import { caveGeometry, waterGeometry } from '../../special/opushka-mesh.js';

test('Opushka preserves its clearing and has reachable ranges, rivers, lakes and a sea', () => {
    const field = geography(() => 0.84);
    assert.equal(field(0, 0), 0.84);
    const depths = new Set();
    let peak = 0;
    for (let z = -460; z <= 460; z += 10) for (let x = -460; x <= 460; x += 10) {
        const h = field(x, z);
        if (field.water) {
            assert.ok(h < 0);
            depths.add(field.sea ? 'sea' : field.river ? 'river' : 'lake');
        }
        peak = Math.max(peak, h);
    }
    assert.deepEqual([...depths].sort(), ['lake', 'river', 'sea']);
    assert.ok(peak > 50);
});

test('height interpolation matches the terrain indices and pools omit dry cells', () => {
    const heights = [1, 3, 5, 9];
    assert.equal(heightTriangle(heights, 2, 0.25, 0.25), 2.5);
    assert.equal(heightTriangle(heights, 2, 0.75, 0.75), 6.5);
    const water = waterGeometry(0, 4, 2, (x, z) => x === 0 && z === 0 ? 1 : 0, () => [0.5, 0.5]);
    assert.equal(water.index.count, 6);
    assert.deepEqual([...water.attributes.hydro.array.slice(0, 3)], [1, 0.5, 0.5]);
});

test('shore sand follows the water and leaves dry land and some banks untouched', () => {
    const size = 421, half = 420, step = 2, field = geography(() => 0.84);
    const heights = new Float32Array(size ** 2), water = new Uint8Array(heights.length);
    const banks = new Uint8Array(heights.length), sand = new Uint8Array(heights.length);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const k = j * size + i;
        heights[k] = field(i * step - half, j * step - half);
        water[k] = field.sea ? WATER_KIND.SEA : field.river ? WATER_KIND.RIVER : field.water ? WATER_KIND.LAKE : 0;
        banks[k] = field.beach || field.bank ? 1 : 0;
    }
    markShoreSand(sand, heights, water, banks, size, half, step, (x,z)=>Math.hypot(x,z)<10);
    const sandy = new Set(), plain = new Set();
    for (let j = 2; j < size - 2; j++) for (let i = 2; i < size - 2; i++) {
        const k = j * size + i;
        if (water[k] || heights[k] < 0 || heights[k] > 2.4) {
            assert.equal(sand[k], 0);
            continue;
        }
        const near = new Set();
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
            const kind = water[k + dz * size + dx];
            if (kind && dx * dx + dz * dz <= 5) near.add(kind);
        }
        if (sand[k]) {
            assert.equal(sand[k], SHORE_SAND);
            assert.ok(near.size);
            assert.ok(Math.hypot(i * step - half, j * step - half) >= 10);
        }
        for (const kind of near) (sand[k] ? sandy : plain).add(kind);
    }
    assert.deepEqual([...sandy].sort(), [WATER_KIND.RIVER, WATER_KIND.LAKE, WATER_KIND.SEA]);
    assert.deepEqual([...plain].sort(), [...sandy].sort());
});

test('a lake can stay entirely unsanded even next to another sandy lake', () => {
    const size = 41, half = 40, step = 2;
    const heights = new Float32Array(size ** 2).fill(.42), water = new Uint8Array(heights.length);
    const sand = new Uint8Array(heights.length), banks = new Uint8Array(heights.length);
    const index = (x, z) => (z + half) / step * size + (x + half) / step;
    for (const x of [0, 10]) for (const z of [0, 2]) {
        water[index(x, z)] = WATER_KIND.LAKE;
        heights[index(x, z)] = -1;
    }
    markShoreSand(sand, heights, water, banks, size, half, step, () => false);
    for (let z = -4; z <= 6; z += 2) for (let x = -4; x <= 4; x += 2) assert.equal(sand[index(x,z)], 0);
    assert.equal(sand[index(10,-2)], SHORE_SAND);
});

test('the cave network has dry entries, underground air, solid roofs and an actual mesh', () => {
    const field = geography(() => 0.84);
    const wet = (x, z) => { field(x, z); return !!field.water; };
    const caves = new OpushkaCaves(field, wet, 470);
    assert.ok(caves.systems.length > 8);
    assert.ok(caves.systems.every(({start}) => !wet(start.x, start.z)));
    const seg = caves.systems.flatMap(({segs})=>segs).find((g) => !g.open && !caves.tile(g.ax,g.az)?.open && field(g.ax,g.az) - g.ay > 4);
    assert.ok(seg);
    assert.ok(caves.density(seg.ax, seg.ay, seg.az) < 0, 'the tunnel contains air');
    assert.ok(caves.density(seg.ax, field(seg.ax,seg.az) - 0.9, seg.az) > 0, 'the cave has a solid roof');
    const floor = caves.floor(seg.ax,seg.az,seg.ay);
    assert.ok(floor < seg.ay - 1);
    assert.ok(caves.canStand(seg.ax,floor,seg.az));
    const mesh = caveGeometry(caves,caves.tile(seg.ax,seg.az));
    assert.ok(mesh.index.count > 300);
    assert.ok(mesh.attributes.normal.array.every(Number.isFinite));
});
