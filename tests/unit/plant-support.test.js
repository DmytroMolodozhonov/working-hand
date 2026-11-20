import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCK, TerrainData } from '../../src/world/Terrain.js';
import { VoxelWorld } from '../../src/world/World.js';
import { WorldTrees } from '../../src/world/Trees.js';
import { LARGE_TREE } from '../../src/world/TreeBuild.js';
import { SHAPE } from '../../src/world/BlockShapes.js';
import { hasPlantSupport } from '../../src/world/PlantSupport.js';
import { MagicFloraLife } from '../../src/game/MagicFloraLife.js';
import { Animals } from '../../src/game/Animals.js';

function flat() {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    return data;
}

test('a crater removes rooted tree models, with no invisible collision or respawn id', () => {
    const data = flat(), scene = new THREE.Scene(), boxes = new Set();
    const collision = { addBox({ minX }) { boxes.add(minX); return minX; }, removeBox(id) { boxes.delete(id); } };
    const world = Object.assign(Object.create(VoxelWorld.prototype), { scene, collision, destructible: true, trees: [], terrain: { data } });
    world.forest = new WorldTrees(world);
    world.forest.addFixed([
        { x: 40, z: 40, y: -.5, kind: 0, v: 0, species: LARGE_TREE.OAK, id: 41 },
        { x: 58, z: 40, y: -.5, kind: 0, v: 0, id: 42, deadfall: 'x' },
        { x: 80, z: 40, y: -.5, kind: 1, v: 0, id: 43 },
    ]);
    for (let x = 38; x <= 66; x++) for (let z = 38; z <= 42; z++) data.set(x, 0, z, BLOCK.AIR);
    const gone = [];
    world.pruneUnsupportedTrees(.6, id => gone.push(id));
    assert.deepEqual(gone, [41, 42]);
    assert.deepEqual(world.treesGoneList(), [41, 42]);
    assert.equal(boxes.size, 1);
    assert.equal(world.forest.byId.get(43).alive, true);
});

test('Bombarda under a legacy block tree drops its trunk and crown', () => {
    const data = flat(), x = 40, z = 40;
    data._tree((px, layer, pz, block, onlyAir) => {
        if (!onlyAir || data.get(px, layer, pz) === BLOCK.AIR) data.set(px, layer, pz, block);
    }, x, z, 0, 1);
    const world = Object.assign(Object.create(VoxelWorld.prototype), {
        destructible: true, tables: [], terrain: { data, removeSphere: data.removeSphere.bind(data) },
    });
    const hit = world.explode({ x, y: -1.8, z }, .9);
    assert.ok(hit.blocks.some(b => b.type === BLOCK.GRASS));
    assert.ok(!hit.blocks.some(b => b.type === BLOCK.BIRCH));
    assert.ok(hit.falls.some(f => f.cells.some(c => c[3] === BLOCK.BIRCH) && f.cells.some(c => c[3] === BLOCK.BIRCH_LEAVES)));
    assert.equal(data.get(x, 10, z), BLOCK.AIR);
});

test('a distant blast leaves the cactus intact; removing its sand near a guest destroys and syncs it', () => {
    const data = flat(), x = 180, z = 40;
    data.set(x, 0, z, BLOCK.SAND);
    const sync = [], drops = [], collision = [];
    const game = {
        gen: 35, authority: true, terrain: { data }, character: { group: { position: new THREE.Vector3() } },
        remotes: new Map([['guest', { position: new THREE.Vector3(x, 3, z) }]]),
        sync: { floraKill: (...event) => sync.push(event) }, collision: { removeBox: id => collision.push(id) },
        items: { spawnLoose: item => drops.push(item.kind) },
    };
    const life = new MagicFloraLife(game);
    const p = { kind: 'cactus', id: 'cactus:test', x, z, y: -.55, supportY: -.5, scale: 1, variant: 0, burn: 0, boxId: 2, picks: [] };
    life.list.cactus.push(p);
    life.byId.set(p.id, p);
    life._scanT = life._handT = 3;
    assert.equal(life.hitAt(new THREE.Vector3(), 4, 20, 'Bombardo'), false);
    life.update(.6);
    assert.ok(life.byId.has(p.id));
    data.removeSphere(x, -1.8, z, .9);
    life.update(.6);
    assert.equal(life.byId.has(p.id), false);
    assert.deepEqual(collision, [2]);
    assert.deepEqual(sync, [[p.id, 'destroy']]);
    assert.deepEqual(drops, ['cactus_spine']);
    const joiningGuest = new MagicFloraLife({ authority: false });
    joiningGuest.restoreGone(life.goneList());
    joiningGuest.netKill('cactus:unloaded', 'destroy');
    assert.ok(joiningGuest.gone.has(p.id) && joiningGuest.gone.has('cactus:unloaded'));
});

test('a root on a ramp uses the floor at its own position', () => {
    const data = flat();
    data.set(40, 1, 40, BLOCK.STONE, SHAPE.RAMP_PX);
    const y = data.surfaceY(40.2, 40);
    assert.ok(y > -.5 && y < .5);
    assert.ok(hasPlantSupport(data, 40.2, y, 40));
    data.set(40, 1, 40, BLOCK.AIR);
    assert.equal(hasPlantSupport(data, 40.2, y, 40), false);
});

test('a surviving roof above a crater cannot hold a fruit tree at its old height', () => {
    const data = flat(), x = 40, z = 40;
    const tree = { x, z, y: -.5 }, trees = new Map([['0,0', tree]]), removed = [];
    const animals = { game: { terrain: { data } }, trees, _dropFruitTree(t) { removed.push(t); } };
    data.set(x, 5, z, BLOCK.PLANKS);
    Animals.prototype._checkFruitTreeSupport.call(animals, .6);
    assert.equal(hasPlantSupport(data, x, -.5, z), true);
    data.set(x, 0, z, BLOCK.AIR);
    Animals.prototype._checkFruitTreeSupport.call(animals, .6);
    assert.deepEqual(removed, [tree]);
    assert.equal(trees.get('0,0'), null);
});
