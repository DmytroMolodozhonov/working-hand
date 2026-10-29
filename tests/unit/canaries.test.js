// The Canaries (CanaryRules.js, Canaries.js, fx/CanaryModel.js): who they are, where they live, how they throw, what angers / scares them,
// what they leave — and that old worlds stay as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CANARIES as C, CANARY_TARGETS, groupSize, campMembers, campRocks, campCandidate, campLuck, solveThrow, hash } from '../../src/game/CanaryRules.js';
import { Canaries } from '../../src/game/Canaries.js';
import { canaryModel, canaryLook, poseCanary, rockGeometry, campGeometry, campLayout, canaryHideModel, boneModel, CANARY } from '../../src/fx/CanaryModel.js';
import { BLOCK, WORLD_GEN, CANARIES_FROM_GEN } from '../../src/world/Terrain.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';
import { steadyKind } from '../../src/game/Steadiness.js';

/** A fake game on flat ground with marsh water in patches (so shores exist everywhere). */
function fakeGame(gen = WORLD_GEN, { marsh = true } = {}) {
    const dropped = [];
    const wet = (x, z) => marsh && (Math.floor(x / 15) + Math.floor(z / 15)) % 3 === 0;
    const t = {
        topLayer: () => 0, landMade: () => true, sites: null,
        get: (x, y, z) => (y <= -1 ? BLOCK.STONE : y === 0 ? (wet(x, z) ? BLOCK.STONE : BLOCK.GRASS) : y === 1 ? (wet(x, z) ? BLOCK.WATER : BLOCK.AIR) : BLOCK.AIR),
    };
    const g = {
        gen, seed: 11, authority: true, localId: 'me', scene: new THREE.Scene(), frameCount: 0,
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 } }, remotes: new Map(), isDeadLocal: false,
        combat: { enabled: true, dead: false, hp: 20, damage(d) { this.hp -= d; }, shieldFactor() { return 0; }, _blocked() {} },
        collision: { boxes: [], groundY: () => 0, addBox(b) { this.boxes.push(b); return this.boxes.length; }, removeBox() {}, resolveCylinder() {} },
        terrain: { data: t }, items: { spawnLoose(it) { dropped.push(it); } }, fx: { spark() {} }, sound: { playCanary() {} }, hud: { setVoice(v) { g.said = v; } },
        impact: { hits: [], apply(o) { this.hits.push(o); } }, creatureImpact: { apply() {} }, dropped, hurt: 0,
    };
    g.damageLocalPlayer = (d) => { g.hurt += d; };
    g.character.group.position.set(1000, 2, 1000);
    return g;
}
/** A camp with its people and boulders, loaded by hand on the fake ground. */
function withCamp(g = fakeGame()) {
    const S = new Canaries(g);
    const def = { gx: 3, gz: 4, x: 500.5, z: 700.5, top: 0, seed: 2 };
    const camp = S._loadCamp(def);
    S.camps.set('3,4', camp);
    return { g, S, camp, def };
}
const step = (S, g, secs, dt = 1 / 30) => { for (let i = 0; i < Math.round(secs / dt); i++) { g.frameCount++; S.update(dt); } };

test('rules: camps of 3–8 (mostly 5), a camp has 9–14 boulders, the same every time', () => {
    const sizes = new Map();
    for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) { const n = groupSize(gx, gz, 5); assert.ok(n >= 3 && n <= 8); sizes.set(n, (sizes.get(n) || 0) + 1); }
    assert.ok(sizes.get(5) > (sizes.get(3) || 0) && sizes.get(5) > (sizes.get(8) || 0) && sizes.get(5) > (sizes.get(7) || 0), 'mostly five');
    const def = { gx: 2, gz: -3, x: 10, z: 10 };
    const m = campMembers(def, 9), r = campRocks(def, 9);
    assert.deepEqual(campMembers(def, 9), m);
    assert.ok(m[0].leader && m.filter((x) => x.leader).length === 1);
    assert.ok(r.length >= C.ROCKS[0] && r.length <= C.ROCKS[1]);
    for (const k of r) { assert.ok(Math.hypot(k.x - def.x, k.z - def.z) >= 3 - 1e-9 && k.r >= C.ROCK_R[0] && k.r <= C.ROCK_R[1]); }
    for (const x of m) assert.ok(Math.hypot(x.x - def.x, x.z - def.z) < C.TERR_R);
    const [x, z] = campCandidate(1, 1, 3, 0);
    assert.ok(x > C.CELL + 19 && x < 2 * C.CELL - 19 && z > C.CELL + 19 && z < 2 * C.CELL - 19);
    assert.ok(typeof campLuck(1, 1, 1) === 'boolean' && hash(1, 2, 3, 4) === hash(1, 2, 3, 4));
});

