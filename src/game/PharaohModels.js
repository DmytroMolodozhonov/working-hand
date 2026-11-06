/**
 * PharaohModels.js — what the pyramids' life is drawn with (docs/rules/texture-style.md: pictures made on a canvas once, shared shapes, nothing flat):
 * the plain stone sarcophagus of a sleeping mummy (painted lid: a face mask, a collar, bandage bands, hieroglyph columns; a frieze on its sides), the great
 * golden sarcophagus of the pharaoh (gold, lapis, a mask, crossed arms with a crook and a flail), the pharaoh's look (a striped nemes headdress, a broad
 * collar, a braided false beard, his staff), the looks of the mummies and of the skeleton-mummies (the black ship's skeletons in bandages), a locust, a dart.
 * Shapes, pictures and materials are built once and shared (`userData.shared`); the Node tests run them without a canvas (the pictures are then null).
 */
import * as THREE from 'three';
import { villagerLook } from '../entities/VillagerModel.js';

const _tex = {};
const _geo = {};
const _mat = {};
function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function canvasTex(name, W, H, draw) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return (_tex[name] = null);
    draw(g, W, H, rng(name.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 17)));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData = { keep: true };
    return (_tex[name] = t);
}
const shared = (o) => { o.userData = { ...(o.userData || {}), shared: true, keep: true }; return o; };
const geo = (k, make) => _geo[k] || (_geo[k] = shared(make()));

