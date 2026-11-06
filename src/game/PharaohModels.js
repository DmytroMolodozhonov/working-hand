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
/** The nemes' stripes (gold and lapis), for the pharaoh's headdress. */
function nemesPicture() {
    return canvasTex('nemes', 128, 128, (g, W, H) => { for (let x = 0; x < W; x += 8) { g.fillStyle = (x / 8) % 2 ? '#e8b830' : '#1f3a8a'; g.fillRect(x, 0, 8, H); } g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 1); });
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
    const L = villagerLook(2626, 'king', false, {});
    Object.assign(L, { coat: 0xe6dcbc, shirt: 0xe9e0c2, accent: 0xe8b830, pants: 0xe2d8b6, boots: 0x6a5a3a, hair: 'bald', hairColor: 0x1a1208, beard: 'none', hat: 'none',
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

/** The pharaoh's finery on a VillagerModel: a nemes headdress over the head, a broad collar on the chest, a braided false beard. Returns the meshes (for disposal). */
export function dressPharaoh(model) {
    const out = [];
    const head = model.head, torso = model.torso;
    if (head) {
        const nem = new THREE.Mesh(geo('nemesHead', () => new THREE.BoxGeometry(0.98, 0.5, 0.98)), new THREE.MeshLambertMaterial({ color: 0xffffff, map: nemesPicture() }));
        nem.position.set(0, 0.62, 0.02); head.add(nem); out.push(nem);
        for (const s of [-1, 1]) { const lap = new THREE.Mesh(geo('nemesLap', () => new THREE.BoxGeometry(0.2, 0.7, 0.62)), nem.material); lap.position.set(s * 0.52, 0.2, 0.05); head.add(lap); out.push(lap); }
        const cobra = new THREE.Mesh(geo('uraeus', () => new THREE.ConeGeometry(0.07, 0.3, 6)), plainMat(0xe8b830, 'ura')); cobra.position.set(0, 0.95, -0.5); head.add(cobra); out.push(cobra);
        const beard = new THREE.Mesh(geo('fbeard', () => new THREE.BoxGeometry(0.12, 0.62, 0.12)), new THREE.MeshLambertMaterial({ color: 0x1f3a8a })); beard.position.set(0, -0.12, -0.52); head.add(beard); out.push(beard);
    }
    if (torso) {
        const collar = new THREE.Mesh(geo('usekh', () => new THREE.CylinderGeometry(0.62, 0.78, 0.18, 18, 1, true)), new THREE.MeshStandardMaterial({ color: 0xffffff, map: collarPicture(), side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 }));
        collar.position.set(0, 1.0, 0); torso.add(collar); out.push(collar);
    }
    return out;
}
function collarPicture() {
    return canvasTex('usekh', 256, 32, (g, W, H) => { const cols = ['#27408a', '#2aa89a', '#e8b830', '#a63a28']; for (let x = 0; x < W; x += 8) { g.fillStyle = cols[(x / 8) % 4 | 0]; g.fillRect(x, 0, 8, H * 0.5); g.fillStyle = cols[((x / 8) + 2) % 4 | 0]; g.fillRect(x, H * 0.5, 8, H * 0.5); } });
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
