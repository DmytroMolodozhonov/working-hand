import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { Zombie } from '../../src/entities/Zombie.js';
import { animalModel } from '../../src/game/Animals.js';
import { spiderModel } from '../../src/game/Spider.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { WeaponSystem } from '../../src/game/Weapons.js';
import { Combat } from '../../src/game/Combat.js';
import { cutLimb, restoreAll, cutGeometry, applyState } from '../../src/entities/LimbSurgery.js';
import { characterBody, villagerBody, zombieBody, animalBody, spiderBody, boneLines, blockerBoxes, tissueAt } from '../../src/game/CutBodies.js';
import {
    sweepCut, firstBlock, judgeCut, armourCovers, villagerArmoured, packSever, parseSever, stateToNet, stateFromNet,
    limbMotion, Dismemberment, EDGES, FALL_TIME,
} from '../../src/game/Dismember.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b} (±${eps})`);

function hero() {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setIdlePose();
    ch.group.position.set(0, 1.5, 0);
    ch.group.updateMatrixWorld(true);
    return ch;
}
/** A horizontal edge from x0 to x1 at height y, swept from z0 to z1 in one frame. */
const slash = (x0, x1, y, z0 = -2, z1 = 2) => [[x0, y, z0], [x1, y, z0], [x0, y, z1], [x1, y, z1]];

// ============================================================ the blade's path
test('a horizontal edge passing the hanging arm cuts it exactly where it passed', () => {
    const ch = hero();
    const lines = boneLines(characterBody(ch));
    const sh = ch.leftArmAnchor.getWorldPosition(new THREE.Vector3());
    for (const want of [0.15, 0.5, 0.75, 1.55]) {
        const y = sh.y - want * Math.cos(Math.atan(0.1)); // (the idle arm hangs a little outward)
        const hit = sweepCut(...slash(-3, -0.45, y), lines);
        assert.equal(hit?.limb, 'leftArm', `at ${want}`);
        near(hit.d, want, 0.06, 'd');
        assert.ok(Math.abs(hit.n[1]) > 0.99, 'the cut is level like the swing');
    }
    const body = characterBody(ch);
    assert.equal(tissueAt(body, 'leftArm', 0.5), 'upperArm');
    assert.equal(tissueAt(body, 'leftArm', 1.5), 'forearm');
    assert.equal(tissueAt(body, 'leftArm', 2.0), 'hand');
    assert.equal(tissueAt(body, 'leftLeg', 0.5), 'thigh');
    assert.equal(tissueAt(body, 'leftLeg', 1.5), 'shin');
});

test('an edge that stops short of the bone, or runs along the limb, cuts nothing', () => {
    const ch = hero();
    const lines = boneLines(characterBody(ch));
    assert.equal(sweepCut(...slash(-3, -0.95, 2.3), lines), null, 'stops short of the arm');
    // the blade along the leg, moving along itself
    const L = ch.leftLegPivot.getWorldPosition(new THREE.Vector3());
    assert.equal(sweepCut([L.x, 1.4, L.z], [L.x, 0.2, L.z], [L.x, 1.0, L.z], [L.x, -0.2, L.z], lines.filter((l) => l.limb !== 'head')), null);
});

test('the body stops the blade: a frontal full-width slash is blocked, a side slash takes the arm', () => {
    const ch = hero();
    const body = characterBody(ch);
    const lines = boneLines(body), blk = blockerBoxes(body);
    // frontal: the edge across the whole body, coming from the front
    const f = slash(-3, 3, 2.3);
    const hit = sweepCut(...f, lines);
    assert.ok(hit, 'the arm line is on the path');
    const b = firstBlock(...f, hit.s, blk);
    assert.ok(b >= 0 && b <= hit.s, `blocked first (${b} vs ${hit.s})`);
    assert.equal(judgeCut(hit, b, 1 / 60, { cutSpeed: 6.5, sides: 2 }, [0, 0, 1], 50, 'upperArm').kind, 'blocked');
    // from the side: the edge stops before the torso
    const s = slash(-3, -0.62, 2.3);
    const h2 = sweepCut(...s, lines);
    assert.equal(h2.limb, 'leftArm');
    assert.equal(firstBlock(...s, h2.s, blk), -1);
});

