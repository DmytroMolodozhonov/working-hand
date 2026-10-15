/**
 * PouchModel.js — the coin pouches' 3D models (ItemTypes.makeItemModel, kind 'coins').
 *
 *  - The plain pouch: soft brown leather, worn and creased, a seam down each side with its
 *    stitches; its neck gathered in folds and drawn tight by a twisted hemp cord, the ends of
 *    the cord hanging with knots; above the cord — the frilled mouth, a gold coin's edge
 *    peeping out of it. The coins weigh its bottom down (a little flattened, wider below).
 *  - The magic pouch («с незримым расширением», CoinBelt.MAGIC): deep red velvet with gold runes
 *    and stars stitched on it, its neck tied with a golden silk ribbon in a bow; the runes shimmer
 *    and a few sparks twinkle on it — only their materials glow (no light of its own: CLAUDE.md).
 *
 * The shapes (lathe profiles, folds), the textures (drawn on a canvas once) and the materials are
 * made once and shared by every pouch (userData.shared: disposeModel leaves them alone).
 * Model units: the pouch's top (the mouth) at y ≈ 0.165, the neck (the cord) at y ≈ 0.132 —
 * there the fist holds it (Items.GRIPPED.coins) and there it is tied to the belt (CoinBelt).
 */

import * as THREE from 'three';

/** Where the cord / the ribbon is (model y): the fist closes and the belt ties there. */
export const POUCH_NECK_Y = 0.132;
export const POUCH_TOP_Y = 0.168;

const shared = (o) => { o.userData.shared = true; return o; };
const _geo = new Map();
const geo = (key, make) => { if (!_geo.has(key)) _geo.set(key, shared(make())); return _geo.get(key); };

/** The sack's outline (radius, y) from the bottom to the mouth. */
const PROFILE = [
    [0.0, -0.118], [0.05, -0.116], [0.092, -0.104], [0.122, -0.074], [0.137, -0.034], [0.139, 0.0],
    [0.131, 0.038], [0.112, 0.07], [0.086, 0.096], [0.062, 0.114], [0.047, 0.126], [0.042, 0.134],
    [0.045, 0.142], [0.056, 0.151], [0.066, 0.16], [0.064, 0.166], [0.05, 0.168], [0.03, 0.166], [0.0, 0.16],
];

/**
 * The sack: a lathe of the outline, then creased — gathered folds that run down from the neck
 * and fade on the belly, the frill's pleats, a soft dent here and there (always the same shape).
 */
function sackGeometry(magic) {
    return geo('sack' + (magic ? 'M' : 'P'), () => {
        const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r * (magic ? 0.97 : 1), y * (magic ? 0.98 : 1)));
        const g = new THREE.LatheGeometry(pts, 28);
        const p = g.attributes.position;
        const folds = magic ? 7 : 9;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const r = Math.hypot(x, z);
            if (r < 1e-5) continue;
            const a = Math.atan2(z, x);
            // the folds: strongest at the neck and in the frill, gone on the belly
            const t = THREE.MathUtils.smoothstep(y, -0.02, 0.118);
            const frill = y > 0.142 ? 1 : 0;
            const fold = Math.sin(a * folds + Math.sin(a * 3) * 0.6) * (0.09 * t + 0.06 * frill);
            // soft creases on the belly (leather: deeper; velvet: barely)
            const crease = (magic ? 0.012 : 0.03) * Math.sin(a * 2 + y * 22) * Math.sin(a * 5 - y * 9) * (1 - t);
            // the coins' weight: the bottom spreads a little
            const sag = y < -0.05 ? 1 + 0.05 * (-0.05 - y) / 0.07 : 1;
            const k = (1 + fold + crease) * sag;
            p.setX(i, x * k);
            p.setZ(i, z * k);
        }
        g.computeVertexNormals();
        return g;
    });
}

// ------------------------------------------------------------------ textures (a canvas, once)

