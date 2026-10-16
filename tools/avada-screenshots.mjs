// Screenshots of «Авада Кедавра» (the cast and the hit) for docs/spells/avada/.
// Usage: node tools/avada-screenshots.mjs [--out docs/spells/avada] [--port 8791] [--time 0.3] [--tag -night]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/spells/avada'));
const port = Number(arg('--port', 8791));
const tod = Number(arg('--time', 0.3));
const tag = arg('--tag', '');
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(async (tod) => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const t = g.world.terrain.data, x = 20, z = 20, y = t.topLayer(x, z) + 1;
        const ch = g.character;
        ch.group.position.set(x, y + 1, z);
        g.dayStart = Date.now() - 24 * 60 * 1000 * tod;
        await frames(60);
        const cv = g.renderer.domElement;
        for (let el = cv; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
        ch.group.visible = false;
        const o = new THREE.Vector3(x, t.topLayer(x, z) + 2.2, z), d = new THREE.Vector3(0, 0, -1);
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => { orig(dt); const s = window.__cam; if (s) { g.camera.position.set(...s[0]); g.camera.lookAt(new THREE.Vector3(...s[1])); } };
        window.__cam = [[x + 7, o.y + 0.8, z - 5], [x, o.y, z - 5]];
        // (the shot's charge held 2…9 m out, so the picture catches it in flight)
        const fly = g.duel._fly.bind(g.duel);
        window.__k = 2;
        g.duel._fly = (b, dt) => (b.id === 'shot:1' ? (b.front.copy(o).addScaledVector(d, window.__k), true) : fly(b, dt));
        await frames(30);
        window.__shot = { o, d, frames, g, THREE };
    }, tod);
    // the cast: the charge just leaving the wand
    await page.evaluate(async () => {
        const { o, d, frames, g } = window.__shot;
        g.duel.remoteCast({ id: 'shot:1', by: 'shot', s: 'AvadaKedavra', side: 'right', tk: 'n', o: o.toArray(), d: d.toArray() });
        await frames(2);
    });
    await page.screenshot({ path: path.join(out, `avada-cast${tag}.png`) });
    await page.evaluate(async () => { const { frames } = window.__shot; window.__k = 9; await frames(6); });
    await page.screenshot({ path: path.join(out, `avada-flight${tag}.png`) });
    // the hit: on a pig a few metres off
    await page.evaluate(async () => {
        const { o, frames, g, THREE } = window.__shot;
        g.duel.bolts.delete('shot:1');
        await frames(60);
        const p = o.clone().add(new THREE.Vector3(0, -0.6, -9));
        g.duel._hitBurst('AvadaKedavra', p, 40);
        await frames(2);
    });
    await page.screenshot({ path: path.join(out, `avada-hit${tag}.png`) });
    console.log('errors:', errors.slice(0, 5));
} finally {
    await browser.close();
    srv.close?.();
}
