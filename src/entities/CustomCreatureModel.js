/**
 * CustomCreatureModel.js — how a creature of one's own looks and moves («Да пусть создастся существо …»).
 *
 * The body: CreatureForge.creatureDims (the measures) → a model of joints, each part one of a few SHARED unit shapes
 * scaled (a sphere, a limb, a cone, a box, four kinds of wing, a fin): no geometry of its own, so FarShape draws it as one
 * shape per material (its skin — a texture of its own; the plain colours baked; the eyes; the wings) — ~3–4 draws.
 * Its skin: a texture made from the recipe (fur, scales, feathers, smooth hide, a shell's plates, crystal facets, slime,
 * bark, stone) with its pattern (spots, stripes, a gradient, patches, rings, stars) in its colours — kept by the recipe's
 * key (a few, CACHE): two creatures of a kind share it. A glowing one's skin glows at night (its own emissive, no light).
 *
 * Its moves: poseCreature(model, a, dt) — the 10 ways to walk (WALK: trot, gallop, stride, hop, waddle, scuttle, slither,
 * crawl, roll, bounce) and the 10 ways to fly (FLY: flap, soar, hover, flutter, bat, dragon, float, pulse, swoop, spin),
 * each a whole animation of its own; every one moves only the parts the body has (no legs, no wings — nothing breaks):
 * the legs swing by their pairs' phases, the knees bend, the body bobs and rolls, the spine and the tail wave, the
 * wings beat or glide or fold along the back, the head looks, the eyes blink, it breathes; a newborn grows (`k`).
 */

import * as THREE from 'three';
import { creatureDims } from '../game/CreatureForge.js';
import { createRng } from '../core/math.js';

// ------------------------------------------------------------------ the shared shapes
let G = null;
function geos() {
    if (G) return G;
    const limb = new THREE.CylinderGeometry(1, 0.82, 1, 10, 1); limb.translate(0, -0.5, 0); // (hangs down from its joint)
    const cone = new THREE.ConeGeometry(1, 1, 10, 1); cone.translate(0, 0.5, 0);
    const wing = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); const g = new THREE.ShapeGeometry(s, 6); g.rotateX(-Math.PI / 2); return g; };
    // (a wing lies in the x–z plane: x out along the span 0…1, z along the chord, −z to the front)
    const curve = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
    G = {
        sphere: new THREE.SphereGeometry(1, 16, 12),
        limb, cone,
        box: new THREE.BoxGeometry(1, 1, 1),
        membrane: wing([[0, -0.15], [0.35, -0.3], [0.7, -0.22], [1, -0.05], ...curve(8, (u) => [1 - u, 0.35 + 0.18 * Math.sin(u * Math.PI * 4) * (1 - u)]), [0, 0.15]]),
        feather: wing([[0, -0.2], ...curve(10, (u) => [u, -0.25 + 0.1 * Math.sin(u * Math.PI)]), [1.05, 0.05], ...curve(10, (u) => [1 - u, 0.35 + ((u * 9) % 1) * 0.12 * (1 - u)]), [0, 0.2]]),
        insect: wing(curve(20, (u) => { const a = u * Math.PI * 2; return [0.5 + 0.5 * Math.cos(a + Math.PI), 0.28 * Math.sin(a)]; })),
        butterfly: wing([[0, -0.1], ...curve(14, (u) => [0.15 + 0.85 * Math.sin(u * Math.PI * 0.5), -0.1 - 0.7 * Math.sin(u * Math.PI)]), [0.95, 0.2], ...curve(10, (u) => [0.9 * (1 - u), 0.2 + 0.45 * Math.sin(u * Math.PI)]), [0, 0.1]]),
        fin: wing([[0, 0], [0.4, -0.5], [1, -0.65], [1.15, -0.2], [1, 0.1]]),
    };
    for (const g of Object.values(G)) g.userData = { shared: true };
    return G;
}

