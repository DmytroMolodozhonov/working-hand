/**
 * TitanModels.js — the bodies of the seven titans (TitanRules.js). Each is drawn its own way (docs/rules/texture-style.md: a texture
 * painted once on a canvas in layers, a body of many pieces of a real shape, a few materials, the pieces of one material merged):
 *
 *   iron    Mercury — blackened, sun-melted iron plates with rivets, white sunlight through the cracks, a mirror on the breast
 *   lava    Venus — a crust of cooling basalt over flowing lava (glowing seams), flames for hair, dripping fire
 *   worm    Mars — the sandworm: rings of rusted armour, a mouth that opens like a flower of three petals, rings of crystal teeth
 *   storm   Jupiter — a living tornado: three funnels turning (a shader), a face in the whirl, lightning inside
 *   rock    Saturn — a walking mountain of grey boulders and craters, glowing eyes in the gaps
 *   shade   Uranus — a giant of dark teal mist with stars inside (seen in light only — Titans.js sets its opacity)
 *   ice     Neptune — a clear giant of ice shards, a blue light inside, frost and a snow-cap
 *
 * A walker is built 1 unit tall round a rig of joints (THREE.Group): hips, chest, head, arms (shoulder → elbow → hand), legs
 * (hip → knee → foot); the game scales the whole by the titan's height and turns the joints (Titans.js `pose`). Every part is one
 * merged geometry per material — a titan costs ~20 draw calls. In node (tests) without `document` there are no textures: the
 * bodies are still made.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

// ------------------------------------------------------------------ helpers
function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const _tex = new Map(); // (one per look and kind: never grows past ~14)
function canvasTex(name, S, draw) {
    if (_tex.has(name)) return _tex.get(name);
    if (typeof document === 'undefined') { _tex.set(name, null); return null; }
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    draw(x, S, rng([...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.shared = true;
    _tex.set(name, t);
    return t;
}
/** Grain: thousands of little specks, dark and light. */
function grain(x, S, r, n, dark, light, size = 2) {
    for (let i = 0; i < n; i++) {
        x.fillStyle = r() < 0.5 ? dark : light;
        x.globalAlpha = 0.05 + r() * 0.18;
        const s = 0.6 + r() * size;
        x.fillRect(r() * S, r() * S, s, s);
    }
    x.globalAlpha = 1;
}
/** A crack: a wandering line, a shadow line and (glow) a lit core. */
function crack(x, S, r, col, w, glow = null) {
    let px = r() * S, py = r() * S, a = r() * Math.PI * 2;
    const pts = [[px, py]];
    for (let k = 0; k < 8 + r() * 14; k++) { a += (r() - 0.5) * 1.1; px += Math.cos(a) * (6 + r() * 14); py += Math.sin(a) * (6 + r() * 14); pts.push([px, py]); }
    const path = () => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts) x.lineTo(p[0], p[1]); };
    if (glow) { x.strokeStyle = glow; x.lineWidth = w * 4; x.globalAlpha = 0.35; path(); x.stroke(); x.globalAlpha = 1; }
    x.strokeStyle = col; x.lineWidth = w; path(); x.stroke();
    if (!glow) { x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1; x.translate(1, 1); path(); x.stroke(); x.translate(-1, -1); }
}
function blot(x, cx, cy, rad, inner, outer) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
}

