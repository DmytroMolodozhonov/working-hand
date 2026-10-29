// Pictures of the settlement buildings (src/world/Buildings.js) as the game's voxel shader draws them, with a hero-sized post (3.5 m).
// Usage: node tools/buildings-screenshots.mjs [--kind smithy] [--out docs/buildings] [--seed 20261015] [--cam dx,dy,dz] [--fov 55] [--r 2]
//        [--clip 0|1] (cut the roof away at --cliph metres over the floor) [--all] (every kind, a default view each)
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/buildings'));
const seed = Number(arg('--seed', 20261015));
const ALL = process.argv.includes('--all');
const kinds = ALL ? ['well', 'granary', 'smithy', 'tavern', 'chapel', 'church', 'mill', 'bakery', 'herbalist', 'stable'] : [arg('--kind', 'smithy')];
const cam = arg('--cam', null);
const fov = Number(arg('--fov', 50));
const R = Number(arg('--r', 2));
const clip = arg('--clip', '0') === '1';
const cliph = Number(arg('--cliph', 9));
const port = Number(arg('--port', 8797));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('bld')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const kind of kinds) {
        const res = await page.evaluate(async ([seed, kind, cam, fov, R, clip, cliph]) => {
            const THREE = await import('three');
            const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
            const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
            const d = new TerrainData();
            d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, buildings: true });
            let site = null, bld = null;
            for (let gz = -4; gz <= 4 && !bld; gz++) for (let gx = -4; gx <= 4 && !bld; gx++) {
                const list = [d.castles.cellOf(gx, gz), ...(d.hamlets?.cellOf(gx, gz) || [])].filter(Boolean);
                for (const s of list) { const b = (s.buildings || []).find((q) => q.kind === kind); if (b) { site = s; bld = b; break; } }
            }
            if (!bld) return { err: 'no ' + kind };
            const cx = bld.x, cz = bld.z, fy = bld.y;
            console.log('bld ' + kind + ' in ' + site.id + ' at ' + cx.toFixed(0) + ',' + cz.toFixed(0) + ' floor ' + fy.toFixed(1));
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
            Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 300 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun, sun.target);
            const planes = clip ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + cliph)] : [];
            const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, clippingPlanes: planes }));
            const ccx = Math.floor(cx / CHUNK), ccz = Math.floor(cz / CHUNK);
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
                const a = d.buildChunkArrays(ccx + dx, ccz + dz);
                const b = mergeBuffers(a.ground, a.raised);
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
            // a hero post, 3.5 m, in front of the door (the building's front looks to the road: its door is bld.door)
            const dr = site.houses[bld.house]?.door || { x: cx, z: cz };
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(dr.x, fy + 1.75, dr.z); scene.add(hero);
            // camera: default — from the road side (the door's side), above
            const fx = dr.x - cx, fz = dr.z - cz, fl = Math.hypot(fx, fz) || 1;
            const rr = bld.r * 1.5 + 12, hh = bld.r * 2.1 + 16;
            const cpos = cam ? [cx + cam[0], fy + cam[1], cz + cam[2]] : [cx + (fx / fl) * rr + (fz / fl) * rr * 0.5, fy + hh, cz + (fz / fl) * rr - (fx / fl) * rr * 0.5];
            const camera = new THREE.PerspectiveCamera(fov, 1400 / 800, 0.3, 700);
            camera.position.set(...cpos);
            camera.lookAt(cx, fy + (bld.kind === 'church' || bld.kind === 'mill' || bld.kind === 'chapel' ? 7 : 3), cz);
            r.render(scene, camera);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return { u };
        }, [seed, kind, cam ? cam.split(',').map(Number) : null, fov, R, clip, cliph]);
        if (res.err) console.error(res.err);
        else {
            const file = path.join(out, `${kind}${clip ? '-cut' : ''}.png`);
            fs.writeFileSync(file, Buffer.from(res.u.split(',')[1], 'base64'));
            console.log('saved', file);
        }
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
