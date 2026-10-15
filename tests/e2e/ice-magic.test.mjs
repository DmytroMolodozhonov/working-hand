/**
 * «Create an Ice Castle» and «Ice Bridge» in a real browser (Creative): the words, a stamp — the snowflake
 * floor; the hands up — the castle; its gates and chandelier; a bridge after the hand. Pictures of each go
 * to docs/screenshots/ice-magic/.
 * Run: node --test tests/e2e/ice-magic.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8241;
const dir = path.join(ROOT, 'docs/screenshots/ice-magic');
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
    fs.mkdirSync(dir, { recursive: true });
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('ice castle and ice bridge: a stamp, the floor, the hands up, the castle; a bridge after the hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // (the pictures: a camera of our own, set just before each frame is drawn)
    await page.evaluate(() => {
        const g = window.__zns.game, R = g.renderer, draw = R.render.bind(R);
        R.render = (s, c) => { const v = window.__shot; if (v && c === g.camera) { c.position.set(...v.from); c.lookAt(...v.at); c.updateMatrixWorld(true); } draw(s, c); };
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.25;
    });
    // a flat place with snow round it; the castle stands where I stand
    const site = await page.evaluate(async () => {
        const g = window.__zns.game, M = g.iceMagic, T = g.world.terrain, data = T.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 30)); };
        const me = g.character.group.position;
        for (const [dx, dz] of [[90, 0], [0, 90], [-90, 0], [0, -90], [130, 60], [-60, 130], [60, -130]]) {
            const x = Math.round(me.x + dx), z = Math.round(me.z + dz);
            g.character.group.position.set(x, g.collision.groundY(x, z) + 3.6, z);
            T.flushAround?.(x, z);
            await frames(20);
            const G = M._surface(x, z).L;
            // snow lies a little way off (the source of the ice)
            const edits = [];
            for (let sx = -3; sx <= 3; sx++) for (let sz = -3; sz <= 3; sz++) { const L = M._surface(x + 22 + sx, z + sz).L; data.set(x + 22 + sx, L, z + sz, 4); edits.push([x + 22 + sx, L, z + sz, 4]); }
            g.builder?._sendEdits?.(edits);
            g.character.group.rotation.y = Math.PI; // (facing +z: the gates that way)
            if (M.cast('IceCastle') !== 'IceCastle') { M.pending = null; M._lastCast = 0; continue; }
            M.stamp();
            if (M.magic) return { x, z, G, said: g.hud?.lastVoice };
            M._lastCast = 0;
        }
        return null;
    });
    assert.ok(site, 'a place for the castle');
    const run = (secs, lift) => page.evaluate(({ secs, lift }) => {
        const M = window.__zns.game.iceMagic;
        M.testLift = lift;
        for (let t = 0; t < secs && M.magic; t += 0.05) M.update(0.05);
        const rec = [...M.list.values()][0];
        return { f: M.magic?.f ?? 1, on: !!M.magic, rf: rec?.f, said: window.__zns.game.hud?._lastVoice };
    }, { secs, lift });
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 30)); }, n);
    const view = (from, at) => page.evaluate(({ from, at }) => { window.__shot = { from, at }; }, { from, at });
    const { x, z, G } = site;

    // 1. the snowflake floor spread from the foot
    await run(2.8, 0.1);
    await view([x - 9, G + 22, z - 26], [x, G, z + 2]);
    await frames(25);
    await page.screenshot({ path: path.join(dir, '01-ice-floor-snowflake.png') });
    // 2. half risen, after the hands
    let s = await run(4, 1.0);
    assert.ok(s.on && s.f > 0.3 && s.f < 0.75, `half way: ${JSON.stringify(s)}`);
    await view([x - 30, G + 14, z + 34], [x, G + 8, z]);
    await frames(25);
    await page.screenshot({ path: path.join(dir, '02-castle-rising.png') });
    // 3. done: the dome, the spires, the gates
    s = await run(10, 2);
    assert.equal(s.on, false, 'done');
    const done = await page.evaluate(() => { const g = window.__zns.game, M = g.iceMagic, rec = [...M.list.values()][0]; return { f: rec.f, gates: g.doors.list.has(rec.id + 'gL') && g.doors.list.has(rec.id + 'gR'), look: M.look.has(rec.id), bed: g.beds.list.has(rec.id + 'b') }; });
    assert.deepEqual(done, { f: 1, gates: true, look: true, bed: true });
    await view([x - 34, G + 16, z + 44], [x, G + 12, z]);
    await frames(30);
    await page.screenshot({ path: path.join(dir, '03-ice-castle.png') });
    // 4. inside: the hall, the throne, the stair, the chandelier
    await page.evaluate(({ x, z }) => { const g = window.__zns.game; g.character.group.position.set(x, g.character.group.position.y, z + 7); g.world.terrain.flushAround?.(x, z); }, site);
    await view([x + 1, G + 4, z + 8], [x, G + 7, z - 9]);
    await frames(40);
    await page.screenshot({ path: path.join(dir, '04-throne-hall.png') });

    // 5. the bridge: from beside the castle, 34 m away
    const br = await page.evaluate(({ x, z }) => {
        const g = window.__zns.game, M = g.iceMagic;
        const bx = x - 8, bz = z + 22; // (in front of the gates, out of the floor)
        g.character.group.position.set(bx, g.collision.groundY(bx, bz) + 3.6, bz);
        const edits = []; // (snow beside the start)
        for (let sx = -2; sx <= 2; sx++) for (let sz = 3; sz <= 6; sz++) { const L = M._surface(bx + sx, bz + sz).L; g.world.terrain.data.set(bx + sx, L, bz + sz, 4); edits.push([bx + sx, L, bz + sz, 4]); }
        g.builder?._sendEdits?.(edits);
        M._lastCast = 0;
        M.testAim = { x: bx + 34, z: bz };
        const r = M.cast('IceBridge');
        for (let t = 0; t < 8 && M.magic; t += 0.05) M.update(0.05);
        return { r, on: !!M.magic, said: g.hud?._lastVoice, bx, bz, y: g.collision.groundY(bx, bz) };
    }, site);
    assert.equal(br.r, 'IceBridge', JSON.stringify(br));
    assert.equal(br.on, false, 'the bridge is done');
    await view([br.bx + 17, br.y + 9, br.bz + 28], [br.bx + 17, br.y + 4, br.bz]);
    await frames(30);
    await page.screenshot({ path: path.join(dir, '05-ice-bridge.png') });
    // (and one can walk onto it: the ground in its middle is the deck, over the land)
    const mid = await page.evaluate(({ bx, bz, y }) => window.__zns.game.collision.groundY(bx + 17, bz) - y, br);
    assert.ok(mid > 2, `the deck in the middle is high: ${mid}`);
    assert.deepEqual(realErrors(errors), []);
});
