// «Visible Godi»: pictures of the cloud as the game draws it (the real SeeThroughFx shader and its second pass over real voxel
// blocks, drawn by Chromium's software GL) and numbers for them: how bright, how contrasty and how detailed the cloud is for a wall
// of planks / stone of 1…9 blocks, an enchanted wall, a wall too far, wood + courtyard + stone.
// Usage: node tools/visible-godi-screenshots.mjs [--out docs/spells/visible-godi] [--seed 20261015] [--only wood1,stone3]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/spells/visible-godi'));
const seed = Number(arg('--seed', 20261015));
const only = arg('--only', null)?.split(',');
const port = Number(arg('--port', 8797));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const res = await page.evaluate(async ([seed, only]) => {
        const THREE = await import('three');
        const { TerrainData, mergeBuffers, CHUNK, BLOCK } = await import('/src/world/Terrain.js');
        const { applyVoxelDetail } = await import('/src/world/VoxelShading.js');
        const { VisibleGodi } = await import('/src/game/VisibleGodi.js');
        const { SeeThroughFx } = await import('/src/fx/SeeThroughFx.js');
        const W = 1280, H = 720;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true });
        const gl = r.getContext();
        const cases = [
            ['open', 'nothing near: the haze only', BLOCK.PLANKS, 1, { z0: 9 }],
            ['wood1', '1 block of planks', BLOCK.PLANKS, 1, {}],
            ['wood2', '2 blocks of planks', BLOCK.PLANKS, 2, {}],
            ['stone1', '1 block of stone', BLOCK.CS_GREY, 1, {}],
            ['stone3', '3 blocks of stone', BLOCK.CS_GREY, 3, {}],
            ['stone6', '6 blocks of stone', BLOCK.CS_GREY, 6, {}],
            ['stone9', '9 blocks of stone', BLOCK.CS_GREY, 9, {}],
            ['dirt3', '3 blocks of earth', BLOCK.DIRT, 3, {}],
            ['leaves3', '3 blocks of leaves', BLOCK.LEAVES, 3, {}],
            ['enchanted2', 'enchanted wall (2)', BLOCK.ENCHANTED, 2, {}],
            ['cluster', 'planks, 3 m of air, stone', BLOCK.PLANKS, 1, { cluster: true }],
        ].filter((c) => !only || only.includes(c[0]));
        const result = [];
        for (const [id, label, type, n, o] of cases) {
            const d = new TerrainData();
            d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true });
            const top = d.topLayer(0, 0);
            const z0 = o.z0 ?? 3;
            d.enchantFree = true;
            for (let L = top + 1; L <= top + 8; L++) {
                // (the room behind: back wall of brick 14 m away, side walls)
                for (let x = -9; x <= 9; x++) { d.set(x, L, 16, BLOCK.BRICK); }
                for (let z = 4; z <= 16; z++) { d.set(-9, L, z, BLOCK.BRICK); d.set(9, L, z, BLOCK.BRICK); }
            }
            for (let x = -9; x <= 9; x++) for (let z = z0; z < z0 + n; z++) for (let L = top + 1; L <= top + 8; L++) d.set(x, L, z, type);
            if (o.cluster) for (let x = -9; x <= 9; x++) for (let z = z0 + 4; z < z0 + 6; z++) for (let L = top + 1; L <= top + 8; L++) d.set(x, L, z, BLOCK.CS_GREY);
            d.enchantFree = false;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xa7d3ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.95));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
            sun.position.set(20, top + 60, -20);
            scene.add(sun);
            const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const a = d.buildChunkArrays(dx, dz);
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
            // what is in the room behind the wall: three people, a chest, a banner, a lamp — bright, different colours
            const gy = top - 0.5; // (the ground's top)
            const person = (x, z, body, head) => {
                const grp = new THREE.Group();
                const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.7), new THREE.MeshLambertMaterial({ color: body })); b.position.y = 1.55;
                const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshLambertMaterial({ color: head })); h.position.y = 3.0;
                const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.6), new THREE.MeshLambertMaterial({ color: 0x333344 })); l.position.y = 0.5;
                grp.add(b, h, l); grp.position.set(x, gy, z); scene.add(grp);
            };
            person(-2.5, z0 + n + 6.5, 0xd02828, 0xf0c8a0);
            person(1.5, z0 + n + 8, 0x2860d0, 0xe0b890);
            person(5, z0 + n + 10, 0xe0c020, 0xf0c8a0);
            const chest = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: 0x8b4a1c })); chest.position.set(-5, gy + 0.6, z0 + n + 7); scene.add(chest);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); lamp.position.set(0, gy + 5.5, z0 + n + 8); scene.add(lamp);
            const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 400);
            camera.position.set(0, top + 1.0, 0);
            camera.lookAt(0, top + 1.0, 10);
            camera.updateMatrixWorld(true);
            const game = { renderer: r, scene, camera, quality: { current: { pixelRatio: 1 }, ultra: false } };
            const fx = new SeeThroughFx(game);
            fx.prewarm();
            const stub = { camera, terrain: { data: d }, ships: { list: new Map() }, wards: { list: new Map(), mine: () => false }, doors: null };
            const v = new VisibleGodi(stub);
            const info = v.scan();
            fx.setOn(true);
            fx.setTarget(info);
            // the main picture, then the cloud over it; frames go on until the cloud has opened and settled (1.2 s)
            const pics = {};
            const frame = (t) => { r.autoClear = true; r.setRenderTarget(null); r.render(scene, camera); fx.render(t); };
            // the same view without the spell, for the numbers' comparison
            r.autoClear = true; r.render(scene, camera);
            const read = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
            const stats = (px) => {
                // the cloud's middle (a disc of 15% of the height round the centre): brightness, contrast, detail (mean |gradient|), and blue-ness
                const cx = W / 2, cy = H / 2, R = H * 0.15;
                let n = 0, sum = 0, sum2 = 0, grad = 0, bl = 0, gn = 0;
                const lum = (x, y) => { const i = ((H - 1 - y) * W + x) * 4; return (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; };
                for (let y = Math.floor(cy - R); y < cy + R; y++) for (let x = Math.floor(cx - R); x < cx + R; x++) {
                    if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
                    const l = lum(x, y); n++; sum += l; sum2 += l * l;
                    grad += Math.abs(lum(x + 1, y) - l) + Math.abs(lum(x, y + 1) - l); gn += 2;
                    const i = ((H - 1 - y) * W + x) * 4; bl += (px[i + 2] - px[i]) / 255;
                }
                const m = sum / n;
                return { mean: +m.toFixed(3), contrast: +Math.sqrt(Math.max(0, sum2 / n - m * m)).toFixed(3), detail: +(grad / gn).toFixed(4), blue: +(bl / n).toFixed(3) };
            };
            const plain = stats((r.render(scene, camera), read()));
            for (let k = 0; k < 90; k++) frame(10 + k / 60);
            const px = read();
            // the price of the cloud (here the processor draws the picture, so only the proportions mean something): a frame of the
            // scene alone, with the cloud drawn at 24 a second (the real rate), and with the second picture in EVERY frame (the worst case)
            let ms = null;
            if (o.bench !== false && (id === 'wood1' || id === 'stone3')) {
                const run = (step, withFx) => { gl.finish(); const t0 = performance.now(); for (let k = 0; k < 24; k++) { r.setRenderTarget(null); r.autoClear = true; r.render(scene, camera); if (withFx) fx.render(200 + k * step); gl.finish(); } return (performance.now() - t0) / 24; };
                run(1 / 60, true);
                const base = run(1 / 60, false), real = run(1 / 60, true), worst = run(1 / 24, true);
                ms = { scene: +base.toFixed(1), cloud24Hz: +real.toFixed(1), everyFrame: +worst.toFixed(1) };
            }
            result.push({ id, label, ms, state: info.state, clear: +info.clear.toFixed(3), thick: +info.thick.toFixed(2), why: info.why, plain, cloud: stats(px), passes: fx.stats.passes, png: cv.toDataURL('image/png') });
            fx.dispose();
            scene.traverse((o) => { if (o.geometry && o.isMesh) o.geometry.dispose(); });
        }
        r.dispose();
        return result;
    }, [seed, only]);
    console.log('case        state    clear  thick  | cloud: mean  contrast  detail  blue | without the spell: mean contrast detail');
    for (const c of res) {
        const f = path.join(out, `${c.id}.png`);
        fs.writeFileSync(f, Buffer.from(c.png.split(',')[1], 'base64'));
        console.log(`${c.id.padEnd(11)} ${String(c.state).padEnd(8)} ${String(c.clear).padEnd(6)} ${String(c.thick).padEnd(6)} | ${c.cloud.mean}  ${c.cloud.contrast}   ${c.cloud.detail}  ${c.cloud.blue} | ${c.plain.mean} ${c.plain.contrast} ${c.plain.detail}  passes=${c.passes}${c.why ? ' why=' + c.why : ''}${c.ms ? ' frame ms: ' + JSON.stringify(c.ms) : ''}`);
    }
    fs.writeFileSync(path.join(out, 'numbers.json'), JSON.stringify(res.map(({ png, ...r }) => r), null, 1));
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
