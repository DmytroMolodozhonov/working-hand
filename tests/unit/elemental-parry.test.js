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
    assert.equal(canSwat({ element: 'air', stunT: 0 }, { phase: 'Sweep', parryCd: 0 }, 50), false);
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
        const f5 = fixture('water'); const t5 = f5.task(orb(0, -8, 0, 32)); f5.step(30); assert.ok(t5.life > 0, 'the water mage does not parry');
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
