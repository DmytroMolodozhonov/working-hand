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
    (t.userData || (t.userData = {})).shared = true; // (this three's textures may have no userData)
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
/** A lathe of a profile [[y, r], …] (bottom → top), its round cut squeezed to an oval (sx across, sz front-back). */
function lathe(profile, segs, sx = 1, sz = 1) {
    const g = new THREE.LatheGeometry(profile.map(([y, rr]) => new THREE.Vector2(Math.max(0.0005, rr), y)), segs);
    g.scale(sx, 1, sz);
    return g;
}
/** The torso of a giant, hips (0) to the neck (~0.49): a broad chest, a narrower waist, heavy shoulders. Radii × the chest's half-width. */
const TORSO = [[-0.04, 0.48], [0.03, 0.62], [0.1, 0.6], [0.17, 0.56], [0.24, 0.7], [0.31, 0.9], [0.37, 1.0], [0.42, 0.94], [0.46, 0.62], [0.5, 0.3]];
/** A limb from its joint (0) down to −len: rounded over the joint, a muscle's bulge in the upper third, tapering to the next joint. */
const limbProfile = (len, r0, r1) => [[-len - r1 * 0.3, r1 * 0.2], [-len, r1 * 0.9], [-len * 0.85, r1 * 1.02], [-len * 0.6, (r0 + r1) * 0.55], [-len * 0.35, r0 * 1.14], [-len * 0.12, r0 * 1.06], [0, r0 * 0.9], [r0 * 0.5, r0 * 0.45], [r0 * 0.8, 0.0005]];
const LOOK = {
    iron: { segs: 8, rough: 0, col: 0xa49e96 },
    rock: { segs: 9, rough: 0.22, col: 0x9a968e },
    lava: { segs: 14, rough: 0.14, col: 0xffffff },
    ice: { segs: 7, rough: 0.18, col: 0xd8f0ff },
    shade: { segs: 16, rough: 0.28, col: 0xffffff },
};
const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3(), _sup = new THREE.Vector3(0, 1, 0), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3();
/** Points on a shape's surface: `n` random triangles → fn(centre, normal) (centres and normals in the shape's own space). */
function scatter(geo, n, r, fn) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, tris = p.count / 3;
    for (let k = 0; k < n; k++) {
        const t = Math.floor(r() * tris) * 3;
        _sa.fromBufferAttribute(p, t); _sb.fromBufferAttribute(p, t + 1); _sc.fromBufferAttribute(p, t + 2);
        const c = new THREE.Vector3().add(_sa).add(_sb).add(_sc).multiplyScalar(1 / 3);
        const nrm = new THREE.Vector3().subVectors(_sb, _sa).cross(new THREE.Vector3().subVectors(_sc, _sa)).normalize();
        if (nrm.lengthSq() < 0.5) continue;
        fn(c, nrm);
    }
}
/** A piece set on a surface, standing out along the normal (its local +Y along the normal), as a merged part with its own matrix. */
function onSurface(out, k, geo, c, nrm, lift, scale, spin, col, r) {
    _sq.setFromUnitVectors(_sup, nrm);
    if (spin) _sq.multiply(new THREE.Quaternion().setFromAxisAngle(_sup, spin));
    _sp.copy(c).addScaledVector(nrm, lift);
    _sm.compose(_sp, _sq, _ss.set(scale[0], scale[1], scale[2]));
    (out[k] || (out[k] = [])).push({ geo: tinted(geo, C(col), r), matrix: _sm.clone() });
}
/**
 * A body part of a walker in its look: the base shape (one piece, no gaps — joints are rounded over) and its skin on it: boulders on the
 * rock one, riveted bands and glowing cracks on the iron one, crust plates and dripping fire on the lava one, shards and an inner glow on the
 * ice one, shells of mist on the shade. `size` — how big the part is (the count of the details follows it).
 */
