/**
 * The fire and the air mage beat a thrown Bombardo / Fireball back at the thrower (ElementalParry.js; the author 14.11).
 * «А если»: the orb is his own; it passes wide; it is nearer than there is time for; he is mid-cast / lifted / stunned / out of mana / recovering; he misses (his die);
 * the orb bursts before the blow lands; two orbs at once; the water and the earth mage (they do not parry); a thrower that is gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SWAT, incoming, pickOrb, backDirection, canSwat, swatSpell } from '../../src/game/ElementalParry.js';
import { ElementalMages } from '../../src/game/ElementalMages.js';
import { elementalLook } from '../../src/game/ElementalTestSites.js';
import { BLOCK } from '../../src/world/Terrain.js';

const orb = (x, z, vx, vz, extra = {}) => ({ p: { x, y: 2.6, z }, v: { x: vx, y: 0, z: vz }, by: 'me', fire: false, maxima: false, ...extra });
const chest = { x: 0, y: 2.6, z: 0 };

test('incoming: only an orb that is coming AT him, in time', () => {
    assert.ok(incoming(orb(0, -10, 0, 32), chest));
    assert.equal(incoming(orb(0, -10, 0, -32), chest), null, 'going away');
    assert.equal(incoming(orb(8, -10, 0, 32), chest), null, 'passes 8 m wide');
    assert.ok(incoming(orb(1, -10, 0, 32), chest), 'passes 1 m aside: still at him');
});
test('pickOrb: nearest in reach, never his own, never one too near to answer', () => {
    const picked = pickOrb([orb(0, -9, 0, 32), orb(0, -6, 0, 32)], chest, 'm1');
    assert.equal(picked.o.p.z, -6);
    assert.equal(pickOrb([orb(0, -8, 0, 32, { by: 'm1' })], chest, 'm1'), null, 'his own');
    assert.equal(pickOrb([orb(0, -2, 0, 32)], chest, 'm1'), null, 'too near: no time to move');
    assert.equal(pickOrb([orb(0, -40, 0, 32)], chest, 'm1'), null, 'too far to be seen');
});
test('the spell an orb is, and the way back: at the thrower, a little aside and up', () => {
    assert.equal(swatSpell({ fire: true }), 'Fireball');
    assert.equal(swatSpell({ maxima: true }), 'BombardoMaxima');
    assert.equal(swatSpell({}), 'Bombardo');
    for (let r = 0; r <= 1; r += 0.25) {
        const d = backDirection({ x: 0, y: 2.7, z: 0 }, { x: 0, y: 1, z: -16 }, r);
        assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
        assert.ok(d.z < -0.97, 'goes back along the way it came');
        assert.ok(Math.abs(d.x) <= Math.sin(SWAT.SCATTER) + 1e-9);
    }
});
test('canSwat: not while casting, lifting, stunned, recovering, broke', () => {
    const v = { element: 'fire', stunT: 0 }, a = { phase: 'Chamber', parryCd: 0 };
    assert.equal(canSwat(v, a, 50), true);
    assert.equal(canSwat(v, { ...a, phase: 'Vault' }, 50), false);
    assert.equal(canSwat(v, { ...a, parryCd: 1 }, 50), false);
    assert.equal(canSwat(v, { ...a, recover: true }, 50), false);
    assert.equal(canSwat({ ...v, stunT: 1 }, a, 50), false);
    assert.equal(canSwat(v, a, 1), false);
    assert.equal(canSwat({ element: 'air', stunT: 0 }, { phase: 'Sweep', parryCd: 0 }, 50), true, 'mid-sweep he can still turn it (14.11)');
    assert.equal(canSwat({ element: 'fire', stunT: 0 }, { phase: 'Punch', parryCd: 0 }, 50), true);
});

function fixture(element, mana = 220) {
    const casts = [], sent = [], flashes = [];
    const tasks = [];
    const g = { authority: true, localId: 'me', remotes: new Map(), scene: new T.Scene(), space: {}, collision: { groundAt: () => 0, lineOfSight: () => true }, terrain: { data: { landMade: () => true, get: () => BLOCK.AIR } },
        spells: { spells: tasks, cast: (...m) => casts.push(m) }, sync: { spell: (...m) => sent.push(m) }, fx: { lightFlash: (...m) => flashes.push(m), spark() {} }, sound: { playClang() {} },
        castleLife: { byId: new Map(), _playerPos: () => ({ x: 0, y: 2, z: -16 }), _sees: () => true, _ground() {}, _steer() {}, _walkable: () => true } };
    const v = { id: 'creative-' + element + ':1', entry: { element, seed: 971207, mana, look: elementalLook(element) }, x: 0, y: 0, z: 0, yaw: 0, walk: 2, W: {}, foe: 'me', model: { setHeldTool() {} } };
    g.castleLife.byId.set(v.id, v);
    const em = new ElementalMages(g); em.init(v);
    v.elemental.phase = element === 'fire' ? 'Chamber' : 'Coil'; v.elemental.parryCd = 0;
    const task = (o, life = 2) => { const t = { life, orb: o, parry() { if (this.life <= 0) return false; this.life = 0; return true; } }; o.task = t; tasks.push(t); return t; };
    return { g, v, em, casts, sent, tasks, task, flashes, step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) em.think(v, dt); } };
}

test('a fire mage beats a Bombardo back: the orb is taken (no blast), a new one of the same spell flies back at the thrower', () => {
    const f = fixture('fire'); const o = orb(0, -8, 0, 32); const t = f.task(o);
    const mana = f.v.mana; let n = 0;
    const origRandom = Math.random; Math.random = () => 0.1; // (his die: he sees it)
    try {
        while (n < 60 && t.life > 0) { o.p.z += 32 / 60; f.step(1); n++; }
        f.step(40);
    } finally { Math.random = origRandom; }
    assert.equal(t.life, 0, 'the incoming orb was taken out of its flight');
    const back = f.casts.filter((c) => c[0] === 'Bombardo' && c[4] === f.v.id);
    assert.equal(back.length, 1, 'exactly one orb back');
    assert.ok(back[0][2].z < -0.9, 'back at the thrower (the player is on −z)');
    assert.equal(f.sent.filter((m) => m[0] === 'Bombardo').length, 1, 'told to the guests too');
    assert.ok(f.v.mana < mana + 1, 'the parry costs mana');
    assert.ok(f.v.castAtPlayers?.has('me'), 'it is combat');
});
test('an air mage parries a Fireball too — with the same spell back', () => {
    const f = fixture('air'); const o = orb(0, -8, 0, 32, { fire: true }); f.task(o);
    const origRandom = Math.random; Math.random = () => 0.1;
    try { for (let i = 0; i < 60 && f.casts.length === 0; i++) { o.p.z += 32 / 60; f.step(1); } f.step(40); } finally { Math.random = origRandom; }
    assert.ok(f.casts.some((c) => c[0] === 'Fireball' && c[4] === f.v.id));
});
test('his die: sometimes he misses — the orb flies on (not always a parry)', () => {
    const f = fixture('fire'); const o = orb(0, -8, 0, 32); const t = f.task(o);
    const origRandom = Math.random; Math.random = () => 0.99;
    try { for (let i = 0; i < 20; i++) { o.p.z += 32 / 60; f.step(1); } } finally { Math.random = origRandom; }
    assert.ok(t.life > 0 && f.casts.length === 0);
});
test('no parry: broke, mid-attack, the orb passes wide, or it is his own', () => {
    const origRandom = Math.random; Math.random = () => 0.1;
    try {
        const f1 = fixture('fire', 220); f1.v.mana = 2; const t1 = f1.task(orb(0, -8, 0, 32)); f1.step(30); assert.ok(t1.life > 0, 'out of mana');
        const f2 = fixture('fire'); f2.v.elemental.phase = 'Vault'; const t2 = f2.task(orb(0, -8, 0, 32)); f2.step(5); assert.ok(t2.life > 0 && f2.casts.length === 0, 'upside down, firing');
        const f3 = fixture('air'); const t3 = f3.task(orb(9, -8, 0, 32)); f3.step(30); assert.ok(t3.life > 0, 'passes wide');
        const f4 = fixture('air'); const t4 = f4.task(orb(0, -8, 0, 32, { by: f4.v.id })); f4.step(30); assert.ok(t4.life > 0, 'his own');
        // (the earth mage has his own controller: never a parry)
        assert.equal(canSwat({ element: 'earth', stunT: 0 }, { phase: 'rest', parryCd: 0 }, 50), false, 'the earth mage does not parry');
    } finally { Math.random = origRandom; }
});
test('the orb bursts before the blow lands: the swing finds nothing and no orb comes back', () => {
    const f = fixture('fire'); const o = orb(0, -8, 0, 32); const t = f.task(o);
    const origRandom = Math.random; Math.random = () => 0.1;
    try { f.step(3); t.life = 0; f.step(80); } finally { Math.random = origRandom; }
    assert.equal(f.casts.length, 0);
    assert.equal(f.v.elemental.swat, null, 'back to normal after the swing');
});
test('cool-down: a second orb right after is not parried', () => {
    const f = fixture('fire'); const o1 = orb(0, -8, 0, 32); f.task(o1);
    const origRandom = Math.random; Math.random = () => 0.1;
    try {
        for (let i = 0; i < 60 && f.casts.length === 0; i++) { o1.p.z += 32 / 60; f.step(1); }
        f.step(5);
        const o2 = orb(0, -9, 0, 32); const t2 = f.task(o2); f.step(8);
        assert.ok(t2.life > 0, 'the second one, inside the cool-down, flies on');
    } finally { Math.random = origRandom; }
});

test('the water mage DOUSES a thrown orb from afar: a jet, steam — no orb comes back, the water is paid', () => {
    const f = fixture('water'); f.g.terrain.data.get = () => BLOCK.WATER; f.v.elemental.scan = 0; // (water near him)
    const o = orb(0, -14, 0, 32, { fire: true }); const t = f.task(o); const mana = f.v.mana;
    const steam = []; f.g.fx.glow = { spawn: (...a) => steam.push(a) };
    const origRandom = Math.random; Math.random = () => 0.1;
    try { for (let i = 0; i < 90 && t.life > 0; i++) { o.p.z += 32 / 60; f.step(1); } f.step(50); } finally { Math.random = origRandom; }
    assert.equal(t.life, 0, 'the orb is out');
    assert.equal(f.casts.length, 0, 'nothing thrown back');
    assert.ok(steam.length > 30, 'a stream and a cloud of steam');
    assert.ok(Math.hypot(o.p.x - f.v.x, o.p.z - f.v.z) > 3.5, 'put out well before it arrived');
    assert.ok(f.v.mana < mana + 1, 'paid');
    // no water about, no tank, no gift: he cannot douse (his water is the water he has)
    const d = fixture('water'); d.v.entry.look.tank = false; d.v.gifts.hydro.h = 0; d.v.elemental.water = 0; d.v.elemental.scan = 0;
    const o2 = orb(0, -14, 0, 32); const t2 = d.task(o2);
    Math.random = () => 0.1; try { for (let i = 0; i < 30; i++) { o2.p.z += 32 / 60; d.step(1); } } finally { Math.random = origRandom; }
    assert.ok(t2.life > 0, 'dry: no douse');
});

import { BEND, bendAngle, rotateYInPlace, boltAsOrb } from '../../src/game/ElementalParry.js';
import { isDivine, DIVINE_SPELLS } from '../../src/game/ProtectionGods.js';

test('bend: the turn makes a thing miss by about BEND.MISS, a little more the nearer it is; the sign is by the die', () => {
    assert.ok(Math.abs(Math.tan(Math.abs(bendAngle(12, 0.1))) * 12 - BEND.MISS) < 0.01, 'from 12 m: 3 m of miss');
    assert.ok(Math.abs(bendAngle(6, 0.1)) > Math.abs(bendAngle(14, 0.1)), 'nearer → a bigger turn');
    assert.ok(Math.abs(bendAngle(2, 0.1)) < 0.6, 'never a wide curve even when it is close');
    assert.ok(bendAngle(10, 0.1) < 0 && bendAngle(10, 0.9) > 0);
    const v = { x: 0, y: 3, z: 10 }; rotateYInPlace(v, Math.PI / 2);
    assert.ok(Math.abs(v.x - 10) < 1e-9 && Math.abs(v.z) < 1e-9 && v.y === 3, 'turned about the vertical, y untouched');
});
test('the air mage BENDS a duel charge aside: it is turned (not caught), costs a little, the gods\' spells are not turned, and the fire mage does not bend', () => {
    const f = fixture('air'); const calls = [];
    const bolt = { id: 'b1', state: 'flying', by: 'me', spell: 'Stupefy', front: new T.Vector3(0, 2.6, -10), dir: new T.Vector3(0, 0, 1) };
    f.g.duel = { bolts: new Map([['b1', bolt]]), boltSpeed: () => 22, bendBolt: (b, ang) => { calls.push(ang); return {}; } };
    const mana = f.v.mana; let n = 0;
    const rolls = [0.3, 0.1, 0.1, 0.1]; const orig = Math.random; Math.random = () => (rolls.length ? rolls.shift() : 0.1);
    try { while (n < 90 && !calls.length) { bolt.front.z += 22 / 60; f.step(1); n++; } } finally { Math.random = orig; }
    assert.equal(calls.length, 1, 'bent once');
    assert.ok(Math.abs(calls[0]) > 0.1 && Math.abs(calls[0]) < 0.5, 'a slight turn: ' + calls[0].toFixed(2) + ' rad');
    assert.ok(mana - f.v.mana >= BEND.COST - 1, 'paid (net of the mana that comes back in the meantime)');
    // a divine spell: nothing turns it
    const g = fixture('air'); const gods = [...DIVINE_SPELLS][0]; assert.ok(isDivine(gods));
    const gb = { id: 'g1', state: 'flying', by: 'me', spell: gods, front: new T.Vector3(0, 2.6, -10), dir: new T.Vector3(0, 0, 1) }; const gc = [];
    g.g.duel = { bolts: new Map([['g1', gb]]), boltSpeed: () => 22, bendBolt: (b, ang) => { gc.push(ang); return {}; } };
    Math.random = () => 0.1; try { for (let i = 0; i < 40; i++) { gb.front.z += 22 / 60; g.step(1); } } finally { Math.random = orig; }
    assert.equal(gc.length, 0, 'a god\'s spell is not bent');
    // the fire mage has no wind
    const fm = fixture('fire'); const fc = [];
    const fb = { id: 'f1', state: 'flying', by: 'me', spell: 'Stupefy', front: new T.Vector3(0, 2.6, -10), dir: new T.Vector3(0, 0, 1) };
    fm.g.duel = { bolts: new Map([['f1', fb]]), boltSpeed: () => 22, bendBolt: (b, ang) => { fc.push(ang); return {}; } };
    Math.random = () => 0.1; try { for (let i = 0; i < 40; i++) { fb.front.z += 22 / 60; fm.step(1); } } finally { Math.random = orig; }
    assert.equal(fc.length, 0, 'only the air mage bends charges');
});
test('a thrown orb is bent in the air mage\'s mood: its velocity turns about the vertical and the orb is NOT taken', () => {
    const f = fixture('air'); const o = orb(0, -10, 0, 32); o.v = new T.Vector3(0, 0, 32); o.p = new T.Vector3(0, 2.6, -10); const t = f.task(o);
    const rolls = [0.8, 0.1, 0.4, 0.1, 0.1]; const orig = Math.random; Math.random = () => (rolls.length ? rolls.shift() : 0.1);
    try { for (let i = 0; i < 60 && Math.abs(o.v.x) < 1; i++) { o.p.z += 32 / 60; f.step(1); } } finally { Math.random = orig; }
    assert.ok(t.life > 0, 'not caught');
    assert.ok(Math.abs(o.v.x) > 1, 'its way turned: vx ' + o.v.x.toFixed(2));
    assert.ok(Math.abs(Math.hypot(o.v.x, o.v.z) - 32) < 0.01, 'the speed is the same: only the direction changed');
    assert.equal(f.casts.length, 0, 'nothing thrown back');
});