test('the neck: a slash between the shoulders and the skull takes the head; lower is the torso, higher the skull', () => {
    const ch = hero();
    const body = characterBody(ch);
    const lines = boneLines(body), blk = blockerBoxes(body);
    const at = (y) => { const s = slash(-3, 3, y); const h = sweepCut(...s, lines.filter((l) => l.limb === 'head')); return { h, b: h ? firstBlock(...s, h.s, blk) : null }; };
    const neck = at(3.1);
    assert.equal(neck.h?.limb, 'head');
    assert.equal(neck.b, -1, 'not blocked');
    assert.equal(at(3.6).h, null, 'the skull: no neck there');
    // at the shoulders the torso is in the way
    const s = slash(-3, 3, 2.9);
    assert.ok(firstBlock(...s, 1, blk) >= 0);
});

test('only a real edge-on swing cuts; the axe needs a stronger one; armour and the flat do not', () => {
    const hit = { s: 0.5, motion: [0, 0, 0.2], n: [0, 1, 0], limb: 'leftArm', d: 0.5 };
    const sword = { cutSpeed: EDGES.sword.cutSpeed, sides: 2 }, axe = { cutSpeed: EDGES.axe.cutSpeed, sides: 1 };
    const J = (m, w = sword, edge = [0, 0, 1], prev = 50, tissue = 'upperArm') => judgeCut({ ...hit, motion: m }, -1, 1 / 60, w, edge, prev, tissue).kind;
    assert.equal(J([0, 0, 0.1]), 'touch', '6 m/s');
    assert.equal(J([0, 0, 0.2]), 'cut', '12 m/s');
    assert.equal(J([0, 0, -0.2]), 'cut', 'the sword cuts with both edges');
    assert.equal(J([0, 0, 0.2], sword, [0, 1, 0]), 'touch', 'the flat leads');
    assert.equal(J([0, 0, 0.2], sword, [0, 0, 1], 2), 'touch', 'no swing before (a tracking jump)');
    assert.equal(J([0, 0, 70 / 60]), 'touch', '70 m/s');
    assert.equal(J([0, 0, 9 / 60], axe), 'touch', 'axe 9 m/s');
    assert.equal(J([0, 0, 12 / 60], axe), 'cut', 'axe 12 m/s');
    assert.equal(J([0, 0, -12 / 60], axe), 'touch', "the axe's back");
    assert.equal(J([0, 0, 8 / 60], sword, [0, 0, 1], 50, 'thigh'), 'touch', 'the thigh is harder');
    assert.equal(judgeCut({ ...hit, motion: [0, 0, 5 / 60] }, -1, 1 / 60, { ...sword, bonus: 50 }, [0, 0, 1], 50, 'upperArm').kind, 'cut', 'a magic blade is sharper');
    // armour
    assert.ok(armourCovers({ top: 5 }, 'leftArm', 0.5));
    assert.ok(armourCovers({ top: 5 }, 'head', 0));
    assert.ok(armourCovers({ hat: 9 }, 'head', 0));
    assert.ok(armourCovers({ bottom: 8 }, 'leftLeg', 1.2));
    assert.ok(armourCovers({ shoes: 6 }, 'rightLeg', 1.85));
    assert.ok(!armourCovers({ top: 5 }, 'leftArm', 1.95), 'the bare hand');
    assert.ok(!armourCovers({ bottom: 8 }, 'leftLeg', 0.5));
    assert.ok(!armourCovers({ top: 0, hat: 0, bottom: 0, shoes: 0 }, 'head', 0));
    assert.ok(villagerArmoured({ role: 'knight', armor: 1 }));
    assert.ok(!villagerArmoured({ role: 'knight', armor: 0 }));
    assert.ok(!villagerArmoured({ role: 'farmer', armor: 5 }));
});

test('network packing and state; movement with legs gone', () => {
    const sv = parseSever(packSever({ limb: 'rightLeg', d: 1.234, n: [0, 2, 0], v: [5, 0, 0], lf: 3 }));
    assert.deepEqual(sv, { limb: 'rightLeg', d: 1.23, n: [0, 1, 0], v: [5, 0, 0], lf: 3 });
    assert.equal(parseSever('x'), null);
    assert.equal(parseSever([99, 1, 0, 1, 0, 0, 0, 0, 0]), null);
    assert.equal(parseSever([1, NaN, 0, 1, 0, 0, 0, 0, 0]), null);
    assert.deepEqual(parseSever([1, 0.5, 0, 0, 0, 0, 0, 0, 0]).n, [0, 1, 0]);
    assert.equal(parseSever([12, 0.5, 0, 1, 0, 0, 0, 0, 0]).limb, 'leg2');
    const st = { leftArm: 0.5, head: true, leg3: 0.2 };
    assert.deepEqual(stateFromNet(stateToNet(st)), st);
    assert.deepEqual(limbMotion({}), { speed: 1, run: true, drop: 0 });
    assert.deepEqual(limbMotion({ leftLeg: 1 }), { speed: 0.4, run: false, drop: 0 });
    const both = limbMotion({ leftLeg: 0.6, rightLeg: 1.2 });
    assert.equal(both.speed, 0.2); near(both.drop, 0.75, 1e-9);
    assert.ok(limbMotion({ leg0: 0.1 }, ['leg0', 'leg1', 'leg2', 'leg3']).speed < 1);
    assert.equal(limbMotion({ leg0: 0.1, leg1: 0, leg2: 0 }, ['leg0', 'leg1', 'leg2', 'leg3']).speed, 0.2);
});

