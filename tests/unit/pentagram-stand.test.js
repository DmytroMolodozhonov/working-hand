// The painted stand of the teleportation pentagram in the wizards' libraries (PentagramStand.js, LoreLibrary.js): worlds of generation 10+.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PENT_STAND_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';

// a canvas that only remembers it was drawn on
const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 100 }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { LoreLibrary } = await import('../../src/game/LoreLibrary.js');

const def = { id: 'v1', lore: [0, 1, 2].map((i) => ({ x: i * 6, y: 0, z: 0, face: 0 })) };
function lib(gen) {
    const scene = new THREE.Scene();
    const g = { gen, scene, collision: { boxes: new Map(), n: 0, addBox(b) { this.boxes.set(++this.n, b); return this.n; }, removeBox(id) { this.boxes.delete(id); } }, hud: { setVoice() {} }, world: {}, books: {} };
    return { L: new LoreLibrary(g), g, scene };
}

test('a world of generation 10: the last stand of a library shows the teleportation pentagram, the others keep their books; the board is solid', () => {
    assert.ok(WORLD_GEN >= PENT_STAND_FROM_GEN);
    const { L, g } = lib(PENT_STAND_FROM_GEN);
    L.wake(def);
    const S = L.sites.get('v1');
    assert.equal(S.stands.length, 3);
    assert.ok(S.stands[2]?.pent === 'teleport' && !S.stands[0]?.pent && !S.stands[1]?.pent);
    assert.equal(g.collision.boxes.size, 3, 'every board is an obstacle');
    assert.ok(S.stands[2].group.children.some((c) => c.userData.pentagram === 'teleport'));
    // the picture is shared: a second library makes no second texture
    const a = S.stands[2].book.children[0].material;
    const { L: L2 } = lib(PENT_STAND_FROM_GEN); L2.wake({ ...def, id: 'v2' });
    assert.equal(L2.sites.get('v2').stands[2].book.children[0].material, a);
    L.sleep(def);
    assert.equal(g.collision.boxes.size, 0);
});

test('an older world keeps its lore books on every stand', () => {
    const { L } = lib(PENT_STAND_FROM_GEN - 1);
    L.wake(def);
    assert.ok(L.sites.get('v1').stands.every((s) => s && !s.pent));
});

test('the picture lies on the board: its size is the board\'s (1.8 × 1.25 m) less a margin, a hero (3.5 m) can read it from the front', () => {
    const { L } = lib(PENT_STAND_FROM_GEN);
    L.wake(def);
    const pic = L.sites.get('v1').stands[2].book.children[0];
    const w = pic.geometry.parameters.width, h = pic.geometry.parameters.height;
    assert.ok(w <= 1.8 && h <= 1.25 && w > 1.4 && h > 0.9, `${w} × ${h}`);
});
