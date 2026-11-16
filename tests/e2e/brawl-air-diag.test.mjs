/**
 * Диагностика мага воздуха в «Битве существ» (автор 17.11: «стоят как истуканы, медленно соображают»): один маг воздуха против рыцаря и зомби —
 * раз в 0,5 с пишется, что он делает (фаза, режим, мана, полёт, цель, расстояние, лежит ли враг, сколько секунд без атаки), и что вышло (касты, толчки, подъёмы).
 * Run: ZNS_START_TIMEOUT=600000 node --test tests/e2e/brawl-air-diag.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8201;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('air mage diagnostics', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), out = { log: [] };
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, L = g.castleLife, EM = g.elementalMages;
        const air = B.spawn('air', 'A', -14, 0);
        B.spawn('knight', 'B', 14, -3); B.spawn('zombie', 'B', 14, 3); B.spawn('zombie', 'B', 16, 0);
        await sleep(1500);
        const v = L.byId.get(air.id);
        const casts = {}, count = (k) => { casts[k] = (casts[k] || 0) + 1; };
        const origCast = EM.cast.bind(EM); EM.cast = (vv, name, ...a) => { if (vv === v) count('cast:' + name); return origCast(vv, name, ...a); };
        const origFan = EM.gustFan.bind(EM); EM.gustFan = (vv, ...a) => { if (vv === v) count('gustFan'); return origFan(vv, ...a); };
        const origLift = EM.airLift.bind(EM); EM.airLift = (vv, ...a) => { const ok = origLift(vv, ...a); if (vv === v) count('airLift:' + ok); return ok; };
        const ci = g.creatureImpact, origApply = ci.apply.bind(ci);
        ci.apply = (c, o) => { const res = origApply(c, o); if (o?.by === v.id) count('impact:' + o.spell + ':' + res); return res; };
        const origLiftC = B.liftCreature.bind(B); B.liftCreature = (vv, ref) => { const ok = origLiftC(vv, ref); count('liftCreature:' + ok); return ok; };
        out.started = B.start();
        const t0 = performance.now();
        let lastPhase = '';
        for (let i = 0; i < 1200 && B.state === 'fight' && !v.dead; i++) {
            await sleep(500);
            const a = v.elemental || {}, foe = v.foe ? B.foePos(v.foe) : null;
            const d = foe ? Math.round(Math.hypot(foe.x - v.x, foe.z - v.z)) : null;
            out.log.push([Math.round((performance.now() - t0) / 1000), 'f' + g.frameCount, a.phase, v.mode, Math.round(v.mana), v.fly ? 'fly' : '', v.foe ? v.foe.slice(0, 8) : 'nofoe', d, EM.foeLying(v) ? 'LIES' : '', ((performance.now() - (a.atkAt || performance.now())) / 1000).toFixed(1), a.recover ? 'recover' : '', v.stunT > 0 ? 'stun' : '', v.vy ? 'vy' : '', v.reactLag ? JSON.stringify(v.reactLag) : '', v.engage?.role || '', Math.round(v.hp)].join(' '));
            if (i > 160) break;
        }
        out.casts = casts; out.state = B.state; out.alive = B.aliveCount(); out.hp = v.hp; out.dead = v.dead;
        out.reactKeys = Object.keys(v).filter((k) => /react|lag|ready|engage|prep|castCd|wt$/.test(k)).map((k) => k + '=' + (typeof v[k] === 'object' ? JSON.stringify(v[k])?.slice(0, 80) : v[k]));
        return out;
    });
    fs.writeFileSync(process.env.DIAG_OUT || '/tmp/air-diag.json', JSON.stringify(r, null, 1));
    console.log('DONE', JSON.stringify({ casts: r.casts, state: r.state, hp: r.hp, dead: r.dead, lines: r.log.length }));
    assert.ok(r.started);
});