// ============================================================ the model
test('cutGeometry trims a box at the plane and keeps its texture unstretched', () => {
    const g = new THREE.BoxGeometry(0.5, 1.95, 0.5);
    const keep = cutGeometry(g, new THREE.Vector3(0, 0.975 - 1.2, 0), new THREE.Vector3(0, -1, 0), false);
    keep.computeBoundingBox();
    near(keep.boundingBox.min.y, -0.225, 1e-4); near(keep.boundingBox.max.y, 0.975, 1e-4);
    // a side face's v runs 1 (top) → 0.385 (the cut), as on the whole leg at that height
    const vs = [];
    for (let i = 0; i < 4; i++) vs.push(keep.attributes.uv.array[i * 2 + 1]);
    near(Math.min(...vs), 1 - 1.2 / 1.95, 1e-3); near(Math.max(...vs), 1, 1e-6);
    const far = cutGeometry(g, new THREE.Vector3(0, 0.975 - 1.2, 0), new THREE.Vector3(0, -1, 0), true);
    far.computeBoundingBox();
    near(far.boundingBox.max.y, -0.225, 1e-4); near(far.boundingBox.min.y, -0.975, 1e-4);
    assert.equal(cutGeometry(g, new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, -1, 0)), g, 'all kept');
    assert.equal(cutGeometry(g, new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)), null, 'all cut away');
});

test('the hero: an arm cut at 0.6 — stump, no hand, gestures off; the piece has the hand; respawn makes it whole', () => {
    const ch = hero();
    ch.setShowHands(true);
    const body = characterBody(ch);
    const r = cutLimb(ch, body, 'leftArm', 0.6, [0, 0, 1]);
    assert.ok(r.changed && r.piece);
    const upper = ch.leftArmAnchor.children.find((o) => o.isMesh);
    upper.geometry.computeBoundingBox();
    near(upper.geometry.boundingBox.min.z + upper.position.z, 0, 0.01); near(upper.geometry.boundingBox.max.z + upper.position.z, 0.6, 0.01);
    assert.equal(ch.leftElbowAnchor.visible, false);
    assert.equal(ch.leftSimplifiedHand.group.visible, false);
    assert.equal(ch.rightSimplifiedHand.group.visible, true);
    assert.ok(upper.children.some((c) => c.name === 'stump'), 'a cap on the stump');
    assert.ok(ch.handLost('left') && !ch.handLost('right'));
    const want = ch.leftArmAnchor.localToWorld(new THREE.Vector3(0, 0, 0.6));
    assert.ok(ch.getHandWorldPosition('left').distanceTo(want) < 0.02, 'the hand position is the stump');
    ch.setShowHands(true);
    assert.equal(ch.leftSimplifiedHand.group.visible, false, 'stays hidden');
    assert.equal(ch.getGripCurl('left'), 0);
    // raise both arms: only the right one counts
    for (const a of [ch.leftArmAnchor, ch.rightArmAnchor]) a.lookAt(a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, -0.2)));
    ch.group.updateMatrixWorld(true);
    assert.equal(ch.isArmRaised('left'), false);
    assert.equal(ch.isArmRaised('right'), true);
    assert.equal(ch.isHandRaised()?.side, 'right');
    assert.equal(ch.areBothHandsUp(), false);
    let palm = false;
    r.piece.traverse((o) => { if (o.name === 'palm') palm = true; });
    assert.ok(palm, 'the hand goes with the arm');
    // again further out: air
    assert.equal(cutLimb(ch, body, 'leftArm', 1.4).changed, false);
    // nearer the body: shorter
    assert.equal(cutLimb(ch, body, 'leftArm', 0.3).changed, true);
    assert.equal(ch.limbs.leftArm, 0.3);
    restoreAll(ch);
    upper.geometry.computeBoundingBox();
    near(upper.geometry.boundingBox.max.z - upper.geometry.boundingBox.min.z, 1.0, 1e-6);
    assert.equal(ch.leftElbowAnchor.visible, true);
    assert.ok(!upper.children.some((c) => c.name === 'stump'));
    assert.equal(ch.handLost('left'), false);
    ch.setShowHands(true);
    assert.equal(ch.leftSimplifiedHand.group.visible, true);
});

