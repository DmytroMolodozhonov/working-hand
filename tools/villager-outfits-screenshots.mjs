// The five wizard costumes on the NPC villager model (src/entities/VillagerOutfits.js): wanderers / town and village wizards. node tools/villager-outfits-screenshots.mjs [--out docs/media/villager-outfits.png]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/villager-outfits.png'));
const srv = await startServer(Number(arg('--port', 8890)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 300000);
try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async () => {
        const THREE = await import('three');
        const M = await import('/src/entities/VillagerModel.js');
        const { OUTFIT_KINDS, OUTFIT_RU } = await import('/src/entities/VillagerOutfits.js');
        const W = 1800, H = 900;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.95));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(-4, 8, -9); scene.add(sun);
        const sun2 = new THREE.DirectionalLight(0xfff0d8, 0.9); sun2.position.set(3, 6, 9); scene.add(sun2);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
        const found = {};
        for (let seed = 0; seed < 200 && Object.keys(found).length < 5; seed++) { const L = M.villagerLook(seed, seed % 2 ? 'townwiz' : 'wanderer', seed % 3 === 0); if (L.outfit && !found[L.outfit]) found[L.outfit] = L; }
        const kinds = OUTFIT_KINDS.filter((k) => found[k]);
        kinds.forEach((k, i) => {
            const v = new M.VillagerModel(found[k], { tool: 'none' });
            v.update(1 / 60, { mode: 'idle' });
            v.group.position.set((i - (kinds.length - 1) / 2) * 5, 1.95, 0);
            v.group.rotation.y = Math.PI;
            scene.add(v.group);
        });
        const cam = new THREE.PerspectiveCamera(27, W / H, 0.1, 100); cam.position.set(0, 5.0, 30); cam.lookAt(0, 3.9, 0);
        r.render(scene, cam);
        const o = document.createElement('canvas'); o.width = W; o.height = H;
        const g = o.getContext('2d'); g.drawImage(cv, 0, 0);
        g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
        kinds.forEach((k, i) => { const p = new THREE.Vector3((i - (kinds.length - 1) / 2) * 5, 0.2, 0).project(cam); g.fillText(OUTFIT_RU[k], (p.x * 0.5 + 0.5) * W, H - 36); });
        return o.toDataURL('image/png');
    });
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', out);
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
