// Pictures of the Pegasus coats (AnimalModels.PEGASUS_COATS): every coat standing with folded wings, and one with the wings spread, next to a hero post
// (4.6 m) and an ordinary horse. Usage: node tools/pegasus-screenshots.mjs [--out docs/pegasus]  (a Chromium of another build: ZNS_CHROME=/path)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/pegasus'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8813)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const A = await import('/src/game/AnimalModels.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {};
        const scene = () => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x9fd0ee); s.fog = new THREE.Fog(s.background, 50, 200);
            s.add(new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 0.8)); const sun = new THREE.DirectionalLight(0xfff4dd, 0.85); sun.position.set(20, 40, 25); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5f8a45 })); g.rotation.x = -Math.PI / 2; s.add(g);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz, fov = 40) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.2, 400); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const shot = (n, s, c) => { r.render(s, c); res[n] = cv.toDataURL('image/png'); };
        { const s = scene(); A.PEGASUS_COATS.forEach((c, i) => { const m = A.animalModel('horse', A.PEGASUS_COLOR - 5 + i); m.position.set(-8 + i * 3.4, 0, 0); m.rotation.y = -Math.PI / 2 + 0.5; s.add(m); }); shot('coats', s, cam(2, 4, 18, 2, 1.6, 0)); }
        { const s = scene(); for (const [i, k] of [[0, 0], [1, 1], [4, 2]]) { const m = A.animalModel('horse', A.PEGASUS_COLOR - 5 + i); A.animateWings(m, 1, 0.3 * k, 0.2); m.position.set(-7 + k * 7, 0, 0); m.rotation.y = 0.3; s.add(m); }
          const h = A.animalModel('horse', 0x4a3022); h.position.set(11, 0, 0); h.rotation.y = 0.3; s.add(h);
          const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); hero.position.set(-12, 2.3, 0); s.add(hero);
          shot('spread', s, cam(0, 4, 20, 0, 2, 0)); }
        { const s = scene(); const m = A.animalModel('horse', A.PEGASUS_COLOR - 5 + 1); A.animateWings(m, 1, 0.3, 0.2); m.rotation.y = 0.9; s.add(m); shot('closeup', s, cam(7, 3.6, 8, 0, 2.4, 0, 38)); }
        { const s = scene(); const m = A.animalModel('horse', A.PEGASUS_COLOR - 5 + 5); m.rotation.y = 0.9; s.add(m); shot('black', s, cam(6, 2.6, 7, 0, 1.6, 0, 38)); }
        return res;
    });
    for (const [k, v] of Object.entries(shots)) { const f = path.join(out, k + '.png'); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', f); }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
