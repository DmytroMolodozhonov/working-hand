// The Tarons (Taron.js) in a fake game: a camp is made from the plan, wakes at a trespasser, walks at half the player's speed, winds up 0.9 s
// (seen), swings (22 / 14), is hit by spells (TARGETS), dies (loot, achievement count), regrows, does not chase past the leash.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Taron } from '../../src/game/Taron.js';
import { TARON } from '../../src/game/TaronRules.js';

function fakeGame(opts = {}) {
    const g = {
        scene: new THREE.Group(), authority: true, localId: 'me', remotes: new Map(), gen: 30, frameCount: 0,
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 } },
        collision: { groundY: () => 0, resolveCylinder() {}, isSolidAt: () => false },
        terrain: { data: { hell: true, landMade: () => true, get: () => 0, set() {} } },
        combat: { dead: false, enabled: true, hits: [], damage(d, by, kind) { this.hits.push([d, kind]); }, shieldFactor: () => 0, _blocked: () => false },
        sound: { played: [], playTaron(p, k) { this.played.push(k); }, playCrack() {} },
        fx: { shake: 0, smoke: { spawn() {} } }, hud: { setVoice() {} },
        items: { loose: [], spawnLoose(it) { this.loose.push(it); } },
        mana: { taronKill() {} }, creatureImpact: { apply() {} }, impact: { apply() {} },
        sync: null, builder: { _sendEdits() {} },
    };
    g.character.group.position.set(opts.x ?? 0, 0, opts.z ?? 300);
    return g;
}
const step = (g, T, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) { g.frameCount++; T.update(dt); } };
const plan = (n = 4) => ({ taronCamps: [{ x: 0, z: 0, n, r: 30, y: 18 }] });

test('a camp is made near a player (n Tarons, 7 m, not far ones), put away when everyone is far', () => {
    const g = fakeGame({ z: 100 });
    const T = new Taron(g); g.tarons = T;
    T.setPlan(plan(5));
    step(g, T, 20);
    assert.equal(T.list.filter((t) => !t.dead).length, 5);
    const box = new THREE.Box3();
    for (const t of T.list) { t.model.updateMatrixWorld(true); t.model.userData.axe.visible = false; assert.ok(Math.hypot(t.model.position.x, t.model.position.z) < 31); }
    g.character.group.position.set(0, 0, 900);
    step(g, T, 3);
    assert.equal(T.list.length, 0, 'put away at 560 m');
    g.character.group.position.set(0, 0, 100);
    step(g, T, 20);
    assert.equal(T.list.filter((t) => !t.dead).length, 5, 'and made again');
    void box;
});

test('calm until a trespasser is seen within 40 m; then a roar, a heavy walk at half the player\'s speed, never faster', () => {
    const g = fakeGame({ z: 120 });
    const T = new Taron(g); g.tarons = T; T.setPlan(plan(4)); step(g, T, 15);
    assert.ok(T.list.every((t) => t.st === 'idle' || t.st === 'home'), 'calm at 120 m');
    g.character.group.position.set(0, 0, 60); step(g, T, 2);
    assert.ok(T.list.every((t) => t.st === 'idle' || t.st === 'home'), 'still calm at 60 m (out of NOTICE 40 + the camp)');
    g.character.group.position.set(0, 0, 36); step(g, T, 1);
    assert.ok(T.list.some((t) => t.st === 'roar' || t.st === 'chase'), 'awake at 36 m');
    assert.ok(g.sound.played.includes('roar'));
    // the speed over several seconds of the chase
    let maxV = 0;
    for (let i = 0; i < 300; i++) { g.frameCount++; const before = T.list.map((t) => t.model.position.clone()); T.update(1 / 30); T.list.forEach((t, k) => { maxV = Math.max(maxV, before[k].distanceTo(t.model.position) * 30); }); }
    assert.ok(maxV <= TARON.PLAYER_SPEED * 0.5 + 0.35, 'half the player\'s speed: ' + maxV);
});

