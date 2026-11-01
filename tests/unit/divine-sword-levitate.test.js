import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation } from '../../src/game/Levitation.js';

/**
 * Жалоба автора: «Левиоса» на божественном мече — меч поднялся, а потом «опять рассеялось заклятие» (упал).
 * Причины: резкое движение руки (прицел на Дьяволоса) считалось рывком-броском и роняло меч; а финал фразы
 * «Левиоса Максима» после первых слов «Левиоса» отпускал поднятое и поднимал заново.
 * Теперь меч держится, пока держат заклинание (≥ 10 с, рука двигается как угодно), «Атак» его швыряет, он вонзается.
 */
function world() {
    const hand = new THREE.Vector3(0, 3, 0), dir = new THREE.Vector3(0, 0, -1);
    const grip = new THREE.Object3D();
    const ch = {
        group: new THREE.Object3D(),
        getHandWorldPosition: (side, out) => out.copy(hand),
        getHandDirection: (side, out) => out.copy(dir),
        getGripObject: () => grip,
        leftArmAnchor: null, rightArmAnchor: null,
    };
    const w = {
        id: 'divine-hell', type: 'divine', godGift: true, holder: null,
        position: new THREE.Vector3(0, 1, -10), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(),
        drive: null,
        attach(h) { this.holder = h; this.drive = { position: this.position.clone(), quaternion: new THREE.Quaternion() }; },
        release() { this.holder = null; this.drive = null; },
        getTipPosition(out) { return out.copy(this.position).add(new THREE.Vector3(0, 0, -0.8).applyQuaternion(this.quaternion)); },
    };
    const pierced = [];
    const aim = new THREE.Vector3(0, 40, -70);
    const devil = {
        dead: false, list: [], targets: () => [],
        aimPoint: () => aim.clone(), get position() { return aim; },
        bladeHit: (a, b) => (b.distanceTo(aim) < 6 ? b.clone() : null),
        pierce: (p, by, o) => { pierced.push({ p, by, via: o.via }); devil.dead = true; },
    };
    const g = {
        localId: 'me', authority: true, remotes: new Map(), zombies: [],
        character: ch, collision: { surfaceY: () => 0 },
        weapons: { weapons: [w], byId: new Map([[w.id, w]]) },
        diabolos: devil, hud: { setVoice() {} }, fx: { spark() {} },
    };
    return { g, lev: new Levitation(g), w, hand, dir, pierced };
}

test('божественный меч под «Левиосой»: держится ≥ 10 с при любых движениях руки, «Атак» — летит, вонзается в Дьяволоса', () => {
    const { lev, w, hand, dir, pierced } = world();
    assert.equal(lev.cast(), null, 'поднят');
    assert.equal(w.holder?.levitate, true);
    // 12 с: рука резко ходит (прицеливание, взмахи) — меч не падает
    for (let i = 0; i < 12 * 60; i++) {
        const t = i / 60;
        hand.set(Math.sin(t * 9) * 1.2, 3 + Math.cos(t * 7) * 0.8, 0);
        dir.set(Math.sin(t) * 0.5, 0.2, -1).normalize();
        lev.update(1 / 60);
        assert.ok(lev.state && w.holder?.levitate, `держится (${t.toFixed(2)} с)`);
    }
    // «Атак»: к Дьяволосу
    dir.set(0, 0.5, -1).normalize();
    assert.equal(lev.attack(), null);
    for (let i = 0; i < 60 * 8 && !pierced.length; i++) lev.update(1 / 60);
    assert.equal(pierced.length, 1, 'вонзился');
    assert.equal(pierced[0].via, 'swarm');
    assert.equal(lev.state, null, 'заклинание кончилось — меч в нём');
});

test('обычная вещь по-прежнему падает от рывка руки (бросок «Левиосой» не сломан)', () => {
    const { lev, w, hand } = world();
    w.type = 'sword'; w.godGift = false;
    lev.cast();
    for (let i = 0; i < 60; i++) lev.update(1 / 60);
    for (let i = 0; i < 20 && lev.state; i++) { hand.x += 0.3; lev.update(1 / 60); }
    assert.equal(lev.state, null, 'рывок отпускает обычный меч');
});
