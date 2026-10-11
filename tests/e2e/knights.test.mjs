/**
 * The castle knights think as a squad (KnightTactics): a wizard up on a roof — they stop
 * crowding below, take bows and stand round the place.
 * Run: node --test tests/e2e/knights.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('knights: a wizard on a roof — from the straight assault to bows and a ring round the place, then steps of planks up to him', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    await page.evaluate(() => new Promise((res) => { const g = window.__zns.game, end = g.frameCount + 40; const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50); }));
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, c = window.__castle, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const t = g.world.terrain.data;
        const cs = L.castles.get(c.id);
        g.combat.damage = () => {}; g.damageLocalPlayer = () => {}; if (g.knockback) g.knockback.add = () => {}; if (g.impact) g.impact.apply = () => 'none';
        // out on the field in front of the gate: a block tower 9 high, 4×4, nothing to climb it by
        const out = new T.Vector3(c.gate.x - c.x, 0, c.gate.z - c.z).normalize();
        const at = (k) => ({ x: Math.round(c.gate.x + out.x * k), z: Math.round(c.gate.z + out.z * k) });
        const P = at(30);
        const top0 = t.topLayer(P.x, P.z);
        for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) for (let k = 1; k <= 9; k++) t.set(P.x + dx, top0 + k, P.z + dz, 3);
        g.world.terrain.flushAround(P.x, P.z);
        const roofY = top0 + 9 - 0.5;
        // five knights after me, from the gate
        const knights = [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead).slice(0, 5);
        knights.forEach((k, i) => {
            const p = at(16);
            k.x = p.x + (i - 2) * 2.5; k.z = p.z + (i % 2) * 2; k.y = g.collision.groundY(k.x, k.z);
            k.job = 'yard'; k.post = null; k.path = null; k.investigate = null;
        });
        const ground = at(24);
        const stand = (p, y) => g.character.group.position.set(p.x + 0.5, y + 2.2, p.z + 0.5);
        cs.hostile.set(g.localId, Date.now() + 300000);
        for (const k of knights) k.foe = g.localId;
        // on the ground first: the opening move
        const t0 = performance.now();
        let first = null;
        while (performance.now() - t0 < 8000) {
            stand(ground, g.collision.groundY(ground.x, ground.z));
            first = cs.squads?.get(g.localId)?.plan || null;
            if (first) break;
            await frames(2);
        }
        // up on the roof
        const plans = new Set();
        const roles = new Set();
        let shoot = false, ring = 0, said = new Set();
        const arrows0 = g.gear.arrows.length;
        let shots = 0;
        // (game time: a slow test machine slows the knights and their plans alike)
        const t1 = performance.now(), c1 = L.clock;
        while (L.clock - c1 < 40 && performance.now() - t1 < 150000) {
            stand(P, roofY);
            const sq = cs.squads?.get(g.localId);
            if (sq?.plan) plans.add(sq.plan);
            if (sq) shots = Math.max(shots, sq.shots);
            for (const k of knights) {
                if (k.tac) roles.add(k.tac.role);
                if (k.mode === 'shoot') shoot = true;
                if (k.bubble?.text) said.add(k.bubble.text);
            }
            // the ones holding the place: round it, a few metres off, on different sides
            const watch = knights.filter((k) => k.tac?.role === 'watch' && Math.hypot(k.x - P.x, k.z - P.z) < 13);
            ring = Math.max(ring, watch.length);
            if (shoot && shots >= 2 && ring >= 1 && (plans.has('archers') || plans.has('climb'))) break;
            await frames(3);
        }
        const tool = knights.find((k) => k.fx & 1)?.model.toolKind;
        const arrows = g.gear.arrows.length - arrows0;
        // the arrows don't reach him and he doesn't come down (as if tried already): steps of planks, up after him
        const sq0 = cs.squads.get(g.localId);
        for (const id of ['archers', 'siege']) sq0.mem.failed.set(id, { n: 1, at: L.clock });
        sq0.reviewT = 0;
        let up = false, planks = 0; const tl = [];
        const t2 = performance.now(), c2 = L.clock;
        while (L.clock - c2 < 70 && performance.now() - t2 < 240000) {
            stand(P, roofY);
            const sq = cs.squads?.get(g.localId);
            if (sq?.plan) plans.add(sq.plan);
            for (const k of knights) if (k.bubble?.text) said.add(k.bubble.text);
            planks = sq?.steps?.done || planks;
            if (sq?.plan === 'climb' && (g.frameCount % 30) < 3) tl.push(Math.round((L.clock - c2) * 10) / 10 + ' ' + (sq.steps?.done ?? '-') + '/' + (sq.steps?.cells.length ?? '-') + ' ' + JSON.stringify(sq.steps?.base) + ' ' + knights.filter((k) => k.tac?.role === 'climber').map((k) => `${k.mode}@${Math.round(k.x * 10) / 10},${Math.round(k.y * 10) / 10},${Math.round(k.z * 10) / 10}`).join(' '));
            if (knights.some((k) => !k.dead && k.y > roofY - 1.5 && Math.hypot(k.x - P.x - 0.5, k.z - P.z - 0.5) < 4)) { up = true; break; }
            await frames(3);
        }
        return { tl: tl.slice(0, 60), P, roofY, up, planks, first, plans: [...plans], roles: [...roles], shoot, shots, ring, tool, arrows, said: [...said].slice(0, 20), info: JSON.stringify(knights.map((k) => [k.tac?.role, k.mode, Math.round(Math.hypot(k.x - P.x, k.z - P.z))])) };
    });
    if (process.env.KDEBUG) console.log(JSON.stringify(r, null, 1));
    assert.equal(r.first, 'assault', `the opening move (${r.first})`);
    assert.ok(r.plans.includes('archers'), `bows for one up on a roof: ${r.plans} ${r.info}`);
    assert.ok(r.roles.includes('archer') && r.roles.includes('watch'), `archers and watchers: ${r.roles} ${r.info}`);
    assert.ok(r.shoot && r.shots >= 2 && r.arrows >= 1, `they shoot (${r.shots} shots, ${r.arrows} arrows): ${r.info}`);
    assert.equal(r.tool, 'longbow', 'a bow in the hands');
    assert.ok(r.ring >= 1, `some hold the place round the tower: ${r.info}`);
    assert.ok(r.said.some((s) => /крыш|наверх|Лучник|Луки|Стрел/i.test(s)), `they call it out: ${r.said.join(' | ')}`);
    assert.ok(r.plans.includes('climb') && r.planks > 0 && r.up, `no way up: they build steps and climb after him (${r.planks} planks): ${r.plans} ${r.info}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
