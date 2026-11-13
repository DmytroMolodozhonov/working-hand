// One tool for every picture from the real game (the author 06.11: «почему нет заготовленного кода для скриншотов… уже давно делаем это»).
// A scene is a few lines in tools/shots/<name>.mjs; the game's start, the camera, the waiting, the saving are all here.
//
//   node tools/shot.mjs <scene> [--out dir] [--w 1280] [--h 720] [--mode creative] [--slow] [--args '{"k":1}']
//     <scene>  a file in tools/shots/ (without .mjs) or a path; its `default` is an async function run IN THE PAGE: (h, args) => { … }
//     --slow   the full shader warm-up as the player has it (default: off — shaders compile as they are seen; ~10 min faster here)
//     --out    where the .png go (default: docs/media/shots/<scene>/); a scene may also save straight to assets/ with h.shot(name, {to})
//
// The helpers `h` (in the page): g, THREE, frames(n), until(fn, ms), go(x, y, z, fly), time(dayPhase), hold(list), bare(),
//   cam([x,y,z], [x,y,z]) — the camera there; view(obj, {d, up, at, side}) — a camera that sees obj's face with nothing in front;
//   shot(name) — save the picture now; page(name) — the whole page with the HUD; log(...) — printed here. Example: tools/shots/vampire.mjs. Skill: .claude/skills/screenshots.
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const name = argv[0] && !argv[0].startsWith('--') ? argv[0] : null; // (the scene comes first)
if (!name) { console.log('usage: node tools/shot.mjs <scene> [--out dir] [--w 1280] [--h 720] [--slow]'); process.exit(1); }
const file = fs.existsSync(name) ? path.resolve(name) : path.resolve('tools/shots', name.replace(/\.mjs$/, '') + '.mjs');
const base = path.basename(file, '.mjs');
const out = path.resolve(arg('--out', `docs/media/shots/${base}`));
const W = Number(arg('--w', 1280)), H = Number(arg('--h', 720));
const slow = argv.includes('--slow');
const sceneArgs = JSON.parse(arg('--args', '{}'));
const scene = (await import(pathToFileURL(file).href)).default;
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(Number(arg('--port', 8000 + Math.floor(Math.random() * 900))));
const browser = await launch({ viewport: { width: W, height: H } });
const killer = setTimeout(async () => { console.log('✖ timeout (40 min)'); await browser.close().catch(() => {}); srv.stop(); process.exit(2); }, 40 * 60 * 1000);
const saved = [];
let failed = false;
let runPage, runErrors = [];
const bootWatch = process.env.ZNS_SHOT_DEBUG ? setInterval(async () => {
    if (!runPage) return;
    console.log('boot:', await runPage.evaluate(async () => {
        const { bootTimer: b } = await import('/src/core/BootTimer.js');
        return { status: document.getElementById('loading-status')?.textContent, active: window.__zns?.game?.active, open: [...b.open.keys()], rows: b.table().rows };
    }).catch(() => 'unresponsive'));
}, 15000) : null;
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    runPage = page; runErrors = errors;
    if (!slow) await page.addInitScript(() => { window.__ZNS_SHOT_FAST__ = true; });
    // Audio synthesis is unrelated to pictures and can stall a headless OfflineAudioContext.
    if (!slow) await page.evaluate(async () => {
        window.__ZNS_SHOT_FAST__ = true; // addInitScript only applies on the next navigation
        const { SoundManager } = await import('/src/audio/SoundManager.js');
        SoundManager.prototype.warmAll = async () => {};
        const { ItemIcons } = await import('/src/ui/ItemIcons.js');
        ItemIcons.prototype.warmAsync = async () => {};
    });
    await page.exposeFunction('__shotSave', (n, url, to) => {
        const dst = to ? path.resolve(to) : path.join(out, n + '.png');
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, Buffer.from(url.split(',')[1], 'base64'));
        saved.push(dst);
        console.log('📷', path.relative(process.cwd(), dst));
    });
    await page.exposeFunction('__shotPage', async (n) => { const dst = path.join(out, n + '.png'); await page.screenshot({ path: dst }); saved.push(dst); console.log('📷', path.relative(process.cwd(), dst)); }); // (the whole page: the HUD too)
    await page.exposeFunction('__shotLog', (...a) => console.log('  ', ...a));
    if (!process.env.ZNS_START_TIMEOUT) process.env.ZNS_START_TIMEOUT = String(30 * 60 * 1000);
    const t0 = Date.now();
    await startFromMenu(page, arg('--mode', 'creative'));
    await waitHudVisible(page, 10 * 60 * 1000);
    console.log(`game on in ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.evaluate(async () => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const {updateFarBatches}=await import('/src/core/FarBatch.js');
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const until = async (ok, ms = 20000) => { const t = performance.now(); while (!ok() && performance.now() - t < ms) await frames(1); return !!ok(); };
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            if (window.__pin) { g.character.group.position.set(...window.__pin); g.character.verticalVelocity = 0; }
            const F = window.__follow, s = window.__shotCam;
            if (F) { const p = F.obj.getWorldPosition(new THREE.Vector3()); g.camera.position.copy(p).add(F.dc); g.camera.lookAt(p.add(F.da)); }
            else if (s) { g.camera.position.set(...s.cam); g.camera.lookAt(new THREE.Vector3(...s.at)); }
        };
        g.config.mode = g.config.mode || 'creative';
        window.__h = {
            g, THREE, frames, until,
            log: (...a) => window.__shotLog(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))),
            /** The hero there (the world loads round him); fly: held in the air. Waits for the land under (x, z). */
            async go(x, y, z, fly = true) {
                g.character.group.position.set(x, y, z); g.character.verticalVelocity = 0;
                window.__pin = fly ? [x, y, z] : null;
                await until(() => g.terrain?.data?.landMade?.(Math.round(x), Math.round(z)) !== false, 120000);
                g.world.terrain.flushAround?.(x, z);
                await frames(60);
            },
            time(ph) { g.dayStart = Date.now() - 24 * 60 * 1000 * ph; }, // (0 dawn, 0.3 day, 0.62 evening, 0.8 night)
            hold(list) { for (const c of list) { c.stunT = 1e9; c.aggro = null; c.target = null; } },
            /** Only the picture: the page's HUD and the sprites (names, health bars) hidden. */
            bare() {
                const cv = g.renderer.domElement;
                for (let el = cv; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
                g.scene.traverse((o) => { if (o.isSprite) o.visible = false; });
            },
            cam(cam, at) { window.__follow = null; window.__shotCam = { cam, at }; g.character.group.visible = false; },
            /** A camera that sees obj's face (its −z, or face: 1 for +z) with nothing standing between. */
            view(obj, { d = 6, up = 2, at = 1.5, side = 0.35, face = -1 } = {}) {
                g.character.group.visible = false;
                obj.updateMatrixWorld(true);
                const p = obj.getWorldPosition(new THREE.Vector3());
                const f = obj.getWorldDirection(new THREE.Vector3()).multiplyScalar(face).setY(0).normalize();
                const look = p.clone().add(new THREE.Vector3(0, at, 0));
                const own = new Set(); obj.traverse((o) => own.add(o));
                const solid = [];
                g.scene.traverseVisible((o) => { if (o.isMesh && !own.has(o) && !(o.material?.transparent && o.material.opacity < 0.6)) solid.push(o); });
                const ray = new THREE.Raycaster();
                const clear = (c) => { const dir = c.clone().sub(look), len = dir.length(); ray.set(look, dir.normalize()); ray.far = len + 0.5; return !ray.intersectObjects(solid, false).length; };
                for (const k of [1, 0.8, 0.62, 1.3, 0.48]) for (const u of [up, up * 1.6]) for (const a of [side, -side, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
                    const c = Math.cos(a), s = Math.sin(a);
                    const cam = p.clone().addScaledVector(new THREE.Vector3(f.x * c - f.z * s, 0, f.z * c + f.x * s), d * k).add(new THREE.Vector3(0, u, 0));
                    if (clear(cam)) { window.__shotCam = null; window.__follow = { obj, dc: cam.clone().sub(p), da: look.clone().sub(p) }; return true; }
                }
                window.__follow = { obj, dc: f.clone().multiplyScalar(d).setY(up), da: new THREE.Vector3(0, at, 0) };
                return false;
            },
            /** The whole page as the player sees it — the HUD, panels and words too (shot() is the 3D picture alone). */
            async page(n, settle = 20) { await frames(settle); await window.__shotPage(n); },
            /** Save the picture now (after 20 frames for the camera to settle). to: a path of its own (e.g. assets/bosses/x.png). */
            async shot(n, { to = null, settle = 20, light = 0 } = {}) {
                await frames(settle);
                const A = g.world.ambientLight, a0 = A?.intensity;
                if (light && A) A.intensity = light;
                g._updateCamera(0);g.camera.updateMatrixWorld(true);
                g.animals?._lookFar(g.character.group.position,0);
                g.scene.updateMatrixWorld(true);updateFarBatches(g.scene,g.renderer,0);
                g.renderer.render(g.scene, g.camera);
                const url = g.renderer.domElement.toDataURL('image/png');
                if (A) A.intensity = a0;
                await window.__shotSave(n, url, to);
            },
        };
        window.__h.time(0.3);
    });
    await page.evaluate(`(${scene.toString()})(window.__h, ${JSON.stringify(sceneArgs)})`);
    const real = errors.filter((e) => !/favicon|404|WebGL: INVALID|GPU stall/.test(e));
    console.log('page errors:', real.length ? '\n' + real.slice(0, 15).join('\n') : 'none');
} catch (e) {
    failed = true;
    console.log('✖', e.message.split('\n')[0]);
    if (runErrors.length) console.log('page errors:', runErrors.slice(-15).join('\n'));
    if (runPage) {
        await runPage.screenshot({ path: path.join(out, 'failure.png'), timeout: 10000 }).catch(() => {});
        console.log('loading state:', await runPage.evaluate(() => document.body.innerText.slice(-1800)).catch(() => 'page unresponsive'));
    }
} finally {
    if (bootWatch) clearInterval(bootWatch);
    clearTimeout(killer);
    await browser.close().catch(() => {});
    srv.stop();
}
console.log(`${saved.length} picture(s)`);
process.exit(failed ? 1 : 0);
