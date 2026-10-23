// Pictures of the apple trees (AppleTrees.js): the ordinary one with red apples and the golden magic one, by day
// and at night (its glow), a hero-sized post (3.5 m) beside them. Usage: node tools/apple-screenshots.mjs [--out docs/trees]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/trees'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8806)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'tools/tree-view.html');
    for (const night of [false, true]) {
        const url = await page.evaluate(async (night) => {
            const THREE = await import('three');
            const { appleTreeModel, pulseGolden } = await import('/src/game/AppleTrees.js');
            const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(night ? 0x0b1020 : 0x9fd0ee);
            scene.fog = new THREE.Fog(scene.background, 20, night ? 50 : 120);
            scene.add(new THREE.HemisphereLight(night ? 0x334466 : 0xdfefff, 0x3a4a2a, night ? 0.25 : 0.7));
            const sun = new THREE.DirectionalLight(night ? 0x8899cc : 0xfff4dd, night ? 0.15 : 0.8);
            sun.position.set(20, 40, 25); sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 100 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun);
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x5f9a45 }));
            ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
            const red = appleTreeModel(true, 0.3), gold = appleTreeModel(false, 0.6);
            red.position.x = -6; gold.position.x = 6;
            scene.add(red, gold);
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.5, 0.4), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(0, 1.75, 4); scene.add(hero);
            pulseGolden(1, night ? 1 : 0);
            const cam = new THREE.PerspectiveCamera(45, 1280 / 720, 0.3, 300);
            cam.position.set(0, 4.5, 22); cam.lookAt(0, 4.5, 0);
            r.render(scene, cam);
            const u = cv.toDataURL('image/png'); r.dispose(); return u;
        }, night);
        const file = path.join(out, `apples-${night ? 'night' : 'day'}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
