// Pictures of the dungeons as the game's voxel shader draws them (Dungeons.js): a ruin from outside, a hall under the ground with its roof cut away.
// Usage: node tools/dungeon-screenshots.mjs --kind ruin_fort [--seed 21] [--n 0] [--out docs/dungeons] [--name fort]
//        [--cam u,v,h] [--look u,v,h]   (local frame of the dungeon: u across, v along (front at −v), h metres over the floor; default: a view of the whole)
//        [--clip h]   (cut everything above h metres over the floor — to see into the rooms)  [--r 3] (chunks round it)  [--fov 55] [--w 1400] [--h 800]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/dungeons'));
const kind = arg('--kind', 'ruin_tower');
const seed = Number(arg('--seed', 21));
const nth = Number(arg('--n', 0));
const name = arg('--name', kind);
const cam = arg('--cam', null)?.split(',').map(Number);
const look = arg('--look', null)?.split(',').map(Number);
const clip = arg('--clip', null);
const R = Number(arg('--r', 3));
const fov = Number(arg('--fov', 55));
const W = Number(arg('--w', 1400)), H = Number(arg('--h', 800));
const port = Number(arg('--port', 8797));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('dg')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const res = await page.evaluate(async ([seed, kind, nth, cam, look, clip, R, fov, W, H]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, dungeons: true });
        const found = [];
        for (let gz = -12; gz <= 12; gz++) for (let gx = -12; gx <= 12; gx++) { const s = d.dungeons.cellOf(gx, gz); if (s && s.type === kind) found.push(s); }
        const s = found[nth];
        if (!s) return { err: 'no such dungeon (' + found.length + ' of that kind)' };
        const b = s.ready();
        const wx = (u, v) => s.x + (s.rot === 0 ? u : s.rot === 1 ? -v : s.rot === 2 ? -u : v), wz = (u, v) => s.z + (s.rot === 0 ? v : s.rot === 1 ? u : s.rot === 2 ? -v : -u);
        const base = s.under ? s.F : s.F; // (the plan's floor layer)
        const fy = base - 0.5; // (the floor's surface: groundAt = floorBelow − 0.5)
        const Z = s.under ? Math.max(s.land - s.F, 6) : 0;
        console.log('dg ' + s.id + ' ' + s.name + ' at ' + s.x + ',' + s.z + ' F ' + s.F + ' rot ' + s.rot + ' chests ' + b.chests.length);
        const zone = s.zone || 20;
        const camL = cam || (s.under ? [0, 50, 90] : [0, -zone * 1.5, zone * 1.1]);
        const lookL = look || (s.under ? [0, 50, 0] : [0, 0, 4]);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.localClippingEnabled = true;
        r.shadowMap.enabled = true;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9fd0ee);
        scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.9));
        const mx = wx(lookL[0], lookL[1]), mz = wz(lookL[0], lookL[1]);
        const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
        sun.position.set(mx + 40, fy + 110, mz + 60); sun.target.position.set(mx, fy, mz);
        sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 400 });
        sun.shadow.mapSize.set(2048, 2048);
        scene.add(sun, sun.target);
        const planes = clip != null ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + Number(clip))] : [];
        const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, clippingPlanes: planes }));
        const ccx = Math.floor(mx / CHUNK), ccz = Math.floor(mz / CHUNK);
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
            const a = d.buildChunkArrays(ccx + dx, ccz + dz);
            const bb = mergeBuffers(a.ground, a.raised);
            if (!bb.indices.length) continue;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(bb.positions, 3));
            g.setAttribute('normal', new THREE.BufferAttribute(bb.normals, 3));
            g.setAttribute('color', new THREE.BufferAttribute(bb.colors, 3));
            g.setAttribute('voxPat', new THREE.BufferAttribute(bb.patterns, 1));
            g.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(bb.skies.length).fill(1), 1));
            g.setIndex(new THREE.BufferAttribute(bb.indices, 1));
            const m = new THREE.Mesh(g, mat);
            m.castShadow = m.receiveShadow = true;
            scene.add(m);
        }
        // a hero-sized post (3.5 m) for scale at the way in and a red post on each chest
        const post = (x, y, z, c, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.5), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y + h / 2, z); scene.add(m); };
        post(b.entrance.x, b.entrance.y, b.entrance.z, 0xd03030, 3.5);
        for (const c of b.chests) post(c.x, c.y, c.z, 0xffd23f, 2.1);
        const camera = new THREE.PerspectiveCamera(fov, W / H, 0.3, 700);
        camera.position.set(wx(camL[0], camL[1]), fy + camL[2], wz(camL[0], camL[1]));
        camera.lookAt(mx, fy + lookL[2], mz);
        r.render(scene, camera);
        const u = cv.toDataURL('image/png');
        r.dispose();
        return { u, id: s.id };
    }, [seed, kind, nth, cam, look, clip, R, fov, W, H]);
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
