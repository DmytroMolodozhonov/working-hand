import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseService } from '../../src/input/PoseService.js';

test('camera capture times remain steady after an hour; duplicates, old frames and delayed batches never become 1 ms movements', t => {
    let now = 1000, wall = 1800000000000;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(Date, 'now', () => wall);
    const p = new PoseService(), times = [];
    p._handleResult = r => times.push(r.ts);
    for (let i = 0; i < 54000; i++) {
        const r = { t: wall - 80, hands: [], cost: 20 };
        p._onNative(r);
        if (i % 100 === 0) {
            p._onNative(r); // same camera picture resent
            p._onNative({ ...r, t: wall - 1000 }); // buffered before the latest picture
        }
        now += 1000 / 15; wall += 1000 / 15;
    }
    assert.equal(times.length, 54000);
    for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - 1000 / 15) < 0.001);
    assert.equal(p.stats.nativeRejected, 1080);
    // After a long stall only a fresh capture resumes tracking.
    now += 5000; wall += 5000;
    p._onNative({ t: wall - 2000, hands: [] });
    assert.equal(times.length, 54000);
    p._onNative({ t: wall - 60, hands: [] });
    assert.equal(times.length, 54001);
});

test('a system clock correction does not freeze the camera for the remainder of the session', t => {
    let now = 1000, wall = 1800000000000;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(Date, 'now', () => wall);
    const p = new PoseService(), times = [];
    p._handleResult = r => times.push(r.ts);
    p._onNative({ t: wall - 50, hands: [] });
    now += 100; wall -= 10000;
    p._onNative({ t: wall - 50, hands: [] });
    assert.equal(times.length, 2);
    assert.equal(times[1] - times[0], 100);
});
