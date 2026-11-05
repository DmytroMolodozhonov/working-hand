#!/usr/bin/env node
/**
 * under-flicker.mjs — «под водой мигает мир» (the author): the hero under the sea (held, then swimming along), every frame the things
 * that make the picture are read (the haze, the background, the sky dome, the shafts, the light, the post look, the mean brightness of
 * a small read-back) and any jump between two frames is printed. Run: node tools/under-flicker.mjs [--seed N] [--frames N]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SEED = parseInt(opt('seed', '777'), 10), FRAMES = parseInt(opt('frames', '240'), 10);
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 25 * 60 * 1000);
const srv = await startServer(Number(opt('port', '8178')));
const browser = await launch({ viewport: { width: 480, height: 270 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed, zombieCount: 0, graphics: opt3(), viewDistance: 'medium' }); function opt3() { return '3'; } }, SEED);
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
    const res = await page.evaluate(async (FRAMES) => {
        const g = window.__zns.game, S = g.world.terrain.data.seas, me = g.character.group.position;
        let spot = null;
        for (let r = 50; r < 3000 && !spot; r += 25) for (let a = 0; a < 6.28 && !spot; a += 0.2) { const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r; if (Math.abs(S.signedDist(x, z) - 300) < 12) spot = [x, z]; }
        if (!spot) return { err: 'no sea' };
        const [x0, z0] = spot;
        g.world.terrain.flushAround?.(x0, z0); g.seaSurface?.flush?.(x0, z0);
        const top = g.world.terrain.data.topLayer(Math.round(x0), Math.round(z0));
        const depth = Math.min(6, Math.max(1.5, -top - 4));
        let k = 0;
        const hold = () => { const x = x0 + k * 0.08, z = z0; g.character.group.position.set(x, -0.2 - depth - 1.6, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = 1.2 + Math.sin(k * 0.02) * 0.6; if (g.smoothHead) g.smoothHead.pitch = -0.1; };
        window.__hold = setInterval(hold, 4); hold();
        for (let f = g.frameCount; g.frameCount < f + 60;) await new Promise((r) => setTimeout(r, 15)); // (settle)
        const gl = g.renderer.getContext(), px = new Uint8Array(4 * 16 * 16), rows = [];
        let lastF = g.frameCount;
        while (rows.length < FRAMES) {
            await new Promise((r) => requestAnimationFrame(r));
            if (g.frameCount === lastF) continue;
            lastF = g.frameCount; k++;
            const fog = g.scene.fog, sw = g.swim, L = g.ultra?.post?.look, uwl = g.underwaterLight;
            let lum = -1;
            try { gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 8, Math.floor(gl.drawingBufferHeight / 2) - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; lum = s / (px.length / 4) / 3; } catch { /* */ }
            rows.push({
                f: lastF, eye: sw?.eyeUnder ? 1 : 0, uw: +(sw?._uw ?? -1).toFixed(3), sw: sw?.swimming ? 1 : 0,
                fogN: fog ? +(fog.near ?? fog.density ?? 0).toFixed(1) : -1, fogF: fog ? +(fog.far ?? 0).toFixed(1) : -1, fogC: fog ? fog.color.getHexString() : '',
                bg: g.scene.background?.isColor ? g.scene.background.getHexString() : (g.scene.background ? 'tex' : 'none'),
                dome: g.world?.sky?.mesh?.visible ? 1 : 0, sh: uwl?.shafts?.visible ? 1 : 0, sn: uwl?.snow?.visible ? 1 : 0, k: +(uwl?.k ?? 0).toFixed(3),
                rays: L ? +L.rays.toFixed(3) : -1, mist: L ? +(L.mist * 1000).toFixed(2) : -1, overlay: document.querySelector('#underwater-overlay, .underwater')?.style?.opacity ?? '',
                hemi: +(g.world?.hemi?.intensity ?? g.world?.hemiLight?.intensity ?? -1).toFixed(3), sun: +(g.world?.sun?.intensity ?? g.world?.sunLight?.intensity ?? -1).toFixed(3),
                lum: +lum.toFixed(1), y: +g.character.group.position.y.toFixed(2),
            });
        }
        clearInterval(window.__hold);
        return { spot, depth, rows };
    }, FRAMES);
    if (res.err) { console.log(res.err); process.exit(1); }
    console.log('spot', res.spot, 'depth', res.depth);
    const keys = Object.keys(res.rows[0]).filter((k) => k !== 'f' && k !== 'y');
    const jumps = [];
    for (let i = 1; i < res.rows.length; i++) {
        const a = res.rows[i - 1], b = res.rows[i];
        for (const k of keys) {
            if (a[k] === b[k]) continue;
            if (typeof a[k] === 'number' && typeof b[k] === 'number') { const big = k === 'lum' ? 12 : k === 'fogN' || k === 'fogF' ? 3 : 0.08; if (Math.abs(a[k] - b[k]) < big) continue; }
            jumps.push(`f${b.f} ${k}: ${a[k]} → ${b[k]}`);
        }
    }
    console.log('first', JSON.stringify(res.rows[0]));
    console.log('last', JSON.stringify(res.rows.at(-1)));
    console.log(jumps.length ? jumps.slice(0, 80).join('\n') : 'no jumps');
    const lums = res.rows.map((r) => r.lum);
    console.log('lum min/max', Math.min(...lums), Math.max(...lums));
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
