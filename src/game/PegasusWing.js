/**
 * PegasusWing.js — the Pegasus' wing of layered feathers (the author 07.11: «крылья — труба и белая пластина… переработай»).
 *
 * A bird's wing as it really is: the arm and the hand under rows of coverts (lesser → median → greater, each row covering the
 * quills of the next), ten secondaries along the arm, ten primaries fanning out from the wrist with a narrow vane on the side of
 * the tip and a wide one behind (the shaft sits off-centre), small alula feathers at the wrist. Every feather is a curved strip with
 * a rounded tip and a texture: a light quill, barbs slanting to the tip, splits in the vane, a ragged edge (the alpha), a soft
 * lighter down at the base — one picture for all coats (the coat's colour is the material's).
 *
 * The same morph scheme as the pig's wing (AnimalModels.animateWings): the base shape is FOLDED along the side, morph 0 = spread,
 * morph 1 = the tips bent up. Shapes are built once and shared; a wing is one mesh.
 */
import * as THREE from 'three';
import { MODEL_KIT } from './AnimalModels.js';

const ARM = 0.46, HAND = 0.32;
const AL = 0.62, AR = 0.38; // (a feather's shaft at 62 % of its width: the narrow vane looks to the wing tip)
let _geo = null;
const _mats = new Map();
let _tex; // (undefined: not made yet; null: no canvas — the tests)

/** One feather: base at 0, along +Z (length L, width W), normal +Y; segs × cols vertices; tone = vertex shade; uv for the picture. */
function feather(L, W, tone, out, { segs = 10, cols = 5, curl = 0.06, tip = 0.1 } = {}) {
    const base = out.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // (the vane: narrow at the quill's base, widest near a third of the way, then a rounded tip)
        const e = t < 0.3 ? 0.3 + 0.7 * Math.sin((t / 0.3) * Math.PI / 2) : t < 0.8 ? 1 : Math.max(tip, Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)));
        const z = L * t, y = curl * L * Math.sin(Math.PI * t * 0.8);
        for (let k = 0; k < cols; k++) {
            const f = -1 + (2 * k) / (cols - 1);
            const x = f * (f < 0 ? AL : AR) * W * e;
            out.pos.push(x, y - Math.abs(f) * W * 0.09 * (0.4 + t), z);
            const shade = tone * (f === 0 ? 0.96 : 0.92) * (0.7 + 0.3 * Math.min(1, t / 0.38)) * (1 - 0.1 * Math.max(0, (t - 0.72) / 0.28)); // (the base lies in shade under the next row: every row shows its edge)
            out.col.push(shade, shade * 0.985, shade * 0.97);
            out.uv.push(AL + f * (f < 0 ? AL : AR), t);
        }
        if (i > 0) {
            for (let k = 0; k < cols - 1; k++) {
                const a = base + (i - 1) * cols + k, b = base + i * cols + k;
                out.idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return base;
}
/** A matrix putting local +Z along `d` with local +Y towards `n`, at `p`. */
function frame(p, d, n) {
    const Z = d.clone().normalize();
    const Y = n.clone().addScaledVector(Z, -n.dot(Z)).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z);
    return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
}

