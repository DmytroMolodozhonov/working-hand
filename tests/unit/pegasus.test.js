import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS, PEGASUS, SPECIES } from '../../src/game/Animals.js';
import { HORSE_COLORS, PEGASUS_COLOR } from '../../src/game/AnimalModels.js';

/** The Pegasus on a fake meadow: the only black horse, defends his herd, lets you on after apples, flies with you. */
function fakeGame() {
    const scene = new THREE.Scene();
    const look = new THREE.Vector3(0, 0, -1);
    const g = {
        config: { mode: 'survival' }, authority: true, localId: 'me', scene,
        character: { group: new THREE.Group(), isCrouching: false, isRunning: false, runIntensity: 0, hands: null, getHandWorldPosition(s, out) { return out.copy(this.hands?.[s] || this.group.position); } },
        camera: { getWorldDirection: (out) => out.copy(look) }, look,
        collision: { groundY: () => 0, resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {}, lightFlash() {} }, hud: { said: '', setVoice(t) { this.said = t; } },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false },
        knockback: { add() {} }, hurt: 0, damageLocalPlayer(d) { this.hurt += d; },
    };
    g.character.group.position.set(14, 1.5, 0);
    HERDS.GONE = 1e9;
    const A = new Animals(g);
    A.enabled = true;
    A._spawnT = 1e9; A._treeT = 1e9; A._migT = 1e9;
    return { g, A };
}
function run(A, secs, each, dt = 1 / 30) {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) { A.update(dt); if (each && each(i * dt) === false) return; }
}
function withPegasus(A, n = 4) {
    // (the herd's roll for a Pegasus comes out «yes»: its 2nd random number — the rest as usual)
    const rnd = Math.random;
    let k = 0;
    Math.random = () => (++k === 2 ? 0.01 : rnd());
    try { const h = A.spawnHerdAt('horse', n, 0, 0); assert.ok(h.some((a) => a.pegasus)); return h; } finally { Math.random = rnd; }
}

test('the only black horse: 21% of horse herds have one Pegasus, ordinary horses are never black', () => {
    for (const c of HORSE_COLORS) assert.ok(new THREE.Color(c).getHSL({}).l > 0.1, `not black: ${c.toString(16)}`);
    const { A } = fakeGame();
    let herds = 0, withP = 0;
    for (let i = 0; i < 600; i++) {
        const h = A.spawnHerdAt('horse', 3, i * 50, 0);
        herds++;
        const p = h.filter((a) => a.pegasus);
        assert.ok(p.length <= 1, 'one at most');
        if (p.length) { withP++; assert.equal(p[0].color, PEGASUS_COLOR); assert.ok(p[0].model.userData.wings?.length === 2, 'he has wings'); }
        for (const a of h) if (!a.pegasus) assert.notEqual(a.color, PEGASUS_COLOR);
        for (const a of h) A._remove(a);
    }
    assert.ok(Math.abs(withP / herds - PEGASUS.CHANCE) < 0.06, `${withP}/${herds}`);
});

test('attack his herd: the Pegasus takes off, circles the attacker and dives at them', () => {
    const { g, A } = fakeGame();
    const herd = withPegasus(A);
    const peg = herd.find((a) => a.pegasus);
    A.hit(herd[0], 1, null, 'me');
    assert.ok(peg.defend, 'he defends');
    let maxY = 0;
    run(A, 15, () => { maxY = Math.max(maxY, peg.group.position.y); });
    assert.ok(maxY > 5, `in the air (${maxY.toFixed(1)})`);
    assert.ok(g.hurt >= PEGASUS.DMG, `his hooves found me (${g.hurt})`);
    // hit in the air: he falls a bit (and comes to himself, flying on)
    const y = peg.group.position.y;
    if (peg.fly) { A.hit(peg, 1, null, 'me'); assert.equal(peg.fly, null); run(A, 0.6); assert.ok(peg.group.position.y < y, 'he fell'); }
});

