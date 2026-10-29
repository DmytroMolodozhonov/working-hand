// Pictures of the ghosts of the Castle of Ghosts (GhostFx.js) and the castle's loose things (GhostProps.js): a dark stone hall, a 3.5 m red post (the hero)
// for scale. Tiles: face on, flying with the arms up, three quarters, dissolving (Nihilis Atra), the props (chair, stool, candle, candelabra, urn).
// Usage: node tools/ghost-screenshots.mjs [--out docs/media] [--name ghosts]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const name = arg('--name', 'ghosts');
const port = Number(arg('--port', 8797));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const url = await page.evaluate(async () => {
        const THREE = await import('three');
        const { GhostFx } = await import('/src/fx/GhostFx.js');
        const { GhostProps } = await import('/src/fx/GhostProps.js');
        const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07080c);
        scene.fog = new THREE.Fog(0x07080c, 30, 90);
        scene.add(new THREE.HemisphereLight(0x8090b0, 0x101014, 0.55));
        const key = new THREE.PointLight(0xffc890, 1.2, 40); key.position.set(4, 6, 6); scene.add(key);
        // a hall of black stone: floor, back wall with pillars
        const stone = new THREE.MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.9 });
        const floor = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 60), stone); floor.position.set(150, -0.5, 0); scene.add(floor);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 14, 1), stone); wall.position.set(150, 7, -8); scene.add(wall);
        for (let x = -10; x < 320; x += 9) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 14, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2b33, roughness: 0.85 })); p.position.set(x, 7, -7.2); scene.add(p); }
        const fx = new GhostFx(8); scene.add(fx.mesh);
        const T = 3.1;
        const G = [
            { pos: new THREE.Vector3(0, 1.6, 0), yaw: 0, size: 4.2, phase: 0, fade: 1, pose: 0.15, seed: 0.21, lean: { x: 0, z: 0 }, trail: 1, diss: 0 },
            { pos: new THREE.Vector3(60, 2.2, 0), yaw: 0.5, size: 4.4, phase: 1.3, fade: 1, pose: 1, seed: 0.63, lean: { x: 8, z: 0 }, trail: 1, diss: 0 },
            { pos: new THREE.Vector3(120, 1.4, 0), yaw: 0.9, size: 3.9, phase: 2.1, fade: 1, pose: 0.4, seed: 0.42, lean: { x: 0, z: 0 }, trail: 1, diss: 0 },
            { pos: new THREE.Vector3(180, 1.8, 0), yaw: -0.3, size: 4.1, phase: 0.7, fade: 1, pose: 0.8, seed: 0.88, lean: { x: 0, z: 0 }, trail: 1, diss: 0.45 },
        ];
        fx.draw(G, null, T, 0.85);
        // the props
        const props = new GhostProps(null, scene);
        props.showDemo([{ kind: 'chair', x: 241, y: 0, z: 0, a: 0.5 }, { kind: 'stool', x: 242.6, y: 0, z: 2.2, a: 0 }, { kind: 'candle', x: 244, y: 0, z: 0, a: 0 }, { kind: 'candelabra', x: 247, y: 0, z: -0.5, a: 0.2 }, { kind: 'urn', x: 251, y: 0, z: 0.5, a: 0 }], T);
        const posts = [0, 60, 120, 180, 236].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xd03030 })); p.position.set(x + 3.2, 1.75, 1.2); scene.add(p); return p; });
        const cols = 3, tw = 1600 / cols, th = 450;
        r.setScissorTest(true);
        const views = [
            [0, [0, 4.6, 10], [0, 3.6, 0]], [60, [57, 5.2, 10], [60, 3.8, 0]], [120, [126, 4.2, 8.5], [120, 3.3, 0]],
            [180, [180, 4.6, 10], [180, 3.6, 0]], [244.5, [244.5, 4.5, 9.5], [244.5, 1.6, 0]], [0, [0, 5.4, 6.5], [0, 5.1, 0]],
        ];
        views.forEach(([x, c, l], i) => {
            key.position.set(x + 4, 6, 6);
            const cam = new THREE.PerspectiveCamera(42, tw / th, 0.1, 400);
            cam.position.set(...c); cam.lookAt(...l);
            const col = i % cols, row = Math.floor(i / cols);
            r.setViewport(col * tw, 900 - (row + 1) * th, tw, th); r.setScissor(col * tw, 900 - (row + 1) * th, tw, th);
            r.render(scene, cam);
        });
        return cv.toDataURL('image/png');
    });
    const file = path.join(out, name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', file);
} finally {
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
