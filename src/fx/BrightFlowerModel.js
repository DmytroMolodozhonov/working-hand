/**
 * BrightFlowerModel.js — the look of the Brightflower («Ярколето», BrightFlower.js / PlantLife.BRIGHT) and of its heart.
 *
 * A fire flower, twice a tulip: a ribbed, slightly bending stem (1.5 m) with long leaves, a calyx with five pointed
 * sepals, and a cup of thick petals (7 outer, 6 inner) that OPENS AND CLOSES like breathing — the petals turn about
 * their own hinges in the vertex shader (the video card: `aOpen` per flower, `aClose` per petal), so one flower costs
 * no work on the processor and a whole meadow of them is a few instanced draws. Open it is ~1.3 m across and the
 * whole flower ~2.2 m high; a tongue of flame burns in the cup. Petals are thick (a front and a back skin that meet at
 * the rim), their inside is a hair-fine picture: red at the base → orange → gold at the tip, ribs, and GLOWING VEINS
 * (the picture's alpha is the glow mask: the shader makes it emissive).
 * Local space: the stem grows up +y from the origin; the head (petals, flame, heart) is built about the NECK (0,0,0) and
 * sits at STEM_H above the foot, so the whole head can tilt towards whoever angered the flower.
 * Everything is built once and shared; no THREE lights (the flame's light is FireLights).
 */
import * as THREE from 'three';
import { Builder, rng, mix, clamp01, hexRGB, lerpC } from './PlantModels.js';

export const BF = {
    H0: 2.2, // m: the model's height with the cup shut
    STEM_H: 1.5, // m: the neck, where the head sits
    CUP_R: 0.66, // m: the open cup's radius (≈1.3 m across)
    OUTER: 7, INNER: 6,
    CAP: 48, // flowers drawn at once
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ------------------------------------------------------------------ the petal's picture (shared)
let _petalTex = null;
/**
 * 128×128: left half = the INSIDE of a petal, right half = the OUTSIDE. x across (a half is 64 wide), y along (base at the
 * bottom). RGB = the colour, A = how much the veins glow.
 */
export function petalTexture() {
    if (_petalTex) return _petalTex;
    const W = 128, H = 128, data = new Uint8Array(W * H * 4), r = rng(5309);
    const grid = new Float32Array(32 * 32).map(() => r());
    const vn = (u, v) => { const x = u * 31, y = v * 31, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, a = (i, j) => grid[(Math.min(31, j)) * 32 + Math.min(31, i)]; return (a(xi, yi) * (1 - fx) + a(xi + 1, yi) * fx) * (1 - fy) + (a(xi, yi + 1) * (1 - fx) + a(xi + 1, yi + 1) * fx) * fy; };
    const C = { base: hexRGB(0x7a0c06), mid: hexRGB(0xe0480a), tip: hexRGB(0xffc43a), vein: hexRGB(0xffe9a0), outBase: hexRGB(0x5e1408), outMid: hexRGB(0xb83a0e), outTip: hexRGB(0xf0a02a) };
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const inside = px < 64, hx = px % 64, s = (hx / 63) * 2 - 1, u = 1 - py / (H - 1);
        const n = vn(hx / 63, u), fib = 0.5 + 0.5 * Math.sin(s * 46 + n * 5 + u * 3); // (fine ribs along the petal)
        // veins: a midrib, three pairs of side veins branching out and up, and fine capillaries between them
        let vein = Math.exp(-((s / 0.045) ** 2)) * clamp01((u - 0.02) / 0.08) * (1 - 0.35 * u);
        for (let k = 0; k < 3; k++) {
            const u0 = 0.12 + 0.2 * k, line = (u - u0) * (1.15 - 0.2 * k), d = Math.abs(s) - line;
            if (u > u0 && line < 0.95) vein = Math.max(vein, Math.exp(-((d / 0.04) ** 2)) * (1 - 0.3 * k));
        }
        const cap = Math.pow(Math.max(0, fib - 0.8) * 5, 1.3) * 0.28 * clamp01(u * 1.4);
        vein = Math.max(vein, cap);
        let c;
        if (inside) {
            c = u < 0.5 ? lerpC(C.base, C.mid, u / 0.5) : lerpC(C.mid, C.tip, (u - 0.5) / 0.5);
            c = lerpC(c, C.tip, Math.pow(Math.abs(s), 3) * u * 0.55); // (the rims burn brighter)
            const m = 0.9 + 0.2 * (n - 0.5) + 0.06 * (fib - 0.5);
            c = [c[0] * m, c[1] * m, c[2] * m];
            c = lerpC(c, C.vein, vein * 0.8);
        } else {
            c = u < 0.5 ? lerpC(C.outBase, C.outMid, u / 0.5) : lerpC(C.outMid, C.outTip, (u - 0.5) / 0.5);
            const m = 0.88 + 0.22 * (n - 0.5) + 0.1 * (fib - 0.5);
            c = lerpC([c[0] * m, c[1] * m, c[2] * m], C.vein, vein * 0.35);
        }
        const o = (py * W + px) * 4;
        data[o] = Math.min(255, c[0] * 255); data[o + 1] = Math.min(255, c[1] * 255); data[o + 2] = Math.min(255, c[2] * 255);
        data[o + 3] = Math.min(255, (inside ? vein : vein * 0.45) * 255);
    }
    _petalTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    _petalTex.wrapS = _petalTex.wrapT = THREE.ClampToEdgeWrapping;
    _petalTex.magFilter = THREE.LinearFilter; _petalTex.minFilter = THREE.LinearMipmapLinearFilter;
    _petalTex.generateMipmaps = true; _petalTex.needsUpdate = true;
    _petalTex.userData = { keep: true };
    return _petalTex;
}