// ------------------------------------------------------------------ its skin
const CACHE = new Map(); // recipe key → {mats}
const CACHE_MAX = 24;
const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The skin's colours: the recipe's (or, unsaid, a palette fitting its kind). */
export function paletteOf(recipe, seed = 1) {
    const r = createRng((seed >>> 0) + 3);
    const KIND = {
        fur: [[0x8a5a33, 0xd9b48a, 0x3a2a1c], [0x6e6e74, 0xd6d6d6, 0x2b2b30], [0xc8823a, 0xf2e2c4, 0x5a2e10]],
        scales: [[0x3f7a3a, 0xc8d68a, 0x1e3a1a], [0x7a2a2a, 0xe8b46a, 0x2a0e0e], [0x2d4f8a, 0x9fd0e8, 0x101e3a]],
        feathers: [[0x3a6ea8, 0xe8e0c8, 0xf2c43c], [0xb84a2a, 0xf2d8a0, 0x2a1a10], [0x2a2a30, 0x8ab0c8, 0xf0e070]],
        smooth: [[0xd88aa8, 0xfff0f4, 0x6a2a4a], [0x7ac8a8, 0xeafff4, 0x1e5a4a]], shell: [[0x7a5a2a, 0xd8b878, 0x2a1a08], [0x3a4a5a, 0x9ab0c0, 0x10181e]],
        crystal: [[0x8ae0ff, 0xffffff, 0x3a6ad8], [0xd88aff, 0xfff0ff, 0x6a2ab8]], slime: [[0x6ad84a, 0xd8ff9a, 0x2a6a1a], [0xd84a8a, 0xffb8d8, 0x6a1a3a]],
        bark: [[0x6a4a2a, 0x9a7a4a, 0x3a5a2a]], stone: [[0x8a8a84, 0xc8c4b8, 0x4a4a48]],
    }[recipe.skin] || [[0x8a5a33, 0xd9b48a, 0x3a2a1c]];
    const base = KIND[Math.floor(r() * KIND.length)];
    const c = recipe.colors || [];
    const tint = (v) => { const t = hex(v), j = 0.94 + r() * 0.12; return ((Math.min(255, t[0] * j) << 16) | (Math.min(255, t[1] * j) << 8) | Math.min(255, t[2] * j)) >>> 0; };
    return [tint(c[0] ?? base[0]), tint(c[1] ?? base[1]), tint(c[2] ?? base[2])];
}

/** The skin's picture (96 × 96, made here: no canvas — node and the browser alike). */
export function skinPixels(recipe, pal, N = 96) {
    const px = new Uint8Array(N * N * 4);
    const A = hex(pal[0]), B = hex(pal[1]), C = hex(pal[2]);
    const r = createRng(7 + (recipe.size * 100 | 0));
    const spots = Array.from({ length: 22 }, () => [r() * N, r() * N, 3 + r() * 7]);
    const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const skin = recipe.skin, pat = recipe.pattern;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N;
        let c = A;
        // the pattern (its second colour on the first)
        if (pat === 'spots') { for (const [sx, sy, sr] of spots) { const dx = Math.min(Math.abs(x - sx), N - Math.abs(x - sx)), dy = y - sy; if (dx * dx + dy * dy < sr * sr) { c = B; break; } } }
        else if (pat === 'stripes') { if (Math.sin(u * Math.PI * 12 + Math.sin(v * 9) * 1.2) > 0.35) c = C; }
        else if (pat === 'gradient') c = mix(A, B, v);
        else if (pat === 'patches') { const k = Math.sin(u * 7.1 + Math.sin(v * 5.3) * 2) * Math.sin(v * 6.2 + Math.cos(u * 4.4) * 2); if (k > 0.25) c = B; }
        else if (pat === 'rings') { if (Math.sin(v * Math.PI * 14) > 0.5) c = B; }
        else if (pat === 'stars') { for (const [sx, sy, sr] of spots) { const dx = Math.abs(x - sx), dy = Math.abs(y - sy); if (dx + dy < sr * 0.7 || (dx < 1 && dy < sr) || (dy < 1 && dx < sr)) { c = B; break; } } }
        // the belly: the second colour underneath (the texture's bottom band)
        if (pat !== 'gradient' && v > 0.78) c = mix(c, B, Math.min(1, (v - 0.78) * 6));
        // the skin's own grain
        let k = 1, n = noise(x, y);
        if (skin === 'fur') k = 0.82 + 0.3 * noise(x, Math.floor(y / 3)) * (0.6 + 0.4 * Math.sin(x * 2.1 + y));
        else if (skin === 'scales') { const sx = (x % 8) - 4, sy = ((y + (Math.floor(x / 8) % 2) * 4) % 8) - 4; const d = Math.hypot(sx, sy + 2); k = d > 4.2 && d < 5.4 ? 0.6 : 1.05 - d * 0.04; }
        else if (skin === 'feathers') { const fy = (y + (Math.floor(x / 10) % 2) * 5) % 10, fx = (x % 10) - 5; k = fy < 1 ? 0.65 : 1 - Math.abs(fx) * 0.03 + (fx === 0 ? 0.15 : 0); }
        else if (skin === 'shell') { const gx = x % 24, gy = (y + (Math.floor(x / 24) % 2) * 12) % 24; k = gx < 2 || gy < 2 ? 0.45 : 1 - (gx + gy) * 0.004; }
        else if (skin === 'crystal') { k = 0.85 + 0.35 * Math.abs(Math.sin((x * 0.31 + y * 0.17) * 3) * Math.cos((x * 0.13 - y * 0.29) * 3)); }
        else if (skin === 'slime') { k = 0.9 + 0.25 * Math.max(0, Math.sin(x * 0.2) * Math.sin(y * 0.25)) + (n > 0.985 ? 0.5 : 0); }
        else if (skin === 'bark') k = 0.75 + 0.3 * Math.abs(Math.sin(x * 0.7 + Math.sin(y * 0.15) * 2));
        else if (skin === 'stone') k = 0.8 + 0.25 * noise(Math.floor(x / 4), Math.floor(y / 4)) - (noise(x, y) > 0.97 ? 0.3 : 0);
        else k = 0.95 + 0.08 * Math.sin(u * 20) * Math.sin(v * 20);
        k *= 0.94 + 0.12 * n;
        const i = (y * N + x) * 4;
        px[i] = Math.min(255, c[0] * k); px[i + 1] = Math.min(255, c[1] * k); px[i + 2] = Math.min(255, c[2] * k); px[i + 3] = 255;
    }
    return px;
}

