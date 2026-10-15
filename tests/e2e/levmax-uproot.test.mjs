/**
 * «Вингардиум Левиоса Максима» on a piece of a wall: it does not come by itself — held still, it
 * stays; rocked to and fro with the wand and pulled up (like a tooth), it tears out and is carried;
 * let go, it falls and lies as a heap. (The hand is scripted: duel._handOf.)
 * Run: ZNS_TEST_PORT=8251 node --test tests/e2e/levmax-uproot.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8251;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a piece of a wall: still — it stays; rocked and pulled — it tears out, flies, falls into a heap', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const me = g.character.group.position;
        const x0 = Math.round(me.x) + 9, z0 = Math.round(me.z);
        const top = data.topLayer(x0, z0);
        const wall = [];
        const stone = (await import('/src/world/Terrain.js')).BLOCK.CS_GREY;
        for (let dz = -3; dz <= 3; dz++) for (let L = top + 1; L <= top + 6; L++) { data.set(x0, L, z0 + dz, stone); wall.push([x0, L, z0 + dz]); }
        // the scripted hand: at the chest, pointing at the wall; yaw / pitch as set
        const H = { yaw: 0, pitch: 0 };
        const aimAt = new T.Vector3(x0, top + 3 - 1.5, z0);
        g.duel._handOf = (by, side, p, d) => {
            p.set(me.x, me.y - 0.3, me.z);
            const f = aimAt.clone().sub(p).normalize();
            const yaw = Math.atan2(f.x, f.z) + H.yaw, pitch = Math.asin(f.y) + H.pitch;
            d.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
            return true;
        };
        const id = g.localId + ':mt';
        g.levMax.mine = { id, side: 'right', players: [], t: 0, kind: 'wall' };
        const ok = g.levMax.begin(id, g.localId, 'right', { k: 'wall', c: [x0, top + 3, z0] });
        const L = g.levMax.lifts.get(id);
        const n = L?.cells?.length || 0;
        const gone = L ? L.cells.every((c) => data.get(c[0], c[1], c[2]) === 0) : false;
        const boxes = L?.boxes?.length || 0;
        await frames(3);
        // held still (pointing up, pulling): it stays
        H.pitch = 0.4;
        const t0 = performance.now();
        while (performance.now() - t0 < 3000) await frames(1);
        const stillPhase = L.phase, stillLoose = L.loose;
        // rocked to and fro and pulled up
        const t1 = performance.now();
        // (to and fro every few frames: the headless page draws few frames a second)
        for (let i = 0; L.phase === 'loosen' && performance.now() - t1 < 60000; i++) {
            H.yaw = Math.floor(i / 4) % 2 ? 0.15 : -0.15;
            await frames(1);
        }
        const torn = L.phase, tookS = (performance.now() - t1) / 1000, dbg = { e: L.wig?.effort, rocks: L.wig?.rocks, ten: L.wig?.tension, need: L.need, fc: g.frameCount };
        H.yaw = 0;
        await frames(30);
        const y = L.pos.y - L.base.y;
        // let go: it falls
        g.levMax.release(false);
        const t2 = performance.now();
        while (g.levMax.lifts.has(id) && performance.now() - t2 < 8000) await frames(1);
        const t3 = performance.now();
        while ((g.levMax.pending.length || g.levMax.shards.length) && performance.now() - t3 < 60000) await frames(1);
        let heap = 0;
        for (let x = x0 - 8; x <= x0 + 8; x++) for (let z = z0 - 8; z <= z0 + 8; z++) for (let Ly = top - 3; Ly <= top + 30; Ly++) if (data.get(x, Ly, z) === stone) heap++;
        return { dbg, ok, n, gone, boxes, stillPhase, stillLoose, torn, tookS, y, landed: !g.levMax.lifts.has(id), heap, wall: wall.length };
    });
    assert.ok(r.ok && r.n >= 9 && r.n < r.wall, JSON.stringify(r));
    assert.ok(r.gone && r.boxes >= 1, 'its blocks leave the wall, it has a collision box: ' + JSON.stringify(r));
    assert.equal(r.stillPhase, 'loosen', 'held still it does not come by itself: ' + JSON.stringify(r));
    assert.ok(r.stillLoose === 0, JSON.stringify(r));
    assert.equal(r.torn, 'carry', 'rocked and pulled — torn out: ' + JSON.stringify(r));
    assert.ok(r.dbg.rocks >= 4, 'not at once: ' + JSON.stringify(r));
    assert.ok(r.landed, JSON.stringify(r));
    assert.ok(r.heap > r.wall - r.n, 'a heap of its blocks lies there: ' + JSON.stringify(r));
});
