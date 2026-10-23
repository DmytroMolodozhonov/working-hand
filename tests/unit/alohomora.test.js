// «Алохомора»: the words (never cast by talk), its cost, on whom and on what it acts, the doors
// in real hands (the handle held by closed fingers, a locked one only rattles, a free hand pushes
// the leaf and never goes through it), the lid of an unlocked chest lifted by the hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Alohomora, alohomoraWords, TARGETS, chestKind, doorKind } from '../../src/game/Alohomora.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { Doors, hingeAngle, leafPushed, DOOR_HAND } from '../../src/game/Doors.js';
import { Chest, AJAR_ANGLE, CHEST_W, LID_LEN } from '../../src/entities/Chest.js';

test('«Алохомора» as the recognizer hears it; «…Максима» is the strong one', () => {
    for (const s of ['Алохомора', 'аллохомора', 'алахомора', 'аллахамора', 'алохамора', 'лохомора', 'Alohomora', 'alohamora', 'алло хомора', 'ну алохомора же']) {
        assert.equal(matchSpell(s), 'Alohomora', s);
    }
    for (const s of ['Алохомора Максима', 'аллахамора максима', 'alohomora maxima', 'алохомора макс']) assert.equal(matchSpell(s), 'AlohomoraMaxima', s);
});

test('talk never opens a lock: «Аллах», «хомяк», «мора», «хамон»', () => {
    for (const s of ['аллах акбар', 'у меня хомяк', 'мора', 'хамон вкусный', 'алло', 'море', 'хаос в доме', 'махровое полотенце']) {
        assert.equal(alohomoraWords(s), 0, s);
        assert.ok(!/^Alohomora/.test(matchSpell(s) || ''), s);
    }
    assert.equal(matchSpell('максима'), 'Maxima'); // («Максима» alone is still the water / duel word)
});

test('costs: 5 and 25 mana', () => {
    assert.equal(SPELL_COST.Alohomora, 5);
    assert.equal(SPELL_COST.AlohomoraMaxima, 25);
});