/** Give a geometry a flat vertex colour (so pieces of one material can carry their own tone) and drop the index for merging. */
function tinted(geo, c, r, vary = 0.12) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, col = new Float32Array(n * 3), k = 1 - vary / 2 + r() * vary;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
}
/** Roughen a shape: every vertex pushed along its direction by a little noise (a boulder, a crust, a shard). */
function rough(geo, r, amt) {
    const p = geo.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let k = seen.get(key);
        if (k === undefined) { k = 1 + (r() - 0.5) * amt; seen.set(key, k); }
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    return geo;
}
const C = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------------ the textures (each painted once)
const TEX = {
    iron: () => canvasTex('titan-iron', 512, (x, S, r) => {
        x.fillStyle = '#8a8580'; x.fillRect(0, 0, S, S);
        grain(x, S, r, 9000, '#2a2522', '#c9c2b8', 2.5);
        // the plates: seams, each plate a little its own, hammer dimples, rivets along the seams
        const n = 4, w = S / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            x.fillStyle = `rgba(${40 + r() * 30},${30 + r() * 25},${25 + r() * 20},${0.1 + r() * 0.2})`; x.fillRect(i * w, j * w, w, w);
            for (let k = 0; k < 6; k++) blot(x, i * w + r() * w, j * w + r() * w, 4 + r() * 10, 'rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)');
            x.fillStyle = 'rgba(15,10,8,0.85)'; x.fillRect(i * w, j * w, w, 3); x.fillRect(i * w, j * w, 3, w);
            x.fillStyle = 'rgba(255,240,220,0.15)'; x.fillRect(i * w, j * w + 3, w, 1); x.fillRect(i * w + 3, j * w, 1, w);
            for (let k = 8; k < w; k += 18) for (const [rx, ry] of [[i * w + k, j * w + 8], [i * w + 8, j * w + k]]) { blot(x, rx, ry, 3.5, '#d8d0c4', '#3a332e'); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(rx + 1, ry + 2, 3, 1); }
        }
        // scorch: dark runs where the sun melted it, rainbow temper colours by the cracks
        for (let k = 0; k < 18; k++) { const cx = r() * S, cy = r() * S; blot(x, cx, cy, 20 + r() * 50, 'rgba(10,6,4,0.55)', 'rgba(10,6,4,0)'); x.fillStyle = 'rgba(10,6,4,0.35)'; x.fillRect(cx - 2, cy, 4 + r() * 3, 20 + r() * 60); }
        for (let k = 0; k < 14; k++) crack(x, S, r, '#fff6d8', 1.6 + r() * 1.4, 'rgba(255,220,140,0.9)');
        for (let k = 0; k < 10; k++) blot(x, r() * S, r() * S, 10 + r() * 20, `rgba(${120 + r() * 80},${60 + r() * 60},${150 + r() * 80},0.18)`, 'rgba(0,0,0,0)');
    }),
    lava: () => canvasTex('titan-lava', 512, (x, S, r) => {
        // the glowing lava under everything …
        const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#ffb030'); g.addColorStop(0.5, '#ff6a10'); g.addColorStop(1, '#ffd060');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
        // … and the crust: plates of cooling basalt with glowing seams between (cells)
        const cells = [];
        for (let i = 0; i < 70; i++) cells.push([r() * S, r() * S, 18 + r() * 34]);
        for (const [cx, cy, rad] of cells) {
            x.fillStyle = `rgb(${30 + r() * 25},${20 + r() * 14},${18 + r() * 12})`;
            x.beginPath();
            for (let a = 0; a < Math.PI * 2; a += 0.5) { const rr = rad * (0.75 + r() * 0.3); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
            x.closePath(); x.fill();
            x.strokeStyle = 'rgba(255,150,40,0.6)'; x.lineWidth = 2.5; x.stroke();
            blot(x, cx - rad * 0.2, cy - rad * 0.2, rad * 0.6, 'rgba(90,70,60,0.35)', 'rgba(0,0,0,0)');
        }
        grain(x, S, r, 7000, '#120806', '#ff9a40', 2);
    }),
    lavaGlow: () => canvasTex('titan-lava-glow', 256, (x, S, r) => {
        x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
        for (let k = 0; k < 40; k++) crack(x, S, r, '#ffa040', 2 + r() * 2, 'rgba(255,120,20,1)');
        for (let k = 0; k < 30; k++) blot(x, r() * S, r() * S, 4 + r() * 12, 'rgba(255,190,80,0.9)', 'rgba(0,0,0,0)');
    }),
    rock: () => canvasTex('titan-rock', 512, (x, S, r) => {
        x.fillStyle = '#8c8a86'; x.fillRect(0, 0, S, S);
        for (let k = 0; k < 60; k++) blot(x, r() * S, r() * S, 20 + r() * 60, `rgba(${90 + r() * 60},${88 + r() * 55},${84 + r() * 50},0.35)`, 'rgba(0,0,0,0)');
        grain(x, S, r, 14000, '#2c2a28', '#e4e0d8', 2.5);
        // craters: a dark bowl, a light rim on the lit side
        for (let k = 0; k < 26; k++) { const cx = r() * S, cy = r() * S, rad = 5 + r() * 18; blot(x, cx, cy, rad, 'rgba(30,28,26,0.6)', 'rgba(30,28,26,0)'); x.strokeStyle = 'rgba(240,235,225,0.3)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, rad, Math.PI * 1.1, Math.PI * 1.8); x.stroke(); }
        for (let k = 0; k < 22; k++) crack(x, S, r, 'rgba(20,18,16,0.85)', 1 + r() * 2);
        // lichen of a cold planet: pale ochre and blue-grey flecks
        for (let k = 0; k < 40; k++) blot(x, r() * S, r() * S, 3 + r() * 9, r() < 0.5 ? 'rgba(200,180,120,0.35)' : 'rgba(150,170,190,0.3)', 'rgba(0,0,0,0)');
    }),
    ice: () => canvasTex('titan-ice', 512, (x, S, r) => {
        const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#e8f6ff'); g.addColorStop(1, '#9fd0f0');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
        // the inner bubbles and the clouded bands of old ice; frost along the edges; long fractures that catch the light
        for (let k = 0; k < 900; k++) { x.globalAlpha = 0.25 + r() * 0.4; x.fillStyle = '#ffffff'; x.beginPath(); x.arc(r() * S, r() * S, 0.6 + r() * 2.4, 0, 7); x.fill(); }
        x.globalAlpha = 1;
        for (let k = 0; k < 10; k++) { x.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.12})`; x.fillRect(0, r() * S, S, 6 + r() * 20); }
        for (let k = 0; k < 26; k++) crack(x, S, r, 'rgba(255,255,255,0.85)', 0.8 + r() * 1.5);
        for (let k = 0; k < 20; k++) crack(x, S, r, 'rgba(40,110,170,0.45)', 0.6 + r());
        grain(x, S, r, 5000, '#5f9ccc', '#ffffff', 1.5);
    }),
    shade: () => canvasTex('titan-shade', 256, (x, S, r) => {
        x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
        for (let k = 0; k < 50; k++) blot(x, r() * S, r() * S, 20 + r() * 60, `rgba(${20 + r() * 30},${90 + r() * 70},${100 + r() * 60},0.35)`, 'rgba(0,0,0,0)');
        for (let k = 0; k < 260; k++) { const s = r(); x.fillStyle = s > 0.9 ? '#fff6d8' : '#cfeaff'; x.globalAlpha = 0.4 + r() * 0.6; x.fillRect(r() * S, r() * S, s > 0.95 ? 2.5 : 1.2, s > 0.95 ? 2.5 : 1.2); }
        x.globalAlpha = 1;
    }),
    worm: () => canvasTex('titan-worm', 512, (x, S, r) => {
        x.fillStyle = '#9a6a48'; x.fillRect(0, 0, S, S);
        // the ring plates run round (horizontal bands): each a ridge — dark groove, light crest — with rust and sand in the grooves
        const n = 8, h = S / n;
        for (let i = 0; i < n; i++) {
            const y = i * h, g = x.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0, 'rgba(30,18,10,0.85)'); g.addColorStop(0.15, 'rgba(160,110,75,0.15)'); g.addColorStop(0.45, 'rgba(230,190,140,0.25)'); g.addColorStop(0.9, 'rgba(60,35,20,0.4)'); g.addColorStop(1, 'rgba(20,12,8,0.9)');
            x.fillStyle = g; x.fillRect(0, y, S, h);
            for (let k = 0; k < 18; k++) blot(x, r() * S, y + h * (0.1 + r() * 0.15), 3 + r() * 8, 'rgba(210,180,120,0.5)', 'rgba(0,0,0,0)'); // (sand caught under the plate)
        }
        grain(x, S, r, 12000, '#2a1609', '#e9c79a', 2.4);
        for (let k = 0; k < 30; k++) blot(x, r() * S, r() * S, 8 + r() * 24, 'rgba(140,50,20,0.35)', 'rgba(0,0,0,0)'); // (rust)
        for (let k = 0; k < 40; k++) { x.strokeStyle = 'rgba(255,230,190,0.2)'; x.lineWidth = 1; x.beginPath(); const sx = r() * S, sy = r() * S; x.moveTo(sx, sy); x.lineTo(sx + 10 + r() * 30, sy + (r() - 0.5) * 4); x.stroke(); } // (scratches of the rock it bores through)
    }),
    storm: () => canvasTex('titan-storm', 256, (x, S, r) => {
        x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
        // streaks of cloud wound round (the shader scrolls them): pale bands of Jupiter's colours
        for (let k = 0; k < 140; k++) {
            const y = r() * S, w = 20 + r() * 120, sx = r() * S;
            const g = x.createLinearGradient(sx, 0, sx + w, 0);
            const col = [[255, 240, 220], [230, 190, 140], [200, 120, 80], [255, 255, 255]][Math.floor(r() * 4)];
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},${0.25 + r() * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g; x.fillRect(sx, y, w, 2 + r() * 7);
        }
    }),
};

// ------------------------------------------------------------------ the materials (one set per look; shared)
const _mats = new Map();
function mats(look) {
    if (_mats.has(look)) return _mats.get(look);
    const m = {};
    const std = (o) => { const x = new THREE.MeshStandardMaterial({ vertexColors: true, ...o }); x.userData.shared = true; return x; };
    if (look === 'iron') {
        m.body = std({ map: TEX.iron(), metalness: 0.75, roughness: 0.45, emissive: 0xffe2a0, emissiveIntensity: 0.0 });
        m.glow = std({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 2.4, roughness: 1 });
        m.mirror = std({ color: 0xffffff, metalness: 1, roughness: 0.04, emissive: 0x403020, emissiveIntensity: 0.3 });
    } else if (look === 'lava') {
        m.body = std({ map: TEX.lava(), emissiveMap: TEX.lavaGlow(), emissive: 0xff6a10, emissiveIntensity: 1.6, roughness: 0.85 });
        m.glow = std({ color: 0xffb040, emissive: 0xff7a10, emissiveIntensity: 3, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false });
    } else if (look === 'rock') {
        m.body = std({ map: TEX.rock(), roughness: 0.95 });
        m.glow = std({ color: 0xffe9a0, emissive: 0xffc860, emissiveIntensity: 2.6 });
    } else if (look === 'ice') {
        m.body = std({ map: TEX.ice(), roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82, emissive: 0x2a7cc8, emissiveIntensity: 0.35 });
        m.glow = std({ color: 0x9fe6ff, emissive: 0x6ad0ff, emissiveIntensity: 2.2, transparent: true, opacity: 0.6, depthWrite: false });
        m.frost = std({ color: 0xffffff, roughness: 1 });
    } else if (look === 'shade') {
        m.body = std({ map: TEX.shade(), emissiveMap: TEX.shade(), emissive: 0x9ad8ff, emissiveIntensity: 0.9, roughness: 1, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
        m.glow = std({ color: 0xcffaff, emissive: 0x8ff0ff, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    } else if (look === 'worm') {
        m.body = std({ map: TEX.worm(), roughness: 0.8, metalness: 0.15 });
        m.mouth = std({ color: 0x5a1a14, roughness: 0.6, emissive: 0x2a0402, emissiveIntensity: 0.4, side: THREE.DoubleSide });
        m.teeth = std({ color: 0xf2ead6, roughness: 0.25, metalness: 0.1, emissive: 0x302010, emissiveIntensity: 0.2 });
    }
    _mats.set(look, m);
    return m;
}

// ------------------------------------------------------------------ the pieces of a walker
/** One limb segment's pieces (from 0 down to −len, thick `w`) in this look. Returns {body: [], glow: [], …} lists of geometries. */
function segment(look, len, w, r, out, { crown = false } = {}) {
    const add = (k, geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => (out[k] || (out[k] = [])).push({ geo: tinted(geo, C(c), r), pos, rot, scale: sc });
    if (look === 'rock') {
        // boulders piled along the bone, big ones in the middle, smaller to the ends; a few loose stones
        const n = Math.max(3, Math.round(len / w * 1.4));
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n, s = w * (0.75 + 0.35 * Math.sin(t * Math.PI)) * (0.85 + r() * 0.3);
            add('body', rough(new THREE.DodecahedronGeometry(s * 0.62, 1), r, 0.35), [0x9a968e, 0x86827a, 0xa8a49a][i % 3], [(r() - 0.5) * w * 0.25, -t * len, (r() - 0.5) * w * 0.25], [r() * 3, r() * 3, r() * 3], [1, 1.15, 1]);
        }
        for (let i = 0; i < 3; i++) add('body', rough(new THREE.DodecahedronGeometry(w * 0.2, 0), r, 0.5), 0x7a766e, [(r() - 0.5) * w, -r() * len, (r() - 0.5) * w], [r() * 3, r() * 3, 0]);
    } else if (look === 'iron') {
        // a tube of plates: an eight-sided cylinder of riveted iron, a heavy cuff at the joint, a glowing seam down the side
        add('body', new THREE.CylinderGeometry(w * 0.46, w * 0.4, len * 0.92, 8, 3), 0xa49e96, [0, -len / 2, 0]);
        add('body', new THREE.CylinderGeometry(w * 0.56, w * 0.56, len * 0.14, 8), 0x7c7670, [0, -len * 0.06, 0]);
        add('body', new THREE.TorusGeometry(w * 0.5, w * 0.06, 6, 12), 0x5c5650, [0, -len * 0.9, 0], [Math.PI / 2, 0, 0]);
        add('glow', new THREE.BoxGeometry(w * 0.05, len * 0.7, w * 0.05), 0xffffff, [w * 0.44, -len * 0.5, 0], [0, 0, 0.05]);
    } else if (look === 'lava') {
        // blobs of crusted lava, flowing into each other; drips of fire hang below
        const n = Math.max(3, Math.round(len / w * 1.3));
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; add('body', rough(new THREE.IcosahedronGeometry(w * (0.48 + 0.12 * Math.sin(t * Math.PI)), 2), r, 0.22), 0xffffff, [(r() - 0.5) * w * 0.15, -t * len, (r() - 0.5) * w * 0.15], [r(), r(), r()], [1, 1.3, 1]); }
        for (let i = 0; i < 2; i++) add('glow', new THREE.ConeGeometry(w * 0.08, w * 0.6, 6), 0xffffff, [(r() - 0.5) * w * 0.8, -len * (0.3 + r() * 0.6), w * 0.42], [Math.PI, 0, 0]);
    } else if (look === 'ice') {
        // a core of clear ice and shards of every size sticking out from it; frost on the upper faces
        add('body', rough(new THREE.CylinderGeometry(w * 0.42, w * 0.36, len, 6, 2), r, 0.12), 0xd8f0ff, [0, -len / 2, 0]);
        for (let i = 0; i < 4 + Math.round(len / w * 1.5); i++) add('body', new THREE.ConeGeometry(w * (0.08 + r() * 0.12), w * (0.4 + r() * 0.7), 5), 0xeaf8ff, [(r() - 0.5) * w * 0.6, -r() * len, (r() - 0.5) * w * 0.6], [(r() - 0.5) * 2.4, r() * 6, (r() - 0.5) * 2.4]);
        add('glow', new THREE.CylinderGeometry(w * 0.16, w * 0.12, len * 0.85, 6), 0xffffff, [0, -len / 2, 0]);
        if (crown) for (let i = 0; i < 9; i++) add('frost', new THREE.ConeGeometry(w * 0.12, w * (0.6 + r() * 0.9), 5), 0xffffff, [(r() - 0.5) * w * 0.8, w * 0.3, (r() - 0.5) * w * 0.8], [(r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6]);
    } else if (look === 'shade') {
        // mist: several soft, overlapping, slightly stretched blobs (no hard edge); points of starlight inside
        for (let i = 0; i < 3 + Math.round(len / w); i++) { const t = (i + 0.5) / (3 + Math.round(len / w)); add('body', rough(new THREE.SphereGeometry(w * (0.5 + r() * 0.2), 12, 8), r, 0.3), 0xffffff, [(r() - 0.5) * w * 0.3, -t * len, (r() - 0.5) * w * 0.3], [r(), r(), r()], [1, 1.4, 1]); }
    }
}

/** The head of a walker in its look (eyes on −z). */
function head(look, s, r, out) {
    const add = (k, geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => (out[k] || (out[k] = [])).push({ geo: tinted(geo, C(c), r, 0.05), pos, rot, scale: sc });
    const eyes = (y, z, sp, rr, k = 'glow') => { for (const sd of [-1, 1]) add(k, new THREE.SphereGeometry(rr, 10, 8), 0xffffff, [sd * sp, y, z], [0, 0, 0], [1.4, 0.6, 0.5]); };
    if (look === 'rock') {
        add('body', rough(new THREE.DodecahedronGeometry(s * 0.55, 1), r, 0.3), 0x9a968e, [0, 0, 0], [0, 0, 0], [1.1, 0.9, 1]);
        add('body', rough(new THREE.DodecahedronGeometry(s * 0.32, 0), r, 0.3), 0x86827a, [0, s * 0.42, s * 0.05], [0.4, 0.3, 0], [1.6, 0.5, 1]); // (the brow — a ledge of stone over the eyes)
        add('body', rough(new THREE.DodecahedronGeometry(s * 0.3, 0), r, 0.3), 0x7a766e, [0, -s * 0.4, -s * 0.2], [0, 0, 0], [1.4, 0.7, 1]); // (the jaw)
        eyes(s * 0.15, -s * 0.48, s * 0.2, s * 0.08);
    } else if (look === 'iron') {
        add('body', new THREE.CylinderGeometry(s * 0.42, s * 0.5, s * 0.9, 8), 0xa49e96, [0, 0, 0]); // (a great helm)
        add('body', new THREE.BoxGeometry(s * 0.95, s * 0.12, s * 0.2), 0x5c5650, [0, s * 0.1, -s * 0.42]); // (the visor ridge)
        add('body', new THREE.ConeGeometry(s * 0.12, s * 0.5, 4), 0x7c7670, [0, s * 0.6, 0]); // (the crest)
        add('glow', new THREE.BoxGeometry(s * 0.75, s * 0.07, s * 0.06), 0xffffff, [0, s * 0.02, -s * 0.47]); // (the eye-slit: the sun inside him)
    } else if (look === 'lava') {
        add('body', rough(new THREE.IcosahedronGeometry(s * 0.5, 2), r, 0.2), 0xffffff, [0, 0, 0], [0, 0, 0], [1, 1.1, 1]);
        eyes(s * 0.08, -s * 0.44, s * 0.18, s * 0.08);
        for (let i = 0; i < 9; i++) add('glow', new THREE.ConeGeometry(s * (0.1 + r() * 0.08), s * (0.6 + r() * 0.9), 6), 0xffffff, [(r() - 0.5) * s * 0.7, s * (0.55 + r() * 0.2), (r() - 0.3) * s * 0.6], [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.6]); // (hair of flames)
    } else if (look === 'ice') {
        add('body', rough(new THREE.IcosahedronGeometry(s * 0.5, 1), r, 0.25), 0xd8f0ff, [0, 0, 0]);
        for (let i = 0; i < 7; i++) add('body', new THREE.ConeGeometry(s * 0.1, s * (0.6 + r() * 0.7), 5), 0xeaf8ff, [(r() - 0.5) * s * 0.7, s * 0.45, (r() - 0.5) * s * 0.5], [(r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7]); // (a crown of icicles)
        eyes(s * 0.05, -s * 0.45, s * 0.18, s * 0.08);
    } else if (look === 'shade') {
        add('body', rough(new THREE.SphereGeometry(s * 0.5, 14, 10), r, 0.25), 0xffffff, [0, 0, 0], [0, 0, 0], [1, 1.25, 1]);
        add('body', new THREE.ConeGeometry(s * 0.5, s * 1.2, 12, 1, true), 0xffffff, [0, s * 0.3, s * 0.2], [-0.4, 0, 0]); // (a hood of mist)
        eyes(s * 0.02, -s * 0.46, s * 0.17, s * 0.07);
    }
}

/** A hand / a foot. */
function extremity(look, s, r, out, foot = false) {
    const add = (k, geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => (out[k] || (out[k] = [])).push({ geo: tinted(geo, C(c), r), pos, rot, scale: sc });
    if (foot) {
        if (look === 'rock') add('body', rough(new THREE.DodecahedronGeometry(s * 0.6, 1), r, 0.3), 0x86827a, [0, -s * 0.15, -s * 0.25], [0, 0, 0], [1.1, 0.55, 1.5]);
        else if (look === 'iron') { add('body', new THREE.BoxGeometry(s * 0.9, s * 0.4, s * 1.5), 0x7c7670, [0, -s * 0.2, -s * 0.3]); add('body', new THREE.CylinderGeometry(s * 0.3, s * 0.3, s * 0.95, 8), 0x5c5650, [0, -s * 0.2, -s * 1.0], [0, 0, Math.PI / 2]); }
        else if (look === 'lava') add('body', rough(new THREE.IcosahedronGeometry(s * 0.55, 2), r, 0.25), 0xffffff, [0, -s * 0.12, -s * 0.25], [0, 0, 0], [1, 0.55, 1.5]);
        else if (look === 'ice') add('body', rough(new THREE.IcosahedronGeometry(s * 0.55, 1), r, 0.25), 0xd8f0ff, [0, -s * 0.12, -s * 0.25], [0, 0, 0], [1, 0.5, 1.5]);
        else if (look === 'shade') add('body', rough(new THREE.SphereGeometry(s * 0.55, 10, 6), r, 0.4), 0xffffff, [0, -s * 0.1, -s * 0.1], [0, 0, 0], [1.2, 0.5, 1.4]);
        return;
    }
    // a hand: a palm and four thick fingers (curled a little) and a thumb
    const palm = look === 'iron' ? new THREE.BoxGeometry(s * 0.7, s * 0.55, s * 0.35) : rough(new THREE.IcosahedronGeometry(s * 0.4, 1), r, 0.25);
    const col = look === 'rock' ? 0x8c887f : look === 'iron' ? 0x8c867e : look === 'ice' ? 0xd8f0ff : 0xffffff;
    add('body', palm, col, [0, -s * 0.25, 0]);
    for (let i = 0; i < 4; i++) {
        const fx = (i - 1.5) * s * 0.17, fl = s * (0.42 + (i === 1 || i === 2 ? 0.06 : 0));
        const fg = look === 'iron' ? new THREE.BoxGeometry(s * 0.13, fl, s * 0.14) : look === 'ice' ? new THREE.ConeGeometry(s * 0.08, fl * 1.2, 5) : rough(new THREE.CylinderGeometry(s * 0.075, s * 0.065, fl, 6, 2), r, 0.15);
        add('body', fg, col, [fx, -s * 0.62, -s * 0.06], [look === 'ice' ? Math.PI : -0.25, 0, 0]);
    }
    add('body', look === 'iron' ? new THREE.BoxGeometry(s * 0.14, s * 0.35, s * 0.14) : rough(new THREE.CylinderGeometry(s * 0.08, s * 0.07, s * 0.35, 6, 2), r, 0.15), col, [s * 0.4, -s * 0.3, -s * 0.12], [0, 0, 0.7]);
}

// ------------------------------------------------------------------ a walker
const BUILD = { iron: 1, lava: 2, rock: 3, ice: 4, shade: 5 };
/** A walker titan 1 unit tall (feet at y 0, facing −z). userData.rig — its joints; userData.glow — materials to pulse. */
function walker(look) {
    const r = rng(BUILD[look] * 7919);
    const M = mats(look), root = new THREE.Group();
    root.name = 'titan-' + look;
    const bulk = look === 'rock' ? 1.25 : look === 'iron' ? 1.05 : look === 'shade' ? 0.9 : 1; // (the rock one massive, the shade thin)
    const mk = (parts) => {
        const g = new THREE.Group();
        for (const [k, list] of Object.entries(parts)) {
            if (!list.length || !M[k]) continue;
            const mesh = new THREE.Mesh(mergeParts(list), M[k]);
            mesh.castShadow = k === 'body'; mesh.receiveShadow = false;
            g.add(mesh);
        }
        return g;
    };
    const part = (fn) => { const o = {}; fn(o); return mk(o); };
    // proportions of a heavy giant: long arms, short neck, the chest broad
    const legL = 0.42, thighW = 0.1 * bulk, armL = 0.36, armW = 0.075 * bulk, chestW = 0.34 * bulk;
    const hips = new THREE.Group(); hips.position.y = legL; root.add(hips);
    hips.add(part((o) => segment(look, 0.1, chestW * 0.75, r, o)));
    const chest = new THREE.Group(); chest.position.y = 0.05; hips.add(chest);
    chest.add(part((o) => {
        const add = (k, geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => (o[k] || (o[k] = [])).push({ geo: tinted(geo, C(c), r), pos, rot, scale: sc });
        if (look === 'iron') {
            add('body', new THREE.CylinderGeometry(chestW * 0.62, chestW * 0.44, 0.34, 8, 2), 0xa49e96, [0, 0.17, 0], [0, Math.PI / 8, 0], [1.25, 1, 0.8]);
            for (let i = 0; i < 4; i++) add('body', new THREE.BoxGeometry(chestW * 1.1 - i * 0.04, 0.025, chestW * 0.75), 0x6c6660, [0, 0.03 + i * 0.07, 0]); // (the lames of the belly)
            for (const sd of [-1, 1]) add('body', new THREE.SphereGeometry(chestW * 0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x8c867e, [sd * chestW * 0.72, 0.31, 0], [0, 0, sd * -0.4], [1, 0.8, 1]); // (the pauldrons)
            o.mirror = [{ geo: tinted(new THREE.CircleGeometry(chestW * 0.3, 24), C(0xffffff), r, 0), pos: [0, 0.21, -chestW * 0.41], rot: [0, Math.PI, 0] }];
            add('body', new THREE.TorusGeometry(chestW * 0.31, 0.012, 6, 24), 0x5c5650, [0, 0.21, -chestW * 0.4]);
            for (let i = 0; i < 6; i++) add('glow', new THREE.BoxGeometry(0.006, 0.08 + r() * 0.1, 0.006), 0xffffff, [(r() - 0.5) * chestW, 0.06 + r() * 0.2, -chestW * 0.35], [0, 0, (r() - 0.5) * 1.2]); // (the cracks)
        } else segment(look, 0.36, chestW, r, o);
    }));
    const neck = new THREE.Group(); neck.position.y = 0.38; chest.add(neck);
    const hd = new THREE.Group(); hd.position.y = 0.07; neck.add(hd);
    hd.add(part((o) => head(look, 0.15 * (look === 'rock' ? 0.85 : 1), r, o)));
    const arm = (sd) => {
        const sh = new THREE.Group(); sh.position.set(sd * chestW * 0.82, 0.32, 0); chest.add(sh);
        sh.add(part((o) => segment(look, armL * 0.5, armW, r, o)));
        const el = new THREE.Group(); el.position.y = -armL * 0.5; sh.add(el);
        el.add(part((o) => segment(look, armL * 0.5, armW * 0.9, r, o)));
        const hand = new THREE.Group(); hand.position.y = -armL * 0.5; el.add(hand);
        hand.add(part((o) => extremity(look, armW * 1.4, r, o)));
        return { sh, el, hand };
    };
    const leg = (sd) => {
        const hp = new THREE.Group(); hp.position.set(sd * chestW * 0.42, 0, 0); hips.add(hp);
        hp.add(part((o) => segment(look, legL * 0.5, thighW, r, o)));
        const kn = new THREE.Group(); kn.position.y = -legL * 0.5; hp.add(kn);
        kn.add(part((o) => segment(look, legL * 0.5, thighW * 0.85, r, o)));
        const ft = new THREE.Group(); ft.position.y = -legL * 0.5; kn.add(ft);
        ft.add(part((o) => extremity(look, thighW * 1.3, r, o, true)));
        return { hp, kn, ft };
    };
    const L = arm(-1), R = arm(1), LL = leg(-1), RL = leg(1);
    if (look === 'ice') hd.add(part((o) => segment('ice', 0.01, 0.12, r, o, { crown: true })));
    root.userData.rig = { hips, chest, neck, head: hd, armL: L, armR: R, legL: LL, legR: RL };
    root.userData.glow = [M.glow, M.body].filter(Boolean);
    root.userData.look = look;
    return root;
}

// ------------------------------------------------------------------ the sandworm
/** The sandworm (Mars): `n` rings of armour (each a Group the game lays along its path), a head with a three-petal mouth. 1 unit thick. */
function worm(n = 30) {
    const r = rng(4211), M = mats('worm'), root = new THREE.Group();
    root.name = 'titan-worm';
    // one ring: a short barrel of plates, the plate edges standing out, a crest of spines on top, the soft fold between rings darker
    const ringParts = [];
    const add = (geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => ringParts.push({ geo: tinted(geo, C(c), r, 0.08), pos, rot, scale: sc });
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 20, 2, true), 0xc89a70, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.505, 0.035, 6, 24), 0x8a6040, [0, 0, -0.2]);
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 20, 1, true), 0x4a2e1c, [0, 0, 0.23], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.035, 0.16, 5), 0x6a4630, [Math.sin((i - 2) * 0.35) * 0.5, Math.cos((i - 2) * 0.35) * 0.5 + 0.03, 0], [0, 0, -(i - 2) * 0.35]);
    const ringGeo = mergeParts(ringParts);
    ringGeo.userData.shared = true;
    const rings = [];
    for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const m = new THREE.Mesh(ringGeo, M.body);
        const k = i < 3 ? 0.88 + i * 0.04 : i > n - 8 ? Math.max(0.35, 1 - (i - (n - 8)) * 0.09) : 1; // (the tail thinning)
        m.scale.setScalar(k);
        m.castShadow = true;
        g.add(m);
        root.add(g);
        rings.push(g);
    }
    // the head: a heavy collar, three petals (each a curved shell, toothed inside) that open to a round maw ringed with crystal teeth
    const headG = new THREE.Group();
    const collar = [];
    collar.push({ geo: tinted(new THREE.CylinderGeometry(0.56, 0.5, 0.5, 24, 2, true), C(0xb08460), r), pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0] });
    collar.push({ geo: tinted(new THREE.TorusGeometry(0.56, 0.05, 8, 28), C(0x6a4630), r), pos: [0, 0, -0.25] });
    const collarMesh = new THREE.Mesh(mergeParts(collar), M.body); collarMesh.castShadow = true; headG.add(collarMesh);
    // the maw inside: a dark throat (a cone inwards) and three rings of teeth, each ring smaller and deeper
    headG.add(new THREE.Mesh(mergeParts([{ geo: tinted(new THREE.ConeGeometry(0.5, 1.2, 24, 1, true), C(0x3a0a08), r, 0), pos: [0, 0, 0.35], rot: [-Math.PI / 2, 0, 0] }]), M.mouth));
    const teeth = [];
    for (let ring = 0; ring < 3; ring++) {
        const rr = 0.46 - ring * 0.1, z = -0.15 + ring * 0.18, cnt = 22 - ring * 4;
        for (let i = 0; i < cnt; i++) { const a = (i / cnt) * Math.PI * 2 + ring * 0.2; teeth.push({ geo: tinted(new THREE.ConeGeometry(0.022, 0.13 - ring * 0.02, 4), C(0xf2ead6), r, 0.1), pos: [Math.cos(a) * rr, Math.sin(a) * rr, z], rot: [0, 0, a + Math.PI / 2], scale: [1, 1, 1] }); }
    }
    headG.add(new THREE.Mesh(mergeParts(teeth), M.teeth));
    const petals = [];
    for (let i = 0; i < 3; i++) {
        const piv = new THREE.Group(); piv.rotation.z = (i / 3) * Math.PI * 2; headG.add(piv);
        const hinge = new THREE.Group(); hinge.position.set(0, 0.5, -0.25); piv.add(hinge);
        const pp = [];
        // a petal: a curved shell (a part of a sphere) of armour, its inner face lined with teeth
        pp.push({ geo: tinted(new THREE.SphereGeometry(0.62, 16, 10, -Math.PI / 3, (Math.PI * 2) / 3, 0, Math.PI / 2.2), C(0xc09068), r), pos: [0, -0.5, 0], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 1.3] });
        const shell = new THREE.Mesh(mergeParts(pp), M.body); shell.castShadow = true; hinge.add(shell);
        const pt = [];
        for (let k = 0; k < 9; k++) pt.push({ geo: tinted(new THREE.ConeGeometry(0.02, 0.12, 4), C(0xf2ead6), r, 0.1), pos: [(k - 4) * 0.08, -0.15 - Math.abs(k - 4) * 0.03, -0.55], rot: [Math.PI / 2 + 0.6, 0, 0] });
        hinge.add(new THREE.Mesh(mergeParts(pt), M.teeth));
        petals.push(hinge);
    }
    root.add(headG);
    root.userData.rig = { rings, head: headG, petals };
    root.userData.look = 'worm';
    root.userData.glow = [];
    return root;
}

// ------------------------------------------------------------------ the living storm
let _stormMat = null;
/** The funnel's material: a cloud texture wound round and rising (uT), lit from within by the lightning (uFlash). */
function stormMaterial() {
    if (_stormMat) return _stormMat;
    const m = new THREE.MeshBasicMaterial({ map: TEX.storm(), color: 0xf0d8b8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    m.userData.shared = true;
    m.userData.uT = { value: 0 }; m.userData.uFlash = { value: 0 };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uT = m.userData.uT; sh.uniforms.uFlash = m.userData.uFlash;
        sh.fragmentShader = 'uniform float uT; uniform float uFlash;\n' + sh.fragmentShader
            .replace('#include <map_fragment>', `
                vec2 suv = vec2(vUv.x * 3.0 + uT * 0.35 + vUv.y * 1.5, vUv.y * 2.0 - uT * 0.12);
                vec4 tc = texture2D(map, suv);
                vec4 tc2 = texture2D(map, suv * vec2(0.5, 1.3) + vec2(0.37, uT * 0.05));
                float a = clamp(tc.a * 0.6 + max(tc.r, tc2.r) * 0.9, 0.0, 1.0);
                diffuseColor.rgb *= mix(vec3(0.55, 0.45, 0.4), vec3(1.0), max(tc.r, tc2.g)) + uFlash * vec3(0.6, 0.7, 1.0);
                diffuseColor.a *= a * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);`);
    };
    m.customProgramCacheKey = () => 'titan-storm';
    _stormMat = m;
    return m;
}
/** Jupiter's titan: 1 unit tall — three funnels (a lathe of the whirl's profile) turning at their own speeds, a face, a debris ring. */
function storm() {
    const root = new THREE.Group();
    root.name = 'titan-storm';
    const mat = stormMaterial(), funnels = [];
    for (let k = 0; k < 3; k++) {
        const pts = [];
        for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector2((0.035 + 0.22 * t ** 1.6 + 0.02 * Math.sin(t * 9 + k)) * (1 + k * 0.12), t)); }
        const geo = new THREE.LatheGeometry(pts, 32);
        geo.userData.shared = true;
        const f = new THREE.Mesh(geo, mat);
        f.renderOrder = 2;
        root.add(f);
        funnels.push(f);
    }
    // the face in the whirl at 2/3 of the height: two burning eyes and a dark, howling mouth
    const face = new THREE.Group(); face.position.set(0, 0.68, -0.17); root.add(face);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.95 }); eyeM.userData.shared = true;
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeM); e.scale.set(1.8, 0.7, 0.6); e.position.set(sd * 0.045, 0, 0); face.add(e); }
    const mouthM = new THREE.MeshBasicMaterial({ color: 0x1a0c06, transparent: true, opacity: 0.7, depthWrite: false }); mouthM.userData.shared = true;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), mouthM); mouth.scale.set(1.3, 0.7, 1); mouth.position.set(0, -0.07, 0); mouth.rotation.y = Math.PI; face.add(mouth);
    // the debris it carries: rocks and clods (one InstancedMesh, the game turns them round)
    const debM = new THREE.MeshStandardMaterial({ color: 0x7a5638, roughness: 1 }); debM.userData.shared = true;
    const deb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.006, 0), debM, 60);
    root.add(deb);
    root.userData.rig = { funnels, face, mouth, debris: deb };
    root.userData.look = 'storm';
    root.userData.glow = [];
    root.userData.stormMat = mat;
    return root;
}

/** A titan's body by its look. */
export function titanModel(look) {
    if (look === 'worm') return worm();
    if (look === 'storm') return storm();
    return walker(look);
}

/** Shapes and materials to compile on the loading screen (Game.prewarm): one body of each look. */
export function titanSamples() {
    return ['iron', 'lava', 'rock', 'ice', 'shade', 'worm', 'storm'].map((l) => titanModel(l));
}

/**
 * Pose a walker (the joints): `walk` 0…1 the step phase (0…2π in `ph`), `blow` 0…1 a blow's wind-up → strike (arm 'R'), `stomp` 0…1.
 * Heavy and slow: the body sways from side to side, the arms swing against the legs.
 */
export function poseWalker(model, { ph = 0, k = 0, blow = 0, arm = 1, stomp = 0, breathe = 0 } = {}) {
    const R = model.userData.rig;
    if (!R || !R.legL) return;
    const s = Math.sin(ph) * k, c = Math.cos(ph) * k;
    R.legL.hp.rotation.x = s * 0.55; R.legR.hp.rotation.x = -s * 0.55;
    R.legL.kn.rotation.x = Math.max(0, -c) * 0.8; R.legR.kn.rotation.x = Math.max(0, c) * 0.8;
    R.legL.ft.rotation.x = -s * 0.2; R.legR.ft.rotation.x = s * 0.2;
    R.hips.rotation.z = s * 0.05; R.hips.position.y = 0.42 - Math.abs(c) * 0.012 * k;
    R.chest.rotation.z = -s * 0.04; R.chest.rotation.x = 0.06 + Math.sin(breathe) * 0.015;
    R.armL.sh.rotation.x = -s * 0.45; R.armR.sh.rotation.x = s * 0.45;
    R.armL.el.rotation.x = -0.35 - Math.max(0, s) * 0.3; R.armR.el.rotation.x = -0.35 - Math.max(0, -s) * 0.3;
    R.armL.sh.rotation.z = -0.12; R.armR.sh.rotation.z = 0.12;
    if (blow > 0) {
        // the wind-up (arm raised high and back), then the strike down and forward
        const A = arm > 0 ? R.armR : R.armL, up = blow < 0.6 ? blow / 0.6 : 1 - (blow - 0.6) / 0.4;
        A.sh.rotation.x = blow < 0.6 ? -2.6 * up : -2.6 + (blow - 0.6) / 0.4 * 3.4;
        A.el.rotation.x = -0.9 * up;
        R.chest.rotation.y = (arm > 0 ? -1 : 1) * 0.35 * up;
    }
    if (stomp > 0) { const L = R.legR, up = stomp < 0.6 ? stomp / 0.6 : 1 - (stomp - 0.6) / 0.4; L.hp.rotation.x = -1.1 * up; L.kn.rotation.x = 1.0 * up; }
    R.head.rotation.x = -0.08 + Math.sin(breathe * 0.7) * 0.03;
}
