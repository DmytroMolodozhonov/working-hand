/** Scars: the cut line is where the blade's sheet meets the body, facing the caster (the author 07.11: «прямо по шву, не рандомные»). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ballLine, SCAR } from '../../src/fx/Scars.js';

const V = (x, y, z) => new Vector3(x, y, z);

test('a level swing across a body leaves a line at the height of the blade, across the body', () => {
    const o = V(0, 3, -8), f = V(0, 0, 1), s = V(1, 0, 0);
    const a = V(0, 2.5, 0), b = V(0, 2.5, 0), r = 2;
    const line = ballLine(o, f, s, a, b, r);
    assert.equal(line.length, SCAR.SAMPLES);
    for (const p of line) {
        assert.ok(Math.abs(p.y - 3) < 1e-6, 'on the sheet: the height of the wand');
        assert.ok(p.z <= 0 + 1e-6, 'on the skin that faces the caster');
        const d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
        assert.ok(Math.abs(d - r) < 0.02 || d < r, 'on the ball');
    }
    assert.ok(line[0].x < line[line.length - 1].x, 'a line across, in order');
    assert.ok(Math.abs(line[0].x + line[line.length - 1].x) < 1e-6, 'symmetrical about the body');
});

test('a sheet that misses the body leaves nothing; one that grazes leaves a short line', () => {
    const o = V(0, 6, -8), f = V(0, 0, 1), s = V(1, 0, 0), a = V(0, 2.5, 0);
    assert.equal(ballLine(o, f, s, a, a, 2).length, 0);
    const near = ballLine(V(0, 4.3, -8), f, s, a, a, 2);
    const far = ballLine(V(0, 2.5, -8), f, s, a, a, 2);
    assert.ok(near.length > 0);
    assert.ok(Math.abs(near[0].x) < Math.abs(far[0].x), 'the grazed chord is shorter');
});

test('a slanted swing (from the top down) leaves a slanted line', () => {
    const o = V(0, 3, -8), f = V(0, 0, 1), s = new Vector3(0.7, -0.7, 0).normalize();
    const line = ballLine(o, f, s, V(0, 2.5, 0), V(0, 2.5, 0), 2);
    assert.ok(line.length > 0);
    assert.ok(line[0].y > line[line.length - 1].y || line[0].y < line[line.length - 1].y, 'it slopes');
});

test('a tall body (an axis from a to b): the line is where the sheet crosses the axis', () => {
    const o = V(0, 4, -8), f = V(0, 0, 1), s = V(1, 0, 0);
    const line = ballLine(o, f, s, V(0, 1, 0), V(0, 6, 0), 1);
    assert.ok(line.length > 0);
    for (const p of line) assert.ok(Math.abs(p.y - 4) < 1e-6);
});