test('the hero: forearm, leg, head', () => {
    const ch = hero();
    ch.setShowHands(true);
    const body = characterBody(ch);
    cutLimb(ch, body, 'rightArm', 1.5);
    const fore = ch.rightElbowAnchor.children.find((o) => o.isMesh);
    fore.geometry.computeBoundingBox();
    near(fore.geometry.boundingBox.max.z + fore.position.z, 0.5, 0.01);
    assert.equal(ch.rightElbowAnchor.visible, true);
    assert.equal(ch.rightSimplifiedHand.group.visible, false);
    // the leg (with a shoe on the pivot)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.7), new THREE.MeshBasicMaterial());
    shoe.position.y = -1.6;
    ch.leftLegPivot.add(shoe);
    cutLimb(ch, body, 'leftLeg', 1.2);
    const leg = ch.leftLegPivot.children.find((o) => o.isMesh);
    leg.geometry.computeBoundingBox();
    near(leg.geometry.boundingBox.min.y + leg.position.y, -1.2, 0.01);
    near(leg.geometry.boundingBox.max.y + leg.position.y, 0, 0.01);
    assert.equal(shoe.visible, false, 'the shoe went with the foot');
    // the head
    const r = cutLimb(ch, body, 'head', 0);
    assert.ok(r.changed && r.piece);
    assert.equal(ch.head.visible, false);
    assert.ok(ch.torso.children.some((c) => c.name === 'stump'));
    assert.equal(cutLimb(ch, body, 'head', 0).changed, false, 'only once');
    // a late joiner's copy: the same stumps, no pieces
    const other = hero();
    applyState(other, characterBody(other), ch.limbs);
    assert.equal(other.head.visible, false);
    const ol = other.leftLegPivot.children.find((o) => o.isMesh);
    ol.geometry.computeBoundingBox();
    near(ol.geometry.boundingBox.min.y + ol.position.y, -1.2, 0.01);
});

test('a villager: a knight\'s sword arm goes with his sword; other knights are untouched', () => {
    const m = new VillagerModel(villagerLook(3, 'knight'));
    m.setHeldTool('sword');
    m.group.updateMatrixWorld(true);
    const m2 = new VillagerModel(villagerLook(3, 'knight'));
    const body = villagerBody(m);
    const r = cutLimb(m, body, 'rightArm', 0.8, null);
    assert.ok(r.changed);
    const arm = m.rightArm.children.find((o) => o.isMesh);
    arm.geometry.computeBoundingBox();
    near(arm.geometry.boundingBox.min.y, -0.8, 0.02);
    assert.equal(m.handSlot.visible, false, 'the fist with the sword is gone');
    let tool = false;
    r.piece.traverse((o) => { if (o.isMesh && o.visible && o.parent?.parent && o.geometry === m.tool.geometry) tool = true; });
    assert.ok(tool, 'the sword is in the piece');
    const arm2 = m2.rightArm.children.find((o) => o.isMesh);
    assert.notEqual(arm2.geometry, arm.geometry);
    arm2.geometry.computeBoundingBox();
    near(arm2.geometry.boundingBox.min.y, -1.36, 0.02);
    // the leg: thigh / shin
    cutLimb(m, body, 'leftLeg', 1.4);
    assert.equal(m.leftKnee.visible, true);
    assert.equal(tissueAt(body, 'leftLeg', 1.4), 'shin');
    cutLimb(m, body, 'rightLeg', 0.5);
    assert.equal(m.rightKnee.visible, false);
    assert.equal(tissueAt(body, 'rightLeg', 0.5), 'thigh');
});

