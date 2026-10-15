import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation, STRUGGLE, struggleKind } from '../../src/game/Levitation.js';
import { pickBody, bendToward, firstTouched, AIM, BODY, DUEL, DUEL_SPELLS } from '../../src/game/Duel.js';
import { DeathSystem } from '../../src/game/Death.js';

/**
 * «Вингардиум Левиоса» on a friend (another player's wizard), and on the dead and the living
 * that struggle. Me at the origin, my right hand at (0.6, 1.5, −1) pointing along `aim`;
 * a friend's wizard 12 m ahead.
 */
function world() {
    const voice = [], sent = [];
    const aim = new THREE.Vector3(0, 0, -1);
    const hand = new THREE.Vector3(0.6, 1.5, -1);
    const grip = new THREE.Object3D();
    const friendGroup = new THREE.Group();
    friendGroup.position.set(0.6, 2, -13);
    const remotes = new Map([['friend', { dead: false, lastUpdate: performance.now(), character: { group: friendGroup }, position: friendGroup.position, handPose: () => ({ origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) }) }]]);
    const g = {
        localId: 'me', authority: true, remotes,
        config: { mode: 'creative' },
        zombies: [], zombieById: new Map(),
        weapons: { weapons: [] }, water: { resting: [] },
        duel: { _animalBody: () => ({ y: 0.8, r: 1.2 }), _handOf: (by, side, pos, dir) => { pos.copy(hand); dir.copy(aim).normalize(); return by === 'me'; } },
        collision: { surfaceY: () => 0, groundY: () => 0, resolveCylinder() {} },
        character: {
            group: new THREE.Group(),
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(hand),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(aim).normalize(),
            getGripObject: () => grip,
        },
        combat: { enabled: false, fatigue: 30, dead: false },
        hud: { setVoice: (t) => voice.push(t) },
        fx: { spark() {} },
        sync: { lev: (...a) => sent.push(['lev', ...a]), lift: (...a) => sent.push(['lift', ...a]) },
        playerName: (id) => (id === 'friend' ? 'Друг' : id),
    };
    const lev = new Levitation(g);
    g.levitation = lev;
    return { g, lev, aim, hand, voice, sent, friendGroup };
}

/** The hand turned `deg` degrees to the right of the line to (x, y, z). */
function pointBeside(aim, hand, to, deg) {
    aim.subVectors(to, hand).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -deg * Math.PI / 180);
}

test('the hand on a friend a little beside his body still means him (a fighting spell\'s narrow aim did not: «Левиоса» lifted nothing)', () => {
    const { lev, aim, hand, friendGroup } = world();
    pointBeside(aim, hand, friendGroup.position, 14);
    const hero = { kind: 'p', id: 'friend', a: friendGroup.position.clone().add(new THREE.Vector3(0, -BODY.HERO.DOWN, 0)), b: friendGroup.position.clone().add(new THREE.Vector3(0, BODY.HERO.UP, 0)), r: BODY.HERO.R };
    assert.equal(pickBody(hand, aim, [hero]), null, 'the duel\'s narrow aim alone misses him');
    const a = lev.aimWizard();
    assert.ok(a, 'Leviosa finds the friend');
    assert.deepEqual([a.side, a.t.kind, a.t.id], ['right', 'p', 'friend']);
    // (as a thing, he is never lifted by the hand: a duel charge flies — Game)
    assert.notEqual(lev._pick()?.kind, 'creature');
});

test('a thing pointed at more truly than the friend is lifted instead; pointing far away from him finds nobody', () => {
    const { g, lev, aim, hand, friendGroup } = world();
    const sword = { holder: null, position: new THREE.Vector3(3, 0.3, -6) };
    g.weapons.weapons.push(sword);
    aim.subVectors(sword.position, hand).normalize();
    assert.equal(lev.aimWizard(), null);
    g.weapons.weapons.length = 0;
    pointBeside(aim, hand, friendGroup.position, 60);
    assert.equal(lev.aimWizard(), null);
});

