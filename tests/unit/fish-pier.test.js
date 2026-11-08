// The fishermen's pier (FishPierPlan.js): a real deck over the water, posts to the floor, rails, lamps, a rack for free rods within reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, pierSite, PIER, RACK } from '../../src/world/FishPierPlan.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { testSeaCastleSpot } from '../../src/world/Castles.js';
import { SPAWN_SPOTS, farTarget } from '../../src/game/SpawnSpots.js';
import { fishingRodModel } from '../../src/game/FishingRodModel.js';
import * as THREE from 'three';

const P = { xc: 100, zL: -200, D: 2, floorAt: (x, z) => (z > -204 ? 1 : -12), groundAt: (x, z) => 0 };
const K = (b) => `${b[0]},${b[1]},${b[2]}`;

test('the deck: a landing, a boardwalk, a head — one layer, no holes, every row 5, 9 or 9 wide', () => {
    const p = plan(P), by = new Map(p.blocks.map((b) => [K(b), b]));
    const row = (z) => { let n = 0; for (let x = P.xc - 6; x <= P.xc + 6; x++) if (by.has(`${x},${P.D},${z}`)) n++; return n; };
    for (let z = P.zL; z > P.zL - PIER.LAND.len; z--) assert.equal(row(z), 2 * PIER.LAND.half + 1, 'landing z ' + z);
    const zE = P.zL - PIER.LEN;
    for (let z = zE; z < zE + PIER.HEAD.len; z++) assert.equal(row(z), 2 * PIER.HEAD.half + 1, 'head z ' + z);
    for (let z = P.zL - PIER.LAND.len; z > zE + PIER.HEAD.len - 1; z--) assert.equal(row(z), 2 * PIER.ROAD_W + 1, 'boardwalk z ' + z);
    assert.equal(p.zE, zE);
});
test('posts of logs go from the floor up to under the deck at the edges; beams cross under it', () => {
    const p = plan(P), by = new Map(p.blocks.map((b) => [K(b), b]));
    const zP = P.zL - 2 * PIER.POST_EVERY; // a post row on the boardwalk? (multiple of 4 from zL)
    const x = P.xc - PIER.ROAD_W;
    const z = (() => { for (let z = P.zL - PIER.LAND.len - 1; z > p.zE + PIER.HEAD.len; z--) if (by.get(`${x},${P.D - 1},${z}`)?.[3] === BLOCK.WOOD) return z; return null; })();
    assert.ok(z != null, 'a post on the boardwalk');
    for (let y = -11; y <= P.D - 1; y++) assert.equal(by.get(`${x},${y},${z}`)?.[3], BLOCK.WOOD, 'log at y ' + y);
    assert.equal(by.get(`${P.xc},${P.D - 1},${z}`)?.[3], BLOCK.PLANKS_DARK, 'the beam across');
    void zP;
});
test('rails: a block over the deck at every side, an open entrance, an open front on the head', () => {
    const p = plan(P), by = new Map(p.blocks.map((b) => [K(b), b]));
    const fence = (x, z) => by.get(`${x},${P.D + 1},${z}`)?.[3] === BLOCK.FENCE;
    assert.ok(fence(P.xc - PIER.ROAD_W, P.zL - 12) && fence(P.xc + PIER.ROAD_W, P.zL - 12));
    assert.ok(!fence(P.xc, P.zL), 'the entrance is open');
    assert.ok(!fence(P.xc, p.zE) && !fence(P.xc + 1, p.zE), 'the head\'s front middle is open: fish over the edge');
    assert.ok(fence(P.xc + 3, p.zE), 'the head\'s front corners are closed');
});
test('lamps: at the corners and along the boardwalk', () => {
    const p = plan(P);
    assert.ok(p.blocks.filter((b) => b[3] === BLOCK.LANTERN).length >= 8);
});
test('the rack: rods lie on a beam a hero reaches, reel down, along z; three of them; free', () => {
    const p = plan(P), by = new Map(p.blocks.map((b) => [K(b), b]));
    assert.equal(p.rack.slots.length, RACK.SLOTS);
    const beam = p.blocks.filter((b) => b[3] === BLOCK.PLANKS_DARK && b[0] === P.xc + RACK.X && b[1] === P.D + RACK.BEAM_Y);
    assert.ok(beam.length >= 5, 'a beam');
    for (const s of p.rack.slots) {
        const top = P.D + RACK.BEAM_Y - 0.5;
        assert.ok(s.y > top && s.y < top + 0.4, 'on the beam: ' + s.y);
        assert.ok(s.y - (P.D - 0.5) < 3.4, 'within the hero\'s reach (the hero is ~3.5 m): ' + (s.y - (P.D - 0.5)));
        assert.ok(s.z - RACK.ROD_LEN < Math.min(...beam.map((b) => b[2])) + 1 && s.z > Math.max(...beam.map((b) => b[2])) - 1, 'the rod lies over the beam');
    }
    // the quaternion turns the model's +Y to −Z and its −Z (the reel side) to −Y (down)
    const q = new THREE.Quaternion(...p.rack.quat);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q), reel = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    assert.ok(y.z < -0.99 && Math.abs(y.y) < 1e-6, 'the rod along −z');
    assert.ok(reel.y < -0.99, 'the reel hangs down');
    // the rod's own length with its scale fits on the rack
    const m = fishingRodModel({ uid: 'z' }); m.scale.setScalar(2.1); m.updateMatrixWorld(true);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(m).max.y * 1 - RACK.ROD_LEN) < 0.3, 'the rod is ~4.4 m');
});
test('ramp: steps up from the ground to the landing', () => {
    const p = plan({ ...P, groundAt: () => -4 }), by = new Map(p.blocks.map((b) => [K(b), b]));
    for (let k = 1; k <= PIER.RAMP; k++) assert.equal(by.get(`${P.xc},${P.D - k},${P.zL + k}`)?.[3], BLOCK.PLANKS, 'step ' + k);
});
test('the site is west of the sea castle\'s land, on the test sea\'s shore', () => {
    for (const seed of [1, 777, 12345]) {
        const sp = testSeaCastleSpot(seed, false);
        const circle = { x: sp.shore.x, z: sp.shore.z - 900, r0: 900 };
        const s = pierSite(circle, sp.X, sp.rect.u1);
        assert.ok(s.xc < sp.X - sp.rect.u1 - 30, 'west of the castle land');
        assert.ok(Math.abs(s.zShore - sp.shore.z) < 40, 'on the same shore: ' + s.zShore + ' vs ' + sp.shore.z);
    }
});
test('«Где появиться»: the pier is a spot, and its target is on the land behind the pier facing the sea', () => {
    assert.ok(SPAWN_SPOTS.some((s) => s.id === 'fishpier'));
    const t = farTarget('fishpier', {}, { pier: () => ({ x: 20.4, z: -190.2 }) });
    assert.deepEqual(t, { x: 20, z: -190, yaw: Math.PI });
    assert.equal(farTarget('fishpier', {}, {}), null);
});
