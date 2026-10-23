// Pictures of the new trees (TreeBuild.js): every variant of a kind in a row, with a hero-sized post (3.5 m)
// beside them for scale; and the far (LOD) shapes. Usage: node tools/tree-screenshots.mjs [--out docs/trees] [--far]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/trees'));
const far = process.argv.includes('--far');
const only = arg('--kind', null);
const dist = Number(arg('--dist', 118));
const port = Number(arg('--port', 8794));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 760 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url + 'style.css');
    const kinds = only != null ? [Number(only)] : [0, 1, 2, 3, 4];
    for (const k of kinds) {
        const url = await page.evaluate(async ([k, far, dist]) => {
            const THREE = await import('/vendor/three/three.module.js');
            const { buildTree, TREE_GEN } = await import('/src/world/TreeBuild.js?' + Date.now());
            const cv = document.createElement('canvas');
            cv.width = 1400; cv.height = 760;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x9fd0ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 0.75));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.8);
            sun.position.set(30, 60, 40); sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 40, bottom: -40, far: 200 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun);
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5f9a45 }));
            ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
            const geo = (a) => {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
                g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
                g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
                g.setIndex(new THREE.BufferAttribute(a.index, 1));
                return g;
            };
            const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
            const N = TREE_GEN.VARIANTS, gap = 15;
            for (let v = 0; v < N; v++) {
                const t = buildTree(k, v, { far });
                for (const part of [t.wood, t.leaf]) {
                    const m = new THREE.Mesh(geo(part), mat);
                    m.position.x = (v - (N - 1) / 2) * gap;
                    m.castShadow = m.receiveShadow = true;
                    scene.add(m);
                }
            }
            // the hero: a 3.5 m post (red) between the first two trees
            const hero = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.5, 0.4), new THREE.MeshLambertMaterial({ color: 0xd03030 }));
            hero.position.set((-(N - 1) / 2 + 0.5) * gap, 1.75, 3); scene.add(hero);
            const cam = new THREE.PerspectiveCamera(42, 1400 / 760, 0.5, 500);
            cam.position.set(dist < 100 ? -45 : 0, 7, dist); cam.lookAt(dist < 100 ? -45 : 0, 8, 0);
            r.render(scene, cam);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return u;
        }, [k, far, dist]);
        const file = path.join(out, `tree-${k}${far ? '-far' : ''}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved', file);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
