// «Alive» at a grave: the dead rises (a skeleton) — not at once, and it is a living tree in
// principle (the same servant, concentration, mana, 15 HP), but «Авада» doesn't kill it and
// blades / fists break its bones.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LivingTrees, ALIVE } from '../../src/game/LivingTrees.js';
import { SKEL, skeletonDamage, skeletonModel, graveOnRay } from '../../src/game/Skeletons.js';
import { Servants } from '../../src/game/Servants.js';
import { DANGERS } from '../../src/game/Danger.js';
import { BLOCK } from '../../src/world/Terrain.js';

const GRAVE = { id: 'cs1_2_g0', x: 6, y: 0, z: 0.5, L: 1, yaw: Math.PI / 2, exit: { x: 6, z: -1 }, stone: { x: 6, z: 2 }, cells: [[6, 0], [6, 1]] };

function fakeGame({ mode = 'creative', mana = 30 } = {}) {
    const said = [], alarms = [], edits = [];
    const blocks = new Map([['6,1,0', BLOCK.DIRT], ['6,1,1', BLOCK.DIRT]]);
    const data = { get: (x, L, z) => blocks.get(`${x},${L},${z}`) ?? 0, set: (x, L, z, t) => blocks.set(`${x},${L},${z}`, t) };
    const g = {
        config: { mode }, authority: true, localId: 'me', scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        character: { group: { position: new THREE.Vector3(0, 2, 0) } },
        hud: { setVoice: (t) => said.push(t), toast: (t) => said.push(t), setFatigue() {}, hidePvp() {} },
        fx: { spark() {}, debris: { spawn() {} } },
        collision: { groundY: () => 0, resolveCylinder() {} },
        combat: { fatigue: mana, maxFatigue: 30, enabled: false, costOf: () => 25, check: () => null },
        terrain: { data },
        builder: { data, _hand: () => ({ side: 'right', o: new THREE.Vector3(0, 1.5, 0.5), d: new THREE.Vector3(6, -1.5, 0).normalize() }), _treeOnRay: () => null, _hitCell: () => null, _sendEdits: (l) => edits.push(...l) },
        castleLife: { byId: new Map(), index: { near: () => [{ id: 'cs1_2', graves: [GRAVE] }] }, alarm: (pos, kind, by) => alarms.push([kind, by]), witnessCast() {} },
        said, alarms, edits, blocks,
    };
    g.servants = new Servants(g);
    g.livingTrees = new LivingTrees(g);
    return g;
}
const run = (g, s, dt = 0.05) => { for (let t = 0; t < s; t += dt) g.livingTrees.update(dt); };

test('«Alive» at a grave: it shakes, a hand comes up, the earth bursts open (dug), the skeleton climbs out', () => {
    const g = fakeGame();
    assert.ok(graveOnRay(g.castleLife.index, new THREE.Vector3(0, 1.5, 0.5), new THREE.Vector3(6, -1.5, 0).normalize()), 'the hand finds the grave');
    // a hand raised to cast (forward and 30° up), from 20 m: still that grave (the author had to stand too close)
    const far = { near: () => [{ id: 'cs1_2', graves: [{ ...GRAVE, x: GRAVE.x + 20 }] }] };
    assert.ok(graveOnRay(far, new THREE.Vector3(GRAVE.x, 1.5, GRAVE.z), new THREE.Vector3(Math.cos(0.52), Math.sin(0.52), 0)), 'raised hand, 20 m');
    assert.equal(graveOnRay(far, new THREE.Vector3(GRAVE.x, 1.5, GRAVE.z), new THREE.Vector3(0, 0, 1)), null, 'pointing elsewhere: none');
    assert.equal(graveOnRay(far, new THREE.Vector3(GRAVE.x, 1.5, GRAVE.z), new THREE.Vector3(0.05, 1, 0).normalize()), null, 'pointing at the sky: none');
    assert.equal(g.livingTrees.cast(true), 'Alive');
    const t = g.livingTrees.list[0];
    assert.ok(t.skel && t.isLivingTree, 'a skeleton — a living tree in principle');
    assert.equal(t.hp, ALIVE.HP);
    assert.deepEqual(g.alarms[0], ['undead', 'me'], 'the village takes fright');
    assert.ok(DANGERS.undead?.ru);
    run(g, SKEL.RISE * SKEL.OPEN - 0.3);
    assert.equal(t.phase, 'rise');
    assert.ok(t.model.userData.rig.position.y < -1, 'still under the earth (a hand at most)');
    assert.equal(g.blocks.get('6,1,0'), BLOCK.DIRT, 'not open yet');
    run(g, 0.6);
    assert.equal(g.blocks.get('6,1,0'), BLOCK.AIR, 'the earth bursts open: the grave is dug');
    assert.ok(g.edits.length >= 2, 'sent to everyone (and saved with the world)');
    run(g, SKEL.RISE);
    assert.equal(t.phase, 'alive');
    assert.ok(Math.abs(t.model.position.z - GRAVE.exit.z) < 0.6, 'climbed out to the foot of the grave');
    assert.ok(Math.abs(t.model.userData.rig.position.y) < 0.05, 'standing on the ground');
    // the grave is empty now
    g.livingTrees._last = 0;
    assert.equal(g.livingTrees.stopMine(), true);
    run(g, 6);
    assert.equal(g.livingTrees.list.length, 0, 'the magic left: it fell into its bones');
    g.livingTrees._last = 0;
    assert.equal(g.livingTrees.cast(true), null);
    assert.match(g.said.at(-1), /разрыта/);
});

