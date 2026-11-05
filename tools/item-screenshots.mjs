// Pictures of items as they lie / hang (ItemTypes.makeItemModel with ITEM_SCALE): node tools/item-screenshots.mjs --kinds swanWings,magicSwanWings [--out docs/media/items.png]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/items.png'));
const top = process.argv.includes('--top'); // (flat things: from above at an angle, lying)
const kinds = (arg('--kinds', 'swanWings,magicSwanWings')).split(',');
const srv = await startServer(Number(arg('--port', 8830)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 280000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 700 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async ([kinds, top]) => {
        const THREE = await import('three');
        const { makeItemModel, ITEM_SCALE } = await import('/src/game/ItemTypes.js');
        const W = 1600, H = 700;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3a4048);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.0));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.2); sun.position.set(-3, 6, 5); scene.add(sun);
        kinds.forEach((k, i) => {
            const m = makeItemModel({ kind: k, uid: 'x' + i });
            m.position.set((i - (kinds.length - 1) / 2) * 5, 0, 0); m.rotation.set(top ? 0 : 0.3, top ? 0.2 + i * 0.4 : -0.5 + i * 0.3, 0); scene.add(m);
        });
        const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, top ? 12 : 4, top ? 9 : 16); cam.lookAt(0, 0, 0);
        r.render(scene, cam);
        return cv.toDataURL('image/png');
    }, [kinds, top]);
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', out);
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
