// Pictures of the keep's forged-iron gates (src/game/GateModel.js): the four variants side by side (two leaves each, shut), a leaf opened, and a
// close-up of one leaf — drawn with the game's own model, a hero-sized post (3.5 m) for scale.
// Usage: node tools/gate-screenshots.mjs [--out docs/gates] [--w 5] [--h 7]   (w: the doorway's width, 5 or 7; h: 7)
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/gates'));
const W = Number(arg('--w', 5)), H = Number(arg('--h', 7));
const port = Number(arg('--port', 8797));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const res = await page.evaluate(async ([W, H]) => {
        const THREE = await import('three');
        const { forgedGateModel, GATE_VARIANTS } = await import('/src/game/GateModel.js');
        const cv = document.createElement('canvas');
        cv.width = 1500; cv.height = 800;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.shadowMap.enabled = true;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9fb4c6);
        scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.9));
        const sun = new THREE.DirectionalLight(0xfff4dd, 1.0);
        sun.position.set(-20, 40, 30); sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 200 });
        scene.add(sun);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshLambertMaterial({ color: 0x6b6f66 }));
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
        // a stone wall behind each gate, the doorway W wide, H high (blocks of 1 m)
        const stone = new THREE.MeshLambertMaterial({ color: 0x8a8d90 });
        const gap = W + 4;
        const gates = [];
        for (let v = 0; v < GATE_VARIANTS; v++) {
            const cx = (v - (GATE_VARIANTS - 1) / 2) * gap * 1.5;
            const wall = new THREE.Mesh(new THREE.BoxGeometry(W + 4, H + 2, 1.4), stone);
            wall.position.set(cx, (H + 2) / 2, -0.9); wall.receiveShadow = true; wall.castShadow = true;
            const hole = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1.5), new THREE.MeshBasicMaterial({ color: 0x1a1a22 }));
            hole.position.set(cx, H / 2, -0.9);
            scene.add(wall, hole);
            const lw = W / 2;
            for (const s of [-1, 1]) {
                const g = forgedGateModel({ mirror: s > 0, w: lw, h: H, vari: v });
                g.position.set(cx + s * lw / 2, 0, 0);
                g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                scene.add(g);
                gates.push({ g, s, v });
            }
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(cx + W / 2 + 1.6, 1.75, 2); scene.add(hero);
        }
        const camera = new THREE.PerspectiveCamera(40, 1500 / 800, 0.3, 400);
        const shot = (pos, look) => { camera.position.set(...pos); camera.lookAt(...look); r.render(scene, camera); return cv.toDataURL('image/png'); };
        const outShots = {};
        outShots.all = shot([0, 7, 34], [0, 4, 0]);
        // the second gate half open, the third shut: the hinge turned
        gates.filter((x) => x.v === 1).forEach(({ g, s }) => { g.userData.hinge.rotation.y = s > 0 ? -1.0 : 1.0; });
        outShots.open = shot([-4, 6, 24], [-4, 4, 0]);
        const first = gates.find((x) => x.v === 0 && x.s < 0);
        const c = new THREE.Vector3(); first.g.getWorldPosition(c);
        outShots.close = shot([c.x - 1.5, 4.2, 7.5], [c.x + 1, 3.6, 0]);
        r.dispose();
        return outShots;
    }, [W, H]);
    for (const [k, u] of Object.entries(res)) {
        const file = path.join(out, `gate-${k}.png`);
        fs.writeFileSync(file, Buffer.from(u.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
