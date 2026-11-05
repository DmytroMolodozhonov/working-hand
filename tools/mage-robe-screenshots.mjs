// Pictures of the mage robe (src/entities/MageRobeLook.js, NOT connected to the game) on the game's own hero model: four robes, front and three-quarters.
// Usage: node tools/mage-robe-screenshots.mjs [--out docs/media]   → mage-robe-front.png, mage-robe-side.png
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const srv = await startServer(Number(arg('--port', 8870)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 600000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const view of ['front', 'side']) {
        const png = await page.evaluate(async (view) => {
            const THREE = await import('three');
            const { VoxelCharacter } = await import('/src/entities/Character.js');
            const A = await import('/src/entities/Appearance.js');
            const { mageRobeParts } = await import('/src/entities/MageRobeLook.js');
            const W = 1600, H = 900;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
            scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.95));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.2); sun.position.set(-4, 8, -9); scene.add(sun); // (the hero's front is −z)
            const sun2 = new THREE.DirectionalLight(0xfff0d8, 1.0); sun2.position.set(-4, 8, 9); scene.add(sun2);
            const rim = new THREE.DirectionalLight(0x8ab0ff, 0.4); rim.position.set(6, 3, 6); scene.add(rim);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
            const robes = [
                { code: 1, color: 0x6a7a96, tier: 0, label: 'Простая', hair: 0x8a5a30 },
                { code: 2, color: 0x2a3f78, tier: 1, label: 'Средняя', hair: 0xe8e4dc },
                { code: 2, color: 0x4a2a7a, tier: 2, label: 'Сильная', hair: 0x2b1d14 },
                { code: 2, color: 0x8a2a20, tier: 2, label: 'Сильная (огненная)', hair: 0x1c1410 },
            ].slice(0, view === 'front' ? 4 : 3);
            const gap = view === 'front' ? 5.4 : 6.2;
            robes.forEach((c, i) => {
                const ch = new VoxelCharacter(scene);
                A.applyLook(ch, { ...A.defaultLook(), hair: 0, hairColor: c.hair, top: 0, topColor: 0x3a3a44, bottom: 3, bottomColor: 0x2a2a30, shoes: 1, shoesColor: 0x2a1a10, face: 4 + i * 5 });
                ch._armorParts = [];
                mageRobeParts(ch, c.code, c.color, true, ch._armorParts, c.tier);
                for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) { a.rotation.x = Math.PI / 2 - 0.1; e.rotation.x = 0.28; }
                ch.group.position.set((i - (robes.length - 1) / 2) * gap, 1.95, 0);
                ch.group.rotation.y = Math.PI + (view === 'side' ? 0.7 : 0);
            });
            const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
            cam.position.set(0, 5.0, view === 'front' ? 26 : 22); cam.lookAt(0, 4.0, 0);
            r.render(scene, cam);
            const o = document.createElement('canvas'); o.width = W; o.height = H;
            const g = o.getContext('2d'); g.drawImage(cv, 0, 0);
            g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
            robes.forEach((c, i) => { const p = new THREE.Vector3((i - (robes.length - 1) / 2) * gap, 0.2, 0).project(cam); g.fillText(c.label, (p.x * 0.5 + 0.5) * W, H - 40); });
            return o.toDataURL('image/png');
        }, view);
        fs.writeFileSync(path.join(out, `mage-robe-${view}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log('written', view);
    }
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