test('on whom and on what: every lock and every kind of creature is decided (and said why)', () => {
    for (const k of ['settlementChest', 'caveChest', 'shipChest', 'towerChest', 'villagerDoor', 'castleDoor', 'throneGate', 'playerDoor', 'wizardDoor',
        'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'world']) {
        assert.ok(TARGETS[k], k);
        assert.ok(TARGETS[k].why?.length > 10, `${k}: why`);
    }
    assert.equal(TARGETS.throneGate.plain, 'refuse');
    assert.equal(TARGETS.throneGate.maxima, 'unlock');
    assert.equal(TARGETS.settlementChest.plain, 'unlock');
    for (const k of ['players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds']) assert.equal(TARGETS[k].plain, 'none', k);
    assert.equal(chestKind({ house: { def: { kind: 'castle' } } }), 'settlementChest');
    assert.equal(chestKind({ castle: { kind: 'castle' } }), 'settlementChest');
    assert.equal(chestKind({ castle: { kind: 'tower' } }), 'towerChest');
    assert.equal(chestKind({ ship: {} }), 'shipChest');
    assert.equal(chestKind({}), 'caveChest');
    assert.equal(doorKind({ gate: true }), 'throneGate');
    assert.equal(doorKind({ gen: false }), 'playerDoor');
    assert.equal(doorKind({ gen: true }), 'villagerDoor');
});

test('the hinge: a hand round it opens / shuts the leaf; the frame and full opening stop it', () => {
    assert.ok(Math.abs(hingeAngle(1, 0)) < 1e-9);
    assert.ok(hingeAngle(0.7, -0.7) > 0.7); // (to the side it opens to: local −Z)
    assert.ok(Math.abs(hingeAngle(-0.7, -0.7, true) - Math.PI / 4) < 1e-9); // (a right-hinged leaf: mirrored)
    assert.equal(leafPushed(-1, 0.6, 0.2), 0.6); // from behind, pushed open
    assert.equal(leafPushed(1, 0.1, 0.5), 0.1); // from the front, pushed shut
    assert.equal(leafPushed(1, -0.4, 0.2), 0); // … the frame stops it
    assert.equal(leafPushed(-1, 3, 1), DOOR_HAND.MAX_A); // … fully open: no further
    assert.equal(leafPushed(-1, 0.1, 0.5), null); // (not crossing it: nothing)
});

/** A small game with one door and two scripted hands. */
function doorGame(locked = false) {
    const scene = new THREE.Scene();
    let boxes = 0;
    const game = {
        scene, currentPose: {}, isDeadLocal: false,
        character: { group: { position: new THREE.Vector3(0, 0, 2) }, getActiveHands: () => ({}) },
        collision: { addBox: () => ++boxes, removeBox: () => {} },
        locks: { doorLocked: () => locked, lockedTried() { this.tried = (this.tried || 0) + 1; } },
        sound: null, sync: null,
    };
    const D = new Doors(game);
    D._place({ id: 'd1', x: 0, y: 0, z: 0, ry: 0, color: 0x7a4f2a, a: 0 });
    const hands = { left: null, right: null };
    D.input = (side) => hands[side];
    const door = D.list.get('d1');
    door.model.updateMatrixWorld(true);
    return { game, D, door, hands };
}
const knob = (door, front = true) => (front ? door.model.userData.knob : door.model.userData.knob2).getWorldPosition(new THREE.Vector3());

test('a door in the hand: fingers close on the handle, the leaf follows the hand, open fingers let go and it stays', () => {
    const { D, door, hands } = doorGame();
    const k = knob(door); // (the handle on the side it opens to)
    hands.right = { G: k.clone(), curl: 0.1 };
    D.update(0.016); // (open fingers at the handle)
    hands.right = { G: k.clone(), curl: 0.8 };
    D.update(0.016);
    assert.equal(D.held.right, door, 'the closed fingers hold the handle');
    // pull: the hand goes round the hinge towards −Z
    const hinge = new THREE.Vector3(-0.8, k.y, 0), r = k.clone().setY(k.y).sub(hinge).length();
    for (let i = 1; i <= 30; i++) {
        const a = 1.0 * i / 30;
        hands.right = { G: new THREE.Vector3(hinge.x + r * Math.cos(a), k.y, -r * Math.sin(a)), curl: 0.8 };
        D.update(0.05);
    }
    assert.ok(door.a > 0.8 && door.a < 1.1, `the leaf went with the hand (${door.a.toFixed(2)})`);
    hands.right = { G: hands.right.G.clone(), curl: 0.05 };
    for (let i = 0; i < 8; i++) D.update(0.05);
    assert.equal(D.held.right, null, 'open fingers: let go');
    const a = door.a;
    hands.right = null;
    D.update(0.1);
    assert.equal(door.a, a, 'let go: the door stays where it is');
});

test('a locked door: the handle held, the leaf doesn\'t give — it rattles', () => {
    const { game, D, door, hands } = doorGame(true);
    const k = knob(door);
    hands.right = { G: k.clone(), curl: 0.1 };
    D.update(0.016);
    hands.right = { G: k.clone(), curl: 0.8 };
    D.update(0.016);
    hands.right = { G: k.clone().add(new THREE.Vector3(-0.2, 0, -0.35)), curl: 0.8 };
    for (let i = 0; i < 5; i++) D.update(0.05);
    assert.equal(door.a, 0, 'shut');
    assert.ok(game.locks.tried > 0, 'rattled');
});

test('a free hand never goes through a leaf: pressed through from behind, it pushes it open', () => {
    const { D, door, hands } = doorGame();
    // an open (fist-less) hand in the middle of the leaf, just behind it (+Z), then through it to −Z
    for (const z of [0.2, 0.1, -0.15, -0.3]) { hands.left = { G: new THREE.Vector3(0.2, 1.6, z), curl: 0.1 }; D.update(0.016); }
    assert.ok(door.a > 0.2, `pushed open (${door.a.toFixed(2)})`);
});

test('a chest unlocked by «Алохомора»: the lid stands a crack open; the hand lifts it, past the middle it falls open', () => {
    const c = new Chest(new THREE.Scene(), new THREE.Vector3(0, 0.5, 0), 'loot', 0, 'h1c0');
    c.locked = true;
    c.mesh.updateMatrixWorld(true);
    c.setAjar();
    assert.ok(c.picked);
    assert.ok(Math.abs(c.lidGroup.rotation.x + AJAR_ANGLE) < 1e-9, 'a crack');
    assert.equal(c.liftTo(0.3), false);
    assert.ok(c.liftTo(1.2), 'lifted high: it opens');
    assert.ok(c.open());
    c.update(0.5);
    assert.ok(-c.lidGroup.rotation.x > 1.0, 'it goes on up from where the hand left it (no snapping shut)');
    const edge = c.lidEdge();
    assert.ok(edge.y > 1, 'the lid\'s edge is up there');
});

test('the fingers find a big chest\'s lid anywhere along its front edge (its corner too), not over its middle or far off', () => {
    const c = new Chest(new THREE.Scene(), new THREE.Vector3(0, 0, 0), 'loot', 0, 'mh1c0', { scale: 2 });
    c.mesh.updateMatrixWorld(true);
    c.setAjar();
    const at = (x, y, z) => Alohomora.prototype._atLidEdge.call({}, c, new THREE.Vector3(x, y, z));
    const k = 2, front = (-0.425 + LID_LEN) * k, top = 0.7 * k; // (the lid's front edge, chest-local × scale)
    const local = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(c.mesh.matrixWorld);
    const p = (x, y, z) => { const v = local(x / k, y / k, z / k); return at(v.x, v.y, v.z); };
    assert.ok(p(0, top + 0.1, front + 0.05), 'the middle of the edge');
    assert.ok(p(CHEST_W * k / 2 - 0.1, top - 0.05, front + 0.05), 'its corner');
    assert.ok(p(-CHEST_W * k / 2 + 0.1, top + 0.15, front), 'the other corner');
    assert.equal(p(0, top + 0.1, 0), false, 'over the middle of the lid');
    assert.equal(p(0, top + 1.5, front + 1.5), false, 'far in front');
    assert.equal(p(CHEST_W * k / 2 + 1, top, front), false, 'beside the chest');
});

test('the keep\'s broken gates come back after 180 s with nobody near; a player near stops the clock; a block in the doorway waits', async () => {
    const { BLOCK } = await import('../../src/world/Terrain.js');
    const G = { x: 0, y: 10, z: 0, ry: 0, w: 7, h: 7 };
    const blocks = new Map();
    const arch = Math.round(G.y + 1.5) + G.h;
    for (let x = -4; x <= 4; x++) blocks.set(`${x},${arch},0`, BLOCK.STONE);
    const data = { get: (x, L, z) => blocks.get(`${x},${L},${z}`) || 0, landMade: () => true };
    const players = [{ p: { x: 10, z: 0 } }];
    const sent = [];
    const game = { authority: true, character: { group: { position: { x: 5000, z: 5000 } } }, castleLife: { _players: () => players }, world: { terrain: { data } }, sync: { net: { send: (m) => sent.push(m) } } };
    const a = new Alohomora(game);
    const st = a._gate('c1');
    st.broken = true; st.hits = 2; st.gx = G.x; st.gz = G.z; st.G = G;
    for (let i = 0; i < 400; i++) a._mendGates(0.5); // 200 s with a player 10 m away
    assert.ok(st.broken && st.rt === 0, 'the clock stands while somebody is near');
    players[0].p.x = 200;
    blocks.set('1,' + Math.round(G.y + 1.5) + ',0', BLOCK.STONE); // (a player built in the doorway)
    for (let i = 0; i < 400; i++) a._mendGates(0.5);
    assert.ok(st.broken, 'a block in the doorway: they wait');
    blocks.delete('1,' + Math.round(G.y + 1.5) + ',0');
    a._mendGates(0.5);
    assert.ok(!st.broken && st.hits === 0 && !st.unlocked, 'mended, shut');
    assert.deepEqual(sent.map((m) => m.k), ['mend']);
    const guest = new Alohomora({ ...game, authority: false });
    guest._gate('c1').broken = true;
    guest.applyNet({ t: 'lock', k: 'mend', id: 'c1', by: 'host' });
    assert.ok(!guest.gates.get('c1').broken, 'a guest sees the same');
});