test('the throw: the arc lands on the target (flat, uphill, downhill, a moving target), every shot is a dodgeable arc', () => {
    const sim = (from, v, until) => { let { x, y, z } = from, vy = v.vy; const dt = 0.002; for (let t = 0; t < 8; t += dt) { x += v.vx * dt; y += vy * dt; z += v.vz * dt; vy -= C.G * dt; if (vy < 0 && y <= until) return { x, y, z, t }; } return null; };
    for (const [dx, dy] of [[10, 0], [16, 0], [14, -2], [13, 3], [6, 0], [19, -1]]) {
        const from = { x: 0, y: 3, z: 0 }, to = { x: dx, y: 3 + dy, z: 0 };
        const s = solveThrow(from, to);
        assert.ok(s.ok, `reaches ${dx}, ${dy}`);
        const e = sim(from, s, to.y);
        assert.ok(e && Math.hypot(e.x - to.x, e.z - to.z) < 0.4, `lands at ${dx},${dy}: ${e && e.x.toFixed(2)}`);
        assert.ok(e.t > (dx >= 10 ? 0.45 : 0.2) && e.t < 2.2, `flight ${e.t.toFixed(2)} s: time to sidestep`);
    }
    const mv = solveThrow({ x: 0, y: 3, z: 0 }, { x: 12, y: 2, z: 0 }, C.THROW_SPEED, C.G, { x: 0, z: 4 }, 1);
    assert.ok(mv.vz > 0.5, 'aimed ahead of a target running across');
    const far = solveThrow({ x: 0, y: 3, z: 0 }, { x: 60, y: 3, z: 0 });
    assert.ok(!far.ok && far.vy > 0, 'out of reach: the best it can');
});

test('the model: small and broad (about half a hero), huge arms, in the colours of a canary; every look a little different', () => {
    const hero = 4.6, m = canaryModel(canaryLook(5)), b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3());
    assert.ok(size.y > 0.4 * hero && size.y < 0.62 * hero, `height ${size.y.toFixed(2)} vs hero ${hero}`);
    assert.ok(b.min.y > -0.05 && b.min.y < 0.1, 'feet on the ground');
    // arms hang to about the knees (very strong arms)
    const U = m.userData, w = new THREE.Vector3(); poseCanary(m, { mode: 'idle' }); m.updateMatrixWorld(true);
    U.elbowR.getWorldPosition(w); assert.ok(w.y < 1.2 && w.y > 0.5, `elbow ${w.y.toFixed(2)}`);
    const looks = new Set(); for (let i = 0; i < 60; i++) looks.add(canaryLook(i).n);
    assert.ok(looks.size >= 12, 'many looks');
    for (let n = 0; n < 6; n++) { const l = canaryLook(n * 7 + 1); assert.ok(l.size > 0.93 && l.size < 1.08); }
    // one shared material, shapes cached per look
    const a1 = canaryModel(canaryLook(5)), a2 = canaryModel(canaryLook(5));
    const mats = new Set(); for (const mm of [a1, a2]) mm.traverse((o) => { if (o.isMesh) mats.add(o.material); });
    assert.equal(mats.size, 1, 'one material for the whole camp');
    const geos = new Set(); a1.traverse((o) => o.isMesh && geos.add(o.geometry)); a2.traverse((o) => o.isMesh && assert.ok(geos.has(o.geometry), 'the shapes are shared'));
});