test('a zombie, an animal and the spider have their own limbs to cut', () => {
    const z = new Zombie(new THREE.Scene(), new THREE.Vector3(0, 0.5, 0), 7, {});
    z.group.updateMatrixWorld(true);
    const zb = zombieBody(z);
    const zr = cutLimb(z, zb, 'leftArm', 0.5);
    assert.ok(zr.changed);
    z.leftArm.geometry.computeBoundingBox();
    near(z.leftArm.geometry.boundingBox.max.y - z.leftArm.geometry.boundingBox.min.y, 0.5, 0.01);
    assert.equal(boneLines(zb).filter((l) => l.limb === 'leftArm').reduce((s, l) => s + l.len, 0), 0.5, 'the stump only');
    // the horse
    const h = animalModel('horse', 0x6b3f1e);
    h.updateMatrixWorld(true);
    const hb = animalBody(h);
    assert.equal(hb.limbs.filter((l) => l.kind === 'leg').length, 4);
    const head = hb.limbs.find((l) => l.kind === 'head');
    assert.ok(head && head.parts.length >= 2, 'the head with its ears and eyes');
    assert.ok(cutLimb(h, hb, 'head', 0).changed);
    assert.ok(head.parts.every((p) => !p.visible));
    assert.ok(cutLimb(h, hb, 'leg2', 0.5).changed);
    // the pig and the cow
    for (const type of ['pig', 'cow', 'sheep']) {
        const a = animalModel(type);
        const ab = animalBody(a);
        assert.ok(ab.limbs.find((l) => l.kind === 'head'), type + ' head');
        assert.equal(ab.limbs.filter((l) => l.kind === 'leg').length, 4, type + ' legs');
    }
    // the spider: 8 legs of two bones
    const s = spiderModel();
    s.updateMatrixWorld(true);
    const sb = spiderBody(s);
    assert.equal(sb.limbs.length, 8);
    assert.ok(sb.limbs.every((l) => l.segs.length === 2 && l.segs[0].len > 2));
    assert.ok(cutLimb(s, sb, 'leg1', 3.5).changed);
});

// ============================================================ in the game
function fakeGame({ authority = true } = {}) {
    const scene = new THREE.Scene();
    const c = new CollisionWorld();
    const character = new VoxelCharacter(scene);
    character.setShowHands(true);
    let t = 1000;
    const sent = [], voice = [], bleeds = [], stuns = [];
    const game = {
        headless: true, scene, renderer: null, world: { collision: c }, collision: c, character, localId: 'A', authority,
        config: { mode: 'freeworld' }, remotes: new Map(),
        now: () => t, advance: (ms) => { t += ms; },
        fx: { blood() {}, spark() {} },
        hud: { setVoice: (s) => voice.push(s), setStatus() {} },
        sync: { net: { send: (m) => sent.push(m) }, weaponOwners: new Map() },
        bleeding: { rate: 0, start(r, text) { this.rate = Math.max(this.rate, r); bleeds.push({ r, text }); }, remote: new Map() },
        sent, voice, bleeds, stuns,
    };
    game.combat = { enabled: true, dead: false, frozen: false, stun: (s, by, k) => stuns.push({ s, by, k }), die(by, how) { this.dead = true; this.how = how; }, shield: null };
    game.weapons = new WeaponSystem(game);
    game.dismember = new Dismemberment(game);
    return game;
}

/** The sword lying along +X, its edge facing +Z (model +Y → X, model +X → Z). */
function swordAlongX(game, x) {
    const w = game.weapons.spawn('sword', new THREE.Vector3(x, 2, 0), new THREE.Quaternion());
    w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    const hs = game.weapons.hands.right;
    hs.held = w;
    w.attach({ playerId: 'A', side: 'right' });
    return { w, hs };
}

function swing(game, w, zs, y, targets, sx = 0) {
    const ws = game.weapons;
    for (const z of zs) {
        w.position.set(w.position.x + sx, y, z);
        ws.frame = (ws.frame || 0) + 1;
        game.advance(16);
        ws.checkHits(targets, 1 / 60);
    }
}

