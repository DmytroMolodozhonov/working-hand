// Pictures of the ten wands (src/game/WandModel.js) plus the plain one: close, lit from the side.
// Usage: node tools/wand-screenshots.mjs [--out docs/media/wands.png]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/wands.png'));
const srv = await startServer(Number(arg('--port', 8801)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 280000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 700 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async () => {
        const THREE = await import('three');
        const { makeItemModel } = await import('/src/game/ItemTypes.js');
        const W = 1600, H = 700;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.0));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.2); sun.position.set(-3, 4, 6); scene.add(sun);
        const cols = [0x8b5a2b, 0x5a3a1e, 0x7a4a24, 0x9a6a3a, 0xb8c8d8, 0x6b3f8e, 0x3f5a36, 0x8a2a2a, 0x4a6a8a, 0x2a2a3a];
        const items = cols.map((c, i) => ({ kind: 'wand', model: i, color: c, uid: 'w' + i }));
        items.push({ kind: 'wand', plain: true, model: 0, color: 0x8b5a2b, uid: 'wp' });
        const g = new THREE.Group();
        items.forEach((it, i) => { const m = makeItemModel(it); m.scale.setScalar(1); m.position.set((i - 5) * 0.34, -0.33, 0); m.rotation.z = -0.25; g.add(m); });
        scene.add(g);
        const cam = new THREE.PerspectiveCamera(22, W / H, 0.05, 20); cam.position.set(0, 0, 4.2); cam.lookAt(0, 0, 0);
        r.render(scene, cam);
        return cv.toDataURL('image/png');
    });
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', out);
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
