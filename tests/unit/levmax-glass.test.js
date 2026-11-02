/**
 * The author 02.11: Leviosa Maxima on a house - «Критическая ошибка: Cannot read properties of null (reading
 * 'isInterleavedBufferAttribute')» and the game was gone. The carried house's glass used the village glass's material (drawn
 * with a colour for every pane) without colours of its own: three.js kept the coloured shader and read the missing colours.
 * tools/levmax-repro.mjs reproduces it in a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { carriedGlass } from '../../src/game/LevitationMaxima.js';

test('a lifted house\'s glass has a colour for every pane (as the village glass it shares the material with)', () => {
    const mat = new THREE.MeshPhongMaterial();
    const panes = [{ x: 1, y: 2, z: 3, ry: 0, w: 1, h: 1 }, { x: 2, y: 2, z: 3, ry: 1.57, w: 1, h: 1, tint: 0xff0000 }];
    const g = carriedGlass(panes, mat, { x: 0, y: 0, z: 0 });
    assert.ok(g.isInstancedMesh);
    assert.ok(g.instanceColor, 'no instanceColor: the shared shader reads null and the game crashes');
    assert.equal(g.instanceColor.count, 2);
    const c = new THREE.Color();
    g.getColorAt(1, c);
    assert.equal(c.getHex(), 0xff0000);
    g.getColorAt(0, c);
    assert.equal(c.getHex(), 0xffffff);
});
