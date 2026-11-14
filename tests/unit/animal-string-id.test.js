/**
 * The Creative stable's horses have ids 'cH1', 'cH2', 'cPeg' (strings): the head's turn and the «thinks every N ticks» turn used `number + id` → a string → NaN,
 * so their heads got NaN rotations — a NaN spell target made every ray miss at the start of a Creative world (the author 14.11).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animatePose, idNum, POSE } from '../../src/game/AnimalHerd.js';

const fakeHorse = (id) => {
    const model = new THREE.Group(), neck = new THREE.Group(), head = new THREE.Group();
    neck.add(head); model.add(neck);
    model.userData = { neck, head };
    return { id, model, lie: 0, headP: 0, headY: 0 };
};

test('idNum: numbers stay, strings become a stable number', () => {
    assert.equal(idNum(7), 7);
    assert.equal(idNum('cH1'), idNum('cH1'));
    assert.ok(Number.isFinite(idNum('cPeg')));
    assert.notEqual(idNum('cH1'), idNum('cH2'));
});

test('a horse with a string id never gets a NaN head, whatever it does', () => {
    for (const id of ['cH1', 'cH2', 'cPeg', 5]) {
        const a = fakeHorse(id);
        for (const pose of [POSE.graze, POSE.look, POSE.rest, POSE.stand]) {
            for (let i = 0; i < 60; i++) animatePose(a, 0.05, pose);
            const h = a.model.userData.head, n = a.model.userData.neck;
            assert.ok(Number.isFinite(h.rotation.y) && Number.isFinite(h.rotation.x) && Number.isFinite(n.rotation.x), `${id} pose ${pose}`);
            assert.ok(Number.isFinite(a.headY));
        }
    }
});

test('a head that was NaN heals', () => {
    const a = fakeHorse('cH1'); a.headY = NaN;
    animatePose(a, 0.05, POSE.look);
    assert.ok(Number.isFinite(a.headY));
});
