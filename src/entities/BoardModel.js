/**
 * BoardModel.js — a wooden surfboard: a pointed nose, the widest part a little
 * behind the middle, a squash tail, rocker (the nose and tail curve up), a darker
 * stringer down the middle and three fins under the tail.
 * Local frame: +X right, +Y the deck's normal, −Z the nose (as the hero faces).
 */

import * as THREE from 'three';
import { SURF } from '../game/BoardPhysics.js';
import { halfWidth, RAIL } from '../game/BoardHold.js';

/** Deck colours by tree kind (oak, birch, spruce, cherry, dark oak) — the same woods as the doors. */
export const BOARD_WOODS = [0x9b6a3a, 0xe2d8bd, 0x6a4526, 0x9a4a40, 0x4a3020];

const _geo = new Map();
function hullGeometry() {
    if (_geo.has('hull')) return _geo.get('hull');
    const { L, T, ROCKER } = SURF;
    const shape = new THREE.Shape();
    const N = 24;
    shape.moveTo(0, -L / 2);
    for (let i = 1; i <= N; i++) { const z = -L / 2 + L * i / N; shape.lineTo(halfWidth(z), z); }
    for (let i = N; i >= 0; i--) { const z = -L / 2 + L * i / N; shape.lineTo(-halfWidth(z), z); }
    const g = new THREE.ExtrudeGeometry(shape, { depth: T - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
    // shape (x, y=z) extruded along +z → board (x, y up, z)
    g.rotateX(Math.PI / 2);
    g.translate(0, T / 2 - 0.04, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        pos.setY(i, pos.getY(i) - T / 2 + ROCKER * (2 * z / L) * (2 * z / L));
    }
    g.computeVertexNormals();
    _geo.set('hull', g);
    return g;
}

export function boardModel(wood = 0) {
    const color = BOARD_WOODS[Math.max(0, Math.min(4, wood | 0))];
    const g = new THREE.Group();
    const deck = new THREE.Mesh(hullGeometry(), new THREE.MeshLambertMaterial({ color }));
    deck.castShadow = true;
    g.add(deck);
    const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.6) });
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, SURF.L * 0.92), dark);
    stringer.position.y = SURF.T / 2 + 0.005;
    g.add(stringer);
    for (const [x, s] of [[0, 1], [-0.32, 0.8], [0.32, 0.8]]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22 * s, 0.26 * s), dark);
        fin.position.set(x, -SURF.T / 2 - 0.1 * s, SURF.L / 2 - 0.4);
        g.add(fin);
    }
    g.userData = { dims: { L: SURF.L, W: SURF.W, T: SURF.T }, rail: RAIL, board: true };
    return g;
}

export function disposeBoard(g) {
    g.traverse((o) => { if (o.isMesh) { if (o.geometry !== _geo.get('hull')) o.geometry.dispose(); o.material.dispose(); } });
}
