/**
 * Shared helpers for browser tests: game server, Chromium with a fake webcam,
 * error collection and small wait utilities.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function startServer(port) {
    const proc = spawn('python3', ['server.py', '--no-browser'], {
        cwd: ROOT,
        env: { ...process.env, ZNS_PORT: String(port), ZNS_NO_BROWSER: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    proc.stdout.on('data', (d) => { log += d; });
    proc.stderr.on('data', (d) => { log += d; });
    const url = `http://localhost:${port}/`;
    for (let i = 0; i < 100; i++) {
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

export async function launch({ video = null } = {}) {
    const args = [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
    ];
    if (video) args.push(`--use-file-for-fake-video-capture=${video}`);
    const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
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
    await page.addInitScript(() => { window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 30000 });
    return { page, errors, logs };
}

/** Start a mode from the menu: 'creative' | 'survival' | map name */
export async function startFromMenu(page, mode = 'creative', { zombies = 0 } = {}) {
    await page.waitForSelector('.map-card');
    if (mode === 'survival') await page.click('.mode-card.survival');
    else if (mode === 'creative') await page.click('.mode-card:not(.survival)');
    else await page.click(`.map-card[data-name="${mode}"]`);
    if (mode === 'creative' && zombies) {
        await page.evaluate((n) => { const el = document.getElementById('creative-zombie-count'); el.value = String(n); }, zombies);
    }
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 90000 });
}

export async function waitHudVisible(page, timeout = 60000) {
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Errors that are expected in a headless sandbox (no audio device, no speech API etc.). */
export function realErrors(errors) {
    return errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|Created TensorFlow Lite XNNPACK delegate|Web Speech API|AudioContext|Failed to load resource: the server responded with a status of 404 \(File not found\).*favicon|favicon\.ico|WebGL: INVALID|GPU stall|GL Driver Message/i.test(e));
}
