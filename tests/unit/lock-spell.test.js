// «Lock»: the words (a whole phrase only), its cost, on whom and on what it acts; a door shut by it
// in real hands (it swings shut, the hand can't open it), the people knock and go round it,
// «Алохомора» opens it again; it is saved and shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Alohomora, LOCK_TARGETS, isLockWord } from '../../src/game/Alohomora.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { Doors } from '../../src/game/Doors.js';
import { CastleLife } from '../../src/game/CastleLife.js';

test('«Lock» as the recognizer hears it — and never a word in talk', () => {
    for (const s of ['Lock', 'lock', 'Лок', 'лок', 'Lock door', 'lock the door', 'Лок дор', 'лок зе дор', 'лок лок', 'лак дор']) assert.equal(matchSpell(s), 'Lock', s);
    for (const s of ['блок', 'локоть', 'закрой на лок пожалуйста', 'лак', 'локация', 'block', 'lockpick', 'ну лок это слово такое']) assert.notEqual(matchSpell(s), 'Lock', s);
    assert.equal(matchSpell('Create a Door'), 'CreateDoor');
    assert.equal(matchSpell('Алохомора'), 'Alohomora');
    assert.ok(isLockWord('LOCK!'));
});

test('cost: a little mana; on whom and on what: decided for every creature and thing (and said why)', () => {
    assert.equal(SPELL_COST.Lock, 3);
    for (const k of ['villagerDoor', 'wizardDoor', 'playerDoor', 'throneGate', 'castleDoor', 'shipHatch', 'chests', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragon', 'phoenix', 'livingTrees', 'bookBirds', 'world']) {
        assert.ok(LOCK_TARGETS[k]?.why?.length > 10, k);
    }
    for (const k of ['players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragon', 'livingTrees', 'bookBirds', 'world']) assert.equal(LOCK_TARGETS[k].does, 'none', k);
    assert.equal(LOCK_TARGETS.villagerDoor.does, 'lock');
});

/** A small game: one open door in front of me, the hand pointing at it; the real Doors and locks. */
function lockGame() {
    const scene = new THREE.Scene();
    let boxes = 0;
    const sent = [];
    const game = {
        scene, currentPose: {}, isDeadLocal: false, authority: true, localId: 'me',
        character: {
            group: { position: new THREE.Vector3(0, 1.95, 4) }, getActiveHands: () => ({}),
            getHandWorldPosition: (side, out) => out.set(0.6, 1.6, 2.5),
            getHandDirection: (side, out) => out.set(0, 0, -1),
        },
        wandSide: () => 'right',
        collision: { addBox: () => ++boxes, removeBox: () => {} },
        combat: { check: () => null, pay() {} },
        hud: { setVoice(t) { this.last = t; } },
        sync: { net: { send: (m) => sent.push(m) }, doorAngle() {} },
    };
    const D = game.doors = new Doors(game);
    game.locks = new Alohomora(game);
    D._place({ id: 'd1', x: 0, y: 0, z: 0, ry: 0, color: 0x7a4f2a, a: 1.2 });
    const hands = { left: null, right: null };
    D.input = (side) => hands[side];
    const door = D.list.get('d1');
    door.model.updateMatrixWorld(true);
    return { game, D, door, hands, sent };
}

test('«Lock» at an open door: it swings shut and locks; the hand can\'t open it; «Алохомора» opens it again', () => {
    const { game, D, door, hands, sent } = lockGame();
    assert.equal(game.locks.castLock(true), 'Lock');
    assert.equal(sent.at(-1).k, 'shut');
    assert.ok(game.locks.doorLocked(door), 'locked at once');
    for (let i = 0; i < 60; i++) game.locks.update(0.05);
    assert.equal(door.a, 0, 'shut tight');
    assert.ok(door.boxId != null, 'nobody walks through it');
    // the hand takes the handle and pulls: the leaf only rattles
    door.model.updateMatrixWorld(true);
    const k = door.model.userData.knob.getWorldPosition(new THREE.Vector3());
    hands.right = { G: k.clone(), curl: 0.1 };
    D.update(0.016);
    hands.right = { G: k.clone(), curl: 0.8 };
    D.update(0.016);
    hands.right = { G: k.clone().add(new THREE.Vector3(-0.2, 0, -0.35)), curl: 0.8 };
    for (let i = 0; i < 5; i++) D.update(0.05);
    assert.equal(door.a, 0, 'the hand can\'t open it');
    // a push of a spell neither
    assert.equal(D.impulse(door, new THREE.Vector3(0, 0, -5)), false);
    hands.right = null; D.releaseAll();
    // said again: already locked
    assert.equal(game.locks.castLock(true), null);
    // «Алохомора»: unlocked, a crack open
    assert.equal(game.locks.cast('Alohomora', true), 'Alohomora');
    assert.equal(sent.at(-1).k, 'unlock');
    assert.ok(!game.locks.doorLocked(door), 'unlocked');
    assert.ok(door.a >= 0.2, 'a crack open');
});

test('«Lock» is not instant-cast while being said (a short word — the whole phrase)', () => {
    const { game } = lockGame();
    assert.equal(game.locks.castLock(false), null);
});

test('saved and shared: the locked door stays locked for whoever loads the world / joins', () => {
    const a = lockGame();
    a.game.locks.castLock(true);
    const snap = JSON.parse(JSON.stringify(a.game.locks.snapshot()));
    const b = lockGame();
    b.game.locks.restore(snap);
    assert.ok(b.game.locks.doorLocked(b.door));
    for (let i = 0; i < 60; i++) b.game.locks.update(0.05);
    assert.equal(b.door.a, 0);
    // a message from another player: the same
    const c = lockGame();
    c.game.locks.applyNet({ t: 'lock', k: 'shut', ids: ['d1'], by: 'p2' });
    assert.ok(c.game.locks.doorLocked(c.door));
    c.game.locks.applyNet({ t: 'lock', k: 'unlock', ids: ['d1'], by: 'p2' });
    assert.ok(!c.game.locks.doorLocked(c.door));
});

test('a villager walking through the doorway stops at the locked door, knocks, then gives the way up', () => {
    const { game, door } = lockGame();
    game.locks.apply({ k: 'shut', ids: ['d1'] });
    for (let i = 0; i < 60; i++) game.locks.update(0.05);
    assert.equal(door.a, 0);
    assert.ok(game.locks.blocksAt(0, 0, 0), 'the doorway is shut');
    assert.ok(!game.locks.blocksAt(3, 0, 0), 'beside it is free');
    const life = Object.create(CastleLife.prototype);
    life.game = game;
    life._walkable = () => true;
    const v = { id: 'v1', x: 0, y: 0, z: 2, yaw: 0, role: 'villager', cs: { graph: { nodes: [{ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -3 }] } }, path: [0, 1], pathI: 1 };
    let gaveUp = false;
    for (let i = 0; i < 300 && !gaveUp; i++) gaveUp = life._followPath(v, 0.05, 2);
    assert.ok(v.z > 0.3, `never through the door (z ${v.z.toFixed(2)})`);
    assert.ok(gaveUp && v.path === null, 'went another way');
    // unlocked: the doorway is free again
    game.locks.apply({ k: 'unlock', ids: ['d1'] });
    assert.ok(!game.locks.blocksAt(0, 0, 0));
});
