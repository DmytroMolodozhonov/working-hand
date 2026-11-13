// The real trees (TreeBuild.js — their shapes; Terrain._meshTree — where they stand in a world made with them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, TREE_GEN, TREE_SIZES } from '../../src/world/TreeBuild.js';
import { TerrainData, CHUNK, BLOCK, MIN_LAYER, MAX_LAYER, treeFitsChunk } from '../../src/world/Terrain.js';

const shapes = [];
for (let k = 0; k < TREE_GEN.KINDS; k++) for (let v = 0; v < TREE_GEN.VARIANTS; v++) shapes.push([k, v]);

test('a tree is the same from the same kind and shape (every computer draws the same tree)', () => {
    for (const [k, v] of [[0, 3], [2, 7], [4, 11]]) {
        const a = buildTree(k, v), b = buildTree(k, v);
        assert.deepEqual([...a.wood.pos], [...b.wood.pos]);
        assert.deepEqual([...a.leaf.uv], [...b.leaf.uv]);
        assert.notDeepEqual([...a.wood.pos.slice(0, 30)], [...buildTree(k, v + 1).wood.pos.slice(0, 30)], 'the shapes of a kind differ');
    }
});

test('sizes from the world: taller than the hero by far, nothing but the trunk low enough to touch', () => {
    for (const [k, v] of shapes) {
        const { info, wood, leaf } = buildTree(k, v);
        const name = `${TREE_SIZES[k].name} ${v}`;
        assert.ok(info.H >= 8.5 && info.H <= 31, `${name}: height ${info.H.toFixed(1)}`);
        assert.ok(info.W >= 4 && info.W <= 24, `${name}: crown ${info.W.toFixed(1)}`);
        assert.ok(info.R0 * 2 >= 0.3 && info.R0 * 2 <= 2.0, `${name}: trunk ${(info.R0 * 2).toFixed(2)}`);
        // (the hero is 3.5 m: the leaves start well above the head)
        assert.ok(info.crown.lowest >= 4.2, `${name}: the lowest leaf at ${info.crown.lowest.toFixed(2)} m`);
        for (const a of [wood.pos, leaf.pos, wood.nor, leaf.nor, leaf.uv]) for (const x of a) assert.ok(Number.isFinite(x), `${name}: a NaN`);
        assert.ok(info.spheres.length >= 4, `${name}: the crown's clusters (hits)`);
    }
});

test('branches grow out of their parents, the trunk out of the ground', () => {
    for (const [k, v] of shapes) {
        const { info } = buildTree(k, v);
        assert.ok(info.trunk.pts[0][1] < 0, 'the trunk goes into the ground');
        assert.ok(info.joints.length > 10, 'branches');
        for (const j of info.joints) assert.ok(j.d <= j.parentR + 1e-6, `${TREE_SIZES[k].name} ${v}: a branch ${j.d.toFixed(3)} m off its parent`);
    }
});

test('far away the very same tree, lighter: its branches where they are near, its crown as wide (no tree «loading» as it comes near)', () => {
    for (const [k, v] of [[0, 2], [1, 5], [2, 8], [3, 1], [4, 6]]) {
        const near = buildTree(k, v).info, far = buildTree(k, v, { far: true }).info;
        assert.deepEqual(far.trunk.pts, near.trunk.pts, 'the same trunk');
        for (let i = 0; i < 6; i++) assert.ok(Math.abs(far.box[i] - near.box[i]) < 2.6, `${TREE_SIZES[k].name} ${v}: the crown's reach ${i}: ${far.box[i].toFixed(1)} / ${near.box[i].toFixed(1)}`);
    }
});

test('points: detailed near, light far (a forest stays smooth)', () => {
    let sum = 0;
    for (const [k, v] of shapes) {
        const near = buildTree(k, v).info.verts, far = buildTree(k, v, { far: true }).info.verts;
        sum += near;
        assert.ok(near <= 11000, `${TREE_SIZES[k].name} ${v}: ${near} points near`);
        assert.ok(far <= 2600 && far < near / 2.5, `${TREE_SIZES[k].name} ${v}: ${far} points far`);
    }
    assert.ok(sum / shapes.length <= 7000, `on average ${Math.round(sum / shapes.length)} points`);
});

