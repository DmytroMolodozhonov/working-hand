// Pictures of the three pyramids of Pharaoh Sandy (Pyramids.js) as the game's voxel shader draws them: outside and inside the rooms.
// Usage: node tools/pyramid-screenshots.mjs [--seed 20261106] [--out docs/media] [--only wide,entrance,...]
//   shots are in local frame of the plate: u across, v toward the entrances (+v), h metres over the floor. A warm point light rides with the camera inside.
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const seed = Number(arg('--seed', 20261106));
const only = arg('--only', '').split(',').filter(Boolean);
const W = Number(arg('--w', 1400)), H = Number(arg('--h', 800));
fs.mkdirSync(out, { recursive: true });
// (name, camera [u, v, h], look-at [u, v, h], fov, chunk radius in metres round the camera (0: the whole plate), inside: a warm light at the camera)
const SHOTS = [
    ['pyramids-wide', [150, 330, 70], [-110, 40, 38], 58, 0, false],
    ['pyramids-big', [0, 260, 38], [0, 0, 48], 55, 0, false],
    ['pyramids-gate', [0, 130, 9], [0, 70, 7], 62, 120, false],
    ['pyramids-mid-small', [-200, 240, 26], [-200, 90, 14], 60, 0, false],
    ['room1-guards', [0, 60, 4], [0, 34, 4], 68, 60, true],
    ['room2-columns', [0, 14, 3.5], [0, -8, 5], 70, 55, true],
    ['room3-scarab', [26, 0, 3.5], [44, 0, 3.5], 70, 50, true],
    ['room4-sand', [-26, 0, 3.5], [-44, 0, 2], 70, 50, true],
    ['room5-stars', [0, -24, 3.5], [0, -36, 6], 72, 50, true],
    ['room6-burial', [0, -50.5, 4], [0, -58, 4], 74, 50, true],
    ['maze', [-160 + 0, 60 + 32 + 20, 3.5], [-160, 60 + 32 - 8, 3], 70, 50, true],
    ['small-corridor', [-260, 120 + 48, 3.5], [-260, 120 + 8, 3], 66, 60, true],
].filter((s) => !only.length || only.includes(s[0]));
const srv = await startServer(Number(arg('--port', 8802)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const guard = setTimeout(() => { console.error('timeout'); process.exit(1); }, 900000);
try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(0);
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('py')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const shots = await page.evaluate(async ([seed, SHOTS, W, H]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, dungeons: true, buildings: true, bigHouses: true, pyramids: true });
        const P = d.pyr?.plan;
        if (!P) return { err: 'no pyramids in this world' };
        console.log('py at ' + P.x + ',' + P.z + ' F ' + P.F + ' rot ' + P.rot + ' parts ' + P.parts.length);
        const wx = (u, v) => P.x + (P.rot === 0 ? u : P.rot === 1 ? v : P.rot === 2 ? -u : -v), wz = (u, v) => P.z + (P.rot === 0 ? v : P.rot === 1 ? -u : P.rot === 2 ? -v : u);
        const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        const cache = new Map();
        const chunkMesh = (cx, cz) => {
            const k = cx + ',' + cz; if (cache.has(k)) return cache.get(k);
            const a = d.buildChunkArrays(cx, cz), bb = mergeBuffers(a.ground, a.raised);
            let m = null;
            if (bb.indices.length) {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(bb.positions, 3));
                g.setAttribute('normal', new THREE.BufferAttribute(bb.normals, 3));
                g.setAttribute('color', new THREE.BufferAttribute(bb.colors, 3));
                g.setAttribute('voxPat', new THREE.BufferAttribute(bb.patterns, 1));
                g.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(bb.skies.length).fill(1), 1));
                g.setIndex(new THREE.BufferAttribute(bb.indices, 1));
                m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
            }
            cache.set(k, m); return m;
        };
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.shadowMap.enabled = true;
        const res = {};
        for (const [name, cam, look, fov, rad, inside] of SHOTS) {
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(inside ? 0x120c08 : 0x9fd0ee);
            scene.add(new THREE.HemisphereLight(inside ? 0xffe2b0 : 0xdfefff, 0x6a5a4a, inside ? 0.55 : 0.95));
            const fy = P.F + 0.5, cx = wx(cam[0], cam[1]), cz = wz(cam[0], cam[1]);
            const sun = new THREE.DirectionalLight(0xfff4dd, inside ? 0.0 : 0.85);
            sun.position.set(cx + 160, fy + 260, cz + 120); sun.target.position.set(P.x, fy, P.z);
            sun.castShadow = !inside;
            Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, far: 900 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun, sun.target);
            if (inside) { const pl = new THREE.PointLight(0xffc27a, 1.5, 70); pl.position.set(cx, fy + cam[2], cz); scene.add(pl); }
            // the chunks: all of the plate, or those near the camera
            let x0, x1, z0, z1;
            if (rad) { x0 = cx - rad; x1 = cx + rad; z0 = cz - rad; z1 = cz + rad; } else { x0 = P.plate.x0 - 70; x1 = P.plate.x1 + 70; z0 = P.plate.z0 - 70; z1 = P.plate.z1 + 70; }
            for (let czc = Math.floor(z0 / CHUNK); czc <= Math.floor(z1 / CHUNK); czc++) for (let cxc = Math.floor(x0 / CHUNK); cxc <= Math.floor(x1 / CHUNK); cxc++) { const m = chunkMesh(cxc, czc); if (m) scene.add(m); }
            // a hero-sized post (3.5 m) at the gate for scale
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            post.position.set(wx(5, 120), fy + 1.75, wz(5, 120)); scene.add(post);
            const camera = new THREE.PerspectiveCamera(fov, W / H, 0.3, 1200);
            camera.position.set(cx, fy + cam[2], cz);
            camera.lookAt(wx(look[0], look[1]), fy + look[2], wz(look[0], look[1]));
            r.render(scene, camera);
            res[name] = cv.toDataURL('image/png');
            scene.traverse((o) => { if (o.isMesh && !cache.has('x')) { /* chunk meshes are cached and reused */ } });
        }
        r.dispose();
        return { res };
    }, [seed, SHOTS, W, H]);
    if (shots.err) console.error(shots.err);
    else for (const [k, v] of Object.entries(shots.res)) { const f = path.join(out, k + '.png'); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', f); }
} finally {
    clearTimeout(guard);
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
