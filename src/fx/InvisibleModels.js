/**
 * InvisibleModels.js — the looks of the invisible world (Invisibles.js): the bird of Spencer, its feather, and the sheaf of Beslan's grass.
 *
 * The bird of Spencer (SpencerBirds.js): a small songbird of unearthly beauty, ROSE-PINK and glowing — a soft body from pale blush
 * on the breast to deep rose on the back, a head with a crest of three curling feathers and a bright golden beak, big dark eyes with a
 * spark, wings of two rows of coverts and nine long primaries (blush at the root, magenta in the middle, violet at the tips), a fan of
 * five tail feathers and two long streamers with teardrop ends; small golden legs. A faint halo of light round it (one soft sprite)
 * that swells at night. Cost: four meshes of one shared material (body+head+beak+legs, tail, two wings) and one sprite; every bird uses
 * the same shapes (made once). No light of its own (the glow is the material's emission and the halo).
 *
 * Size (CLAUDE.md «Размеры»): the hero is ~3.5 m, a block 1 m: the bird's body is ~0.62 m long, its wingspan ~1.25 m.
 * Forward is +Z, up +Y, the left wing +X (the same as the owl's: yaw points along (sin, cos)).
 */
import * as THREE from 'three';
import { writeTuft } from '../world/InvisibleFlora.js';

/** The look of "another world": every invisible thing is drawn this see-through (the author: ~15 % transparent) and shimmers a little. */
export const GHOST = { ALPHA: 0.85, SHIMMER: 0.04 };

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c0, c1, t) => [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];

// the rose palette (sRGB-ish, 0…1)
const BLUSH = [1.0, 0.82, 0.88], ROSE = [1.0, 0.42, 0.68], MAGENTA = [0.92, 0.2, 0.55], DEEP = [0.78, 0.12, 0.45], VIOLET = [0.66, 0.4, 0.98], GOLD = [1.0, 0.8, 0.35], PEARL = [1.0, 0.95, 0.97];

/** A feather blade along +Z (length `len`, widest `wid`), arched by `bend`; colours root → middle → tip; the rib a little lighter. Indexed, double-sided material. */
function featherBlade(len, wid, rows, bend, c0, c1, c2, tipRound = 0.9, jag = 0) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= rows; i++) {
        const t = i / rows, w = wid * Math.pow(Math.max(0, Math.sin(Math.PI * (0.06 + tipRound * t))), 0.62) * (i === rows ? 0.05 : 1) * (jag && i % 2 ? 1 - jag : 1); // (jag: a serrated edge, like barbs)
        const y = bend * t * t, z = t * len;
        const base = t < 0.5 ? mix(c0, c1, t * 2) : mix(c1, c2, (t - 0.5) * 2);
        const rib = mix(base, PEARL, 0.45);
        pos.push(-w, y, z, 0, y + 0.004, z, w, y, z);
        col.push(...mix(base, DEEP, 0.12), ...rib, ...mix(base, DEEP, 0.12));
        if (i) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

/** An ellipsoid with a colour by height (a soft belly-to-back gradient) — for the body and the head. */
function blob(rx, ry, rz, top, bottom, ws = 14, hs = 10) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
        const k = Math.max(0, Math.min(1, (p.getY(i) / ry + 1) / 2)), j = 0.04 * Math.sin(i * 12.9898);
        const c = mix(bottom, top, k * k * (3 - 2 * k));
        col[i * 3] = Math.min(1, c[0] + j); col[i * 3 + 1] = Math.min(1, c[1] + j * 0.6); col[i * 3 + 2] = Math.min(1, c[2] + j * 0.6);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
}

const solid = (g, c) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
};

function merge(parts) {
    const geos = parts.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
        if (!g.attributes.normal) g.computeVertexNormals();
        return g;
    });
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
        const a = new Float32Array(n * 3);
        let o = 0;
        for (const g of geos) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
        out.setAttribute(name, new THREE.BufferAttribute(a, 3));
    }
    for (const g of geos) g.dispose();
    out.computeBoundingSphere();
    out.userData.shared = true; // (made once; never disposed with a bird)
    return out;
}

let _bird = null;

