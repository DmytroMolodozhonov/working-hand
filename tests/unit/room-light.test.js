// The light of the rooms (houses, castles): the day's tick does not wipe it (no blink), the night indoors is dark
// as the night (only real lights light it), and the lit land of the houses is the same in both ways it is asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../../src/world/World.js';
import { HouseMagic } from '../../src/game/HouseMagic.js';

function lights() {
    const w = Object.create(VoxelWorld.prototype);
    w.scene = new THREE.Scene();
    w.createLights();
    const at = () => [w.ambientLight.intensity, w.hemiLight.intensity, w.dirLight.intensity];
    return { w, at };
}

test('by day the room keeps its light through the day ticks (no blink)', () => {
    const { w, at } = lights();
    w.setDayPhase(0.2);
    const out = at();
    w.setIndoor(1);
    const inside = at();
    assert.ok(inside[0] > out[0] && inside[0] < out[0] * 2.5, `fill of the windows: ${inside[0]}`);
    for (let i = 1; i <= 50; i++) { w.setDayPhase(0.2 + i * 0.001); }
    const later = at();
    assert.ok(Math.abs(later[0] - inside[0]) < 0.05 && Math.abs(later[1] - inside[1]) < 0.05, `still lit: ${later} vs ${inside}`);
    w.setIndoor(0);
    w.setDayPhase(0.25);
    assert.ok(Math.abs(at()[0] - out[0]) < 0.02, 'out again: the open day');
});

test('by night a room is no lighter than the day outside and barely lighter than the night', () => {
    const { w, at } = lights();
    w.setDayPhase(0.87);
    const out = at();
    w.setIndoor(1);
    const inside = at();
    assert.ok(inside[0] <= out[0] * 1.2 + 1e-6 && inside[1] <= out[1] * 1.2 + 1e-6, `night room ${inside} vs night ${out}`);
    assert.ok(inside[0] < 0.2, `ambient far below the day's 0.3: ${inside[0]}`);
    w.setDayPhase(0.88);
    assert.ok(Math.abs(at()[0] - inside[0]) < 0.02, 'the tick keeps it');
});

test('the lit land of the houses: the rectangles filled in are the same cells as asked one by one', () => {
    const rects = [{ x0: 3, x1: 9.4, z0: -4, z1: 6 }, { x0: 20, x1: 25, z0: 1, z1: 2.5 }];
    const list = new Map(rects.map((rc, i) => [i, { id: i, level: 1, rc }]));
    const data = {};
    const hm = { data, list, plan: (rec) => ({ rect: rec.rc }), _rectOf(rec) { return rec.rc; } };
    HouseMagic.prototype._hookLight.call(hm);
    assert.equal(data._litPair, data.litLand, 'paired shapes');
    const shapes = data.litShapes(0, -10, 30, 10, []);
    const a = new Set();
    for (const s of shapes) for (let z = Math.ceil(s.z0); z <= Math.floor(s.z1); z++) for (let x = Math.ceil(s.x0); x <= Math.floor(s.x1); x++) a.add(x + ',' + z);
    const b = new Set();
    for (let z = -10; z <= 10; z++) for (let x = 0; x <= 30; x++) if (data.litLand(x, z)) b.add(x + ',' + z);
    assert.deepEqual([...a].sort(), [...b].sort());
    assert.ok(b.size > 50);
});
