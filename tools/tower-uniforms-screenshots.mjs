// A PREVIEW (not connected): five uniforms for the tower's students and three looks for the Head of the tower (src/entities/TowerUniforms.js), on the villager model.
// node tools/tower-uniforms-screenshots.mjs  → docs/media/tower-students.png, docs/media/tower-master.png
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const srv = await startServer(Number(arg('--port', 8895)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 400000);
try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const which of ['students', 'master']) {
        const png = await page.evaluate(async (which) => {
            const THREE = await import('three');
            const M = await import('/src/entities/VillagerModel.js');
            const U = await import('/src/entities/TowerUniforms.js');
            const W = 1800, H = 900;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
            scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.95));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(-4, 8, -9); scene.add(sun);
            const sun2 = new THREE.DirectionalLight(0xfff0d8, 0.9); sun2.position.set(3, 6, 9); scene.add(sun2);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
            const kinds = which === 'students' ? U.STUDENT_UNIFORMS : U.MASTER_LOOKS;
            const gap = which === 'students' ? 5 : 7;
            kinds.forEach((k, i) => {
                const L = M.villagerLook(3 + i * 7, which === 'students' ? 'student' : 'master', which === 'students' ? i % 2 === 1 : false);
                U.uniformLook(L, k);
                const v = new M.VillagerModel(L, { tool: 'none' });
                v.update(1 / 60, { mode: 'idle' });
                v.group.position.set((i - (kinds.length - 1) / 2) * gap, 1.95, 0);
                v.group.rotation.y = Math.PI;
                scene.add(v.group);
            });
            const cam = new THREE.PerspectiveCamera(which === 'students' ? 27 : 24, W / H, 0.1, 100); cam.position.set(0, 5.0, which === 'students' ? 30 : 28); cam.lookAt(0, which === 'students' ? 3.9 : 4.1, 0);
            r.render(scene, cam);
            const o = document.createElement('canvas'); o.width = W; o.height = H;
            const g = o.getContext('2d'); g.drawImage(cv, 0, 0);
            g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
            kinds.forEach((k, i) => { const p = new THREE.Vector3((i - (kinds.length - 1) / 2) * gap, 0.2, 0).project(cam); g.fillText(`${i + 1}. ${U.UNIFORM_RU[k]}`, (p.x * 0.5 + 0.5) * W, H - 36); });
            return o.toDataURL('image/png');
        }, which);
        fs.writeFileSync(path.join(out, `tower-${which}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log('written', which);
    }
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
