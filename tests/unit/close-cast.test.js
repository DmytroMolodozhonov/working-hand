/**
 * A creature standing right before the caster (the wand's tip already in it, or pushed through
 * it): the spell hits it — it never starts on its far side and flies on. A hand pushed into a
 * wall: the spell stays on this side of the wall. (Duel.armStart, Game.spellStart, «Бомбардо».)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel } from '../../src/game/Duel.js';
import { SpellManager } from '../../src/fx/SpellManager.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// my shoulder; the arm (+ wand) reaches 2 m forward along −Z (a big hero: a man is ~4 m tall)
const SHOULDER = V(0, 3, 0), TIP = V(0, 3, -2), DIR = V(0, 0, -1);

/** A knight `dist` m before my shoulder (hip 1.95 above his feet), a wall from z0 to z1 (or none). */
function world({ dist = null, wall = null, knightZ = null } = {}) {
    const kz = knightZ ?? (dist !== null ? -dist : null);
    const knights = kz === null ? [] : [{ id: 'k1', isVillager: true, x: 0, y: 0, z: kz, yaw: 0, group: { position: V(0, 1.95, kz) } }];
    const byId = new Map(knights.map((k) => [k.id, k]));
    const anchor = new THREE.Object3D();
    anchor.position.copy(SHOULDER);
    const meGroup = new THREE.Group();
    meGroup.position.set(0, 1.95, 1.2); // (behind the shoulder: my own body is never hit)
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        animals: null, books: null, spiders: null, sync: null, sound: null,
        castleLife: { byId, targets: () => knights, wardOff: () => false },
        terrain: wall ? { data: { isSolidAt: (x, y, z) => z <= wall[0] && z >= wall[1] } } : null,
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {} },
        castOrigin: (side, out = new THREE.Vector3()) => out.copy(TIP),
        character: {
            group: meGroup, rightArmAnchor: anchor, leftArmAnchor: anchor,
            isArmRaised: () => true,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(TIP),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
        },
        combat: { dead: false, enabled: false, center: (out) => out.copy(meGroup.position), shieldFactor: () => 0 },
        levitation: { liftMe() {} },
        creatureImpact: { spellHit() {} },
    };
    const d = new Duel(g);
    d._drawBolt = () => {};
    d._burst = () => {};
    const hits = [];
    d.applyToCreature = (spell, c) => hits.push([spell, c.id]);
    return { g, d, hits };
}

const run = (d, secs = 2, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) d.update(dt); };

for (const dist of [0.5, 1]) {
    for (const spell of ['Stupefy', 'Jolt', 'AvadaKedavra', 'IceDuel']) {
        test(`a knight ${dist} m before me, the wand's tip through him: «${spell}» hits him`, () => {
            const { d, hits } = world({ dist });
            d.cast(spell, null, 'right');
            run(d);
            assert.deepEqual(hits, [[spell, 'k1']]);
        });
    }
}

test('a knight beside the arm (not in it) is not hit by a charge cast past him', () => {
    const { d, hits } = world({ knightZ: -1 });
    d.game.castleLife.byId.get('k1').group.position.x = 1.0; // (a metre to the side of the arm)
    d.cast('Stupefy', null, 'right');
    run(d);
    assert.deepEqual(hits, []);
});

test('the hand pushed into a wall: the charge stays on this side — the knight behind the wall is not hit', () => {
    const { d, hits } = world({ wall: [-0.8, -1.6], knightZ: -5 });
    const b = d.cast('Stupefy', null, 'right');
    assert.ok(b.o.z > -0.8, `starts before the wall (${b.o.z.toFixed(2)})`);
    run(d);
    assert.deepEqual(hits, []);
    assert.equal(d.bolts.size, 0, 'burst on the wall');
});

test('without a wall the same knight 5 m away is hit (the check above is not trivially true)', () => {
    const { d, hits } = world({ knightZ: -5 });
    d.cast('Stupefy', null, 'right');
    run(d);
    assert.deepEqual(hits, [['Stupefy', 'k1']]);
});

/** «Бомбардо»'s orb flown on a stripped SpellManager; where it went off (or null). */
function bombardo(g, origin) {
    let at = null;
    const fake = {
        spells: [], orbs: [], auth: true, zombies: [],
        fx: { castBurst() {}, lightFlash() {}, glow: { spawn() {} } },
        _sound() {}, _takeBall: () => new THREE.Object3D(), _freeBall() {}, _players: () => [],
        hooks: {
            explode: (p) => { at = p.clone(); },
            bodyOnWay: (p, q, by) => g.duel.touchOnWay(p, q, by === 'local' ? 'me' : by, true),
            terrain: () => null,
        },
    };
    SpellManager.prototype.castBombardo.call(fake, origin, DIR.clone(), 'local');
    const s = fake.spells[0];
    for (let t = 0; t < 2.6 && s.life > 0; t += 1 / 30) s.onUpdate(s, 1 / 30);
    if (!at) s.onEnd(s);
    return at;
}

for (const dist of [0.5, 1]) {
    test(`«Бомбардо» at a knight ${dist} m before me goes off on him (not behind him)`, () => {
        const { g, d } = world({ dist });
        g.duel = d;
        const o = d.myStart('right', TIP.clone());
        const at = bombardo(g, o);
        assert.ok(at, 'went off');
        assert.ok(Math.abs(at.z + dist) < 0.8, `on the knight (z ${at.z.toFixed(2)})`);
    });
}

test('«Бомбардо» goes off on a knight (any creature), not only on zombies and players', () => {
    const { g, d } = world({ knightZ: -8 });
    g.duel = d;
    const at = bombardo(g, TIP.clone());
    assert.ok(at && Math.abs(at.z + 8) < 1, `on the knight 8 m away (z ${at?.z.toFixed(2)})`);
});
