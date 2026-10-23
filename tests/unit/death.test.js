import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { villagerLook } from '../../src/entities/VillagerModel.js';
import { DEATH, bodyStage, lootOfPlayer, lootOfVillager, dropSpot, skeletonModel, layDown, DeathSystem } from '../../src/game/Death.js';

test('death: the body lies, then bones for 20 minutes, then nothing', () => {
    assert.equal(bodyStage(0), 'body');
    assert.equal(bodyStage(DEATH.BODY_S - 1), 'body');
    assert.equal(bodyStage(DEATH.BODY_S + 1), 'bones');
    assert.equal(DEATH.BONES_S, 20 * 60);
    assert.equal(bodyStage(DEATH.BODY_S + DEATH.BONES_S - 1), 'bones');
    assert.equal(bodyStage(DEATH.BODY_S + DEATH.BONES_S + 1), 'gone');
});

test('death: everything a player carries drops — slots, hands, backpack; blocks as a heap; creative stacks never', () => {
    const wand = { kind: 'wand', uid: 'w1', plain: false };
    const sword = { kind: 'weapon', type: 'sword', id: 'sw1', magic: true, bonus: 20 };
    const coins = { kind: 'coins', uid: 'c1', count: 120 };
    const stone = { kind: 'res', block: 1, count: 37 };
    const bp = { kind: 'backpack', uid: 'b1', slots: 4 };
    const scroll = { kind: 'scroll', uid: 's1', stat: 'flight' };
    const out = lootOfPlayer({ slots: [sword, null, coins, stone, scroll, { kind: 'res', block: 6, count: 100, endless: true }], held: [wand], backpack: bp });
    const kinds = out.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ['backpack', 'blocks', 'coins', 'scroll', 'wand', 'weapon']);
    const heap = out.find((d) => d.kind === 'blocks');
    assert.equal(heap.block, 1);
    assert.equal(heap.count, 37);
    assert.ok(heap.uid, 'a world item has a uid');
    assert.equal(out.find((d) => d.kind === 'weapon'), sword, 'the weapon keeps its id and magic');
    assert.deepEqual(lootOfPlayer({}), []);
});

test('death: a knight drops his sword, shield and coins; the king a magic sword and more coins; a farmer nothing', () => {
    const k = lootOfVillager('knight', { shield: true }, () => 0);
    assert.deepEqual(k.map((d) => d.kind), ['weapon', 'shield', 'coins']);
    assert.equal(k[0].type, 'sword');
    assert.ok(k[2].count >= DEATH.KNIGHT_COINS[0]);
    const noShield = lootOfVillager('knight', { shield: false }, () => 0.99);
    assert.deepEqual(noShield.map((d) => d.kind), ['weapon', 'coins']);
    assert.ok(noShield[1].count <= DEATH.KNIGHT_COINS[1]);
    const king = lootOfVillager('king', {}, () => 0.5);
    assert.ok(king[0].magic);
    assert.ok(king.find((d) => d.kind === 'coins').count >= DEATH.KING_COINS[0]);
    assert.deepEqual(lootOfVillager('farmer'), []);
});

test('death: the things fall around the body, close to it, not in one heap', () => {
    const n = 8;
    const spots = Array.from({ length: n }, (_, i) => dropSpot(i, n));
    for (const s of spots) assert.ok(Math.hypot(s.x, s.z) <= DEATH.SPREAD + 1e-9 && Math.hypot(s.x, s.z) > 0.3);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > 0.3);
    assert.deepEqual(dropSpot(0, 1), { x: 0, z: 0 });
});

test('death: a body is laid down flat on the ground (feet at y 0), the skeleton lies flat too', () => {
    const standing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.5));
    standing.position.y = 1.5;
    const { pivot, len } = layDown(standing);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    assert.ok(Math.abs(box.min.y) < 1e-6, 'on the ground');
    assert.ok(box.max.y < 0.6, `flat (${box.max.y})`);
    assert.ok(Math.abs(len - 3) < 1e-6, 'as long as it was tall');
    const sk = skeletonModel();
    const sb = new THREE.Box3().setFromObject(sk);
    assert.ok(sb.max.y < 0.5 && sb.max.z - sb.min.z > 2.5);
});

