/**
 * A sword and an axe cut off a part of EVERY creature where a real swing took the edge through it
 * (CLAUDE.md: «персонажи — все существа»): the training dummy (25 % bigger) and a plain zombie,
 * another player, villagers (a farmer, a wizard, a knight — whose armour stops the blade until it
 * is beaten off), sailors, animals, the giant spider, a living tree's branch arms.
 * Each case: the hand carries the blade edge-on through the part at a fighting speed (the weapon
 * follows the hand through its physics, WeaponSystem.checkHits → Dismember).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { Zombie, DUMMY_HEALTH } from '../../src/entities/Zombie.js';
import { animalModel } from '../../src/game/Animals.js';
import { spiderModel, spiderBody } from '../../src/game/Spider.js';
import { livingTreeModel } from '../../src/game/LivingTrees.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { WeaponSystem } from '../../src/game/Weapons.js';
import { boneLines } from '../../src/game/CutBodies.js';
import { Dismemberment, parseSever } from '../../src/game/Dismember.js';

function fakeGame() {
    const scene = new THREE.Scene();
    const c = new CollisionWorld();
    const character = new VoxelCharacter(scene);
    character.group.position.set(-30, 1.5, 0);
    let t = 1000;
    const sent = [], died = [];
    const game = {
        headless: true, scene, renderer: null, world: { collision: c }, collision: c, character, localId: 'A', authority: true,
        config: { mode: 'creative' }, remotes: new Map(), now: () => t, advance: (ms) => { t += ms; },
        fx: { blood() {}, spark() {} }, hud: { setVoice() {}, setStatus() {} },
        sync: { net: { send: (m) => sent.push(m) }, weaponOwners: new Map() }, bleeding: { start() {}, remote: new Map() },
        castleLife: { hit: (v, d, dir, by, o) => { if (o?.pierce) { v.dead = true; died.push(v); } } },
        ships: { crew: { hit: (v, d, dir, by, o) => { if (o?.pierce) { v.dead = true; died.push(v); } } } },
        animals: { _die: (a) => { a.dead = true; died.push(a); } },
        livingTrees: { onCut() {} },
        damageZombie: (z, dmg) => z.takeDamage(dmg, true),
        sent, died,
    };
    game.combat = { enabled: true };
    game.weapons = new WeaponSystem(game);
    game.dismember = new Dismemberment(game);
    return game;
}

const V = (a) => new THREE.Vector3().fromArray(a);

/**
 * Swing `type` through `limb` of target (at `frac` along its bone, `seg`-th bone of it) at `speed` m/s.
 * Vertical bones (legs, hanging arms, necks) get a level slash from outside in; level bones (a
 * zombie's arms held out) a chop from above. The edge leads, the hand carries the blade.
 */
function swing(game, target, limb, { type = 'sword', speed = 14, frac = 0.5, seg = 0, live = false } = {}) {
    const who = game.dismember.which(target);
    assert.ok(who, 'the blade knows this creature');
    const L = boneLines(who.body).filter((l) => l.limb === limb)[seg];
    assert.ok(L, 'it has a ' + limb);
    const A = V(L.a), B = V(L.b), D = B.clone().sub(A).normalize();
    const P = A.clone().lerp(B, frac);
    const centre = (target.group || target.model).getWorldPosition(new THREE.Vector3());
    let M;
    if (Math.abs(D.y) > 0.7) {
        M = centre.clone().sub(P).setY(0);
        if (M.length() < 0.1) M.set(1, 0, 0); // (the neck: across)
    } else M = new THREE.Vector3(0, -1, 0);
    M.addScaledVector(D, -M.dot(D)).normalize();
    const Bd = new THREE.Vector3().crossVectors(D, M).normalize();
    if (Bd.dot(centre.clone().sub(P)) < 0) Bd.negate(); // (the hilt outside the body)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(M, Bd, new THREE.Vector3().crossVectors(M, Bd)));
    const w = game.weapons.spawn(type, new THREE.Vector3(), q);
    w.quaternion.copy(q);
    const off = (type === 'axe' ? w.modelToWorld(0.37, 0.74, 0, new THREE.Vector3()) : w.modelToWorld(0, 1.1, 0, new THREE.Vector3())).sub(w.position);
    const at = (k) => P.clone().sub(off).addScaledVector(M, k);
    w.position.copy(at(-1.6));
    w.attach({ playerId: 'A', side: 'right' });
    const ws = game.weapons;
    ws.hands.right.held = w;
    w.drive.position.copy(w.position); w.drive.quaternion.copy(q);
    ws.frame = ws.frame || 1;
    const n = Math.round(3.2 / (speed / 60)) + 20;
    for (let i = 0; i < n; i++) {
        ws.frame++; game.advance(1000 / 60);
        w.drive.position.copy(at(Math.min(1.6, -1.6 + (speed / 60) * (i + 1))));
        w.step(1 / 60, null);
        ws.checkHits([target], 1 / 60);
        if (live) { target.update(1 / 60, null, null, game.collision); target.group.updateMatrixWorld(true); }
        else target.damageCooldown = 0;
    }
    ws.hands.right.held = null;
    ws.remove?.(w);
    const root = who.body.root;
    const sent = game.sent.filter((m) => m.t === 'dmcut' && m.k === 'p').map((m) => parseSever(m.sv).limb);
    return { limbs: root.limbs || {}, sent };
}

