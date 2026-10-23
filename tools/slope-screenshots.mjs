// Pictures of the land as the game's voxel shader draws it — generation 5 (steps) beside generation 6 (ramps and slabs,
// BlockShapes.js) at the same place, with a hero-sized post (3.5 m) for scale.
// Usage: node tools/slope-screenshots.mjs [--out docs/slopes] [--at x,z] [--seed 20261015] [--r 2] [--cam dx,dy,dz]
//        [--build house|roof|castle] (a test of a plan's shapes: put by tools only)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/slopes'));
const at = arg('--at', '150,40').split(',').map(Number);
const cam = arg('--cam', '-28,22,34').split(',').map(Number);
const seed = Number(arg('--seed', 20261015));
const R = Number(arg('--r', 2));
const gens = (arg('--gen', '5,6')).split(',').map(Number);
const port = Number(arg('--port', 8795));
const name = arg('--name', 'land');
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const gen of gens) {
        const url = await page.evaluate(async ([gen, at, cam, seed, R]) => {
            const THREE = await import('three');
            const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
            const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
            const d = new TerrainData();
            d.generate({ seed, mountains: true, seas: true, test: false, deepCaves: true, lush: true, slopes: gen >= 6 });
            const cv = document.createElement('canvas');
            cv.width = 1400; cv.height = 800;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x9fd0ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 0.65));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.85);
            sun.position.set(at[0] + 40, 120, at[1] + 70); sun.target.position.set(at[0], 0, at[1]);
            sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 400 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun, sun.target);
            const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
            const ccx = Math.floor(at[0] / CHUNK), ccz = Math.floor(at[1] / CHUNK);
            let shapes = 0;
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
                const a = d.buildChunkArrays(ccx + dx, ccz + dz);
                const c = d.chunk(ccx + dx, ccz + dz);
                if (c.shape) for (const v of c.shape) if (v) shapes++;
                for (const b of [mergeBuffers(a.ground, a.raised), a.water]) {
                    if (!b.indices.length) continue;
                    const g = new THREE.BufferGeometry();
                    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
                    g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
                    g.setAttribute('color', new THREE.BufferAttribute(b.colors, 3));
                    g.setAttribute('voxPat', new THREE.BufferAttribute(b.patterns, 1));
                    g.setAttribute('voxSky', new THREE.BufferAttribute(b.skies, 1));
                    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
                    const m = new THREE.Mesh(g, b === a.water ? new THREE.MeshPhongMaterial({ color: 0x2f7fd0, transparent: true, opacity: 0.7 }) : mat);
                    m.castShadow = m.receiveShadow = true;
                    scene.add(m);
                }
            }
            const gy = d.surfaceY(at[0], at[1]);
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.5, 0.4), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(at[0], gy + 1.75, at[1]); scene.add(hero);
            const camera = new THREE.PerspectiveCamera(50, 1400 / 800, 0.3, 600);
            camera.position.set(at[0] + cam[0], gy + cam[1], at[1] + cam[2]);
            camera.lookAt(at[0], gy, at[1]);
            r.render(scene, camera);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return { u, shapes };
        }, [gen, at, cam, seed, R]);
        const file = path.join(out, `${name}-gen${gen}.png`);
        fs.writeFileSync(file, Buffer.from(url.u.split(',')[1], 'base64'));
        console.log('saved', file, 'shapes', url.shapes);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