test('the swing: faces fully, 0.9 s wind-up (seen), then 22 (blade) or 14 + daze (hammer) once, cooldown between swings; 3 on one victim at most', () => {
    const g = fakeGame({ z: 4 });
    const T = new Taron(g); g.tarons = T; T.setPlan({ taronCamps: [{ x: 0, z: 0, n: 3, r: 10, y: 18 }] }); step(g, T, 10);
    g.combat.hits.length = 0;
    const run = new Map(), done = [], prog = [], swings = new Map();
    for (let i = 0; i < 30 * 60; i++) {
        g.frameCount++; T.update(1 / 30);
        for (const t of T.list) {
            const r = run.get(t.id) || { n: 0, fresh: i > 0, startT: t.stT };
            if (t.mode === 'windup') { if (r.n === 0) { r.startT = t.stT; r.fresh = r.startT < 0.1; } r.n++; prog.push(t.p); run.set(t.id, r); }
            else { if (r.n > 0 && r.fresh && t.mode === 'swing') done.push(r.n / 30); run.set(t.id, { n: 0 }); }
            if (t.mode === 'swing') swings.set(t.id, (swings.get(t.id) || 0) + 1);
        }
        if (done.length >= 3 && g.combat.hits.length >= 2) break;
    }
    assert.ok(done.length >= 3, 'wind-ups were seen: ' + done.length);
    for (const d of done) assert.ok(d >= 0.8 && d <= 1.05, 'the wind-up takes ~0.9 s: ' + d);
    assert.ok(prog.some((p) => p > 0.8) && prog.some((p) => p < 0.2), 'progress is seen growing');
    for (const [d, kind] of g.combat.hits) { assert.ok(d === 22 || d === 14, 'damage ' + d); assert.equal(kind, 'taron'); }
    const onMe = T.list.filter((t) => t.target && t.target.id === 'me').length;
    assert.ok(onMe <= TARON.PACK, 'at most 3 on one victim: ' + onMe);
});

test('harm: 100 HP; blade kills in a few blows; Avada at once; Hellfire does nothing; Stupefy stuns; loot and the kill count', () => {
    const g = fakeGame({ z: 100 });
    const T = new Taron(g); g.tarons = T; T.setPlan(plan(4)); step(g, T, 12);
    const [a, b, c] = T.list;
    assert.equal(a.hp, 100);
    T.hit(a, 50, 'Hellfire', 'me'); assert.equal(a.hp, 100, 'his own fire');
    T.hit(a, 10, 'melee', 'me'); assert.equal(a.hp, 90);
    T.hit(a, 10, 'fist', 'me'); assert.equal(a.hp, 86, 'a fist ×0.4');
    T.hit(b, 0, 'Stupefy', 'me'); assert.ok(b.stun > 1.5 && b.hp === 100);
    T.boltHit(c, 'AvadaKedavra', 'me'); assert.ok(c.dead, 'black magic works on him');
    assert.equal(T.kills, 1);
    assert.ok(g.items.loose.some((i) => i.kind === 'coins'), 'coins');
    for (let i = 0; i < 12; i++) T.hit(a, 10, 'melee', 'me');
    assert.ok(a.dead && T.kills === 2);
    step(g, T, 8); // the bodies sink away
    assert.ok(T.list.every((t) => !t.dead || t.deadT < 13));
});

test('a killed Taron is a gap: +1 after 15 game minutes, never above n; the camp does not re-fill early', () => {
    const g = fakeGame({ z: 100 });
    const T = new Taron(g); g.tarons = T; T.setPlan(plan(3)); step(g, T, 12);
    T.boltHit(T.list[0], 'AvadaKedavra', 'me'); T.boltHit(T.list[1], 'AvadaKedavra', 'me');
    step(g, T, 14 * 60);
    assert.equal(T.list.filter((t) => !t.dead).length, 1, 'no early refill (14 min)');
    step(g, T, 90);
    assert.equal(T.list.filter((t) => !t.dead).length, 2, '+1 after 15 min');
    step(g, T, 15 * 60 + 5);
    assert.equal(T.list.filter((t) => !t.dead).length, 3);
    step(g, T, 20 * 60);
    assert.equal(T.list.filter((t) => !t.dead).length, 3, 'never above n');
});

test('the leash: a player who runs 100 m from the camp is dropped; the Tarons walk home', () => {
    const g = fakeGame({ z: 30 });
    const T = new Taron(g); g.tarons = T; T.setPlan({ taronCamps: [{ x: 0, z: 0, n: 3, r: 20, y: 18 }] }); step(g, T, 12);
    step(g, T, 4);
    assert.ok(T.list.some((t) => t.target), 'awake');
    g.character.group.position.set(0, 0, 150); step(g, T, 20);
    assert.ok(T.list.every((t) => Math.hypot(t.model.position.x, t.model.position.z) < 75 + 5), 'they do not follow past 70 m');
    assert.ok(T.list.every((t) => !t.target), 'the target is dropped');
});

test('no plan — nobody; a guest does not make Tarons by itself', () => {
    const g = fakeGame();
    const T = new Taron(g); step(g, T, 5);
    assert.equal(T.list.length, 0);
    const g2 = fakeGame({ z: 100 }); g2.authority = false;
    const T2 = new Taron(g2); T2.setPlan(plan(4)); step(g2, T2, 10);
    assert.equal(T2.list.length, 0, 'a guest waits for the host\'s places');
    // the host\'s snapshot makes them
    T2.onNet({ op: 's', l: [['tc0n0g0r1', 5, 0, 5, 0, 0, 0, 0, 100, 0, 'tc0', 0]] }, false); step(g2, T2, 1);
    assert.equal(T2.list.length, 1);
});
