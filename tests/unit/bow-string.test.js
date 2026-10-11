import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeItemModel, setBowString } from '../../src/game/ItemTypes.js';

const ends = (m) => {
    const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(m.matrix), b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(m.matrix);
    return [a, b];
};

test('bow string: the strands run from the tips to the nock point; at rest it stands well behind the grip (clear of the bow fist)', () => {
    for (const type of [0, 1, 2]) {
        const bow = makeItemModel({ kind: 'bow', type });
        const S = bow.userData.bowString;
        assert.ok(Math.abs(S.tipX) * bow.scale.x >= 0.25, `type ${type}: brace ${(Math.abs(S.tipX) * bow.scale.x).toFixed(2)} m`);
        setBowString(bow, S.tipX - 0.3, 0.1, 0.5);
        for (const m of [S.up, S.down]) m.updateMatrix();
        const pts = [...ends(S.up), ...ends(S.down)];
        const near = (x, y) => pts.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-3);
        assert.ok(near(S.tipXf, S.tipYf) && near(S.tipXf, -S.tipYf), 'from the (bent) tips');
        assert.ok(near(S.tipX - 0.3, 0.1), 'to the nock point');
    }
});

test('bow: drawn, the limbs bend — the tips come back; let go, they spring back', () => {
    const bow = makeItemModel({ kind: 'bow', type: 0 });
    const S = bow.userData.bowString;
    setBowString(bow, S.tipX - 0.2, 0, 0);
    const rest = S.tipXf;
    setBowString(bow, S.tipX - 0.5, 0, 1);
    assert.ok(rest - S.tipXf >= 0.05, `tips back by ${(rest - S.tipXf).toFixed(3)}`);
    setBowString(bow, null);
    assert.ok(Math.abs(S.tipXf - S.tipX) < 1e-9, 'at rest again');
});
