// Pictures of the NEW pig (PigModel.js — not in the game yet) next to the old one (AnimalModels pig), for the author's eyes:
// side with a hero post (3.5 m) for scale, three quarters, the head, the rear, the legs, the belly, the wings spread, all four breeds.
// Usage: node tools/pig-screenshots.mjs [--out docs/media/pig-new] [--port 8861]   (a Chromium of another build: ZNS_CHROME=/path)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/pig-new'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8861)));
const browser = await launch();
const guard = setTimeout(() => { console.error('timeout'); process.exit(1); }, 420000);
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const A = await import('/src/game/AnimalModels.js');
        const P = await import('/src/game/PigModel.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {};
        const scene = () => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x9fd0ee); s.fog = new THREE.Fog(s.background, 60, 220);
            s.add(new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 0.85));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.9); sun.position.set(14, 30, -16); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5f8a45 })); g.rotation.x = -Math.PI / 2; s.add(g);
            return s;
        };
        const F = 1.45; // (a pig in the game is 1.45 times the model: Animals.js SPECIES.pig.size)
        const cam = (x, y, z, tx, ty, tz, fov = 36) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.1, 400); c.position.set(x * F, y * F, z * F); c.lookAt(tx * F, ty * F, tz * F); return c; };
        const shot = (n, s, c) => { r.render(s, c); res[n] = cv.toDataURL('image/png'); };
        const hero = (s, x, z) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); h.position.set(x, 1.75, z); s.add(h); };
        const pig = (look) => { const m = P.newPigModel(look); m.scale.setScalar(F); return m; };
        const old = (look) => { const m = A.animalModel('pig', look); m.scale.setScalar(F); return m; };
        // (the model faces −Z, the rump is +Z)
        { const s = scene(); s.add(pig(1)); hero(s, -0.2, -2.4); shot('new-side', s, cam(5.6, 0.9, 0, 0, 0.55, 0)); }
        { const s = scene(); s.add(old(1)); hero(s, -0.2, -2.4); shot('old-side', s, cam(5.6, 0.9, 0, 0, 0.55, 0)); }
        { const s = scene(); s.add(pig(1)); shot('new-3q', s, cam(2.6, 1.3, -2.6, 0, 0.55, 0, 36)); }
        { const s = scene(); s.add(old(1)); shot('old-3q', s, cam(2.6, 1.3, -2.6, 0, 0.55, 0, 36)); }
        { const s = scene(); s.add(pig(1)); shot('new-head', s, cam(0.9, 0.85, -1.35, 0, 0.7, -0.62, 34)); }
        { const s = scene(); s.add(old(1)); shot('old-head', s, cam(0.9, 0.85, -1.35, 0, 0.7, -0.62, 34)); }
        { const s = scene(); s.add(pig(1)); shot('new-front', s, cam(0.6, 0.85, -2.7, 0, 0.6, 0, 34)); }
        { const s = scene(); s.add(pig(1)); shot('new-rear', s, cam(1.7, 1.2, 2.2, 0, 0.6, 0.2, 36)); }
        { const s = scene(); s.add(pig(1)); shot('new-legs', s, cam(1.5, 0.35, -1.2, 0, 0.3, -0.15, 40)); }
        { const s = scene(); const m = pig(1); s.add(m); shot('new-belly', s, cam(1.4, 0.12, -1.2, 0, 0.4, 0, 46)); }
        { const s = scene(); const m = pig(1); A.animateWings(m, 1, 0.2, 0.2); s.add(m); shot('new-wings', s, cam(2.6, 1.5, -2.6, 0, 0.8, 0, 42)); }
        for (let i = 1; i <= 4; i++) { const s = scene(); s.add(pig(i)); shot('new-breed' + i, s, cam(2.7, 1.2, -2.7, 0, 0.55, 0, 36)); }
        { const s = scene(); for (let i = 1; i <= 4; i++) { const m = pig(i); m.position.set((i - 2.5) * 3.2, 0, 0); m.rotation.y = -0.8; s.add(m); } shot('new-breeds', s, cam(0, 2.4, -9, 0, 0.7, 0, 38)); }
        return res;
    });
    for (const [k, v] of Object.entries(shots)) { const f = path.join(out, k + '.png'); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', f); }
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
