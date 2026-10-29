// Pictures of the wizards' town library (WizardVillages.js buildLibrary + the sign board of LoreLibrary.js). Based on buildings-screenshots.
// Usage: node tools/library-screenshots.mjs [--seed 4242] [--out docs/media] [--view front|inside|both]
// (old header:) Pictures of the settlement buildings (src/world/Buildings.js) as the game's voxel shader draws them, with a hero-sized post (3.5 m).
// Usage: node tools/buildings-screenshots.mjs [--kind smithy] [--out docs/buildings] [--seed 20261015] [--cam dx,dy,dz] [--fov 55] [--r 2]
//        [--clip 0|1] (cut the roof away at --cliph metres over the floor) [--all] (every kind, a default view each)
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const seed = Number(arg('--seed', 4242));
const ALL = process.argv.includes('--all');
const kinds = ALL ? ['well', 'granary', 'smithy', 'tavern', 'chapel', 'church', 'mill', 'bakery', 'herbalist', 'stable'] : [arg('--kind', 'smithy')];
const cam = arg('--cam', null);
const fov = Number(arg('--fov', 50));
const R = Number(arg('--r', 2));
const clip = arg('--clip', '0') === '1';
const cliph = Number(arg('--cliph', 9));
const port = Number(arg('--port', 8798));
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
    for (const view of ['front', 'inside']) {
        const res = await page.evaluate(async ([seed, view, fov]) => {
            const THREE = await import('three');
            const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
            const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
            const { sharedSign } = await import('/src/game/LoreLibrary.js');
            const d = new TerrainData();
            d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: true, buildings: true });
            const s = d.villages.spawnVillage();
            const lib = s.houses.find((h) => h.kind === 'library');
            const fy = lib.door.y + 1.5;
            // the library's own axes: from its door (outside) to its centre
            const dx = lib.c.x - lib.door.x, dz = lib.c.z - lib.door.z, dl = Math.hypot(dx, dz) || 1;
            const ax = dx / dl, az = dz / dl; // (into the building)
            const cx = lib.c.x, cz = lib.c.z;
            const cv = document.createElement('canvas');
            cv.width = 1400; cv.height = 800;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.localClippingEnabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x9fd0ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.95));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
            sun.position.set(cx + 30, fy + 90, cz + 40); scene.add(sun);
            const planes = view === 'inside' ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + 9)] : [];
            const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, clippingPlanes: planes }));
            const ccx = Math.floor(cx / CHUNK), ccz = Math.floor(cz / CHUNK);
            for (let zz = -2; zz <= 2; zz++) for (let xx = -2; xx <= 2; xx++) {
                const a = d.buildChunkArrays(ccx + xx, ccz + zz);
                const b = mergeBuffers(a.ground, a.raised);
                if (!b.indices.length) continue;
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
                g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
                g.setAttribute('color', new THREE.BufferAttribute(b.colors, 3));
                g.setAttribute('voxPat', new THREE.BufferAttribute(b.patterns, 1));
                g.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(b.skies.length).fill(1), 1));
                g.setIndex(new THREE.BufferAttribute(b.indices, 1));
                scene.add(new THREE.Mesh(g, mat));
            }
            const S = sharedSign(), at = lib.c && s.library.sign;
            const sign = new THREE.Mesh(S.box, S.mats); sign.scale.set(8, 2, 0.12); sign.position.set(at.x, at.y, at.z); sign.rotation.y = at.yaw; scene.add(sign);
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(lib.door.x - ax * 2, fy + 1.75, lib.door.z - az * 2); scene.add(hero);
            const camera = new THREE.PerspectiveCamera(fov, 1400 / 800, 0.3, 700);
            if (view === 'front') {
                camera.position.set(lib.door.x - ax * 26 + az * 10, fy + 12, lib.door.z - az * 26 - ax * 10);
                camera.lookAt(cx - ax * 3, fy + 5, cz - az * 3);
            } else {
                camera.position.set(cx - ax * 14 + az * 2, fy + 14, cz - az * 14 - ax * 2);
                camera.lookAt(cx + ax * 5, fy + 1, cz + az * 5);
            }
            r.render(scene, camera);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return { u };
        }, [seed, view, fov]);
        const file = path.join(out, `wizard-library-${view}.png`);
        fs.writeFileSync(file, Buffer.from(res.u.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
