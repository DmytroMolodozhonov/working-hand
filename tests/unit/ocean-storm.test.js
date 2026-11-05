// The storms over the sea (the author: «грозы и смерчи над океаном», OceanWeather.js / OceanStorm.js): only in the wind's storm; the
// same bolts and spouts on every computer; a spout is born out at sea, walks with the wind, dies in the shallows; it swirls and draws
// in, the core lifts; it pushes me (not deep under the water, not when absolutely steady) and the ships (the host).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SeaIndex } from '../../src/world/Sea.js';
import { spoutsOf, boltsOf, spoutPush, stormWeight, OCEAN } from '../../src/world/OceanWeather.js';
import { windAt, WIND } from '../../src/world/SeaWind.js';

const SEED = 777;
const idx = new SeaIndex(SEED);
const sea = idx.nearest(0, 0, 8);

/** The first stormy moment (natural wind ≥ 8.5) with a spout on that sea. */
function stormWithSpout() {
    for (let t = 0; t < 86400 * 20; t += 15) if (stormWeight(SEED, t) >= 1 && spoutsOf(idx, sea, SEED, t).some((s) => s.k > 0.5)) return t;
    return null;
}

test('only a storm brings them: in calm weather no bolt, no spout', () => {
    let calm = null;
    for (let t = 0; t < 86400; t += 60) if (windAt(SEED, t).level <= 4) { calm = t; break; }
    assert.ok(calm != null);
    assert.equal(stormWeight(SEED, calm), 0);
    assert.equal(boltsOf(idx, sea, SEED, calm, calm + 30).length, 0);
    // a spout is born only when the storm blows (it may live on a little after it)
    for (let t = 0; t < 86400 * 3; t += 30) for (const s of spoutsOf(idx, sea, SEED, t)) assert.ok(stormWeight(SEED, s.born) >= 0.5, 'born in a storm');
});

test('the same on every computer; bolts in the sea, off the shore; spouts deep out, never on land', () => {
    const t = stormWithSpout();
    assert.ok(t != null, 'a storm with a spout happens');
    assert.deepEqual(spoutsOf(idx, sea, SEED, t), spoutsOf(new SeaIndex(SEED), sea, SEED, t));
    let bolts = 0;
    for (let k = 0; k < 600; k += 20) for (const b of boltsOf(idx, sea, SEED, t + k, t + k + 20)) { bolts++; assert.ok(idx.signedDist(b.x, b.z) >= OCEAN.BOLT_MIN_S, 'in the sea'); }
    assert.ok(bolts > 3, `lightning in a storm: ${bolts}`);
    for (let k = 0; k < 400; k += 5) for (const s of spoutsOf(idx, sea, SEED, t + k)) assert.ok(idx.signedDist(s.x, s.z) > OCEAN.DIE_S - 8, 'over the water');
});

test('a spout walks with the wind and grows, then fades', () => {
    const t = stormWithSpout();
    const a = spoutsOf(idx, sea, SEED, t).find((s) => s.k > 0.5);
    const later = spoutsOf(idx, sea, SEED, t + 10).find((s) => s.id === a.id);
    if (later) {
        const moved = Math.hypot(later.x - a.x, later.z - a.z);
        assert.ok(moved > 10 && moved < 120, `it walks: ${moved}`);
    }
    // its strength: 0 at birth, grows, fades at the end
    let born = null;
    for (let k = -200; k < 0; k += 1) { const s = spoutsOf(idx, sea, SEED, t + k).find((x) => x.id === a.id); if (s) { born = s; break; } }
    assert.ok(born && born.k < 0.2, 'it starts weak');
});

test('its wind: swirls round, draws in, the core lifts; out of reach — nothing', () => {
    const sp = { x: 0, z: 0, k: 1, spin: 1 };
    const edge = spoutPush(sp, 30, 0, 0), core = spoutPush(sp, 2, 0, 0);
    assert.ok(edge && core);
    assert.ok(Math.abs(edge.vz) > Math.abs(edge.vx) * 0.5, 'round');
    assert.ok(edge.vx < 0, 'in');
    assert.ok(core.vy > 10 && core.core, 'the core lifts');
    assert.equal(edge.vy, 0);
    assert.equal(spoutPush(sp, OCEAN.PULL + 1, 0, 0), null);
    assert.equal(spoutPush({ ...sp, k: 0 }, 5, 0, 0), null, 'a spout not yet formed');
    const back = spoutPush({ ...sp, spin: -1 }, 30, 0, 0);
    assert.ok(Math.sign(back.vz) === -Math.sign(edge.vz), 'turns its own way');
});

test('OceanStorm on me: pushed and lifted near a spout; nothing deep under the water or when absolutely steady', async () => {
    const THREE = await import('three');
    const { OceanStorm } = await import('../../src/game/OceanStorm.js');
    const { WATER_LEVEL_Y } = await import('../../src/world/Terrain.js');
    const mk = (y, o = {}) => {
        const ch = { group: { position: new THREE.Vector3(5, WATER_LEVEL_Y + y, 0) }, verticalVelocity: 0 };
        const g = { character: ch, knockback: new THREE.Vector3(), world: {}, steady: {}, ...o };
        const os = new OceanStorm(g);
        os.spouts = [{ id: 'a', x: 0, z: 0, k: 1, spin: 1, d: 5 }];
        os._pushMe(0.1, ch.group.position, WATER_LEVEL_Y);
        return { g, ch };
    };
    const at = mk(0.5);
    assert.ok(at.g.knockback.length() > 0.5 && at.ch.verticalVelocity > 5, 'swirled and lifted');
    const deep = mk(-6);
    assert.equal(deep.g.knockback.length(), 0, 'deep under the water: calm');
    const firm = mk(0.5, { steady: { absolute: true } });
    assert.equal(firm.g.knockback.length(), 0, 'absolute steadiness');
    const inside = mk(0.5, { world: { indoor: 1 } });
    assert.equal(inside.g.knockback.length(), 0, 'in a cabin');
    assert.ok(WIND.STORM_AT >= 8);
});
