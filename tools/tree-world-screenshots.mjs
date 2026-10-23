// The real trees in the game (Trees.js), against the old block trees: the same world (a fixed seed), the same
// places — a wood 300 m east of the start and the start's own trees — by day and by night, with real trees or
// without (--old: the world as made before, block trees). Prints what was drawn.
// Usage: node tools/tree-world-screenshots.mjs [--old] [--night] [--out docs/trees] [--tag new] [--port 8796]
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/trees'));
const old = process.argv.includes('--old'), night = process.argv.includes('--night');
const tag = arg('--tag', old ? 'old' : 'new') + (night ? '-night' : '-day');
const port = Number(arg('--port', 8796));
const SEED = 20261015;
fs.mkdirSync(out, { recursive: true });

// views: [x, z] of the eye, and where it looks — [x, height over the eye, z]; the wood is found from the world's recipe
// (the same place with real trees or without)
let VIEWS = null;

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await page.evaluate(({ SEED, old }) => {
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, realTrees: !old });
    }, { SEED, old });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    VIEWS = await page.evaluate(() => {
        const g = window.__zns.game, T = g.world.terrain, D = T.data.constructor;
        const d = new D();
        d.generate({ ...T.opts, meshTrees: true }); // (where the real trees stand — the same in an old world's recipe)
        let best = null;
        for (let r = 5; r <= 10; r++) for (let a = 0; a < 32; a++) {
            const cx = Math.round(Math.cos((a / 32) * 6.283) * r), cz = Math.round(Math.sin((a / 32) * 6.283) * r);
            const n = d.chunk(cx, cz).trees?.length || 0;
            if (!best || n > best.n) best = { cx, cz, n, t: d.chunk(cx, cz).trees };
        }
        const f = best.t[0], s = best.t[1] || f;
        return [
            { name: 'wood', at: [f.x + 11, f.z + 9], look: [f.x, 5, f.z] },
            { name: 'wood-under', at: [f.x + 2.2, f.z + 1.6], look: [(f.x + s.x) / 2, 9, (f.z + s.z) / 2] },
            { name: 'start', at: [0, 14], look: [0, 2.5, -20] },
        ];
    });
    for (const v of VIEWS) {
        await page.evaluate(({ v, night }) => {
            const g = window.__zns.game, THREE = window.__zns.THREE;
            g.dayStart = Date.now() - 24 * 60 * 1000 * (night ? 0.88 : 0.32); // (midday / deep night)
            const y = g.world.terrain.data.surfaceY(v.at[0], v.at[1]);
            g.character.group.position.set(v.at[0], y + 2, v.at[1]);
            g.flight?.start?.(); // (hold still in the air: no fall, no walk back)
            window.__shot = { pos: [v.at[0], y + 3.6, v.at[1]], look: [v.look[0], y + 3.6 + v.look[1], v.look[2]] };
            if (!g.__shotHook) {
                g.__shotHook = true;
                const orig = g._updateCamera.bind(g);
                g._updateCamera = (dt) => { orig(dt); const s = window.__shot; if (s) { g.camera.position.set(...s.pos); g.camera.lookAt(new THREE.Vector3(...s.look)); } };
            }
        }, { v, night });
        await sleep(5000);
        // (the ground there is made by now: the eye 3.6 m over it)
        await page.evaluate((v) => {
            const g = window.__zns.game, y = g.world.terrain.data.surfaceY(v.at[0], v.at[1]);
            g.character.group.position.y = y + 2;
            window.__shot.pos[1] = y + 3.6;
            window.__shot.look[1] = y + 3.6 + v.look[1];
        }, v);
        await sleep(5000);
        const st = await page.evaluate(() => { const g = window.__zns.game, f = g.world.forest; return { me: g.character.group.position.toArray().map(Math.round), cam: g.camera.position.toArray().map(Math.round), forest: f ? { ...f.stats } : null, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
        console.log(tag, v.name, JSON.stringify(st));
        await page.screenshot({ path: path.join(out, `${tag}-${v.name}.png`), timeout: 180000 });
    }
    if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
} finally {
    await browser.close();
    srv.stop?.();
}
process.exit(0);
