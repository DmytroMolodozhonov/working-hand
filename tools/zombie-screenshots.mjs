// Pictures of the new zombie (src/entities/ZombieModel.js + Zombie.js): the painted atlases and the zombies themselves, drawn with the game's
// own model in a plain scene (no world), several looks side by side and several poses.
// Usage: node tools/zombie-screenshots.mjs [--out docs/media/zombie] [--only atlas|lineup|walk|attack|crawl|fire|close]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/zombie'));
const only = arg('--only', '');
const port = Number(arg('--port', 8798));
fs.mkdirSync(out, { recursive: true });
const want = (n) => !only || only.split(',').includes(n);

const srv = await startServer(port);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 9 * 60 * 1000);
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 90000 });
    const save = (name, dataUrl) => { fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('saved', name); };
    if (want('atlas')) {
        const shots = await page.evaluate(async () => {
            const M = await import('/src/entities/ZombieModel.js');
            const res = {};
            for (const part of ['head', 'torso', 'arm', 'leg']) for (const look of [0, 3]) res[`atlas-${part}-${look}`] = M.zombiePartTexture(part, look).image.toDataURL('image/png');
            return res;
        });
        for (const [k, v] of Object.entries(shots)) save(k, v);
    }
    const wantList = ['lineup', 'poses'].filter((n) => want(n));
    if (wantList.length) {
        const shots = await page.evaluate(async (want) => {
            const THREE = await import('three');
            const { Zombie } = await import('/src/entities/Zombie.js');
            const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 800;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x8da1b3);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 1.0));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.3);
            sun.position.set(-12, 30, 22); sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 120 });
            scene.add(sun);
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshLambertMaterial({ color: 0x5f6a4f }));
            ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
            const cam = new THREE.PerspectiveCamera(34, 1400 / 800, 0.5, 200);
            const shot = () => { r.render(scene, cam); return cv.toDataURL('image/png'); };
            const out = {};
            const make = (id, x, z, yaw = 0) => {
                const zb = new Zombie(scene, new THREE.Vector3(x, 0, z), id, {});
                zb.group.position.set(x, 1.0, z);
                zb.group.rotation.y = yaw;
                zb.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
                return zb;
            };
            const clear = (list) => { for (const z of list) { scene.remove(z.group); } };
            if (want.includes('lineup')) {
                const list = [];
                for (let i = 0; i < 6; i++) list.push(make('look' + i, (i - 2.5) * 3.2, 0, 0.35));
                // find ids with each look
                const { zombieLook } = await import('/src/entities/ZombieModel.js');
                clear(list); list.length = 0;
                const ids = []; for (let n = 0, found = new Set(); found.size < 6 && n < 500; n++) { const l = zombieLook(n); if (!found.has(l)) { found.add(l); ids[l] = n; } }
                for (let i = 0; i < 6; i++) list.push(make(ids[i], (i - 2.5) * 3.4, 0, 0.45));
                cam.position.set(0, 4.2, 22); cam.lookAt(0, 2.0, 0);
                out.lineup = shot();
                cam.position.set(-3, 3.5, 9); cam.lookAt(-5.2, 2.0, 0);
                out.lineup_close = shot();
                clear(list);
            }
            if (want.includes('poses')) {
                const sparks = [];
                const fx = { spark(pos, color, size) { const m = new THREE.Mesh(new THREE.BoxGeometry(size * 0.7, size * 0.7, size * 0.7), new THREE.MeshBasicMaterial({ color })); m.position.copy(pos); scene.add(m); sparks.push(m); }, flyingPart() {}, blood() {} };
                const mk = (id, x, yaw) => { const zb = new Zombie(scene, new THREE.Vector3(x, 0, 0), id, { fx }); zb.group.position.set(x, 1.0, 0); zb.group.rotation.y = yaw; zb.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return zb; };
                const set = (zb, fn) => { fn(); for (const k of Object.keys(zb.tgt)) zb.pose[k] = zb.tgt[k]; zb._applyPose(); };
                const list = [];
                const walk = mk(3, -9, 0.6); walk.walkCycle = 1.2; set(walk, () => walk._tgtWalk()); list.push(walk);
                const smash = mk(4, -6, 0.6); smash.attackStyle = 0; set(smash, () => smash._tgtAttack(0.3)); list.push(smash);
                const swipe = mk(5, -3, 0.6); swipe.attackStyle = 1; swipe.attackSide = 1; set(swipe, () => swipe._tgtAttack(0.75)); list.push(swipe);
                const lunge = mk(6, 0, 0.6); lunge.attackStyle = 2; set(lunge, () => lunge._tgtAttack(0.6)); list.push(lunge);
                const one = mk(7, 3, 0.6); one.severLimb(Math.random, 2); one.severLimb(Math.random, 8); one._syncStance(); one.walkCycle = 0.7; set(one, () => one._tgtWalk()); list.push(one);
                const crawl = mk(8, 6.5, 0.6); crawl.severLimb(Math.random, 8); crawl.severLimb(Math.random, 16); crawl._syncStance(); crawl.walkCycle = 1.0; crawl.group.rotation.x = crawl.baseX; crawl.group.position.y = crawl.gOff; set(crawl, () => crawl._tgtCrawl(true)); list.push(crawl);
                const fire = mk(9, 10, 0.6); fire.burning = 6; fire.health = 2; fire.walkCycle = 2; set(fire, () => fire._tgtWalk()); for (let i = 0; i < 14; i++) { fire.lastDistSq = 100; fire._flames(0.05); } list.push(fire);
                cam.position.set(0, 4.5, 24); cam.lookAt(0.5, 1.6, 0);
                out.poses = shot();
                cam.position.set(7, 2.6, 8); cam.lookAt(8.2, 1.2, 0);
                out.poses_close = shot();
                for (const m of sparks) scene.remove(m);
                clear(list);
            }
            return out;
        }, wantList);
        for (const [k, v] of Object.entries(shots)) save(k, v);
    }
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
