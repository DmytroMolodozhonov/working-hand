/**
 * AppleModel.js — the new apples in the hand (red and golden), in the gate's style (docs/rules/texture-style.md); ItemTypes.appleModel makes them.
 *
 * A real apple's shape (a lathe profile: the shoulders wider than the base, a stem cavity on top, a calyx basin with five lobes under it,
 * a slightly lopsided body), a skin painted on a canvas once (the red one: a yellow-green blush near the stem, streaks of deeper red,
 * pale lenticels, russet in the cavity; the golden one: smooth polished gold), a curved stem with a woody
 * ring, and a leaf with a midrib, veins and a serrated edge. Shapes and pictures are built once and shared.
 */
import * as THREE from 'three';

const R = 0.11; // (the apple's radius in the hand: as before — the hand's grip, HOLD.apple, stays)
const _tex = {};
const _geo = {};
const _mat = {};

function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
/** A canvas picture made once (null without a canvas — the tests). */
function canvasTex(name, W, H, draw) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return (_tex[name] = null);
    draw(g, W, H, rng(name.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 11)));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
    t.userData = { keep: true };
    return (_tex[name] = t);
}
/** Draw `fn(dx)` three times (−W, 0, +W): what crosses the picture's side edge comes out on the other side (the skin closes round the fruit). */
const wrapDraw = (W, fn) => { for (const dx of [-W, 0, W]) fn(dx); };

// ------------------------------------------------------------------ the shape
/** The apple's body: a lathe along an apple's profile (r, y), then a lopsided body, five lobes at the calyx, one normal on the seam. */
function bodyGeo() {
    if (_geo.body) return _geo.body;
    const prof = [[0.0, -0.78], [0.1, -0.82], [0.27, -0.9], [0.5, -0.87], [0.74, -0.69], [0.92, -0.4], [1.0, -0.04], [0.98, 0.3], [0.88, 0.58], [0.7, 0.8], [0.47, 0.9], [0.27, 0.85], [0.15, 0.7], [0.07, 0.6], [0.0, 0.58]];
    const curve = new THREE.CatmullRomCurve3(prof.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
    const pts = curve.getPoints(40).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    const SEG = 40;
    const geo = new THREE.LatheGeometry(pts, SEG);
    const P = geo.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), th = Math.atan2(z, x);
        const low = Math.max(0, (-0.55 - y) / 0.35), top = Math.max(0, (y - 0.3) / 0.6);
        const k = 1 + 0.035 * Math.sin(th * 2 + 1) + 0.02 * Math.sin(th * 3 + 0.4) + 0.035 * Math.cos(th * 5) * Math.min(1, low) * (Math.hypot(x, z) > 0.12 ? 1 : 0);
        P.setXYZ(i, x * k, y + 0.05 * Math.sin(th + 0.5) * top, z * k);
    }
    geo.computeVertexNormals();
    // (the seam: the lathe's first and last columns are one line — one normal)
    const N = geo.getAttribute('normal'), rows = pts.length;
    for (let j = 0; j < rows; j++) {
        const a = j, b = SEG * rows + j; // (LatheGeometry orders column by column: i * rows + j)
        if (b >= N.count) continue;
        const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
        N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
    }
    geo.userData = { shared: true, keep: true };
    return (_geo.body = geo);
}

