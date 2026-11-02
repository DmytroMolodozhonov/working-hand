/**
 * The author 02.11: «держу руку чуть согнутой, а после ещё больше сгибаю… она резко скачет назад». A forearm held bent towards
 * the camera, seen by a real camera (15 pictures a second, MediaPipe's depth noisy): it must never turn over behind the body on
 * the depth's noise - and a side that does change glides there, never jumps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmSolver } from '../../src/entities/ArmSolver.js';

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;

test('arm solver: a forearm held towards the camera never flips behind the body on the depth\'s noise', () => {
    const S = new ArmSolver();
    const ls = { x: 0.6, y: 0.4, z: 0 }, rs = { x: 0.4, y: 0.4, z: 0 };
    const out = { u: { x: 0, y: 0, z: 0 }, f: { x: 0, y: 0, z: 0 }, g: { x: 0, y: 0, z: 0 } };
    let pic = null, prevF = null, maxTurn = 0, behind = 0, n = 0;
    for (let i = 0; i < 60 * 6; i++) {
        if (i % 4 === 0) {
            // (a new picture 15 times a second: the elbow down in front, the wrist just above it - the forearm towards the camera;
            // the depth noisy: its sign wanders)
            pic = {
                e: { x: 0.36 + rnd() * 0.01, y: 0.58 + rnd() * 0.01, z: -0.05 + rnd() * 0.12 },
                w: { x: 0.355 + rnd() * 0.01, y: 0.53 + rnd() * 0.01, z: -0.12 + rnd() * 0.16 },
            };
        }
        S.shoulders(ls, rs, 1, 1 / 60);
        S.solve('right', rs, pic.e, pic.w, 1, out, 1 / 60);
        if (i > 60) {
            n++;
            if (out.f.z > 0.2) behind++;
            if (prevF) maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, prevF.x * out.f.x + prevF.y * out.f.y + prevF.z * out.f.z))) * 180 / Math.PI);
        }
        prevF = { ...out.f };
    }
    assert.equal(behind, 0, `the forearm was drawn behind the body in ${behind} of ${n} frames`);
    assert.ok(maxTurn < 25, `the forearm turned ${maxTurn.toFixed(1)}° in one frame`);
});
