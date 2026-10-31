// Pictures of the Tarons (TaronModel.js): the look from the front and the side, the swing (wind-up / blow, blade and hammer side), next to a hero post (3.5 m),
// a line-up of looks. Usage: node tools/taron-screenshots.mjs [--out docs/media]   (a Chromium of another build: ZNS_CHROME=/path/to/chrome)
import { launch, ROOT } from '../tests/e2e/harness.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
// (a plain static server of the repository: the game's own python server is not needed to draw a model)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
await new Promise((ok) => server.listen(Number(arg('--port', 8812)), ok));
const srv = { url: `http://localhost:${server.address().port}/`, close: () => server.close() };
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const M = await import('/src/fx/TaronModel.js');
        const R = await import('/src/game/TaronRules.js');
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {};
        const scene = () => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x2a1210); s.fog = new THREE.Fog(s.background, 50, 220);
            s.add(new THREE.HemisphereLight(0xffb090, 0x301410, 0.9)); const sun = new THREE.DirectionalLight(0xffd0a0, 0.9); sun.position.set(20, 40, 25); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x2a2220 })); g.rotation.x = -Math.PI / 2; s.add(g);
            const glow = new THREE.PointLight(0xff6a2a, 1.4, 90); glow.position.set(-12, 6, -10); s.add(glow);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz, fov = 40) => { const c = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.2, 400); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const hero = (x, z) => { const h = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xd03030 })); h.position.set(x, 1.75, z); return h; };
        const shot = (name, s, c) => { r.render(s, c); res[name] = cv.toDataURL('image/png'); };
        // (the model looks along −Z: turned to the camera at +Z)
        const taron = (seed, pose, x = 0, z = 0, yaw = 0) => { const m = M.taronModel(R.taronLook(seed)); m.position.set(x, 0, z); m.rotation.y = yaw + Math.PI; M.poseTaron(m, pose); return m; };
        { const s = scene(); s.add(taron(2, { mode: 'idle', breath: 1 })); shot('front', s, cam(0, 4.2, 17, 0, 3.4, 0, 45)); }
        { const s = scene(); s.add(taron(2, { mode: 'idle', breath: 1 }, 0, 0, -Math.PI / 2)); shot('side', s, cam(18, 4.2, 0, 0, 3.4, 0, 45)); }
        { const s = scene(); s.add(taron(4, { mode: 'idle', breath: 1 }, 0, 0, 0.3)); s.add(hero(-5.5, 0)); shot('compare', s, cam(2, 4, 20, -2, 3.2, 0, 45)); }
        { const s = scene(); const t = taron(3, { mode: 'windup', p: 1, side: 'blade' }, -7, 0, 0.4); s.add(t); s.add(taron(3, { mode: 'swing', p: 0.75, side: 'blade' }, 6, 0, -0.4)); s.add(hero(-1, 0)); shot('attack', s, cam(0, 6, 26, 0, 3.6, 0, 50)); }
        { const s = scene(); s.add(taron(5, { mode: 'windup', p: 1, side: 'hammer' }, -6, 0, 0.3)); s.add(taron(5, { mode: 'swing', p: 0.7, side: 'hammer' }, 6, 0, -0.3)); shot('hammer', s, cam(0, 6, 26, 0, 3.6, 0, 50)); }
        { const s = scene(); for (let i = 0; i < 6; i++) s.add(taron(i * 5 + 1, { mode: i % 2 ? 'walk' : 'idle', walk: i, speed: 2.4, breath: i }, -17 + i * 6.8, i % 3 * -4, 0.2 + i * 0.1)); s.add(hero(-21, -4)); shot('camp', s, cam(0, 9, 36, 0, 3.4, -3, 50)); }
        { const s = scene(); for (let i = 0; i < 4; i++) s.add(taron(i * 7 + 2, { mode: 'idle', breath: i }, -10 + i * 6.6, 0, 0)); shot('looks', s, cam(0, 4, 22, 0, 3.4, 0, 50)); }
        return res;
    });
    for (const [name, url] of Object.entries(shots)) fs.writeFileSync(path.join(out, `taron-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('pictures in', out, Object.keys(shots).join(', '));
} finally { await browser.close(); srv.close?.(); }