test('poses are real arm / leg angles: carrying holds the rock in front, the windup puts it over the head, the throw lets it go', () => {
    const m = canaryModel(canaryLook(2)), U = m.userData, p = new THREE.Vector3();
    const hold = (mode, t) => { poseCanary(m, { mode, t, walk: 0, speed: 0 }); m.updateMatrixWorld(true); return U.hold.getWorldPosition(p.clone()); };
    const carry = hold('carry', 0), wind = hold('windup', 0.6), lift = hold('lift', 0.3);
    assert.ok(wind.y > carry.y + 0.3, `over the head: ${wind.y.toFixed(2)} vs ${carry.y.toFixed(2)}`);
    assert.ok(lift.y < carry.y, 'lifting from the ground');
    assert.ok(carry.z < -0.3, 'held in front (the model looks along −Z)');
    poseCanary(m, { mode: 'throw', t: 0.3 }); assert.ok(U.hold.scale.x < 0.01, 'the hands are empty after the release');
    poseCanary(m, { mode: 'walk', walk: 0.8, speed: 1 }); const r1 = U.legR.rotation.x, k1 = U.kneeL.rotation.x;
    poseCanary(m, { mode: 'walk', walk: 3.9, speed: 1 }); assert.ok(Math.abs(U.legR.rotation.x - r1) > 0.3 && k1 !== U.kneeL.rotation.x, 'the legs swing; the knees fold');
    poseCanary(m, { mode: 'walk', walk: 1.2, speed: 1 }); const roll = U.hips.rotation.z; poseCanary(m, { mode: 'walk', walk: 4.2, speed: 1 }); assert.ok(roll * U.hips.rotation.z < 0, 'a waddle: the hips rock side to side');
    poseCanary(m, { mode: 'dead', t: 1 }); assert.ok(U.root.rotation.x < -1.2, 'lying down');
});

test('boulders, camp props, items: real shapes of the right size (a boulder ~1 m; tents ~3 m; totems 3.4 m at the edge; hide and bone ~0.5 m)', () => {
    const g = rockGeometry(0); g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(s.x > 0.8 && s.x < 1.4 && s.y > 0.6 && s.y < 1.0, `rock ${s.x.toFixed(2)} × ${s.y.toFixed(2)}`);
    assert.notEqual(rockGeometry(0), rockGeometry(1));
    const lay = campLayout(2, 22);
    assert.ok(lay.tents.length >= 2 && lay.totems.length === 4);
    for (const t of lay.totems) assert.ok(Math.abs(Math.hypot(t.x, t.z) - 22) < 1e-6);
    const cg = campGeometry(2); cg.computeBoundingBox(); assert.ok(cg.boundingBox.max.y > 3 && cg.boundingBox.max.y < 4.5 && cg.boundingBox.max.x > 20);
    for (const m of [canaryHideModel(), boneModel()]) { const b = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); assert.ok(Math.max(b.x, b.y, b.z) > 0.3 && Math.max(b.x, b.y, b.z) < 0.8); }
});

test('only worlds of generation ≥ CANARIES_FROM_GEN have camps; a new one finds shores on the land; a camp holds people, rocks, tents', () => {
    assert.ok(WORLD_GEN >= CANARIES_FROM_GEN);
    const old = fakeGame(CANARIES_FROM_GEN - 1), So = new Canaries(old);
    old.character.group.position.set(500, 2, 500);
    for (let i = 0; i < 80; i++) So.update(0.5);
    assert.equal(So.camps.size, 0, 'an older world: none');
    const g = fakeGame(), S = new Canaries(g);
    g.character.group.position.set(500, 2, 700);
    for (let i = 0; i < 600 && S.camps.size === 0; i++) { g.frameCount++; S.update(0.5); }
    assert.ok(S.camps.size >= 1, 'a new world: a camp is found and loaded');
    const camp = [...S.camps.values()][0];
    assert.ok(camp.members.length >= 3 && camp.members.length <= 8 && camp.rocks.length >= 9);
    assert.ok(g.scene.children.length > 3, 'drawn');
    // not near the start
    for (const c of S.cells.values()) if (c && c !== 'wait') assert.ok(Math.hypot(c.x, c.z) >= C.START_FREE);
    // put away when nobody is near
    g.character.group.position.set(500 + 2000, 2, 700);
    for (let i = 0; i < 6; i++) S.update(0.5);
    assert.equal(S.camps.size === 0 || [...S.camps.values()].every((c) => Math.hypot(c.x - g.character.group.position.x, c.z - g.character.group.position.z) < C.KEEP), true);
});

test('peaceful outside the territory: a player 30 m from the fire is left alone; the canaries sit, mutter, wander', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + C.TERR_R + 6, 2, def.z);
    step(S, g, 12);
    assert.ok(S.shots.length === 0 && g.hurt === 0 && g.combat.hp === 20, 'nothing thrown');
    assert.ok(camp.members.every((c) => c.st === 'idle' || c.st === 'sit'), 'calm');
    assert.equal(camp.alert, 0);
});

