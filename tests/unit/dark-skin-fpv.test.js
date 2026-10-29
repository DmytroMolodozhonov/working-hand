import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setDark, tickDark } from '../../src/entities/DarkSkin.js';

// Автор: «за чёрного мага перед глазами чёрные пятна» — метки на спрятанной голове и свой дымок в первом лице не рисуются.
function fakeChar() {
    const mk = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const ch = { group: new THREE.Group(), head: mk(), body: mk(), _fpv: true };
    ch.head.layers.set(1);
    ch.group.add(ch.head, ch.body);
    return ch;
}
test('метки на голове — на слое головы (спрятаны от своей камеры), на теле — видны', () => {
        const ch = fakeChar();
        setDark(ch, 80);
        const onHead = ch.head.children.find((c) => c.userData.darkOverlay);
        const onBody = ch.body.children.find((c) => c.userData.darkOverlay);
        assert.equal(onHead.layers.mask, ch.head.layers.mask);
        assert.equal(onBody.layers.test(new THREE.Layers()), true);
    });
test('свой дымок в первом лице спрятан и возвращается в виде снаружи', () => {
        const ch = fakeChar();
        setDark(ch, 80);
        assert.equal(ch._darkSmoke.layers.test(new THREE.Layers()), false);
        ch._fpv = false; tickDark(ch, 0.016);
        assert.equal(ch._darkSmoke.layers.test(new THREE.Layers()), true);
});
