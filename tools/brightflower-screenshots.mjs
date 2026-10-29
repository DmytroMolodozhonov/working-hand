// Pictures of the Brightflower («Ярколето», BrightFlowerFx.js): a group of five shut / half open / open, angry (the cup turned on a hero post),
// at night, and its heart as an item — next to a hero post (3.5 m) for scale. Usage: node tools/brightflower-screenshots.mjs [--out docs/brightflower]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/brightflower'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8809)));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = await page.evaluate(async () => {
        const THREE = await import('three');
        const { BrightFlowerFx } = await import('/src/fx/BrightFlowerFx.js');
        const MD = await import('/src/fx/BrightFlowerModel.js');
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
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xd03030 })); hero.position.set(-2.2, 1.75, 2.5); s.add(hero);
            return s;
        };
        const cam = (x, y, z, tx, ty, tz) => { const c = new THREE.PerspectiveCamera(45, 1280 / 720, 0.3, 300); c.position.set(x, y, z); c.lookAt(tx, ty, tz); return c; };
        const spots = [[0, 0], [2.4, 0.8], [-2.2, -0.2], [1.1, -2.2], [-1.2, -2.5]];
        const flowers = (open, flame, look) => spots.map(([x, z], i) => {
            const d = look ? new THREE.Vector3(-2.2 - x, 2.4 - 1.7, 2.5 - z).normalize() : new THREE.Vector3(0, 1, 0);
            return { x, y: 0, z, yaw: i * 1.3, s: 0.9 + (i % 3) * 0.1, open, flame, dx: d.x, dy: d.y, dz: d.z, ph: i * 1.7, heat: flame > 0 ? 1 : 0.2 };
        });
        const draw = (name, night, list, c, t) => {
            const s = scene(night), fx = new BrightFlowerFx(s);
            fx.draw(list, t, night ? 1 : 0);
            r.render(s, c); res[name] = cv.toDataURL('image/png'); fx.dispose();
        };
        draw('shut', false, flowers(0, 0), cam(5, 2.6, 8, 0, 1.4, 0), 1.2);
        draw('half', false, flowers(0.5, 0), cam(5, 2.6, 8, 0, 1.4, 0), 1.2);
        draw('open', false, flowers(1, 1), cam(5, 2.6, 8, 0, 1.4, 0), 1.2);
        draw('open-close', false, flowers(1, 1), cam(2.5, 2.4, 3.8, 0, 1.6, 0), 1.2);
        draw('open-night', true, flowers(1, 1), cam(5, 2.6, 8, 0, 1.4, 0), 1.2);
        draw('angry', false, flowers(1, 1.5, true), cam(6, 2.8, 8, -0.5, 1.6, 0), 1.2);
        for (const [n, f] of [['stem', MD.stemGeometry], ['petals', MD.petalGeometry], ['flame', MD.flameGeometry]]) { const g = f(); g.computeBoundingBox(); numbers[n] = g.boundingBox.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); }
        const s = new THREE.Scene(); s.background = new THREE.Color(0x2a2f3a);
        s.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(2, 4, 3); s.add(d);
        const m = MD.brightCoreModel(); s.add(m); const b = new THREE.Box3().setFromObject(m); numbers.item = b.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
        const c = new THREE.PerspectiveCamera(35, 1, 0.05, 20); const ctr = b.getCenter(new THREE.Vector3()); c.position.set(ctr.x + 0.6, ctr.y + 0.4, ctr.z + 1.4); c.lookAt(ctr);
        r.setSize(512, 512, false); r.render(s, c); res.item = cv.toDataURL('image/png');
        res.numbers = JSON.stringify(numbers);
        return res;
    });
    for (const [k, v] of Object.entries(shots)) {
        if (k === 'numbers') { console.log(v); continue; }
        const file = path.join(out, k + '.png'); fs.writeFileSync(file, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', file);
    }
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
