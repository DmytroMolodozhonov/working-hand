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

export function makeSpellBookModel(color = COVERS[0]) {
    const { W, H, T, B } = BOOK;
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.8 });
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
    // the fold of the pages over the spine (seen only when open)
    const gutter = new THREE.Mesh(new THREE.PlaneGeometry(2 * T + 0.03, H - 0.04), new THREE.MeshLambertMaterial({ color: 0xe2d6b4 }));
    gutter.position.z = T - 0.004;
    gutter.visible = false;
    g.add(gutter);
    g.userData.book = { L: L.pv, R: R.pv, faceL: L.face, faceR: R.face, gutter, paper, open: 0 };
    setBookOpen(g, 0);
    return g;
}

export function setBookOpen(model, k) {
    const b = model.userData.book;
    if (!b) return;
    k = Math.max(0, Math.min(1, k));
    b.open = k;
    const a = Math.PI / 2 + (0.1 - Math.PI / 2) * k; // 90° (closed) → 0.1 rad (open, a slight V)
    b.L.rotation.y = a;
    b.R.rotation.y = -a;
    b.gutter.visible = k > 0.85;
}