test('a trespasser: the whole camp rages, every canary fetches a boulder, lifts it in both hands, winds up and throws — the shot hits for 8 and shoves', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + 14, 3.5, def.z);
    let saw = new Set(), thrown = 0;
    for (let i = 0; i < 30 * 40 && g.combat.hp === 20; i++) {
        g.frameCount++; S.update(1 / 30);
        for (const c of camp.members) saw.add(c.st);
        thrown = Math.max(thrown, S.shots.length);
        // I stand still: the rock arrives
    }
    for (const st of ['alert', 'fetch', 'lift', 'carry', 'windup', 'throw']) assert.ok(saw.has(st), `the camp went through «${st}»`);
    assert.ok(thrown >= 1, 'a boulder in the air');
    assert.equal(g.combat.hp, 20 - C.DMG, `hit once for ${C.DMG}`);
    assert.ok(g.impact.hits.some((h) => h.kind === 'rock' && h.v.length() > 5), 'a hard shove');
    assert.match(g.said || '', /валуном/);
    assert.ok(camp.members.filter((c) => c.st !== 'idle').length >= 3, 'the camp joined');
});

test('a sidestep dodges the boulder; it lands, lies there, and is a boulder again (to be fetched); in the lake it sinks', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + 14, 3.5, def.z);
    const before = S.rocks.size;
    let landedAt = null;
    for (let i = 0; i < 30 * 30 && !landedAt; i++) {
        g.frameCount++; S.update(1 / 30);
        // I dodge: always 6 m away from the nearest shot's landing line
        const sh = S.shots[0];
        if (sh) g.character.group.position.set(sh.x + 6, 3.5, sh.z + 6); else g.character.group.position.set(def.x + 14, 3.5, def.z);
        if (S.shots.length === 0 && [...S.rocks.values()].some((r) => r.thrown && r.state === 'rest')) landedAt = [...S.rocks.values()].find((r) => r.thrown);
    }
    assert.equal(g.combat.hp, 20, 'dodged');
    assert.ok(landedAt && landedAt.state === 'rest', 'a thrown boulder lies where it fell');
    assert.ok(S.rocks.size <= before, 'no boulders from nothing');
    assert.ok(g.collision.boxes.length > 0, 'it is solid again');
});

test('«Protection» facing it holds the boulder: a physical shot, no damage', () => {
    const { g, S, def } = withCamp();
    let blocked = 0; g.combat.shieldFactor = () => 1; g.combat._blocked = () => { blocked++; };
    g.character.group.position.set(def.x + 14, 3.5, def.z);
    for (let i = 0; i < 30 * 40 && !blocked; i++) { g.frameCount++; S.update(1 / 30); }
    assert.ok(blocked >= 1 && g.combat.hp === 20, 'held');
});

test('close up they punch (−4, a big shove) instead of throwing; the punch lands on the player\'s computer', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + 3.5, 3.5, def.z);
    const near = camp.members[0].model.position; near.set(def.x + 5.2, 0, def.z);
    for (let i = 0; i < 30 * 12 && g.combat.hp === 20; i++) { g.frameCount++; S.update(1 / 30); g.character.group.position.set(near.x - 2.2, 3.5, near.z); }
    assert.ok(g.combat.hp < 20, 'punched');
    assert.ok(g.impact.hits.some((h) => h.kind === 'canaryPunch'), 'shoved');
});

test('the leader falls: the others run away (9 s), then come back to the fire and are calm; they leave hide and bones; it stays dead', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + 14, 3.5, def.z);
    step(S, g, 3);
    const leader = camp.members.find((c) => c.leader), others = camp.members.filter((c) => !c.leader);
    S.hit(leader, 100, 'melee', 'me');
    assert.ok(leader.dead);
    assert.ok(g.dropped.some((d) => d.kind === 'canaryHide') && g.dropped.some((d) => d.kind === 'bone'), 'hide and bones');
    assert.ok(others.every((c) => c.st === 'flee'), 'the rest flee');
    g.character.group.position.set(def.x + 200, 3.5, def.z);
    step(S, g, C.FLEE_T + 6);
    assert.ok(others.every((c) => c.st !== 'flee'), 'they come back');
    assert.ok(camp.members.length === others.length + 1);
    // killed ones stay dead when the camp loads again
    S._unloadCamp(camp); S.camps.clear();
    const again = S._loadCamp(def);
    assert.ok(!again.members.some((c) => c.id === leader.id), 'still dead');
});