// ------------------------------------------------------------------ geometry tools
function finish(B, extra = {}, keepUv = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    if (keepUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(keepUv, 2));
    for (const [k, [arr, n]] of Object.entries(extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n));
    g.setIndex(B.i);
    g.computeVertexNormals();
    g.userData.keep = true;
    return g;
}

/** The stem + leaves + calyx (flower space: foot at the origin, neck at (0, STEM_H, 0)). */
let _stem = null;
export function stemGeometry() {
    if (_stem) return _stem;
    const B = new Builder(), r = rng(8101), H = BF.STEM_H;
    const pts = [[0, 0, 0], [0.035, 0.38, 0.02], [-0.025, 0.85, -0.02], [0.012, 1.25, 0.012], [0, H - 0.1, 0]].map((a) => new THREE.Vector3(...a));
    // (a ribbed green stem, paler at the nodes, a warm flush up to the calyx)
    B.tube(new THREE.CatmullRomCurve3(pts).getPoints(22), (t) => 0.062 - 0.02 * t, (t, a) => {
        const rib = 0.88 + 0.12 * Math.cos(a * Math.PI * 2 * 6), node = Math.exp(-(((t * 6) % 1 - 0.5) ** 2) * 60) * 0.12;
        const c = lerpC(hexRGB(0x1f4a1e), hexRGB(0x5f9a34), t * 0.7 + node);
        return lerpC([c[0] * rib, c[1] * rib, c[2] * rib], hexRGB(0xc2561a), clamp01((t - 0.82) / 0.18) * 0.5);
    }, 8, { cap: false });
    // roots: a swelling at the foot and a few root buttresses
    B.tube([new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0, 0.2, 0)], (t) => 0.1 - 0.04 * t, () => hexRGB(0x2d3a1c), 8, { cap: false });
    for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + r() * 0.4;
        B.tube([new THREE.Vector3(Math.cos(a) * 0.04, 0.16, Math.sin(a) * 0.04), new THREE.Vector3(Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13), new THREE.Vector3(Math.cos(a) * 0.24, -0.02, Math.sin(a) * 0.24)], (t) => 0.03 * (1 - 0.7 * t), () => hexRGB(0x3a3f20), 5);
    }
    // leaves: long blades curving out and down, a pale midrib, warm edges that run into the fire's colour at the tips
    const leaf = (y, ang, len, wid, droop) => {
        const ca = Math.cos(ang), sa = Math.sin(ang), nu = 8, nv = 4;
        B.grid(nu, nv, (u, v) => {
            const s = v * 2 - 1;
            const w = wid * Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * Math.pow(u, 0.85))), 0.8);
            const out = len * u * 0.9, up = len * (0.55 * u - droop * u * u);
            const fold = -Math.abs(s) * w * 0.28; // (a trough along the midrib)
            const lat = s * w;
            const x = ca * out - sa * lat, z = sa * out + ca * lat, yy = y + up + fold * 0.8;
            let c = lerpC(hexRGB(0x1d4a1f), hexRGB(0x58a032), u * 0.8);
            c = lerpC(c, hexRGB(0xd4601a), Math.pow(Math.abs(s), 3) * u * 0.7 + clamp01(u - 0.82) * 1.2);
            if (Math.abs(s) < 0.1) c = lerpC(c, hexRGB(0xdde89a), 0.45);
            return { p: [x + 0.02 * ca, yy, z + 0.02 * sa], c };
        }, { flip: false });
        B.grid(nu, nv, (u, v) => { // (the underside, so the blade is seen from below too)
            const s = v * 2 - 1;
            const w = wid * Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * Math.pow(u, 0.85))), 0.8);
            const out = len * u * 0.9, up = len * (0.55 * u - droop * u * u), fold = -Math.abs(s) * w * 0.28, lat = s * w;
            const c = lerpC(hexRGB(0x2a5a24), hexRGB(0x80b048), u);
            return { p: [ca * out - sa * lat + 0.02 * ca, y + up + fold * 0.8 - 0.012, sa * out + ca * lat + 0.02 * sa], c };
        }, { flip: true });
    };
    leaf(0.12, 0.3, 1.05, 0.15, 0.55); leaf(0.1, 2.4, 0.95, 0.14, 0.6); leaf(0.14, 4.3, 1.0, 0.15, 0.6);
    leaf(0.62, 1.2, 0.72, 0.11, 0.4); leaf(0.78, 3.7, 0.68, 0.1, 0.42);
    // the calyx: a cup that holds the petals' feet, and five pointed sepals hugging them
    B.grid(10, 10, (u, v) => {
        const a = v * Math.PI * 2, y = H - 0.16 + u * 0.2, rr = 0.075 + 0.1 * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.35 * u);
        const c = lerpC(hexRGB(0x3c7a24), hexRGB(0xd0661a), u * u);
        return { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], c };
    });
    for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 0.4 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
        B.grid(5, 3, (u, v) => {
            const s = v * 2 - 1, w = 0.07 * Math.sin(Math.PI * (0.1 + 0.8 * u)) * (1 - 0.55 * u);
            const rad = 0.14 + 0.05 * u * u, y = H - 0.14 + u * 0.4;
            const t = -sa, tx = ca; // (tangent)
            return { p: [ca * rad + t * s * w, y, sa * rad + tx * s * w], c: lerpC(hexRGB(0x3a7a22), hexRGB(0xe0701c), u * u) };
        });
    }
    _stem = finish(B);
    return _stem;
}

