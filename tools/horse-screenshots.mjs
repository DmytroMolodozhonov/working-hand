// Pictures of the horses (AnimalModels.horse): an ordinary horse and the Pegasus — side, three quarters, the head and the legs close,
// the wings spread — each standing next to a hero post (3.5 m) for scale.
// Usage: node tools/horse-screenshots.mjs [--out docs/horses] [--port 8860]   (a Chromium of another build: ZNS_CHROME=/path)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/horses'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8860)));
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
        const F = 1.955; // (a horse in the game is 1.955 times the model: Animals.js SPECIES.horse.size)
        const cam = (x, y, z, tx, ty, tz, fov = 36) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.1, 400); c.position.set(x * F, y * F, z * F); c.lookAt(tx * F, ty * F, tz * F); return c; };
        const shot = (n, s, c) => { r.render(s, c); res[n] = cv.toDataURL('image/png'); };
        const hero = (s, x, z) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); h.position.set(x, 1.75 + 0.0, z); s.add(h); };
        const horse = (col) => { const m = A.animalModel('horse', col); m.scale.setScalar(F); return m; };
        const PEG = (i) => A.PEGASUS_COLOR - 5 + i;
        // (the model faces −Z, the rump is +Z)
        { const s = scene(); const m = horse(0x5e3a26); s.add(m); hero(s, 3.6, 0.2); shot('horse-side', s, cam(8, 1.9, 0, 0, 1.6, 0)); }
        { const s = scene(); const m = horse(0x5e3a26); s.add(m); shot('horse-3q', s, cam(4.6, 2.5, -4.6, 0, 1.5, 0, 36)); }
        { const s = scene(); const m = horse(0x7d7a75); s.add(m); shot('horse-grey-3q', s, cam(-4.6, 2.4, -4.6, 0, 1.5, 0, 36)); }
        { const s = scene(); const m = horse(0x33241a); s.add(m); shot('horse-dark-3q', s, cam(4.6, 2.4, -4.3, 0, 1.5, 0, 36)); }
        { const s = scene(); const m = horse(0x5e3a26); s.add(m); shot('horse-head', s, cam(1.5, 2.45, -2.9, 0, 2.2, -1.5, 34)); }
        { const s = scene(); const m = horse(0x5e3a26); s.add(m); shot('horse-legs', s, cam(2.6, 0.9, -1.9, 0, 0.8, -0.4, 40)); }
        { const s = scene(); const m = horse(0x5e3a26); s.add(m); shot('horse-rear', s, cam(2.2, 2.1, 3.6, 0, 1.5, 0.6, 38)); }
        { const s = scene(); const m = horse(PEG(0)); s.add(m); hero(s, 3.8, 0.2); shot('peg-white-side', s, cam(8.5, 2.0, 0, 0, 1.7, 0)); }
        { const s = scene(); const m = horse(PEG(1)); s.add(m); shot('peg-grey-3q', s, cam(4.6, 2.5, -4.6, 0, 1.6, 0, 36)); }
        { const s = scene(); const m = horse(PEG(1)); A.animateWings(m, 1, 0.3, 0.2); s.add(m); shot('peg-spread-front', s, cam(3.6, 2.4, -6.2, 0, 1.9, 0, 42)); }
        { const s = scene(); const m = horse(PEG(0)); A.animateWings(m, 1, 0.3, 0.2); s.add(m); shot('peg-white-spread', s, cam(6.5, 2.4, -2.0, 0, 1.9, 0, 44)); }
        { const s = scene(); const m = horse(PEG(4)); s.add(m); shot('peg-golden-3q', s, cam(-4.6, 2.4, -4.6, 0, 1.6, 0, 36)); }
        { const s = scene(); const m = horse(PEG(5)); s.add(m); shot('peg-black-3q', s, cam(4.6, 2.4, -4.3, 0, 1.6, 0, 36)); }
        { const s = scene(); const m = horse(PEG(1)); s.add(m); shot('peg-head', s, cam(1.5, 2.45, -2.9, 0, 2.2, -1.5, 34)); }
        { const s = scene(); const m = horse(PEG(1)); A.animateWings(m, 1, 0.3, 0.2); s.add(m); shot('peg-wing-close', s, cam(2.8, 2.5, -0.8, 0, 2.1, 0.1, 42)); }
        { const s = scene(); const m = horse(PEG(0)); A.animateWings(m, 1, 0, 0); s.add(m); shot('peg-wing-top', s, cam(2.6, 7.5, -1.4, 1.5, 2.0, 0.1, 40)); }
        { const s = scene(); const m = horse(PEG(1)); s.add(m); shot('peg-fold-close', s, cam(4.0, 2.7, 0.2, 0, 2.0, 0.1, 38)); }
        { const s = scene(); const m = horse(PEG(4)); A.animateWings(m, 1, 0.5, 0.3); s.add(m); shot('peg-golden-flight', s, cam(5.5, 2.8, -4.5, 0, 2.2, 0, 50)); }
        { const s = scene(); A.HORSE_COLORS.forEach((c, i) => { const m = horse(c); m.position.set((i - 2.5) * 6.2, 0, 0); m.rotation.y = -0.9; s.add(m); }); shot('coats-horses', s, cam(0, 3.6, -17, 0, 1.6, 0, 44)); }
        { const s = scene(); A.PEGASUS_COATS.forEach((_, i) => { const m = horse(PEG(i)); m.position.set((i - 2.5) * 6.2, 0, 0); m.rotation.y = -0.9; s.add(m); }); shot('coats-pegasi', s, cam(0, 3.6, -17, 0, 1.6, 0, 44)); }
        { const W = await import('/src/game/PegasusWing.js');
          const solo = (infl, rx, ry, rz, name, dist = 2.2) => { const s = scene(); s.background = new THREE.Color(0x6f8fa8); const m = new THREE.Mesh(W.pegasusWingGeo(), W.pegasusWingMat(0xf7f4ee, 0)); m.morphTargetInfluences[0] = infl[0]; m.morphTargetInfluences[1] = infl[1]; m.rotation.set(rx, ry, rz); s.add(m);
            const c = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 50); c.position.set(0.55, dist, 0.2); c.lookAt(0.55, 0, 0.2); c.up.set(0, 0, -1); shot(name, s, c); };
          solo([1, 0], 0, 0, 0, 'wing-solo-top');
          solo([1, 0.6], 0, 0, 0, 'wing-solo-top-flex');
          solo([0, 0], 0, 0, 0, 'wing-solo-fold-top', 1.6); }
        return res;
    });
    for (const [k, v] of Object.entries(shots)) { const f = path.join(out, k + '.png'); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', f); }
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
