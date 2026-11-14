/**
 * The water mage's ice shards (IceShards.js, ElementalRules.SHARDS; the author 14.11: «превратить воду в лёд, потом в осколки, направить на игрока»).
 * «А если»: no water; too close / too far; out of mana; stunned / lifted in the middle; a shield or a dome on the player; a wall in the way; a guest's computer (draws, never hurts);
 * two volleys; a bad message; the player already dead / not fighting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SHARDS, orbitPoint, shardAim, segHitsCapsule } from '../../src/game/ElementalRules.js';
import { ElementalMages } from '../../src/game/ElementalMages.js';
import { elementalLook } from '../../src/game/ElementalTestSites.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { FX } from '../../src/fx/WizardFx.js';

test('orbit: a ring round the mage, at the radius, bobbing; the aim goes at the foe within the spread', () => {
    const o = {};
    for (let i = 0; i < SHARDS.N; i++) { orbitPoint(i, SHARDS.N, 1.3, 5, 0, 5, o); assert.ok(Math.abs(Math.hypot(o.x - 5, o.z - 5) - SHARDS.ORBIT_R) < 1e-9); assert.ok(o.y > 1.5 && o.y < 3.5); }
    for (let r = 0; r <= 1; r += 0.1) { const d = shardAim({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: -15 }, r); assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9); assert.ok(d.z < -0.97, 'at the foe'); assert.ok(Math.abs(d.x) <= Math.sin(SHARDS.SPREAD) + 1e-9); }
});
test('segHitsCapsule: through the body hits, past it misses', () => {
    const a = { x: 0, y: 1, z: -10 }, b = { x: 0, y: 3.5, z: -10 };
    assert.ok(segHitsCapsule({ x: 0, y: 2, z: -8 }, { x: 0, y: 2, z: -12 }, a, b, 0.6) != null);
    assert.equal(segHitsCapsule({ x: 3, y: 2, z: -8 }, { x: 3, y: 2, z: -12 }, a, b, 0.6), null);
    assert.equal(segHitsCapsule({ x: 0, y: 8, z: -8 }, { x: 0, y: 8, z: -12 }, a, b, 0.6), null, 'over his head');
});

function fixture({ authority = true, water = true, shield = false } = {}) {
    const sent = [], dmg = [], casts = [];
    const bodies = [{ kind: 'p', id: 'me', a: new T.Vector3(0, 0.2, -12), b: new T.Vector3(0, 3.5, -12), r: 0.6 }];
    const g = { authority, localId: 'me', character: { group: { position: new T.Vector3(0, 0, -12) } }, remotes: new Map(), scene: new T.Scene(), space: {}, collision: { groundAt: () => 0, lineOfSight: () => true }, terrain: { data: { landMade: () => true, get: () => (water ? BLOCK.WATER : BLOCK.AIR) } },
        spells: { cast: (...m) => casts.push(m), spells: [] }, sync: { spell() {} }, net: { send: (m) => sent.push(m) }, fx: { lightFlash() {}, spark() {}, glow: { spawn() {} } }, sound: { spellCast() {}, playClang() {} },
        duel: { _bodies: () => bodies }, impact: { apply() {} },
        combat: { enabled: true, dead: false, shieldFactor: () => (shield ? 1 : 0), _blocked: () => shield, damage: (d) => dmg.push(d) },
        castleLife: { byId: new Map(), _playerPos: () => ({ x: 0, y: 2, z: -12 }), _sees: () => true, _ground() {}, _steer() {}, _walkable: () => true } };
    const v = { id: 'creative-water:1', entry: { element: 'water', seed: 971207, mana: 220, look: elementalLook('water', { tank: true }) }, x: 0, y: 0, z: 0, yaw: 0, walk: 2, W: {}, foe: 'me', model: { setHeldTool() {} }, group: { visible: true } };
    g.castleLife.byId.set(v.id, v);
    const em = new ElementalMages(g); em.init(v); v.elemental.phase = 'Gather'; v.elemental.cycle = 1; v.elemental.scan = 0;
    return { g, v, em, sent, dmg, bodies, step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { em.think(v, dt); em.update(dt); } } };
}

test('a water mage freezes his water into shards and hurls a volley: paid, announced, aimed at the foe, hurting through no shield', () => {
    const f = fixture(); const mana = f.v.mana;
    assert.equal(f.em.canShards(f.v, { x: 0, y: 2, z: -12 }), true);
    assert.equal(f.em.waterAttack(f.v, { x: 0, y: 2, z: -12 }), true);
    assert.ok(f.v.elemental.shard && (f.v.fx & FX.SHARDS) && f.v.mode === 'waterFreeze');
    assert.ok(mana - f.v.mana >= SHARDS.COST - 0.01, 'paid');
    f.step(Math.round(SHARDS.END_T * 60) + 5);
    assert.equal(f.v.elemental.shard, null, 'the sequence ends');
    assert.equal(f.v.fx & FX.SHARDS, 0, 'the flag goes off at the hurl');
    const volley = f.sent.find((m) => m.t === 'ishard');
    assert.ok(volley && volley.s.length === SHARDS.N, 'one volley message with every shard');
    for (const s of volley.s) { assert.equal(s.length, 7); assert.ok(s.every(Number.isFinite)); assert.ok(s[5] < -15, 'flying at the foe (−z)'); }
    assert.ok(f.dmg.length >= 1, 'a shard hit the player: ' + f.dmg.length);
    assert.ok(f.dmg.every((d) => d >= 1 && d <= 8));
    assert.ok(f.sent.filter((m) => m.t === 'ishit').length === 0, 'the host\'s own hero is hurt at once, not by message');
});
test('a shield or a dome turns the shards: no damage', () => {
    const f = fixture({ shield: true });
    f.em.waterAttack(f.v, { x: 0, y: 2, z: -12 }); f.step(Math.round(SHARDS.END_T * 60) + 60);
    assert.equal(f.dmg.length, 0);
});
test('no water / too close / too far / no mana: no shards (his water is the water he has)', () => {
    const foe = { x: 0, y: 2, z: -12 };
    const dry = fixture({ water: false }); dry.v.entry.look.tank = false; dry.v.gifts.hydro.h = 0; dry.v.elemental.water = 0; assert.equal(dry.em.canShards(dry.v, foe), false);
    const near = fixture(); assert.equal(near.em.canShards(near.v, { x: 0, y: 2, z: -2 }), false);
    const far = fixture(); assert.equal(far.em.canShards(far.v, { x: 0, y: 2, z: -60 }), false);
    const broke = fixture(); broke.v.mana = SHARDS.COST - 1; assert.equal(broke.em.canShards(broke.v, foe), false);
});
test('stunned or lifted in the middle: the sequence is dropped, nothing is hurled', () => {
    const f = fixture(); f.em.waterAttack(f.v, { x: 0, y: 2, z: -12 }); f.step(20); f.v.stunT = 1; f.step(2);
    assert.equal(f.v.elemental.shard, null); assert.equal(f.v.fx & FX.SHARDS, 0);
    f.v.stunT = 0; f.step(200); assert.equal(f.sent.filter((m) => m.t === 'ishard').length, 0);
});
test('a guest\'s computer draws the volley and never hurts: only the host decides', () => {
    const f = fixture({ authority: false });
    f.em.shards.onNet({ t: 'ishard', by: 'creative-water:1', s: [[0, 2.4, -1.5, 0, 0, -26, 0], [0, 2.4, -1.5, 0.5, 0, -26, 0.07]] });
    assert.equal(f.em.shards.flying.length, 2);
    for (let i = 0; i < 120; i++) f.em.update(1 / 60);
    assert.equal(f.dmg.length, 0, 'no damage from a guest\'s own simulation');
    // bad messages
    f.em.shards.onNet({ t: 'ishard', by: 'x', s: [[NaN, 0, 0, 0, 0, 0, 0]] }); f.em.shards.onNet({ t: 'ishard', by: 7, s: [] }); f.em.shards.onNet({ t: 'ishard', by: 'x', s: new Array(50).fill([0, 0, 0, 0, 0, 0, 0]) });
    assert.equal(f.em.shards.flying.length <= 2, true, 'bad or oversized messages spawn nothing');
    // a hit message to me is applied once
    f.em.shards.onNet({ t: 'ishit', id: 'h1', to: 'me', by: 'creative-water:1', damage: 3.5, from: [0, 2, -3], vel: [0, 1, -5] });
    f.em.shards.onNet({ t: 'ishit', id: 'h1', to: 'me', by: 'creative-water:1', damage: 3.5, from: [0, 2, -3], vel: [0, 1, -5] });
    assert.equal(f.dmg.length, 1, 'the same hit twice counts once');
});
test('a wall stops a shard in a puff of ice (nothing dug)', () => {
    const f = fixture(); f.g.collision.pointBlocked = (x, y, z) => z < -6;
    f.em.shards.volley('creative-water:1', [{ p: [0, 2.4, -1.5], v: [0, 0, -26], d: 0 }]);
    f.step(60); assert.equal(f.em.shards.flying.length, 0); assert.equal(f.dmg.length, 0);
});
