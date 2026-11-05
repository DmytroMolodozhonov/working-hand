// A PREVIEW (not in the game): the ordinary hero's new clothes, hair and hats (src/entities/HeroWardrobe.js) on the game's own hero model.
// Five pictures: tops, bottoms + shoes, hats, hair, full outfits. Usage: node tools/hero-wardrobe-screenshots.mjs [--out docs/media] [--only tops,hats]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const only = (arg('--only', '') || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8820)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 900000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const names = ['tops', 'bottoms', 'hats', 'hair', 'outfits'].filter((n) => !only.length || only.includes(n));
    for (const name of names) {
        const png = await page.evaluate(async (name) => {
            const THREE = await import('three');
            const { VoxelCharacter } = await import('/src/entities/Character.js');
            const A = await import('/src/entities/Appearance.js');
            const { dressHero } = await import('/src/entities/HeroWardrobe.js');
            const base = { ...A.defaultLook() };
            const L = (o) => ({ ...base, ...o });
            const skins = A.SKIN_TONES;
            let items = [];
            if (name === 'tops') {
                const cols = [0x3a7bd5, 0x8a3a3a, 0x4a6a8a, 0x2f6b3a, 0xb8782a, 0x6a4aa0, 0x5a3a2a, 0x3a5a7a];
                items = [0, 1, 3, 4, 6, 7, 8, 9].map((t, i) => ({ look: L({ top: t, topColor: cols[i], bottom: 3, bottomColor: 0x3a3a44, shoes: 3, shoesColor: 0x2a1a10, hair: i % 8 === 5 ? 0 : i % 8, hairColor: [0x4a3728, 0x2b1d14, 0x8b5a2b, 0xd9b46c, 0x4a3728, 0x2b1d14, 0xa83e2a, 0x4a3728][i], skin: skins[i % 4], face: i * 3 }), label: A.TOPS[t] }));
            } else if (name === 'bottoms') {
                const spec = [[0, 0], [1, 2], [2, 3], [3, 1], [4, 4], [5, 5], [6, 7], [7, 0], [9, 8]];
                const cols = [0x3a5a9a, 0x7a6a3a, 0x8a3a3a, 0x3a3a44, 0x5a6a3a, 0x3a3a6a, 0x2a4a2a, 0x2a2a30, 0x6a5a4a];
                items = spec.map(([b, s], i) => ({ look: L({ bottom: b, bottomColor: cols[i], shoes: s, shoesColor: [0xeeeeee, 0x6a4a2a, 0x2a2a2a, 0x5a2a1a, 0x2f6b3a, 0x3a2412, 0x2a2a3a, 0xc9a0b0, 0xd9d9d9][i], top: 6 + (i % 2) * 3, topColor: [0xd8d2c0, 0x7a8aa0][i % 2], hair: 0, face: i }), label: `${A.BOTTOMS[b]} + ${A.SHOES[s]}` }));
            } else if (name === 'hats') {
                const cols = [0x8e2b2b, 0x2a5a8a, 0x3a3a44, 0x2a2a30, 0x3a5a3a, 0x8a2a2a, 0x8a5a2a, 0x7a7a8a];
                items = [1, 2, 3, 4, 6, 7, 8].map((h, i) => ({ look: L({ hat: h, hatColor: cols[i], top: [0, 1, 4, 9, 1, 0, 8][i], topColor: [0x3a7bd5, 0x6a6a7a, 0x4a6a8a, 0xeeeeee, 0x4a4a52, 0xb8782a, 0x6a3a2a][i], bottom: 3, bottomColor: 0x3a3a44, shoes: 1, shoesColor: 0x3a2412, hair: [0, 1, 3, 0, 5, 6, 0][i], hairColor: [0x4a3728, 0x2b1d14, 0x8b5a2b, 0x4a3728, 0x4a3728, 0xa83e2a, 0xd9b46c][i], face: i * 4 + 1 }), label: A.HATS[h] }));
            } else if (name === 'hair') {
                const cols = [0x4a3728, 0x8b5a2b, 0xd9b46c, 0x2b1d14, 0xa83e2a, 0x4a3728, 0xe8e2d6, 0x6a3a1a];
                items = [0, 1, 2, 3, 4, 5, 6, 7].map((h, i) => ({ look: L({ hair: h, hairColor: cols[i], top: 0, topColor: [0x3a7bd5, 0x8a3a3a, 0x2f6b3a, 0x6a4aa0][i % 4], bottom: 0, bottomColor: 0x2c3e50, shoes: 0, face: i * 3 + 2, skin: skins[(i * 2) % 7] }), label: A.HAIR_STYLES[h] }));
            } else {
                items = [
                    { look: L({ top: 1, topColor: 0x5a6a7a, bottom: 0, bottomColor: 0x3a5a9a, shoes: 0, shoesColor: 0xeeeeee, hat: 2, hatColor: 0xb8782a, hair: 1, hairColor: 0x2b1d14, face: 5 }), label: 'Худи, джинсы, кеды, шапка' },
                    { look: L({ top: 9, topColor: 0x8e2b2b, bottom: 3, bottomColor: 0x2a2a30, shoes: 3, shoesColor: 0x2a1a10, hat: 4, hatColor: 0x222226, hair: 0, hairColor: 0x2b1d14, face: 8 }), label: 'Рубашка с галстуком, цилиндр' },
                    { look: L({ top: 7, topColor: 0x4a6a3a, bottom: 6, bottomColor: 0x3a5a2a, shoes: 1, shoesColor: 0x4a2c18, hat: 8, hatColor: 0x9a6a3a, hair: 2, hairColor: 0xd9b46c, face: 11 }), label: 'Туника, килт, сапоги, ковбойская' },
                    { look: L({ top: 8, topColor: 0x4a3a6a, bottom: 3, bottomColor: 0x2a2a30, shoes: 1, shoesColor: 0x3a2412, hat: 6, hatColor: 0x3a3a46, hair: 3, hairColor: 0xa83e2a, face: 14 }), label: 'Плащ, капюшон' },
                    { look: L({ top: 6, topColor: 0x3a5a7a, bottom: 4, bottomColor: 0x5a6a3a, shoes: 4, shoesColor: 0x2f6b3a, hat: 1, hatColor: 0x8e2b2b, hair: 6, hairColor: 0x8b5a2b, face: 17 }), label: 'Свитер, карго, резиновые, кепка' },
                    { look: L({ top: 4, topColor: 0x6a3a2a, bottom: 0, bottomColor: 0x2c3e50, shoes: 8, shoesColor: 0x2a2a2a, hat: 7, hatColor: 0xc9a0a0, hair: 7, hairColor: 0x2b1d14, face: 20, skin: skins[4] }), label: 'Куртка, джинсы, высокие кеды, повязка' },
                ];
            }
            const W = 1600, H = 800, N = items.length;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2e3340);
            scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.95));
            const sun = new THREE.DirectionalLight(0xfff0d8, 1.15); sun.position.set(-5, 9, 10); scene.add(sun);
            const rim = new THREE.DirectionalLight(0x8ab0ff, 0.35); rim.position.set(6, 3, -6); scene.add(rim);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
            const gap = Math.max(3.4, 22 / Math.max(N, 1) * 1.45);
            items.forEach((it, i) => {
                const ch = new VoxelCharacter(scene);
                it.look.faceMaterial = new THREE.MeshLambertMaterial({ map: A.drawFace(it.look) });
                dressHero(ch, it.look);
                for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) { a.rotation.x = Math.PI / 2 - 0.1; e.rotation.x = 0.28; }
                ch.group.position.set((i - (N - 1) / 2) * gap, 1.95, 0);
                ch.group.rotation.y = Math.PI;
            });
            const span = N * gap;
            const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
            const dist = Math.max(18, span * 0.95);
            cam.position.set(0, 4.3, dist); cam.lookAt(0, 3.3, 0);
            r.render(scene, cam);
            const out = document.createElement('canvas'); out.width = W; out.height = H;
            const g = out.getContext('2d'); g.drawImage(cv, 0, 0);
            g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e8f0'; g.shadowColor = '#000'; g.shadowBlur = 4;
            items.forEach((it, i) => { const p = new THREE.Vector3((i - (N - 1) / 2) * gap, 0.3, 0).project(cam); g.fillText(it.label, (p.x * 0.5 + 0.5) * W, H - 40 - ((i % 2) ? 28 : 0)); });
            return out.toDataURL('image/png');
        }, name);
        fs.writeFileSync(path.join(out, `hero-wardrobe-${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
        console.log('written', name);
    }
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