/** The wing's shape (the right wing, its root at 0; shared): base = folded, morph 0 = spread, morph 1 = tips up. */
export function pegasusWingGeo() {
    return MODEL_KIT.cached('pegasusWing', () => {
        const r = MODEL_KIT.rng(7733);
        const parts = [];
        const UP = new THREE.Vector3(0, 1, 0);
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        // spread: the span along +X, the trailing edge to +Z (back), the top +Y
        const open = (b, a) => frame(b, V(Math.sin(a), 0, Math.cos(a)), UP);
        // folded: the arm along the side going back (a little up), the feathers hanging down and out a bit
        const S = V(0, 0.1, 1).normalize(), C = V(0.42, -1, 0).normalize();
        const N = new THREE.Vector3().crossVectors(C, S).normalize(); // (the top of the folded wing: towards the body)
        const Rf = new THREE.Matrix4().makeBasis(S, N, C);
        const out = N.clone().negate();
        const Wr = V(ARM, 0.01, 0); // the wrist
        const flex = new THREE.Matrix4().makeTranslation(Wr.x, Wr.y, Wr.z).multiply(new THREE.Matrix4().makeRotationZ(0.6)).multiply(new THREE.Matrix4().makeTranslation(-Wr.x, -Wr.y, -Wr.z));
        const away = new THREE.Matrix4().makeTranslation(out.x * 0.015, out.y * 0.015, out.z * 0.015); // (folded: just off the skin)
        const inner = (make, M) => parts.push({ make, open: M, fold: away.clone().multiply(Rf).multiply(M), flex: M });
        const hand = (make, M, foldM) => parts.push({ make, open: M, fold: foldM, flex: flex.clone().multiply(M) });
        const SHORT = { segs: 5, cols: 3, curl: 0.05, tip: 0.2 };
        const tone = () => 0.9 + r() * 0.1;

        // the arm: secondaries (the long quills), then three rows of coverts over their bases, lesser ones along the leading edge.
        // (folded, they lie like shingles along the side, pointing back and a little down — not hanging like a curtain)
        const dSec = S.clone().multiplyScalar(0.94).addScaledVector(C, 0.34), dMed = S.clone().multiplyScalar(0.9).addScaledVector(C, 0.43), dLes = S.clone().multiplyScalar(0.95).addScaledVector(C, 0.24);
        const arm = (make, M, x, layer, d, rowTone) => parts.push({ make: (o) => make(o, rowTone), open: M, fold: frame(S.clone().multiplyScalar(x * 0.95).addScaledVector(out, 0.015 + layer), d, N), flex: M });
        for (let i = 0; i < 10; i++) { const L = 0.27 + 0.075 * Math.min(1, i / 5), t = tone(), x = 0.025 + i * 0.047; arm((o, k) => feather(L, 0.092, t * k, o), open(V(x, -0.006, 0.012), 0.03 + i * 0.029), x, 0, dSec, 0.9); }
        for (let i = 0; i < 10; i++) { const t = tone(), x = 0.02 + i * 0.049; arm((o, k) => feather(0.175, 0.088, t * k, o, SHORT), open(V(x, 0.004, 0.004), 0.06 + i * 0.03), x, 0.012, dMed, 0.96); }
        for (let i = 0; i < 10; i++) { const t = tone(), x = 0.02 + i * 0.049; arm((o, k) => feather(0.12, 0.074, t * k, o, SHORT), open(V(x, 0.012, -0.004), 0.1 + i * 0.03), x, 0.022, dMed, 1); }
        for (let i = 0; i < 12; i++) { const t = tone(), x = 0.015 + i * 0.039; arm((o, k) => feather(0.075, 0.054, t * k, o, SHORT), open(V(x, 0.02, -0.014), 0.16 + i * 0.03), x, 0.032, dLes, 1); }
        // the hand: ten primaries fanning out to the tip (a narrow outer vane), their coverts, the alula at the wrist
        const fw = Rf.clone().multiply(new THREE.Matrix4().makeTranslation(Wr.x, Wr.y, Wr.z)); // (the folded wrist)
        const fwP = new THREE.Vector3().setFromMatrixPosition(fw);
        const fwd = S.clone().negate();
        const PL = [0.4, 0.45, 0.51, 0.56, 0.6, 0.62, 0.6, 0.55, 0.47, 0.37];
        for (let j = 0; j < 10; j++) {
            const bx = j * 0.034, a = 0.24 + j * 0.137, t = tone();
            const fold = frame(fwP.clone().addScaledVector(fwd, bx * 0.9).addScaledVector(out, 0.009 * (j + 1)), S.clone().multiplyScalar(0.92).addScaledVector(C, 0.38 - j * 0.028), N);
            hand((o) => feather(PL[j], 0.078, t, o, { tip: 0.16 }), open(V(Wr.x + bx, Wr.y - 0.006, 0.005), a), fold);
        }
        for (let j = 0; j < 7; j++) {
            const bx = j * 0.047, t = tone();
            const fold = frame(fwP.clone().addScaledVector(fwd, bx * 0.9).addScaledVector(out, 0.1), S.clone().addScaledVector(C, 0.3), N);
            hand((o) => feather(0.17, 0.072, t, o, SHORT), open(V(Wr.x + bx, Wr.y + 0.012, -0.005), 0.5 + j * 0.12), fold);
        }
        for (let j = 0; j < 3; j++) {
            const t = tone();
            const fold = frame(fwP.clone().addScaledVector(out, 0.1 + j * 0.01).addScaledVector(fwd, -0.03), S.clone().addScaledVector(C, 0.2), N);
            hand((o) => feather(0.12 - j * 0.02, 0.046, t, o, SHORT), open(V(Wr.x - 0.012 + j * 0.01, Wr.y + 0.022, -0.016), -0.38 + j * 0.16), fold);
        }
        // build: base positions folded, morph deltas to spread and to the bent tips
        const o = { pos: [], col: [], idx: [], uv: [] };
        const P = [], N0 = [], dO = [], dON = [], dF = [], dFN = [];
        const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
        for (const pt of parts) {
            const from = o.pos.length / 3;
            pt.make(o);
            const to = o.pos.length / 3;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(o.pos.slice(from * 3, to * 3), 3));
            geo.setIndex(o.idx.filter((i) => i >= from && i < to).map((i) => i - from));
            geo.computeVertexNormals();
            const lp = geo.getAttribute('position'), ln = geo.getAttribute('normal');
            const nf = new THREE.Matrix3().getNormalMatrix(pt.fold), no = new THREE.Matrix3().getNormalMatrix(pt.open), nx = new THREE.Matrix3().getNormalMatrix(pt.flex);
            for (let i = 0; i < lp.count; i++) {
                v.fromBufferAttribute(lp, i).applyMatrix4(pt.fold);
                w.fromBufferAttribute(lp, i).applyMatrix4(pt.open);
                q.fromBufferAttribute(lp, i).applyMatrix4(pt.flex);
                P.push(v.x, v.y, v.z); dO.push(w.x - v.x, w.y - v.y, w.z - v.z); dF.push(q.x - w.x, q.y - w.y, q.z - w.z);
                v.fromBufferAttribute(ln, i).applyMatrix3(nf).normalize();
                w.fromBufferAttribute(ln, i).applyMatrix3(no).normalize();
                q.fromBufferAttribute(ln, i).applyMatrix3(nx).normalize();
                N0.push(v.x, v.y, v.z); dON.push(w.x - v.x, w.y - v.y, w.z - v.z); dFN.push(q.x - w.x, q.y - w.y, q.z - w.z);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N0, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
        g.setIndex(o.idx);
        g.morphAttributes.position = [new THREE.Float32BufferAttribute(dO, 3), new THREE.Float32BufferAttribute(dF, 3)];
        g.morphAttributes.normal = [new THREE.Float32BufferAttribute(dON, 3), new THREE.Float32BufferAttribute(dFN, 3)];
        g.morphTargetsRelative = true;
        g.boundingBox = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position')); // (folded only: the body is measured with its wings folded)
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.4, 0, 0.1), 1.5); // (spread too: never culled while on screen)
        return g;
    });
}

