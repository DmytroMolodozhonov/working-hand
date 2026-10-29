// Pictures of «To the Sun» against the black clouds of the gargoyle ritual (SunBeam.js, GargoyleRitual.js): the start of the struggle,
// the middle, the breakthrough → docs/media/sun-{start,mid,burst}.png (small). The game's own beam, clouds and rays are drawn here on a
// bare ground with a stand-in for the spark pool (points).
// Usage: node tools/sun-screenshots.mjs [--out docs/media] [--port 8797] [--w 900] [--h 520]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const W = Number(arg('--w', 900)), H = Number(arg('--h', 520));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(Number(arg('--port', 8797)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text().slice(0, 600)); });
    await page.goto(srv.url + "tools/tree-view.html");
    if (process.env.HIDE_RINGS) await page.evaluate(() => { window.__hideRings = true; });
    const shots = await page.evaluate(async ([W, H]) => {
        const THREE = await import('three');
        const { RitualFx } = await import('/src/game/GargoyleRitual.js?' + Date.now());
        const { SunBeam } = await import('/src/fx/SunBeam.js?' + Date.now());
        const { GARGOYLE } = await import('/src/game/GargoyleRules.js?' + Date.now());
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2a2f3a);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x23281f }));
        ground.rotation.x = -Math.PI / 2; scene.add(ground);
        const camera = new THREE.PerspectiveCamera(70, W / H, 0.5, 2000);
        camera.position.set(-26, 3.4, 30); camera.lookAt(10, 55, -10);
        // a stand-in for the spark pool: points that fly and fade
        const MAX = 4000, pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), life = new Float32Array(MAX), vel = new Float32Array(MAX * 3), size = new Float32Array(MAX);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
        pts.frustumCulled = false; scene.add(pts);
        let head = 0;
        const fx = {
            shake: 0,
            spark(p, color, sz, v, lf) {
                const i = head++ % MAX, c = new THREE.Color(color);
                pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); col.set([c.r, c.g, c.b], i * 3); life[i] = lf; size[i] = sz;
            },
            lightFlash() {},
        };
        const stepSparks = (dt) => {
            for (let i = 0; i < MAX; i++) {
                if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
                life[i] -= dt;
                for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
                const f = Math.max(0, Math.min(1, life[i] * 1.2));
                for (let k = 0; k < 3; k++) col[i * 3 + k] *= f > 0.98 ? 1 : 1 - dt * 1.6;
            }
            geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        };
        const game = { scene, fx, camera, sound: null, fireLights: null, ships: null, storm: null, localId: 'me', character: { group: { position: new THREE.Vector3() } } };
        const ritual = new RitualFx(game);
        const beam = new SunBeam(game);
        game.sun = beam;
        const r = { id: 'r1', c: new THREE.Vector3(0, 0, 0), t: 60, clear: 0, sunFx: null, broken: null };
        const hand = new THREE.Vector3(-8, 1.8, 6), dir = new THREE.Vector3(0.22, 1, -0.2).normalize();
        const deckY = GARGOYLE.SKY_H;
        const run = (secs, stress, live = true, dt = 1 / 30) => {
            for (let t = 0; t < secs; t += dt) {
                r.t += dt;
                if (live) {
                    r.sunFx = { o: hand.clone(), d: dir.clone(), s: stress, on: true, at: performance.now() };
                    beam.fight((deckY - hand.y) / dir.y, stress, hand, dir);
                }
                ritual.sky([r], dt, camera.position);
                beam.update(dt);
                stepSparks(dt);
            }
        };
        const shot = () => { if (window.__hideRings) for (const q of beam.rings) q.mesh.visible = false; renderer.render(scene, camera); return cv.toDataURL("image/png"); };
        const outShots = {};
        run(0.9, 0.04); outShots.start = shot();
        run(7, 0.55); outShots.mid = shot();
        run(5, 0.95);
        // the clouds break: the burst (the same call the game makes in Gargoyles.dispel)
        r.broken = { t: r.t }; r.burstAt = performance.now() - 900;
        const hit = new THREE.Vector3(hand.x + dir.x * ((deckY - hand.y) / dir.y), 0, hand.z + dir.z * ((deckY - hand.y) / dir.y));
        beam.burst(hit, deckY, 0);
        run(0.5, 0, false);
        outShots.burst = shot();
        return outShots;
    }, [W, H]);
    for (const [k, url] of Object.entries(shots)) {
        const file = path.join(out, `sun-${k}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