// ------------------------------------------------------------------ the pictures
/** The lid of a sarcophagus: u across the lid, v along it (0 the head … 1 the feet). `gold`: the great one — gold ground, lapis and turquoise inlay. */
function lidPicture(gold) {
    return canvasTex(gold ? 'sarc-lid-gold' : 'sarc-lid', 256, 512, (g, W, H, r) => {
        const ground = gold ? ['#f0c649', '#d9a52a', '#b4801c'] : ['#cdbb8a', '#b8a272', '#8f7c52'];
        const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, ground[2]); lg.addColorStop(0.5, ground[0]); lg.addColorStop(1, ground[2]);
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 2400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,190,0.08)' : 'rgba(80,50,10,0.09)'; g.fillRect(r() * W, r() * H, 1.4, 1.4); }
        const stripe = (y0, y1, cols) => { const n = cols.length, w = W / n; for (let i = 0; i < n; i++) { g.fillStyle = cols[i]; g.fillRect(i * w, y0, w + 0.5, y1 - y0); } };
        // the head: a face mask (gold oval, kohl eyes, a mouth) under a striped nemes
        const cx = W / 2;
        g.fillStyle = gold ? '#7ea6ff' : '#2f56a8'; g.beginPath(); g.moveTo(cx - 92, 0); g.lineTo(cx + 92, 0); g.lineTo(cx + 104, 150); g.lineTo(cx - 104, 150); g.fill();
        for (let k = 0; k < 11; k++) { g.fillStyle = k % 2 ? (gold ? '#f0c649' : '#d8b04a') : (gold ? '#27408a' : '#1f3a7a'); g.fillRect(cx - 100 + k * 18, 0, 9, 150); }
        const face = g.createRadialGradient(cx, 78, 6, cx, 78, 62); face.addColorStop(0, gold ? '#ffe07a' : '#e0c27a'); face.addColorStop(1, gold ? '#c9961f' : '#a98a4a');
        g.fillStyle = face; g.beginPath(); g.ellipse(cx, 80, 48, 62, 0, 0, 7); g.fill();
        g.strokeStyle = '#1a1208'; g.lineWidth = 5; g.lineCap = 'round';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 12, 70); g.quadraticCurveTo(cx + s * 26, 60, cx + s * 40, 68); g.stroke(); g.beginPath(); g.moveTo(cx + s * 38, 68); g.lineTo(cx + s * 52, 76); g.stroke(); g.beginPath(); g.moveTo(cx + s * 14, 54); g.lineTo(cx + s * 42, 52); g.stroke(); }
        g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 12, 108); g.quadraticCurveTo(cx, 114, cx + 12, 108); g.stroke();
        g.fillStyle = '#7a1a14'; g.fillRect(cx - 5, 80, 10, 14);
        // the collar: rows of beads (lapis, turquoise, red, gold), a half-ring on the chest
        for (let k = 0; k < 5; k++) { const cols = k % 2 ? ['#27408a', '#2aa89a', '#27408a', '#d8a82a'] : ['#2aa89a', '#a63a28', '#f0c649', '#a63a28']; const y0 = 154 + k * 12; for (let x = 10; x < W - 10; x += 12) { g.fillStyle = cols[(x / 12) % 4 | 0]; g.beginPath(); g.ellipse(x + 6, y0 + 5 + Math.abs(x - cx) * 0.05, 5, 5, 0, 0, 7); g.fill(); } }
        // the arms (gold): crossed on the chest with a crook and a flail
        g.fillStyle = gold ? '#fff0a0' : '#d8c27a'; g.fillRect(cx - 80, 228, 70, 22); g.fillRect(cx + 10, 228, 70, 22);
        g.strokeStyle = '#27408a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 70, 236); g.lineTo(cx + 78, 262); g.moveTo(cx + 70, 236); g.lineTo(cx - 78, 262); g.stroke();
        // the body: bandage bands and a column of hieroglyphs on each side
        stripe(278, 296, ['#a63a28', '#f0c649', '#27408a', '#f0c649']);
        for (let y = 300; y < 470; y += 14) { stripe(y, y + 3, [gold ? '#7a4f08' : '#6a5630']); }
        for (const x0 of [26, W - 58]) for (let y = 304; y < 460; y += 26) { g.strokeStyle = '#1a1a3a'; g.lineWidth = 3; g.beginPath(); const k = (y / 26 | 0) % 4; if (k === 0) { g.arc(x0 + 16, y + 8, 8, 0, 7); } else if (k === 1) { g.moveTo(x0, y); g.lineTo(x0 + 32, y + 16); g.moveTo(x0 + 32, y); g.lineTo(x0, y + 16); } else if (k === 2) { g.moveTo(x0 + 16, y); g.lineTo(x0 + 16, y + 18); g.moveTo(x0 + 4, y + 6); g.lineTo(x0 + 28, y + 6); } else { g.moveTo(x0, y + 16); g.lineTo(x0 + 16, y); g.lineTo(x0 + 32, y + 16); } g.stroke(); }
        // the feet: a panel with two sandals and a red band
        stripe(486, 512, ['#a63a28', '#f0c649']);
        // wear: scratches, a chip or two
        for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(60,40,10,${0.1 + r() * 0.15})`; g.lineWidth = 1; const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 20, y + r() * 14); g.stroke(); }
    });
}
/** A sarcophagus' side: a frieze of pictograms between bands, along the length. */
function sidePicture(gold) {
    return canvasTex(gold ? 'sarc-side-gold' : 'sarc-side', 512, 128, (g, W, H, r) => {
        g.fillStyle = gold ? '#d9a52a' : '#b8a272'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,190,0.08)' : 'rgba(80,50,10,0.1)'; g.fillRect(r() * W, r() * H, 1.4, 1.4); }
        const band = (y0, y1, c1, c2) => { for (let x = 0; x < W; x += 16) { g.fillStyle = (x / 16) % 2 ? c1 : c2; g.fillRect(x, y0, 16, y1 - y0); } };
        band(0, 14, '#27408a', '#2aa89a'); band(14, 20, '#f0c649', '#f0c649'); band(H - 20, H - 14, '#f0c649', '#f0c649'); band(H - 14, H, '#a63a28', '#27408a');
        g.strokeStyle = '#1a1a3a'; g.lineWidth = 3.4; g.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
            const x = 28 + i * 54, y = 50, k = i % 3;
            g.beginPath();
            if (k === 0) { g.ellipse(x, y + 6, 14, 8, 0, 0, 7); g.moveTo(x - 20, y + 16); g.lineTo(x + 20, y + 16); } // an eye of Horus
            else if (k === 1) { g.arc(x, y - 2, 8, 0, 7); g.moveTo(x, y + 6); g.lineTo(x, y + 30); g.moveTo(x - 12, y + 14); g.lineTo(x + 12, y + 14); } // an ankh
            else { g.moveTo(x - 14, y + 30); g.lineTo(x, y - 6); g.lineTo(x + 14, y + 30); g.moveTo(x - 8, y + 10); g.lineTo(x + 8, y + 10); } // a pyramid
            g.stroke();
        }
    });
}
/** The nemes' cloth (gold and lapis bands across, u across the cloth, v down it): woven threads, a fold line at every band, soft shade at the edges, a darker hem. */
function nemesPicture() {
    return canvasTex('nemes', 256, 256, (g, W, H, r) => {
        const BAND = 32;
        for (let y = 0; y < H; y += BAND) {
            const gold = (y / BAND) % 2 === 0;
            const gr = g.createLinearGradient(0, y, 0, y + BAND);
            if (gold) { gr.addColorStop(0, '#f0c443'); gr.addColorStop(0.55, '#d9a424'); gr.addColorStop(1, '#a87818'); }
            else { gr.addColorStop(0, '#2a4aa6'); gr.addColorStop(0.55, '#1c3787'); gr.addColorStop(1, '#10215a'); }
            g.fillStyle = gr; g.fillRect(0, y, W, BAND);
            g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, y, W, 1); // (the fold's light edge)
            g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + BAND - 2, W, 2); // (and its shadow)
        }
        g.globalAlpha = 0.16; // woven threads: fine lines both ways
        for (let x = 0; x < W; x += 2) { g.fillStyle = x % 4 ? '#000' : '#fff'; g.fillRect(x, 0, 1, H); }
        for (let y = 0; y < H; y += 2) { g.fillStyle = y % 4 ? '#000' : '#fff'; g.fillRect(0, y, W, 1); }
        g.globalAlpha = 1;
        for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,240,190,0.14)'; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1); } // (slubs)
        for (let i = 0; i < 6; i++) { // age stains
            const x = r() * W, y = r() * H, rad = 14 + r() * 26, rg = g.createRadialGradient(x, y, 1, x, y, rad);
            rg.addColorStop(0, 'rgba(70,45,10,0.28)'); rg.addColorStop(1, 'rgba(70,45,10,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        const eg = g.createLinearGradient(0, 0, W, 0); // soft shade at the side edges (the cloth turns away)
        eg.addColorStop(0, 'rgba(0,0,0,0.35)'); eg.addColorStop(0.12, 'rgba(0,0,0,0)'); eg.addColorStop(0.88, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.fillStyle = eg; g.fillRect(0, 0, W, H);
        g.fillStyle = '#6a4a12'; g.fillRect(0, H - 6, W, 6); g.fillStyle = '#e8b830'; g.fillRect(0, H - 6, W, 1); // the hem
    });
}
/** Old linen: woven threads, long pleats (light and shade), stains, a gold-and-lapis hem; u across, v down. `pleat`: the number of pleats across. */
function linenPicture(name, pleat, hem) {
    return canvasTex(name, 256, 256, (g, W, H, r) => {
        g.fillStyle = '#ece3c6'; g.fillRect(0, 0, W, H);
        const pw = W / pleat;
        for (let i = 0; i < pleat; i++) { // each pleat: a light ridge, a shadow in the fold
            const x = i * pw, gr = g.createLinearGradient(x, 0, x + pw, 0);
            gr.addColorStop(0, 'rgba(90,70,30,0.30)'); gr.addColorStop(0.18, 'rgba(255,250,225,0.18)'); gr.addColorStop(0.75, 'rgba(120,95,45,0.10)'); gr.addColorStop(1, 'rgba(70,50,20,0.34)');
            g.fillStyle = gr; g.fillRect(x, 0, pw, H);
        }
        g.globalAlpha = 0.10;
        for (let x = 0; x < W; x += 2) { g.fillStyle = x % 4 ? '#5a4520' : '#fff'; g.fillRect(x, 0, 1, H); }
        for (let y = 0; y < H; y += 2) { g.fillStyle = y % 4 ? '#5a4520' : '#fff'; g.fillRect(0, y, W, 1); }
        g.globalAlpha = 1;
        for (let i = 0; i < 1100; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,60,25,0.16)' : 'rgba(255,255,240,0.18)'; g.fillRect(r() * W, r() * H, 1 + r() * 4, 1); } // (slubs, a thread out of line)
        for (let i = 0; i < 9; i++) { // yellowed stains and a sand-dust dusk toward the hem
            const x = r() * W, y = r() * H * 0.9, rad = 10 + r() * 30, rg = g.createRadialGradient(x, y, 1, x, y, rad);
            rg.addColorStop(0, 'rgba(120,85,30,0.26)'); rg.addColorStop(1, 'rgba(120,85,30,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        const dg = g.createLinearGradient(0, H * 0.5, 0, H); dg.addColorStop(0, 'rgba(150,115,60,0)'); dg.addColorStop(1, 'rgba(150,115,60,0.35)'); g.fillStyle = dg; g.fillRect(0, H * 0.5, W, H * 0.5);
        if (hem) { // the hem: gold band, a lapis zigzag, the fringe
            g.fillStyle = '#c89a2a'; g.fillRect(0, H - 30, W, 10);
            g.fillStyle = '#e8c860'; g.fillRect(0, H - 30, W, 2);
            for (let x = 0; x < W; x += 16) { g.fillStyle = '#1f3a8a'; g.beginPath(); g.moveTo(x, H - 20); g.lineTo(x + 8, H - 6); g.lineTo(x + 16, H - 20); g.closePath(); g.fill(); g.fillStyle = '#2aa89a'; g.fillRect(x + 6, H - 14, 4, 4); }
            g.fillStyle = 'rgba(60,40,10,0.45)'; for (let x = 0; x < W; x += 3) g.fillRect(x, H - 6, 1, 6);
        }
    });
}
/** The broad collar (usekh): rows of beads — lapis, turquoise, gold, carnelian — and a fringe of teardrops; u around, v from the neck (0) down (1). */
function collarPicture() {
    return canvasTex('usekh', 512, 128, (g, W, H, r) => {
        g.fillStyle = '#6a4a12'; g.fillRect(0, 0, W, H);
        const rows = [['#e0a82a', 12], ['#1f3a8a', 14], ['#2aa89a', 14], ['#e0a82a', 12], ['#a63a28', 14], ['#1f3a8a', 14]];
        let y = 0;
        for (const [col, h] of rows) {
            for (let x = 0; x < W; x += h * 0.8) {
                const cx = x + h * 0.4, cy = y + h / 2, rg = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, h * 0.55);
                rg.addColorStop(0, '#fff6c8'); rg.addColorStop(0.35, col); rg.addColorStop(1, 'rgba(0,0,0,0.65)');
                g.fillStyle = rg; g.beginPath(); g.ellipse(cx, cy, h * 0.4, h * 0.5, 0, 0, 7); g.fill();
            }
            y += h;
        }
        for (let x = 0; x < W; x += 14) { // the fringe of teardrops
            const col = ['#a63a28', '#2aa89a', '#e0a82a', '#1f3a8a'][(x / 14) & 3];
            g.fillStyle = '#4a3208'; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 13, y); g.lineTo(x + 7, H); g.closePath(); g.fill();
            g.fillStyle = col; g.beginPath(); g.moveTo(x + 3, y); g.lineTo(x + 11, y); g.lineTo(x + 7, H - 3); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 4, y + 1, 2, 7);
        }
    });
}
/** The braided false beard: two strands crossing (lapis and gold), a bright thread on each ridge; u across, v down. */
function beardPicture() {
    return canvasTex('fbeard', 64, 256, (g, W, H) => {
        g.fillStyle = '#10215a'; g.fillRect(0, 0, W, H);
        for (let y = -16; y < H; y += 16) for (const [x0, col] of [[0, '#1f3a8a'], [W / 2, '#d9a424']]) {
            g.fillStyle = col; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + W / 2, y + 8); g.lineTo(x0 + W / 2, y + 20); g.lineTo(x0, y + 12); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(255,240,170,0.5)'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + W / 2, y + 8); g.stroke();
            g.strokeStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(x0, y + 12); g.lineTo(x0 + W / 2, y + 20); g.stroke();
        }
        g.fillStyle = '#e8c860'; g.fillRect(0, H - 22, W, 6); g.fillStyle = '#a87818'; g.fillRect(0, H - 16, W, 16); // the curled tip's gold cap
    });
}
/** Hammered gold with lapis and carnelian inlay — the belt: a plaque with a scarab, a lapis-and-turquoise border. */
function goldPicture() {
    return canvasTex('pharaoh-gold', 256, 64, (g, W, H, r) => {
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#f6d56a'); gr.addColorStop(0.5, '#d9a424'); gr.addColorStop(1, '#8a5e10'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,50,0,0.18)' : 'rgba(255,245,180,0.24)'; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 2.2, 0, 7); g.fill(); } // (hammer dimples)
        for (let x = 4; x < W; x += 12) { g.fillStyle = (x / 12) & 1 ? '#1f3a8a' : '#2aa89a'; g.fillRect(x, 3, 8, 7); g.fillRect(x, H - 10, 8, 7); }
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1);
        const cx = W / 2; // a scarab: body, wings, a sun disc
        g.fillStyle = '#1f3a8a'; g.beginPath(); g.ellipse(cx, H / 2, 11, 14, 0, 0, 7); g.fill();
        g.strokeStyle = '#e8c860'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx, H - 14); g.moveTo(cx - 30, H / 2); g.quadraticCurveTo(cx - 14, H / 2 - 16, cx - 10, H / 2); g.moveTo(cx + 30, H / 2); g.quadraticCurveTo(cx + 14, H / 2 - 16, cx + 10, H / 2); g.stroke();
        g.fillStyle = '#a63a28'; g.beginPath(); g.arc(cx, 11, 5, 0, 7); g.fill();
    });
}
/** The face of a dried king, a transparent skin to lay on the face: cracks, hollow shadows under the eyes and temples, kohl with long wings, lips, grey bandage fibres at the jaw. */
function facePicture() {
    return canvasTex('pharaoh-face', 256, 256, (g, W, H, r) => {
        g.clearRect(0, 0, W, H);
        const shade = (x, y, rx, ry, a) => { const rg = g.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry)); rg.addColorStop(0, `rgba(40,25,10,${a})`); rg.addColorStop(1, 'rgba(40,25,10,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = rg; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 7); g.fill(); g.restore(); };
        for (const sx of [-1, 1]) { shade(W / 2 + sx * 58, H * 0.5, 30, 18, 0.5); shade(W / 2 + sx * 100, H * 0.52, 22, 40, 0.35); shade(W / 2 + sx * 62, H * 0.78, 34, 26, 0.3); } // under the eyes, temples, cheeks
        for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,25,10,0.10)' : 'rgba(255,230,180,0.07)'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); } // (pores)
        g.strokeStyle = 'rgba(30,18,6,0.5)'; g.lineWidth = 1;
        for (let i = 0; i < 26; i++) { // cracks of dry skin
            let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
            for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 22; y += (r() - 0.3) * 16; g.lineTo(x, y); }
            g.stroke();
        }
        g.fillStyle = 'rgba(10,8,4,0.85)'; // kohl: a heavy line over each eye, a long wing outward
        for (const sx of [-1, 1]) {
            const cx = W / 2 + sx * 58, cy = H * 0.43;
            g.beginPath(); g.moveTo(cx - sx * 36, cy + 10); g.lineTo(cx + sx * 36, cy + 4); g.lineTo(cx + sx * 76, cy + 16); g.lineTo(cx + sx * 36, cy + 14); g.lineTo(cx - sx * 36, cy + 20); g.closePath(); g.fill();
            g.fillRect(cx - 34, cy + 36, 68, 4); // under-line
        }
        g.fillStyle = 'rgba(90,40,30,0.55)'; g.beginPath(); g.ellipse(W / 2, H * 0.84, 26, 6, 0, 0, 7); g.fill(); // dry lips
        g.strokeStyle = 'rgba(200,190,160,0.45)'; for (let i = 0; i < 24; i++) { const x = r() * W, y = H * 0.9 + r() * H * 0.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + 14); g.stroke(); } // bandage fibres
    });
}

// ------------------------------------------------------------------ materials
function stoneMat(gold, which) {
    const k = (gold ? 'g' : 'p') + which;
    if (_mat[k]) return _mat[k];
    const map = which === 'lid' ? lidPicture(gold) : sidePicture(gold);
    const m = gold
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.3, metalness: 0.7, emissive: 0x4a3000, emissiveIntensity: 0.4 })
        : new THREE.MeshLambertMaterial({ color: 0xffffff, map });
    return (_mat[k] = shared(m));
}
const plainMat = (c, k) => _mat[k] || (_mat[k] = shared(new THREE.MeshLambertMaterial({ color: c })));

/**
 * A sarcophagus: a base and a lid that opens (`userData.lid`, a Group whose origin is the lid's hinge at the base's top edge: open it with position.x / rotation.z).
 * plain: 1.9 × 4.4 m; gold (the pharaoh's): 2.6 × 5.8 m with a mask, jewels and a gold-and-lapis foot. `userData.top`: the height of the base (the mummy lies in it).
 */
export function sarcophagusModel(gold = false) {
    const W = gold ? 2.5 : 1.8, Hh = gold ? 1.5 : 1.05, Lg = gold ? 5.8 : 4.3;
    const g = new THREE.Group();
    g.name = gold ? 'goldSarcophagus' : 'sarcophagus';
    const base = new THREE.Mesh(geo('sarcBase' + gold, () => {
        const b = new THREE.BoxGeometry(W, Hh, Lg);
        // (uv for the frieze along the length: the side faces' u runs along z)
        return b;
    }), [stoneMat(gold, 'side'), stoneMat(gold, 'side'), plainMat(gold ? 0xd9a52a : 0xa89468, 'top' + gold), plainMat(gold ? 0x8a5c10 : 0x6a5c3a, 'bot' + gold), stoneMat(gold, 'side'), stoneMat(gold, 'side')]);
    base.position.y = Hh / 2; base.castShadow = true;
    g.add(base);
    // a rim and four feet
    const rim = new THREE.Mesh(geo('sarcRim' + gold, () => new THREE.BoxGeometry(W + 0.14, 0.12, Lg + 0.14)), plainMat(gold ? 0xf0c649 : 0xd8c690, 'rim' + gold));
    rim.position.y = Hh + 0.04; g.add(rim);
    // the lid: an arched slab (a half-cylinder along z) painted on top; hinge at the base's near top edge
    const lid = new THREE.Group();
    lid.position.set(0, Hh + 0.1, 0);
    const arch = new THREE.Mesh(geo('sarcLid' + gold, () => {
        const c = new THREE.CylinderGeometry(W / 2, W / 2, Lg - 0.1, 20, 1, false, 0, Math.PI);
        c.rotateZ(Math.PI / 2); c.rotateY(Math.PI / 2); // (the axis along z, the arc over y)
        // uv for the lid's picture: u across the arc, v along z (0 at the head, −z)
        const P = c.getAttribute('position'), uv = c.getAttribute('uv');
        for (let i = 0; i < P.count; i++) uv.setXY(i, 0.5 + P.getX(i) / W, 1 - (P.getZ(i) + (Lg - 0.1) / 2) / (Lg - 0.1));
        return c;
    }), stoneMat(gold, 'lid'));
    arch.scale.y = gold ? 0.5 : 0.42; arch.castShadow = true;
    lid.add(arch);
    if (gold) {
        // the great one: a gold mask raised at the head, a lapis-and-gold foot, jewels
        const mask = new THREE.Mesh(geo('goldMask', () => new THREE.SphereGeometry(0.46, 16, 12)), new THREE.MeshStandardMaterial({ color: 0xffd45a, roughness: 0.25, metalness: 0.85, emissive: 0x6a4a00, emissiveIntensity: 0.5 }));
        mask.scale.set(0.9, 1.1, 0.8); mask.position.set(0, 0.62, -Lg / 2 + 0.75); lid.add(mask);
        const nem = new THREE.Mesh(geo('goldNemes', () => new THREE.CylinderGeometry(0.62, 0.78, 0.5, 14, 1, true)), new THREE.MeshStandardMaterial({ color: 0xffffff, map: nemesPicture(), roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
        nem.position.set(0, 0.36, -Lg / 2 + 0.78); nem.rotation.x = -0.55; lid.add(nem);
        for (const [x, z, c] of [[-0.35, -1.2, 0x2a4fd0], [0.35, -1.2, 0x2a4fd0], [0, -0.7, 0xc02a2a], [0, 0.4, 0x2aa89a], [-0.4, 1.4, 0x2a4fd0], [0.4, 1.4, 0x2a4fd0]]) {
            const j = new THREE.Mesh(geo('jewel', () => new THREE.SphereGeometry(0.09, 8, 6)), plainMat(c, 'jw' + c)); j.position.set(x, 0.52, z); lid.add(j);
        }
    }
    g.add(lid);
    g.userData.lid = lid; g.userData.top = Hh; g.userData.size = { w: W, h: Hh, l: Lg };
    return g;
}

// ------------------------------------------------------------------ looks
/** The pharaoh: a tall dried king in white linen, gold at the neck, eyes of a hot yellow; his staff (a gold crook) is the VillagerModel's tool `heka`. */
export function pharaohLook() {
    const L = villagerLook(2626, 'farmer', false, {}); // (a plain body: the king's gold plate and ermine would hide under the linen robe below — dressPharaoh)
    Object.assign(L, { dress: false, apron: null, coat: 0xe6dcbc, shirt: 0xe9e0c2, accent: 0xe8b830, pants: 0xe2d8b6, boots: 0x6a5a3a, hair: 'bald', hairColor: 0x1a1208, beard: 'none', hat: 'none',
        skin: 0x8a7860, eyes: 0xf0c020, tool: 'heka', crown: false });
    return L;
}
/** A sleeping mummy of a sarcophagus: the black ship's skeleton in grey-yellow bandages, a bandaged head, a rusted sword or a bronze khopesh-like axe. */
export function mummyLook(i) {
    const L = villagerLook(8100 + i * 83, 'builder', false, {});
    Object.assign(L, { skeleton: true, rags: [0xcfc19a, 0xbfb08a, 0xd8cca8][i % 3], beard: 'none', hair: 'bald', dress: false, hat: 'scarf', hatColor: [0xd4c7a2, 0xc8b88e][i % 2], tool: i % 3 === 1 ? 'axe' : 'sword' });
    return L;
}
/** A skeleton-mummy of the maze: the same, darker with age and a blue-and-gold headcloth. */
export function guardLook(i) {
    const L = villagerLook(9200 + i * 71, 'builder', false, {});
    Object.assign(L, { skeleton: true, rags: [0xb8a878, 0xa89868, 0xc4b488][i % 3], beard: 'none', hair: 'bald', dress: false, hat: 'scarf', hatColor: i % 2 ? 0x2a4a9a : 0xc89a2a, tool: i % 3 === 0 ? 'axe' : 'sword' });
    return L;
}

/**
 * The pharaoh's finery on a VillagerModel (measured from VillagerModel: the head is a 1.2 cube, its pivot at the neck, y 0…1.2, the face at z −0.6;
 * the torso 1.2 × 1.5 × 0.8 about its middle, the neck at y +0.75): a striped nemes (a cap over the brow, two lappets down the chest, a tail behind) with a gold
 * brow band and a cobra, kohl and cracks drawn on the face, a pleated linen robe and kilt with a gold-and-lapis hem, a bead collar, a gold belt with a scarab,
 * a braided false beard. Returns the meshes (for disposal). Pictures and shapes are shared.
 */
export function dressPharaoh(model) {
    const out = [];
    const head = model.head, torso = model.torso;
    const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, map, ...extra });
    const add = (parent, key, make, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(geo(key, make), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.userData.noFar = true; parent.add(m); out.push(m); return m;
    };
    const stand = (k, c, rough = 0.35, metal = 0.7) => _mat[k] || (_mat[k] = shared(new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: 0x3a2400, emissiveIntensity: 0.35 })));
    if (head) {
        const nemMat = _mat.nemesM || (_mat.nemesM = shared(lam(nemesPicture())));
        add(head, 'nemCap', () => new THREE.BoxGeometry(1.38, 0.44, 1.38), nemMat, 0, 1.17, 0.02); // the cap, over the brow
        add(head, 'nemBack', () => new THREE.BoxGeometry(1.3, 1.0, 0.16), nemMat, 0, 0.5, 0.68); // the cloth behind the head
        for (const sx of [-1, 1]) {
            add(head, 'nemLap', () => new THREE.BoxGeometry(0.26, 1.3, 0.62), nemMat, sx * 0.72, 0.25, -0.18); // the lappets: beside the face, down onto the chest
            add(head, 'nemTail', () => new THREE.BoxGeometry(0.34, 0.18, 0.22), stand('goldM', 0xe0a82a), sx * 0.72, -0.42, -0.18); // gold clasps at their ends
        }
        add(head, 'browBand', () => new THREE.BoxGeometry(1.4, 0.1, 1.4), stand('goldM', 0xe0a82a), 0, 0.99, 0.02); // the gold brow band
        add(head, 'browGem', () => new THREE.BoxGeometry(0.16, 0.16, 0.05), _mat.gemLapis || (_mat.gemLapis = shared(new THREE.MeshStandardMaterial({ color: 0x1f3a8a, roughness: 0.2, metalness: 0.3, emissive: 0x0a1a50, emissiveIntensity: 0.6 }))), 0, 0.99, -0.7, 0, 0, Math.PI / 4);
        // the uraeus: a gold cobra rearing on the brow — a body, a flared hood, a head, a lapis eye
        add(head, 'uraBody', () => new THREE.CylinderGeometry(0.06, 0.09, 0.34, 8), stand('goldM', 0xe0a82a), 0, 1.3, -0.72, -0.2, 0, 0);
        add(head, 'uraHood', () => new THREE.ConeGeometry(0.15, 0.2, 8), stand('goldM', 0xe0a82a), 0, 1.42, -0.76, Math.PI + 0.2, 0, 0).scale.set(1.2, 1, 0.45);
        add(head, 'uraHead', () => new THREE.SphereGeometry(0.075, 8, 6), stand('goldM', 0xe0a82a), 0, 1.54, -0.78);
        add(head, 'uraEye', () => new THREE.BoxGeometry(0.03, 0.03, 0.03), plainMat(0x1f3a8a, 'uraEye'), 0, 1.56, -0.85);
        // the face: cracks, kohl, hollows — a transparent skin laid on the face (under the nose and the eyes, which stand out of it)
        const fm = _mat.faceM || (_mat.faceM = shared(new THREE.MeshLambertMaterial({ color: 0xffffff, map: facePicture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        add(head, 'faceSkin', () => new THREE.PlaneGeometry(1.2, 1.2), fm, 0, 0.6, -0.604, 0, Math.PI, 0);
        // the false beard: a braided plait under the chin, curling out at the tip
        const bm = _mat.beardM || (_mat.beardM = shared(lam(beardPicture())));
        add(head, 'fbeard', () => new THREE.BoxGeometry(0.2, 0.6, 0.2), bm, 0, -0.3, -0.68, 0.12, 0, 0);
        add(head, 'fbeardTip', () => new THREE.BoxGeometry(0.26, 0.14, 0.3), stand('goldM', 0xe0a82a), 0, -0.62, -0.74, 0.4, 0, 0);
    }
    if (torso) {
        const linenA = _mat.linenA || (_mat.linenA = shared(lam(linenPicture('linen-robe', 6, false))));
        const linenB = _mat.linenB || (_mat.linenB = shared(lam(linenPicture('linen-kilt', 9, true))));
        add(torso, 'robe', () => new THREE.BoxGeometry(1.3, 1.52, 0.92), linenA, 0, 0, 0); // the robe over the chest and belly: pleats, weave, age
        add(torso, 'kilt', () => new THREE.BoxGeometry(1.2, 1.05, 0.06), linenB, 0, -1.12, -0.5); // the kilt's apron, hanging from the belt, with its hem
        const col = new THREE.Mesh(geo('usekh', () => new THREE.CylinderGeometry(0.62, 0.92, 0.52, 22, 1, true, Math.PI * 0.5, Math.PI)), lam(collarPicture(), { side: THREE.DoubleSide }));
        col.scale.set(1.05, 1, 0.62); col.position.set(0, 0.55, -0.02); col.userData.noFar = true; torso.add(col); out.push(col); // the bead collar, the front half-ring
        add(torso, 'beltGold', () => new THREE.BoxGeometry(1.36, 0.22, 0.98), lam(goldPicture()), 0, -0.62, 0);
        add(torso, 'beltBuckle', () => new THREE.BoxGeometry(0.34, 0.3, 0.05), stand('goldM', 0xe0a82a), 0, -0.62, -0.5);
    }
    return out;
}

// ------------------------------------------------------------------ small things
/** One locust (0.5 m long, drawn as a unit: body, head, two wings, long hind legs); vertex colours. The swarm draws them as one InstancedMesh. */
export function locustGeometry() {
    return geo('locust', () => {
        const pos = [], col = [], idx = [];
        const box = (cx, cy, cz, sx, sy, sz, c) => {
            const b = new THREE.BoxGeometry(sx, sy, sz); const P = b.getAttribute('position'), base = pos.length / 3;
            for (let i = 0; i < P.count; i++) { pos.push(P.getX(i) + cx, P.getY(i) + cy, P.getZ(i) + cz); col.push(c[0], c[1], c[2]); }
            for (let i = 0; i < b.index.count; i++) idx.push(base + b.index.getX(i)); b.dispose();
        };
        box(0, 0, 0, 0.09, 0.08, 0.28, [0.45, 0.5, 0.15]); box(0, 0.01, -0.17, 0.08, 0.08, 0.08, [0.4, 0.45, 0.12]);
        box(-0.07, 0.07, 0.02, 0.12, 0.012, 0.3, [0.7, 0.62, 0.3]); box(0.07, 0.07, 0.02, 0.12, 0.012, 0.3, [0.7, 0.62, 0.3]);
        box(-0.07, -0.07, 0.08, 0.02, 0.1, 0.2, [0.32, 0.3, 0.1]); box(0.07, -0.07, 0.08, 0.02, 0.1, 0.2, [0.32, 0.3, 0.1]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
    });
}
export const locustMaterial = () => _mat.locust || (_mat.locust = shared(new THREE.MeshLambertMaterial({ vertexColors: true })));
/** A dart: a thin bronze needle with a feathered end (along −z). */
export function dartGeometry() {
    return geo('dart', () => { const c = new THREE.CylinderGeometry(0.012, 0.03, 0.9, 5); c.rotateX(Math.PI / 2); return c; });
}
export const dartMaterial = () => plainMat(0xb08a4a, 'dart');
/** The sand wave's ring: a flat ring (unit radius) scaled up; additive-ish sand colour. */
export function waveRing() {
    const m = new THREE.Mesh(geo('waveRing', () => { const r = new THREE.RingGeometry(0.82, 1, 48); r.rotateX(-Math.PI / 2); return r; }),
        _mat.wave || (_mat.wave = shared(new THREE.MeshBasicMaterial({ color: 0xe8c880, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }))));
    m.userData.sharedMat = true;
    return m;
}

/** Everything to compile on the loading screen (Game.prewarm). */
export function pharaohSamples() {
    const out = [sarcophagusModel(false), sarcophagusModel(true), waveRing()];
    const im = new THREE.InstancedMesh(locustGeometry(), locustMaterial(), 1); im.setMatrixAt(0, new THREE.Matrix4()); out.push(im);
    out.push(new THREE.Mesh(dartGeometry(), dartMaterial()));
    return out;
}