/** One petal built in its OWN frame (base at the origin, along +y, width +x, the inside +z), with a front and a back skin. */
function petalSkin(B, uvs, hing, len, wid, cup, curl, thick, seed) {
    const nu = 8, nv = 6, r = rng(seed), flut = r() * 6, base = B.n;
    const at = (u, s, side) => {
        const w = wid * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * Math.pow(u, 0.82))), 0.78) * (1 + 0.1 * Math.sin(u * 4 + flut)); // (rounded, a little pointed)
        const e = 1 - s * s;
        const z = cup * s * s * (0.35 + u) - curl * u * u * len + Math.sin(u * 8 + flut) * 0.01 * Math.abs(s) - side * thick * Math.sqrt(Math.max(0, e)) * (1 - u * u * u) * Math.sin(Math.PI * (0.04 + 0.92 * Math.min(1, u * 1.04)));
        return [s * w, len * u, z];
    };
    for (const side of [0, 1]) for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
        const u = a / nu, s = (b / nv) * 2 - 1, q = at(u, s, side);
        B.vert(q[0], q[1], q[2], [1, 1, 1], 0);
        uvs.push((side ? 0.5 : 0) + (b / nv) * 0.5, 1 - u); // (the texture's y=0 is the base: row 127 → v = 0 at the base)
    }
    const per = (nu + 1) * (nv + 1);
    for (const side of [0, 1]) for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
        const i0 = base + side * per + a * (nv + 1) + b, i1 = i0 + 1, i2 = i0 + nv + 1, i3 = i2 + 1;
        if (side === 0) { B.tri(i0, i1, i2); B.tri(i1, i3, i2); } else { B.tri(i0, i2, i1); B.tri(i1, i2, i3); }
    }
    return { from: base, to: B.n };
}

