// Pictures of a villager's house (generation 11: roomy, the rich in two floors) as the game's voxel shader draws it — cut by a clipping plane at the
// height you ask (--cut: layers over the floor; a rich house: 8 shows the ground floor, 17 the floor above, 99 the whole house with its roof),
// a hero-sized post (3.5 m) for scale.
// Usage: node tools/house-screenshots.mjs [--out docs/houses] [--seed 20261015] [--kind manor] [--nth 0] [--cut 99] [--cam dx,dy,dz] [--fov 55] [--name manor]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/furnish'));
const seed = Number(arg('--seed', 20261015));
const kind = arg('--kind', 'manor');
const nth = Number(arg('--nth', 0));
const cut = Number(arg('--cut', 99));
const cam = arg('--cam', '-14,16,-22').split(',').map(Number);
const fov = Number(arg('--fov', 55));
const R = Number(arg('--r', 1));
const name = arg('--name', kind);
const port = Number(arg('--port', 8798));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('room')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const res = await page.evaluate(async ([seed, kind, nth, cut, cam, fov, R]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: true });
        let house = null, castle = null, n = 0;
        for (let gz = -2; gz <= 2 && !house; gz++) for (let gx = -2; gx <= 2 && !house; gx++) {
            const c = d.castles.cellOf(gx, gz);
            if (!c) continue;
            for (const h of c.houses) if (h.kind === kind && n++ === nth) { house = h; castle = c; break; }
        }
        if (!house) return { err: 'no such house' };
        const cx = house.c.x + 0.5, cz = house.c.z + 0.5, fy = house.doorRec.y;
        console.log('room ' + castle.id + ' ' + house.id + ' ' + kind + ' at ' + cx + ',' + cz + ' feet ' + fy);
        const cv = document.createElement('canvas');
        cv.width = 1400; cv.height = 800;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.localClippingEnabled = true;
        r.shadowMap.enabled = true;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9fd0ee);
        scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.85));
        const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
        sun.position.set(cx + 30, fy + 90, cz + 40); sun.target.position.set(cx, fy, cz);
        sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 300 });
        sun.shadow.mapSize.set(2048, 2048);
        scene.add(sun, sun.target);
        const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + cut + 0.2);
        const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, clippingPlanes: [clip] }));
        const ccx = Math.floor(cx / CHUNK), ccz = Math.floor(cz / CHUNK);
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
            const a = d.buildChunkArrays(ccx + dx, ccz + dz);
            for (const b of [mergeBuffers(a.ground, a.raised)]) {
                if (!b.indices.length) continue;
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
                g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
                g.setAttribute('color', new THREE.BufferAttribute(b.colors, 3));
                g.setAttribute('voxPat', new THREE.BufferAttribute(b.patterns, 1));
                g.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(b.skies.length).fill(1), 1));
                g.setIndex(new THREE.BufferAttribute(b.indices, 1));
                const m = new THREE.Mesh(g, mat);
                m.castShadow = m.receiveShadow = true;
                scene.add(m);
            }
        }
        const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
        hero.position.set(cx, fy + 1.75, cz); scene.add(hero);
        const camera = new THREE.PerspectiveCamera(fov, 1400 / 800, 0.3, 600);
        camera.position.set(cx + cam[0], fy + cam[1], cz + cam[2]);
        camera.lookAt(cx, fy + Math.min(cut, 12) / 2, cz);
        r.render(scene, camera);
        const u = cv.toDataURL('image/png');
        r.dispose();
        return { u };
    }, [seed, kind, nth, cut, cam, fov, R]);
    if (res.err) console.error(res.err);
    else {
        const file = path.join(out, `${name}.png`);
        fs.writeFileSync(file, Buffer.from(res.u.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
