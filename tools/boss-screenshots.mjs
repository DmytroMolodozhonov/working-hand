// Screenshots of the bosses for the menu's «Механика игры» → «👑 Боссы» (Codex.BOSSES).
// Each boss is staged in a Creative world, the camera is placed by hand, the HUD and the
// player's own body are hidden, and the picture is saved to assets/bosses/<name>.webp.
// Usage: node tools/boss-screenshots.mjs [--only king,dragon] [--out assets/bosses] [--port 8790]
//   (run from the repo root; needs ffmpeg or cwebp for the .webp — otherwise a .png is kept)
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'assets/bosses'));
const only = arg('--only', '').split(',').filter(Boolean);
const port = Number(arg('--port', 8790));
const W = 960, H = 540; // (saved at 800 px; the software renderer here is slow — no bigger)
fs.mkdirSync(out, { recursive: true });

/**
 * The scenes. Each runs in the page: stages its boss and returns where the camera stands and
 * what it looks at ({cam: [x, y, z], at: [x, y, z]}, or {skip: 'why'}). `h` — helpers (below).
 */
const SCENES = {
    king: async (h) => {
        const g = h.g, L = g.castleLife;
        const c = g.world.terrain.data.castles.near(0, 0, 3000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        if (!c) return { skip: 'no castle' };
        await h.go(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround?.(c.gate.x, c.gate.z);
        const find = () => [...L.byId.values()].find((v) => v.role === 'king' && v.cs?.def?.id === c.id && !v.dead);
        await h.until(find, 20000);
        const k = find();
        if (!k) return { skip: 'no king' };
        await h.go(k.x, k.y + 2, k.z, true);
        await h.until(() => k.seated, 8000); // (not held still: a stunned man stands up — his legs would go into the throne)
        return h.view(k.group, { d: 4.5, up: 1.6, at: 1.3 });
    },
    master: async (h) => {
        const g = h.g, L = g.castleLife;
        const t = g.world.terrain.data.towers;
        const tw = t?.near(0, 0, 4000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        if (!tw) return { skip: 'no tower' };
        await h.go(tw.x + 26, tw.F + 6, tw.z, true);
        const find = () => [...L.byId.values()].find((v) => v.role === 'master' && v.cs?.def?.id === tw.id && !v.dead);
        await h.until(find, 20000);
        const m = find();
        if (!m) return { skip: 'no Master' };
        await h.go(m.x, m.y + 2, m.z, true);
        await h.frames(40);
        h.hold([m]);
        return h.view(m.group, { d: 4.5, up: 1.6, at: 1.5 });
    },
    spider: async (h) => {
        const g = h.g, THREE = h.THREE, t = g.world.terrain.data;
        h.time(0.62); // (late afternoon: the light low and warm, the giant spider still to be seen)
        const x = 30, z = -40;
        await h.go(x, t.topLayer(x, z) + 3, z, true);
        const y = t.topLayer(x, z) + 1;
        const s = g.spiders.spawn(new THREE.Vector3(x, y, z));
        s.model.rotation.y = 0.5;
        h.hold([s]);
        await h.frames(150); // (the trees round it load in first: the camera must see past them)
        return h.view(s.model, { d: 17, up: 5, at: 3 });
    },
    dragon: async (h) => {
        const g = h.g, t = g.world.terrain.data;
        const s = t.lairsNear(0, 0, 4000).sort((a, b) => Math.hypot(a.lair.x, a.lair.z) - Math.hypot(b.lair.x, b.lair.z))[0];
        if (!s) return { skip: 'no lair' };
        const L = s.lair, M = L.mouth;
        // which way is out of the mountain: the ground falls away there
        const side = (k) => t.topLayer(Math.round(M.x + L.dx * k * 14), Math.round(M.z + L.dz * k * 14));
        const o = side(1) < side(-1) ? 1 : -1, ox = L.dx * o, oz = L.dz * o;
        await h.go(M.x - ox * 4, L.F + 3, M.z - oz * 4, true);
        g.dragons._lairT = 0;
        await h.until(() => g.dragons.list.some((d) => d.lair === L.id), 15000);
        const d = g.dragons.list.find((x) => x.lair === L.id);
        if (!d) return { skip: 'no dragon' };
        // awake, standing in its huge mouth and looking out at the one who came (the player, by the camera)
        d.model.position.set(M.x + ox * 2, L.F, M.z + oz * 2);
        d.mode = 'watch'; d.wakeT = 1e9; d.calmT = 0; d.aggro = null; d.target = null;
        await h.go(M.x + ox * 24, L.F + 6, M.z + oz * 24, true);
        await h.frames(150);
        return h.view(d.model, { d: 21, up: 5, at: 5, side: 0.4 });
    },
    'ice-queen': async (h) => {
        const g = h.g, I = g.iceCastle, P = I.plan;
        if (!P) return { skip: 'no Ice Castle' };
        await h.go(P.gate.out.x, P.gate.out.y + 2, P.gate.out.z);
        await h.until(() => I.queen, 15000);
        const q = I.queen;
        h.hold([q]);
        const p = q.model.position;
        await h.go(p.x, p.y + 1, p.z, true);
        return h.view(q.model, { d: 7.5, up: 2.6, at: 2.6 });
    },
    blackbeard: async (h) => {
        const g = h.g, B = g.blackbeard;
        const ship = B._ensure();
        if (!ship) return { skip: 'no black ship' };
        await h.go(ship.st.x, 30, ship.st.z, true);
        const find = () => [...g.ships.crew.byId.values()].find((v) => v.role === 'blackbeard' && !v.dead);
        await h.until(find, 20000);
        const v = find();
        if (!v) return { skip: 'no captain' };
        h.hold([v]);
        await h.frames(20);
        const p = v.group.position;
        return { ...h.view(v.group, { d: 6, up: 1.8, at: 1.4 }), info: `captain at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}; ship ${ship.st.x.toFixed(1)},${ship.st.z.toFixed(1)}` };
    },
};

function toWebp(png, webp) {
    try {
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=800:-2', '-c:v', 'libwebp', '-quality', '78', webp]);
        fs.unlinkSync(png);
        return webp;
    } catch (e) {
        console.warn('webp failed, keeping the png:', e.message);
        return png;
    }
}

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // the helpers and the camera override (the game's own camera code is left as it is)
    await page.evaluate(() => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const until = async (ok, ms) => { const t0 = performance.now(); while (!ok() && performance.now() - t0 < ms) await frames(1); return ok(); };
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            if (window.__pin) { g.character.group.position.set(...window.__pin); g.character.verticalVelocity = 0; }
            const s = window.__shotCam, F = window.__follow;
            if (s && F) {
                const p = F.model.getWorldPosition(new THREE.Vector3());
                g.camera.position.copy(p).add(F.dc);
                g.camera.lookAt(p.add(F.da));
            } else if (s) { g.camera.position.set(...s.cam); g.camera.lookAt(new THREE.Vector3(...s.at)); }
        };
        window.__h = {
            g, THREE, frames, until,
            /** The player there (the world loads round the player); fly: hang in the air. */
            async go(x, y, z, fly = false) {
                const ch = g.character;
                ch.group.position.set(x, y, z);
                ch.verticalVelocity = 0;
                window.__pin = fly ? [x, y, z] : null; // (held up there: no falling)
                await frames(40);
            },
            /** Only the picture: every element on the page but the game's canvas (and its parents) is hidden. */
            bare() {
                const cv = g.renderer.domElement;
                for (let el = cv; el && el !== document.body; el = el.parentElement) {
                    for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
                }
                g.scene.traverse((o) => { if (o.isSprite) o.visible = false; }); // (health bars, names, speech bubbles)
            },
            /**
             * A camera that sees the boss: it tries places round the model's face (the models look
             * along their −z), a little to the side first, then further round, nearer, higher — and
             * takes the first from which nothing (a wall, a table, a hull) stands between it and the boss.
             */
            view(model, { d = 6, up = 2, at = 1.5, side = 0.35, face = -1 } = {}) {
                g.character.group.visible = false; // (the player is not in the picture)
                model.updateMatrixWorld(true);
                const p = model.getWorldPosition(new THREE.Vector3());
                const f = model.getWorldDirection(new THREE.Vector3()).multiplyScalar(face).setY(0).normalize();
                const look = p.clone().add(new THREE.Vector3(0, at, 0));
                const own = new Set();
                model.traverse((o) => own.add(o));
                const solid = [];
                g.scene.traverseVisible((o) => { if (o.isMesh && !own.has(o) && !o.isSprite && !(o.material?.transparent && o.material.opacity < 0.6)) solid.push(o); });
                const ray = new THREE.Raycaster();
                const clear = (cam) => {
                    for (const [ox, oy] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
                        const from = look.clone().add(new THREE.Vector3(f.z * ox, oy, -f.x * ox));
                        const dir = cam.clone().sub(from), len = dir.length();
                        ray.set(from, dir.normalize());
                        ray.far = len + 0.5;
                        if (ray.intersectObjects(solid, false).length) return false;
                    }
                    return true;
                };
                const turns = [side, -side, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4, Math.PI];
                for (const k of [1, 0.8, 0.62, 1.3, 0.48]) {
                    for (const u of [up, up * 1.6]) {
                        for (const a of turns) {
                            const c = Math.cos(a), s = Math.sin(a);
                            const dir = new THREE.Vector3(f.x * c - f.z * s, 0, f.z * c + f.x * s);
                            const cam = p.clone().addScaledVector(dir, d * k).add(new THREE.Vector3(0, u, 0));
                            if (clear(cam)) {
                                window.__follow = { model, dc: cam.clone().sub(p), da: look.clone().sub(p) }; // (a sailing ship carries its captain: the camera goes with him)
                                return { cam: cam.toArray(), at: look.toArray(), found: { k, u, a } };
                            }
                        }
                    }
                }
                return { cam: p.clone().addScaledVector(f, d).add(new THREE.Vector3(0, up, 0)).toArray(), at: look.toArray(), found: null };
            },
            /** The time of day (Game.dayPhase: 0 dawn … 0.75 night). */
            time(ph) { g.dayStart = Date.now() - 24 * 60 * 1000 * ph; },
            /** These creatures stand still (no attacks, no walking off). */
            hold(list) { for (const c of list) { c.stunT = 1e9; c.aggro = null; c.target = null; } },
        };
        g.config.mode = 'creative';
        window.__h.time(0.3);
    });
    for (const [name, scene] of Object.entries(SCENES)) {
        if (only.length && !only.includes(name)) continue;
        const r = await page.evaluate(`(async () => { const h = window.__h; window.__shotCam = null; window.__follow = null; window.__pin = null; window.__h.g.character.group.visible = true; window.__h.time(0.3); return (${scene.toString()})(h); })()`).catch((e) => ({ skip: e.message }));
        if (r?.skip) { console.log(name, 'skipped:', r.skip); continue; }
        await page.evaluate((c) => {
            window.__shotCam = c;
            const ch = window.__h.g.character;
            ch.group.visible = false;
        }, r);
        await page.evaluate(() => window.__h.frames(40));
        await page.evaluate(() => window.__h.bare());
        // the picture straight from the game's canvas (a page screenshot waits on a slow frame here)
        const url = await page.evaluate((light) => {
            const g = window.__h.g, A = g.world.ambientLight, a0 = A?.intensity;
            if (light && A) A.intensity = light; // (a dark lair: a little more light, only for the picture)
            g._updateCamera(0);
            g.renderer.render(g.scene, g.camera);
            if (A) A.intensity = a0;
            return g.renderer.domElement.toDataURL('image/png');
        }, r.light || 0);
        const png = path.join(out, name + '.png');
        fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
        console.log(name, JSON.stringify(r.found), r.info || '', '→', toWebp(png, path.join(out, name + '.webp')));
    }
    console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
} finally {
    await browser.close();
    srv.stop();
}
