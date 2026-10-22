/**
 * «Вингардиум Левиоса Максима» on what is the player's own or looks its own: a house made by «Create a House»
 * is lifted and set down whole elsewhere — the same house, furnished; a wall of logs is a wall (no tree, no
 * roots); a spawn-area tree is carried as its own model and lies felled as itself.
 * Run: ZNS_TEST_PORT=8263 node --test tests/e2e/levmax-own.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8263;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Левиоса Максима: my magic house moves whole, a log wall has no roots, a spawn tree stays itself', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, LM = g.levMax, hm = g.houseMagic;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const { BLOCK } = await import('/src/world/Terrain.js');
        const me = g.character.group.position;
        const H = { at: new T.Vector3() };
        g.duel._handOf = (by, side, p, d) => { p.set(me.x, me.y - 0.3, me.z); d.copy(H.at).sub(p).normalize(); return true; };
        // (the clock of the lift run on at once: the headless page draws few frames a second)
        const run = (id, s = 30) => { for (let t = 0; t < s && LM.lifts.has(id); t += 0.05) LM.update(0.05); for (let i = 0; i < 80; i++) LM.update(0.05); };
        const lift = (desc, n) => {
            const id = g.localId + ':t' + n;
            LM.mine = { id, side: 'right', players: [], t: 0, kind: desc.k };
            const ok = LM.begin(id, g.localId, 'right', desc);
            return { id, ok, L: LM.lifts.get(id) };
        };
        const out = {};
        // 1) a house made by magic, 30 m away
        const x = Math.round(me.x + 30), z = Math.round(me.z);
        hm.testAim = { x, z };
        hm._hostStart({ kind: 'CreateHouse', at: [x, g.collision.groundY(x, z), z], c: [me.x, me.z] }, g.localId);
        for (let i = 0; i < 400 && hm.magic; i++) hm.update(0.05);
        const rec = [...hm.list.values()][0];
        const plan0 = hm.plan(rec), wall = [...plan0.own][0].split(',').map(Number);
        H.at.set(wall[0], wall[1] - 1.5, wall[2]);
        const pick = LM.pick(new T.Vector3(me.x, me.y - 0.3, me.z), H.at.clone().sub(new T.Vector3(me.x, me.y - 0.3, me.z)).normalize());
        out.pick = pick?.desc?.k + ':' + String(pick?.desc?.id).slice(0, 2);
        const chests0 = hm._chestsOf(rec.id).length, x0 = rec.x;
        const a = lift(pick.desc, 1);
        out.houseLifted = a.ok && hm.lifting.has(rec.id) && !g.doors.list.has(rec.id + 'd');
        LM._tearOut(a.L);
        a.L.pos.x += 9; // (carried 9 m on)
        LM.release(true); // (set down gently: whole)
        run(a.id);
        const plan1 = hm.plan(rec);
        let have = 0, old = 0;
        for (const c of plan1.cells) if (c[3] !== BLOCK.AIR && data.get(c[0], c[1], c[2]) === c[3]) have++;
        for (const k of plan0.own) { const [cx, cL, cz] = k.split(',').map(Number); if (!plan1.own.has(k) && data.get(cx, cL, cz) !== BLOCK.AIR) old++; }
        out.house = { moved: rec.x - x0, have, of: plan1.own.size, old, door: g.doors.list.has(rec.id + 'd'), chests: hm._chestsOf(rec.id).length, chests0, still: hm.list.has(rec.id) };
        // 2) a wall of logs: a wall, no roots
        const wx = Math.round(me.x) - 12, wz = Math.round(me.z), top = data.topLayer(wx, wz);
        for (let dz = -3; dz <= 3; dz++) for (let L = top + 1; L <= top + 5; L++) data.set(wx, L, wz + dz, BLOCK.WOOD);
        H.at.set(wx, top + 3 - 1.5, wz);
        const wp = LM.pick(new T.Vector3(me.x, me.y - 0.3, me.z), H.at.clone().sub(new T.Vector3(me.x, me.y - 0.3, me.z)).normalize());
        out.logWall = wp?.desc?.k;
        if (wp?.desc) { const b = lift(wp.desc, 2); out.roots = b.L ? b.L.group.children.filter((o) => o.isInstancedMesh).length : -1; LM.release(true); run(b.id); }
        // 3) a spawn-area tree: its own model up, and felled as itself
        const t = g.world.trees.find((q) => q.alive);
        if (t) {
            const c = lift({ k: 'tree', i: t.index }, 3);
            out.instModel = c.L.group.children.filter((o) => o.geometry === g.world.trunkMesh.geometry || o.geometry === g.world.leafMesh.geometry).length;
            LM._tearOut(c.L);
            c.L.pos.x += 6; c.L.pos.y += 4;
            c.L.vel.set(5, 0, 0);
            LM.release(false); // (let go: it falls)
            run(c.id);
            out.tree = { alive: t.alive, fallen: t.fallen, moved: Math.round(t.x - c.L.instWas.x) };
        }
        return out;
    });
    assert.equal(r.pick, 'house:m:', 'my magic house is a house to lift: ' + JSON.stringify(r));
    assert.ok(r.houseLifted, 'up it goes, its door with it: ' + JSON.stringify(r));
    assert.ok(r.house.still && r.house.moved === 9, 'the same house, 9 m on: ' + JSON.stringify(r.house));
    assert.ok(r.house.have >= r.house.of * 0.9 && r.house.old === 0, 'its blocks stand there, none left behind: ' + JSON.stringify(r.house));
    assert.ok(r.house.door && r.house.chests === r.house.chests0, 'furnished again: ' + JSON.stringify(r.house));
    assert.equal(r.logWall, 'wall', 'a wall of logs is a wall');
    assert.equal(r.roots, 0, 'no roots under a wall');
    if (r.tree) {
        assert.equal(r.instModel, 2, 'the spawn tree is carried as its own model');
        assert.ok(r.tree.alive && r.tree.fallen && r.tree.moved >= 5, 'it lies felled as itself where it fell: ' + JSON.stringify(r.tree));
    }
    assert.deepEqual(realErrors(errors), []);
});
