// «Экспеллиармус» on the crews (the author: «капитана можно победить так: сначала выбить саблю, а потом атаковать»):
// Captain Black Moustache's rapier and the skeletons' blades fly out as real weapons, he is unarmed (fists, no parry) till he gets
// it back; and the sailors' guard of the spells right at the wand (a skeleton point blank).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ships } from '../../src/game/Ships.js';
import { EXPELLIARMUS } from '../../src/game/Expelliarmus.js';
import { Blackbeard, BB } from '../../src/game/Blackbeard.js';
import { DISARM, DISARM_TOOLS, DISARM_TARGETS, fetchStep, knockable } from '../../src/game/SailorDisarm.js';

class FakeWeapons {
    constructor() { this.byId = new Map(); this.n = 0; }
    spawn(type, position) {
        const w = { id: 'w' + (++this.n), type, position: position.clone(), velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), holder: null, wake() {}, applyMagicLook() {} };
        this.byId.set(w.id, w);
        return w;
    }
    markMagic(w, bonus) { if (bonus > 0) { w.magic = true; w.bonus = bonus; } return w; }
    remove(w) { this.byId.delete(w.id); }
}

function world() {
    const game = {
        config: { mode: 'creative' }, authority: true, scene: { add() {}, remove() {} }, localId: 'me', remotes: new Map(), isNight: false,
        character: { group: { position: { x: 9999, y: 0, z: 9999 }, rotation: { y: 0 } } }, hud: { setVoice(t) { game.said.push(t); } }, collision: { addMover() {}, removeMover() {} }, chests: [],
        weapons: new FakeWeapons(), said: [],
    };
    const S = new Ships(game);
    game.ships = S;
    game.blackbeard = new Blackbeard(game);
    const B = S.spawn('blackship', 0, 0, 0, { id: BB.ID, wake: false });
    game.blackbeard.ship = B;
    S.wake(B);
    S.crew._place(B);
    const list = S.crew.crews.get(B.id);
    return { game, S, B, crew: S.crew, cap: list.find((v) => v.role === 'blackbeard'), skel: list.filter((v) => v.role === 'skeleton'), list };
}

test('the table: every sort of the crews has a verdict; the rapier is the magic sword he drops when he falls', () => {
    for (const r of ['blackbeard', 'skeleton', 'sailor', 'captain', 'boatswain']) assert.ok(DISARM_TARGETS[r]?.why, r);
    assert.equal(knockable('rapier').item, 'sword');
    assert.equal(knockable('rapier').bonus, 60, 'the same +60 % as Blackbeard.died');
    assert.equal(knockable('axe').item, 'axe');
    assert.equal(knockable('pistol').item, null);
    assert.equal(knockable('none'), null);
    assert.ok(Object.keys(DISARM_TOOLS).every((k) => DISARM_TOOLS[k].bonus >= 0));
});

test('«Экспеллиармус» on the captain: the rapier flies out onto the deck as a magic sword, his hand is empty, the hint is shown', () => {
    const { game, crew, cap, B } = world();
    assert.equal(cap.model.toolKind, 'rapier');
    const out = crew.disarm(cap, { x: cap.x, z: cap.z + 8 }, 'me');
    assert.equal(out, 'sword');
    assert.equal(cap.disarmed, true);
    assert.equal(cap.model.toolKind, 'none');
    const w = game.weapons.byId.get(cap.lostArm.id);
    assert.ok(w && w.type === 'sword' && w.magic && w.bonus === 60, 'a real weapon thing');
    assert.ok(w.velocity.length() > 1, 'it flies');
    assert.match(game.said.at(-1), /Сабля капитана выбита/);
    assert.match(game.said.at(-1), /атакуйте/);
    // landing on his deck, not over the side
    const t = new THREE.Vector3();
    t.copy(w.position).addScaledVector(w.velocity, 0);
    assert.ok(Math.abs(B.pose.toLocal(w.position.x, w.position.y, w.position.z, {}).x ?? 0) < 20);
    // not twice
    assert.equal(crew.disarm(cap, null, 'me'), null);
});

test('disarmed, he beats no charge aside; with the rapier back he does again', () => {
    const { crew, cap, B } = world();
    const r = Math.random; Math.random = () => 0;
    try {
        const yaw = B.st.yaw + cap.lyaw;
        const front = { x: cap.x - Math.sin(yaw) * 10, z: cap.z - Math.cos(yaw) * 10 };
        assert.equal(crew.parryBolt(cap, front, 100000), true, 'armed: parried');
        cap.parryBoltT = -1e9; cap.wind = 1;
        crew.disarm(cap, null, 'me');
        assert.equal(crew.parryBolt(cap, front, 200000), false, 'no blade, no parry');
        cap.disarmed = false;
        assert.equal(crew.parryBolt(cap, front, 300000), true);
    } finally { Math.random = r; }
});

test('unarmed he fights with his fists: half the blow', () => {
    const { crew, cap } = world();
    crew.disarm(cap, null, 'me');
    let dealt = 0;
    crew.game.castleLife = { struck: (d) => { dealt = d; } };
    cap.fp = null;
    crew._strike(cap, cap.ship, 'me');
    assert.equal(dealt, Math.max(1, Math.round(cap.dmg * EXPELLIARMUS.FIST)));
    assert.ok(dealt < cap.dmg);
});

