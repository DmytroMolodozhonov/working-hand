// Pictures of HELL as the game's voxel shader draws it (HellMap.js — the plan, HellLand.js — the blocks, HellRealm.js — the sky, VoxelShading — lava and stone).
// Usage: node tools/hell-screenshots.mjs [--seed 20261015] [--out docs/media] [--only arrival,falls,bridge,seat,arch] [--w 1400] [--h 800]
// The light is hell's (World.setHell): dim warm ambient, the hemisphere's ground the lava's orange, a red haze; the sky — hell's own dome.
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const seed = Number(arg('--seed', 20261015));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--w', 1400)), H = Number(arg('--h', 800));
const port = Number(arg('--port', 8799));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('hell')) console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const shots = await page.evaluate(async ([seed, only, W, H]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail, HELL_TIME } = await import('/src/world/VoxelShading.js');
        const { HELL } = await import('/src/world/HellMap.js');
        const { hellSkyMaterial, makeHellBeacon } = await import('/src/game/HellRealm.js');
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, hell: true });
        const P = d.hellPlan;
        HELL_TIME.t.value = 12.5;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        const cache = new Map();
        const chunkMesh = (cx, cz) => {
            const k = cx + ',' + cz;
            if (cache.has(k)) return cache.get(k);
            const a = d.buildChunkArrays(cx, cz), bb = mergeBuffers(a.ground, a.raised);
            let m = null;
            if (bb.indices.length) {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(bb.positions, 3));
                g.setAttribute('normal', new THREE.BufferAttribute(bb.normals, 3));
                g.setAttribute('color', new THREE.BufferAttribute(bb.colors, 3));
                g.setAttribute('voxPat', new THREE.BufferAttribute(bb.patterns, 1));
                g.setAttribute('voxSky', new THREE.BufferAttribute(bb.skies, 1));
                g.setIndex(new THREE.BufferAttribute(bb.indices, 1));
                m = new THREE.Mesh(g, mat);
            }
            cache.set(k, m);
            return m;
        };
        const fall = P.lavaFalls[0], br = P.bridges.slice().sort((a, b) => Math.hypot(b.x1 - b.x0, b.z1 - b.z0) - Math.hypot(a.x1 - a.x0, a.z1 - a.z0))[0];
        const gate = P.arches.find((a) => a.gate) || P.arches[0], sp = P.spawn, S = P.devilSeat;
        const toC = Math.atan2(S.z - sp.z, S.x - sp.x);
        const ex = (x, z) => d.heightAt(Math.round(x), Math.round(z));
        const views = {
            devil: { cam: [sp.x, sp.y + 4.2, sp.z], look: [S.x, S.y + 60, S.z], R: 8, far: true },
            arrival: { cam: [sp.x + Math.cos(toC) * 18, sp.y + 4.2, sp.z + Math.sin(toC) * 18], look: [sp.x + Math.cos(toC) * 200, sp.y - 8, sp.z + Math.sin(toC) * 200], R: 7 },
            falls: { cam: [fall.pool.x + Math.cos(fall.dir) * 60, fall.top * 0.5 + 8, fall.pool.z + Math.sin(fall.dir) * 60], look: [fall.x, fall.top * 0.6, fall.z], R: 5 },
            bridge: { cam: [br.x0 + (br.x1 - br.x0) * 0.2 + 18, br.y + 10, br.z0 + (br.z1 - br.z0) * 0.2 + 18], look: [(br.x0 + br.x1) / 2, br.y, (br.z0 + br.z1) / 2], R: 5 },
            seat: { cam: [S.x + 70, S.y + 30, S.z + 30], look: [S.x, S.y + 10, S.z], R: 6 },
            arch: { cam: [(gate.ax + gate.bx) / 2 + (gate.bz - gate.az) * 1.4, gate.top * 0.45, (gate.az + gate.bz) / 2 - (gate.bx - gate.ax) * 1.4], look: [(gate.ax + gate.bx) / 2, gate.top * 0.55, (gate.az + gate.bz) / 2], R: 6 },
        };
        const res = [];
        for (const [name, v] of Object.entries(views)) {
            if (only && !only.includes(name)) continue;
            if (v.cam[1] < ex(v.cam[0], v.cam[2]) + 3) v.cam[1] = ex(v.cam[0], v.cam[2]) + 5;
            const scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x3a0f08, 25, 330);
            if (v.far) scene.fog.far = 260; // (as the game's haze at the usual view distance)
            scene.add(new THREE.AmbientLight(0xff9a70, 0.3), new THREE.HemisphereLight(0x5a1a10, 0xff5a14, 0.62));
            const sun = new THREE.DirectionalLight(0xff6a3a, 0.3); sun.position.set(v.cam[0] + 80, 200, v.cam[2] + 40); sun.target.position.set(v.look[0], 0, v.look[2]); scene.add(sun, sun.target);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(440, 40, 20), hellSkyMaterial()); dome.material.uniforms.uT.value = 40; dome.position.set(v.cam[0], v.cam[1], v.cam[2]); dome.renderOrder = -9; dome.frustumCulled = false; scene.add(dome);
            { const dx = S.x - v.cam[0], dz = S.z - v.cam[2], L = Math.hypot(dx, dz) || 1; dome.material.uniforms.uDevil.value.set(dx / L, L > 60 ? Math.min(1, (L - 60) / 200) : 0, dz / L); }
            const beacon = makeHellBeacon(); beacon.position.set(S.x, S.y + 2, S.z); beacon.material.uniforms.uT.value = 40; scene.add(beacon);
            const ccx = Math.floor(v.look[0] / CHUNK), ccz = Math.floor(v.look[2] / CHUNK), kx = Math.floor(v.cam[0] / CHUNK), kz = Math.floor(v.cam[2] / CHUNK);
            const mx = (ccx + kx) >> 1, mz = (ccz + kz) >> 1, R = v.R + Math.ceil(Math.hypot(ccx - kx, ccz - kz) / 2);
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { const m = chunkMesh(mx + dx, mz + dz); if (m) scene.add(m); }
            const camera = new THREE.PerspectiveCamera(60, W / H, 0.3, 900);
            camera.position.set(...v.cam); camera.lookAt(...v.look);
            r.render(scene, camera);
            res.push({ name, u: cv.toDataURL('image/png') });
            for (const m of scene.children.filter((o) => o.isMesh && o !== dome && o !== beacon)) scene.remove(m);
        }
        r.dispose();
        return res;
    }, [seed, only, W, H]);
    for (const s of shots) { const f = path.join(out, `hell-${s.name}.png`); fs.writeFileSync(f, Buffer.from(s.u.split(',')[1], 'base64')); console.log('saved', f); }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
