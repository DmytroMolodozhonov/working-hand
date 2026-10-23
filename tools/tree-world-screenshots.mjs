// The real trees in a new world (generation 9): a creative world is made, the hero is put in a wood away from the
// start, and the view is taken from a few sides (and the start area's trees). Shows what was drawn and how long it took.
// Usage: node tools/tree-world-screenshots.mjs [--out docs/trees] [--port 8796]
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/trees'));
const port = Number(arg('--port', 8796));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const info = await page.evaluate(async () => {
        const g = window.__zns.game;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.32; // (midday)
        const d = g.world.terrain.data;
        // a wood: the chunk with the most trees 150–420 m from the start
        let best = null;
        for (let r = 5; r <= 13 && !best; r++) for (let a = 0; a < 24; a++) {
            const cx = Math.round(Math.cos((a / 24) * Math.PI * 2) * r), cz = Math.round(Math.sin((a / 24) * Math.PI * 2) * r);
            const c = d.chunk(cx, cz);
            const n = c.trees?.length || 0;
            if (n >= 5 && (!best || n > best.n)) best = { cx, cz, n, t: c.trees };
        }
        return { gen: g.gen, meshTrees: d.meshTrees, best: best && { cx: best.cx, cz: best.cz, n: best.n, first: best.t[0] }, fixed: g.world.trees.length };
    });
    console.log('world', JSON.stringify(info));
    const views = [];
    if (info.best) {
        const f = info.best.first;
        views.push({ name: 'wood', at: [f.x + 9, f.z + 7], look: [f.x, f.y + 7, f.z] });
        views.push({ name: 'wood-under', at: [f.x + 2.5, f.z + 1.5], look: [f.x - 4, f.y + 9, f.z - 3] });
        views.push({ name: 'wood-far', at: [f.x + 60, f.z + 40], look: [f.x, f.y + 5, f.z], up: 18 });
    }
    views.push({ name: 'start', at: [0, 12], look: [0, 5, -20], up: 4 });
    for (const v of views) {
        await page.evaluate(async (v) => {
            const g = window.__zns.game, THREE = window.__zns.THREE;
            const y = g.world.terrain.data.surfaceY(v.at[0], v.at[1]);
            g.character.group.position.set(v.at[0], y + 2 + (v.up || 0), v.at[1]);
            g.flight?.start?.();
            window.__shot = { pos: [v.at[0], y + 1.6 + 2 + (v.up || 0), v.at[1]], look: v.look };
            if (!g.__shotHook) {
                g.__shotHook = true;
                const orig = g._updateCamera.bind(g);
                g._updateCamera = (dt) => { orig(dt); const s = window.__shot; if (s) { g.camera.position.set(...s.pos); g.camera.lookAt(new THREE.Vector3(...s.look)); } };
            }
        }, v);
        await sleep(6000);
        const st = await page.evaluate(() => { const f = window.__zns.game.world.forest; return f ? { ...f.stats, calls: window.__zns.game.renderer.info.render.calls, tris: window.__zns.game.renderer.info.render.triangles } : null; });
        console.log(v.name, JSON.stringify(st));
        await page.screenshot({ path: path.join(out, `world-${v.name}.png`) });
    }
    if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
} finally {
    await browser.close();
    srv.stop?.();
}
process.exit(0);
