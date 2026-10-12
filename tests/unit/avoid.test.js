// Walkers go round the others instead of into them; in a narrow spot they wait a moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avoidStep } from '../../src/game/Avoid.js';

/** Walk from a to b (2.2 m/s) past standing bodies; returns the closest approach to any of them. */
function walk(a, b, others, room = () => true, moving = null) {
    const p = { ...a };
    let min = Infinity, waited = 0;
    for (let t = 0; t < 20; t += 0.05) {
        if (moving) moving(t, others);
        const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.2) break;
        const s = avoidStep(p, { x: dx / d, z: dz / d }, others, { maxF: d, room });
        if (s.wait) { waited += 0.05; continue; }
        p.x += s.x * 2.2 * 0.05; p.z += s.z * 2.2 * 0.05;
        for (const o of others) min = Math.min(min, Math.hypot(o.x - p.x, o.z - p.z));
    }
    return { min, p, waited };
}

test('a walker goes round a man standing in its way (and still gets where it was going)', () => {
    const r = walk({ x: 0, z: 0 }, { x: 0, z: -10 }, [{ x: 0.1, z: -5, r: 0.6 }]);
    assert.ok(r.min > 1.0, `kept clear (${r.min.toFixed(2)} m)`);
    assert.ok(Math.hypot(r.p.x, r.p.z + 10) < 0.3, 'arrived');
});

test('the side with room: a rail on the right — round on the left', () => {
    const room = (x) => x > -1.5;
    const r = walk({ x: 0, z: 0 }, { x: 0, z: -10 }, [{ x: 0, z: -5, r: 0.6 }], room);
    assert.ok(r.min > 1.0 && r.waited === 0, JSON.stringify(r));
});

test('a narrow passage blocked: it waits; once the man steps away it goes on', () => {
    const room = (x) => Math.abs(x) < 0.6;
    const others = [{ x: 0, z: -5, r: 0.6 }];
    const r = walk({ x: 0, z: 0 }, { x: 0, z: -10 }, others, room, (t, o) => { if (t > 4) o[0].x = 5; });
    assert.ok(r.waited > 1, 'waited for him');
    assert.ok(r.min > 0.9, `never walked into him (${r.min.toFixed(2)})`);
});