test('a skeleton: the cutlass / the axe flies out; a pistol clatters away with nothing to fetch', () => {
    const { game, crew, skel } = world();
    const done = new Set();
    for (const sk of skel) {
        const tool = sk.model.toolKind;
        if (done.has(tool)) continue;
        done.add(tool);
        const before = game.weapons.byId.size;
        const out = crew.disarm(sk, { x: sk.x + 5, z: sk.z }, 'me');
        assert.equal(sk.disarmed, true, tool);
        assert.equal(sk.model.toolKind, 'none');
        if (tool === 'pistol') { assert.equal(out, 'gun'); assert.equal(game.weapons.byId.size, before); assert.ok(!sk.lostArm); }
        else { assert.equal(out, tool === 'axe' ? 'axe' : 'sword', tool); assert.equal(game.weapons.byId.size, before + 1); assert.ok(sk.lostArm); }
    }
    assert.ok(done.size >= 2, 'looked at more than one weapon: ' + [...done]);
});

test('a dead one, one in the sea or in the air: nothing to knock out', () => {
    const { crew, skel } = world();
    const [a, b, c] = skel;
    a.dead = true; assert.equal(crew.disarm(a, null, 'me'), null);
    b.overboard = { x: 0, y: 0, z: 0, vy: 0, t: 0 }; assert.equal(crew.disarm(b, null, 'me'), null);
    c.lev = true; assert.equal(crew.disarm(c, null, 'me'), null);
    assert.equal(a.disarmed || b.disarmed || c.disarmed, undefined);
});

test('fetchStep: walks to a blade within reach, bends 3–5 s, picks it up; gives up when it is taken, far, on another deck or after 20 s', () => {
    const a = { t: 0, grab: 0 };
    assert.equal(fetchStep(a, 0.1, { taken: false, dist: 6 }), 'walk');
    assert.equal(fetchStep(a, 0.1, { taken: false, dist: 0.5 }, () => 0), 'grab');
    assert.ok(a.grab >= DISARM.GRAB_MIN - 0.2 && a.grab <= DISARM.GRAB_MAX);
    let r = 'grab', t = 0;
    while (r === 'grab' && t < 10) { r = fetchStep(a, 0.1, { taken: false, dist: 0.5 }); t += 0.1; }
    assert.equal(r, 'done');
    assert.ok(t >= DISARM.GRAB_MIN - 0.3, `bent for ${t.toFixed(1)} s`);
    assert.equal(fetchStep({ t: 0, grab: 0 }, 0.1, { taken: true, dist: 1 }), 'giveup', 'a player took it');
    assert.equal(fetchStep({ t: 0, grab: 0 }, 0.1, { taken: false, dist: Infinity }), 'giveup', 'on another deck / in the sea');
    assert.equal(fetchStep({ t: 0, grab: 0 }, 0.1, { taken: false, dist: DISARM.RANGE + 1 }), 'giveup', 'too far');
    assert.equal(fetchStep({ t: DISARM.GIVE_UP, grab: 0 }, 0.1, { taken: false, dist: 5 }), 'giveup', 'too long');
    // knocked about: the bending starts again
    const b = { t: 0, grab: 0 };
    fetchStep(b, 0.1, { taken: false, dist: 0.3 }, () => 0.5);
    assert.equal(fetchStep(b, 0.1, { taken: false, dist: 0.3, busy: true }), 'wait');
    assert.equal(b.grab, 0);
});

test('he goes for his rapier, bends for it, gets it back — if nobody took it; a player\'s hands win it', () => {
    const { game, crew, cap, B } = world();
    crew.disarm(cap, { x: cap.x + 6, z: cap.z }, 'me');
    const id = cap.lostArm.id;
    const lay = (w) => { w.position.x += w.velocity.x * 0.7; w.position.z += w.velocity.z * 0.7; w.position.y = cap.y; w.velocity.set(0, 0, 0); }; // (it landed: no physics in this stand)
    lay(game.weapons.byId.get(id));
    // far from every player; no foe: he walks to the blade, bends, takes it
    let t = 0;
    while (cap.disarmed && t < 40) { crew.update(1 / 30); t += 1 / 30; }
    assert.equal(cap.disarmed, false, `re-armed after ${t.toFixed(1)} s`);
    assert.equal(cap.model.toolKind, 'rapier');
    assert.ok(!game.weapons.byId.has(id), 'the blade is in his hand, not on the deck');
    assert.ok(t >= DISARM.GRAB_MIN, 'he bent for it');
    // ...and a player who took it first
    crew.disarm(cap, { x: cap.x - 6, z: cap.z }, 'me');
    lay(game.weapons.byId.get(cap.lostArm.id));
    game.weapons.byId.get(cap.lostArm.id).holder = { side: 'right' };
    for (let i = 0; i < 90; i++) crew.update(1 / 30);
    assert.equal(cap.disarmed, true, 'in a player\'s hand: he stays unarmed');
    assert.equal(cap.lostArm, null);
});

test('he never leaves his ship for the blade: it flew over the side — he gives up', () => {
    const { game, crew, cap } = world();
    crew.disarm(cap, null, 'me');
    const w = game.weapons.byId.get(cap.lostArm.id);
    w.position.set(500, -5, 500); // (in the sea, far away)
    for (let i = 0; i < 60; i++) crew.update(1 / 30);
    assert.equal(cap.lostArm, null);
    assert.equal(cap.disarmed, true);
});

test('the rapier lying on the deck is the loot: he does not drop a second one when he falls; had he got it back, the usual one', () => {
    const { game, crew, cap, B } = world();
    game.sync = null;
    crew.disarm(cap, null, 'me');
    const n = game.weapons.byId.size;
    game.blackbeard.died(cap, 'me');
    assert.equal(game.weapons.byId.size, n, 'no second rapier');
    // re-armed: the usual drop
    cap.disarmed = false; cap.droppedId = null;
    game.weapons.spawnHovering = (type, p) => game.weapons.spawn(type, p);
    game.blackbeard.died(cap, 'me');
    assert.equal(game.weapons.byId.size, n + 1);
});
