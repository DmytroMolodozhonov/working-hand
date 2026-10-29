// Pictures and numbers of the Canaries (CanaryModel.js): a line-up of looks, the poses (walk, lift, carry, windup, throw, shove, roar, dead) next to
// a hero post (4.6 m) and a horse, a boulder, the camp's props, the two things they leave. Usage: node tools/canary-screenshots.mjs [--out docs/canaries]
// (a Chromium of another build: ZNS_CHROME=/path/to/chrome)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/canaries'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8811)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const M = await import('/src/fx/CanaryModel.js');
        const A = await import('/src/game/AnimalModels.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {}, numbers = {};
        const scene = () => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x9fd0ee); s.fog = new THREE.Fog(s.background, 40, 160);
            s.add(new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 0.8)); const sun = new THREE.DirectionalLight(0xfff4dd, 0.85); sun.position.set(20, 40, 25); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: 0x5f8a45 })); g.rotation.x = -Math.PI / 2; s.add(g);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz, fov = 40) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.2, 300); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const hero = (x, z) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); h.position.set(x, 2.3, z); return h; };
        const shot = (name, s, c) => { r.render(s, c); res[name] = cv.toDataURL('image/png'); };
        // looks
        { const s = scene(); for (let i = 0; i < 8; i++) { const m = M.canaryModel(M.canaryLook(i * 3 + 1)); m.position.set(-7.5 + i * 2.2, 0, 0); m.rotation.y = 0.25; M.poseCanary(m, { mode: 'idle', breath: i }); s.add(m); } s.add(hero(-10, 2)); shot('looks', s, cam(0, 2.6, 13, 0, 1.2, 0)); }
        // poses
        const poses = [['idle', 0], ['walk', 1.2], ['lift', 0.6], ['carry', 2.1], ['windup', 0.6], ['throw', 0.2], ['shove', 0.35], ['roar', 0.45]];
        { const s = scene(); const rock = new THREE.Mesh(M.rockGeometry(0), new THREE.MeshLambertMaterial({ vertexColors: true }));
            poses.forEach(([mode, t], i) => { const m = M.canaryModel(M.canaryLook(5)); m.position.set(-8 + i * 2.3, 0, 0); m.rotation.y = 0.35; M.poseCanary(m, { mode, t, walk: t * 4, speed: 1, breath: 1 }); s.add(m); m.updateMatrixWorld(true);
                if (['lift', 'carry', 'windup'].includes(mode)) { const rk = rock.clone(); m.userData.hold.updateWorldMatrix(true, false); const p = new THREE.Vector3(); m.userData.hold.getWorldPosition(p); rk.position.copy(p); rk.scale.setScalar(1.1); s.add(rk); } });
            s.add(hero(-10.5, 2)); shot('poses', s, cam(0, 2.4, 14, 0, 1.1, 0)); }
        { const s = scene(); const m = M.canaryModel(M.canaryLook(4)); M.poseCanary(m, { mode: 'carry', walk: 1, speed: 0.8, breath: 0 }); s.add(m); const rk = new THREE.Mesh(M.rockGeometry(1), new THREE.MeshLambertMaterial({ vertexColors: true })); m.updateMatrixWorld(true); m.userData.hold.getWorldPosition(rk.position); s.add(rk);
            shot('closeup', s, cam(2.2, 1.9, -3.2, 0, 1.3, 0, 35)); }
        { const s = scene(); const m = M.canaryModel(M.canaryLook(9)); M.poseCanary(m, { mode: 'idle', breath: 0 }); m.rotation.y = 0.5; s.add(m); shot('face', s, cam(0.9, 1.9, -1.7, 0, 1.78, 0, 28)); }
        { const s = scene(); const m = M.canaryModel(M.canaryLook(9)); M.poseCanary(m, { mode: 'walk', walk: 0.8, speed: 1, breath: 0 }); m.position.set(-1.2, 0, 0); m.rotation.y = Math.PI / 2; s.add(m);
          const h = A.animalModel('horse', 0x4a3022); h.position.set(2.4, 0, 0); h.rotation.y = Math.PI / 2; s.add(h); const p = A.animalModel('pig', 1); p.position.set(5, 0, 0); p.rotation.y = Math.PI / 2; s.add(p); s.add(hero(-3.5, 0));
          const bx = new THREE.Box3().setFromObject(m); numbers.canary = bx.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); const hb = new THREE.Box3().setFromObject(h); numbers.horse = hb.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
          shot('scale', s, cam(1, 2.4, 11, 1, 1.6, 0)); }
        // the camp
        { const s = scene(); const m = new THREE.Mesh(M.campGeometry(1), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); s.add(m);
          for (let i = 0; i < 12; i++) { const a = i * 0.83, d = 2.2 + (i % 5) * 2.2; const rk = new THREE.Mesh(M.rockGeometry(i), new THREE.MeshLambertMaterial({ vertexColors: true })); rk.position.set(Math.sin(a) * d, 0.35, Math.cos(a) * d); rk.rotation.y = i; rk.scale.setScalar(0.8 + (i % 3) * 0.15); s.add(rk); }
          for (let i = 0; i < 5; i++) { const m2 = M.canaryModel(M.canaryLook(i * 7 + 2)); m2.position.set(Math.sin(i * 1.3) * 3.5, 0, Math.cos(i * 1.3) * 3.5); m2.rotation.y = i; M.poseCanary(m2, { mode: i === 2 ? 'sit' : 'idle', breath: i }); s.add(m2); }
          for (let i = 0; i < 20; i++) { const a = i * 2.1, d = 14 + (i % 6) * 1.5; const rd = new THREE.Mesh(M.reedGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })); rd.position.set(Math.sin(a) * d, 0, Math.cos(a) * d); s.add(rd); }
          shot('camp', s, cam(0, 18, 34, 0, 1.5, 0, 45)); shot('camp-close', s, cam(8, 5, 12, 0, 1.4, 0, 45)); }
        // items
        const item = (m, name) => { const s = new THREE.Scene(); s.background = new THREE.Color(0x2a2f3a); s.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(2, 4, 3); s.add(d); s.add(m);
            const b = new THREE.Box3().setFromObject(m); numbers[name] = b.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); const c = new THREE.PerspectiveCamera(35, 1, 0.05, 20); const ctr = b.getCenter(new THREE.Vector3()); c.position.set(ctr.x + 0.5, ctr.y + 0.6, ctr.z + 1.1); c.lookAt(ctr); r.setSize(512, 512, false); r.render(s, c); res[name] = cv.toDataURL('image/png'); };
        item(M.canaryHideModel(), 'item-hide'); item(M.boneModel(), 'item-bone');
        res.numbers = JSON.stringify(numbers);
        return res;
    });
    for (const [k, v] of Object.entries(shots)) {
        if (k === 'numbers') { console.log(v); continue; }
        const file = path.join(out, k + '.png'); fs.writeFileSync(file, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', file);
    }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