function bodyPart(look, base, size, r, out) {
    const L = LOOK[look];
    let g = base;
    if (L.rough) g = rough(g.index ? g.toNonIndexed() : g, r, L.rough);
    (out.body || (out.body = [])).push({ geo: tinted(g, C(L.col), r, 0.08), pos: [0, 0, 0] });
    const n = Math.max(4, Math.round(size * 90));
    if (look === 'rock') {
        // boulders and slabs grown out of it: the body reads as a walking mountain, not a smooth figure
        scatter(base, n, r, (c, nrm) => { const s = 0.018 + r() * 0.035; onSurface(out, 'body', rough(new THREE.DodecahedronGeometry(1, 0), r, 0.45), c, nrm, s * 0.25, [s, s * (0.6 + r() * 0.5), s], r() * 6, [0x8e8a82, 0x7c7870, 0xa6a298][Math.floor(r() * 3)], r); });
        scatter(base, Math.round(n * 0.25), r, (c, nrm) => { const s = 0.006 + r() * 0.01; onSurface(out, 'body', new THREE.DodecahedronGeometry(1, 0), c, nrm, s * 0.6, [s, s, s], r() * 6, 0x6e6a64, r); }); // (pebbles)
        scatter(base, Math.max(1, Math.round(n * 0.06)), r, (c, nrm) => { if (nrm.z < 0.3) return; onSurface(out, 'glow', new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), c, nrm, 0.002, [1, 1, 1], 0, 0xffffff, r); }); // (light in a crack)
    } else if (look === 'iron') {
        // rivets in rows, hammered plates riding over the base, white sunlight through a few cracks
        scatter(base, n * 2, r, (c, nrm) => onSurface(out, 'body', new THREE.SphereGeometry(1, 6, 4), c, nrm, 0.001, [0.0055, 0.004, 0.0055], 0, 0x5c5650, r));
        scatter(base, Math.round(n * 0.35), r, (c, nrm) => onSurface(out, 'body', new THREE.BoxGeometry(1, 1, 1), c, nrm, 0.004, [0.05 + r() * 0.04, 0.008, 0.035 + r() * 0.03], r() * 0.6, [0x8c867e, 0x6c6660, 0xb0aaa2][Math.floor(r() * 3)], r));
        scatter(base, Math.max(2, Math.round(n * 0.08)), r, (c, nrm) => onSurface(out, 'glow', new THREE.BoxGeometry(1, 1, 1), c, nrm, 0.002, [0.004, 0.003, 0.05 + r() * 0.06], r() * 3, 0xffffff, r));
    } else if (look === 'lava') {
        // crust plates of cooling basalt floating on the glowing body; drops of fire hanging under
        scatter(base, n, r, (c, nrm) => { const s = 0.02 + r() * 0.03; onSurface(out, 'body', rough(new THREE.IcosahedronGeometry(1, 0), r, 0.3), c, nrm, s * 0.15, [s, s * 0.35, s], r() * 6, 0x2a1a14, r); });
        scatter(base, Math.max(2, Math.round(n * 0.15)), r, (c, nrm) => { if (nrm.y > -0.2) return; onSurface(out, 'glow', new THREE.ConeGeometry(1, 1, 6), c, nrm, 0.01, [0.01, -0.05 - r() * 0.04, 0.01], 0, 0xffffff, r); });
    } else if (look === 'ice') {
        // shards of every size growing out of the clear body; a cold light inside
        scatter(base, n, r, (c, nrm) => { const s = 0.008 + r() * 0.015; onSurface(out, 'body', new THREE.ConeGeometry(1, 1, 5), c, nrm.clone().add(new THREE.Vector3((r() - 0.5) * 0.6, r() * 0.4, (r() - 0.5) * 0.6)).normalize(), s * 2, [s, s * (4 + r() * 6), s], r() * 6, 0xeaf8ff, r); });
        (out.glow || (out.glow = [])).push({ geo: tinted(base.clone(), C(0xffffff), r, 0), pos: [0, 0, 0], scale: [0.55, 0.98, 0.55] });
        scatter(base, Math.round(n * 0.3), r, (c, nrm) => { if (nrm.y < 0.4) return; onSurface(out, 'frost', new THREE.SphereGeometry(1, 6, 4), c, nrm, 0.002, [0.02, 0.006, 0.02], 0, 0xffffff, r); }); // (snow on the upper faces)
    } else if (look === 'shade') {
        // shells of mist round the body, each looser and fainter: no hard edge
        for (const k of [1.14, 1.3]) (out.body || (out.body = [])).push({ geo: tinted(rough(base.clone().toNonIndexed(), r, 0.4), C(0xffffff), r, 0), pos: [0, 0, 0], scale: [k, 1 + (k - 1) * 0.4, k] });
    }
}

