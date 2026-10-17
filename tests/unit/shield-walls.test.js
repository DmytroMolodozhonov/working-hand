import test from 'node:test';
import assert from 'node:assert/strict';
import { WARD, wardsOf, clipStep, pushOut } from '../../src/game/ShieldWalls.js';
import { crowdStep } from '../../src/game/CrowdSources.js';

const game = (shield, remotes = new Map()) => ({
    frameCount: 0, remotes,
    combat: { shield },
    character: { group: { position: { x: 0, y: 1.95, z: 0 } }, getHandWorldPosition: (s, o) => Object.assign(o, { x: 0, y: 1.5, z: -0.6 }) },
});

test('a player\'s dome is a wall for every walker (crowdStep): it goes round it, never in', () => {
    const g = game({ type: 2, left: 10 });
    const me = { id: 41 }, p = { x: 8, y: 0, z: 0.3 };
    let minD = Infinity;
    for (let i = 0; i < 900; i++) {
        g.frameCount = i;
        const gx = -10 - p.x, gz = -p.z, d = Math.hypot(gx, gz);
        if (d < 0.5) break;
        const a = crowdStep(g, me, p, gx / d, gz / d, d, { r: 0.5, speed: 2, dt: 1 / 60 });
        if (a) { p.x += a.x * 2 / 60; p.z += a.z * 2 / 60; }
        minD = Math.min(minD, Math.hypot(p.x, p.z));
    }
    assert.ok(minD >= WARD.DOME_R + 0.5 - 0.05, `came to ${minD.toFixed(2)} m of the middle`);
    assert.ok(p.x < -5, `got round it (x ${p.x.toFixed(1)})`);
});

test('a walker after the player under his dome stands at the dome; one inside is put out', () => {
    const w = [{ x: 0, y: 0, z: 0, r: WARD.DOME_R, owner: 'me', dome: true }];
    assert.equal(clipStep({ x: 3.2, y: 0, z: 0 }, -1, 0, 0.5, 3.2, w), null);
    const out = clipStep({ x: 1, y: 0, z: 0 }, -1, 0, 0.5, 5, w);
    assert.ok(out.x > 0.9, 'inside: it walks out');
    const p = { x: 1, y: 0, z: 0 };
    pushOut(p, 0.5, w, 1);
    assert.ok(Math.abs(p.x - (WARD.DOME_R + 0.5)) < 1e-6);
    // the owner himself is not stopped by his own dome; another player is (Game._resolveMe)
    const q = { x: 1, y: 0, z: 0 };
    assert.ok(!pushOut(q, 0.6, w, 1, 'me'));
});

test('the hand shield and the other players\' shields are walls too (as the network tells them)', () => {
    const remotes = new Map([[7, { position: { x: 20, y: 1.95, z: 0 }, combat: { shield: 2, shieldLeft: 3 } }]]);
    const g = game({ type: 1, side: 'right', left: 5 }, remotes);
    const L = wardsOf(g);
    assert.equal(L.length, 2);
    assert.ok(L.some((w) => w.owner === 'me' && !w.dome && Math.abs(w.z + 0.6) < 1e-6));
    assert.ok(L.some((w) => w.owner === '7' && w.dome && w.x === 20));
    g.combat.shield = null; g.frameCount++;
    assert.equal(wardsOf(g).length, 1);
});
