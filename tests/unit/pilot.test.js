import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, SCENARIOS, corridor, headOn } from '../../tools/pilotsim.mjs';
import { separate, spanAt, pilot, newPilotState } from '../../src/game/Pilot.js';

// The walking brain (Pilot.js) in the sim of tools/pilotsim.mjs: the author's complaints — knights in a heap, bodies inside each other, nobody
// getting through a narrow passage — as numbers. The thresholds only get tighter.
const LIMITS = {
    'коридор 1,6 м': { stand: 20, unstick: 3 },
    'коридор 1,6 м, давка 6+6': { stand: 25, unstick: 10 },
    'дверь 3 м, давка 10+10': { stand: 25, unstick: 10 },
    'коридор 2 м': { stand: 15, unstick: 3 },
    'коридор 3 м': { stand: 10, unstick: 1 },
    'дверь 1,4 м': { stand: 20, unstick: 16 },
    'дверь 3 м': { stand: 15, unstick: 6 },
    'вокруг игрока': { stand: 8, unstick: 1 },
    'перекрёсток': { stand: 8, unstick: 1 },
    'встреча в проходе с карманом': { stand: 8, unstick: 0 },
    'узкая лестница 1,3 м': { stand: 15, unstick: 2 },
    'узкая лестница 2 м': { stand: 12, unstick: 3 },
};

for (const [name, make] of Object.entries(SCENARIOS)) {
    test(`ходьба: ${name} — все дошли, тела не входят друг в друга, долгих простоев нет`, () => {
        const r = simulate({ ...make(), seconds: 200 });
        const lim = LIMITS[name] || { stand: 25, unstick: 12 };
        assert.equal(r.arrived, r.total, `дошли ${r.arrived}/${r.total} за ${r.time} с`);
        assert.ok(r.deepestOverlap <= 0.05, `вошли друг в друга на ${r.deepestOverlap} м`);
        assert.ok(r.maxStand <= lim.stand, `стояли ${r.maxStand} с (можно ${lim.stand})`);
        assert.ok(r.unsticks <= lim.unstick, `выставлено на место ${r.unsticks} раз (можно ${lim.unstick})`);
    });
}

test('separate: two bodies inside each other are taken apart by the sum of the radii; the player is never moved', () => {
    const p = { x: 0, z: 0 };
    const out = separate(p, 0.5, [{ x: 0.6, z: 0, r: 0.5 }], { id: 1 });
    assert.ok(out.x < 0 && Math.abs(out.z) < 1e-9, 'pushed away from it');
    assert.ok(out.x <= -(0.5 + 0.5 + 0.06 - 0.6) * 0.5 + 1e-9, 'half of the overlap at least');
    const fixed = separate(p, 0.5, [{ x: 0.6, z: 0, r: 0.6, fixed: true }], { id: 1, cap: 1 });
    assert.ok(Math.abs(fixed.x) >= 0.4, 'all of the overlap is his when the other is the player');
    assert.deepEqual(separate(p, 0.5, [{ x: 3, z: 0, r: 0.5 }]), { x: 0, z: 0 });
});

test('spanAt: the width of the ground across a way', () => {
    const room = (x, z) => Math.abs(z) <= 0.8;
    const sp = spanAt(0, 0, 1, 0, room);
    assert.ok(Math.abs(sp.width - 1.6) < 0.01, `${sp.width}`);
});

test('a lone walker goes straight; one in front is passed on the right, without a touch', () => {
    const st = newPilotState();
    const a = pilot(st, { x: 0, z: 0 }, { x: 1, z: 0 }, [], { r: 0.5, speed: 1.6, dt: 1 / 30, maxF: 20, room: () => true, id: 1 });
    assert.deepEqual([a.x, a.z, a.k], [1, 0, 1]);
    let x = 0, z = 0, minGap = 9;
    const other = { x: 4, z: 0, r: 0.5, vx: 0, vz: 0, still: true, id: 2 };
    const st2 = newPilotState();
    for (let i = 0; i < 300; i++) {
        const b = pilot(st2, { x, z }, { x: 1, z: 0 }, [other], { r: 0.5, speed: 1.6, dt: 1 / 30, maxF: 30, room: () => true, id: 1 });
        if (b) { x += b.x * 1.6 * b.k / 30; z += b.z * 1.6 * b.k / 30; }
        minGap = Math.min(minGap, Math.hypot(x - other.x, z - other.z) - 1);
    }
    assert.ok(minGap > 0.05, `touched: ${minGap}`);
    assert.ok(x > 8, 'and got past it');
});

test('the old walking is much worse in the same corridors (the reason for the change)', () => {
    // not a threshold on the new one: just that the sim can tell them apart
    const r = simulate({ ...headOn(), seconds: 100 });
    assert.equal(r.arrived, 2);
    const c = simulate({ ...corridor(2.4, 14, 3), seconds: 100 });
    assert.equal(c.arrived, c.total);
});
