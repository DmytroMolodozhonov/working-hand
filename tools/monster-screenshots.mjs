// Pictures of the monster form («Пентаграмма страшного монстра», MonsterBody.js): the hero's own body (VoxelCharacter)
// with the monster on its bones, close (×1) and at its real size (×7) beside an ordinary hero; and the measures (Box3).
// Usage: node tools/monster-screenshots.mjs [--out docs/monster] [--beast 1]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/monster'));
const beast = Number(arg('--beast', 1));
const port = Number(arg('--port', 8795));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const shots = [
        { name: 'front', size: 1, cam: [4, 3.2, -9.5], at: [0, 2.4, 0] },
        { name: 'side', size: 1, cam: [-10, 3, -1.5], at: [0, 2.4, 0] },
        { name: 'back', size: 1, cam: [-4.5, 4, 8.5], at: [0, 2.4, 0] },
        { name: 'head', size: 1, cam: [2.2, 4.6, -4.2], at: [0, 4.1, -0.6] },
        { name: 'scale', size: 7, cam: [34, 14, -62], at: [6, 14, 0], hero: true },
    ];
    for (const s of shots) {
        const res = await page.evaluate(async ([s, beast]) => {
            const THREE = await import('three');
            const { VoxelCharacter, PLAYER_GROUND_OFFSET } = await import('/src/entities/Character.js');
            const { MonsterLook } = await import('/src/entities/MonsterBody.js');
            const cv = document.createElement('canvas');
            cv.width = 1200; cv.height = 900;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            r.shadowMap.enabled = true;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x9fd0ee);
            scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 0.7));
            const sun = new THREE.DirectionalLight(0xfff4dd, 0.85);
            sun.position.set(-30, 60, -40); sun.castShadow = true;
            Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -10, far: 200 });
            sun.shadow.mapSize.set(2048, 2048);
            scene.add(sun, sun.target);
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5f9a45 }));
            ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
            const ch = new VoxelCharacter(scene);
            const look = new MonsterLook(ch);
            look.setOn(true);
            ch.group.scale.setScalar(s.size);
            ch.group.position.set(0, PLAYER_GROUND_OFFSET * s.size, 0);
            ch.group.rotation.y = Math.PI; // (faces the camera's side: the hero faces −Z, the camera stands at −Z)
            ch.group.rotation.y = 0;
            // the arms: a fighter's guard (fists before the chest), one a little lower
            // (an arm bone points along its +Z: rotation.x π/2 — straight down, more — forward)
            const pose = (a, e, x, y, el) => { a.rotation.set(x, y, 0); e.rotation.set(el, 0, 0); };
            pose(ch.leftArmAnchor, ch.leftElbowAnchor, 2.0, -0.25, 1.0);
            pose(ch.rightArmAnchor, ch.rightElbowAnchor, 1.75, 0.2, 0.5);
            ch.leftLegPivot.rotation.x = 0.18; ch.rightLegPivot.rotation.x = -0.12;
            ch.setShowHands(true);
            for (const h of [ch.leftSimplifiedHand, ch.rightSimplifiedHand]) { for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) h.targetState.fingers[f] = h.currentState.fingers[f] = 0.9; h.animateModel?.(); }
            look.update(1, beast, s.name === 'head' ? 1 : 0.2);
            look.update(1, beast, s.name === 'head' ? 1 : 0.2);
            if (s.hero) {
                const h = new VoxelCharacter(scene);
                h.group.position.set(12, PLAYER_GROUND_OFFSET, -4);
                h.setShowHands(true);
                const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8a8a8a }));
                post.position.set(16, 0.5, -4); scene.add(post);
            }
            scene.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(ch.group);
            const size = box.getSize(new THREE.Vector3());
            const eyes = ch.getHeadPosition(new THREE.Vector3());
            const cam = new THREE.PerspectiveCamera(40, 1200 / 900, 0.1, 500);
            cam.position.set(...s.cam); cam.lookAt(...s.at);
            sun.target.position.set(0, 0, 0);
            r.render(scene, cam);
            const u = cv.toDataURL('image/png');
            r.dispose();
            return { u, box: { min: box.min.toArray().map((v) => +v.toFixed(2)), max: box.max.toArray().map((v) => +v.toFixed(2)), size: size.toArray().map((v) => +v.toFixed(2)) }, eyes: eyes.toArray().map((v) => +v.toFixed(2)), calls: r.info.render.calls };
        }, [s, beast]);
        const file = path.join(out, `monster-${s.name}.png`);
        fs.writeFileSync(file, Buffer.from(res.u.split(',')[1], 'base64'));
        console.log('saved', file, 'size ×' + s.size, 'box', JSON.stringify(res.box), 'eyes', JSON.stringify(res.eyes), 'draws', res.calls);
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