/** The shapes and the material, made once. */
function birdParts() {
    if (_bird) return _bird;
    // ---- the body: one shape (body, breast, head, crest, beak, eyes, legs)
    const body = [];
    body.push({ geo: blob(0.16, 0.17, 0.3, ROSE, BLUSH), pos: [0, 0, 0] });
    body.push({ geo: blob(0.13, 0.13, 0.15, BLUSH, PEARL), pos: [0, -0.03, 0.15] }); // (the fluffed breast)
    body.push({ geo: blob(0.115, 0.115, 0.125, MAGENTA, ROSE), pos: [0, 0.145, 0.25] }); // (the head)
    for (let k = 0; k < 3; k++) { // (the crest: three curling feathers)
        body.push({ geo: featherBlade(0.15 - k * 0.03, 0.022, 4, 0.05, ROSE, MAGENTA, VIOLET, 0.85), pos: [(k - 1) * 0.035, 0.235, 0.22 - k * 0.02], rot: [-1.05 - k * 0.1, (k - 1) * 0.35, 0] });
    }
    const beak = solid(new THREE.ConeGeometry(0.03, 0.12, 8), GOLD);
    body.push({ geo: beak, pos: [0, 0.125, 0.385], rot: [Math.PI / 2 + 0.12, 0, 0] });
    body.push({ geo: solid(new THREE.SphereGeometry(0.018, 6, 4), mix(GOLD, DEEP, 0.2)), pos: [0, 0.098, 0.34], scale: [1.4, 0.7, 1] }); // (the lower beak)
    for (const s of [-1, 1]) {
        body.push({ geo: solid(new THREE.SphereGeometry(0.024, 8, 6), [0.08, 0.02, 0.06]), pos: [s * 0.088, 0.17, 0.3] }); // (the eye)
        body.push({ geo: solid(new THREE.SphereGeometry(0.008, 5, 4), [1, 1, 1]), pos: [s * 0.096, 0.18, 0.317] }); // (the spark in it)
        body.push({ geo: solid(new THREE.CylinderGeometry(0.0075, 0.006, 0.12, 5), GOLD), pos: [s * 0.055, -0.19, 0.02], rot: [0.3, 0, 0] }); // (a leg)
        for (let t = -1; t <= 1; t++) body.push({ geo: solid(new THREE.CylinderGeometry(0.004, 0.0055, 0.06, 4), GOLD), pos: [s * 0.055 + t * 0.016, -0.255, 0.06], rot: [Math.PI / 2 - 0.1, 0, t * 0.3] }); // (the toes)
    }
    // ---- the tail: five fan feathers and two long streamers with teardrop ends
    const tail = [];
    for (let k = -2; k <= 2; k++) tail.push({ geo: featherBlade(0.42 - Math.abs(k) * 0.03, 0.045, 7, -0.03, ROSE, MAGENTA, VIOLET), pos: [k * 0.012, 0, -0.22], rot: [0.06 - Math.abs(k) * 0.02, Math.PI + k * 0.2, 0] });
    for (const s of [-1, 1]) {
        const streamer = featherBlade(0.78, 0.022, 12, -0.1, MAGENTA, DEEP, VIOLET, 0.55);
        tail.push({ geo: streamer, pos: [s * 0.03, 0.01, -0.22], rot: [0.12, Math.PI + s * 0.07, s * 0.05] });
        tail.push({ geo: blob(0.052, 0.012, 0.075, VIOLET, ROSE, 10, 6), pos: [s * 0.03 - s * 0.05, -0.085, -0.93], rot: [0, s * 0.07, 0] }); // (the teardrop at its end)
    }
    // ---- a wing pointing +X from the shoulder: the arm, two rows of coverts, nine primaries
    const wing = [];
    wing.push({ geo: blob(0.2, 0.035, 0.065, ROSE, BLUSH, 10, 6), pos: [0.17, 0, 0] });
    for (let i = 0; i < 6; i++) wing.push({ geo: featherBlade(0.17 - i * 0.008, 0.035, 4, 0.02, BLUSH, ROSE, MAGENTA), pos: [0.05 + i * 0.045, 0.012, -0.03 - i * 0.012], rot: [0, Math.PI / 2 + 0.45 + i * 0.1, 0] }); // (coverts, the first row)
    for (let i = 0; i < 9; i++) {
        const lead = i / 8, L = 0.52 - 0.17 * lead * lead, wd = 0.046 - 0.01 * lead;
        wing.push({ geo: featherBlade(L, wd, 8, 0.045, ROSE, MAGENTA, VIOLET), pos: [0.1 + 0.075 * (1 - lead) * 2.4 - 0.02, 0.004 * i, -0.012 * i], rot: [0, Math.PI / 2 + 0.06 + 0.78 * lead, 0] });
    }
    for (let i = 0; i < 4; i++) wing.push({ geo: featherBlade(0.12, 0.03, 3, 0.02, PEARL, BLUSH, ROSE), pos: [0.22 + i * 0.07, 0.02, 0.02], rot: [0, Math.PI / 2 - 0.18 + i * 0.05, 0] }); // (the pale leading edge)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: GHOST.ALPHA, emissive: new THREE.Color(1, 0.3, 0.6), emissiveIntensity: 0.55, depthWrite: false });
    mat.userData.shared = true;
    mat.customProgramCacheKey = () => 'spencerbird';
    // the halo: a soft round sprite
    let haloMat = null;
    if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,170,220,0.9)'); gr.addColorStop(0.35, 'rgba(255,100,180,0.35)'); gr.addColorStop(1, 'rgba(255,80,160,0)');
        cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(cv);
        haloMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 });
        haloMat.userData.shared = true;
    }
    const wingGeo = merge(wing);
    wingGeo.scale(0.74, 0.74, 0.74); // (the wing is built long for its fine feathers; this brings the span to ~1.3 m)
    wingGeo.computeBoundingSphere();
    _bird = { body: merge(body), tail: merge(tail), wing: wingGeo, mat, haloMat };
    return _bird;
}

