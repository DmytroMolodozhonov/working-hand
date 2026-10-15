/**
 * flight.mjs — the hands in flight: the game's FPS and the hands' delay, V3 against V5.
 *
 * The game server with its camera program (pose_native.py) watching a test video in place of the
 * camera (a far player), the game in Chromium, the hero flying fast over a new world (the world is
 * loaded and built all the way — as the author's flight). Measured over FLY_S seconds:
 *   fps          the game's frames a second (and the worst frame)
 *   poses/s      camera results reaching the game
 *   delay ms     from the picture taken into work to its points in the game (median / 90%)
 *   gap ms       the longest wait between two results (a hand that «hangs»)
 *   js ms        the game's own time per result on its main thread (parsing, guards, filters)
 *   cost ms      the camera program's time per picture
 *
 *   python3 tools/handbench/load.py --seconds 1   # (once: makes .handbench/load_far_*.avi)
 *   node tools/handbench/flight.mjs [v3,v5]
 */
import path from 'node:path';
import { startServer, launch, startFromMenu, waitHudVisible, ROOT } from '../../tests/e2e/harness.mjs';

const FLY_S = Number(process.env.FLY_S || 25);
const VIDEO = process.env.ZNS_TEST_VIDEO || path.join(ROOT, '.handbench', 'load_far_1280.avi');
const versions = (process.argv[2] || 'v3,v5').split(',');

async function run(version, port) {
    const srv = await startServer(port, { python: process.env.ZNS_TEST_PYTHON || 'python3', env: { ZNS_CAMERA_FILE: VIDEO, ZNS_V5_ENGINE: process.env.ZNS_V5_ENGINE || "mp" } });
    const browser = await launch({});
    try {
        const page = await browser.newPage({ viewport: { width: Number(process.env.FLY_W || 640), height: Number(process.env.FLY_H || 360) } }); // (software drawing here: small, so the game is not 1 fps)
        await page.addInitScript(() => { window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; window.__ZNS_NO_FULLSCREEN__ = true; });
        await page.goto(srv.url);
        await page.waitForFunction(() => !!window.__zns);
        await page.evaluate((v) => {
            document.querySelector(`input[name="hand-version"][value="${v}"]`).checked = true;
            const el = document.getElementById('view-distance'); el.value = 'low'; el.dispatchEvent(new Event('change'));
        }, version);
        await startFromMenu(page, 'freeworld');
        await waitHudVisible(page, 120000);
        // the camera program running (and the V5 hands ready, if asked for)
        await page.waitForFunction((v) => {
            const st = window.__zns.poseService.stats;
            return st.results > 20 && (v !== 'v5' || st.handsEngine === 'v5');
        }, version, { timeout: 300000 });
        return await page.evaluate(async (secs) => {
            const g = window.__zns.game, ps = window.__zns.poseService, ch = g.character;
            const delays = [], js = [], arrivals = [], costs = [];
            const orig = ps._onNative.bind(ps);
            ps._onNative = (r) => {
                const t0 = performance.now();
                if (r.t) delays.push(Date.now() - r.t);
                if (r.cost) costs.push(r.cost);
                arrivals.push(t0);
                orig(r);
                js.push(performance.now() - t0);
            };
            const frames = [];
            let last = performance.now(), on = true;
            const tick = (t) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
            g.startFlight(true);
            const t0 = performance.now();
            while (performance.now() - t0 < secs * 1000) {
                // fast over new land: the world keeps being loaded and built
                ch.group.position.x += 4;
                ch.group.position.y = Math.max(ch.group.position.y, g.collision.groundY(ch.group.position.x, ch.group.position.z) + 15);
                await new Promise((res) => setTimeout(res, 100));
            }
            on = false;
            ps._onNative = orig;
            const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
            const gaps = arrivals.slice(1).map((t, i) => t - arrivals[i]);
            const ms = frames.slice(5);
            return {
                fps: ms.length / (ms.reduce((a, b) => a + b, 0) / 1000), worstFrame: Math.max(...ms), p90Frame: q(ms, 0.9),
                posesPerSec: arrivals.length / secs, delayMed: q(delays, 0.5), delayP90: q(delays, 0.9),
                gapMax: Math.max(...gaps), gapP90: q(gaps, 0.9), jsMed: q(js, 0.5), jsP90: q(js, 0.9), costMed: q(costs, 0.5),
                hands: ps.stats.handsEngine, v5: ps.stats.v5Engine, flewTo: Math.round(ch.group.position.x),
                left: !!ps.lastResults?.leftHandLandmarks, right: !!ps.lastResults?.rightHandLandmarks,
            };
        }, FLY_S);
    } finally {
        await browser.close();
        srv.stop();
    }
}

let port = 8311;
for (const v of versions) {
    const r = await run(v, port++);
    const f = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
    console.log(`${v.toUpperCase()}: fps ${f(r.fps)} (90% кадров ≤ ${f(r.p90Frame, 0)} мс, худший ${f(r.worstFrame, 0)} мс) | поз/с ${f(r.posesPerSec)} | задержка кисти ${f(r.delayMed, 0)} / ${f(r.delayP90, 0)} мс | пауза до ${f(r.gapMax, 0)} мс | js ${f(r.jsMed, 2)} / ${f(r.jsP90, 2)} мс | камера ${f(r.costMed, 0)} мс | ${r.hands}${r.v5 ? '/' + r.v5 : ''} | кисти ${r.left ? 'Л' : '-'}${r.right ? 'П' : '-'}`);
}