test('the charge of «Левиоса» turns after the friend enough to reach him while he walks on (a fighting spell\'s charge flies past)', () => {
    const fly = (bend, turn) => {
        const hand = new THREE.Vector3(0.6, 1.5, -1);
        const body = { kind: 'p', id: 'friend', a: new THREE.Vector3(), b: new THREE.Vector3(), r: BODY.HERO.R };
        const pos = new THREE.Vector3(0.6, 2, -13);
        // cast at where he was (seen over the network a moment late), 14° beside him; he walks sideways
        const d0 = pos.clone().sub(hand).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -14 * Math.PI / 180);
        const dir = d0.clone(), front = hand.clone();
        for (let t = 0; t < 3; t += 1 / 60) {
            pos.x -= 2.5 / 60;
            body.a.copy(pos).y -= BODY.HERO.DOWN; body.b.copy(pos).y += BODY.HERO.UP;
            const want = body.a.clone().lerp(body.b, 0.5).sub(front);
            if (want.dot(d0) > 0) bendToward(dir, d0, want.normalize(), turn / 60, bend);
            const from = front.clone();
            front.addScaledVector(dir, DUEL.SPEED / 60);
            if (firstTouched(from, front, [body])) return true;
        }
        return false;
    };
    assert.equal(fly(AIM.BEND, AIM.TURN), false, 'a fighting spell\'s small correction misses him');
    assert.equal(fly(DUEL_SPELLS.LevitateDuel.bend, DUEL_SPELLS.LevitateDuel.turn), true, '«Левиоса» reaches him');
});

test('why it did not lift him is told — but not when his «I am up» comes a moment late', () => {
    const { lev, voice } = world();
    const at = (ms) => { lev.miss.at = performance.now() - ms; lev.update(1 / 60); };
    lev.missed('friend', 'levShield');
    at(1);
    assert.match(voice.at(-1) || '', /Друг закрыт щитом/);
    voice.length = 0;
    lev.missed('friend', 'levMiss');
    lev.onNetLift({ by: 'me', to: 'friend', on: 1, side: 'right', h: 5 });
    assert.equal(lev.miss, null);
    lev.update(2);
    assert.ok(!voice.some((t) => /не долетела/.test(t)), 'no false «missed»');
    assert.equal(lev.state.kind, 'player');
    // held by another wizard: the friend's computer says so, the caster is told at once
    const w2 = world();
    w2.lev.onNetLift({ by: 'me', to: 'friend', on: 0, r: 'levHeld' });
    w2.lev.update(1 / 60);
    assert.match(w2.voice.at(-1) || '', /уже держит/);
});

test('my wizard already held by one caster: a second caster\'s charge is refused with the reason', () => {
    const { lev, sent, g } = world();
    g.remotes.set('other', g.remotes.get('friend'));
    lev.lifted = { by: 'friend' };
    lev.liftMe('other');
    assert.deepEqual(sent.at(-1).slice(0, 2), ['lift', 'other']);
    assert.equal(sent.at(-1).at(-1), 'levHeld');
    assert.equal(lev.lifted.by, 'friend');
});

