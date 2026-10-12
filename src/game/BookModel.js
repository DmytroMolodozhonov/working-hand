/**
 * BookModel.js — the book of spells as a real thing: two covers on a spine,
 * a block of pages under each, and two page faces that show the spread.
 *
 * Local frame: the spine along Y (the page's height), the open spread across
 * X, the pages looking along +Z (at the reader). setBookOpen(model, k) folds
 * it: k = 0 — closed (both halves stand out along +Z, page to page),
 * k = 1 — open flat (a slight V towards the reader).
 */

import * as THREE from 'three';

export const COVERS = [0x8e2b2b, 0x2b4f8e, 0x2f6b3a, 0x6b3f8e, 0x8e6a2b];
export const BOOK = { W: 0.42, H: 0.6, T: 0.06, B: 0.025 }; // half width, height, pages' thickness, board

/** The swift book-bird's book («Fly»): sky blue with silver trim. */
export const SWIFT_COVER = 0x7fc8f0, SWIFT_TRIM = 0xd8e4ec;
/** The book of protection («Защита дома», HouseWards.js): deep blue with silver trim and a silver shield. */
export const WARD_COVER = 0x1b2f7a, WARD_TRIM = 0xd8e4ec;

export function makeSpellBookModel(color = COVERS[0], trimColor = 0xd4af37) {
    const { W, H, T, B } = BOOK;
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color });
    const gold = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.35, metalness: 0.8 });
    const block = new THREE.MeshLambertMaterial({ color: 0xe9dcb8 });
    const paper = new THREE.MeshLambertMaterial({ color: 0xf3ead2 });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(2 * (T + B), H, B), cover);
    spine.position.z = -B / 2;
    g.add(spine);
    const half = (sx) => {
        const pv = new THREE.Group();
        pv.position.x = sx * T;
        const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, B), cover);
        board.position.set(sx * W / 2, 0, -B / 2);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, H * 0.9, B * 1.2), gold);
        trim.position.set(sx * (W - 0.04), 0, -B / 2);
        const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, H - 0.03, T), block);
        pages.position.set(sx * (W / 2 - 0.01), 0, T / 2);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, H - 0.04), paper);
        face.position.set(sx * (W / 2 - 0.005), 0, T + 0.002);
        pv.add(board, trim, pages, face);
        g.add(pv);
        return { pv, face };
    };
    const L = half(-1), R = half(1);
    // the fold of the pages down into the spine: a V from the inner edge of one page to the other
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    gg.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
    const gutter = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ color: 0xe2d6b4, side: THREE.DoubleSide }));
    gutter.frustumCulled = false;
    gutter.visible = false;
    g.add(gutter);
    g.userData.book = { L: L.pv, R: R.pv, faceL: L.face, faceR: R.face, gutter, paper, open: 0 };
    setBookOpen(g, 0);
    return g;
}

export function setBookOpen(model, k) {
    k = Math.max(0, Math.min(1, k));
    setBookAngle(model, k * (Math.PI - 0.2)); // closed → open (a slight V)
}

/** Open the book to the angle φ between its halves (0 closed … π flat). */
export function setBookAngle(model, phi) {
    const b = model.userData.book;
    if (!b) return;
    phi = Math.max(0, Math.min(Math.PI, phi));
    b.phi = phi;
    b.open = phi / (Math.PI - 0.2);
    const a = Math.PI / 2 - phi / 2; // each half's turn from lying flat
    b.L.rotation.y = a;
    b.R.rotation.y = -a;
    b.gutter.visible = phi > 0.3;
    if (b.gutter.visible) fitGutter(b.gutter, a);
}

/** The gutter's V between the inner edges of the two page faces (each half turned by ±a about its hinge). */
function fitGutter(gutter, a) {
    const { H, T } = BOOK;
    const p = gutter.geometry.attributes.position;
    const h = (H - 0.04) / 2, x0 = 0.01, z0 = T + 0.002, c = Math.cos(a), s = Math.sin(a);
    // inner edge of a face: hinge (±T, 0) + its turn of (±x0, z0)
    const ex = T + x0 * c - z0 * s, ez = x0 * s + z0 * c;
    const v = [[-ex, ez], [0, 0.004], [ex, ez]];
    v.forEach(([x, z], i) => { p.setXYZ(i * 2, x, -h, z); p.setXYZ(i * 2 + 1, x, h, z); });
    p.needsUpdate = true;
    gutter.geometry.computeVertexNormals();
    gutter.geometry.computeBoundingSphere();
}

/**
 * Where a page's hinge is for a page lying on the right half (u = 0) … on the left
 * one (u = 1), in the book's frame: the inner edge of the page it lies on (so it
 * lies exactly on the pages, never in them).
 */
export function pageHinge(phi, u, out) {
    const { T } = BOOK;
    const a = Math.PI / 2 - phi / 2;
    const h = T + 0.004;
    const rx = T - Math.sin(a) * h, rz = Math.cos(a) * h;
    return out.set(rx + (-rx - rx) * u, 0, rz);
}

const STRIPS = 6;

/** One page across its strips: u from `u0` to `u1` along X (for the back: mirrored). */
function stripGeometry(w, h, u0, u1) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) < 0.5 ? u0 : u1);
    uv.needsUpdate = true;
    return g;
}

/**
 * A page that turns: soft (six strips that can bend), hinged at the spine.
 * Its front shows `front` (the right page it was), its back `back` (the left page
 * it becomes). setPose(beta, lag): its angle round the spine and how far its
 * edge lags behind.
 */
export function makePageSheet(front, back) {
    const { W, H } = BOOK;
    const pw = W - 0.03, ph = H - 0.04, sw = pw / STRIPS;
    const matF = new THREE.MeshBasicMaterial({ map: front, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const matB = new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const root = new THREE.Group();
    const joints = [];
    let parent = root;
    for (let i = 0; i < STRIPS; i++) {
        const j = new THREE.Group();
        j.position.x = i === 0 ? 0.01 : sw;
        const u0 = i / STRIPS, u1 = (i + 1) / STRIPS;
        const f = new THREE.Mesh(stripGeometry(sw * 1.002, ph, u0, u1), matF);
        const b = new THREE.Mesh(stripGeometry(sw * 1.002, ph, 1 - u0, 1 - u1), matB);
        f.position.x = b.position.x = sw / 2;
        j.add(f, b);
        parent.add(j);
        joints.push(j);
        parent = j;
    }
    root.userData.sheet = { joints, matF, matB };
    return root;
}

/** The page's angle round the spine (β: 0 along +X … π along −X) and the bend of its far part. */
export function setPageSheet(sheet, beta, lag) {
    const { joints } = sheet.userData.sheet;
    sheet.rotation.y = -beta;
    // the bend grows towards the free edge (the first strip stays on the spine)
    for (let i = 1; i < joints.length; i++) joints[i].rotation.y = (lag * 2 * i) / (joints.length * (joints.length - 1));
}

export function disposePageSheet(sheet) {
    const s = sheet.userData.sheet;
    sheet.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    s.matF.dispose(); s.matB.dispose();
}
