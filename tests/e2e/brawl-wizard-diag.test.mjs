/**
 * Обычные маги в «Битве существ» (автор 17.11: «при встрече почти никак не воюют и не атакуют, просто бегают рядом»; «так же реагируют на магов стихий»):
 * маг против мага и сильный маг против мага воздуха, ~40 с каждый бой; раз в 0,5 с — что делает каждый (режим, мана, prep, расстояние, видит ли), сколько заклинаний выпущено.
 * Run: ZNS_START_TIMEOUT=900000 node --test tests/e2e/brawl-wizard-diag.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8208;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('ordinary mages fight each other and an elemental mage in «Битва существ»', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await page.addInitScript(() => { window.__ZNS_SHOT_FAST__ = true; });
    await page.reload(); await page.waitForFunction(() => !!window.__zns);
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const out = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, L = g.castleLife, res = {};
        for (const [a, b] of [['wizard', 'wizard'], ['archmage', 'air']]) {
            B.sweep?.(); await sleep(800);
            const fa = B.spawn(a, 'A', -12, 0), fb = B.spawn(b, 'B', 12, 0);
            await sleep(1500);
            const va = L.byId.get(fa.id), vb = L.byId.get(fb.id), bolts = {}, log = [];
            const add = g.duel._addBolt.bind(g.duel);
            g.duel._addBolt = (o) => { if (o?.by === va.id || o?.by === vb.id) bolts[o.by + ':' + o.spell] = (bolts[o.by + ':' + o.spell] || 0) + 1; return add(o); };
            const sc = g.spells.cast.bind(g.spells);
            g.spells.cast = (name, o, d, s, by, ...r) => { if (by === va.id || by === vb.id) bolts[by + ':cast:' + name] = (bolts[by + ':cast:' + name] || 0) + 1; return sc(name, o, d, s, by, ...r); };
            const hp0 = [va.hp, vb.hp];
            const started = B.start(); log.push(`start ${started} why ${B.why} state ${B.state} alive ${JSON.stringify(B.aliveCount())} roster ${[...B.roster.keys()].join(',')}`);
            for (let t = 0; t < 80 && B.state === 'fight'; t++) {
                await sleep(500);
                if (t % 4 === 0) for (const v of [va, vb]) log.push(`${t / 2}s ${v.id} hp ${v.hp | 0} m ${v.mana | 0} mode ${v.mode} prep ${v.prep?.spell || '-'} foe ${v.foe} d ${v.foe ? Math.hypot(v.x - (v === va ? vb : va).x, v.z - (v === va ? vb : va).z).toFixed(1) : '-'} keep ${!!v.keepAway} cmd ${v.cmd?.kind || '-'} job ${v.job || '-'} state ${v.wiz?.state || v.fightState || '-'} wiz ${!!v.wizard} cd ${(v.castCd ?? 0).toFixed(1)} wt ${v.wt?.role || '-'} eng ${v.engage ? v.engage.t.toFixed(1) + '/' + v.engage.role : '-'} hostile ${v.foe ? ((v.cs?.hostile?.get(v.foe) || 0) > Date.now()) : '-'} ready ${(() => { const F = L.wizards?.fight, other = v === va ? vb : va; if (!F || !v.foe || v.element) return '-'; const fp = L._playerPos(v.foe), d = Math.hypot(fp.x - v.x, fp.z - v.z); return F._castReady(v, d) + '/' + F.clearShot(v, fp) + '/fil' + F._friendInLine(v, fp) + ' range ' + v.W?.range; })()}`);
            }
            g.duel._addBolt = add; g.spells.cast = sc;
            res[a + '_vs_' + b] = { hp0, hp1: [va.dead ? 0 : va.hp, vb.dead ? 0 : vb.hp], bolts, log: log.slice(0, 40) };
        }
        return res;
    });
    console.log(JSON.stringify(out, null, 1));
    assert.ok(out);
});
