/**
 * Shared helpers for browser tests: game server, Chromium with a fake webcam,
 * error collection and small wait utilities.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Does something listen on localhost:port (a socket opened and closed — nothing read)? */
function portOpen(port) {
    return new Promise((res) => {
        const s = net.connect({ port, host: '127.0.0.1' });
        const done = (ok) => { s.destroy(); res(ok); };
        s.once('connect', () => done(true));
        s.once('error', () => done(false));
        s.setTimeout(500, () => done(false));
    });
}

export async function startServer(port, { python = 'python3', env = {} } = {}) {
    for (let k = 0; k < 50 && (await portOpen(port)); k++) port++; // (the port taken by something else: its answer crashed the start-up's fetch — the next free one)
    const proc = spawn(python, ['server.py', '--no-browser'], {
        cwd: ROOT,
        env: { ...process.env, ZNS_PORT: String(port), ZNS_NO_BROWSER: '1', ZNS_NO_PIP: '1', ZNS_LOG_UPLOAD: '0', ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    proc.stdout.on('data', (d) => { log += d; });
    proc.stderr.on('data', (d) => { log += d; });
    const url = `http://localhost:${port}/`;
    for (let i = 0; i < 100; i++) {
        // (the port asked by a plain socket first: a fetch to a server still starting up crashed Node's own http client — undici
        // «assert(!this.paused)», uncatchable; a fetch only once the port answers)
        if (!(await portOpen(port))) { await new Promise((r) => setTimeout(r, 100)); continue; }
        try {
            const r = await fetch(url);
            if (r.ok) return { proc, url, log: () => log, stop: () => proc.kill() };
        } catch (e) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    proc.kill();
    throw new Error('server did not start: ' + log);
}

/** Make (once) a fake webcam video from a fixture image. */
export function fakeVideo(image = 'thumb_up.jpg') {
    const out = path.join(os.tmpdir(), `zns-fake-${path.basename(image, path.extname(image))}.y4m`);
    if (!fs.existsSync(out)) {
        const src = path.isAbsolute(image) ? image : path.join(ROOT, 'tests/fixtures', image);
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', src, '-vf', 'scale=-2:480,pad=640:480:(ow-iw)/2:0:black,format=yuv420p', '-t', '2', '-r', '15', out]);
    }
    return out;
}

export async function launch({ video = null, extraArgs = [], userDataDir = null, viewport = { width: 1280, height: 720 } } = {}) {
    const args = [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--site-per-process', // (as in a desktop Chrome: the camera network's page runs in its own process)
    ];
    if (video) args.push(`--use-file-for-fake-video-capture=${video}`);
    args.push(...extraArgs);
    const executablePath = process.env.ZNS_CHROME || undefined; // (a Chromium of another build than the Playwright one: ZNS_CHROME=/path/to/chrome)
    if (userDataDir) {
        // (a profile kept on the disk between starts, as the launcher's own: the browser's shader cache and the game's
        // boot cache live there — tools/entrybench.mjs --profile-dir, the cold and the warm start)
        const ctx = await chromium.launchPersistentContext(userDataDir, { args, executablePath, viewport, headless: true });
        return { newPage: async () => ctx.pages()[0] || ctx.newPage(), close: () => ctx.close(), context: ctx };
    }
    return chromium.launch({ args, executablePath });
}

export async function openPage(browser, url, { noCamera = false, viewport = { width: 1280, height: 720 } } = {}) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const logs = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
        logs.push(`[${m.type()}] ${m.text()}`);
        if (m.type() === 'error') errors.push('console: ' + m.text());
    });
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    if (noCamera) await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; });
    // (the menu's «Общий сервер» check would try the public broker — no internet here)
    await page.addInitScript(() => { window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; window.__ZNS_NO_FULLSCREEN__ = true; window.__ZNS_NO_TUTORIAL_ASK__ = true; }); // (no «Вы уже прошли обучение?» window in the tests)
    await page.goto(url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready).catch(() => {}); // (the menu's fonts change its layout when they arrive)
    return { page, errors, logs };
}

/** Start a mode from the menu: 'creative' | 'freeworld' | map name */
export async function startFromMenu(page, mode = 'creative', { zombies = 0, smooth = false } = {}) {
    // «Одиночная игра»: my worlds first; «Создать мир» opens the choice (open by itself while there are none)
    await page.waitForFunction(() => document.getElementById('saved-worlds')?.children.length > 0 && document.querySelector('.mode-row .mode-card'));
    if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
    if (['creative', 'freeworld', 'tutorial'].includes(mode)) await page.click(`.mode-card[data-mode="${mode}"]`); // («Обучение» too)
    else {
        await page.click('.mode-card[data-mode="maps"]');
        await page.click(`.map-card[data-name="${mode}"]`);
    }
    if (mode === 'creative' && zombies) {
        await page.evaluate((n) => { const el = document.getElementById('creative-zombie-count'); el.value = String(n); }, zombies);
    }
    await page.click('#start-btn');
    // (a container without a real graphics card compiles the shaders for minutes: ZNS_START_TIMEOUT=ms)
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: Number(process.env.ZNS_START_TIMEOUT) || 90000 });
}

export async function waitHudVisible(page, timeout = 60000) {
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Errors that are expected in a headless sandbox (no audio device, no speech API etc.). */
export function realErrors(errors) {
    return errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|Created TensorFlow Lite XNNPACK delegate|Web Speech API|AudioContext|Failed to load resource: the server responded with a status of 404 \(File not found\).*favicon|favicon\.ico|WebGL: INVALID|GPU stall|GL Driver Message/i.test(e));
}
