// How far away the real trees (Trees.js) first show — flying straight over a world at flight speed (26 m/s), the view
// «Максимальная» (as the author plays). Prints where they appeared (m from the eye: min, 10 %, median, how many nearer
// than 60 m), how far the land is drawn, and how many trees stood in view without being drawn (missing).
// Usage: node tools/treepopbench.mjs [--seconds 45] [--view max|high] [--port 8807]
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('--seconds', 45)), VIEW = arg('--view', 'max');
const srv = await startServer(Number(arg('--port', 8807)));
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
    await page.evaluate(({ VIEW }) => {
        for (const [id, v] of [['graphics-quality', '3'], ['view-distance', VIEW]]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: 20261015, zombieCount: 0, graphics: '3', viewDistance: VIEW, realTrees: true });
    }, { VIEW });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(3000);
    const r = await page.evaluate(async (SECONDS) => {
        const g = window.__zns.game, ch = g.character, f = g.world.forest;
        g.startFlight?.(true);
        const start = ch.group.position.clone();
        start.y = 60;
        f._appear.n = 0; f._appear.i = 0; // (from here on: the start's trees were there before)
        for (const t of g.world.trees) t._seen = true;
        const miss = [];
        const t0 = performance.now();
        // straight east at 26 m/s, a little over the treetops, looking ahead and a little down
        while (performance.now() - t0 < SECONDS * 1000) {
            const s = (performance.now() - t0) / 1000;
            ch.group.position.set(start.x + s * 26, Math.max(start.y, g.world.terrain.data.surfaceY(start.x + s * 26, start.z) + 25), start.z);
            await new Promise((r) => setTimeout(r, 50));
            // a tree standing in view within the land's reach but not drawn: "missing"
            if (((s * 20) | 0) % 40 === 0) {
                const cam = g.camera, cp = cam.position, reach = Math.min(g.world.terrain.viewDistance, g.scene.fog?.far || 1e9);
                const fr = new window.__zns.THREE.Frustum().setFromProjectionMatrix(new window.__zns.THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
                let n = 0, inView = 0;
                const T = g.world.terrain, D = T.data;
                for (const [key] of T.meshes) {
                    const c = D.chunks.get(key);
                    for (const it of c?.trees || []) {
                        const d = Math.hypot(it.x - cp.x, it.z - cp.z);
                        if (d > reach || !fr.containsPoint(new window.__zns.THREE.Vector3(it.x, it.y + 6, it.z))) continue;
                        inView++;
                        const t = f.byId.get(it.id);
                        if (!t || !t._seen) n++;
                    }
                }
                miss.push([Math.round(s), inView, n]);
            }
        }
        return { appear: f.appearStats(), view: Math.round(g.world.terrain.viewDistance), fog: Math.round(g.scene.fog?.far || 0), near: f.constructor.name, miss, stats: f.stats };
    }, SECONDS);
    console.log('земля рисуется до, м:', r.view, ' туман до, м:', r.fog);
    console.log('деревья появились на расстоянии, м:', JSON.stringify(r.appear));
    console.log('в поле зрения / не нарисовано (секунда, всего, нет):', JSON.stringify(r.miss));
    if (errors.length) console.log('ошибки:', errors.slice(0, 3).join('\n'));
} finally {
    await browser.close();
    srv.stop?.();
}
process.exit(0);
