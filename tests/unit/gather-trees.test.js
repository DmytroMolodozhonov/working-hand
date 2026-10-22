// «Gather» takes ANY tree (all five kinds, trunk or crown, spawn-area or of blocks), even when the hand points a bit beside.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Builder } from '../../src/game/Builder.js';
import { LivingTrees } from '../../src/game/LivingTrees.js';
import { BLOCK, TREE_KINDS } from '../../src/world/Terrain.js';

const G = 10;
function setup() {
    const cells = new Map();
    const data = {
        get: (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= G ? BLOCK.GRASS : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(x + ',' + L + ',' + z, t),
        raycast(o, d, max) { for (let t = 0; t <= max; t += 0.1) { const x = Math.round(o.x + d.x * t), L = Math.floor(o.y + d.y * t + 1.5), z = Math.round(o.z + d.z * t); if (this.get(x, L, z) !== BLOCK.AIR) return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, dist: t }; } return null; },
    };
    const added = [];
    const g = {
        terrain: { data }, world: { trees: [], removed: [], removeTree(t) { t.alive = false; this.removed.push(t); } },
        inventory: { slots: new Array(5).fill(null), addResource(b, n) { added.push([b, n]); } },
        hud: { toast() {} }, fx: { spark() {} }, wards: null, castleLife: null,
    };
    g.livingTrees = Object.create(LivingTrees.prototype);
    g.livingTrees.game = g;
    g.builder = new Builder(g);
    g.builder._flyToHand = () => {};
    g.builder._sendEdits = () => {};
    return { g, data, added };
}
const aim = (b, o, d) => { b._hand = () => ({ side: 'right', o: new THREE.Vector3(...o), d: new THREE.Vector3(...d).normalize() }); };

TREE_KINDS.forEach((k, i) => {
    test(`Gather on a tree of blocks: ${k.name} (trunk, then crown; hand a little beside)`, () => {
        for (const target of ['trunk', 'crown', 'beside']) {
            const { g, data, added } = setup();
            for (let L = G + 1; L <= G + 6; L++) data.set(8, L, 0, k.wood);
            for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) for (const L of [G + 7, G + 8]) data.set(8 + dx, L, dz, k.leaves);
            const y = G + 1.5;
            aim(g.builder, [0, y, 0], target === 'trunk' ? [1, 0, 0] : target === 'crown' ? [8, 6, 0] : [8, 0.4, 1.0]);
            assert.equal(g.builder.gather(), null, `${k.name} ${target}`);
            assert.deepEqual(added, [[k.wood, 20]], `${k.name} ${target}: 20 wood`);
            assert.equal(data.get(8, G + 3, 0), BLOCK.AIR, 'the trunk is gone');
        }
    });
    test(`Gather on a spawn-area tree: ${k.name}, from 15 m and a bit beside`, () => {
        const { g, added } = setup();
        const t = { x: 15, z: 0, alive: true, index: i, kind: i, y: G - 0.5 };
        g.world.trees.push(t);
        aim(g.builder, [0, G + 1.5, 0], [15, 0.5, 1.6]);
        assert.equal(g.builder.gather(), null);
        assert.deepEqual(added, [[k.wood, 20]]);
        assert.equal(g.world.removed[0], t);
    });
});

test('Gather with no tree near the line: a clear hint (no crash)', () => {
    const { g, added } = setup();
    aim(g.builder, [0, 1.5, 0], [1, 0.3, 0]);
    const r = g.builder.gather();
    assert.ok(typeof r === 'string' || r === null);
    g.world.trees.push({ x: 15, z: 12, alive: true, index: 0, kind: 0, y: -0.5 });
    aim(g.builder, [0, 11.5, 0], [1, 0.1, 0]);
    assert.match(g.builder.gather() || '', /Направьте руку/);
    assert.deepEqual(added.filter((a) => a[0] === BLOCK.WOOD), []);
});
