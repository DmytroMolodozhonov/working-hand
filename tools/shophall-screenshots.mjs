// Pictures of a wizards' settlement's potion hall and scroll hall (src/world/ShopHalls.js) as the game's voxel shader draws them: the blocks,
// the show of bottles / rolled scrolls (ShopHallModels.js), the goods for sale (the game's item models) on their places, a hero-sized post.
// Usage: node tools/shophall-screenshots.mjs [--kind potions|scrolls] [--view out|in|top] [--seed 4242] [--out docs/media]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const seed = Number(arg('--seed', 4242));
const kinds = arg('--kind', 'potions,scrolls').split(',');
const views = arg('--view', 'out,in').split(',');
const port = Number(arg('--port', 8798));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const kill = setTimeout(() => { console.error('timeout'); process.exit(2); }, 600000);
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('hall')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const kind of kinds) for (const view of views) {
        const res = await page.evaluate(async ([seed, kind, view]) => {
            const THREE = await import('three');
            const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
            const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
            const { bottleShow, scrollShow, hallSign } = await import('/src/game/ShopHallModels.js');
            const { potionStock, scrollStock, ingredientStock } = await import('/src/game/ShopHallGoods.js');
            const { makeItemModel } = await import('/src/game/ItemTypes.js');
            const d = window.__hallWorld || (window.__hallWorld = (() => { const t = new TerrainData(); t.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: true, buildings: true, wizShops: true }); return t; })());
            const site = d.villages.spawnVillage();
            const h = site.halls.find((x) => x.kind === kind);
            const cx = (h.room.x0 + h.room.x1) / 2, cz = (h.room.z0 + h.room.z1) / 2, fy = h.room.y;
            console.log('hall ' + kind + ' at ' + cx + ',' + cz + ' rot ' + site.rot);
            const cv = document.createElement('canvas');
            cv.width = 1400; cv.height = 800;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.localClippingEnabled = true;
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x9fd0ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, view === 'out' ? 0.85 : 1.0));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
            sun.position.set(cx + 30, fy + 90, cz + 40); sun.target.position.set(cx, fy, cz);
            sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 300 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun, sun.target);
            if (view !== 'out') { const lamp = new THREE.PointLight(0xffe6b0, 1.1, 40); lamp.position.set(cx, fy + 8, cz); scene.add(lamp); }
            const planes = view === 'in' || view === 'corner' ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), fy + (kind === 'ingredients' ? 7.4 : 9.4))] : [];
            const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, clippingPlanes: planes }));
            const ccx = Math.floor(cx / CHUNK), ccz = Math.floor(cz / CHUNK);
            for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
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
            const show = kind !== 'scrolls' ? bottleShow(h.decor, 5) : scrollShow(h.decor, 5);
            if (show) scene.add(show);
            const sg = hallSign(h); if (sg) scene.add(sg);
            const stock = kind === 'potions' ? potionStock(h.slots, h.flasks) : kind === 'ingredients' ? ingredientStock(h.slots) : scrollStock(h.slots);
            for (const e of stock) { const m = makeItemModel({ ...e.item, uid: 'x' }); m.position.set(e.slot.x, e.slot.y + 0.1, e.slot.z); scene.add(m); }
            const st = site.stalls[h.stall];
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set(st.back.x, fy + 1.75, st.back.z); scene.add(hero);
            const camera = new THREE.PerspectiveCamera(view === 'in' || view === 'corner' ? 70 : 50, 1400 / 800, 0.3, 700);
            const door = h.door, fx = door.x - cx, fz = door.z - cz, fl = Math.hypot(fx, fz) || 1;
            if (view === 'out') { camera.position.set(cx + fx / fl * 40 + fz / fl * 18, fy + 22, cz + fz / fl * 40 - fx / fl * 18); camera.lookAt(cx, fy + 5, cz); }
            else if (view === 'in') { const i = h.walk[h.entry]; camera.position.set(i.x + fx / fl * 2, fy + 3.4, i.z + fz / fl * 2); camera.lookAt(st.back.x, fy + 2.5, st.back.z); }
            else if (view === 'corner') { const R = h.room; camera.position.set(R.x0 + 0.8, fy + 7.2, R.z0 + 0.8); camera.lookAt(cx, fy + 1, cz); }
            else { camera.position.set(cx + 0.01, fy + 42, cz); camera.lookAt(cx, fy, cz); }
            r.render(scene, camera);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return { u };
        }, [seed, kind, view]);
        if (res.err) console.error(res.err);
        else { const file = path.join(out, `shophall-${kind}-${view}.png`); fs.writeFileSync(file, Buffer.from(res.u.split(',')[1], 'base64')); console.log('saved', file); }
    }
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
