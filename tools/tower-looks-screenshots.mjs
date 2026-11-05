// A PREVIEW (not connected): the tower's students (5 uniforms) and the Head of the tower (3 looks), TEXTURED, on the hero model (src/entities/TowerLooks.js).
// node tools/tower-looks-screenshots.mjs [--out docs/media]  → tower-looks-students.png, tower-looks-master.png
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const srv = await startServer(Number(arg('--port', 8900)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 500000);
try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const which of ['students', 'master']) {
        const png = await page.evaluate(async (which) => {
            const THREE = await import('three');
            const { VoxelCharacter } = await import('/src/entities/Character.js');
            const A = await import('/src/entities/Appearance.js');
            const T = await import('/src/entities/TowerLooks.js');
            const W = 1800, H = 900;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
            scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.95));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(-4, 8, 9); scene.add(sun);
            const rim = new THREE.DirectionalLight(0x8ab0ff, 0.4); rim.position.set(6, 3, -6); scene.add(rim);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
            const kinds = which === 'students' ? T.STUDENT_KINDS : T.MASTER_KINDS;
            const hairs = [0x4a3728, 0x2b1d14, 0x8b5a2b, 0xd9b46c, 0xa83e2a];
            const gap = which === 'students' ? 5.8 : 8;
            kinds.forEach((k, i) => {
                const ch = new VoxelCharacter(scene);
                A.applyLook(ch, { ...A.defaultLook(), hair: which === 'master' ? 5 : i % 3 === 1 ? 1 : 0, hairColor: which === 'master' ? 0xe8e4dc : hairs[i], top: 0, topColor: 0x3a3a44, bottom: 3, bottomColor: 0x2a2a30, shoes: 1, shoesColor: 0x2a1a10, face: 3 + i * 5 });
                T.dressTower(ch, k);
                for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) { a.rotation.x = Math.PI / 2 - 0.1; e.rotation.x = 0.28; }
                ch.group.position.set((i - (kinds.length - 1) / 2) * gap, 1.95, 0);
                ch.group.rotation.y = Math.PI + (i - (kinds.length - 1) / 2) * -0.1;
            });
            const cam = new THREE.PerspectiveCamera(27, W / H, 0.1, 100); cam.position.set(0, 5.6, which === 'students' ? 33 : 30); cam.lookAt(0, 4.5, 0);
            r.render(scene, cam);
            const o = document.createElement('canvas'); o.width = W; o.height = H;
            const g = o.getContext('2d'); g.drawImage(cv, 0, 0);
            g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
            kinds.forEach((k, i) => { const p = new THREE.Vector3((i - (kinds.length - 1) / 2) * gap, 0.2, 0).project(cam); const y = H - 40 - (i % 2 ? 0 : 0); g.fillText(`${i + 1}`, (p.x * 0.5 + 0.5) * W, y - 28); g.font = 'bold 22px sans-serif'; g.fillText(T.TOWER_RU[k], (p.x * 0.5 + 0.5) * W, y); g.font = 'bold 26px sans-serif'; });
            return o.toDataURL('image/png');
        }, which);
        fs.writeFileSync(path.join(out, `tower-looks-${which}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log('written', which);
    }
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
