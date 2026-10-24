// Pictures and numbers of the plant creatures (PlantModels.js): a group of five telewilpins by day and at night, a carnivorous head
// idle, grabbing (jaws open, tendrils reaching a hero-sized post) and biting, a leaf and a head as items — next to a hero post (3.5 m)
// and a real tree for scale. Usage: node tools/plant-screenshots.mjs [--out docs/plants]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/plants'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8807)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const M = await import('/src/fx/PlantModels.js');
        const { PLANT_CLOCK } = M, mats = M.plantMaterials();
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        const res = {}, numbers = {};
        const scene = (night) => {
            const s = new THREE.Scene();
            s.background = new THREE.Color(night ? 0x0b1020 : 0x9fd0ee);
            s.fog = new THREE.Fog(s.background, 25, night ? 60 : 140);
            s.add(new THREE.HemisphereLight(night ? 0x334466 : 0xdfefff, 0x3a4a2a, night ? 0.3 : 0.75));
            const sun = new THREE.DirectionalLight(night ? 0x8899cc : 0xfff4dd, night ? 0.2 : 0.8); sun.position.set(20, 40, 25); s.add(sun);
            const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: night ? 0x1f3a1c : 0x5f9a45 })); g.rotation.x = -Math.PI / 2; s.add(g);
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); hero.position.set(-3, 1.75, 6); s.add(hero);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz) => { const c = new THREE.PerspectiveCamera(45, 1280 / 720, 0.3, 300); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        // telewilpins: a group of five
        const tele = (night) => {
            const s = scene(night), parts = [], pets = [];
            const spots = [[0, 0], [3.2, 1.2], [-3, 1.8], [1.5, -2.8], [-1.6, -3.2]];
            const stems = [], glow = [];
            spots.forEach(([x, z], i) => {
                const v = M.telewilpinVariant(i % M.TELE_VARIANTS), sc = 0.85 + (i % 3) * 0.12;
                const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3), new THREE.Vector3(sc, sc, sc));
                stems.push({ geo: v.stem, matrix: m }); pets.push({ geo: v.petals, matrix: m });
                const t = v.top.clone().applyMatrix4(m); glow.push(t.x, t.y, t.z);
            });
            s.add(new THREE.Mesh(M.mergePlaced(stems), mats.stem), new THREE.Mesh(M.mergePlaced(pets), mats.petal));
            const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3)); s.add(new THREE.Points(pg, mats.glow));
            mats.petal.emissiveIntensity = night ? 1.05 : 0.7; mats.glow.opacity = night ? 0.7 : 0.35;
            return s;
        };
        // a head: jaw opening `jaw`, tendrils reaching `target` (or idle)
        const head = (night, jaw, target, t) => {
            const s = scene(night), hs = M.buildHeadStem(1), la = M.buildLobe(1, 0), lb = M.buildLobe(2, 1);
            const root = new THREE.Group();
            root.add(new THREE.Mesh(hs.geo, mats.headStem));
            const pivot = new THREE.Group(); pivot.position.copy(hs.top);
            const top = new THREE.Mesh(la, mats.head), low = new THREE.Mesh(lb, mats.head); low.rotation.x = Math.PI;
            top.rotation.x = -jaw; low.rotation.x = Math.PI - jaw; pivot.rotation.x = target ? 0.35 : 0.1;
            pivot.add(top, low); root.add(pivot);
            const V = new M.VineSet(1);
            for (let i = 0; i < V.N; i++) V.set(i, hs.curve.getPoint(0.2 + 0.65 * i / (V.N - 1)), i * 2.4 + 0.5, target && i < 4 ? target : null, t, 1, 1);
            V.commit(); const vm = new THREE.Mesh(V.geo, mats.vine); vm.frustumCulled = false; root.add(vm);
            s.add(root);
            if (target) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); post.position.set(target.x, 1.75, target.z); s.add(post); }
            const box = new THREE.Box3().setFromObject(root);
            numbers['head jaw ' + jaw.toFixed(2)] = box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
            return s;
        };
        const shot = (name, s, c) => { r.render(s, c); res[name] = cv.toDataURL('image/png'); };
        PLANT_CLOCK.t.value = 1.3;
        shot('tele-day', tele(false), cam(2, 5, 17, 0, 3.4, 0));
        shot('tele-night', tele(true), cam(2, 5, 17, 0, 3.4, 0));
        shot('head-idle', head(false, 0.14, null, 1), cam(7, 5, 16, 0, 4.2, 1));
        shot('head-grab', head(false, 0.95, new THREE.Vector3(4.5, 0.5, 1.5), 2), cam(9, 5, 15, 2, 3.6, 1));
        shot('head-bite', head(false, 0.3, new THREE.Vector3(3.6, 4, 1.2), 3), cam(9, 5.5, 14, 1, 4.2, 1));
        // sizes
        const tv = M.telewilpinVariant(0);
        for (const [n, g] of [['telewilpin stem', tv.stem], ['telewilpin bloom', tv.petals]]) { g.computeBoundingBox(); numbers[n] = g.boundingBox.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); }
        // items
        const item = (m, name) => {
            const s = new THREE.Scene(); s.background = new THREE.Color(0x2a2f3a);
            s.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(2, 4, 3); s.add(d);
            s.add(m); const b = new THREE.Box3().setFromObject(m); numbers[name] = b.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
            const c = new THREE.PerspectiveCamera(35, 1, 0.05, 20); const ctr = b.getCenter(new THREE.Vector3()); c.position.set(ctr.x + 0.6, ctr.y + 0.4, ctr.z + 1.4); c.lookAt(ctr);
            r.setSize(512, 512, false); r.render(s, c); res[name] = cv.toDataURL('image/png');
        };
        item(M.telewilpinLeafModel(), 'item-leaf'); item(M.carnivoreHeadItemModel(), 'item-head');
        res.numbers = JSON.stringify(numbers);
        return res;
    });
    for (const [k, v] of Object.entries(shots)) {
        if (k === 'numbers') { console.log(v); continue; }
        const file = path.join(out, k + '.png'); fs.writeFileSync(file, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', file);
    }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