const recipe = { seed: 4242, mountains: true, seas: true, deepCaves: true, lush: true };

test('a world made with real trees: they stand where the block trees would, the same on every computer; old worlds keep their block trees', () => {
    const a = new TerrainData(), b = new TerrainData(), old = new TerrainData();
    a.generate({ ...recipe, meshTrees: true });
    b.generate({ ...recipe, meshTrees: true });
    old.generate(recipe);
    let n = 0, wood = 0, woodOld = 0;
    const ids = new Set();
    const woodT = new Set([BLOCK.WOOD, BLOCK.BIRCH, BLOCK.SPRUCE, BLOCK.CHERRY, BLOCK.DARK]);
    for (let cx = 4; cx < 12; cx++) for (let cz = -4; cz < 4; cz++) {
        const ca = a.chunk(cx, cz), cb = b.chunk(cx, cz), co = old.chunk(cx, cz);
        assert.deepEqual(ca.trees || [], cb.trees || []);
        assert.equal(co.trees, undefined, 'an old world: no real trees');
        for (const t of ca.trees || []) {
            n++;
            assert.ok(!ids.has(t.id), 'one id a tree');
            ids.add(t.id);
            assert.equal(Math.floor((t.x - 0.01) / CHUNK) === cx || Math.floor(t.x / CHUNK) === cx, true, 'kept in the chunk it stands in');
            assert.ok(t.v >= 0 && t.v < TREE_GEN.VARIANTS && t.kind >= 0 && t.kind < 5);
            assert.ok(Math.abs(t.y + 0.5 - a.topLayer(Math.floor(t.x), Math.floor(t.z))) <= 1, 'on the ground');
        }
        for (const x of ca.blocks) if (woodT.has(x)) wood++;
        for (const x of co.blocks) if (woodT.has(x)) woodOld++;
    }
    assert.ok(n >= 10, `trees: ${n}`);
    assert.ok(woodOld > 100, 'the old world has its block trees');
    assert.ok(wood < woodOld / 4, 'no block trees where the real ones stand');
});

test('the apple trees: real apples hanging within a raised hand\'s reach, all round the crown', () => {
    for (const kind of [5, 6]) {
        let good = 0;
        for (let v = 0; v < TREE_GEN.VARIANTS; v++) {
            const { info } = buildTree(kind, v);
            for (const [x, y, z] of info.apples) {
                assert.ok(y >= 2.9 && y <= 4.4, `apple at ${y.toFixed(2)} m`);
                assert.ok(Math.hypot(x, z) >= 1.2, 'not inside the trunk');
            }
            if (info.apples.length >= 12) good++;
            assert.ok(info.H >= 6.5 && info.H <= 11, `${TREE_SIZES[kind].name}: ${info.H.toFixed(1)} m`);
        }
        assert.ok(good >= 3, `${TREE_SIZES[kind].name}: shapes with apples enough — ${good}`);
    }
});

test('the trees are lit by the land\'s own rules: per pixel like the blocks, night and caves (the sky\'s share), the sun\'s shadows', async () => {
    const THREE = await import('three');
    const { sharedTreeMaterials } = await import('../../src/world/TreeMaterials.js');
    const M = sharedTreeMaterials();
    // (the same model of light as TerrainView's blocks: Phong, the same dull shine)
    assert.equal(M.leaves.type, 'MeshPhongMaterial');
    assert.equal(M.leaves.shininess, 8);
    assert.equal(M.bark, M.leaves, 'the bark is lit by the same shader');
    // its shader: night / caves (uSkyComp from applySkyComp), leaves lit alike from both sides, bark relief
    const lib = THREE.ShaderLib.phong;
    const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    M.leaves.onBeforeCompile(shader, null);
    assert.ok(shader.uniforms.uSkyComp, 'the sky\'s share (night, caves) — as the blocks');
    assert.match(shader.fragmentShader, /reflectedLight\.directDiffuse \*= uSkyComp/);
    assert.match(shader.fragmentShader, /normal = normalize\( vNormal \);/, 'a leaf seen from behind is not black');
    assert.match(shader.fragmentShader, /vTreeBark/, 'the bark has its relief');
    assert.match(shader.vertexShader, /attribute float sway/);
});