test('WeaponSystem: a fast edge-on swing through a player\'s hanging arm sends the cut to that player; a slow one does not', () => {
    const game = fakeGame();
    const chB = new VoxelCharacter(game.scene);
    chB.setIdlePose();
    chB.group.position.set(0, 1.5, 0);
    chB.group.updateMatrixWorld(true);
    game.remotes.set('B', { character: chB, position: chB.group.position, name: 'B' });
    game.dismember.remoteLife.set('B', 3);
    const target = { isPlayer: true, id: 'B', group: chB.group, damageCooldown: 0, isDead: false };
    const hits = [];
    game.weapons.onHit = (z, dmg, dir, isW, w, hit) => hits.push(hit);
    // the blade's far end just short of the torso; at the upper arm's height
    const { w } = swordAlongX(game, -0.62 - (1.3 - 0.38) * 2.6);
    const y = 2.75 - 0.75;
    swing(game, w, [-0.6, -0.4, -0.2, 0.0, 0.2, 0.4], y, [target]);
    const cut = game.sent.find((m) => m.t === 'dmcut');
    assert.ok(cut, 'a cut was sent');
    const sv = parseSever(cut.sv);
    assert.equal(cut.to, 'B');
    assert.equal(sv.limb, 'leftArm');
    near(sv.d, 0.75, 0.08, 'where the blade went');
    assert.equal(sv.lf, 3);
    assert.ok(hits.length >= 1, 'and it is a hit too');
    // slow: 3 m/s
    game.sent.length = 0;
    const s2 = fakeGame();
    s2.remotes.set('B', { character: chB, position: chB.group.position, name: 'B' });
    const { w: w2 } = swordAlongX(s2, -0.62 - (1.3 - 0.38) * 2.6);
    swing(s2, w2, [-0.15, -0.1, -0.05, 0, 0.05, 0.1], y, [target]);
    assert.equal(s2.sent.filter((m) => m.t === 'dmcut').length, 0);
    // plate armour: a clang, no cut
    const s3 = fakeGame();
    const chC = new VoxelCharacter(s3.scene);
    chC.setIdlePose(); chC.group.position.set(0, 1.5, 0); chC.group.updateMatrixWorld(true);
    chC.look = { top: 5 };
    s3.remotes.set('C', { character: chC, position: chC.group.position, name: 'C' });
    const { w: w3 } = swordAlongX(s3, -0.62 - (1.3 - 0.38) * 2.6);
    swing(s3, w3, [-0.6, -0.4, -0.2, 0.0, 0.2, 0.4], y, [{ isPlayer: true, id: 'C', group: chC.group, damageCooldown: 0, isDead: false }]);
    assert.equal(s3.sent.filter((m) => m.t === 'dmcut').length, 0);
    assert.ok(s3.weapons.clangCount >= 1, 'steel rang');
});

test('WeaponSystem: a swing through a zombie\'s arm cuts it where the edge passed (no random cuts)', () => {
    const game = fakeGame();
    const z = new Zombie(game.scene, new THREE.Vector3(0, 0.5, 0), 5, {});
    z.group.rotation.y = Math.PI / 2; // facing −X... its left arm toward +Z
    z.group.updateMatrixWorld(true);
    const lines = boneLines(zombieBody(z)).filter((l) => l.limb.endsWith('Arm'));
    const mid = new THREE.Vector3().fromArray(lines[0].a).lerp(new THREE.Vector3().fromArray(lines[0].b), 0.5);
    // a downward chop across the arm: blade along X through the arm's middle, falling through it
    const w = game.weapons.spawn('sword', new THREE.Vector3(), new THREE.Quaternion());
    // blade along +Z? the arms point along −X now (forward); cut across: blade along Z, edge facing −Y (down)
    w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
    const hs = game.weapons.hands.right;
    hs.held = w; w.attach({ playerId: 'A', side: 'right' });
    const zc = mid.z - (0.32 + 1.3) / 2 * 2.6 + 0.38 * 2.6; // the edge's middle at the arm
    const ws = game.weapons;
    for (const dy of [0.8, 0.6, 0.4, 0.2, 0.0, -0.2, -0.4]) {
        w.position.set(mid.x, mid.y + dy, zc);
        ws.frame = (ws.frame || 0) + 1; game.advance(16);
        ws.checkHits([z], 1 / 60);
    }
    const st = z.limbs || {};
    const name = lines[0].limb;
    assert.ok(st[name] != null, 'the arm was cut: ' + JSON.stringify(st));
    near(st[name], 0.6, 0.12, 'in its middle');
    assert.ok(z.limbMask & (name === 'leftArm' ? 2 : 4));
    assert.equal(game.dismember.props.length, 1, 'the arm lies on the ground');
    // a hit without the edge through a limb never cuts anything off any more
    const z2 = new Zombie(game.scene, new THREE.Vector3(5, 0.5, 0), 6, {});
    for (let i = 0; i < 20; i++) z2.takeDamage(0, true, null, () => 0, { y: 1.2, side: 1, speed: 20 });
    assert.equal(z2.limbMask, 0);
});