test('the living struggle: each in its way; a castle wizard breaks free and comes down softly; a held villager kicks («flail»)', () => {
    assert.equal(struggleKind('a', {}), 'animal');
    assert.equal(struggleKind('z', {}), 'zombie');
    assert.equal(struggleKind('v', { role: 'knight' }), 'knight');
    assert.equal(struggleKind('v', { role: 'farmer', wizard: false }), 'villager');
    assert.equal(struggleKind('v', { role: 'teacher', wizard: true }), 'wizard');
    assert.ok(STRUGGLE.knight.jerk > STRUGGLE.villager.jerk, 'a knight pulls harder');
    const { g, lev } = world();
    const said = [];
    const wiz = { id: 'c:1', x: 0.6, y: 0, z: -6, role: 'teacher', wizard: true, mode: 'idle' };
    const farmer = { id: 'c:2', x: 4, y: 0, z: -6, role: 'farmer', mode: 'idle' };
    g.castleLife = { byId: new Map([[wiz.id, wiz], [farmer.id, farmer]]), targets: () => [wiz, farmer], _say: (v, t) => said.push([v.id, t]) };
    assert.ok(lev.grab('v', farmer, 'me', 'right', 6));
    assert.equal(farmer.mode, 'flail');
    assert.ok(said.some(([id]) => id === farmer.id), 'the farmer cries out');
    const x0 = farmer.x;
    let moved = 0;
    for (let i = 0; i < 180; i++) { lev.update(1 / 60); moved = Math.max(moved, Math.abs(farmer.x - x0)); }
    assert.ok(farmer.lev && !farmer.lev.lower, 'still held');
    assert.ok(moved > 0.05, `it jerks in the hold (${moved.toFixed(2)} m)`);
    assert.ok(lev.grab('v', wiz, 'me', 'right', 6));
    for (let i = 0; i < 6 * 60 && !wiz.lev?.lower; i++) lev.update(1 / 60);
    assert.ok(wiz.lev?.lower, 'the wizard broke the hold and comes down softly');
    assert.ok(said.some(([id, t]) => id === wiz.id && /Фините/.test(t)));
});

test('the dead are lifted too: a dead zombie, and a body that lies (a wizard\'s) — let go, it falls and lies on the ground', () => {
    const { g, lev, aim, hand } = world();
    g.remotes.clear();
    const z = { id: 5, isDead: true, isDying: false, removable: false, group: new THREE.Group() };
    z.group.position.set(0.6, 0.8, -6);
    g.zombies.push(z); g.zombieById.set(5, z);
    aim.subVectors(z.group.position, hand).normalize();
    assert.equal(lev.cast(), null);
    assert.equal(lev.state.kind, 'creature');
    assert.ok(z.lev?.body, 'the zombie\'s body is held (it hangs limp)');
    aim.set(0, 0.7, -1);
    for (let i = 0; i < 120; i++) lev.update(1 / 60);
    assert.ok(z.group.position.y > 2, 'it rose');
    lev.release(false);
    for (let i = 0; i < 240; i++) lev.update(1 / 60);
    assert.ok(Math.abs(z.group.position.y - 0.8) < 0.01, 'it lies on the ground again');

    // a castle wizard's body (Death.js)
    g.zombies.length = 0;
    const moves = [];
    g.sync.bodyMove = (b, q, air) => moves.push({ y: b.y, air });
    g.death = new DeathSystem(g);
    const b = g.death.addBody({ id: 'vc:3_x', k: 'v', who: 'c:3', role: 'teacher', x: 0.6, y: 0, z: -8, yaw: 0 });
    b.model = new THREE.Group(); b.model.position.set(0.6, 0, -8);
    const v = { id: 'c:3', dead: true };
    g.castleLife = { byId: new Map([['c:3', v]]), targets: () => [] };
    aim.subVectors(new THREE.Vector3(0.6, 0.5, -8), hand).normalize();
    assert.equal(lev.cast(), null);
    assert.equal(lev.state.kind, 'corpse');
    assert.ok(v.bodyMoved, 'the villager\'s own lying model gives way to the carried body');
    aim.set(0, 0.7, -1);
    for (let i = 0; i < 120; i++) { lev.update(1 / 60); g.death.update(1 / 60); }
    assert.ok(b.y > 2, `the body rose (${b.y.toFixed(2)})`);
    assert.ok(moves.some((m) => m.air), 'the others are told where it is');
    lev.release(false);
    for (let i = 0; i < 240; i++) g.death.update(1 / 60);
    assert.equal(b.y, 0);
    assert.equal(moves.at(-1).air, false, 'and where it landed');
});