/** The bird of Spencer: a Group (forward +Z) with userData { body, head, tail, wings:[{root, side}], halo }. Shapes and material are shared. */
export function spencerBirdModel() {
    const P = birdParts();
    const g = new THREE.Group();
    g.name = 'spencerBird';
    const tilt = new THREE.Group(); // (the body tips as a whole: pitch and roll)
    g.add(tilt);
    const bodyMesh = new THREE.Mesh(P.body, P.mat); bodyMesh.renderOrder = 2; tilt.add(bodyMesh);
    const tail = new THREE.Group(); tail.position.set(0, 0, -0.02); tilt.add(tail);
    const tailMesh = new THREE.Mesh(P.tail, P.mat); tailMesh.renderOrder = 2; tail.add(tailMesh);
    const wings = [];
    for (const s of [1, -1]) {
        const root = new THREE.Group();
        root.position.set(s * 0.12, 0.08, 0.04);
        root.scale.x = s;
        const m = new THREE.Mesh(P.wing, P.mat); m.renderOrder = 2;
        root.add(m);
        tilt.add(root);
        wings.push({ root, side: s });
    }
    const head = new THREE.Object3D(); head.position.set(0, 0.145, 0.25); tilt.add(head); // (where its eyes are: for the mind that enters it)
    let halo = null;
    if (P.haloMat) { halo = new THREE.Sprite(P.haloMat); halo.scale.setScalar(2.2); halo.position.y = 0.05; halo.renderOrder = 1; tilt.add(halo); }
    g.userData = { tilt, body: bodyMesh, head, tail, wings, halo, shared: true, spencer: true };
    return g;
}

/** The shared material (the system sets its opacity each frame: shimmer; and its glow at night). */
export const spencerMaterial = () => birdParts().mat;
export const spencerHaloMaterial = () => birdParts().haloMat;

/**
 * Pose the bird: `a` = { mode: 'fly' | 'glide' | 'perch' | 'hop' | 'fall', pitch, roll, flap (phase), t }.
 * Flying: the wings beat in a clean down-up with the tips lagging; gliding: spread, a slow ripple; perched: folded along the body,
 * the tail up a little; hopping: small bounces.
 */
