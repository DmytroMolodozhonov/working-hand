/**
 * A skeleton (or the captain) right against the caster — the author: «Я не мог произнести заклинание, когда скелет был прямо ВПРИТЫК
 * ко мне». Every spell works point blank by the same rules as at a distance: the charge / the splash / the ray leaves BEFORE the body
 * the wand's tip is already in (Duel.armStart, Game.spellStart) and hits it; never starts on its far side and flies on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { Duel } from '../../src/game/Duel.js';
import { SpellManager } from '../../src/fx/SpellManager.js';
import { Liquidation } from '../../src/game/Liquidation.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOULDER = V(0, 3, 0), TIP = V(0, 3, -2), DIR = V(0, 0, -1);

/** A sailor (role) `dist` m before my shoulder, `side` m to the side of the arm. */
function world({ dist = 1, side = 0, role = 'skeleton' } = {}) {
    const sk = { id: 'c:1', isSailor: true, role, x: side, y: 0, z: -dist, yaw: 0, dead: false, hp: 12 };
    const crew = { byId: new Map([[sk.id, sk]]), parryBolt: () => false, provoke() {}, hit() {}, passBy() {} };
    const anchor = new THREE.Object3D(); anchor.position.copy(SHOULDER);
    const meGroup = new THREE.Group(); meGroup.position.set(0, 1.95, 1.2);
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        ships: { crew }, castleLife: { targets: () => [], byId: new Map(), wardOff: () => false },
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {} },
        castOrigin: (s, o = new THREE.Vector3()) => o.copy(TIP),
        character: {
            group: meGroup, rightArmAnchor: anchor, leftArmAnchor: anchor, isArmRaised: () => true,
            getHandWorldPosition: (s, o = new THREE.Vector3()) => o.copy(TIP), getHandDirection: (s, o = new THREE.Vector3()) => o.copy(DIR), getPointingDirection: (s, o = new THREE.Vector3()) => o.copy(DIR),
        },
        combat: { dead: false, enabled: false, center: (o) => o.copy(meGroup.position), shieldFactor: () => 0 }, levitation: { liftMe() {} }, creatureImpact: { spellHit() {} },
    };
    const d = new Duel(g); d._drawBolt = () => {}; d._burst = () => {};
    g.duel = d;
    g.spellStart = (side2, out = new THREE.Vector3()) => { g.castOrigin(side2, out); return d.myStart(side2, out); }; // (Game.spellStart)
    const hits = [];
    d.applyToCreature = (spell, c) => hits.push([spell, c.id]);
    return { g, d, hits, sk };
}
const run = (d, secs = 2, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) d.update(dt); };

const CHARGES = ['Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Disarmor', 'Jolt', 'JoltMaxima', 'SapiraDuel', 'SandsDuel', 'IceDuel', 'LevitateDuel'];

for (const role of ['skeleton', 'blackbeard'])
    for (const dist of [0.3, 0.6, 1, 1.8, 2.5])
        for (const spell of CHARGES) {
            test(`${role} ${dist} m before me (the tip in him or past him): the charge «${spell}» hits him`, () => {
                const { d, hits } = world({ dist, role });
                // the way the game casts: aim = what the arm points at (Game._castDuel → Duel.pickSide)
                const aim = d.pickSide(false);
                assert.ok(aim && aim.t.id === 'c:1', 'the arm finds him');
                d.cast(spell, aim, 'right');
                run(d);
                assert.deepEqual(hits, [[spell, 'c:1']]);
            });
        }

test('a skeleton pressed against the arm, 0.3 m to the side: still hit; a metre to the side: not', () => {
    for (const [side, hit] of [[0.3, true], [1.6, false]]) {
        const { d, hits } = world({ dist: 1, side });
        d.cast('Stupefy', d.pickSide(false), 'right');
        run(d);
        assert.equal(hits.length > 0, hit, `side ${side}`);
    }
});

test('the hand is not "raised" nowhere: pointBlank finds the sailor in the arm even when the aim ray (from the tip) would miss him', () => {
    const { d } = world({ dist: 0.5 });
    const pb = d.pointBlank('right');
    assert.equal(pb?.id, 'c:1');
    assert.equal(pb?.kind, 'c');
});

/** «Бомбардо»'s orb flown on a stripped SpellManager; where it went off (or null). */
function bombardo(g, origin) {
    let at = null;
    const fake = {
        spells: [], orbs: [], auth: true, zombies: [],
        fx: { castBurst() {}, lightFlash() {}, glow: { spawn() {} } },
        _sound() {}, _takeBall: () => new THREE.Object3D(), _freeBall() {}, _players: () => [],
        hooks: { explode: (p) => { at = p.clone(); }, bodyOnWay: (p, q, by) => g.duel.touchOnWay(p, q, by === 'local' ? 'me' : by, true), terrain: () => null },
    };
    SpellManager.prototype.castBombardo.call(fake, origin, DIR.clone(), 'local');
    const s = fake.spells[0];
    for (let t = 0; t < 2.6 && s.life > 0; t += 1 / 30) s.onUpdate(s, 1 / 30);
    if (!at) s.onEnd(s);
    return at;
}
for (const role of ['skeleton', 'blackbeard'])
    for (const dist of [0.3, 0.6, 1, 1.8]) {
        test(`«Бомбардо» at a ${role} ${dist} m before me goes off on him, not behind him`, () => {
            const { g } = world({ dist, role });
            const at = bombardo(g, g.spellStart('right'));
            assert.ok(at, 'went off');
            assert.ok(Math.abs(at.z + dist) < 0.9, `on him (z ${at.z.toFixed(2)}, he is at ${-dist})`);
        });
    }

test('«Liquidation Maxima»: the splash leaves from the pulled-back start (Game.spellStart) and so finds a skeleton pressed against the wand', () => {
    for (const dist of [0.3, 1, 2.2]) {
        const { g } = world({ dist });
        let origin = null;
        g.wandSide = () => 'right';
        g.magicHand = 'right';
        g.combat.check = () => null; g.combat.pay = () => {};
        g.spells = { cast: (name, o) => { origin = o.clone(); } };
        const L = new Liquidation(g);
        assert.equal(L.cast('LiquidationMaxima', true), 'LiquidationMaxima');
        assert.ok(origin, 'cast');
        assert.ok(origin.z > -dist, `starts before him (z ${origin.z.toFixed(2)} vs ${-dist})`);
        // …so the first step of the splash (0.3 m on) touches his body
        const prev = origin.clone(), pos = origin.clone().addScaledVector(DIR, 0.3 + 0.9);
        const hit = L._first(prev, pos, DIR, 'me', true);
        assert.ok(hit && hit.kind === 'body' && hit.id === 'c:1', `the splash meets him at ${dist} m`);
    }
});

test('every spell that leaves the wand at a creature starts from Game.spellStart, not the raw tip (Inferno/Wind/Bombardo: Game; Liquidation, Hellfire, Inspirius: their own cast)', () => {
    const src = (f) => fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');
    for (const f of ['Liquidation.js', 'Hellfire.js', 'Inspirius.js']) assert.match(src(f), /spellStart/, f);
    assert.match(src('Game.js'), /let origin = this\.spellStart\(side\);/, 'the generic spell cast');
    assert.match(src('Duel.js'), /this\.myStart\(side, origin\);/, 'the duel charges');
});