/** A thin curved tube (the stem): along a curve in the XY plane, a radius by t, vertex colours by t. */
function tube(curve, radius, color, segs = 10, sides = 8) {
    const pos = [], col = [], idx = [];
    const N = new THREE.Vector3(0, 0, 1), T = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        curve.getPoint(t, P); curve.getTangent(t, T);
        B.crossVectors(T, N).normalize();
        const r = radius(t), c = color(t);
        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            pos.push(P.x + (B.x * Math.cos(a) + N.x * Math.sin(a)) * r, P.y + (B.y * Math.cos(a) + N.y * Math.sin(a)) * r, P.z + (B.z * Math.cos(a) + N.z * Math.sin(a)) * r);
            col.push(c[0], c[1], c[2]);
        }
        if (i > 0) for (let j = 0; j < sides; j++) { const a = (i - 1) * sides, b = i * sides, j1 = (j + 1) % sides; idx.push(a + j, b + j, a + j1, a + j1, b + j, b + j1); }
    }
    // (the tip: a flat cut, a little darker)
    const tip = pos.length / 3; curve.getPoint(1, P); pos.push(P.x, P.y, P.z); const c = color(1); col.push(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
    for (let j = 0; j < sides; j++) idx.push(tip, segs * sides + j, segs * sides + (j + 1) % sides);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    g.userData = { shared: true, keep: true };
    return g;
}
function stemGeo() {
    if (_geo.stem) return _geo.stem;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0.005, 0.85, 0), new THREE.Vector3(0.05, 1.12, 0.01), new THREE.Vector3(0.13, 1.33, 0.01)]);
    return (_geo.stem = tube(curve, (t) => 0.042 - 0.012 * t + 0.01 * Math.exp(-(((t - 0.98) / 0.05) ** 2)), (t) => { const ring = 0.9 + 0.1 * Math.sin(t * 40), m = (0.7 + 0.35 * t) * ring; return [m, m * 0.85, m * 0.7]; }));
}

/** A leaf: ovate with a drawn tip, a midrib fold, a droop along its length, a serrated edge; uv for the picture (u across, v along). */
function leafGeo() {
    if (_geo.leaf) return _geo.leaf;
    const L = 0.95, Wd = 0.34, segs = 14, cols = 7;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const half = Wd * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1 + 0.06 * Math.sign(Math.sin(t * 38)) * Math.min(1, t * 4)) + 0.004;
        for (let k = 0; k < cols; k++) {
            const f = -1 + (2 * k) / (cols - 1);
            // (the fold along the midrib, the droop and a slight twist along the length)
            pos.push(f * half + 0.07 * t * t, 0.13 * Math.abs(f) * half * 2.2 - 0.34 * t * t + 0.05 * f * t, L * t);
            uv.push((f + 1) / 2, t);
        }
        if (i > 0) for (let k = 0; k < cols - 1; k++) { const a = (i - 1) * cols + k, b = i * cols + k; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    g.userData = { shared: true, keep: true };
    return (_geo.leaf = g);
}

// ------------------------------------------------------------------ the pictures
/** The red apple's skin: blush, streaks, lenticels, russet in the stem cavity, a few scuffs. u (across) wraps round the fruit; v: 0 calyx … 1 stem. */
function redSkin() {
    return canvasTex('apple-red', 512, 512, (g, W, H, r) => {
        const lg = g.createLinearGradient(0, H, 0, 0); // (the canvas' bottom is v = 0: the calyx)
        lg.addColorStop(0, '#a88a2c'); lg.addColorStop(0.08, '#a8302a'); lg.addColorStop(0.3, '#b8141c'); lg.addColorStop(0.7, '#a60f18'); lg.addColorStop(0.9, '#a85a22'); lg.addColorStop(1, '#8a7a30');
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
        // the sun's side: a deep crimson blush, soft blobs
        for (let i = 0; i < 26; i++) { const x = r() * W, y = H * (0.2 + r() * 0.6), rad = 40 + r() * 90; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad); rg.addColorStop(0, `rgba(${r() < 0.5 ? '70,6,14' : '120,10,16'},${0.2 + r() * 0.2})`); rg.addColorStop(1, 'rgba(90,8,14,0)'); g.fillStyle = rg; g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2); }); }
        // the shaded side: a yellower, paler cheek
        for (let i = 0; i < 9; i++) { const x = r() * W, y = H * (0.25 + r() * 0.5), rad = 50 + r() * 70; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad); rg.addColorStop(0, 'rgba(214,150,60,0.28)'); rg.addColorStop(1, 'rgba(214,150,60,0)'); g.fillStyle = rg; g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2); }); }
        // streaks: thin strokes from the stem towards the calyx, wavering
        for (let i = 0; i < 900; i++) {
            const x = r() * W, y0 = H * (0.02 + r() * 0.9), len = 30 + r() * 150, dark = r() < 0.62, w = 0.8 + r() * 2.2;
            g.strokeStyle = dark ? `rgba(60,4,10,${0.1 + r() * 0.22})` : `rgba(232,120,60,${0.07 + r() * 0.14})`; g.lineWidth = w;
            wrapDraw(W, (dx) => { g.beginPath(); g.moveTo(x + dx, y0); g.bezierCurveTo(x + dx + (r() - 0.5) * 9, y0 + len * 0.35, x + dx + (r() - 0.5) * 9, y0 + len * 0.7, x + dx + (r() - 0.5) * 12, y0 + len); g.stroke(); });
        }
        // lenticels: tiny pale dots, thicker near the calyx
        for (let i = 0; i < 520; i++) {
            const x = r() * W, y = H * (0.08 + Math.pow(r(), 0.8) * 0.84), s = 0.9 + r() * 1.9;
            wrapDraw(W, (dx) => { g.fillStyle = `rgba(255,232,180,${0.35 + r() * 0.4})`; g.beginPath(); g.ellipse(x + dx, y, s, s * 0.75, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(70,10,10,0.25)'; g.beginPath(); g.ellipse(x + dx + 0.6, y + 0.7, s * 0.9, s * 0.65, 0, 0, 7); g.fill(); });
        }
        // russet in the stem cavity (the top band) and the calyx (the bottom)
        for (let i = 0; i < 160; i++) { const x = r() * W, y = H * (r() < 0.8 ? r() * 0.12 : 0.9 + r() * 0.1), rr = 4 + r() * 12; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rr); rg.addColorStop(0, 'rgba(110,76,34,0.4)'); rg.addColorStop(1, 'rgba(110,76,34,0)'); g.fillStyle = rg; g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2); }); }
        // scuffs and one small bruise
        for (let i = 0; i < 6; i++) { const x = r() * W, y = H * (0.3 + r() * 0.4), rr = 8 + r() * 14; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rr); rg.addColorStop(0, 'rgba(40,10,10,0.3)'); rg.addColorStop(1, 'rgba(40,10,10,0)'); g.fillStyle = rg; g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2); }); }
        // the sheen: a pale vertical glaze
        const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.05)'); sh.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    });
}