/** The materials of a kind (made once; kept by its key — a few kinds at most). */
export function creatureMaterials(recipe, key, seed = 1) {
    let m = CACHE.get(key);
    if (m) return m;
    if (CACHE.size >= CACHE_MAX) { const old = CACHE.keys().next().value; const o = CACHE.get(old); CACHE.delete(old); for (const x of Object.values(o)) { x.map?.dispose?.(); x.dispose?.(); } }
    const pal = paletteOf(recipe, seed);
    const N = 96, tex = new THREE.DataTexture(skinPixels(recipe, pal, N), N, N, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.needsUpdate = true;
    const glow = recipe.glow != null ? recipe.glow : null;
    const body = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff });
    if (glow != null) { body.emissive = new THREE.Color(glow); body.emissiveIntensity = 0; }
    const acc = hex(pal[2]);
    m = {
        body,
        belly: new THREE.MeshLambertMaterial({ color: pal[1] }),
        acc: new THREE.MeshLambertMaterial({ color: (Math.round(acc[0] * 0.8) << 16) | (Math.round(acc[1] * 0.8) << 8) | Math.round(acc[2] * 0.8) }),
        fin: new THREE.MeshLambertMaterial({ color: pal[1], side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
        claw: new THREE.MeshLambertMaterial({ color: recipe.skin === 'crystal' ? 0xe8f6ff : 0xe8dcc0 }),
        white: new THREE.MeshLambertMaterial({ color: 0xf6f4ee }),
        pupil: new THREE.MeshLambertMaterial({ color: 0x14100c }),
        iris: glow != null || recipe.eyes?.color != null ? new THREE.MeshLambertMaterial({ color: recipe.eyes?.color ?? glow, emissive: recipe.eyes?.color ?? glow, emissiveIntensity: 0.8 }) : new THREE.MeshLambertMaterial({ color: 0x6a4a1a }),
        wing: recipe.wings === 'insect'
            ? new THREE.MeshLambertMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
            : new THREE.MeshLambertMaterial({ color: recipe.wings === 'feather' ? pal[0] : recipe.wings === 'butterfly' ? pal[1] : pal[2], side: THREE.DoubleSide, map: recipe.wings === 'butterfly' || recipe.wings === 'feather' ? tex : null }),
        pal,
    };
    for (const x of Object.values(m)) if (x?.isMaterial) x.userData.keep = true;
    CACHE.set(key, m);
    return m;
}

// ------------------------------------------------------------------ the model
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
function part(parent, geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
}

/**
 * The model of one creature: its joints (userData.rig) and parts. `seed`: this one's own little differences.
 * @returns {THREE.Group} — its feet at 0, its front to −z
 */
export function buildCreature(recipe, key, seed = 1) {
    const g = geos(), D = creatureDims(recipe, seed), M = creatureMaterials(recipe, key, seed);
    const root = new THREE.Group();
    const bob = joint(root, 0, 0, 0);
    const T = D.torso;
    const rig = { D, bob, legs: [], arms: [], wings: [], tail: [], spine: [], eyes: [], ears: [], body: null, neck: null, head: null, jaw: null, base: 1 };
    const serpent = D.plan === 'serpent';
    // the trunk (a serpent: a chain of segments along its length)
    const body = rig.body = joint(bob, 0, T.y, 0);
    if (serpent) {
        part(body, g.sphere, M.body, T.rx, T.ry, T.rz * 0.9);
        part(body, g.sphere, M.belly, T.rx * 0.85, T.ry * 0.6, T.rz * 0.8, 0, -T.ry * 0.38, 0);
    } else {
        part(body, g.sphere, M.body, T.rx, T.ry, T.rz);
        if (D.plan !== 'blob') part(body, g.sphere, M.belly, T.rx * 0.86, T.ry * 0.62, T.rz * 0.84, 0, -T.ry * 0.36, 0);
        if (D.plan === 'insect' || D.plan === 'spider') { // (the abdomen behind)
            const ab = joint(body, 0, T.ry * 0.25, T.rz * 0.95);
            rig.spine.push(ab);
            part(ab, g.sphere, M.body, T.rx * 1.25, T.ry * 1.3, T.rz * 1.6, 0, 0, T.rz * 1.2);
        }
    }
    // the neck and the head
    let headParent = body;
    if (D.neck) {
        const n = rig.neck = joint(body, ...D.neck.at);
        if (!D.upright) n.rotation.x = D.neck.tilt;
        if (D.upright) part(n, g.limb, M.body, D.neck.r, D.neck.len, D.neck.r, 0, D.neck.len, 0);
        else { const seg = joint(n, 0, 0, 0); seg.rotation.x = -Math.PI / 2; part(seg, g.limb, M.body, D.neck.r, D.neck.len, D.neck.r, 0, D.neck.len, 0); }
        headParent = n;
    }
    const H = D.head;
    const head = rig.head = D.upright || !D.neck ? joint(body, ...H.at) : joint(headParent, 0, 0, -D.neck.len - H.r * 0.5);
    if (D.neck && !D.upright) head.rotation.x = -D.neck.tilt; // (the head level again at the neck's end)
    const face = H.r > 0 ? H.r : T.rx;
    if (H.r > 0) {
        part(head, g.sphere, M.body, H.r, H.r * 0.9, H.r * 1.05);
        if (D.snout > 0) {
            if (D.plan === 'bird') { const bk = joint(head, 0, -H.r * 0.1, -H.r * 0.8); bk.rotation.x = -Math.PI / 2; part(bk, g.cone, M.claw, H.r * 0.28, D.snout, H.r * 0.22); }
            else { part(head, g.sphere, M.belly, D.snout * 0.6, D.snout * 0.5, D.snout, 0, -H.r * 0.25, -H.r * 0.85); part(head, g.sphere, M.pupil, D.snout * 0.12, D.snout * 0.1, D.snout * 0.05, D.snout * 0.22, -H.r * 0.18, -H.r * 0.85 - D.snout * 0.95); part(head, g.sphere, M.pupil, D.snout * 0.12, D.snout * 0.1, D.snout * 0.05, -D.snout * 0.22, -H.r * 0.18, -H.r * 0.85 - D.snout * 0.95); }
        }
        // a jaw that opens (a breath, a bite)
        if (D.plan !== 'bird' && D.plan !== 'blob') { const jaw = rig.jaw = joint(head, 0, -H.r * 0.45, -H.r * 0.3); part(jaw, g.sphere, M.belly, H.r * 0.6, H.r * 0.2, H.r * 0.7, 0, 0, -H.r * 0.2); }
    }
    // the eyes: white, the iris, the pupil (blink: their joint's y-scale)
    const eyeRoot = H.r > 0 ? head : body;
    for (const e of D.eyes) {
        const at = H.r > 0 ? e.at : [e.at[0], T.ry * 0.45, -T.rz * 0.82];
        const j = joint(eyeRoot, ...at);
        part(j, g.sphere, M.white, e.r, e.r, e.r * 0.8);
        part(j, g.sphere, M.iris, e.r * 0.62, e.r * 0.62, e.r * 0.3, 0, 0, -e.r * 0.62);
        part(j, g.sphere, M.pupil, e.r * 0.3, e.r * 0.34, e.r * 0.2, 0, 0, -e.r * 0.78);
        rig.eyes.push(j);
    }
    // ears, horns, antennae
    if (D.ears > 0 && face > 0) for (const s of [-1, 1]) {
        const j = joint(eyeRoot, s * face * 0.6, face * 0.65, face * 0.05);
        j.rotation.z = -s * 0.35;
        part(j, g.cone, M.body, face * 0.22 * D.ears, face * 0.6 * D.ears, face * 0.12 * D.ears);
        part(j, g.cone, M.belly, face * 0.13 * D.ears, face * 0.42 * D.ears, face * 0.06 * D.ears, 0, 0, -face * 0.03);
        rig.ears.push(j);
    }
    for (const h of D.horns) { const j = joint(eyeRoot, h.at[0], h.at[1], h.at[2]); j.rotation.z = -h.lean; j.rotation.x = -0.35; part(j, g.cone, M.claw, h.r, h.len, h.r); }
    if (D.antennae) for (const s of [-1, 1]) { const j = joint(eyeRoot, s * face * 0.35, face * 0.6, -face * 0.4); j.rotation.set(-0.7, 0, -s * 0.4); part(j, g.limb, M.acc, face * 0.05, -face * 1.6, face * 0.05); part(j, g.sphere, M.acc, face * 0.12, face * 0.12, face * 0.12, 0, face * 1.6, 0); rig.ears.push(j); }
    // the legs: hip → upper → knee → lower → foot
    for (const L of D.legs) {
        const hip = joint(bob, ...L.hip);
        hip.rotation.z = -L.side * L.splay;
        part(hip, g.sphere, M.body, L.r * 1.5, L.r * 1.5, L.r * 1.5);
        part(hip, g.limb, M.body, L.r * 1.25, L.upper, L.r * 1.25);
        const knee = joint(hip, 0, -L.upper, 0);
        part(knee, g.limb, D.plan === 'spider' || D.plan === 'insect' ? M.acc : M.body, L.r, L.lower, L.r);
        part(knee, g.sphere, M.claw, L.r * 1.25, L.r * 0.7, L.r * 1.6, 0, -L.lower, -L.r * 0.4);
        rig.legs.push({ ...L, hipAt: L.hip, hip, knee });
    }
    for (const A of D.arms) {
        const sh = joint(body, A.at[0], A.at[1] - T.y, A.at[2]);
        part(sh, g.limb, M.body, A.r, A.len * 0.5, A.r);
        const el = joint(sh, 0, -A.len * 0.5, 0);
        part(el, g.limb, M.body, A.r * 0.9, A.len * 0.5, A.r * 0.9);
        part(el, g.sphere, M.claw, A.r * 1.3, A.r * 1.3, A.r * 1.3, 0, -A.len * 0.5, 0);
        rig.arms.push({ sh, el, side: A.side });
    }
    // the tail: a chain; its end by its kind
    if (D.tail) {
        const tl = D.tail;
        let parent = joint(body, 0, tl.at[1] - T.y, tl.at[2]);
        const seg = tl.len / tl.n;
        for (let i = 0; i < tl.n; i++) {
            const k = 1 - i / tl.n;
            const j = i === 0 ? parent : joint(parent, 0, 0, seg);
            const rr = tl.r * (serpent ? 0.35 + 0.65 * k : 0.4 + 0.6 * k);
            part(j, g.sphere, M.body, rr, rr, seg * 0.62, 0, 0, seg * 0.5);
            if (serpent) part(j, g.sphere, M.belly, rr * 0.85, rr * 0.55, seg * 0.55, 0, -rr * 0.4, seg * 0.5);
            if (tl.kind === 'spiky' && i % 2 === 0) { const s = joint(j, 0, rr * 0.8, seg * 0.5); part(s, g.cone, M.claw, rr * 0.35, rr * 1.2, rr * 0.35); }
            rig.tail.push(j);
            parent = j;
        }
        const end = joint(parent, 0, 0, seg);
        const er = tl.r * 0.6;
        if (tl.kind === 'bushy') part(end, g.sphere, M.belly, er * 2, er * 2, er * 3, 0, 0, er * 1.5);
        else if (tl.kind === 'club') { part(end, g.sphere, M.acc, er * 2.2, er * 2, er * 2.2); for (const s of [-1, 1]) { const sp = joint(end, s * er * 1.6, 0, 0); sp.rotation.z = -s * Math.PI / 2; part(sp, g.cone, M.claw, er * 0.5, er * 1.5, er * 0.5); } }
        else if (tl.kind === 'fin') { const f = joint(end, 0, 0, 0); f.rotation.z = Math.PI / 2; part(f, g.fin, M.fin, tl.len * 0.5 + T.ry, 1, tl.len * 0.5 + T.ry); const f2 = joint(end, 0, 0, 0); f2.rotation.z = -Math.PI / 2; part(f2, g.fin, M.fin, tl.len * 0.5 + T.ry, 1, tl.len * 0.5 + T.ry); }
        else if (tl.kind === 'feather') { for (const a of [-0.5, 0, 0.5]) { const f = joint(end, 0, 0, 0); f.rotation.y = Math.PI / 2 + a; part(f, g.feather, M.wing, tl.len * 0.9, 1, tl.len * 0.5); } }
        rig.tailEnd = end;
    }
    for (const f of D.fins) { const j = joint(body, 0, f.at[1] - T.y, f.at[2]); j.rotation.z = Math.PI / 2; part(j, g.fin, M.fin, f.h, 1, f.len); }
    // the wings
    for (const W of D.wings) {
        const root = joint(body, W.at[0], W.at[1] - T.y, W.at[2]);
        const shape = W.kind === 'feather' ? g.feather : W.kind === 'insect' ? g.insect : W.kind === 'butterfly' ? g.butterfly : g.membrane;
        const w = part(root, shape, M.wing, W.side * W.span, 1, W.chord);
        if (W.kind === 'bat' || W.kind === 'dragon') { // (the wing's arm: a bone along its front edge, a claw at its bend)
            const arm = part(root, g.limb, M.acc, W.chord * 0.06, W.span * 0.75, W.chord * 0.06, 0, 0, -W.chord * 0.1);
            arm.rotation.z = W.side * Math.PI / 2; arm.position.x = 0;
            part(root, g.cone, M.claw, W.chord * 0.05, W.chord * 0.2, W.chord * 0.05, W.side * W.span * 0.7, 0, -W.chord * 0.25);
        }
        rig.wings.push({ ...W, root, mesh: w });
    }
    root.userData.rig = rig;
    root.userData.head = head;
    root.userData.mats = M;
    root.userData.dims = D;
    return root;
}

// ================================================================== the moves
const TAU = Math.PI * 2;
/** How far one cycle of its legs carries it (m): the phase goes on with the distance, not the time. */
const strideOf = (D) => Math.max(0.25, (D.legs.length ? D.legs[0].hip[1] * 1.7 : D.H * 0.6));

/** The phase offset of a leg in a walk (by its pair and side). */
function legPhase(walk, L, n) {
    const ps = L.pair, s = L.side > 0 ? 1 : 0;
    switch (walk) {
        case 'gallop': return L.front ? s * 0.25 : Math.PI * 0.85 + s * 0.25;
        case 'hop': return 0;
        case 'scuttle': return n >= 8 ? ps * (Math.PI / 2) + s * Math.PI : ((ps + s) % 2) * Math.PI; // (a wave of eight; a tripod of six)
        case 'stride': case 'waddle': return s * Math.PI;
        default: return ((ps + s) % 2) * Math.PI; // (trot, crawl: the diagonal pairs together)
    }
}

/**
 * Its pose this frame. a: {mode: 'idle'|'walk'|'fly'|'swim'|'dead'|'trip', walk, fly, speed (m/s), vy, look (rad),
 * k (0…1 grown), sleep (0…1)} — its own clocks (a.t, a.phase, a.blink) are kept on it.
 */
export function poseCreature(model, a, dt) {
    const R = model.userData.rig;
    if (!R) return;
    const D = R.D;
    a.t = (a.t || 0) + dt;
    const t = a.t;
    const S = Math.max(0.05, a.k ?? 1) * (a.scale || 1);
    model.scale.setScalar(S);
    const bob = R.bob, body = R.body;
    bob.position.set(0, 0, 0); bob.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
    const breathe = 1 + 0.025 * Math.sin(t * 2.1);
    body.scale.set(1, breathe, 1);
    // blinking; the head looking about
    a.blink = (a.blink ?? 2 + Math.random() * 3) - dt;
    const shut = a.blink < 0.12 || a.sleep > 0.5;
    if (a.blink < 0) a.blink = 2 + Math.random() * 4;
    for (const e of R.eyes) e.scale.y = shut ? 0.12 : 1;
    if (R.head) { R.head.rotation.y = (a.look || 0) * 0.6 + 0.15 * Math.sin(t * 0.37); }
    if (R.jaw) R.jaw.rotation.x = (a.breath || 0) * 0.6 + (a.bite || 0) * 0.5;
    for (const e of R.ears) e.rotation.y = 0.12 * Math.sin(t * 1.3 + e.position.x);
    if (a.mode === 'dead') { bob.rotation.z = Math.PI / 2 * Math.min(1, (a.deadT || 0) * 2); bob.position.y = D.torso.rx * 0.6 * Math.min(1, (a.deadT || 0) * 2); for (const L of R.legs) { L.hip.rotation.x = 0.3; L.knee.rotation.x = -0.4; } return; }
    const speed = a.speed || 0;
    const fly = a.mode === 'fly';
    // the phase of the legs: by the distance walked
    a.phase = ((a.phase || 0) + (speed / strideOf(D)) * TAU * dt) % (TAU * 100);
    const ph = a.phase, moving = speed > 0.05 && !fly;
    const amp = moving ? Math.min(1, speed / 2) : 0;
    const walk = a.walk || 'trot';
    const n = R.legs.length;
    // ---- the legs
    for (const L of R.legs) {
        const p = ph + legPhase(walk, L, n);
        let swing = Math.sin(p) * 0.55 * amp, bend = Math.max(0, Math.cos(p)) * 0.7 * amp;
        if (walk === 'waddle') swing *= 0.5;
        if (walk === 'crawl') { swing *= 0.8; L.hip.rotation.z = -L.side * (L.splay + 0.7); }
        else L.hip.rotation.z = -L.side * L.splay;
        if (walk === 'scuttle') { L.hip.rotation.y = Math.sin(p) * 0.45 * amp * L.side; swing *= 0.4; }
        if (walk === 'hop' && moving) { swing = -0.35 + Math.sin(p) * 0.5; bend = 0.3 + 0.4 * Math.max(0, -Math.sin(p)); }
        if (walk === 'roll' || walk === 'bounce' || walk === 'slither') { swing = 0; bend = 0.2; }
        if (fly) { swing = a.fly === 'hover' || a.fly === 'float' ? 0.15 : 0.6; bend = -0.9; } // (tucked in the air)
        if (a.sleep > 0.5) { swing = 0.9 * (L.front ? -1 : 1); bend = 1.2; }
        L.hip.rotation.x = -swing; // (−z is its front: a positive swing forward)
        L.knee.rotation.x = (D.plan === 'spider' ? -0.9 : 0) + bend * (L.front || D.upright ? -1 : 1) * 0.8;
    }
    for (const A of R.arms) {
        A.sh.rotation.x = moving ? Math.sin(ph + (A.side > 0 ? 0 : Math.PI)) * 0.5 * amp : 0.05 * Math.sin(t);
        A.el.rotation.x = -0.25 - (a.bite || 0) * 1.2;
        A.sh.rotation.z = -A.side * 0.12;
    }
    // ---- the body by the walk
    const legH = D.legs[0]?.hip[1] || 0;
    switch (fly ? null : walk) {
        case 'trot': bob.position.y = Math.abs(Math.sin(ph * 2)) * 0.04 * D.H * amp; break;
        case 'gallop': bob.position.y = Math.max(0, Math.sin(ph)) * 0.09 * D.H * amp; bob.rotation.x = Math.cos(ph) * 0.12 * amp; break;
        case 'stride': bob.position.y = Math.abs(Math.sin(ph)) * 0.03 * D.H * amp; bob.rotation.z = Math.sin(ph) * 0.04 * amp; break;
        case 'hop': bob.position.y = moving ? Math.max(0, Math.sin(ph)) * 0.35 * D.H : 0; bob.rotation.x = moving ? -Math.cos(ph) * 0.2 : 0; break;
        case 'waddle': bob.rotation.z = Math.sin(ph) * 0.2 * Math.max(0.3, amp); bob.position.y = Math.abs(Math.sin(ph)) * 0.02 * D.H; break;
        case 'scuttle': bob.position.y = Math.abs(Math.sin(ph * 3)) * 0.015 * D.H * amp; break;
        case 'crawl': bob.position.y = -legH * 0.35; body.rotation.y = Math.sin(ph) * 0.18 * amp; break;
        case 'roll': a.roll = ((a.roll || 0) - speed / Math.max(0.2, D.torso.ry) * dt) % TAU; body.rotation.x = a.roll; break;
        case 'bounce': { const u = Math.abs(Math.sin(ph * 0.5)); bob.position.y = moving ? u * 0.4 * D.H : 0.02 * D.H * Math.abs(Math.sin(t * 2)); body.scale.set(1 + (1 - u) * 0.18 * amp, (1 - (1 - u) * 0.22 * amp) * breathe, 1 + (1 - u) * 0.18 * amp); break; }
        default: break;
    }
    if (walk !== 'roll' || fly) body.rotation.x = 0;
    if (walk !== 'crawl' || fly) body.rotation.y = 0;
    // ---- the spine, the tail: a wave (a serpent / a fish swims with it)
    const waveAmp = walk === 'slither' && !fly ? 0.45 * Math.max(0.3, amp) : a.mode === 'swim' ? 0.4 : 0.12 + 0.1 * amp;
    const wf = walk === 'slither' ? ph : t * (2 + speed);
    R.tail.forEach((j, i) => { j.rotation.y = Math.sin(wf - i * 0.75) * waveAmp; j.rotation.x = D.plan === 'serpent' ? 0 : -0.15 + 0.05 * Math.sin(t * 1.7 + i); });
    if (walk === 'slither' && !fly && R.body) body.rotation.y = Math.sin(wf + 0.75) * waveAmp * 0.6;
    R.spine.forEach((j) => { j.rotation.x = 0.06 * Math.sin(t * 1.5); });
    // ---- the wings
    const W = R.wings;
    if (W.length) {
        const f = a.fly || 'flap';
        const base = 2.6 / Math.sqrt(Math.max(0.4, D.H));
        let beat = 0, open = 1, rate = base;
        if (fly) {
            switch (f) {
                case 'flap': rate = base * 2.2; beat = Math.sin(t * rate * TAU / 2) * 0.85; break;
                case 'soar': { const burst = Math.max(0, Math.sin(t * 0.35)) > 0.92 ? 1 : 0; rate = base * 2; beat = 0.12 + Math.sin(t * rate * TAU / 2) * 0.7 * burst + 0.04 * Math.sin(t * 0.8); break; }
                case 'hover': rate = base * 7; beat = Math.sin(t * rate * TAU / 2) * 0.6; break;
                case 'flutter': rate = base * (2.6 + Math.sin(t * 1.3)); beat = Math.sin(t * rate * TAU / 2) * (0.75 + 0.35 * Math.sin(t * 1.7)); break;
                case 'bat': rate = base * 3.4; beat = Math.sin(t * rate * TAU / 2) * 1.0; break;
                case 'dragon': rate = base * 1.1; beat = Math.sin(t * rate * TAU / 2) * 1.1; break;
                case 'swoop': beat = (a.vy || 0) < -2 ? -0.2 : Math.sin(t * base * 2.4 * TAU / 2) * 0.9; break;
                case 'spin': rate = base * 4; beat = Math.sin(t * rate * TAU / 2) * 0.4; break;
                default: beat = 0.15 * Math.sin(t * 1.4); break; // (float, pulse: the wings only steady it)
            }
        } else { open = 0; } // (on the ground: folded along the back)
        for (const w of W) {
            const s = w.side;
            const ang = fly ? beat * (w.row ? 0.8 : 1) : 0; // (a butterfly's hind pair a little behind the front one)
            // (folded: the wing laid back along the body, its tip to the tail, a little down over the flank)
            w.root.rotation.y = open ? s * 0.08 * Math.sin(t * rate) : -s * (w.kind === 'insect' || w.kind === 'butterfly' ? 1.25 : 1.4);
            w.root.rotation.z = open ? -s * ang : -s * (w.kind === 'insect' ? 0.05 : 0.3);
            w.root.rotation.x = open ? 0 : 0;
        }
    }
    // ---- the body in the air by the flight
    if (fly) {
        const f = a.fly || 'flap';
        bob.rotation.x = Math.max(-0.6, Math.min(0.6, -(a.pitch || 0)));
        bob.rotation.z = a.roll || 0;
        switch (f) {
            case 'hover': bob.rotation.x = -0.45; bob.position.y = Math.sin(t * 5) * 0.02 * D.H; break;
            case 'flutter': bob.position.y = Math.sin(t * 3.2) * 0.12 * D.H; break;
            case 'bat': bob.rotation.z += Math.sin(t * 9) * 0.12; bob.position.y = Math.sin(t * 7) * 0.05 * D.H; break;
            case 'dragon': bob.position.y = -Math.sin(t * 2.6 / Math.sqrt(Math.max(0.4, D.H)) * TAU / 2) * 0.06 * D.H; break;
            case 'float': bob.position.y = Math.sin(t * 1.2) * 0.12 * D.H; bob.rotation.z = Math.sin(t * 0.8) * 0.12; break;
            case 'pulse': { const pu = Math.max(0, Math.sin(t * 3)); body.scale.set(1 + pu * 0.14, (1 - pu * 0.18) * breathe, 1 + pu * 0.14); bob.position.y = -pu * 0.06 * D.H; break; }
            case 'spin': a.spin = ((a.spin || 0) + dt * 4) % TAU; bob.rotation.y = a.spin; break;
            default: break;
        }
    }
    if (a.mode === 'swim') { bob.rotation.z = Math.sin(t * 2) * 0.06; bob.position.y = Math.sin(t * 1.6) * 0.04 * D.H; }
    if (a.mode === 'trip') { bob.rotation.x = 0.5 * Math.sin(Math.min(1, a.tripT || 0) * Math.PI); }
    if (a.sleep > 0.5) { bob.position.y = -legH * 0.55; bob.rotation.z = 0.05; }
}

/** One of each look for the loading screen (the shaders: the skin, plain colours, glowing eyes, a see-through wing). */
export function sampleCreature() {
    return buildCreature({ plan: 'dragon', size: 2, legs: 4, wings: 'insect', tail: 'club', skin: 'scales', pattern: 'spots', colors: [0x3f7a3a, 0xc8d68a, 0x1e3a1a], eyes: { n: 2, size: 1, color: 0xffe060 }, horns: { n: 2, len: 1 }, glow: 0x9ef0ff }, 'sample', 1);
}