let _tex = null;
/** Little seeded noise for the textures (the same picture every time). */
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function canvas(w, h) {
    if (typeof document === 'undefined') return null; // (node tests: no textures)
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

/** The leather: brown, mottled, with fine grain, wear marks and a stitched seam on each side. */
function leatherTextures() {
    const W = 256, H = 128;
    const c = canvas(W, H), b = canvas(W, H);
    if (!c) return null;
    const x = c.getContext('2d'), y = b.getContext('2d');
    const r = rng(9173);
    x.fillStyle = '#8a5a2e'; x.fillRect(0, 0, W, H);
    y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
    // mottling: big soft blotches lighter and darker
    for (let i = 0; i < 70; i++) {
        const px = r() * W, py = r() * H, rad = 6 + r() * 22, l = r() < 0.5;
        const gr = x.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, l ? 'rgba(176,122,70,0.35)' : 'rgba(70,40,18,0.35)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // the grain: tiny pits and specks (also in the bump map)
    for (let i = 0; i < 2600; i++) {
        const px = r() * W, py = r() * H, d = r();
        x.fillStyle = d < 0.5 ? 'rgba(50,28,12,0.25)' : 'rgba(190,140,90,0.18)';
        x.fillRect(px, py, 1, 1);
        y.fillStyle = d < 0.5 ? 'rgba(40,40,40,0.5)' : 'rgba(200,200,200,0.4)';
        y.fillRect(px, py, 1 + (r() < 0.2 ? 1 : 0), 1);
    }
    // creases: thin dark wavy lines along the sack (v = up the sack)
    for (let i = 0; i < 26; i++) {
        let px = r() * W, py = H * (0.15 + r() * 0.7);
        x.strokeStyle = 'rgba(55,30,12,0.35)'; y.strokeStyle = 'rgba(30,30,30,0.6)';
        x.lineWidth = y.lineWidth = 1;
        x.beginPath(); y.beginPath(); x.moveTo(px, py); y.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 10; py += 4 + r() * 8; x.lineTo(px, py); y.lineTo(px, py); }
        x.stroke(); y.stroke();
    }
    // the gathered neck: darker, rubbed (top band)
    const gn = x.createLinearGradient(0, 0, 0, H * 0.3);
    gn.addColorStop(0, 'rgba(60,34,14,0.45)'); gn.addColorStop(1, 'rgba(60,34,14,0)');
    x.fillStyle = gn; x.fillRect(0, 0, W, H * 0.3);
    // the seams: a darker welt down each side (u = 0 / 1 and 0.5) with small slanted stitches over it
    for (const u of [0, 0.5, 1]) {
        const sx = u * W;
        x.fillStyle = 'rgba(58,32,14,0.55)'; x.fillRect(sx - 1.5, H * 0.1, 3, H * 0.88);
        y.fillStyle = 'rgba(30,30,30,0.9)'; y.fillRect(sx - 1, H * 0.1, 2, H * 0.88);
        x.strokeStyle = 'rgba(214,190,140,0.85)'; y.strokeStyle = '#e8e8e8';
        x.lineWidth = y.lineWidth = 1;
        for (let sy = H * 0.12; sy < H * 0.96; sy += 5) {
            for (const ctx of [x, y]) { ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy + 2); ctx.stroke(); }
        }
    }
    return { map: c, bump: b };
}

/** The velvet: deep red, a soft sheen in its pile, gold runes and stars (also the glow map). */
function velvetTextures() {
    const W = 512, H = 256;
    const c = canvas(W, H), e = canvas(W, H);
    if (!c) return null;
    const x = c.getContext('2d'), y = e.getContext('2d');
    const r = rng(5521);
    x.fillStyle = '#8e0f1c'; x.fillRect(0, 0, W, H);
    y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
    // the pile: soft streaks of light and shade (the way velvet catches the light)
    for (let i = 0; i < 40; i++) {
        const px = r() * W, w = 6 + r() * 20;
        const gr = x.createLinearGradient(px - w, 0, px + w, 0);
        const c0 = r() < 0.5 ? 'rgba(200,40,60,0.22)' : 'rgba(60,0,10,0.3)';
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, c0); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(px - w, 0, w * 2, H);
    }
    for (let i = 0; i < 6000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(40,0,6,0.25)' : 'rgba(220,70,90,0.12)'; x.fillRect(r() * W, r() * H, 1, 1); }
    // a gold band of embroidery under the neck, and runes and stars over the belly
    const gold = (ctx, a) => { ctx.strokeStyle = `rgba(255,205,90,${a})`; ctx.fillStyle = `rgba(255,215,110,${a})`; };
    for (const ctx of [x, y]) {
        gold(ctx, 0.95);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, H * 0.22); ctx.lineTo(W, H * 0.22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H * 0.27); ctx.lineTo(W, H * 0.27); ctx.stroke();
        for (let u = 0; u < W; u += 16) { ctx.beginPath(); ctx.moveTo(u, H * 0.22); ctx.lineTo(u + 8, H * 0.27); ctx.lineTo(u + 16, H * 0.22); ctx.stroke(); }
    }
    const rr = rng(77);
    const rune = (ctx, cx, cy, s, kind) => {
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (kind === 0) { ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.moveTo(cx, cy - s * 0.4); ctx.lineTo(cx + s * 0.6, cy - s); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.6, cy - s * 0.4); }
        else if (kind === 1) { ctx.moveTo(cx - s * 0.6, cy + s); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s * 0.6, cy + s); ctx.moveTo(cx - s * 0.3, cy + s * 0.2); ctx.lineTo(cx + s * 0.3, cy + s * 0.2); }
        else if (kind === 2) { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.6, cy); ctx.closePath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); }
        else if (kind === 3) { ctx.arc(cx, cy, s * 0.6, 0, Math.PI * 2); ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy); }
        else { ctx.moveTo(cx - s * 0.5, cy - s); ctx.lineTo(cx + s * 0.5, cy + s); ctx.moveTo(cx + s * 0.5, cy - s); ctx.lineTo(cx - s * 0.5, cy + s); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); }
        ctx.stroke();
    };
    const star = (ctx, cx, cy, s) => {
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, q = k % 2 ? s * 0.35 : s; ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
        ctx.closePath(); ctx.fill();
    };
    for (let i = 0; i < 10; i++) {
        const cx = (i + 0.5) * (W / 10), cy = H * (0.47 + (i % 2) * 0.15), kind = i % 5, s = 11;
        for (const ctx of [x, y]) { gold(ctx, 0.9); rune(ctx, cx, cy, s, kind); }
    }
    for (let i = 0; i < 18; i++) {
        const cx = rr() * W, cy = H * (0.36 + rr() * 0.58), s = 3 + rr() * 4;
        for (const ctx of [x, y]) { gold(ctx, 0.85); star(ctx, cx, cy, s); }
    }
    return { map: c, glow: e };
}

