// Pictures of the castle's furnished rooms as the game's voxel shader draws them — the roof of the room cut away (a clipping
// plane at its ceiling) and the sky light set to day inside, a hero-sized post (3.5 m) for scale.
// Usage: node tools/furnish-screenshots.mjs [--out docs/furnish] [--seed 20261015] [--castle cs0_2] [--room king] [--gen 8]
//        [--cam dx,dy,dz] [--fov 55] [--name king] [--r 1]   (cam: from the room's middle, in the room's local frame turned to the world)
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/furnish'));
const seed = Number(arg('--seed', 20261015));
const castleId = arg('--castle', null);
const kind = arg('--room', 'king');
const gen = Number(arg('--gen', 8));
const cam = arg('--cam', '-9,14,14').split(',').map(Number);
const fov = Number(arg('--fov', 55));
const R = Number(arg('--r', 1));
const name = arg('--name', kind);
const upper = arg('--upper', null); // force the upper (1) or ground (0) room of this kind
const port = Number(arg('--port', 8796));
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
    const res = await page.evaluate(async ([gen, seed, castleId, kind, cam, fov, R, upper]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: gen >= 7, furnish: gen >= 8 });
        let castle = null;
        for (let gz = -2; gz <= 2 && !castle; gz++) for (let gx = -2; gx <= 2 && !castle; gx++) {
            const c = d.castles.cellOf(gx, gz);
            if (c && (!castleId || c.id === castleId) && c.rooms.some((r) => r.kind === kind && (upper == null || !!(r.l) === (upper === '1')))) castle = c;
        }
        if (!castle) return { err: 'no castle with that room' };
        const room = castle.rooms.find((r) => r.kind === kind && (upper == null || !!(r.l) === (upper === '1')));
        const cx = (room.x0 + room.x1) / 2 + 0.5, cz = (room.z0 + room.z1) / 2 + 0.5, fy = room.y;
        console.log('room ' + castle.id + ' ' + kind + ' at ' + cx + ',' + cz + ' feet ' + fy + ' size ' + (room.x1 - room.x0 + 1) + 'x' + (room.z1 - room.z0 + 1));
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
        const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + 8.2);
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
        camera.lookAt(cx, fy + 1, cz);
        r.render(scene, camera);
        const u = cv.toDataURL('image/png');
        r.dispose();
        return { u };
    }, [gen, seed, castleId, kind, cam, fov, R, upper]);
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