const cutOff = (r, limb) => r.limbs[limb] != null || r.sent.includes(limb);

// ------------------------------------------------------------ creatures
function zombie(game, dummy) {
    const z = new Zombie(game.scene, new THREE.Vector3(0, 1.5, 0), dummy ? 1 : 2, {});
    if (dummy) z.setDummy();
    z.group.updateMatrixWorld(true);
    return z;
}
function player(game, armour = null) {
    const ch = new VoxelCharacter(game.scene);
    ch.setIdlePose(); ch.group.position.set(0, 1.5, 0); ch.group.updateMatrixWorld(true);
    if (armour) ch.armorWorn = armour;
    game.remotes.set('B', { character: ch, position: ch.group.position, name: 'B' });
    return { isPlayer: true, id: 'B', group: ch.group, damageCooldown: 0, isDead: false };
}
function villager(game, role, extra = {}) {
    const m = new VillagerModel(villagerLook(7, role, false), {});
    game.scene.add(m.group);
    m.group.position.set(0, 0, 0);
    m.group.updateMatrixWorld(true);
    return { id: role + '1', role, model: m, group: m.group, isVillager: true, hp: 20, armor: 0, dead: false, get isDead() { return this.dead; }, damageCooldown: 0, ...extra };
}
function sailor(game) {
    const m = new VillagerModel(villagerLook(9, 'builder', false), { tool: 'sword' });
    game.scene.add(m.group);
    m.group.updateMatrixWorld(true);
    return { id: 'ship1:c2', role: 'sailor', model: m, group: m.group, isSailor: true, hp: 10, armor: 0, dead: false, get isDead() { return this.dead; }, damageCooldown: 0, stunT: 0 };
}
function animal(game, type) {
    const model = animalModel(type);
    game.scene.add(model);
    model.updateMatrixWorld(true);
    return { id: 'an-' + type, type, model, group: model, isAnimal: true, hp: 10, dead: false, get isDead() { return this.dead; }, damageCooldown: 0 };
}
function spider(game) {
    const model = spiderModel();
    game.scene.add(model);
    model.updateMatrixWorld(true);
    const s = { id: 7, model, group: model, isBoss: true, dead: false, get isDead() { return this.dead; }, damageCooldown: 0 };
    s.bodyCapsule = (out) => spiderBody(s, out); // (as Spiders gives it: its big body)
    return s;
}
function tree(game) {
    const model = livingTreeModel({ h: 10 });
    for (const a of model.userData.arms) a.sh.rotation.z = a.side * 0.35; // (alive: the branch arms out a little)
    game.scene.add(model);
    model.updateMatrixWorld(true);
    return { id: 'h:1', model, group: model, isLivingTree: true, phase: 'alive', hp: 100, get isDead() { return false; }, damageCooldown: 0 };
}

// ------------------------------------------------------------ the checks
for (const type of ['sword', 'axe']) {
    test(`${type}: the training dummy (25 % bigger) and a plain zombie lose the head, an arm, a leg where the edge went`, () => {
        for (const dummy of [true, false]) {
            for (const limb of ['head', 'leftArm', 'rightLeg']) {
                const g = fakeGame();
                const z = zombie(g, dummy);
                const r = swing(g, z, limb, { type });
                assert.ok(cutOff(r, limb), `${dummy ? 'dummy' : 'zombie'} ${limb}: ${JSON.stringify(r.limbs)}`);
                if (limb === 'head') assert.ok(z.isDead, 'the head off: it is dead');
            }
        }
    });

    test(`${type}: another player — the cut goes to their computer; their worn armour stops it`, () => {
        for (const limb of ['head', 'leftArm', 'rightLeg']) {
            const g = fakeGame();
            const r = swing(g, player(g), limb, { type });
            assert.ok(cutOff(r, limb), `player ${limb}: ${JSON.stringify(r.sent)}`);
        }
        const g = fakeGame();
        const t = player(g, { helmet: 1, chest: 1, legs: 1, robe: 0 });
        for (const limb of ['head', 'leftArm', 'rightLeg']) assert.ok(!cutOff(swing(g, t, limb, { type }), limb), `the armour holds the ${limb}`);
    });

    test(`${type}: villagers and sailors; a knight's armour stops the blade until it is beaten off`, () => {
        const make = [(g) => villager(g, 'farmer'), (g) => villager(g, 'wizard'), (g) => villager(g, 'knight', { armor: 0 }), (g) => sailor(g)];
        for (const mk of make) {
            for (const limb of ['head', 'rightArm', 'leftLeg']) {
                const g = fakeGame();
                const v = mk(g);
                const r = swing(g, v, limb, { type });
                assert.ok(cutOff(r, limb), `${v.role} ${limb}: ${JSON.stringify(r.limbs)}`);
                if (limb === 'head') assert.ok(v.dead, `${v.role}: the head off — dead`);
            }
        }
        const g = fakeGame();
        const k = villager(g, 'knight', { armor: 50 });
        for (const limb of ['head', 'rightArm', 'leftLeg']) assert.ok(!cutOff(swing(g, k, limb, { type }), limb), `the knight's armour holds the ${limb}`);
    });

    test(`${type}: animals (head and legs), the giant spider's legs, a living tree's branch arms`, () => {
        for (const kind of ['horse', 'pig', 'cow', 'sheep']) {
            for (const limb of ['neck', 'leg0']) {
                const g = fakeGame();
                const a = animal(g, kind);
                const r = swing(g, a, limb, { type, seg: limb === 'leg0' ? 1 : 0, frac: limb === 'neck' ? 0.8 : 0.5 }); // (the neck: where the head meets the body)
                assert.ok(cutOff(r, limb), `${kind} ${limb}: ${JSON.stringify(r.limbs)}`);
            }
        }
        {
            const g = fakeGame();
            const s = spider(g);
            const r = swing(g, s, 'leg1', { type, seg: 1, speed: 18 });
            assert.ok(cutOff(r, 'leg1'), `spider: ${JSON.stringify(r.limbs)}`);
        }
        {
            const g = fakeGame();
            const t = tree(g);
            const r = swing(g, t, 'branch0', { type, seg: 1, speed: 18 });
            assert.ok(cutOff(r, 'branch0'), `tree: ${JSON.stringify(r.limbs)}`);
            let flesh = 0;
            t.model.traverse((o) => { if (o.isMesh && o.userData.stump && /^stump-/.test(o.material.name)) flesh++; });
            assert.equal(flesh, 0, 'the stump is wood, not flesh');
        }
    });
}

