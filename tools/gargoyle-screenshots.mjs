// Pictures of the infernal gargoyle (GargoyleModel.js): poses in a row beside a hero-sized post (3.5 m) and the owl's size (1.2 m).
// Usage: node tools/gargoyle-screenshots.mjs [--out docs/gargoyles] [--view front|side|top] [--night]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/gargoyles'));
const view = arg('--view', 'front');
const night = process.argv.includes('--night');
const modes = (arg('--modes', 'fly,hover,dive,bite,stone')).split(',');
const camArg = arg('--cam', null), lookArg = arg('--look', null);
const port = Number(arg('--port', 8795));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 780 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const url = await page.evaluate(async ([view, night, modes, camArg, lookArg]) => {
        const THREE = await import('three');
        const M = await import('/src/game/GargoyleModel.js?' + Date.now());
        const cv = document.createElement('canvas');
        cv.width = 1500; cv.height = 780;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(night ? 0x0a0810 : 0x8aa0b8);
        scene.add(new THREE.HemisphereLight(night ? 0x504060 : 0xdfefff, 0x3a2a2a, night ? 0.5 : 0.8));
        const sun = new THREE.DirectionalLight(night ? 0x7080c0 : 0xfff4dd, night ? 0.4 : 0.8);
        sun.position.set(20, 40, 30); scene.add(sun);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
        ground.rotation.x = -Math.PI / 2; scene.add(ground);
        const gap = 6;
        modes.forEach((mode, i) => {
            const g = M.gargoyleModel(i);
            g.scale.setScalar(M.MODEL_SCALE);
            g.position.set((i - (modes.length - 1) / 2) * gap, M.HIP * M.MODEL_SCALE + (mode === 'stone' ? 0 : 1.8), 0);
            const a = { mode, seed: i * 1.7, ph: i, bite: mode === 'bite' ? 0.5 : 0 };
            for (let k = 0; k < 40; k++) M.poseGargoyle(g, a, 0.03);
            if (mode === 'dive') g.rotation.x = 0.9;
            if (mode === 'fly') g.rotation.x = 0.35;
            scene.add(g);
        });
        const hero = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
        hero.position.set(-gap * modes.length / 2 - 2, 1.75, 1); scene.add(hero);
        const owl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x3050d0 }));
        owl.position.set(-gap * modes.length / 2 - 1, 0.6, 1); scene.add(owl);
        const cam = new THREE.PerspectiveCamera(40, 1500 / 780, 0.5, 400);
        if (view === 'front') { cam.position.set(0, 4, 26); cam.lookAt(0, 2.8, 0); }
        else if (view === 'side') { cam.position.set(30, 4, 0); cam.lookAt(0, 2.8, 0); }
        else { cam.position.set(0, 30, 6); cam.lookAt(0, 0, 0); }
        if (camArg) { cam.position.set(...camArg.split(',').map(Number)); cam.lookAt(...(lookArg || '0,2.8,0').split(',').map(Number)); }
        r.render(scene, cam);
        const u = cv.toDataURL('image/png');
        r.dispose();
        return u;
    }, [view, night, modes, camArg, lookArg]);
    const file = path.join(out, arg('--name', `gargoyles-${view}${night ? '-night' : ''}`) + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', file);
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