/** The cup's petals (head space: the neck at the origin). Each vertex carries its petal's hinge, hinge axis and how far it shuts. */
let _petals = null;
export function petalGeometry() {
    if (_petals) return _petals;
    const B = new Builder(), uvs = [], hinge = [], axis = [], close = [], r = rng(4417);
    const ring = (n, r0, y0, len, wid, cup, curl, thick, phiOpen, phiShut, turn, seed) => {
        for (let k = 0; k < n; k++) {
            const psi = turn + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.12;
            const L = len * (0.94 + 0.12 * r()), W = wid * (0.94 + 0.1 * r()), po = phiOpen + (r() - 0.5) * 0.12;
            const part = petalSkin(B, uvs, null, L, W, cup, curl, thick, seed + k * 31);
            const o = new THREE.Vector3(Math.cos(psi), 0, Math.sin(psi)), up = new THREE.Vector3(0, 1, 0);
            const t = new THREE.Vector3(-Math.sin(psi), 0, Math.cos(psi));
            const d = o.clone().multiplyScalar(Math.sin(po)).addScaledVector(up, Math.cos(po)).normalize();
            const nrm = new THREE.Vector3().crossVectors(t, d).normalize();
            const bas = new THREE.Vector3().copy(o).multiplyScalar(r0).setY(y0);
            const M = new THREE.Matrix4().makeBasis(t, d, nrm).setPosition(bas);
            const hingeAxis = new THREE.Vector3().crossVectors(o, up).normalize(); // (closing = turning about this axis)
            for (let i = part.from; i < part.to; i++) {
                _v.set(B.p[i * 3], B.p[i * 3 + 1], B.p[i * 3 + 2]).applyMatrix4(M);
                B.p[i * 3] = _v.x; B.p[i * 3 + 1] = _v.y; B.p[i * 3 + 2] = _v.z;
                hinge.push(bas.x, bas.y, bas.z); axis.push(hingeAxis.x, hingeAxis.y, hingeAxis.z); close.push(po - phiShut);
                // a slight per-petal tint (so the cup is not a copy of one petal)
                const tint = 0.9 + 0.2 * ((k * 0.37 + seed * 0.011) % 1);
                B.c[i * 3] = tint; B.c[i * 3 + 1] = tint * (0.96 + 0.08 * ((k * 0.61) % 1)); B.c[i * 3 + 2] = tint * 0.96;
            }
        }
    };
    // outer petals: big, thick, curling out at the tip; inner petals: shorter, cupped, curling in
    ring(BF.OUTER, 0.1, -0.02, 0.72, 0.225, 0.07, 0.12, 0.034, 0.9, 0.12, 0.2, 100);
    ring(BF.INNER, 0.07, 0.0, 0.56, 0.18, 0.08, -0.08, 0.03, 0.6, 0.05, 0.2 + Math.PI / BF.INNER, 400);
    _petals = finish(B, { aHinge: [hinge, 3], aAxis: [axis, 3], aClose: [close, 1] }, uvs);
    return _petals;
}

/** The flame in the cup (additive: brightness only): a tall central tongue and six licking ones; the video card makes it dance. */
let _flame = null;
export function flameGeometry() {
    if (_flame) return _flame;
    const B = new Builder(), r = rng(2203), A = [];
    const lick = (x, z, h, w, lean) => {
        for (const rot of [0, Math.PI / 2, Math.PI / 4]) {
            const ca = Math.cos(rot), sa = Math.sin(rot), nu = 7, nv = 2;
            B.grid(nu, nv, (u, v) => {
                const s = v * 2 - 1, ww = w * Math.sin(Math.PI * (0.04 + 0.5 * Math.pow(u, 0.6))) * (1 - 0.75 * u * u) * (u > 0.995 ? 0 : 1);
                const x2 = x + s * ww * ca + lean * u * u * h, z2 = z + s * ww * sa;
                const hot = 1 - u, c = u < 0.25 ? lerpC(hexRGB(0xfff3b0), hexRGB(0xffc040), u / 0.25) : lerpC(hexRGB(0xffa020), hexRGB(0xb82a06), (u - 0.25) / 0.75);
                A.push(Math.max(0, Math.min(1, (1 - Math.abs(s) ** 2 * 0.9) * (0.95 - 0.8 * u ** 2.2)))); // (clear at the rim and the tip)
                return { p: [x2, 0.05 + h * u, z2], c };
            }, { flip: false });
        }
    };
    lick(0, 0, 1.35, 0.27, 0.05);
    for (let k = 0; k < 6; k++) { const a = k * 1.047 + r() * 0.3; lick(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.7 + 0.3 * r(), 0.13, Math.cos(a) * 0.12); }
    _flame = finish(B);
    const rgba = [];
    for (let i = 0; i < A.length; i++) rgba.push(B.c[i * 3], B.c[i * 3 + 1], B.c[i * 3 + 2], A[i]);
    _flame.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4)); // (colour + alpha: ordinary blending — an additive flame turns pale against the sky)
    return _flame;
}

