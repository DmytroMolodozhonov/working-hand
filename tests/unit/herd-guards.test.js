import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS } from '../../src/game/Animals.js';
import { GUARD, rollGuard } from '../../src/game/HerdGuards.js';

/** The herds' hidden guardians on a fake meadow: the bronze bull of the cows, the ram-minotaur of the sheep. */
function fakeGame() {
    const scene = new THREE.Scene();
    const g = {
        config: { mode: 'survival' }, authority: true, localId: 'me', scene,
        character: { group: new THREE.Group(), isCrouching: false },
        collision: { groundY: () => 0, resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {} },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false },
        knockback: { add() {} }, hurt: 0, damageLocalPlayer(d) { this.hurt += d; },
        dropped: [], items: { spawnLoose(it) { g.dropped.push(it.kind); } },
    };
    g.character.group.position.set(12, 1.5, 0);
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
/** A herd with its guardian for sure (the roll is tested on its own). */
function herdWithGuard(A, type, n = 4) {
    const rnd = Math.random;
    Math.random = () => 0.01;
    try { return A.spawnHerdAt(type, n, 0, 0); } finally { Math.random = rnd; }
}

test('the roll: 45% of cow herds have a bull, 29% of sheep flocks a leader ram, others none', () => {
    assert.equal(rollGuard('cow', 4, () => 0.44), 0);
    assert.equal(rollGuard('cow', 4, () => 0.46), -1);
    assert.equal(rollGuard('sheep', 4, () => 0.28), 0);
    assert.equal(rollGuard('sheep', 4, () => 0.3), -1);
    assert.equal(rollGuard('pig', 4, () => 0), -1);
    let cows = 0, sheep = 0;
    for (let i = 0; i < 4000; i++) { if (rollGuard('cow', 5) >= 0) cows++; if (rollGuard('sheep', 5) >= 0) sheep++; }
    assert.ok(Math.abs(cows / 4000 - 0.45) < 0.03 && Math.abs(sheep / 4000 - 0.29) < 0.03, `${cows} ${sheep}`);
    const { A } = fakeGame();
    const herd = herdWithGuard(A, 'cow');
    const bull = herd.find((a) => a.guard === 'bull');
    assert.ok(bull && herd[0].herd.guard === bull.id, 'one bull in the herd');
    assert.equal(bull.model.scale.y, herd[1].model.scale.y, 'he looks like the others (no hint)');
    assert.equal(bull.form, 0);
});

test('attack a cow of his herd: the bull changes in ~1.6 s — twice as big, much stronger — and hunts the attacker; the herd flees', () => {
    const { g, A } = fakeGame();
    const herd = herdWithGuard(A, 'cow');
    const bull = herd.find((a) => a.guard);
    const base = bull.model.scale.y;
    A.hit(herd[2], 1, new THREE.Vector3(1, 0, 0), 'me');
    assert.equal(bull.form, 1, 'he wakes');
    run(A, 1);
    assert.equal(bull.form, 1, 'still changing');
    run(A, 0.8);
    assert.equal(bull.form, 2, 'the bronze bull');
    assert.ok(Math.abs(bull.model.scale.y / base - GUARD.BULL.SCALE) < 0.01, `2× (${(bull.model.scale.y / base).toFixed(2)})`);
    assert.ok(bull.hp >= GUARD.BULL.HP, 'much more HP');
    assert.ok(bull.model.userData.bronze.some((m) => m.visible), 'bronze horns, hooves, mouth, burning eyes');
    assert.ok(herd.filter((a) => a !== bull).every((a) => a.state === 'flee'), 'the herd flees');
    let gored = 0;
    run(A, 12, () => { gored = g.hurt; });
    assert.ok(gored >= GUARD.BULL.DMG, `he rushed / burned me (${gored} HP)`);
    assert.ok(A.guards.log.some((e) => e.ev === 'gore' || e.ev === 'fire'));
});

test('he calms down when the attacker is gone and slowly becomes an ordinary bull again', () => {
    const { g, A } = fakeGame();
    const herd = herdWithGuard(A, 'cow');
    const bull = herd.find((a) => a.guard);
    const base = bull.model.scale.y;
    A.hit(bull, 1, null, 'me');
    run(A, 2);
    assert.equal(bull.form, 2);
    g.character.group.position.set(500, 1.5, 0); // (ran away far)
    run(A, GUARD.BULL.CALM + 1);
    assert.equal(bull.form, 3, 'shrinking');
    run(A, GUARD.BULL.SHRINK + 0.5);
    assert.equal(bull.form, 0, 'calm');
    assert.ok(Math.abs(bull.model.scale.y - base) < 1e-6, 'his own size again');
    assert.ok(!bull.model.userData.bronze.some((m) => m.visible), 'no bronze');
    assert.ok(bull.hp <= 10 && bull.state === 'graze');
});

test('the leader ram: attacked, he becomes a minotaur over 5 s (40 HP), walks upright at the attacker and strikes', () => {
    const { g, A } = fakeGame();
    const flock = herdWithGuard(A, 'sheep');
    const ram = flock.find((a) => a.guard === 'ram');
    A.hit(flock[1], 1, null, 'me');
    assert.equal(ram.form, 1);
    assert.equal(ram.hp, GUARD.RAM.HP, '40 HP');
    run(A, 4.5);
    assert.equal(ram.form, 1, 'the change takes 5 s');
    run(A, 0.7);
    assert.equal(ram.form, 2, 'the minotaur');
    const mino = ram.model.userData.minotaur;
    assert.ok(mino?.visible && !ram.model.userData.sheepParts.some((o) => o.visible), 'the ram is gone, the minotaur stands');
    const box = new THREE.Box3().setFromObject(mino);
    assert.ok(box.max.y - box.min.y > 5, `taller than a man (${(box.max.y - box.min.y).toFixed(1)} m)`);
    run(A, 10);
    assert.ok(g.hurt >= GUARD.RAM.DMG, `he hit me (${g.hurt})`);
    // killed: he drops the horn
    A.hit(ram, 99, null, 'me');
    assert.ok(ram.dead);
    assert.deepEqual(g.dropped, ['minotaurHorn']);
});

test('a stun holds them shorter; the bronze bull killed leaves a bronze horn and lots of meat', () => {
    const { g, A } = fakeGame();
    const herd = herdWithGuard(A, 'cow');
    const bull = herd.find((a) => a.guard);
    A.hit(bull, 1, null, 'me');
    run(A, 2);
    bull.stunT = 3;
    run(A, 1.6);
    assert.ok(!(bull.stunT > 0), 'a 3 s stun lasts ~1.5 s on him');
    A.hit(bull, 999, null, 'me');
    assert.deepEqual(g.dropped, ['bronzeHorn']);
    assert.equal(bull.meat, GUARD.BULL.MEAT);
});