/** Rope: a twisted hemp cord (or the golden silk's sheen) along the tube. */
function cordTexture(silk) {
    const c = canvas(64, 16);
    if (!c) return null;
    const x = c.getContext('2d');
    x.fillStyle = silk ? '#e2b13c' : '#c9a66b'; x.fillRect(0, 0, 64, 16);
    for (let i = -16; i < 64; i += 6) {
        x.strokeStyle = silk ? 'rgba(255,240,170,0.7)' : 'rgba(80,56,26,0.85)';
        x.lineWidth = silk ? 1.2 : 2;
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 16); x.stroke();
    }
    return c;
}

const _matCache = new Map();
function mat(key, make) { if (!_matCache.has(key)) _matCache.set(key, shared(make())); return _matCache.get(key); }
const texOf = (cv, rep = [1, 1]) => {
    if (!cv) return null;
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.anisotropy = 4;
    return t;
};

function textures() {
    if (_tex) return _tex;
    const L = leatherTextures(), V = velvetTextures();
    _tex = {
        leather: L && texOf(L.map), leatherBump: L && texOf(L.bump),
        velvet: V && texOf(V.map), velvetGlow: V && texOf(V.glow),
        cord: texOf(cordTexture(false), [6, 1]), silk: texOf(cordTexture(true), [6, 1]),
    };
    return _tex;
}