/** The glowing heart and the stamens round it (self-lit; the pulse comes from the instance colour). */
let _core = null;
export function coreGeometry() {
    if (_core) return _core;
    const B = new Builder(), r = rng(3733);
    const sphere = (cx, cy, cz, rad, c0, c1, nu = 8, nv = 10) => {
        B.grid(nu, nv, (u, v) => {
            const th = u * Math.PI, ph = v * Math.PI * 2, rr = rad * (1 + 0.05 * Math.sin(th * 5 + ph * 3));
            const c = lerpC(c0, c1, Math.pow(Math.abs(Math.cos(th)), 1.5));
            return { p: [cx + Math.sin(th) * Math.cos(ph) * rr, cy + Math.cos(th) * rr, cz + Math.sin(th) * Math.sin(ph) * rr], c };
        });
    };
    sphere(0, 0.16, 0, 0.1, hexRGB(0xffd060), hexRGB(0xffa020)); // the heart
    for (let k = 0; k < 14; k++) { // stamens: slim, tipped with a bright anther
        const a = k * 0.449 + r() * 0.2, rad = 0.07 + 0.07 * (k % 2), h = 0.22 + 0.16 * r();
        const dir = new THREE.Vector3(Math.cos(a) * 0.18, 1, Math.sin(a) * 0.18).normalize();
        B.cone(new THREE.Vector3(Math.cos(a) * rad, 0.05, Math.sin(a) * rad), dir, h, 0.012, hexRGB(0xc84a0c), hexRGB(0xffe070), 4);
        sphere(Math.cos(a) * rad + dir.x * h, 0.05 + dir.y * h, Math.sin(a) * rad + dir.z * h, 0.02, hexRGB(0xfff4b0), hexRGB(0xffd040), 3, 5);
    }
    _core = finish(B);
    return _core;
}

// ------------------------------------------------------------------ the item: «Сердцевина Ярколета»
let _item = null;
/** The flower's heart as an item (~0.3 m): a warm glowing ball of fine golden scales with a short ring of ember-red petals fragments. */
export function brightCoreModel() {
    if (!_item) {
        const B = new Builder(), r = rng(9917);
        // the ball: scaled like a pine cone's heart, white-gold in the middle of each scale → red at its edge
        B.grid(14, 18, (u, v) => {
            const th = u * Math.PI, ph = v * Math.PI * 2, scale = 0.5 + 0.5 * Math.abs(Math.sin(ph * 6 + th * 6)), rr = 0.12 * (1 + 0.1 * scale);
            const c = lerpC(hexRGB(0xc0300a), hexRGB(0xffd868), scale * 0.9 + 0.1 * Math.cos(th));
            return { p: [Math.sin(th) * Math.cos(ph) * rr, 0.14 + Math.cos(th) * rr, Math.sin(th) * Math.sin(ph) * rr], c };
        });
        // petal fragments held round it (they close over it a little)
        for (let k = 0; k < 7; k++) {
            const a = k * 0.898 + r() * 0.2, ca = Math.cos(a), sa = Math.sin(a);
            B.grid(5, 3, (u, v) => {
                const s = v * 2 - 1, w = 0.05 * Math.sin(Math.PI * (0.1 + 0.8 * u));
                const rad = 0.09 + 0.1 * Math.sin(u * 1.6), y = 0.1 + 0.22 * u;
                return { p: [ca * rad - sa * s * w, y, sa * rad + ca * s * w], c: lerpC(hexRGB(0xa81c08), hexRGB(0xffa830), u) };
            });
        }
        _item = new THREE.Mesh(finish(B), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xff7a10, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    }
    const g = new THREE.Group();
    g.add(_item.clone());
    return g;
}
