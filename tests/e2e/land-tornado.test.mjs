/**
 * The land tornado in the real game (the author 07.11): called on dry land it stands, tears a wooden hut (roof first), leaves the ground only two thin layers deep, and falls apart the moment its foot is over water.
 * Run: node --test tests/e2e/land-tornado.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8200;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('land tornado: tears a hut, spares the rock, dies in water', { timeout: 900000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const { BLOCK } = await import('/src/world/Terrain.js');
        const out = {};
        const data = g.world.terrain.data, p = g.character.group.position;
        const cx = Math.round(p.x) + 30, cz = Math.round(p.z);
        const gy = data.topLayer(cx, cz);
        // a wooden hut: a floor, four walls 3 high, a roof
        const hut = [];
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
            const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
            data.set(cx + dx, gy + 1, cz + dz, BLOCK.PLANKS); hut.push([cx + dx, gy + 1, cz + dz]);
            if (wall) for (let h = 2; h <= 4; h++) { data.set(cx + dx, gy + h, cz + dz, BLOCK.PLANKS); hut.push([cx + dx, gy + h, cz + dz]); }
            data.set(cx + dx, gy + 5, cz + dz, BLOCK.ROOF_RED); hut.push([cx + dx, gy + 5, cz + dz]);
        }
        const count = () => hut.filter(([x, L, z]) => data.get(x, L, z) === BLOCK.PLANKS || data.get(x, L, z) === BLOCK.ROOF_RED).length;
        out.hut0 = count();
        // the stone under: a deep rock cell must stay
        out.rock0 = data.get(cx, gy - 6, cz);
        out.place = g.landTornado.placeFor(p, 0) ? 'land' : 'none';
        const { TORNADO } = await import('/src/world/TornadoWeather.js');
        TORNADO.SUMMON_ROAM[0] = 0; TORNADO.SUMMON_ROAM[1] = 0; // (it stands on the hut: the test wants the tearing, not the wandering)
        g.landTornado.summon({ x: cx, z: cz }, 'test', 0);
        for (let i = 0; i < 160; i++) { await sleep(250); g.landTornado._tearT = 0; }
        out.listed = g.landTornado.list.length;
        out.k = g.landTornado.list[0]?.k;
        out.funnel = !!g.landTornado.fx?.slots?.some((s) => s.funnel.visible);
        out.hut1 = count();
        out.rock1 = data.get(cx, gy - 6, cz);
        out.roofGone = hut.filter(([x, L, z]) => L === gy + 5 && data.get(x, L, z) !== BLOCK.ROOF_RED).length;
        // water: the foot over a pond → gone for good
        g.landTornado.summoned.length = 0; g.landTornado.dead.clear();
        const wx = cx + 60, wz = cz;
        const wy = data.topLayer(wx, wz);
        for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let L = wy - 2; L <= wy; L++) data.set(wx + dx, L, wz + dz, BLOCK.WATER);
        out.wet = g.landTornado.wetAt(wx, wz);
        out.placeNearPond = g.landTornado.placeFor({ x: wx - 5, y: 5, z: wz }, -Math.PI / 2) ? 'land' : 'none'; // (facing +x? yaw −90°: forward = +x … into the pond)
        g.landTornado.summon({ x: wx, z: wz }, 'test2', 0);
        await sleep(9000);
        out.afterWater = g.landTornado.list.filter((s) => s.id.startsWith('twister:test2')).length;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.place, 'land');
    assert.ok(r.listed >= 1 || r.hut1 < r.hut0, 'it stood');
    assert.ok(r.hut1 < r.hut0, `the hut was torn: ${r.hut0} → ${r.hut1}`);
    assert.ok(r.roofGone > 0, 'the roof went (topmost first)');
    assert.equal(r.rock1, r.rock0, 'the rock under was not touched');
    assert.equal(r.wet, true);
    assert.equal(r.afterWater, 0, 'it cannot enter the water');
});