export function poseSpencer(model, a, dt) {
    const U = model.userData, m = a.mode || 'glide';
    a.t = (a.t || 0) + dt;
    const ground = m === 'perch' || m === 'hop';
    if (m === 'fly') a.flap = (a.flap || 0) + dt * 15;
    else if (m === 'glide') a.flap = (a.flap || 0) + dt * 1.1;
    else if (m === 'fall') a.flap = (a.flap || 0) + dt * 22;
    const F = (a.fold ?? (ground ? 1 : 0)) + ((ground ? 1 : 0) - (a.fold ?? (ground ? 1 : 0))) * Math.min(1, dt * 8);
    a.fold = F;
    for (const w of U.wings) {
        const s = Math.sin(a.flap), c = Math.cos(a.flap);
        let lift, sweep;
        if (m === 'fly' || m === 'fall') { lift = 0.2 + 0.85 * s; sweep = -0.1 + 0.16 * c; }
        else if (m === 'glide') { lift = 0.12 + 0.05 * s; sweep = -0.05; }
        else { lift = 0.1; sweep = 0; }
        // (the right wing is the left one mirrored — scale.x = −1 — so its turns go the other way: × side)
        w.root.rotation.set(0, (sweep * (1 - F) + 1.15 * F) * w.side, (lift * (1 - F) - 1.2 * F) * w.side);
    }
    const pitch = ground ? -0.35 : m === 'fall' ? 0.9 : (a.pitch || 0) + 0.12;
    const roll = ground ? 0 : (a.roll || 0);
    U.tilt.rotation.x += (pitch - U.tilt.rotation.x) * Math.min(1, dt * 7);
    U.tilt.rotation.z += (roll - U.tilt.rotation.z) * Math.min(1, dt * 7);
    if (m === 'hop') a.hop = (a.hop || 0) + dt * 10;
    a.lift = (a.lift ?? (ground ? 0.27 : 0)) + ((ground ? 0.27 : 0) - (a.lift ?? (ground ? 0.27 : 0))) * Math.min(1, dt * 9);
    U.tilt.position.y = (m === 'hop' ? 0.1 * Math.abs(Math.sin(a.hop)) : 0) + (m === 'fly' ? 0.03 * Math.sin(a.flap * 2) : 0) + a.lift;
    U.tail.rotation.x = ground ? 0.35 + 0.08 * Math.sin(a.t * 2.3) : 0.08 * Math.sin(a.t * 3.1) - 0.1 * (a.pitch || 0);
    U.tail.rotation.y = 0.12 * Math.sin(a.t * 1.7 + 1);
    if (U.halo) U.halo.scale.setScalar(2.0 + 0.25 * Math.sin(a.t * 2.4 + (a.seed || 0)));
}

// ============================================================ the feather and the sheaf (things lying in the world)
let _feather = null;
/** Spencer's feather: a slim plume, blush at the quill → hot rose → violet tip, glowing (unlit material), a fine pearly rib. */
export function spencerFeatherItem() {
    if (!_feather) {
        const vane = featherBlade(0.34, 0.062, 28, 0.03, BLUSH, ROSE, VIOLET, 0.92, 0.2);
        const quill = new THREE.CylinderGeometry(0.0055, 0.01, 0.1, 6); quill.translate(0, 0.05, 0);
        solid(quill, PEARL);
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96, toneMapped: false });
        // lay the blade along +Y like the other feathers (the item frame: up the quill)
        vane.rotateX(-Math.PI / 2);
        vane.translate(0, 0.09, 0);
        for (const g of [vane, quill]) g.userData.shared = true;
        m.userData.shared = true;
        _feather = { vane, quill, m };
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(_feather.quill, _feather.m), new THREE.Mesh(_feather.vane, _feather.m));
    g.rotation.z = 0;
    return g;
}

let _sheaf = null;
/** A sheaf of Beslan's grass: a few stems with pale plumes and arching ribbon leaves, tied with a blade — aqua-white glow. */
export function beslanBundleItem() {
    if (!_sheaf) {
        // built from InvisibleFlora's tuft writer, so a sheaf looks like the plant it was plucked from
        const pos = [], col = [];
        const w = { vert(x, y, z, r, g, b) { pos.push(x, y, z); col.push(r, g, b); } };
        writeTuft(w, 0, 0, 0, 0.5, (k) => 0.5 + 0.5 * Math.sin(k * 12.9898));
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.userData.shared = true;
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95, toneMapped: false });
        m.userData.shared = true;
        _sheaf = { g, m };
    }
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(_sheaf.g, _sheaf.m);
    mesh.scale.setScalar(0.55);
    mesh.position.y = -0.12;
    grp.add(mesh);
    return grp;
}