test('who / what hurts a skeleton: no duel charge («Авада» too); fire, Бомбардо, lightning, blades and fists do', () => {
    for (const k of ['AvadaKedavra', 'Stupefy', 'Sapira', 'SapiraDuel', 'Expelliarmus', 'Liquidation', null]) assert.equal(skeletonDamage(k, 99), 0, String(k));
    for (const k of ['Inferno', 'FireMaxima', 'campfire', 'Bombardo', 'BombardoMaxima', 'Lightning', 'TotalDestruction', 'melee', 'fist', 'tree']) assert.equal(skeletonDamage(k, 5), 5, k);
    const g = fakeGame();
    const t = g.livingTrees.spawn({ skel: 1, gid: GRAVE.id, x: 6, y: 0, z: 0.5, ex: 6, ez: -1, ry: 0 }, 'me');
    run(g, SKEL.RISE + 0.2);
    g.livingTrees._saidAt = -1e9;
    g.livingTrees.hit(t, 999, 'AvadaKedavra');
    assert.equal(t.hp, 15);
    assert.match(g.said.at(-1), /не совсем живой/);
    g.livingTrees.hit(t, 6, 'melee');
    assert.equal(t.hp, 9, 'a blade breaks bones');
    g.livingTrees.hit(t, 3, 'Inferno');
    assert.ok(t.burnT > 0, 'it burns');
    g.livingTrees.hit(t, 8, 'Bombardo');
    assert.equal(t.phase, 'fall', 'knocked apart into its bones');
    run(g, SKEL.COLLAPSE + 0.2);
    assert.equal(g.livingTrees.list.length, 0);
});

test('the skeleton: concentration as the tree (mine, «стоп»), the host\'s copy reaches a guest', () => {
    const g = fakeGame();
    const t = g.livingTrees.spawn({ skel: 1, gid: GRAVE.id, x: 6, y: 0, z: 0.5, ex: 6, ez: -1, ry: 0 }, 'me');
    assert.deepEqual(g.livingTrees.mine(), [t], 'held by concentration (Concentration.js: «Alive»)');
    let sent = null;
    g.sync = { livingTrees: (l) => { sent = l; } };
    run(g, 0.2);
    const guest = fakeGame();
    guest.authority = false; guest.localId = 'other';
    guest.livingTrees.applyNet(sent);
    const c = guest.livingTrees.list[0];
    assert.ok(c.skel && c.d.gid === GRAVE.id, 'a guest sees the skeleton too');
    const m = skeletonModel();
    const u = m.userData;
    assert.equal(u.arms.length, 2);
    assert.equal(u.legs.length, 2);
    assert.ok(u.head && u.mouth && u.glow && u.knees.length === 2);
});

test('«Alive Maxima»: heard, twice the mana, the whole graveyard rises, each drains 1 mana a second', async () => {
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    const { SPELL_COST } = await import('../../src/game/Combat.js');
    const { aliveRate } = await import('../../src/game/LivingTrees.js');
    for (const w of ['alive maxima', 'алайв максима', 'элайв максима']) assert.equal(matchSpell(w), 'AliveMaxima', w);
    assert.equal(matchSpell('алайв'), 'Alive');
    assert.equal(SPELL_COST.AliveMaxima, SPELL_COST.Alive * 2);
    const g = fakeGame({ mode: 'freeworld', mana: 30 });
    g.combat.costOf = (n) => SPELL_COST[n];
    const G2 = { ...GRAVE, id: 'cs1_2_g1', x: 8, cells: [[8, 0], [8, 1]], exit: { x: 8, z: -1 } };
    g.blocks.set('8,1,0', BLOCK.DIRT); g.blocks.set('8,1,1', BLOCK.DIRT);
    g.castleLife.index.near = () => [{ id: 'cs1_2', graves: [GRAVE, G2] }];
    g.combat.fatigue = 60; g.combat.maxFatigue = 60;
    assert.equal(g.livingTrees.cast(true, true), 'AliveMaxima');
    assert.equal(g.combat.fatigue, 10, '50 mana');
    assert.equal(g.livingTrees.list.length, 2, 'every closed grave');
    assert.equal(aliveRate(g.livingTrees.mine()), 2, '1 mana a second each');
    assert.equal(aliveRate([{ d: {} }]), 0.5, 'plain «Alive»: as before');
    run(g, 2);
    assert.ok(Math.abs(g.combat.fatigue - 6) < 0.1, `drained 2/s (${g.combat.fatigue})`);
    run(g, 4);
    assert.ok(g.livingTrees.list.every((t) => t.phase !== 'rise' && t.phase !== 'alive'), 'mana gone: they all let go');
});

test('«Alive Maxima» in a wood: the trees round the one pointed at come alive too (up to 6, within 14 m)', async () => {
    const { TREE_KINDS } = await import('../../src/world/Terrain.js');
    const g = fakeGame();
    const W = TREE_KINDS[0].wood;
    const trunks = [[6, 0], [10, 4], [3, -8], [12, -6], [30, 0], [6, 9], [-6, 6], [0, 13]];
    for (const [x, z] of trunks) for (let L = 1; L <= 4; L++) g.blocks.set(`${x},${L},${z}`, W);
    const aim = { cell: { x: 6, L: 2, z: 0, type: W }, kind: 0, dist: 6 };
    const round = g.livingTrees._treesRound(aim);
    assert.equal(round.length, 5, 'the nearest ones, 6 with the one pointed at');
    assert.ok(round.every((r) => Math.hypot(r.cell.x - 6, r.cell.z) <= 14), 'within 14 m');
    assert.ok(!round.some((r) => r.cell.x === 30), 'not the far one');
    assert.ok(round.every((r) => r.cell.L === 1), 'found by the foot of the trunk');
});