test('host: a villager\'s leg cut — falls, hops, bleeds to death; a knight\'s armour stops the blade; the king\'s head ends him', () => {
    const game = fakeGame();
    const died = [];
    game.castleLife = { _die: (v, by) => { v.dead = true; died.push({ v, by }); }, hit(v, d, dir, by, o) { if (o.pierce) { v.hp = 0; this._die(v, by); } } };
    const v = { id: 'c1:3', isVillager: true, role: 'farmer', hp: 3, armor: 0, model: new VillagerModel(villagerLook(5, 'farmer')) };
    v.model.group.updateMatrixWorld(true);
    const who = { k: 'v', id: v.id, t: v, body: villagerBody(v.model) };
    assert.ok(game.dismember.apply(who, { limb: 'leftLeg', d: 0.6, n: [0, -1, 0], v: [3, 0, 0] }, 'A', true));
    assert.equal(v.legK, 0.4);
    assert.ok(v.stunT >= FALL_TIME - 1e-6, 'fell');
    assert.equal(game.dismember.props.length, 1);
    assert.ok(game.sent.some((m) => m.t === 'dmlimb' && m.k === 'v'));
    for (let i = 0; i < 60 * 3; i++) game.dismember.update(1 / 60);
    assert.ok(v.dead, 'bled to death: ' + v.hp);
    // «Rescue» stops it
    const v2 = { id: 'c1:4', isVillager: true, role: 'farmer', hp: 8, armor: 0, model: new VillagerModel(villagerLook(6, 'farmer')) };
    game.dismember.apply({ k: 'v', id: v2.id, t: v2, body: villagerBody(v2.model) }, { limb: 'rightArm', d: 0.3, n: [0, -1, 0], v: [0, 0, 0] }, 'A', true);
    for (let i = 0; i < 60; i++) game.dismember.update(1 / 60);
    const hp = v2.hp;
    assert.ok(hp < 8);
    assert.ok(game.dismember.rescueCreature(v2));
    for (let i = 0; i < 120; i++) game.dismember.update(1 / 60);
    assert.equal(v2.hp, hp, 'no more blood lost');
    assert.equal(v2.model.limbs.rightArm, 0.3, 'the arm stays gone');
    // the king's head
    const king = { id: 'c1:0', isVillager: true, role: 'king', hp: 30, armor: 0, model: new VillagerModel(villagerLook(1, 'king')) };
    game.dismember.apply({ k: 'v', id: king.id, t: king, body: villagerBody(king.model) }, { limb: 'head', d: 0, n: [0, 1, 0], v: [0, 0, 0] }, 'A', true);
    assert.ok(king.dead && died.some((d) => d.v === king && d.by === 'A'));
});

test('victim: my head off kills me at full health; shield, plate, a stale life, creative, a far attacker stop it', () => {
    const mk = (opts = {}) => {
        const game = fakeGame();
        game.character.setIdlePose();
        game.character.group.updateMatrixWorld(true);
        game.remotes.set('enemy', { position: new THREE.Vector3(opts.far ? 20 : 2, 1.5, 0), character: new VoxelCharacter(game.scene), name: 'Враг' });
        game.sync.weaponOwners.set('w1', 'enemy');
        if (opts.shield) game.gear = { shieldFaces: () => true, shieldTook() { game.shieldTook = true; } };
        if (opts.plate) game.character.look = { top: 5 };
        if (opts.creative) game.config.mode = 'creative';
        return game;
    };
    const head = { limb: 'head', d: 0, n: [0, 1, 0], v: [5, 0, 0], lf: 0 };
    const g1 = mk();
    assert.ok(g1.dismember.receiveCut('enemy', { ...head }));
    assert.equal(g1.combat.how, 'decap');
    assert.equal(g1.character.head.visible, false);
    for (const o of [{ shield: true }, { plate: true }, { creative: true }, { far: true }]) {
        const g = mk(o);
        assert.equal(g.dismember.receiveCut('enemy', { ...head }), false, JSON.stringify(o));
        assert.equal(g.character.head.visible, true);
    }
    const g2 = mk();
    assert.equal(g2.dismember.receiveCut('enemy', { ...head, lf: 1 }), false, 'aimed at my previous life');
});

