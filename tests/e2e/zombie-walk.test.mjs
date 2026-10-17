/**
 * A zombie in a real browser (Creative): it walks face first to the player, its legs stepping, comes up close,
 * turns to him and swings (arms up — then down). Side-view pictures go to ZNS_SHOTS (docs/creatures/zombies/).
 * Run: ZNS_TEST_PORT=8193 ZNS_SHOTS=docs/creatures/zombies node --test tests/e2e/zombie-walk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
const SHOTS = process.env.ZNS_SHOTS || null;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

test('a zombie walks face first to the player and swings at him', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const id = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        g.zombieSpawn.night = () => 1; // (the sun would burn it: the test sees it walk)
        ch.setFirstPerson(false);
        g.cameraMode = 'third';
        const p = ch.group.position;
        g.cameraOffset = new T.Vector3(7, 1.2, 2.5); // (from the side)
        const zp = new T.Vector3(p.x, 0, p.z - 9);
        zp.y = g.collision.groundY(zp.x, zp.z) + 1;
        const z = g._createZombie(zp);
        z.group.rotation.y = 0; // (its back to the player at first: it must turn round)
        window.__zt = { face: [], walk: 0 };
        const tick = () => {
            if (!g.zombieById.has(z.id)) return;
            const q = z.group.position, d = new T.Vector3(p.x - q.x, 0, p.z - q.z);
            if (d.length() > 2) { const f = new T.Vector3(0, 0, 1).applyQuaternion(z.group.quaternion); window.__zt.face.push(f.dot(d.normalize())); }
            window.__zt.walk = z.walkCycle;
            requestAnimationFrame(tick);
        };
        tick();
        return z.id;
    });
    await page.waitForFunction((zid) => { const z = window.__zns.game.zombieById.get(zid), p = window.__zns.game.character.group.position; return Math.hypot(z.group.position.x - p.x, z.group.position.z - p.z) < 5; }, id, { timeout: 90000 });
    await shot(page, 'walk.png');
    await page.waitForFunction((zid) => { const z = window.__zns.game.zombieById.get(zid); return z.isAttacking && z.attackAnimProgress > 0.45; }, id, { timeout: 90000 });
    await shot(page, 'swing.png');
    const r = await page.evaluate(() => {
        const f = window.__zt.face.slice(Math.floor(window.__zt.face.length / 3)); // (after it turned round)
        return { facing: f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0, worst: Math.min(...f), walk: window.__zt.walk };
    });
    assert.ok(r.facing > 0.9 && r.worst > 0.5, `walks face first (${r.facing.toFixed(2)}, worst ${r.worst.toFixed(2)})`);
    assert.ok(r.walk > 6, `its legs step (${r.walk.toFixed(1)})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