const leatherMat = () => mat('leather', () => {
    const T = textures();
    return new THREE.MeshStandardMaterial({ color: T.leather ? 0xffffff : 0x8a5a2e, map: T.leather, bumpMap: T.leatherBump, bumpScale: 0.004, roughness: 0.82, metalness: 0.0 });
});
const velvetMat = () => mat('velvet', () => {
    const T = textures();
    return new THREE.MeshStandardMaterial({ color: T.velvet ? 0xffffff : 0x8e0f1c, map: T.velvet, emissive: 0xffc35a, emissiveMap: T.velvetGlow, emissiveIntensity: T.velvetGlow ? 0.3 : 0, roughness: 0.95, metalness: 0.0 });
});
const cordMat = () => mat('cord', () => { const T = textures(); return new THREE.MeshStandardMaterial({ color: T.cord ? 0xffffff : 0xb8955a, map: T.cord, roughness: 0.95, metalness: 0 }); });
const silkMat = () => mat('silk', () => { const T = textures(); return new THREE.MeshStandardMaterial({ color: T.silk ? 0xffffff : 0xe2b13c, map: T.silk, roughness: 0.32, metalness: 0.45, emissive: 0x3a2400 }); });
const goldMat = () => mat('gold', () => new THREE.MeshStandardMaterial({ color: 0xf2c440, roughness: 0.35, metalness: 0.4, emissive: 0x4a3000 }));
const innerMat = (magic) => mat('inner' + magic, () => new THREE.MeshLambertMaterial({ color: magic ? 0x2a0006 : 0x2b170a }));
/** The sparks: three shared materials twinkling out of step (tickPouchMagic). */
const SPARK_N = 3;
const sparkMat = (i) => mat('spark' + i, () => new THREE.MeshBasicMaterial({ color: i === 1 ? 0xfff2c0 : 0xffd36a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));

const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

/** The cord's (ribbon's) ring round the neck, and the frill's dark inside. */
function neck(g, magic) {
    const ring = mesh(geo('ring', () => new THREE.TorusGeometry(0.046, 0.011, 6, 22)), magic ? silkMat() : cordMat(), 0, POUCH_NECK_Y, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const inner = mesh(geo('inner', () => new THREE.CircleGeometry(0.05, 14)), innerMat(magic), 0, 0.161, 0);
    inner.rotation.x = -Math.PI / 2;
    g.add(inner);
}

/** A strand hanging from the neck: a cord's end with a knot (plain) or a ribbon's tail (magic). */
function strand(g, m, x, z, len, tilt, w = 0.009) {
    const s = mesh(geo('strand' + w, () => new THREE.CylinderGeometry(w, w, 1, 6)), m);
    s.scale.y = len;
    s.position.set(x + Math.sin(tilt) * len * 0.5, POUCH_NECK_Y - Math.cos(tilt) * len * 0.5, z);
    s.rotation.z = tilt;
    g.add(s);
    return [x + Math.sin(tilt) * len, POUCH_NECK_Y - Math.cos(tilt) * len];
}

/** The plain pouch: worn leather, the hemp cord with knotted ends, a coin peeping out of the mouth. */
function plainPouch() {
    const g = new THREE.Group();
    g.add(mesh(sackGeometry(false), leatherMat()));
    neck(g, false);
    const knot = geo('knot', () => new THREE.SphereGeometry(0.017, 8, 6));
    for (const [tilt, len] of [[0.18, 0.07], [0.42, 0.055]]) {
        const [ex, ey] = strand(g, cordMat(), 0.045, 0.012, len, tilt, 0.011);
        g.add(mesh(knot, cordMat(), ex, ey, 0.012));
    }
    // a gold coin's edge in the mouth (the coins inside)
    const coin = mesh(geo('coin', () => new THREE.CylinderGeometry(0.024, 0.024, 0.006, 14)), goldMat(), 0.012, 0.164, -0.006);
    coin.rotation.set(1.1, 0, 0.3);
    g.add(coin);
    return g;
}

/** The magic pouch: red velvet with gold runes, a golden silk ribbon tied in a bow, a few sparks. */
function magicPouch() {
    const g = new THREE.Group();
    g.add(mesh(sackGeometry(true), velvetMat()));
    neck(g, true);
    // the bow: two loops and two tails of the ribbon, on the front of the neck (−z)
    const loop = geo('bowLoop', () => new THREE.TorusGeometry(0.026, 0.007, 5, 14));
    for (const s of [-1, 1]) {
        const L = mesh(loop, silkMat(), s * 0.028, POUCH_NECK_Y + 0.006, -0.05);
        L.scale.set(1, 0.62, 0.55);
        L.rotation.set(0.1, s * 0.35, s * 0.35);
        g.add(L);
    }
    g.add(mesh(geo('bowKnot', () => new THREE.SphereGeometry(0.012, 8, 6)), silkMat(), 0, POUCH_NECK_Y, -0.052));
    const tail = geo('tail', () => new THREE.BoxGeometry(0.016, 1, 0.003));
    for (const s of [-1, 1]) {
        const t = mesh(tail, silkMat());
        t.scale.y = 0.07;
        t.position.set(s * 0.017, POUCH_NECK_Y - 0.035, -0.058 + 0.004 * s);
        t.rotation.set(-0.15, 0, s * 0.3);
        g.add(t);
    }
    // the sparks: tiny stars on and just above the velvet (all inside the pouch's own size)
    const spark = geo('spark', () => new THREE.OctahedronGeometry(0.0075, 0));
    const at = [[0.12, -0.02, 0.06], [-0.1, 0.03, 0.09], [0.04, -0.07, -0.13], [-0.13, -0.05, -0.04], [0.08, 0.06, -0.1], [-0.03, 0.09, 0.09], [0.13, 0.02, -0.04]];
    at.forEach(([x, y, z], i) => {
        const s = mesh(spark, sparkMat(i % SPARK_N), x, y, z);
        s.rotation.set(i, i * 0.7, 0);
        g.add(s);
    });
    return g;
}

/** A coin pouch's model (kind 'coins'): the magic one for `it.magic`. */
export function pouchModel(it) {
    return it?.magic ? magicPouch() : plainPouch();
}

/**
 * The magic pouches shimmer (one call a frame: the shared materials, every pouch at once — the
 * runes' glow breathes, the sparks twinkle out of step). Nothing to do when none was ever made.
 */
export function tickPouchMagic(t) {
    const v = _matCache.get('velvet');
    if (!v) return;
    if (v.emissiveMap) v.emissiveIntensity = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7));
    for (let i = 0; i < SPARK_N; i++) {
        const m = _matCache.get('spark' + i);
        if (m) m.opacity = Math.max(0, Math.sin(t * (2.3 + i * 0.7) + i * 2.1)) ** 2 * 0.95;
    }
}