test('victim: an arm off drops what it held and bleeds; a leg off — I fall, then hop slowly; respawn makes me whole', () => {
    const game = fakeGame();
    const ch = game.character;
    ch.setIdlePose(); ch.group.updateMatrixWorld(true);
    game.remotes.set('enemy', { position: new THREE.Vector3(2, 1.5, 0), character: new VoxelCharacter(game.scene), name: 'Враг' });
    game.sync.weaponOwners.set('w1', 'enemy');
    const released = [];
    game.weapons.release = (side) => released.push(side);
    game.lastMagicHand = 'left';
    assert.ok(game.dismember.receiveCut('enemy', { limb: 'leftArm', d: 0.6, n: [0, 0, 1], v: [5, 0, 0], lf: 0 }));
    assert.deepEqual(released, ['left']);
    assert.equal(game.bleeds[0].r, 1);
    assert.match(game.bleeds[0].text, /левую руку/);
    assert.equal(game.lastMagicHand, 'right');
    const limbMsg = game.sent.find((m) => m.t === 'dmlimb');
    assert.equal(parseSever(limbMsg.sv).limb, 'leftArm');
    assert.equal(limbMsg.k1, 1, 'a fresh cut (others get the piece too)');
    assert.equal(game.dismember.props.length, 1);
    // the leg
    assert.ok(game.dismember.receiveCut('enemy', { limb: 'rightLeg', d: 1.0, n: [0, -1, 0], v: [5, 0, 0], lf: 0 }));
    assert.equal(ch.knockedDown, true);
    near(game.stuns[0].s, FALL_TIME, 1e-9);
    assert.equal(game.stuns[0].k, 'fall');
    assert.equal(ch.limbSpeed, 0.4);
    assert.equal(ch.canRun, false);
    assert.equal(game.bleeds[1].r, 1.5);
    // respawn
    game.dismember.resetLocal();
    assert.equal(game.dismember.life, 1);
    assert.deepEqual(ch.limbs, {});
    assert.equal(ch.leftElbowAnchor.visible, true);
    assert.equal(ch.limbSpeed, 1);
    const leg = ch.rightLegPivot.children.find((o) => o.isMesh);
    leg.geometry.computeBoundingBox();
    near(leg.geometry.boundingBox.max.y - leg.geometry.boundingBox.min.y, 1.95, 1e-6);
    assert.ok(game.sent.some((m) => m.t === 'dmst' && m.lf === 1 && m.st.length === 0), 'everybody is told');
});

test('the others: a dmlimb draws the stump and the piece; a dmst brings a late joiner up to date', () => {
    const game = fakeGame({ authority: false });
    const chB = new VoxelCharacter(game.scene);
    chB.setIdlePose(); chB.group.position.set(0, 1.5, 0); chB.group.updateMatrixWorld(true);
    chB.setShowHands(true);
    game.remotes.set('B', { character: chB, position: chB.group.position, name: 'B' });
    game.dismember.onNet({ t: 'dmlimb', k: 'p', id: 'B', sv: packSever({ limb: 'leftArm', d: 0.5, n: [0, 0, 1], v: [4, 0, 0], lf: 0 }), att: 'A', k1: 1 });
    assert.equal(chB.limbs.leftArm, 0.5);
    assert.equal(chB.leftElbowAnchor.visible, false);
    assert.equal(chB.leftSimplifiedHand.group.visible, false);
    assert.equal(game.dismember.props.length, 1);
    assert.ok(game.voice.some((v) => /Вы отрубили левую руку/.test(v)));
    const late = fakeGame({ authority: false });
    const chL = new VoxelCharacter(late.scene);
    late.remotes.set('B', { character: chL, position: chL.group.position, name: 'B' });
    late.dismember.onNet({ t: 'dmst', k: 'p', id: 'B', st: [[1, 0.5]], lf: 2 });
    assert.equal(chL.limbs.leftArm, 0.5);
    assert.equal(late.dismember.props.length, 0, 'no piece for a cut never seen');
    assert.equal(late.dismember.remoteLife.get('B'), 2);
    late.dismember.onNet({ t: 'dmst', k: 'p', id: 'B', st: [], lf: 3 });
    assert.equal(chL.leftElbowAnchor.visible, true, 'whole again after their respawn');
});

test('a severed part falls, comes to rest on the ground and is gone after a while', () => {
    const game = fakeGame();
    const ch = hero();
    const r = cutLimb(ch, characterBody(ch), 'leftLeg', 0.5);
    const d = game.dismember;
    d._spawnPiece(r.piece, { limb: 'leftLeg', v: [3, 0, 0] });
    const p = d.props[0];
    for (let i = 0; i < 60 * 6; i++) d.update(1 / 60);
    assert.ok(p.sleeping, 'at rest');
    const gy = game.collision.groundY(p.position.x, p.position.z);
    const box = new THREE.Box3().setFromObject(p.obj);
    assert.ok(box.min.y > gy - 0.1 && box.min.y < gy + 0.3, `on the ground (${box.min.y} vs ${gy})`);
    for (let i = 0; i < 130; i++) d.update(1);
    assert.equal(d.props.length, 0);
});
