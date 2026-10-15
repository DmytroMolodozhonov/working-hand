/**
 * The V5 wand grip (the author's own): the wand across the palm aslant, the fingers closed round
 * it from outside, the thumb along it — no finger, no thumb and not the palm going into the wand
 * (as thick as each wand really is), whatever the wand, either hand, any turn of the hand, and
 * whatever the camera sees the fingers doing (a fist, an open hand).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { lengthProfile } from '../../src/entities/SimplifiedHand.js';
import { makeItemModel } from '../../src/game/ItemTypes.js';
import { synthHand } from './synth-hand.mjs';

const BACK = 0.35; // (Items.js V5_WAND_BACK)
const WANDS = [...Array.from({ length: 10 }, (_, m) => ({ model: m })), { plain: true }, { dragon: true }];

/** Every bone's box (and the palm's) sampled: corners, edge middles, face centres. */
function samples(hand) {
    hand.group.updateMatrixWorld(true);
    const out = [];
    const add = (name, i, mesh) => {
        const g = mesh.geometry.parameters, hx = g.width / 2, hy = g.height / 2, hz = g.depth / 2;
        for (const x of [-hx, 0, hx]) for (const y of [-hy, 0, hy]) for (const z of [-hz, 0, hz]) {
            if (x || y || z) out.push({ name, i, p: new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld) });
        }
    };
    for (const [name, segs] of Object.entries(hand.fingerMeshes)) segs.forEach((s, i) => add(name, i, s.mesh));
    add('palm', 0, hand.palm);
    return out;
}

const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az));

for (const side of ['right', 'left']) {
    test(`V5 wand (${side} hand): the fingers lie on the wand, none goes into it; the thumb along it — every wand, any turn, fist or open`, () => {
        for (const it of WANDS) {
            const prof = lengthProfile(makeItemModel({ kind: 'wand', ...it }));
            const rAt = (t) => { let v = -1; for (const p of prof) if (t + BACK >= p.y0 && t + BACK <= p.y1) v = Math.max(v, p.r); return v; };
            for (const [k, bends] of [['fist', 1.4], ['open', 0]].entries()) {
                const ch = new VoxelCharacter(new THREE.Scene());
                ch.setShowHands(true);
                ch.setHandVersion('v5');
                const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
                hand.group.rotation.set(0.4 + k, -0.7 * k, 0.9);
                const { r } = hand.gripWand(prof, BACK);
                // the camera's fingers: a fist or an open hand — the grip holds the wand whatever they do
                const lm = synthHand(rot(-1.2, 0, 0), { side, at: [0.5, 0.6], size: 0.1, bends: { index: [bends, bends, bends], middle: [bends, bends, bends], ring: [bends, bends, bends], pinky: [bends, bends, bends] } });
                for (let i = 0; i < 90; i++) hand.update(lm, 0, 1000 + i * 16);
                const a = new THREE.Vector3(), d = new THREE.Vector3();
                hand.wandAxis(r, a, d);
                const sm = samples(hand);
                const depth = (p) => { const t = p.clone().sub(a).dot(d); const rr = rAt(t); return rr < 0 ? 1 : p.clone().sub(a).addScaledVector(d, -t).length() - rr; };
                let deepest = Infinity, who = '';
                for (const s of sm) { const v = depth(s.p); if (v < deepest) { deepest = v; who = `${s.name}${s.i}`; } }
                const what = `${JSON.stringify(it)} ${bends ? 'fist' : 'open'}`;
                assert.ok(deepest > -0.012, `${what}: nothing goes into the wand (deepest ${(deepest * 100).toFixed(1)} cm, ${who})`);
                const touching = ['thumb', 'index', 'middle', 'ring', 'pinky'].filter((f) => sm.some((s) => s.name === f && s.i >= 1 && Math.abs(depth(s.p)) < 0.03));
                assert.ok(touching.length >= 4 && touching.includes('thumb'), `${what}: the fingers on it (${touching.join(', ')})`);
                // the thumb lies along the wand
                const th = hand.fingerMeshes.thumb;
                const base = th[1].pivot.getWorldPosition(new THREE.Vector3());
                const tip = new THREE.Vector3(0, th[2].mesh.position.y * 2, 0).applyMatrix4(th[2].pivot.matrixWorld);
                assert.ok(tip.sub(base).normalize().dot(d) > 0.85, `${what}: the thumb along the wand`);
            }
        }
    });
}

test('V5 wand: fixed in the palm — it turns exactly as the hand turns (points where the hand points)', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    ch.setHandVersion('v5');
    const hand = ch.rightSimplifiedHand;
    const { r } = hand.gripWand(lengthProfile(makeItemModel({ kind: 'wand', model: 0 })), BACK);
    const a = new THREE.Vector3(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3();
    hand.wandAxis(r, a, d0);
    const q0 = hand.palm.getWorldQuaternion(new THREE.Quaternion());
    hand.group.rotation.set(0.8, 1.1, -0.4);
    hand.wandAxis(r, a, d1);
    const q1 = hand.palm.getWorldQuaternion(new THREE.Quaternion());
    const expect = d0.clone().applyQuaternion(q0.clone().invert()).applyQuaternion(q1);
    assert.ok(expect.angleTo(d1) < 1e-4, 'the wand turned with the palm');
});