/** The feather's picture (128 × 256, once, the same for every coat; null without a canvas — the tests). */
function featherTexture() {
    if (_tex !== undefined) return _tex;
    if (typeof document === 'undefined') return (_tex = null);
    const W = 128, H = 256, SH = Math.round(AL * W); // (the quill's column)
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return (_tex = null);
    const rnd = MODEL_KIT.rng(31337);
    // the vane: light, a little darker towards the tip, a lighter down at the base
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, '#f6f4f0'); lg.addColorStop(0.2, '#ebe8e3'); lg.addColorStop(0.75, '#e0ddd7'); lg.addColorStop(0.9, '#c9c5bd'); lg.addColorStop(1, '#a9a49b');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    // barbs: fine lines from the quill to the edge, slanting to the tip (the long side behind, the short one in front)
    for (let y = -60; y < H; y += 1.5) {
        g.strokeStyle = `rgba(30,25,20,${0.08 + rnd() * 0.1})`; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(SH, y); g.lineTo(-2, y + 34 + rnd() * 6); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.14})`;
        g.beginPath(); g.moveTo(SH, y + 0.8); g.lineTo(-2, y + 35 + rnd() * 6); g.stroke();
    }
    for (let y = -40; y < H; y += 1.5) {
        g.strokeStyle = `rgba(30,25,20,${0.08 + rnd() * 0.1})`; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(SH, y); g.lineTo(W + 2, y + 22 + rnd() * 5); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.14})`;
        g.beginPath(); g.moveTo(SH, y + 0.8); g.lineTo(W + 2, y + 23 + rnd() * 5); g.stroke();
    }
    // soft patches of shade (the vane isn't flat)
    for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 40 + rnd() * 200, rg = g.createRadialGradient(x, y, 0, x, y, 14 + rnd() * 16); rg.addColorStop(0, 'rgba(60,50,40,0.07)'); rg.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = rg; g.fillRect(x - 32, y - 32, 64, 64); }
    // splits: thin slits along the barbs that open the vane
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
        const left = rnd() < 0.6, y0 = 70 + rnd() * 160, len = 14 + rnd() * 30;
        g.strokeStyle = 'rgba(0,0,0,1)'; g.lineWidth = 1.1;
        g.beginPath();
        if (left) { g.moveTo(-2, y0 + 36); g.lineTo(-2 + len * 0.9, y0 + 36 - len * 0.4); } else { g.moveTo(W + 2, y0 + 22); g.lineTo(W + 2 - len * 0.7, y0 + 22 - len * 0.25); }
        g.stroke();
    }
    // the ragged edge: little bites out of the rim, and a frayed tip
    for (let i = 0; i < 140; i++) {
        const side = rnd() < 0.55 ? 0 : 1, y = rnd() * H, d = 1 + rnd() * 4, x = side ? W - d * 0.4 : d * 0.4;
        g.beginPath(); g.moveTo(side ? W : 0, y - 2); g.lineTo(x, y); g.lineTo(side ? W : 0, y + 2); g.fill();
    }
    for (let i = 0; i < 70; i++) { const x = rnd() * W, d = 1 + rnd() * 5; g.beginPath(); g.moveTo(x - 2, H); g.lineTo(x, H - d); g.lineTo(x + 2, H); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // the quill: a light line with a shadow beside it, thinner towards the tip
    for (let y = 0; y < H; y += 4) {
        const wd = 3.2 - 2.2 * (y / H);
        g.fillStyle = 'rgba(40,30,20,0.28)'; g.fillRect(SH - wd - 1, y, 1.4, 5);
        g.fillStyle = 'rgba(255,255,250,0.95)'; g.fillRect(SH - wd / 2, y, wd, 5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.userData = { keep: true };
    return (_tex = t);
}

/** The feathers' material in a coat's colour (+ a faint glow of the feathers), shared; the shape's alpha cut by the picture. */
export function pegasusWingMat(color, glow = 0) {
    const k = color + ':' + glow;
    if (!_mats.has(k)) {
        const map = featherTexture();
        const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), vertexColors: true, side: THREE.DoubleSide, morphTargets: true, morphNormals: true, map, alphaTest: map ? 0.5 : 0 });
        m.emissive = new THREE.Color(color).multiplyScalar(0.24); // (feathers let the light through: the underside of a wing isn't black)
        if (glow) { m.emissive.add(new THREE.Color(glow).multiplyScalar(0.1)); } // (a faint glow, never a shine)
        _mats.set(k, m);
    }
    return _mats.get(k);
}