test('as in the game: every blow hurts and pushes the zombie, it lives between the frames — the edge still gets to the leg, the arm, the neck', () => {
    for (const type of ['sword', 'axe']) for (const dummy of [true, false]) for (const limb of ['rightLeg', 'leftArm', 'head']) {
        const g = fakeGame();
        const z = zombie(g, dummy);
        g.weapons.onHit = (t, dmg, dir) => g.damageZombie(t, dmg, dir);
        for (let i = 0; i < 60; i++) z.update(1 / 60, null, null, g.collision); // (it stands on the ground)
        z.group.updateMatrixWorld(true);
        const r = swing(g, z, limb, { type, live: true, frac: limb === 'leftArm' ? 0.8 : 0.5 }); // (the arm out in front: an axe's haft near the shoulder hits the skull first)
        assert.ok(cutOff(r, limb), `${type} → ${dummy ? 'dummy' : 'zombie'} ${limb}: ${JSON.stringify(r.limbs)} hp ${z.health}`);
    }
});

test('the flat or a slow hand cuts nothing (on the dummy too)', () => {
    const g = fakeGame();
    const z = zombie(g, true);
    assert.deepEqual(swing(g, z, 'leftArm', { speed: 2.5 }).limbs, {}, 'a slow chop');
});

test('the training dummy takes many blows (it is there to practise cutting) and is not knocked out of reach', () => {
    const g = fakeGame();
    const z = zombie(g, true);
    z.takeDamage(3, true, new THREE.Vector3(0, 0, -1), () => 0.5);
    assert.ok(z.velocity.length() < 1.5, `a blow rocks it, it doesn't fly off (${z.velocity.length().toFixed(1)} m/s)`);
    for (let i = 0; i < 8; i++) z.takeDamage(3, true, new THREE.Vector3(0, 0, -1), () => 0.5);
    assert.ok(!z.isDead, `9 sword blows: still standing (${z.health} of ${DUMMY_HEALTH})`);
    const plain = zombie(g, false);
    plain.takeDamage(3, true); plain.takeDamage(3, true);
    assert.ok(plain.isDead, 'a plain zombie falls after two blows, as before');
});

test('a sword held up by «Левиоса» and swung with the wrist cuts the dummy too (the spell holds it, no hand)', () => {
    const g = fakeGame();
    const z = zombie(g, true);
    const L = boneLines(g.dismember.which(z).body).find((l) => l.limb === 'leftArm');
    const P = V(L.a).lerp(V(L.b), 0.5);
    const w = g.weapons.spawn('sword', new THREE.Vector3(), new THREE.Quaternion());
    const M = new THREE.Vector3(0, -1, 0), Bd = new THREE.Vector3(1, 0, 0); // (a chop from above, the blade across the arm)
    w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(M, Bd, new THREE.Vector3().crossVectors(M, Bd)));
    const off = w.modelToWorld(0, 1.1, 0, new THREE.Vector3()).sub(w.position);
    g.levitation = { heldWeapon: () => w };
    const ws = g.weapons; ws.frame = 1;
    for (let i = 0; i < 40; i++) {
        ws.frame++; g.advance(1000 / 60);
        w.position.copy(P).sub(off).addScaledVector(M, -1.6 + 0.25 * i); // (the spell carries it: 15 m/s)
        ws.checkHits([z], 1 / 60);
        z.damageCooldown = 0;
    }
    assert.ok(z.limbs?.leftArm != null, 'the arm is off: ' + JSON.stringify(z.limbs));
});