const BUILD = { iron: 1, lava: 2, rock: 3, ice: 4, shade: 5 };
/** A walker titan 1 unit tall (feet at y 0, facing −z). userData.rig — its joints; userData.glow — materials to pulse. */
function walker(look) {
    const r = rng(BUILD[look] * 7919);
    const M = mats(look), root = new THREE.Group();
    root.name = 'titan-' + look;
    const bulk = look === 'rock' ? 1.25 : look === 'iron' ? 1.05 : look === 'shade' ? 0.9 : 1; // (the rock one massive, the shade thin)
    const segs = LOOK[look].segs;
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
    // the proportions of a heavy giant: long thick arms, short legs, a broad chest, the head low between the shoulders
    const legL = 0.4, thighR = 0.062 * bulk, armL = 0.4, armR = 0.05 * bulk, chestR = 0.17 * bulk;
    const hips = new THREE.Group(); hips.position.y = legL + 0.02; root.add(hips);
    const chest = new THREE.Group(); chest.position.y = 0.0; hips.add(chest);
    chest.add(part((o) => {
        bodyPart(look, lathe(TORSO.map(([y, k]) => [y, k * chestR]), segs, 1.3, 0.78), 1.2, r, o);
        if (look === 'iron') {
            const add = (k, geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => (o[k] || (o[k] = [])).push({ geo: tinted(geo, C(c), r), pos, rot, scale: sc });
            for (const sd of [-1, 1]) add('body', new THREE.SphereGeometry(chestR * 0.62, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x8c867e, [sd * chestR * 1.2, 0.41, 0], [0, 0, sd * -0.45], [1, 0.75, 1]); // (the pauldrons)
            for (let i = 0; i < 4; i++) add('body', new THREE.TorusGeometry(chestR * (0.62 + i * 0.02), 0.006, 5, 16), 0x5c5650, [0, 0.06 + i * 0.045, 0], [Math.PI / 2, 0, 0], [1.3, 0.78, 1]); // (the lames of the belly)
            o.mirror = [{ geo: tinted(new THREE.CircleGeometry(chestR * 0.42, 28), C(0xffffff), r, 0), pos: [0, 0.32, -chestR * 0.77], rot: [0, Math.PI, 0] }];
            add('body', new THREE.TorusGeometry(chestR * 0.43, 0.01, 6, 28), 0x4c4640, [0, 0.32, -chestR * 0.76]);
        }
    }));
    const neck = new THREE.Group(); neck.position.y = look === "iron" ? 0.55 : 0.5; chest.add(neck); // (the head rises clear of the shoulders: it was sunk to the crest)
    const hd = new THREE.Group(); hd.position.y = 0.06; neck.add(hd);
    hd.add(part((o) => head(look, 0.13 * (look === 'rock' ? 0.85 : 1), r, o)));
    const arm = (sd) => {
        const sh = new THREE.Group(); sh.position.set(sd * chestR * 1.18, 0.39, 0); chest.add(sh);
        sh.add(part((o) => bodyPart(look, lathe(limbProfile(armL * 0.5, armR * 1.15, armR * 0.85), segs), 0.35, r, o)));
        const el = new THREE.Group(); el.position.y = -armL * 0.5; sh.add(el);
        el.add(part((o) => bodyPart(look, lathe(limbProfile(armL * 0.5, armR * 0.95, armR * 0.75), segs), 0.3, r, o)));
        const hand = new THREE.Group(); hand.position.y = -armL * 0.5; el.add(hand);
        hand.add(part((o) => extremity(look, armR * (look === 'iron' ? 1.9 : 2.4), r, o)));
        return { sh, el, hand };
    };
    const leg = (sd) => {
        const hp = new THREE.Group(); hp.position.set(sd * chestR * 0.55, 0, 0); hips.add(hp);
        hp.add(part((o) => bodyPart(look, lathe(limbProfile(legL * 0.5, thighR * 1.1, thighR * 0.85), segs), 0.4, r, o)));
        const kn = new THREE.Group(); kn.position.y = -legL * 0.5; hp.add(kn);
        kn.add(part((o) => bodyPart(look, lathe(limbProfile(legL * 0.5, thighR * 0.92, thighR * 0.8), segs), 0.35, r, o)));
        const ft = new THREE.Group(); ft.position.y = -legL * 0.5; kn.add(ft);
        ft.add(part((o) => extremity(look, thighR * 2.2, r, o, true)));
        return { hp, kn, ft };
    };
    const L = arm(-1), R = arm(1), LL = leg(-1), RL = leg(1);
    if (look === 'ice') hd.add(part((o) => segment('ice', 0.01, 0.12, r, o, { crown: true })));
    const rig = { hips, chest, neck, head: hd, armL: L, armR: R, legL: LL, legR: RL, prop: null, club: null, chips: [], blades: [], shell: [] };
    props(look, rig, M, r, { chestR, armR });
    root.userData.rig = rig;
    root.userData.glow = [M.glow, M.body].filter(Boolean);
    root.userData.look = look;
    return root;
}

/**
 * What a walker carries and what can fall off it (each a Group on a joint):
 *   iron  `prop` — the smith's hammer in its right fist (the handle along the forearm, the head beyond the fist: a blow lands head
 *         first); `blades` — the weapons its magnet tore away, stuck to its breast (hidden until then — Titans.js shows them)
 *   ice   `prop` — a double-headed glaive of ice held across the fist (upright when the forearm is level); `shell` — plates of ice
 *         grown over its body at the second stage (hidden)
 *   rock  `chips` — boulders piled on its shoulders and back that break off as it is hurt; `club` — a pillar of stone torn from the
 *         ground at the third stage (hidden)
 * The hands' frame: the forearm runs along −y; local z is down when the forearm is level forward.
 */
function props(look, R, M, r, { chestR, armR }) {
    const mk = (parts, mat) => { const m = new THREE.Mesh(mergeParts(parts), mat); m.castShadow = true; return m; };
    const hand = R.armR.hand;
    if (look === 'iron') {
        const g = new THREE.Group(); hand.add(g);
        const P = [];
        P.push({ geo: tinted(new THREE.CylinderGeometry(armR * 0.32, armR * 0.38, 0.3, 8), C(0x4a3a2a), r), pos: [0, -0.15, 0] }); // (the haft: dark, iron-bound)
        for (let i = 0; i < 4; i++) P.push({ geo: tinted(new THREE.CylinderGeometry(armR * 0.42, armR * 0.42, 0.012, 8), C(0x6c6660), r), pos: [0, -0.04 - i * 0.07, 0] });
        P.push({ geo: tinted(new THREE.BoxGeometry(armR * 2.6, armR * 1.5, armR * 1.5), C(0x7c766e), r), pos: [0, -0.31, 0] }); // (the head)
        for (const sd of [-1, 1]) P.push({ geo: tinted(new THREE.CylinderGeometry(armR * 0.85, armR * 0.75, armR * 0.5, 8), C(0x5c5650), r), pos: [sd * armR * 1.5, -0.31, 0], rot: [0, 0, Math.PI / 2] }); // (the faces, worn bright)
        g.add(mk(P, M.body));
        R.prop = g;
        // the stuck weapons: four blades across its breast (the game shows as many as it took)
        for (let i = 0; i < 4; i++) {
            const b = new THREE.Group();
            b.position.set((i - 1.5) * chestR * 0.35, 0.22 + (i % 2) * 0.08, -chestR * 0.8);
            b.rotation.set(0.5 + r() * 0.4, (r() - 0.5) * 0.6, (r() - 0.5) * 1.2);
            b.add(mk([{ geo: tinted(new THREE.BoxGeometry(0.006, 0.07, 0.002), C(0xd8dce0), r, 0.04), pos: [0, 0.035, 0] }, { geo: tinted(new THREE.BoxGeometry(0.018, 0.004, 0.004), C(0x8a6a2a), r), pos: [0, 0, 0] }, { geo: tinted(new THREE.CylinderGeometry(0.002, 0.002, 0.016, 5), C(0x3a2a1a), r), pos: [0, -0.009, 0] }], M.body));
            b.visible = false;
            R.chest.add(b);
            R.blades.push(b);
        }
    } else if (look === 'ice') {
        const g = new THREE.Group(); hand.add(g);
        const P = [], G = [];
        P.push({ geo: tinted(new THREE.CylinderGeometry(armR * 0.22, armR * 0.22, 0.95, 6), C(0xd8f0ff), r), pos: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] });
        for (const end of [-1, 1]) {
            const z = 0.1 + end * 0.48;
            G.push({ geo: tinted(new THREE.OctahedronGeometry(armR * 0.9, 0), C(0xffffff), r), pos: [0, 0, z + end * armR * 0.6], rot: [Math.PI / 2, 0, 0], scale: [0.55, 2.6, 0.55] }); // (a long crystal point)
            for (let k = 0; k < 3; k++) P.push({ geo: tinted(new THREE.ConeGeometry(armR * 0.25, armR * 1.4, 5), C(0xbfe6ff), r), pos: [Math.cos(k * 2.1) * armR * 0.5, Math.sin(k * 2.1) * armR * 0.5, z], rot: [Math.PI / 2 * end, 0, k], scale: [1, 1, 1] }); // (the barbs)
        }
        g.add(mk(P, M.body));
        const gl = new THREE.Mesh(mergeParts(G), M.glow); g.add(gl);
        R.prop = g;
        // the shell (stage 2): thick plates of clouded ice on the chest, shoulders and thighs
        const at = [[R.chest, 0, 0.25, -chestR * 0.85, 1.6], [R.chest, 0, 0.25, chestR * 0.85, 1.6], [R.armL.sh, 0, -0.08, 0, 1.1], [R.armR.sh, 0, -0.08, 0, 1.1], [R.legL.hp, 0, -0.1, 0, 1.2], [R.legR.hp, 0, -0.1, 0, 1.2], [R.chest, chestR * 0.9, 0.35, 0, 1], [R.chest, -chestR * 0.9, 0.35, 0, 1]];
        for (const [j, x, y, z, s] of at) {
            const parts = [];
            for (let k = 0; k < 5; k++) parts.push({ geo: tinted(new THREE.OctahedronGeometry(0.035 * s, 0), C(0xeaf8ff), r), pos: [(r() - 0.5) * 0.06 * s, (r() - 0.5) * 0.08 * s, (r() - 0.5) * 0.04 * s], rot: [r() * 3, r() * 3, r() * 3], scale: [1, 1.8, 0.6] });
            const m = mk(parts, M.body);
            m.position.set(x, y, z);
            m.visible = false;
            j.add(m);
            R.shell.push(m);
        }
    } else if (look === 'rock') {
        // boulders on the shoulders and the back (they break off one by one)
        const spots = [[R.chest, -chestR * 0.9, 0.42, 0.02], [R.chest, chestR * 0.95, 0.44, 0], [R.chest, 0, 0.3, chestR * 0.8], [R.chest, -chestR * 0.4, 0.15, chestR * 0.85], [R.chest, chestR * 0.5, 0.2, chestR * 0.8], [R.armL.sh, -0.02, -0.06, 0], [R.armR.sh, 0.02, -0.06, 0], [R.chest, 0, 0.47, chestR * 0.4]];
        for (const [j, x, y, z] of spots) {
            const s = 0.05 + r() * 0.03;
            const m = mk([{ geo: tinted(rough(new THREE.DodecahedronGeometry(s, 1), r, 0.35), C([0x9a968e, 0x86827a, 0xa8a49a][Math.floor(r() * 3)]), r), pos: [0, 0, 0], rot: [r() * 3, r() * 3, r() * 3], scale: [1.2, 0.9, 1] }], M.body);
            m.position.set(x, y, z);
            m.userData.s = s;
            j.add(m);
            R.chips.push(m);
        }
        // the pillar (stage 3): a column of layered stone, cracked, earth still on its root
        const g = new THREE.Group(); hand.add(g);
        const P = [];
        for (let i = 0; i < 6; i++) P.push({ geo: tinted(rough(new THREE.CylinderGeometry(armR * (1.1 + r() * 0.3), armR * (1.2 + r() * 0.3), 0.085, 7), r, 0.2), C([0x8c887f, 0x9a968e, 0x7a766e][i % 3]), r), pos: [(r() - 0.5) * 0.01, -0.04 - i * 0.08, (r() - 0.5) * 0.01], rot: [0, r() * 3, 0] });
        P.push({ geo: tinted(rough(new THREE.DodecahedronGeometry(armR * 1.6, 1), r, 0.4), C(0x6a5a48), r), pos: [0, -0.52, 0], scale: [1, 0.8, 1] }); // (the root with earth)
        g.add(mk(P, M.body));
        g.visible = false;
        R.club = g;
    }
}

/** Things that stand by a titan's home (its life at peace): the iron one's anvil-rock, the lava one's lake. 1 unit = its height. */
export function titanSite(look) {
    const r = rng(BUILD[look] * 31 + 5), g = new THREE.Group();
    if (look === 'iron') {
        const M = mats('iron'), P = [];
        P.push({ geo: tinted(rough(new THREE.DodecahedronGeometry(0.12, 1), r, 0.3), C(0x6a6660), r), pos: [0, 0.05, 0], scale: [1.4, 0.7, 1.1] }); // (the rock)
        P.push({ geo: tinted(new THREE.BoxGeometry(0.2, 0.05, 0.1), C(0x3c3834), r), pos: [0, 0.13, 0] }); // (the anvil's face — black, beaten)
        P.push({ geo: tinted(new THREE.ConeGeometry(0.05, 0.12, 6), C(0x3c3834), r), pos: [0.15, 0.13, 0], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.8] }); // (its horn)
        for (let i = 0; i < 7; i++) P.push({ geo: tinted(new THREE.BoxGeometry(0.03 + r() * 0.04, 0.008, 0.01 + r() * 0.02), C(0x9a9088), r), pos: [(r() - 0.5) * 0.5, 0.004, (r() - 0.5) * 0.5], rot: [0, r() * 3, 0] }); // (scraps of iron round it)
        const m = new THREE.Mesh(mergeParts(P), M.body); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const hot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), M.glow); hot.position.set(-0.03, 0.165, 0); g.add(hot); // (a bar on it, white-hot)
    } else if (look === 'lava') {
        const M = mats('lava');
        const lake = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), M.body);
        lake.rotation.x = -Math.PI / 2; lake.position.y = 0.012; lake.receiveShadow = true; lake.name = 'lake';
        g.add(lake);
        const P = [];
        for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, rr = 0.42 + r() * 0.05; P.push({ geo: tinted(rough(new THREE.DodecahedronGeometry(0.03 + r() * 0.03, 0), r, 0.3), C(0x2a2420), r), pos: [Math.cos(a) * rr, 0.01, Math.sin(a) * rr], rot: [r() * 3, r() * 3, 0], scale: [1.4, 0.6, 1] }); } // (the black rim of cooled rock)
        const rim = new THREE.Mesh(mergeParts(P), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); rim.material.userData.shared = true; g.add(rim);
        const crust = new THREE.Mesh(new THREE.CircleGeometry(0.43, 40), new THREE.MeshStandardMaterial({ color: 0x9ab8d0, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false }));
        crust.material.userData.shared = true; crust.rotation.x = -Math.PI / 2; crust.position.y = 0.016; crust.name = 'frozen'; g.add(crust); // (frozen over: the lake can't heat it)
    }
    g.userData.look = look;
    return g;
}

