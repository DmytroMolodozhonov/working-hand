#!/usr/bin/env node
/**
 * wakebench.mjs — what it costs when a castle / a wizards' settlement wakes (its people made at once).
 *   node tools/wakebench.mjs [--site castle|village|tower] [--times 4] [--profile]
 * Flies (teleports) the hero to the nearest such place, waits for the land, then puts the place to sleep and wakes it
 * again: the time of each wake and (with --profile) the heaviest functions in it.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SITE = opt('site', 'castle');
const TIMES = parseInt(opt('times', '4'), 10);
const PROFILE = args.includes('--profile');
const SEED = 20261015;

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch();
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
    await page.evaluate(({ SEED }) => {
        const z = window.__zns;
        for (const [id, v] of [['graphics-quality', '3'], ['view-distance', 'high']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'high' });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(4000);
    const where = await page.evaluate(({ SITE }) => {
        const g = window.__zns.game, data = g.terrain.data, p0 = g.character.group.position.clone();
        let site = null;
        if (SITE === 'village') site = data.villages?.spawnVillage?.();
        else if (SITE === 'tower') site = data.towers?.only?.();
        else site = (data.castles?.near?.(p0.x, p0.z, 1500) || []).filter((c) => Math.hypot(c.x - p0.x, c.z - p0.z) > 250)[0];
        if (!site) return null;
        const y = g.collision.groundY(site.x, site.z);
        g.character.group.position.set(site.x + 30, (Number.isFinite(y) ? y : 20) + 12, site.z + 30);
        return { id: site.id, x: site.x, z: site.z, kind: site.kind };
    }, { SITE });
    if (!where) { console.log('no such place'); process.exit(1); }
    console.log('place:', JSON.stringify(where));
    // wait: the land and the people made
    for (let i = 0; i < 90; i++) {
        const ok = await page.evaluate((w) => { const cl = window.__zns.game.castleLife; const cs = cl.castles.get(w.id); return !!(cs && cs.awake && cs.active.size > 0); }, where);
        if (ok) break;
        await sleep(2000);
    }
    await sleep(3000);
    let cdp = null;
    if (PROFILE) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); }
    for (let k = 0; k < TIMES; k++) {
        if (cdp && k === 1) await cdp.send('Profiler.start'); // (the first wake warms the code)
        const r = await page.evaluate((w) => {
            const g = window.__zns.game, cl = g.castleLife, cs = cl.castles.get(w.id);
            cl._sleep(cs);
            const n0 = performance.now();
            cl._wake(cs);
            const ms = performance.now() - n0;
            return { ms: +ms.toFixed(1), people: cs.active.size };
        }, where);
        console.log(`wake ${k}: ${r.ms} ms, ${r.people} people`);
        await sleep(1500);
    }
    if (cdp) {
        const { profile } = await cdp.send('Profiler.stop');
        const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
        const self = new Map();
        for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0));
        const by = new Map();
        for (const [id, t] of self) { const f = nodes.get(id).callFrame; const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|vendor)\//, '$1/')}:${f.lineNumber + 1}`; by.set(key, (by.get(key) || 0) + t); }
        console.log('heaviest (self ms, all wakes after the first):');
        for (const [k, v] of [...by.entries()].filter(([k]) => !/^\(idle\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log('  ' + (v / 1000).toFixed(1).padStart(7), k);
    }
    await page.close();
} finally {
    await browser.close();
    srv.stop();
}
