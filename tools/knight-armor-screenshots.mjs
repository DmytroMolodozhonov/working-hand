// A PREVIEW (not connected to the game): the hero's new armour (src/entities/KnightArmorLook.js) on the game's own hero model.
// Two pictures: all sets side by side, and a close view turned three-quarters. Usage: node tools/knight-armor-screenshots.mjs [--out docs/media]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8860)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 600000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    for (const name of ['all', 'close']) {
        const png = await page.evaluate(async (name) => {
            const THREE = await import('three');
            const { VoxelCharacter } = await import('/src/entities/Character.js');
            const A = await import('/src/entities/Appearance.js');
            const K = await import('/src/entities/KnightArmorLook.js');
            const sets = name === 'all'
                ? [{ h: 1, c: 1, l: 1, label: 'Сталь' }, { h: 2, c: 2, l: 2, label: 'Волшебная' }, { h: 3, c: 3, l: 3, label: 'Именная' }, { h: 1, c: 1, l: 1, dk: 7, label: 'Проклятая (чёрная)' }, { h: 1, c: 1, l: 0, label: 'Шлем и латы' }, { h: 2, c: 0, l: 2, label: 'Шлем и поножи' }]
                : [{ h: 1, c: 1, l: 1, label: 'Сталь' }, { h: 2, c: 2, l: 2, label: 'Волшебная' }, { h: 3, c: 3, l: 3, label: 'Именная' }];
            const W = 1600, H = 800, N = sets.length;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
            scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 1.0));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.3); sun.position.set(-5, 9, 10); scene.add(sun);
            const fill = new THREE.DirectionalLight(0x9ab8ff, 0.7); fill.position.set(7, 3, 6); scene.add(fill);
            const rim = new THREE.DirectionalLight(0x8ab0ff, 0.4); rim.position.set(6, 3, -6); scene.add(rim);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
            const look = { ...A.defaultLook(), top: 0, topColor: 0x5a5a66, bottom: 3, bottomColor: 0x2a2a30, hair: 0, hairColor: 0x4a3728, shoes: 1, shoesColor: 0x3a2412, face: 4 };
            const gap = name === 'all' ? 3.8 : 5.2;
            sets.forEach((c, i) => {
                const ch = new VoxelCharacter(scene);
                A.applyLook(ch, look);
                ch._armorParts = [];
                const dk = c.dk | 0;
                if (c.h) K.helmetParts(ch.head, c.h, ch._armorParts, !!(dk & 1));
                if (c.c) K.chestParts(ch, ch.torso, c.c, ch._armorParts, !!(dk & 2));
                if (c.l) for (const p of [ch.leftLegPivot, ch.rightLegPivot]) K.legParts(p, c.l, ch._armorParts, !!(dk & 4));
                for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) { a.rotation.x = Math.PI / 2 - 0.1; e.rotation.x = 0.28; }
                ch.group.position.set((i - (N - 1) / 2) * gap, 1.95, 0);
                ch.group.rotation.y = Math.PI + (name === 'close' ? 0.6 : 0);
            });
            const cam = new THREE.PerspectiveCamera(name === 'all' ? 26 : 24, W / H, 0.1, 100);
            if (name === 'all') { cam.position.set(0, 4.4, 23); cam.lookAt(0, 3.3, 0); } else { cam.position.set(0, 4.4, 20); cam.lookAt(0, 3.4, 0); }
            r.render(scene, cam);
            const o = document.createElement('canvas'); o.width = W; o.height = H;
            const g = o.getContext('2d'); g.drawImage(cv, 0, 0);
            g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
            sets.forEach((c, i) => { const p = new THREE.Vector3((i - (N - 1) / 2) * gap, 0.2, 0).project(cam); g.fillText(c.label, (p.x * 0.5 + 0.5) * W, H - 36); });
            return o.toDataURL('image/png');
        }, name);
        fs.writeFileSync(path.join(out, `knight-armor-${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log('written', name);
    }
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
