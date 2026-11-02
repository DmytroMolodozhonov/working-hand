// Pictures and numbers of the carnivorous head's hunt (PlantHunt.js + PlantModels.js HeadNeck/jaws/tendrils): the real hunt simulation is run
// on a pig and a hero-sized post, and a picture is taken at each phase — rest, the neck stretching, the tendrils wrapping, the slam, the pull,
// the chew, the swallow, the swelling going down. Numbers (Box3) of the sizes. Usage: node tools/plant-hunt-screenshots.mjs [--out docs/media]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8809)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const M = await import('/src/fx/PlantModels.js');
        const H = await import('/src/game/PlantHunt.js');
        const mats = M.plantMaterials(), res = {}, numbers = {};
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const s = new THREE.Scene();
        s.background = new THREE.Color(0x9fd0ee); s.fog = new THREE.Fog(s.background, 30, 140);
        s.add(new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 0.8));
        const sun = new THREE.DirectionalLight(0xfff4dd, 0.9); sun.position.set(20, 40, 25); s.add(sun);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: 0x5f9a45 })); ground.rotation.x = -Math.PI / 2; s.add(ground);
        // the plant (as Plants._buildHead builds it)
        const hb = M.buildHeadBase(1), [la, lb] = [M.buildLobe(1, 0), M.buildLobe(2, 1)];
        const root = new THREE.Group();
        const foot = new THREE.Mesh(hb.geo, mats.headStem);
        const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ';
        const top = new THREE.Mesh(la, mats.head), low = new THREE.Mesh(lb, mats.head); low.rotation.x = Math.PI;
        pivot.add(top, low, new THREE.Mesh(M.buildHeadCollar(1), mats.headStem));
        const neck = new M.HeadNeck(2), nm = new THREE.Mesh(neck.geo, mats.vine); nm.frustumCulled = false;
        const vines = new M.VineSet(1), vm = new THREE.Mesh(vines.geo, mats.vine); vm.frustumCulled = false;
        root.add(foot, nm, pivot, vm); s.add(root);
        // the prey: a pig (1.45 → ~2.1 m long, 1.1 m tall) and a hero post (3.5 m)
        const pigM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 2.0), new THREE.MeshLambertMaterial({ color: 0xe8a0a8 })); s.add(pigM);
        const hero = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); hero.position.set(-4, 1.75, 6); s.add(hero);
        const h = new H.Hunt([hb.rest.x, hb.rest.y, hb.rest.z], [hb.base.x, hb.base.y, hb.base.z], 0);
        const spine = Array.from({ length: M.NECK.N }, () => [0, 0, 0]);
        let jaw = 0.14, clock = 0;
        const pigAt = [7.5, 0.5, 2.5];
        pigM.position.set(pigAt[0], 0.5, pigAt[2]);
        const pose = (dt) => {
            clock += dt;
            jaw += (h.jawTarget() - jaw) * Math.min(1, dt * (h.st === 'snap' ? 45 : 9));
            pivot.position.set(h.H[0], h.H[1], h.H[2]); pivot.rotation.set(h.pitch, h.yaw, 0);
            top.rotation.x = -jaw; low.rotation.x = Math.PI - jaw;
            const L = H.neckSpine(h.base, h.H, h.yaw, h.pitch, spine, spine.length);
            neck.update(spine, H.neckThin(L), h.bulgeAt(), 0.55, clock);
            const grabbing = h.tendril > 0 && h.prey, reach = Math.min(1, h.tendril), tg = new THREE.Vector3(h.preyPos[0], h.preyPos[1], h.preyPos[2]);
            for (let i = 0; i < vines.N; i++) vines.set(i, neck.sample(0.5 + 0.45 * i / (vines.N - 1), new THREE.Vector3()), i * 2.4 + 0.5, grabbing && i < 4 ? tg : null, clock * (grabbing ? 2.2 : 1), grabbing && i < 4 ? reach * reach * (3 - 2 * reach) : 0, h.tendril >= 1 ? 1 : 0);
            vines.commit();
            if (h.owned) pigM.position.set(h.preyPos[0], h.preyPos[1], h.preyPos[2]); else pigM.position.set(pigAt[0], 0.5, pigAt[2]);
            pigM.scale.setScalar(h.preyScale);
            pigM.rotation.set(0, h.yaw, 0);
            return L;
        };
        const camAt = (x, y, z, tx, ty, tz) => { const c = new THREE.PerspectiveCamera(42, 1280 / 720, 0.3, 300); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const snap = (name, c) => { r.render(s, c); res[name] = cv.toDataURL('image/png'); };
        // rest
        for (let i = 0; i < 30; i++) h.step(1 / 60, {}), pose(1 / 60);
        snap('plant-hunt-0-rest', camAt(6, 4.2, 17, 3, 3.2, 1.5));
        const box = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
        numbers['plant at rest (foot+neck+head), m'] = box(root);
        const prey = { k: 'a', kind: 'a', id: 1, size: 1.45, verdict: 'eat', inside: false };
        h.begin(prey, pigAt.slice());
        const want = { grab: ['1-reach', 0.45], wrap: ['2-wrap', 0.12], snap: ['3-snap', 0.2], pull: ['4-pull', 0.45], bite: ['5-chew', 0.3], gulp: ['6-gulp', 0.5], digest: ['7-digest', 1.6] };
        const done = new Set(); let maxStretch = 0, maxPigStep = 0, last = null;
        for (let i = 0; i < 60 * 14; i++) {
            h.step(1 / 60, { prey: h.owned ? null : pigAt });
            const L = pose(1 / 60); maxStretch = Math.max(maxStretch, L / H.HUNT.REST_NECK);
            if (h.owned && h.prey) { if (last) maxPigStep = Math.max(maxPigStep, Math.hypot(h.preyPos[0] - last[0], h.preyPos[1] - last[1], h.preyPos[2] - last[2])); last = h.preyPos.slice(); }
            const w = want[h.st];
            if (w && !done.has(h.st) && h.t >= w[1]) {
                done.add(h.st);
                const wide = h.st === 'grab' ? camAt(12, 5, 14, 3.5, 2.6, 2.2) : h.st === 'wrap' || h.st === 'snap' ? camAt(8, 3.2, 11, 4.5, 1.6, 2.2) : camAt(5, 4.5, 16, 3, 3.4, 1.8);
                snap('plant-hunt-' + w[0], wide);
                if (h.st === 'grab') numbers['neck at full reach: stretch ×, hinge distance m'] = [+(L / H.HUNT.REST_NECK).toFixed(2), +Math.hypot(h.H[0] - h.base[0], h.H[1] - h.base[1], h.H[2] - h.base[2]).toFixed(2)];
            }
            if (h.st === 'idle' && i > 100) break;
        }
        numbers['max neck stretch ×'] = +maxStretch.toFixed(2);
        numbers['max step of the pig in a frame (m, limit ' + H.maxPreyStep(1 / 60).toFixed(2) + ')'] = +maxPigStep.toFixed(3);
        la.computeBoundingBox(); numbers['one jaw (lobe), m'] = la.boundingBox.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
        numbers['hero post, m'] = [0.7, 3.5, 0.5]; numbers['pig prop, m'] = [0.9, 1.0, 2.0];
        res.numbers = JSON.stringify(numbers, null, 1);
        return res;
    });
    for (const [k, v] of Object.entries(shots)) {
        if (k === 'numbers') { console.log(v); continue; }
        const file = path.join(out, k + '.png'); fs.writeFileSync(file, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', file);
    }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