// ------------------------------------------------------------------ the sandworm
/** The sandworm (Mars): `n` rings of armour (each a Group the game lays along its path), a head with a three-petal mouth. 1 unit thick. */
function worm(n = 30) {
    const r = rng(4211), M = mats('worm'), root = new THREE.Group();
    root.name = 'titan-worm';
    // one ring: a short barrel of plates, the plate edges standing out, a crest of spines on top, the soft fold between rings darker
    const ringParts = [];
    const add = (geo, c, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => ringParts.push({ geo: tinted(geo, C(c), r, 0.08), pos, rot, scale: sc });
    add(new THREE.CylinderGeometry(0.5, 0.47, 0.42, 20, 2, true), 0x8a4e30, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.51, 0.045, 6, 24), 0xc88c5c, [0, 0, -0.2]);
    add(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 20, 1, true), 0x2e1a10, [0, 0, 0.24], [Math.PI / 2, 0, 0]); // (the soft dark fold between rings)
    // overlapping armour plates round the ring (their edges stand out: the silhouette is never a smooth tube), worn lighter on the back
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, top = Math.max(0, Math.cos(a));
        add(new THREE.BoxGeometry(0.24, 0.05, 0.36), top > 0.5 ? 0xb07850 : 0x7a4428, [Math.sin(a) * 0.52, Math.cos(a) * 0.52, -0.02], [0, 0, -a], [1, 1 + top * 0.4, 1]);
    }
    for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.04, 0.2, 5), 0x3a2216, [Math.sin((i - 2) * 0.35) * 0.56, Math.cos((i - 2) * 0.35) * 0.56 + 0.03, 0], [0, 0, -(i - 2) * 0.35]);
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
        pp.push({ geo: tinted(new THREE.SphereGeometry(0.66, 16, 10, -Math.PI / 3, (Math.PI * 2) / 3, 0, Math.PI / 2.2), C(0x8a4e30), r), pos: [0, -0.5, 0], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 1.6] });
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
/** The storm's shader reads its `map` (vUv exists only with a map): a one-pixel texture where there is no canvas (tests). */
function stormFallbackTex() { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; (t.userData || (t.userData = {})).shared = true; return t; }
/** The funnel's material: a cloud texture wound round and rising (uT), lit from within by the lightning (uFlash). */
function stormMaterial() {
    if (_stormMat) return _stormMat;
    const m = new THREE.MeshBasicMaterial({ map: TEX.storm() || stormFallbackTex(), color: 0xc89870, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    m.userData.shared = true;
    m.userData.uT = { value: 0 }; m.userData.uFlash = { value: 0 };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uT = m.userData.uT; sh.uniforms.uFlash = m.userData.uFlash;
        sh.fragmentShader = 'uniform float uT; uniform float uFlash;\n' + sh.fragmentShader
            .replace('#include <map_fragment>', `
                vec2 suv = vec2(vUv.x * 3.0 + uT * 0.35 + vUv.y * 1.5, vUv.y * 2.0 - uT * 0.12);
                vec4 tc = texture2D(map, suv);
                vec4 tc2 = texture2D(map, suv * vec2(0.5, 1.3) + vec2(0.37, uT * 0.05));
                float a = clamp(0.35 + tc.a * 0.5 + max(tc.r, tc2.r) * 0.9, 0.0, 1.0);
                diffuseColor.rgb *= mix(vec3(0.28, 0.2, 0.16), vec3(1.05, 0.95, 0.85), max(tc.r, tc2.g)) + uFlash * vec3(0.6, 0.7, 1.0);
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
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeM); e.scale.set(1.9, 0.6, 0.6); e.position.set(sd * 0.055, 0, 0); face.add(e); }
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
 * Pose a walker. The joints' sense (the body faces −z): a hip / shoulder turned +x swings the limb FORWARD; a knee bends with −x (the
 * shin goes back), an elbow with +x (the forearm comes forward); the chest, the neck and the head lean forward with −x. Layers, each over the one before:
 *   the walk  `ph` the step's phase, `k` 0…1 how much it walks — heavy: the body sways side to side, the arms swing against the legs
 *   `breathe` the slow breath (the chest, the head)
 *   `act` + `a` (0…1 its progress) + `w` (0…1 its weight): an action of the whole body (ACTS) — its life at peace (forge, sit, bathe,
 *        guard, crouch), its waking (rise, roar), its blows (throw, breath, clap, slam2, thrust), its wounds (kneel), the shade's cover,
 *        the rock's curl, the iron's shake
 *   `blow` 0…1 a fist's wind-up → strike (`arm` +1 right, −1 left); `stomp` 0…1 a foot raised and brought down
 */
export function poseWalker(model, { ph = 0, k = 0, blow = 0, arm = 1, stomp = 0, breathe = 0, act = null, a = 0, w = 1 } = {}) {
    const R = model.userData.rig;
    if (!R || !R.legL) return;
    const s = Math.sin(ph) * k, c = Math.cos(ph) * k;
    R.legL.hp.rotation.set(s * 0.5, 0, 0); R.legR.hp.rotation.set(-s * 0.5, 0, 0);
    R.legL.kn.rotation.x = -Math.max(0, c) * 0.75; R.legR.kn.rotation.x = -Math.max(0, -c) * 0.75; // (the leg that swings forward bends)
    R.legL.ft.rotation.x = -s * 0.2; R.legR.ft.rotation.x = s * 0.2;
    R.hips.rotation.set(0, 0, s * 0.05); R.hips.position.y = 0.42 - Math.abs(c) * 0.012;
    R.chest.rotation.set(-0.06 + Math.sin(breathe) * 0.015, 0, -s * 0.04); // (the upper body leans forward with −x)
    R.armL.sh.rotation.set(-s * 0.42, 0, -0.12); R.armR.sh.rotation.set(s * 0.42, 0, 0.12);
    R.armL.el.rotation.x = 0.3 + Math.max(0, -s) * 0.3; R.armR.el.rotation.x = 0.3 + Math.max(0, s) * 0.3;
    R.head.rotation.set(0.05 + Math.sin(breathe * 0.7) * 0.03, 0, 0);
    R.neck.rotation.set(0, 0, 0);
    if (act && ACTS[act] && w > 0) { _P.w = Math.min(1, w); ACTS[act](R, Math.max(0, Math.min(1, a)), breathe); }
    if (blow > 0) {
        // the wind-up (arm raised high and back, the body turned with it), then the strike down and forward
        const A = arm > 0 ? R.armR : R.armL, up = blow < 0.6 ? ease(blow / 0.6) : 1 - (blow - 0.6) / 0.4;
        A.sh.rotation.x = blow < 0.6 ? -2.6 * up : -2.6 + ease((blow - 0.6) / 0.4) * 3.5;
        A.el.rotation.x = blow < 0.6 ? 0.9 * up : 0.9 * up + 0.1;
        R.chest.rotation.y = (arm > 0 ? 1 : -1) * 0.35 * up;
        R.chest.rotation.x += blow > 0.6 ? -0.3 * (1 - up) : 0.15 * up; // (the upper body: −x leans forward)
    }
    if (stomp > 0) { const L = R.legR, up = stomp < 0.6 ? ease(stomp / 0.6) : 1 - (stomp - 0.6) / 0.4; L.hp.rotation.x = 1.2 * up; L.kn.rotation.x = -1.1 * up; R.armL.sh.rotation.z -= 0.6 * up; R.armR.sh.rotation.z += 0.6 * up; }
}
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (x, y, t) => x + (y - x) * t;
const _P = { w: 1 };
/** Turn a joint's angle towards `v` by the action's weight. */
const to = (o, k, v) => { o[k] = lerp(o[k], v, _P.w); };
/** One leg / arm at once: hip, knee, foot (or shoulder x, z, elbow). */
const legTo = (L, hp, kn, ft = 0, z = null) => { to(L.hp.rotation, 'x', hp); to(L.kn.rotation, 'x', kn); to(L.ft.rotation, 'x', ft); if (z != null) to(L.hp.rotation, 'z', z); };
const armTo = (A, x, z, el) => { to(A.sh.rotation, 'x', x); if (z != null) to(A.sh.rotation, 'z', z); to(A.el.rotation, 'x', el); };
/** A rise and fall over parts of `a`: 0 before t0, up to 1 at t1, 1 to t2, back to 0 at t3. */
const env = (a, t0, t1, t2, t3) => (a <= t0 || a >= t3 ? 0 : a < t1 ? ease((a - t0) / (t1 - t0)) : a <= t2 ? 1 : 1 - ease((a - t2) / (t3 - t2)));

const ACTS = {
    /** The iron smith at its anvil (a cycle): feet apart, bent over the work; the hammer raised high — and down on the anvil. */
    forge(R, a, br) {
        const up = a < 0.55 ? ease(a / 0.55) : a < 0.66 ? 1 - (a - 0.55) / 0.11 : 0;
        to(R.hips.position, 'y', 0.38); legTo(R.legL, 0.6, -0.9, 0.3, -0.12); legTo(R.legR, 0.3, -0.9, 0.6, 0.12); // (bent knees: the hips lower, the feet stay on the ground)
        to(R.chest.rotation, 'x', -(0.42 + Math.sin(br) * 0.02)); to(R.chest.rotation, 'y', 0.12 * up);
        armTo(R.armR, lerp(0.95, -2.5, up), 0.15, lerp(0.35, 1.1, up));
        armTo(R.armL, 1.05, 0.25, 0.9); // (the left hand holds the work on the anvil)
        to(R.head.rotation, 'x', -(0.4));
    },
    /** Sitting on the ground, knees up, arms on the knees, head bowed — asleep (a: 1 sat; less — standing up). */
    sit(R, a) {
        const k = ease(a);
        R.hips.position.y = lerp(R.hips.position.y, 0.09, k * _P.w);
        legTo(R.legL, 2.0 * k, -2.0 * k, 0.1 * k, -0.15 * k); legTo(R.legR, 2.0 * k, -2.0 * k, 0.1 * k, 0.15 * k);
        to(R.chest.rotation, 'x', -(0.55 * k)); to(R.head.rotation, 'x', -(0.5 * k));
        armTo(R.armL, 1.05 * k, -0.15, 0.7 * k); armTo(R.armR, 1.05 * k, 0.15, 0.7 * k);
    },
    /** Standing up from sitting (a 0 sat → 1 standing): a hand pushed on the ground, the body heaved up, the head last. */
    rise(R, a) {
        const k = 1 - ease(a);
        ACTS.sit(R, 1 - a);
        const push = env(a, 0.1, 0.35, 0.55, 0.85);
        armTo(R.armR, lerp(R.armR.sh.rotation.x, 0.5, push), 0.5 * push, 0);
        to(R.chest.rotation, 'x', -(lerp(0.55 * k, 0.9, push)));
        to(R.head.rotation, 'x', -(lerp(0.5 * k, -0.3, env(a, 0.6, 0.85, 1, 1.01))));
    },
    /** The lava one in its lake: sat, the right hand scooping lava and pouring it over its head (a cycle). */
    bathe(R, a) {
        ACTS.sit(R, 1);
        const pour = env(a, 0.3, 0.6, 0.75, 0.95);
        const scoop = env(a, 0, 0.12, 0.25, 0.4);
        armTo(R.armR, lerp(lerp(1.05, 1.5, scoop), -2.7, pour), lerp(0.3, 0.15, pour), lerp(0.6, 1.4, pour));
        to(R.head.rotation, 'x', -(lerp(0.3, -0.35, pour)));
        to(R.chest.rotation, 'x', -(lerp(0.6, 0.15, pour)));
    },
    /** The ice guard: upright, the glaive held level-fisted (upright), the head slowly turning to look round. */
    guard(R, a, br) {
        armTo(R.armR, 0.25, 0.1, 1.45);
        armTo(R.armL, 0, -0.2, 0.35);
        to(R.chest.rotation, 'x', -(0.02 + Math.sin(br) * 0.025));
        to(R.head.rotation, 'y', Math.sin(a * Math.PI * 2) * 0.6);
        legTo(R.legL, 0, 0, 0, -0.05); legTo(R.legR, 0, 0, 0, 0.05);
    },
    /** The shade creeping: low on bent legs, the body forward, the head raised to look ahead, long arms reaching. */
    crouch(R) {
        to(R.hips.position, 'y', 0.29);
        R.legL.hp.rotation.x += 0.76 * _P.w; R.legR.hp.rotation.x += 0.76 * _P.w;
        to(R.legL.kn.rotation, 'x', R.legL.kn.rotation.x - 1.5); to(R.legR.kn.rotation, 'x', R.legR.kn.rotation.x - 1.5);
        to(R.legL.ft.rotation, 'x', 0.7); to(R.legR.ft.rotation, 'x', 0.7);
        to(R.chest.rotation, 'x', -(0.8)); to(R.head.rotation, 'x', -(-0.7));
        R.armL.sh.rotation.x += 0.9 * _P.w; R.armR.sh.rotation.x += 0.9 * _P.w;
    },
    /** The shade caught in light: frozen, hunched, both forearms over its face. */
    cover(R, a) {
        const t = Math.sin(a * 40) * 0.02; // (a tremble)
        to(R.hips.position, 'y', 0.36);
        legTo(R.legL, 0.55, -0.9, 0.35); legTo(R.legR, 0.35, -0.9, 0.55);
        to(R.chest.rotation, 'x', -(0.45 + t)); to(R.head.rotation, 'x', -(0.5));
        armTo(R.armL, 2.4, 0.45, 2.0); armTo(R.armR, 2.4 + t, -0.45, 2.0);
    },
    /** The roar: the chest thrown back, the head up, the arms spread wide, fists clenched; the legs set wide. */
    roar(R, a) {
        const k = env(a, 0, 0.25, 0.75, 1);
        legTo(R.legL, lerp(0, 0.2, k), -0.3 * k, 0, -0.18 * k); legTo(R.legR, lerp(0, -0.15, k), -0.2 * k, 0, 0.18 * k);
        to(R.chest.rotation, 'x', -(lerp(0.06, -0.16, k))); to(R.head.rotation, 'x', -(lerp(-0.08, -0.28, k))); // (back a little: the face still seen)
        armTo(R.armL, 0.5 * k, -1.1 * k, 0.9 * k); armTo(R.armR, 0.5 * k, 1.1 * k, 0.9 * k); // (spread wide and forward, the forearms raised — the fists clenched)
    },
    /** Staggered: down on the right knee, the right hand on the ground, the left on the left knee, swaying. */
    kneel(R, a) {
        const k = env(a, 0, 0.12, 0.85, 1), sway = Math.sin(a * 18) * 0.04 * k;
        R.hips.position.y = lerp(R.hips.position.y, 0.24, k * _P.w);
        legTo(R.legR, 0.1 * k, -1.57 * k, 0.6 * k); legTo(R.legL, 1.4 * k, -1.4 * k, 0);
        to(R.chest.rotation, 'x', -(0.5 * k + sway)); to(R.chest.rotation, 'z', sway);
        armTo(R.armR, 0.9 * k, 0.25 * k, -0.05); armTo(R.armL, 0.7 * k, -0.2 * k, 0.9 * k);
        to(R.head.rotation, 'x', -(0.35 * k + Math.sin(a * 11) * 0.06));
    },
    /** A boulder torn from the ground and thrown with both hands: bend and grip (0–0.35), heave overhead (–0.7), hurl (–0.8), recover. */
    throw(R, a) {
        const grab = env(a, 0, 0.25, 0.35, 0.55), over = env(a, 0.35, 0.62, 0.7, 0.8), hurl = env(a, 0.7, 0.78, 0.82, 1);
        R.hips.position.y = lerp(R.hips.position.y, 0.32, grab * _P.w);
        legTo(R.legL, 0.72 * grab, -1.44 * grab, 0.72 * grab, -0.1); legTo(R.legR, 0.72 * grab - 0.2 * hurl, -1.44 * grab, 0.72 * grab, 0.1);
        to(R.chest.rotation, 'x', -(0.95 * grab - 0.3 * over + 0.5 * hurl));
        const x = 1.3 * grab - 2.9 * over + 0.6 * hurl;
        armTo(R.armL, x, -0.25, 0.25 + 0.4 * over); armTo(R.armR, x, 0.25, 0.25 + 0.4 * over);
        to(R.head.rotation, 'x', -(0.4 * grab - 0.4 * over));
    },
    /** The frost breath: drawn in (the chest swells, the head back), then out — the head thrust forward, the arms back. */
    breath(R, a) {
        const draw = env(a, 0, 0.35, 0.4, 0.5), out = env(a, 0.4, 0.5, 0.9, 1);
        to(R.chest.rotation, 'x', -(-0.3 * draw + 0.35 * out)); to(R.head.rotation, 'x', -(-0.5 * draw + 0.15 * out));
        R.neck.rotation.x = -0.25 * out * _P.w;
        armTo(R.armL, -0.4 * out, -0.5 * draw - 0.3 * out, 0.4); armTo(R.armR, -0.4 * out, 0.5 * draw + 0.3 * out, 0.4);
        legTo(R.legL, 0.35 * out, -0.4 * out, 0); legTo(R.legR, -0.2 * out, -0.1 * out, 0);
    },
    /** The clap: the arms spread wide and forward — then brought together before the chest with a crack. */
    clap(R, a) {
        const open = env(a, 0, 0.4, 0.5, 0.55), shut = env(a, 0.5, 0.58, 0.85, 1);
        armTo(R.armL, 1.4 * (open + shut), -1.3 * open + 0.15 * shut, 0.2 + 0.3 * shut); armTo(R.armR, 1.4 * (open + shut), 1.3 * open - 0.15 * shut, 0.2 + 0.3 * shut);
        to(R.chest.rotation, 'x', -(-0.2 * open + 0.2 * shut)); to(R.head.rotation, 'x', -(-0.2 * open));
        legTo(R.legL, 0.3 * shut, -0.3 * shut, 0, -0.1); legTo(R.legR, -0.2 * shut, -0.1 * shut, 0, 0.1);
    },
    /** Both fists into the ground: raised high together (0–0.55), brought down with the whole body (–0.68), held there. */
    slam2(R, a) {
        const up = env(a, 0, 0.5, 0.55, 0.62), down = env(a, 0.56, 0.66, 0.85, 1);
        R.hips.position.y = lerp(R.hips.position.y, 0.3, down * _P.w);
        legTo(R.legL, 0.75 * down, -1.5 * down, 0.75 * down, -0.15); legTo(R.legR, 0.75 * down, -1.5 * down, 0.75 * down, 0.15);
        to(R.chest.rotation, 'x', -(-0.25 * up + 1.0 * down)); to(R.head.rotation, 'x', -(-0.4 * up + 0.2 * down));
        const x = -2.8 * up + 1.25 * down;
        armTo(R.armL, x, -0.15, 0.3 * up); armTo(R.armR, x, 0.15, 0.3 * up);
    },
    /** A thrust of the glaive: drawn back (the fist by the shoulder), then driven down and forward with the body behind it. */
    thrust(R, a) {
        const back = env(a, 0, 0.5, 0.55, 0.6), drive = env(a, 0.55, 0.65, 0.85, 1);
        armTo(R.armR, -0.6 * back + 1.6 * drive, 0.2, 2.0 * back + 0.1 * drive);
        to(R.chest.rotation, 'y', 0.4 * back - 0.2 * drive); to(R.chest.rotation, 'x', -(-0.1 * back + 0.45 * drive));
        legTo(R.legL, 0.5 * drive, -0.5 * drive, 0); legTo(R.legR, -0.3 * drive, -0.1, 0);
    },
    /** The rock one curled into a boulder (to roll): all tucked in. */
    curl(R, a) {
        const k = ease(a);
        R.hips.position.y = lerp(R.hips.position.y, 0.22, k * _P.w);
        legTo(R.legL, 2.3 * k, -2.4 * k, 0.4 * k); legTo(R.legR, 2.3 * k, -2.4 * k, 0.4 * k);
        to(R.chest.rotation, 'x', -(1.3 * k)); to(R.head.rotation, 'x', -(0.9 * k));
        armTo(R.armL, 1.9 * k, 0.4 * k, 1.6 * k); armTo(R.armR, 1.9 * k, -0.4 * k, 1.6 * k);
    },
    /** The iron one shaking off what clings to it: the body twisting hard, the arms flung out. */
    shake(R, a) {
        const k = env(a, 0, 0.1, 0.85, 1), tw = Math.sin(a * 34) * 0.35 * k;
        to(R.chest.rotation, 'y', tw); to(R.chest.rotation, 'z', tw * 0.3);
        armTo(R.armL, 0.3 * k, -0.9 * k - tw, 0.4); armTo(R.armR, 0.3 * k, 0.9 * k - tw, 0.4);
        to(R.head.rotation, 'y', -tw * 0.6);
    },
};
export const WALKER_ACTS = Object.keys(ACTS);

/**
 * A copy of a titan's body sharing its shapes and materials (the shade's shadows of itself, the storm's small whirls): Object3D.clone
 * keeps `userData` by reference — the rig would still point at the first body's joints; here it is pointed at the copy's own.
 */
export function cloneTitan(model) {
    const c = model.clone();
    const map = new Map(), a = [], b = [];
    model.traverse((o) => a.push(o));
    c.traverse((o) => b.push(o));
    for (let i = 0; i < a.length; i++) map.set(a[i], b[i]);
    const remap = (v) => (v && v.isObject3D ? map.get(v) || v : Array.isArray(v) ? v.map(remap) : v && typeof v === 'object' && !v.isMaterial ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) : v);
    c.userData = { ...model.userData, rig: remap(model.userData.rig) };
    return c;
}
