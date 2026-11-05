/** «Breakthrough» in a cave: the wall stands on the floor where the hero stands, not on the surface above the ceiling
 * (the author: «я был в пещере — пыль есть, стены нет»). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8313;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the wall rises on the cave floor, under the roof', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, d = g.terrain.data, ch = g.character;
        const heroL = Math.round(ch.group.position.y - 1.5);
        const px = Math.round(ch.group.position.x), pz = Math.round(ch.group.position.z);
        const STONE = 3; // (the world's stone block)
        for (let x = px - 12; x <= px + 12; x++) for (let z = pz - 12; z <= pz + 12; z++) d.set(x, heroL + 8, z, STONE); // (a roof: the column's top is above the floor now)
        const yaw = ch.group.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const cx = Math.round(px + fx * 3.5), cz = Math.round(pz + fz * 3.5);
        g._bt = {};
        g._raiseWall(false);
        await new Promise((res) => setTimeout(res, 12000));
        return { heroL, floor: d.floorBelow(cx, cz, heroL + 1), onFloor: d.get(cx, heroL + 1, cz), underRoof: d.get(cx, heroL + 2, cz), aboveRoof: d.get(cx, heroL + 9, cz) };
    });
    assert.notEqual(r.onFloor, 0, 'wall block stands on the floor');
    assert.equal(r.aboveRoof, 0, 'nothing was built on top of the roof');
});
