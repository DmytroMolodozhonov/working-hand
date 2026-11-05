#!/usr/bin/env node
/**
 * mermaid-look.mjs — the hero with the mermaid's tail («Зелье русалки», Mermaid.js) seen from aside: on the shore and in the sea.
 * Run: node tools/mermaid-look.mjs [--out dir]. The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/mermaid-look');
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 30 * 60 * 1000);
const srv = await startServer(Number(opt('port', '8182')));
const browser = await launch({ viewport: { width: 960, height: 600 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 600 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate(() => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: 777, zombieCount: 0, graphics: '3', viewDistance: 'normal' }); });
    await waitHudVisible(page, 600000);
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game, f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }); console.log('📸', name); };
    // midday; the potion in her (not «just drunk»: the tail at once, no change); the HUD hidden; a camera of our own
    console.log(JSON.stringify(await page.evaluate(() => {
        const g = window.__zns.game;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.4;
        g.potionFx.left.mermaid = 600;
        const cv = g.renderer.domElement;
        for (let el = cv; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
        const orig = g._updateCamera.bind(g), V = g.camera.position.constructor;
        g._updateCamera = (dt) => { orig(dt); const c = window.__cam; if (c) { g.camera.position.set(...c[0]); g.camera.lookAt(new V(...c[1])); } };
        return { ok: true };
    })));
    await frames(10);
    // 1) on the land: from the side and a little in front
    const side = (d, h, fwd) => page.evaluate(([d, h, fwd]) => {
        const g = window.__zns.game, ch = g.character, p = ch.group.position, yaw = ch.group.rotation.y;
        ch.group.visible = true;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
        window.__cam = [[p.x + sx * d + fx * fwd, p.y + h, p.z + sz * d + fz * fwd], [p.x, p.y - 1.2, p.z]];
        return { tail: !!g.mermaid?.tail, y: +p.y.toFixed(2), swim: !!ch.swimming };
    }, [d, h, fwd]);
    console.log('land', JSON.stringify(await side(5.5, 0.5, 2)));
    await frames(8);
    await shoot('1-land-side');
    // 2) into the sea: the nearest deep sea water, swimming on top
    const sea = await page.evaluate(() => {
        const g = window.__zns.game, me = g.character.group.position;
        for (let r = 20; r < 1500; r += 20) for (let a = 0; a < 32; a++) {
            const x = me.x + Math.cos(a / 32 * Math.PI * 2) * r, z = me.z + Math.sin(a / 32 * Math.PI * 2) * r;
            const w = g.swim.waterAt(x, z);
            if (w && w.sea && w.depth > 12) { g.character.group.position.set(x, w.surface - 0.6, z); g.character.verticalVelocity = 0; return { x: +x.toFixed(1), z: +z.toFixed(1), surface: +w.surface.toFixed(2), depth: w.depth }; }
        }
        return null;
    });
    console.log('sea', JSON.stringify(sea));
    if (sea) {
        await frames(120);
        console.log('swim', JSON.stringify(await side(5, 1.6, 2)));
        await frames(30);
        await shoot('2-sea-top');
        // 3) under the water: dived 5 m, the camera beside her under the water
        await page.evaluate((s) => { const g = window.__zns.game; g.swim.y = s.surface - 6; g.swim.atTop = false; g.character.group.position.y = s.surface - 6; }, sea);
        await frames(20);
        console.log('under', JSON.stringify(await side(5, 0.2, 1.5)));
        await frames(40);
        await shoot('3-underwater');
    }
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