/** The golden apple's skin: smooth polished gold — warm and pale drifts, a soft glow at the shoulders, a darker patina in the hollows (no dimples, no lines: the author 07.11). */
function goldSkin() {
    return canvasTex('apple-gold', 512, 512, (g, W, H, r) => {
        const lg = g.createLinearGradient(0, H, 0, 0);
        lg.addColorStop(0, '#9a6f18'); lg.addColorStop(0.14, '#d4a22a'); lg.addColorStop(0.45, '#f6d055'); lg.addColorStop(0.75, '#ebbc3c'); lg.addColorStop(0.93, '#c0891e'); lg.addColorStop(1, '#85601a');
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
        // broad, very soft warm / pale drifts: the metal isn't one flat tone
        for (let i = 0; i < 26; i++) { const x = r() * W, y = H * (0.1 + r() * 0.8), rad = 70 + r() * 120, pale = r() < 0.55; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad); rg.addColorStop(0, pale ? 'rgba(255,244,180,0.2)' : 'rgba(150,92,14,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2); }); }
        // the finest grain (tiny specks, no relief)
        for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,240,170,${r() * 0.1})` : `rgba(110,70,10,${r() * 0.1})`; g.fillRect(r() * W, r() * H, 1.3, 1.3); }
        // patina in the hollows (the stem cavity and the calyx)
        for (const y of [0.02, 0.97]) for (let i = 0; i < 40; i++) { const x = r() * W, rr = 10 + r() * 24; wrapDraw(W, (dx) => { const rg = g.createRadialGradient(x + dx, H * y, 0, x + dx, H * y, rr); rg.addColorStop(0, 'rgba(80,46,6,0.5)'); rg.addColorStop(1, 'rgba(80,46,6,0)'); g.fillStyle = rg; g.fillRect(x + dx - rr, H * y - rr, rr * 2, rr * 2); }); }
    });
}

/** A leaf's picture: green (or golden), a light midrib, diagonal veins, a darker edge, speckle. u across, v along (0 base … 1 tip). */
function leafSkin(gold) {
    return canvasTex(gold ? 'apple-leaf-gold' : 'apple-leaf', 256, 512, (g, W, H, r) => {
        const lg = g.createLinearGradient(0, H, 0, 0);
        if (gold) { lg.addColorStop(0, '#b48420'); lg.addColorStop(0.5, '#f0c244'); lg.addColorStop(1, '#d8a832'); } else { lg.addColorStop(0, '#2c5a1e'); lg.addColorStop(0.5, '#3f8a2a'); lg.addColorStop(1, '#5aa03a'); }
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H, rad = 14 + r() * 30, rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, gold ? 'rgba(255,240,170,0.18)' : 'rgba(150,200,80,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
        // (canvas y grows down; v = 1 − y/H: the base is at the bottom)
        for (let k = 0; k < 13; k++) for (const s of [-1, 1]) {
            const y0 = H * (0.94 - k * 0.07);
            g.strokeStyle = gold ? 'rgba(110,70,8,0.5)' : 'rgba(20,50,10,0.38)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(W / 2, y0); g.quadraticCurveTo(W / 2 + s * W * 0.22, y0 - 26, W / 2 + s * W * 0.46, y0 - 70); g.stroke();
            g.strokeStyle = gold ? 'rgba(255,240,170,0.5)' : 'rgba(180,230,120,0.3)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(W / 2, y0 + 1.5); g.quadraticCurveTo(W / 2 + s * W * 0.22, y0 - 24, W / 2 + s * W * 0.46, y0 - 68); g.stroke();
        }
        g.strokeStyle = gold ? 'rgba(255,244,190,0.9)' : 'rgba(190,225,130,0.85)'; g.lineWidth = 3.6; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.03); g.stroke();
        g.strokeStyle = gold ? 'rgba(100,62,6,0.5)' : 'rgba(20,50,10,0.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(W / 2 - 2.6, H); g.lineTo(W / 2 - 2.6, H * 0.03); g.stroke();
        for (let i = 0; i < 260; i++) { g.fillStyle = gold ? `rgba(120,76,10,${r() * 0.22})` : `rgba(10,40,10,${r() * 0.2})`; g.fillRect(r() * W, r() * H, 1.4, 1.4); }
    });
}

// ------------------------------------------------------------------ materials and the model
function skinMat(red) {
    const k = red ? 'red' : 'gold';
    if (!_mat[k]) {
        _mat[k] = red
            ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: redSkin(), roughness: 0.34, metalness: 0.0 })
            : new THREE.MeshStandardMaterial({ color: 0xffffff, map: goldSkin(), roughness: 0.3, metalness: 0.55, emissive: 0x5a3c06, emissiveMap: goldSkin(), emissiveIntensity: 0.55 });
        _mat[k].userData = { shared: true };
    }
    return _mat[k];
}
function stemMat(red) {
    const k = 'stem' + red;
    if (!_mat[k]) { _mat[k] = red ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }) : new THREE.MeshStandardMaterial({ color: 0xffd98a, vertexColors: true, roughness: 0.4, metalness: 0.5, emissive: 0x3a2400 }); _mat[k].userData = { shared: true }; }
    return _mat[k];
}
function leafMat(red) {
    const k = 'leaf' + red;
    if (!_mat[k]) { _mat[k] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leafSkin(!red), side: THREE.DoubleSide, roughness: red ? 0.6 : 0.35, metalness: red ? 0 : 0.45, emissive: red ? 0x000000 : 0x4a3000, emissiveIntensity: 0.4 }); _mat[k].userData = { shared: true }; }
    return _mat[k];
}

/** The new apple: red (an apple tree's) or golden (magic). The body is centred; a leaf and a stem on top; the radius R, as the old sphere's. */
export function newAppleModel(red = true) {
    const g = new THREE.Group();
    g.name = red ? 'apple-red' : 'apple-gold';
    const body = new THREE.Mesh(bodyGeo(), skinMat(red));
    body.scale.setScalar(R); body.castShadow = true;
    g.add(body);
    const stem = new THREE.Mesh(stemGeo(), stemMat(red));
    stem.scale.setScalar(R); g.add(stem);
    const leaf = new THREE.Mesh(leafGeo(), leafMat(red));
    leaf.scale.setScalar(R * 0.62);
    leaf.position.set(0.012, R * 0.98, 0.002); leaf.rotation.set(-0.35, 0.9, 0.25);
    g.add(leaf);
    return g;
}
