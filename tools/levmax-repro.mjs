#!/usr/bin/env node
/**
 * levmax-repro.mjs - Leviosa Maxima on a house in a real browser (the game's own code): lift it, carry it, let it fall; every
 * frame error with its stack. The author 02.11: «когда воспользовался вингардиум левиоса максима… под низом дома будто
 * нереалистично изменилась земля, ошибка и вылет» (Critical error: Cannot read properties of null (reading
 * 'isInterleavedBufferAttribute')).
 *   ZNS_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/levmax-repro.mjs [--magic]
 */
import { chromium } from 'playwright';
import { startServer, openPage, startFromMenu, sleep } from '../tests/e2e/harness.mjs';

const magic = process.argv.includes('--magic');
const port = 8000 + Math.floor(Math.random() * 900) + 50;
const srv = await startServer(port, { python: process.platform === 'win32' ? 'python' : 'python3' });
// (the real graphics card: the software one takes minutes to make the world's shaders)
const browser = await chromium.launch({ executablePath: process.env.ZNS_CHROME || undefined, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    page.on('console', async (m) => {
        if (m.type() !== 'error') return;
        const a = m.args();
        let stack = '';
        for (const x of a) { try { const s = await x.evaluate((e) => (e && e.stack) || ''); if (s) { stack = s; break; } } catch (e) { /* */ } }
        errs.push(m.text().slice(0, 300) + (stack ? '\n' + stack.split('\n').slice(0, 14).join('\n') : ''));
    });
    await startFromMenu(page, 'freeworld');
    await sleep(3000);
    const found = await page.evaluate(async (magic) => {
        const g = window.__zns.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const idx = data?.sites || data?.castles;
        const p = g.character.group.position;
        let best = null;
        for (const R of [200, 600, 1500, 4000]) {
            for (const def of idx?.near?.(p.x, p.z, R) || []) for (const h of def.houses || []) {
                const d = Math.hypot(h.c.x - p.x, h.c.z - p.z);
                if (!best || d < best.d) best = { d, id: h.id, x: h.c.x, y: h.c.y, z: h.c.z, r: h.r };
            }
            if (best) break;
        }
        return best;
    }, magic);
    console.log('house:', JSON.stringify(found));
    if (!found) throw new Error('no house found');
    // stand beside it (the world round it has to be made)
    await page.evaluate((h) => { const g = window.__zns.game; g.character.group.position.set(h.x + h.r + 8, h.y + 3, h.z); g.character.velocity?.set?.(0, 0, 0); }, found);
    await sleep(8000);
    // a camera looking at the house from the side (the game's own camera is put there just before each picture is drawn)
    await page.evaluate((h) => {
        const g = window.__zns.game, r = g.renderer, orig = r.render.bind(r);
        r.render = (s, cam) => { if (cam === g.camera) { cam.position.set(h.x + 16, h.y + 9, h.z + 16); cam.lookAt(h.x, h.y + 1, h.z); cam.updateMatrixWorld(true); } orig(s, cam); };
    }, found);
    const shot = (n) => page.screenshot({ path: `${process.env.TEMP || '/tmp'}/levmax-${n}.png` });
    await sleep(500); await shot('0-before');
    const began = await page.evaluate((h) => {
        const g = window.__zns.game;
        const hh = g.levMax._houseAt(h.x, Math.round(h.y + 1), h.z, h.id);
        if (!hh) return 'no house record';
        g.levMax.mine = { id: 'h:m1', side: 'right', players: [], t: 0, kind: 'house' };
        g.levMax.begin('h:m1', g.localId, 'right', { k: 'house', id: h.id, x: h.x, z: h.z });
        return 'lifts ' + g.levMax.lifts.size;
    }, found);
    console.log('begin:', began);
    const shared = await page.evaluate(() => {
        const g = window.__zns.game;
        const byMat = new Map();
        g.scene.traverse((o) => {
            if (!o.isInstancedMesh) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                const e = byMat.get(m) || { w: [], wo: [] };
                const nm = (o.name || '') + '<' + (o.parent?.name || o.parent?.type || '') + '> n=' + o.count + ' geo=' + Object.keys(o.geometry.attributes).join(',');
                (o.instanceColor ? e.w : e.wo).push(nm);
                byMat.set(m, e);
            }
        });
        return [...byMat].filter(([, e]) => e.w.length && e.wo.length).map(([m, e]) => ({ mat: (m.name || m.type) + ' ' + m.uuid.slice(0, 6), with: e.w.slice(0, 3), without: e.wo.slice(0, 3) }));
    });
    console.log('shared materials:', JSON.stringify(shared, null, 1));
    for (let i = 0; i < 10; i++) { await sleep(1000); if (i === 2 || i === 6) await shot(`1-lifted-${i}`); const st = await page.evaluate(() => { const g = window.__zns.game; const L = [...g.levMax.lifts.values()][0]; return L ? `${L.phase} y=${L.pos?.y?.toFixed?.(1)}` : 'none'; }); console.log(`t=${i + 1}s`, st, 'errors', errs.length); if (errs.length) break; }
    await page.evaluate(() => { const g = window.__zns.game; g.levMax.release(false); });
    for (let i = 0; i < 6; i++) { await sleep(1000); console.log(`after release t=${i + 1}s errors`, errs.length); if (errs.length) break; }
    await shot('2-landed');
    for (const e of errors) if (!/frame error/.test(e)) errs.push(e);
} finally {
    console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 6).join('\n---\n') : 'no errors');
    await browser.close();
    srv.stop();
}