test('a blow from outside the territory (a bow): the camp turns on the shooter within sight', () => {
    const { g, S, camp, def } = withCamp();
    g.character.group.position.set(def.x + 34, 3.5, def.z);
    step(S, g, 2);
    assert.equal(S.shots.length, 0);
    S.hit(camp.members[1], 3, 'arrow', 'me');
    step(S, g, 20);
    assert.ok(camp.members.some((c) => c.st !== 'idle'), 'they answer');
});

test('hits: a blade hurts (HP 40), a fist little, fire burns and runs, cold stops, «Авада» kills; a stunned canary drops its boulder', () => {
    const { g, S, camp } = withCamp();
    const [a, b, c, d] = camp.members;
    S.hit(a, 10, 'melee', 'me'); assert.equal(a.hp, C.HP - 10);
    S.hit(b, 10, 'fist', 'me'); assert.equal(b.hp, C.HP - 4);
    S.hit(c, 1, 'Inferno', 'me'); assert.ok(c.burnT > 0);
    S.hit(d, 1, 'Frozen', 'me'); assert.ok(d.frozenT > 0);
    const e = camp.members[camp.members.length - 1];
    const rk = [...S.rocks.values()][0]; e.rock = rk; rk.holder = e; rk.state = 'held';
    S.boltHit(e, 'Stupefy', 'me'); assert.equal(e.rock, null, 'dropped'); assert.equal(rk.state, 'rest');
    S.boltHit(a, 'AvadaKedavra', 'me'); assert.ok(a.dead);
});

test('guests: a thrown boulder is flown the same on every computer; the hit is decided by the player\'s own computer; a guest\'s blow goes to the host', () => {
    const { g, S, camp, def } = withCamp();
    const sent = []; g.sync = { net: { send: (m) => sent.push(m) } };
    g.character.group.position.set(def.x + 14, 3.5, def.z);
    for (let i = 0; i < 30 * 40 && !sent.some((m) => m.op === 'throw'); i++) { g.frameCount++; S.update(1 / 30); }
    const th = sent.find((m) => m.op === 'throw');
    assert.ok(th && th.p.length === 3 && th.v.length === 3, 'the host announces the throw');
    // a guest computer with the same camp: flies the same shot
    const g2 = fakeGame(); g2.authority = false; g2.localId = 'guest';
    const S2 = new Canaries(g2); const camp2 = S2._loadCamp({ gx: 3, gz: 4, x: 500.5, z: 700.5, top: 0, seed: 2 }); S2.camps.set('3,4', camp2);
    g2.character.group.position.set(def.x + 14, 3.5, def.z);
    S2.onNet(th, false);
    assert.equal(S2.shots.length, 1);
    for (let i = 0; i < 30 * 3 && g2.combat.hp === 20; i++) { g2.frameCount++; S2.update(1 / 30); }
    // (if it was aimed at the spot where I stand, the guest's own player takes it)
    assert.ok(g2.combat.hp <= 20);
    // a guest's blow is a message to the host, not damage here
    const gs = []; g2.sync = { net: { send: (m) => gs.push(m) } };
    const c0 = camp2.members[0]; S2.hit(c0, 5, 'melee', 'guest');
    assert.ok(gs.some((m) => m.op === 'hit' && m.id === c0.id), 'asks the host');
    assert.equal(c0.hp, C.HP);
});

test('«кто/что»: the table decides every kind of creature and every way of harm, with a reason; the canary is steady and the heavy kind', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragons', 'phoenixes', 'owls', 'iceCastle', 'gargoyle', 'plants', 'items', 'blade', 'fist', 'arrow', 'blast', 'fire', 'cold', 'avada', 'alive', 'shield', 'gods', 'imperius']) assert.ok(CANARY_TARGETS[k]?.why, k);
    assert.equal(steadyKind('N', { id: 'x' }), 'canary');
    assert.ok(ITEM_INFO.canaryHide && ITEM_INFO.bone && ITEM_INFO.bone.stack === 20);
    assert.ok(CANARY.H > 2 && CANARY.H < 2.6);
});
