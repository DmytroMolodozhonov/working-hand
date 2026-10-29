// (--plants: plants of one's own — CustomPlantModel.js)
// Pictures of creatures of one's own («Да пусть создастся существо …» — CustomCreatureModel.js): each description a
// creature, posed mid-walk (or mid-flight), a 3.5 m red post (the hero) beside it for scale.
// Usage: node tools/creature-screenshots.mjs [--out docs/creatures] [--fly]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/creatures'));
const port = Number(arg('--port', 8795));
fs.mkdirSync(out, { recursive: true });
const DESCS = [
    'существо похожее на коня',
    'белый конь с чёрной гривой и крыльями',
    'огромный серый слон',
    'жираф',
    'олень',
    'рыжая лиса',
    'бурый медведь',
    'лев',
    'верблюд',
    'черепаха',
    'синий дракон с золотыми рогами',
    'единорог',
]

const PLANTS = [
    'красное и очень большое дерево',
    'синий мелкий цветок',
    'золотой огромный куст',
    'огромное дерево с синими листьями и светящимися плодами',
    'плакучая ива с серебристыми листьями',
    'ель с голубыми иголками, растёт в горах',
    'куст с красными ягодами',
    'волшебный цветок с огненными лепестками',
    'светящийся гриб в пещере',
    'кактус с розовыми цветами в пустыне',
    'кристаллическое растение, фиолетовое, светится',
    'лиана с белыми цветами',
    'тростник у воды',
    'золотая трава на лугу',
    'спиральное дерево с розовыми цветами',
];
const plants = process.argv.includes('--plants');
const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'tools/tree-view.html');
    const url = await page.evaluate(async ([descs, fly, plantsOn]) => {
        const THREE = await import('three');
        const { buildCreature, poseCreature } = await import('/src/entities/CustomCreatureModel.js');
        const { sanitizeRecipe, recipeKey } = await import('/src/game/CreationRules.js');
        const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.shadowMap.enabled = true;
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fd0ee);
        scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 0.8));
        const sun = new THREE.DirectionalLight(0xfff4dd, 0.85); sun.position.set(20, 40, 30); sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, far: 120 }); sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 300), new THREE.MeshLambertMaterial({ color: 0x5f9a45 })); ground.rotation.x = -Math.PI / 2; ground.position.x = 600; ground.receiveShadow = true; scene.add(ground);
        // each creature in a tile of its own, the camera framing it (the post beside it for scale)
        const cols = 4, rows = Math.ceil(descs.length / cols), tw = 1600 / cols, th = 900 / rows;
        r.setScissorTest(true);
        const names = [];
        const { plantShape, plantMaterials } = await import('/src/fx/CustomPlantModel.js');
        descs.forEach((d, i) => {
            if (plantsOn) {
                const rec = sanitizeRecipe({ type: 'plant' }, d, i + 1), M = plantMaterials(), sh = plantShape(rec, i + 1);
                const g = new THREE.Group(); const b = new THREE.Mesh(sh.body, M.body); b.castShadow = true; g.add(b); if (sh.glow) g.add(new THREE.Mesh(sh.glow, M.glow));
                g.scale.setScalar(rec.height); g.position.set(i * 60, 0, 0); scene.add(g);
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
                const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
                post.position.set(box.max.x + 0.6, 1.75, c.z + 0.8); scene.add(post);
                const R = Math.max(size.x, size.y, size.z, 3.5) * 0.85;
                const cam = new THREE.PerspectiveCamera(36, tw / th, 0.1, 400);
                cam.position.set(c.x + R * 0.35, c.y + R * 0.4, c.z + R * 2.1); cam.lookAt(c.x, Math.max(c.y, 1.2), c.z);
                const col = i % cols, row = Math.floor(i / cols);
                r.setViewport(col * tw, 900 - (row + 1) * th, tw, th); r.setScissor(col * tw, 900 - (row + 1) * th, tw, th);
                sun.position.set(c.x + 20, 40, c.z + 30); sun.target.position.copy(c); sun.target.updateMatrixWorld();
                r.render(scene, cam);
                names.push(`${i}: ${rec.form} ${rec.crown} ${rec.leaves} ${rec.height.toFixed(1)}m glow=${rec.glow != null}`);
                return;
            }
            const rec = sanitizeRecipe({ type: 'creature' }, d, i + 1);
            const m = buildCreature(rec, recipeKey(rec), i + 1);
            const flying = fly && rec.fly;
            const a = { mode: flying ? 'fly' : 'walk', walk: rec.walk, fly: rec.fly, speed: flying ? 6 : 2.5, k: 1 };
            for (let k = 0; k < 9; k++) poseCreature(m, a, 0.07);
            const x = i * 60;
            m.position.set(x, flying ? 2 : 0, 0);
            m.rotation.y = -Math.PI / 2 + 0.55;
            scene.add(m);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
            post.position.set(box.max.x + 0.6, 1.75, c.z + 0.8); scene.add(post);
            const R = Math.max(size.x, size.y, size.z, 3.5) * 0.85;
            const cam = new THREE.PerspectiveCamera(36, tw / th, 0.1, 400);
            cam.position.set(c.x + R * 0.35, c.y + R * 0.55, c.z + R * 2.1); cam.lookAt(c.x, Math.max(c.y, 1.2), c.z);
            const col = i % cols, row = Math.floor(i / cols);
            r.setViewport(col * tw, 900 - (row + 1) * th, tw, th); r.setScissor(col * tw, 900 - (row + 1) * th, tw, th);
            sun.position.set(c.x + 20, 40, c.z + 30); sun.target.position.copy(c); sun.target.updateMatrixWorld();
            r.render(scene, cam);
            names.push(`${i}: ${rec.plan} ${rec.walk}/${rec.fly} ${rec.skin} ${rec.pattern} ${rec.size.toFixed(1)}m`);
        });
        window.__names = names;
        return cv.toDataURL('image/png');
    }, [plants ? PLANTS : DESCS, process.argv.includes('--fly'), plants]);
    console.log((await page.evaluate(() => window.__names)).join('\n'));
    const file = path.join(out, plants ? 'plants.png' : `creatures${process.argv.includes('--fly') ? '-fly' : ''}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', file);
} finally {
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
