// Pictures of the Armourleaf (Бронелист) and its picked leaf: node tools/armourleaf-screenshots.mjs [--out docs/media/armourleaf]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/armourleaf'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8862)));
const browser = await launch();
const guard = setTimeout(() => { console.error('timeout'); process.exit(1); }, 240000);
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const F = await import('/src/fx/FloraModels.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {}, M = F.floraMaterials();
        const scene = () => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x9fd0ee);
            s.add(new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 1.0));
            const sun = new THREE.DirectionalLight(0xfff4dd, 1.4); sun.position.set(14, 30, -16); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5f8a45 })); g.rotation.x = -Math.PI / 2; s.add(g);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz, fov = 36) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.1, 400); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const shot = (n, s, c) => { r.render(s, c); res[n] = cv.toDataURL('image/png'); };
        const plant = (v) => new THREE.Mesh(F.floraBody('armourleaf', v), M.plate);
        { const s = scene(); s.add(plant(0)); shot('plant-3q', s, cam(2.6, 1.6, -2.6, 0, 0.85, 0)); }
        { const s = scene(); s.add(plant(1)); shot('plant-side', s, cam(3.6, 1.1, 0, 0, 0.85, 0)); }
        { const s = scene(); s.add(plant(2)); shot('plant-top', s, cam(0.6, 4.2, -1.6, 0, 0.7, 0, 40)); }
        { const s = scene(); for (let i = 0; i < 3; i++) { const m = plant(i); m.position.set((i - 1) * 2.6, 0, 0); m.rotation.y = i; s.add(m); } shot('plants', s, cam(0, 2.2, -7, 0, 0.9, 0, 40)); }
        { const s = scene(); const m = new THREE.Mesh(F.floraPick('armourleaf'), M.plate); m.rotation.set(-1.0, 0.5, 0); s.add(m); shot('leaf', s, cam(0.9, 0.7, -0.9, 0.3, 0.1, 0, 36)); }
        return res;
    });
    for (const [k, v] of Object.entries(shots)) { const f = path.join(out, k + '.png'); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', f); }
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