test('golden apples: 9% each that he lets you on; he is never tamed, and after you get off he goes back to his herd', () => {
    const { g, A } = fakeGame();
    const herd = withPegasus(A);
    const peg = herd.find((a) => a.pegasus);
    for (const a of herd) a.group.position.y = 0.5;
    // (where Animals._feed looks for a horse's head)
    const head = () => peg.group.position.clone().add(new THREE.Vector3(0, 1, 0)).add(new THREE.Vector3(0, 0, -1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), peg.group.rotation.y));
    for (const a of herd) if (a !== peg) A._remove(a);
    const apple = { item: { count: 1e6 }, side: 'right', model: { position: new THREE.Vector3() } };
    g.items = { heldOf: () => apple, releaseHand() {} };
    let ok = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) { peg.trustBy = null; apple.model.position.copy(head()); A._feedT = 0.7; A._feed(0.01); if (peg.trustBy === 'me') ok++; }
    assert.ok(Math.abs(ok / N - PEGASUS.TRUST) < 0.02, `${ok}/${N}`);
    // without his trust: no
    peg.trustBy = null;
    g.character.group.position.set(peg.group.position.x + 1, 1.5, peg.group.position.z);
    A.tryMount();
    assert.equal(A.riding, null);
    assert.match(g.hud.said, /не подпускает/);
    // trusted: on his back, but nobody's
    peg.trustBy = 'me'; peg.trustUntil = Date.now() + 60000;
    A.tryMount();
    assert.equal(A.riding, peg);
    assert.equal(peg.tamed, null, 'never tamed');
    A.dismount();
    assert.equal(A.riding, null);
    assert.equal(peg.tamed, null);
    g.character.group.position.set(80, 1.5, 0);
    run(A, 1);
    assert.equal(peg.state, 'graze', 'back to his own life with the herd');
});

test('ridden: a slap on his head and he takes off; looking up he climbs; crouch and he lands', () => {
    const { g, A } = fakeGame();
    const herd = withPegasus(A);
    const peg = herd.find((a) => a.pegasus);
    peg.trustBy = 'me'; peg.trustUntil = Date.now() + 60000;
    g.character.group.position.set(peg.group.position.x + 1, 1.5, peg.group.position.z);
    A.tryMount();
    assert.equal(A.riding, peg);
    run(A, 0.5);
    assert.ok(!peg.riderFly, 'walks on the ground');
    // the hand comes down onto his head, fast
    peg.model.updateMatrixWorld(true);
    const hp = peg.model.userData.head.getWorldPosition(new THREE.Vector3());
    assert.equal(A._slap(peg, 1 / 30, [hp.clone().add(new THREE.Vector3(0, 1.4, 0))]), false, 'a hand above his head: nothing');
    assert.equal(A._slap(peg, 1 / 30, [hp.clone().add(new THREE.Vector3(0, 0.05, 0))]), true, 'a slap');
    A._pegasusToggle(peg);
    assert.ok(peg.riderFly, 'he takes off');
    g.look.set(0, 0.6, -0.8).normalize(); g.character.isRunning = true; g.character.runIntensity = 0.5;
    const y0 = peg.group.position.y, x0 = peg.group.position.clone();
    run(A, 4);
    assert.ok(peg.group.position.y > y0 + 10, `he climbs (${(peg.group.position.y - y0).toFixed(1)} m)`);
    assert.ok(peg.group.position.distanceTo(x0) > 15, 'and flies forward');
    assert.ok(peg.wingOpen > 0.8 && (peg.flyCode & 7) >= 1, 'wings spread');
    assert.ok(Math.abs(g.character.group.position.y - (peg.group.position.y + 1.95 * SPECIES.horse.size + 0.6)) < 1e-6, 'the rider on his back');
    g.look.set(0, 0, -1); g.character.isCrouching = true;
    run(A, 15, () => (!peg.riderFly ? false : undefined));
    assert.ok(!peg.riderFly, 'landed');
    assert.ok(Math.abs(peg.group.position.y - 0.5) < 0.2, 'on his hooves');
});