test('cave-mouth trees need real soil, solid support and a clear trunk after carving', () => {
    const c = { cx: 0, cz: 0, blocks: new Uint8Array((MAX_LAYER - MIN_LAYER + 1) * CHUNK * CHUNK) };
    const put = (x, h, z, b) => { c.blocks[((h - MIN_LAYER) * CHUNK + z) * CHUNK + x] = b; };
    const h = 12, x = 8, z = 9;
    const data = { seed: 31, sites: null };
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        put(x + dx, h, z + dz, BLOCK.GRASS);
        put(x + dx, h - 1, z + dz, BLOCK.STONE);
    }
    const place = () => {
        c.trees = [];
        TerrainData.prototype._meshTree.call(data, c, x, z, h, 0, 123);
        return c.trees.length;
    };
    assert.equal(place(), 1, 'healthy soil still grows a tree');
    for (const bad of [BLOCK.AIR, BLOCK.STONE, BLOCK.WATER]) {
        put(x, h, z, bad);
        assert.equal(place(), 0, `root block ${bad} cannot grow a tree`);
    }
    put(x, h, z, BLOCK.GRASS);
    put(x + 1, h, z + 1, BLOCK.AIR);
    assert.equal(place(), 0, 'a broad trunk cannot hang over the carved mouth');
    put(x + 1, h, z + 1, BLOCK.GRASS);
    put(x, h - 1, z, BLOCK.AIR);
    assert.equal(place(), 0, 'a floating soil block does not support a tree');
    put(x, h - 1, z, BLOCK.STONE);
    put(x, h + 3, z, BLOCK.STONE);
    assert.equal(place(), 0, 'a rock wall cannot contain the trunk');
    assert.equal(treeFitsChunk(c, x, z, h, 0), false, 'the same check rejects legacy chunk records');
    put(x, h + 3, z, BLOCK.AIR);
    assert.equal(place(), 1, 'clear ground remains usable');
});

test('trees near a guest stay interactive without a host terrain mesh; invalid legacy roots are skipped', async () => {
    const {WorldTrees}=await import('../../src/world/Trees.js');
    const {chunkKey}=await import('../../src/world/Terrain.js');
    const x=320,z=320,h=8,c={cx:10,cz:10,blocks:new Uint8Array((MAX_LAYER-MIN_LAYER+1)*CHUNK*CHUNK),trees:[]};
    const put=(L,b)=>{c.blocks[(L-MIN_LAYER)*CHUNK*CHUNK]=b;};
    put(h,BLOCK.GRASS);put(h-1,BLOCK.STONE);
    c.trees.push({id:'valid',x,z,y:h-.5,kind:1},{id:'floating',x:x+2,z,y:h-.5,kind:1});
    const key=chunkKey(10,10), terrain={meshes:new Map(),data:{chunks:new Map([[key,c]])}};
    const f=Object.create(WorldTrees.prototype);
    Object.assign(f,{byId:new Map(),byChunk:new Map(),gone:new Set(),moved:new Map(),stats:{},
        _make:e=>({...e}),_add(t){this.byId.set(t.id,t);},_remove(t){this.byId.delete(t.id);}});
    f._stream(terrain,[{x,z}]);
    assert.equal(f.byId.has('valid'),true,'guest-area collision/spell record exists');
    assert.equal(f.byId.has('floating'),false,'legacy floating tree does not appear');
    f._stream(terrain,[{x,z}]);assert.equal(f.byId.size,1,'no duplicate actors');
    f._stream(terrain,[]);assert.equal(f.byId.size,0,'release guest area after leaving');
});
