// A PREVIEW only (not in the game): three mages' clothes drawn in the «like the gates» style (docs/rules/texture-style.md):
// woven wool on a canvas (twill, fibres, pilling, wear), gold embroidery on velvet (stars, moons, runes, stitched lines), leather belt, pointed hat.
// Usage: node tools/mage-clothes-preview.mjs [--out docs/media/mage-clothes.png]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/mage-clothes.png'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const srv = await startServer(Number(arg('--port', 8799)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const timer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 280000);
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 60000 });
    const png = await page.evaluate(async () => {
        const THREE = await import('three');
        const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
        const canvas = (w, h, draw, seed) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h, rng(seed)); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };

        // ---------- textures
        // woven wool: pale base (the tone comes from the material), twill, fibres, pilling, worn and stained patches
        const wool = (seed) => canvas(256, 256, (g, S, _h, r) => {
            g.fillStyle = '#dcd7cd'; g.fillRect(0, 0, S, S);
            for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(30,25,15,${0.07 + 0.05 * ((y >> 1) & 1)})`; g.fillRect(0, y, S, 1); } // weft threads
            for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(255,250,240,${0.05 + 0.05 * ((x >> 1) & 1)})`; g.fillRect(x, 0, 1, S); }
            g.lineWidth = 1; // twill: a diagonal rib
            for (let k = -S; k < S; k += 6) { g.strokeStyle = 'rgba(20,15,5,0.09)'; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); }
            for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S, a = r() * 6.3, l = 1.5 + r() * 4; g.strokeStyle = r() < 0.5 ? `rgba(255,248,230,${0.1 + r() * 0.18})` : `rgba(25,18,8,${0.08 + r() * 0.14})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } // fibres
            for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = 1 + r() * 1.6; g.fillStyle = `rgba(240,235,220,${0.35 + r() * 0.3})`; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); g.fillStyle = 'rgba(20,10,0,0.25)'; g.beginPath(); g.arc(x + 0.8, y + 0.9, rad * 0.8, 0, 6.3); g.fill(); } // pills
            for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S, rad = 14 + r() * 34, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,245,225,${0.12 + r() * 0.14})`); gr.addColorStop(1, 'rgba(255,245,225,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); } // worn
            for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S, rad = 8 + r() * 20, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(40,25,10,${0.12 + r() * 0.12})`); gr.addColorStop(1, 'rgba(40,25,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); } // stains
        }, seed);
        // velvet: soft pile (for the trim and lining)
        const velvet = (seed) => canvas(128, 128, (g, S, _h, r) => {
            g.fillStyle = '#c9c0c8'; g.fillRect(0, 0, S, S);
            for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,240,255,${0.05 + r() * 0.1})` : `rgba(10,0,10,${0.06 + r() * 0.12})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
            const sh = g.createLinearGradient(0, 0, S, S); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, S, S);
        }, seed);
        // leather
        const leather = (seed) => canvas(128, 128, (g, S, _h, r) => {
            g.fillStyle = '#d6cbb9'; g.fillRect(0, 0, S, S);
            for (let i = 0; i < 1400; i++) { const x = r() * S, y = r() * S, rad = 0.5 + r() * 1.2; g.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.14})`; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,245,225,0.08)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, rad * 0.7, 0, 6.3); g.fill(); }
            for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, l = 20 + r() * 40; g.strokeStyle = `rgba(30,18,6,${0.1 + r() * 0.14})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 14, x + l, y + (r() - 0.5) * 10); g.stroke(); }
            g.strokeStyle = 'rgba(20,10,0,0.5)'; g.lineWidth = 2.2; g.setLineDash([5, 4]); g.strokeRect(10, 14, S - 20, S - 28); g.strokeStyle = '#e8d8a8'; g.lineWidth = 1.5; g.strokeRect(9.5, 13.5, S - 19, S - 27); g.setLineDash([]); // a stitched line
        }, seed);
        // a gold embroidery band on velvet: stars, moons, runes between two stitched lines
        const embroidery = (bg, seed, motif) => canvas(512, 96, (g, W, H, r) => {
            g.fillStyle = bg; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 1600; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,235,255,${0.04 + r() * 0.08})` : `rgba(0,0,0,${0.06 + r() * 0.1})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
            const thread = (fn) => { g.save(); g.translate(1.2, 1.4); g.strokeStyle = g.fillStyle = 'rgba(40,20,0,0.65)'; fn(); g.restore(); g.strokeStyle = g.fillStyle = '#e8c25a'; fn(); g.save(); g.translate(-0.7, -0.8); g.strokeStyle = g.fillStyle = 'rgba(255,244,190,0.75)'; g.lineWidth = 0.9; fn(); g.restore(); };
            for (const y of [8, H - 8, 15, H - 15]) thread(() => { g.lineWidth = y < 12 || y > H - 12 ? 2.6 : 1.4; g.setLineDash(y < 12 || y > H - 12 ? [] : [5, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); });
            const star = (cx, cy, R, n) => thread(() => { g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * 6.283 - 1.57, rr = i % 2 ? R * 0.42 : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.stroke(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; });
            const moon = (cx, cy, R) => thread(() => { g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0.6, 5.7); g.arc(cx + R * 0.45, cy, R * 0.8, 5.2, 1.1, true); g.closePath(); g.stroke(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; });
            const rune = (cx, cy, h, k) => thread(() => { g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - h); g.lineTo(cx, cy + h); if (k === 0) { g.moveTo(cx, cy - h); g.lineTo(cx + h * 0.6, cy - h * 0.2); } else if (k === 1) { g.moveTo(cx - h * 0.5, cy + h * 0.2); g.lineTo(cx, cy - h * 0.5); g.lineTo(cx + h * 0.5, cy + h * 0.2); } else if (k === 2) { g.moveTo(cx - h * 0.5, cy - h * 0.3); g.lineTo(cx + h * 0.5, cy + h * 0.3); } else { g.moveTo(cx - h * 0.5, cy); g.lineTo(cx + h * 0.5, cy); } g.stroke(); });
            const flame = (cx, cy, h) => thread(() => { g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx, cy + h); g.bezierCurveTo(cx - h * 0.9, cy + h * 0.2, cx - h * 0.2, cy - h * 0.2, cx, cy - h); g.bezierCurveTo(cx + h * 0.1, cy - h * 0.2, cx + h * 0.9, cy + h * 0.2, cx, cy + h); g.stroke(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; });
            const step = 64;
            for (let i = 0; i < W / step; i++) {
                const cx = i * step + step / 2, cy = H / 2;
                if (motif === 'star') { if (i % 2) moon(cx, cy, 15); else star(cx, cy, 17, 8); for (const d of [-1, 1]) rune(cx + d * 32, cy, 9, (i + (d > 0 ? 1 : 0)) % 4); }
                else if (motif === 'flame') { flame(cx, cy, i % 2 ? 15 : 19); thread(() => { g.beginPath(); g.arc(cx + 32, cy, 3.2, 0, 6.3); g.fill(); }); }
                else { star(cx, cy, 14, 5); thread(() => { g.lineWidth = 1.6; g.beginPath(); g.arc(cx + 32, cy, 6, 0, 6.3); g.stroke(); }); }
            }
        }, seed);

        // ---------- shared pieces
        const std = (o) => new THREE.MeshStandardMaterial(o);
        const lam = (o) => new THREE.MeshLambertMaterial(o);
        const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
        const R = (r, a, b) => a + r * (b - a);
        // a body of revolution with folds: radius per height and a fold ripple around
        const folded = (profile, folds, depth, seg = 72, rows = 28, seed = 1) => {
            const g = new THREE.CylinderGeometry(1, 1, 1, seg, rows, true), p = g.attributes.position, r = rng(seed);
            const ph = Array.from({ length: 5 }, () => r() * 6.28);
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y + 0.5; // t 0 bottom … 1 top
                const [rad, yy] = profile(t);
                const fold = 1 + depth * (1 - t * 0.7) * (Math.sin(a * folds + ph[0]) * 0.6 + Math.sin(a * (folds * 2 + 1) + ph[1]) * 0.25 + Math.sin(a * 3 + ph[2]) * 0.4);
                p.setXYZ(i, Math.cos(a) * rad * fold, yy, Math.sin(a) * rad * fold);
            }
            g.computeVertexNormals();
            return g;
        };
        const add = (grp, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); grp.add(m); return m; };
        const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
        const gold = std({ color: 0xe0b43c, metalness: 0.85, roughness: 0.32 });

        // ---------- one mage: a mannequin 3.5 m tall in his clothes
        const mage = (o) => {
            const G = new THREE.Group();
            const woolMat = (c, rx = 3, ry = 4) => lam({ color: c, map: rep(wool(o.seed), rx, ry) });
            const body = woolMat(o.cloth), dark = woolMat(new THREE.Color(o.cloth).multiplyScalar(0.7).getHex(), 3, 2);
            const velvetMat = (c) => lam({ color: c, map: velvet(o.seed + 1) });
            const skin = lam({ color: 0xe0b08c }), boot = lam({ color: 0x2b1b12, map: rep(leather(o.seed + 2), 2, 2) });
            const emb = (bg, mot) => lam({ map: rep(embroidery(bg, o.seed + 3, mot), 1, 1) });
            // legs and boots (under the hem)
            for (const s of [-1, 1]) { add(G, box(0.55, 1.4, 0.6), lam({ color: 0x2c2a30 }), s * 0.32, 0.9, 0); add(G, box(0.66, 0.5, 1.0), boot, s * 0.32, 0.25, 0.14); add(G, box(0.7, 0.08, 1.04), lam({ color: 0x120a06 }), s * 0.32, 0.04, 0.14); add(G, box(0.62, 0.12, 0.62), velvetMat(0x3a2a20), s * 0.32, 0.52, 0.02); }
            // torso under the robe, arms, head
            add(G, box(1.35, 1.25, 0.75), lam({ color: 0x3a3a44 }), 0, 2.05, 0);
            const headY = 3.05;
            add(G, box(0.78, 0.82, 0.78), skin, 0, headY, 0);
            add(G, box(0.2, 0.28, 0.22), skin, 0, 2.62, 0);
            for (const s of [-1, 1]) { add(G, box(0.12, 0.1, 0.04), lam({ color: 0xffffff }), s * 0.2, headY + 0.08, 0.4); add(G, box(0.07, 0.07, 0.04), lam({ color: o.eye }), s * 0.2, headY + 0.08, 0.42); add(G, box(0.2, 0.05, 0.05), lam({ color: o.hair }), s * 0.2, headY + 0.2, 0.41); }
            add(G, box(0.12, 0.2, 0.14), skin, 0, headY - 0.06, 0.45);
            if (o.beard) { const b = add(G, new THREE.ConeGeometry(0.46, 1.5, 9), lam({ color: o.hair, map: rep(wool(o.seed + 9), 1, 2) }), 0, headY - 0.85, 0.28, 0.08, 0, 0); b.scale.set(1, 1, 0.55); add(G, box(0.66, 0.2, 0.12), lam({ color: o.hair }), 0, headY - 0.2, 0.42); }
            else add(G, box(0.84, 0.26, 0.84), lam({ color: o.hair }), 0, headY + 0.34, -0.04);
            // the robe: a long skirt of heavy wool with folds, a hem band of embroidery
            const skirt = folded((t) => [1.0 - 0.4 * t ** 0.8 + 0.0, 0.1 + t * 2.15], 11, 0.05, 72, 28, o.seed);
            const sk = new THREE.Mesh(skirt, body); sk.scale.set(1, 1, 0.88); G.add(sk); sk.material = body.clone(); sk.material.side = THREE.DoubleSide;
            const hem = new THREE.Mesh(folded((t) => [1.0 + 0.005, 0.1 + t * 0.34], 11, 0.05, 72, 3, o.seed), emb(o.velvet, o.motif)); hem.scale.set(1.012, 1, 0.892); hem.material.side = THREE.DoubleSide; G.add(hem);
            for (const y of [0.1, 0.44]) { const tp = add(G, new THREE.TorusGeometry(1.0, 0.025, 6, 72), gold, 0, y, 0, Math.PI / 2); tp.scale.set(1.012, 0.892, 1); } // gold piping on the hem band
            // the chest part: a bodice with a deep V and a collar
            const bodice = new THREE.Mesh(folded((t) => [0.7 + 0.1 * Math.sin(t * 3.1), 1.95 + t * 0.7], 9, 0.02, 48, 8, o.seed + 4), body); bodice.scale.set(1, 1, 0.64); bodice.material = body.clone(); bodice.material.side = THREE.DoubleSide; G.add(bodice);
            for (const s of [-1, 1]) { const lap = add(G, box(0.36, 1.0, 0.06), velvetMat(o.velvet), s * 0.24, 2.2, 0.5, 0, 0, s * 0.18); lap.rotation.z = -s * 0.16; add(G, box(0.05, 1.0, 0.075), gold, s * 0.4, 2.2, 0.53, 0, 0, -s * 0.16); } // lapels with a gold edge
            const collar = new THREE.Mesh(folded((t) => [0.42 + 0.3 * t, 2.62 + t * 0.32], 7, 0.04, 32, 4, o.seed + 5), velvetMat(o.velvet)); collar.scale.set(1, 1, 0.9); collar.material = collar.material.clone(); collar.material.side = THREE.DoubleSide; G.add(collar);
            // belt: leather with a buckle, a pouch, a vial, a hanging rune charm
            const lea = lam({ color: 0x4a2c18, map: rep(leather(o.seed + 6), 6, 1) });
            const belt = add(G, new THREE.TorusGeometry(0.74, 0.1, 6, 40), lea, 0, 1.74, 0, Math.PI / 2); belt.scale.set(1, 0.84, 1);
            add(G, box(0.34, 0.3, 0.07), gold, 0, 1.74, 0.64); add(G, box(0.2, 0.17, 0.09), lam({ color: 0x2a1a10 }), 0, 1.74, 0.66);
            add(G, box(0.42, 0.42, 0.22), lam({ color: 0x5a3a20, map: rep(leather(o.seed + 7), 1, 1) }), 0.66, 1.52, 0.38, 0, -0.55, 0); add(G, box(0.45, 0.14, 0.25), lam({ color: 0x3a2412, map: rep(leather(o.seed + 7), 1, 1) }), 0.66, 1.72, 0.38, 0, -0.55, 0);
            add(G, new THREE.CylinderGeometry(0.09, 0.12, 0.34, 10), lam({ color: o.vial, transparent: true, opacity: 0.85, emissive: o.vial, emissiveIntensity: 0.5 }), -0.7, 1.5, 0.36, 0, 0, 0.05); add(G, new THREE.CylinderGeometry(0.06, 0.07, 0.09, 8), lam({ color: 0x8a6a3a }), -0.7, 1.7, 0.36);
            add(G, new THREE.OctahedronGeometry(0.1), gold, 0.0, 1.38, 0.66);
            // sleeves: bell sleeves lined with velvet, a cuff band, a hand
            for (const s of [-1, 1]) {
                const arm = new THREE.Group(); arm.position.set(s * 0.86, 2.55, 0); arm.rotation.z = s * 0.34; arm.rotation.x = -0.1; G.add(arm);
                const sl = new THREE.Mesh(folded((t) => [0.3 + 0.42 * (1 - t) ** 1.3, -1.45 + t * 1.5], 6, 0.07, 28, 14, o.seed + 10 + s), body); sl.material = body.clone(); sl.material.side = THREE.DoubleSide; arm.add(sl);
                const cuff = new THREE.Mesh(folded((t) => [0.72 + 0.005, -1.45 + t * 0.3], 6, 0.07, 28, 2, o.seed + 10 + s), emb(o.velvet, o.motif)); cuff.material.side = THREE.DoubleSide; cuff.scale.set(1.01, 1, 1.01); arm.add(cuff);
                add(arm, new THREE.TorusGeometry(0.72, 0.022, 6, 28), gold, 0, -1.45, 0, Math.PI / 2);
                add(arm, new THREE.CylinderGeometry(0.64, 0.6, 0.05, 28), velvetMat(0x20101c), 0, -1.45, 0); // the dark lining seen under the hem
                add(arm, box(0.34, 0.5, 0.3), skin, 0, -1.55, 0); add(arm, box(0.12, 0.2, 0.12), skin, s * 0.18, -1.72, 0.1);
            }
            // a cape on the back (some mages): heavy, with a gold clasp
            if (o.cape) { const cp = new THREE.Mesh(folded((t) => [1.0 + 0.55 * (1 - t), 0.05 + t * 3.4], 9, 0.06, 40, 24, o.seed + 20), velvetMat(o.cape)); cp.material.side = THREE.DoubleSide; cp.rotation.y = 0; cp.scale.set(1, 1, 0.7); cp.position.z = -0.45; G.add(cp); const m = cp.geometry; const p = m.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > -0.1 * 0) { /* keep */ } } cp.visible = false; for (const s of [-1, 1]) add(G, new THREE.SphereGeometry(0.13, 10, 8), gold, s * 0.52, 3.3, 0.35); add(G, new THREE.TorusGeometry(0.4, 0.03, 6, 16, 3.14), gold, 0, 3.33, 0.38, 0, 0, Math.PI); const back = add(G, box(1.5, 2.9, 0.08), velvetMat(o.cape), 0, 1.9, -0.5); back.rotation.x = 0.06; add(G, box(2.04, 0.1, 0.1), gold, 0, 0.4, -0.52); }
            // the hat: a wide wavy brim, a tall cone with a bend, a band with a buckle, a charm
            const hatY = headY + 0.5;
            const brimG = new THREE.CylinderGeometry(1.35, 1.4, 0.06, 56, 1); { const p = brimG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z), a = Math.atan2(z, x); p.setY(i, p.getY(i) + (rr > 0.6 ? (rr - 0.6) * (Math.sin(a * 3 + 0.6) * 0.1 - 0.06) : 0)); } brimG.computeVertexNormals(); }
            const hatMat = woolMat(o.hat, 2, 2);
            add(G, brimG, hatMat, 0, hatY, 0, 0.04, 0, 0.03);
            const cone = new THREE.ConeGeometry(0.62, o.hatH, 36, 20, true); { const p = cone.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = (y + o.hatH / 2) / o.hatH; p.setX(i, p.getX(i) + t * t * 0.9); p.setY(i, y - t * t * 0.28); } cone.computeVertexNormals(); }
            const cm = hatMat.clone(); cm.side = THREE.DoubleSide; add(G, cone, cm, -0.05, hatY + o.hatH / 2, 0);
            add(G, new THREE.CylinderGeometry(0.64, 0.7, 0.26, 36, 1, true), emb(o.velvet, o.motif), 0, hatY + 0.16, 0).material.side = THREE.DoubleSide;
            add(G, new THREE.TorusGeometry(0.67, 0.02, 6, 36), gold, 0, hatY + 0.03, 0, Math.PI / 2); add(G, new THREE.TorusGeometry(0.64, 0.02, 6, 36), gold, 0, hatY + 0.29, 0, Math.PI / 2);
            add(G, box(0.3, 0.3, 0.06), gold, 0, hatY + 0.16, 0.66); add(G, box(0.16, 0.16, 0.08), lam({ color: o.gem, emissive: o.gem, emissiveIntensity: 0.6 }), 0, hatY + 0.16, 0.68);
            add(G, new THREE.SphereGeometry(0.1, 10, 8), gold, 0.85 + 0.05, hatY + o.hatH - 0.28 - 0.32, 0);
            return G;
        };

        // ---------- three mages
        const outfits = [
            { seed: 11, cloth: 0x6a7a96, velvet: '#3a2a52', hat: 0x56637e, hatH: 2.4, motif: 'star', hair: 0x8a5a30, eye: 0x2a6a9a, vial: 0x6bd0ff, gem: 0x4f8cff, beard: false },
            { seed: 23, cloth: 0x2a3f78, velvet: '#1a1038', hat: 0x1f2e62, hatH: 3.0, motif: 'star', hair: 0xe8e4dc, eye: 0x5a8aff, vial: 0xc9a0ff, gem: 0xd02050, beard: true, cape: 0x2a1250 },
            { seed: 37, cloth: 0x8a2a20, velvet: '#2a0e10', hat: 0x6a1c18, hatH: 2.7, motif: 'flame', hair: 0x1c1410, eye: 0xff9a3a, vial: 0xff7a30, gem: 0xffa030, beard: false },
        ];
        const W = 1600, H = 900;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.shadowMap.enabled = true;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2e3340);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x554433, 0.85));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(-6, 10, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -3, far: 40 }); scene.add(sun);
        const rim = new THREE.DirectionalLight(0x8ab0ff, 0.5); rim.position.set(7, 4, -6); scene.add(rim);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        outfits.forEach((o, i) => { const m = mage(o); m.position.set((i - 1) * 4.6, 0, 0); m.rotation.y = (i - 1) * -0.18; m.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } }); scene.add(m); });
        const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100); cam.position.set(0, 3.4, 20); cam.lookAt(0, 2.5, 0);
        r.render(scene, cam);
        return cv.toDataURL('image/png');
    });
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log('written', out);
} finally { clearTimeout(timer); await browser.close(); srv.close?.(); }
