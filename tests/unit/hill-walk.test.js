import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRig } from '../../tools/hillrig.mjs';

/**
 * The real hills of the world's seed (20261015): people, a party of the road and a zombie go over them (tools/hillbench.mjs measures
 * them all; here the trips that once did not arrive). «Рыцари-путешественники на холмах застревают» — the road folk look only 8 m
 * ahead; HillWay now searches a way round a cliff / a pit with steep sides when they get no nearer for 10 s.
 */
const rig = await makeRig({ seed: 20261015, slopes: true });
test.after(() => rig.restore());

test('a man goes straight up and down a 45° hill, slower up than down', () => {
    // (a hill band trip of the bench: ~50 m, steepest 6 m between 35° and 45°)
    const trips = rig.pickTrips(0.7, 1.0, 3, (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
    assert.equal(trips.length, 3);
    for (const [x0, z0, x1, z1] of trips) assert.ok(rig.tripKnight(x0, z0, x1, z1).ok, `man ${x0 | 0},${z0 | 0} → ${x1 | 0},${z1 | 0}`);
    // up is slower than down: the same hill both ways
    const [x0, z0, x1, z1] = trips[0];
    const up = Math.max(rig.gy(x0, z0), rig.gy(x1, z1)) === rig.gy(x1, z1);
    const a = rig.tripKnight(x0, z0, x1, z1), b = rig.tripKnight(x1, z1, x0, z0);
    const [upT, downT] = up ? [a.tm, b.tm] : [b.tm, a.tm];
    assert.ok(upT >= downT * 0.98, `up ${upT.toFixed(1)} s, down ${downT.toFixed(1)} s`);
});

test('a zombie climbs a 45° hill of one-block steps', () => {
    const trips = rig.pickTrips(0.7, 1.0, 4, (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(), 1);
    assert.ok(trips.length >= 3);
    const z = rig.tripBody('zombie');
    for (const [x0, z0, x1, z1] of trips) assert.ok(z(x0, z0, x1, z1).ok, `zombie ${x0 | 0},${z0 | 0}`);
});

// trips of the bench's «обход» band where the party of the road used to stand at the foot of a cliff for ever
for (const [x0, z0, x1, z1] of [[539, -268, 588, -200], [650, -67, 723, -151], [418, -359, 497, -354], [728, 77, 624, 12]]) {
    test(`the party of the road goes round the cliff ${x0},${z0} → ${x1},${z1}`, () => {
        const r = rig.tripRoad(x0, z0, x1, z1);
        assert.ok(r.ok, `did not arrive (stood ${r.still} s, lagged ${r.lag | 0} m)`);
    });
}
