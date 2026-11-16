/**
 * Что есть в сцене «Битвы существ», кроме поля и бойцов (автор 17.11: «торнадо сзади, бегающая книга и всякое бесполезное»):
 * перечень объектов сцены по именам/типам и систем игры с живыми объектами. Результат — в BRAWL_AUDIT_OUT (JSON).
 * Run: ZNS_START_TIMEOUT=600000 node --test tests/e2e/brawl-scene-audit.test.mjs
 */
import test from 'node:test';
import fs from 'node:fs';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8202;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('brawl scene audit', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        await sleep(15000);
        const sc = g.scene, tally = {};
        sc.traverse((o) => { if (o === sc) return; const depth = (() => { let d = 0, p = o; while (p.parent && p.parent !== sc) { d++; p = p.parent; } return d; })(); if (depth > 0) return; const k = (o.name || o.userData?.kind || o.type) + '|' + o.type + '|vis' + (o.visible ? 1 : 0); const e = (tally[k] ||= { n: 0, ex: null }); e.n++; if (!e.ex) e.ex = [Math.round(o.position.x), Math.round(o.position.y), Math.round(o.position.z)]; });
        out.visible = [];
        const THREE_ = window.__zns.THREE;
        for (const o of sc.children) {
            if (!o.visible || o.type === 'Audio' || /Light|Camera/.test(o.type)) continue;
            const box = new THREE_.Box3().setFromObject(o), c = box.getCenter(new THREE_.Vector3()), sz = box.getSize(new THREE_.Vector3());
            let n = 0; o.traverse(() => n++);
            out.visible.push([o.name || '-', o.type, o.geometry?.type || '', 'sub' + n, 'c ' + [c.x, c.y, c.z].map(Math.round).join(','), 'size ' + [sz.x, sz.y, sz.z].map((x) => Math.round(Math.min(x, 9999))).join('x'), o.material?.name || o.material?.type || ''].join(' | '));
        }
        out.sceneTop = Object.entries(tally).map(([k, v]) => k + ' x' + v.n + ' @' + v.ex.join(',')).sort();
        const sys = {};
        for (const k of Object.keys(g)) {
            const v = g[k];
            try {
                if (!v || typeof v !== 'object') continue;
                const sizes = [];
                for (const f of Object.keys(v)) { const x = v[f]; if (x instanceof Map || x instanceof Set) { if (x.size) sizes.push(f + ':' + x.size); } else if (Array.isArray(x) && x.length && x.length < 5000) sizes.push(f + '[]:' + x.length); }
                if (sizes.length) sys[k] = sizes.slice(0, 8).join(' ');
            } catch { /* */ }
        }
        out.systems = sys;
        out.misc = { zombies: g.zombies?.length, animals: g.animals?.byId?.size, people: g.castleLife?.byId?.size, books: !!g.books, storm: g.storm?.active ?? g.storm?.on, tornado: g.tornado ? Object.keys(g.tornado).slice(0, 12) : null, weather: g.weather?.kind, sky: g.world?.sky?.constructor?.name, drawCalls: g.renderer?.info?.render?.calls, tris: g.renderer?.info?.render?.triangles, geoms: g.renderer?.info?.memory?.geometries, tex: g.renderer?.info?.memory?.textures };
        return out;
    });
    fs.writeFileSync(process.env.BRAWL_AUDIT_OUT || '/tmp/brawl-audit.json', JSON.stringify(r, null, 1));
    console.log('DONE');
});
