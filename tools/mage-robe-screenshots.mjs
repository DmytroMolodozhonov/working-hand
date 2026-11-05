// Pictures of the mage robe (src/entities/MageRobeLook.js) on the game's own hero model: three tiers, front and from the side.
// Usage: node tools/mage-robe-screenshots.mjs [--out docs/media/mage-robe-hero.png]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/mage-robe-hero.png'));
const srv = await startServer(Number(arg('--port', 8800)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 280000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async () => {
        const THREE = await import('three');
        const { VoxelCharacter } = await import('/src/entities/Character.js');
        const { dressArmor } = await import('/src/entities/ArmorLook.js');
        const W = 1600, H = 900;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.9));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.2); sun.position.set(-4, 8, -9); scene.add(sun); // (the hero's front is −z)
        const rim = new THREE.DirectionalLight(0x8ab0ff, 0.4); rim.position.set(6, 3, 6); scene.add(rim);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
        const looks = [{ r: 1, rc: 0x6a7a96, rt: 0 }, { r: 2, rc: 0x2a3f78, rt: 1 }, { r: 2, rc: 0x8a2a20, rt: 2 }, { r: 2, rc: 0x2a5a3a, rt: 2 }];
        const heroes = [];
        looks.forEach((c, i) => {
            const ch = new VoxelCharacter(scene);
            dressArmor(ch, c);
            ch.group.position.set((i - 1.5) * 4.4, 2, 0);
            ch.group.rotation.y = Math.PI + (i - 1.5) * 0.12; // (face the camera at +z)
            heroes.push(ch);
        });
        const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, 4.2, 22); cam.lookAt(0, 3.3, 0);
        r.render(scene, cam);
        return cv.toDataURL('image/png');
    });
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', out);
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
