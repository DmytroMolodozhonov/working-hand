// Pictures of the backpacks (src/game/BackpackModel.js): six leather ones (tones, pockets, straps differ) and the golden magic one — front and back.
// Usage: node tools/backpack-screenshots.mjs [--out docs/media]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8798)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 240000);
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 760 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async () => {
        const THREE = await import('three');
        const { makeItemModel, newMagicBackpack } = await import('/src/game/ItemTypes.js');
        const { LEATHER } = await import('/src/game/BackpackModel.js');
        const cv = document.createElement('canvas'); cv.width = 1500; cv.height = 760;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3c4048);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.0));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.1); sun.position.set(-2, 4, 5); scene.add(sun);
        const items = [0, 1, 2, 3, 4, 5].map((i) => ({ kind: 'backpack', slots: 4, color: LEATHER[i * 2 % LEATHER.length], uid: 'bp' + i * 7 }));
        items.push(newMagicBackpack());
        const cam = new THREE.PerspectiveCamera(30, 1500 / 380, 0.1, 50);
        const shots = [];
        for (const back of [false, true]) {
            const grp = new THREE.Group();
            items.forEach((it, i) => { const m = makeItemModel(it); m.scale.setScalar(1); m.position.set((i - 3) * 1.25, 0, 0); if (back) m.rotation.y = Math.PI; m.rotation.y += back ? 0 : -0.5; grp.add(m); });
            scene.add(grp);
            cam.position.set(0, 0.5, 6.5); cam.lookAt(0, 0, 0);
            r.setViewport(0, back ? 0 : 380, 1500, 380); r.setScissor(0, back ? 0 : 380, 1500, 380); r.setScissorTest(true);
            r.render(scene, cam); scene.remove(grp);
        }
        return cv.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(out, 'backpacks.png'), Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', path.join(out, 'backpacks.png'));
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