test('death: the hooks of other features run on death and respawn; creative keeps the things', () => {
    const calls = [];
    const game = {
        config: { mode: 'creative' }, character: { group: new THREE.Group() }, scene: null,
    };
    const d = new DeathSystem(game);
    game.onDeath.push((info) => calls.push(['death', info.byId]));
    game.onRespawn.push(() => calls.push(['respawn']));
    game.onDeath.push(() => { throw new Error('a broken hook'); }); // never stops the others
    d.playerDied('p2', 'x');
    d.respawned();
    assert.deepEqual(calls, [['death', 'p2'], ['respawn']]);
    assert.equal(d.bodies.size, 0, 'creative: no body, nothing dropped');
});

test('death: bodies age into bones and crumble; the list is saved and restored with their age', () => {
    const scene = new THREE.Scene();
    const game = { config: { mode: 'freeworld' }, scene, character: { group: new THREE.Group() }, remotes: new Map() };
    const d = new DeathSystem(game);
    d.makers.c = () => ({ pivot: new THREE.Group(), len: 2 });
    d.addBody({ id: 'c1', k: 'c', x: 1, y: 2, z: 3, yaw: 0.5, age: 0 });
    assert.ok(d.bodies.get('c1').model.parent === scene);
    d.update(DEATH.BODY_S + 1);
    const b = d.bodies.get('c1');
    assert.ok(!b.model && b.bones && b.bones.parent === scene, 'bones now');
    const saved = d.snapshot();
    assert.equal(saved[0].age, Math.round(DEATH.BODY_S + 1));
    const d2 = new DeathSystem({ ...game, scene: new THREE.Scene() });
    d2.restore(saved);
    d2.update(0.1);
    assert.ok(d2.bodies.get('c1').bones, 'restored as bones');
    d.update(DEATH.BONES_S);
    assert.equal(d.bodies.size, 0, 'crumbled');
    assert.ok(!b.bones.parent, 'gone from the world');
});

test('death: a killed wizard drops a pouch of coins by his rank (a wanderer by his own rank), no sword', () => {
    for (const [rank, role] of [['novice', 'student'], ['adept', 'student'], ['teacher', 'teacher'], ['elder', 'townwiz'], ['master', 'master'], ['adept', 'wanderer'], ['teacher', 'wanderer']]) {
        const [a, b] = DEATH.WIZ_COINS[rank];
        for (const r of [0, 0.5, 0.999]) {
            const out = lootOfVillager(role, { rank }, () => r);
            assert.deepEqual(out.map((d) => d.kind), ['coins'], `${role}/${rank}`);
            assert.ok(out[0].count >= a && out[0].count <= b, `${role}/${rank}: ${out[0].count} in ${a}..${b}`);
        }
    }
    assert.equal(lootOfVillager('master', { rank: 'master' }, () => 0)[0].count, 90);
    assert.equal(lootOfVillager('master', { rank: 'master' }, () => 0.9999)[0].count, 240);
});

test('death: the body of a killed wizard is made from his own look (robe, hat), not from a castle farmer', () => {
    const look = { ...villagerLook(12345, 'wanderer', false), magicRobe: true, rank: 'teacher' };
    const ds = new DeathSystem({ scene: new THREE.Scene(), castleLife: { castles: new Map(), _roster: () => ({ seed: 1, role: 'farmer', female: false }) } });
    const body = ds._villagerBody({ id: 'ww0_0:1', who: 'ww0_0:1', role: 'wanderer', look, st: 0 });
    assert.ok(body.pivot, 'a body is made');
    assert.equal(look.role, 'wanderer');
});
