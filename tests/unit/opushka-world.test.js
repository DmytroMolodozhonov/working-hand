import test from 'node:test';
import assert from 'node:assert/strict';
import { geography, heightTriangle, OpushkaCaves } from '../../special/opushka-world.js';
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
