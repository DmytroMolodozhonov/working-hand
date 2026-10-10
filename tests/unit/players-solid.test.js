import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { MOUNT, HERO } from '../../src/game/BodyContact.js';

/**
 * The game's own wiring of solid players (Game._keepBodiesApart), on a small world:
 * flat open ground, heroes standing upright (body origin 1.5 m up), me ('me') and
 * other players by id at [x, z].
 */
function hero(x, z, yaw = 0, y = 1.5) {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    return { group, isCrouching: false };
}

function world({ me = [0, 10, 0], others = {} } = {}) {
    const g = Object.create(Game.prototype);
    g.net = { active: true, localId: 'me' };
    g.character = hero(...me);
    g.remotes = new Map(Object.entries(others).map(([id, [x, z, yaw = 0]]) => {
        const ch = hero(x, z, yaw);
        return [id, { dead: false, target: {}, character: ch, get position() { return ch.group.position; } }];
    }));
    g.combat = { dead: false };
    g.isDeadLocal = false;
    g.animals = { riding: null, list: [] };
    g.levitation = { lifted: null, state: null };
    g.collision = { resolveCylinder: () => false, pointBlocked: () => false };
    g.flight = { active: false };
    g.world = { isMap: false };
    return g;
}

/** One game frame: my own move, then the passes the game makes (end of my move, after the others moved). */
function frame(g, move) {
    move();
    g._keepBodiesApart();
    g._keepBodiesApart();
}

test('running at another player frame by frame: stopped touching the body, at a low frame rate too', () => {
    const g = world({ me: [0, 10, 0], others: { friend: [0, 0] } });
    const me = g.character.group.position;
    let closest = Infinity;
    for (let i = 0; i < 30; i++) {
        frame(g, () => { me.z -= 0.75; }); // (7.5 m/s at 10 frames a second)
        closest = Math.min(closest, me.z);
    }
    assert.ok(closest >= 2 * HERO.R - 1e-6, `never inside (${closest})`);
    assert.ok(Math.abs(me.z - 1.2) < 0.01 && me.x === 0, `stopped touching, straight on (${me.x}, ${me.z})`);
    // one frame from just in front to well behind: no jumping through
    me.z = 1.3; g._keepBodiesApart();
    frame(g, () => { me.z = -2; });
    assert.ok(me.z > 1.19, `blocked in front (${me.z})`);
    // calling it again changes nothing
    const z = me.z;
    g._keepBodiesApart();
    assert.equal(me.z, z);
});

test('another player walks into me: I am pushed out; the dead and the not yet seen do not push', () => {
    const g = world({ me: [0, 10, 0], others: { friend: [0, 0] } });
    const me = g.character.group.position;
    g._keepBodiesApart();
    g.remotes.get('friend').position.z = 9.5;
    g._keepBodiesApart();
    assert.ok(Math.abs(me.z - 10.7) < 1e-3, `pushed out behind (${me.z})`);
    me.z = 9.6;
    g.remotes.get('friend').dead = true;
    g._keepBodiesApart();
    assert.equal(me.z, 9.6, 'a dead player has no body');
    g.remotes.get('friend').dead = false;
    g.remotes.get('friend').target = null;
    g._keepBodiesApart();
    assert.equal(me.z, 9.6, 'nor one whose place has not come yet');
});

test('Leviosa: the wizard holding another up is not shoved by them; the one held up is kept out of the wizard', () => {
    // I hold my friend up and my hand brings them against me: I stay where I stand
    const lifter = world({ me: [0, 10, 0], others: { friend: [0, 10.5] } });
    lifter.levitation.state = { kind: 'player', id: 'friend' };
    lifter._keepBodiesApart();
    const a = lifter.character.group.position;
    assert.ok(a.x === 0 && a.z === 10, `the wizard was not pushed (${a.x}, ${a.z})`);
    // (when the hold ends, their body is solid for me again)
    lifter.levitation.state = null;
    lifter._keepBodiesApart();
    assert.ok(Math.abs(a.z - 10.5) > 1.19, 'solid again after the hold');
    // my friend holds me up and the magic carries me into them: I meet their body
    const lifted = world({ me: [0, 12, 0], others: { friend: [0, 10] } });
    lifted.levitation.lifted = { by: 'friend' };
    const b = lifted.character.group.position;
    lifted._keepBodiesApart();
    for (let i = 0; i < 10; i++) frame(lifted, () => { b.z -= 0.3; });
    assert.ok(b.z - 10 > 1.19, `kept out of the wizard (${b.z})`);
});

test('riding at another player: the horse is stopped at them and I stay on it', () => {
    const g = world({ me: [0, 20, 0, 5.6], others: { friend: [0, 0] } });
    const horse = { group: new THREE.Group(), model: { scale: { x: 2.3 } } };
    horse.group.position.set(0, 0.5, 20);
    g.animals.riding = horse;
    const me = g.character.group.position;
    for (let i = 0; i < 20; i++) {
        frame(g, () => { horse.group.position.z -= 2; me.z = horse.group.position.z; });
    }
    const front = MOUNT.FRONT * 2.3 + MOUNT.R * 2.3 + HERO.R;
    assert.ok(Math.abs(horse.group.position.z - front) < 0.02, `the horse's head stops at the body (${horse.group.position.z}, ${front})`);
    assert.equal(me.z, horse.group.position.z, 'the rider stays on the horse');
});

test('another player on a horse: their body is the horse', () => {
    const g = world({ me: [0, -10, Math.PI], others: { friend: [0, 0, 0] } });
    const horse = { rider: 'friend', dead: false, group: new THREE.Group(), model: { scale: { x: 2.3 } } };
    horse.group.position.set(0, 0.5, 0); // (facing −Z: its head towards me)
    g.remotes.get('friend').position.y = 5.6;
    g.animals.list.push(horse);
    const me = g.character.group.position;
    for (let i = 0; i < 20; i++) frame(g, () => { me.z += 0.75; });
    const front = MOUNT.FRONT * 2.3 + MOUNT.R * 2.3 + HERO.R;
    assert.ok(Math.abs(me.z + front) < 0.02, `stopped at the horse's head (${me.z}, ${-front})`);
});
