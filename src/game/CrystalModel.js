/**
 * CrystalModel.js — a mana crystal as real gems grow: a hexagonal prism with a
 * pointed six-sided tip, translucent glowing blue, with a brighter core inside.
 * Shared materials (never disposed with one model).
 */

import * as THREE from 'three';

let MATS = null;
function mats() {
    if (MATS) return MATS;
    const shell = new THREE.MeshPhongMaterial({
        color: 0x5cb8ff, emissive: 0x1f63e0, emissiveIntensity: 0.9, specular: 0xffffff, shininess: 140,
        transparent: true, opacity: 0.72, flatShading: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const core = new THREE.MeshBasicMaterial({ color: 0xa8e4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    shell.userData.shared = true;
    core.userData.shared = true;
    MATS = { shell, core };
    return MATS;
}

let GEO = null;
/**
 * One crystal's shape for every crystal: 1 tall, 1 across, standing on y = 0 along +Y — each crystal
 * is this one shape scaled (r, h, r). (Each size its own shape piled up a new geometry for every
 * crystal of every cave flown over — thousands in a long game.)
 */
export function crystalGeometry() {
    if (GEO) return GEO;
    // a lathe with 6 sides = a hexagonal prism: a narrower foot, straight faces, a pointed tip
    const pts = [
        new THREE.Vector2(0, -0.02),
        new THREE.Vector2(0.82, 0),
        new THREE.Vector2(1, 0.12),
        new THREE.Vector2(1, 0.72),
        new THREE.Vector2(0, 1),
    ];
    GEO = new THREE.LatheGeometry(pts, 6);
    GEO.userData.shared = true;
    return GEO;
}

/** A single crystal mesh group (h, r in metres). */
export function crystalMesh(h = 0.5, r = 0.1) {
    const M = mats();
    const g = new THREE.Group();
    const shell = new THREE.Mesh(crystalGeometry(), M.shell);
    shell.scale.set(r, h, r);
    const core = new THREE.Mesh(crystalGeometry(), M.core);
    core.scale.set(r * 0.45, h * 0.8, r * 0.45);
    core.position.y = h * 0.04;
    shell.renderOrder = 3;
    core.renderOrder = 3;
    g.add(core, shell);
    g.userData.crystal = { h, r };
    return g;
}

/** The thing in a hand / on a pedestal / in the air: one crystal (centred on its middle). */
export function crystalItemModel() {
    const g = new THREE.Group();
    const c = crystalMesh(0.32, 0.065);
    c.position.y = -0.16;
    g.add(c);
    return g;
}

/** (disposeModel) keep the shared geometries too. */
export function isSharedGeometry(geo) {
    return !!geo?.userData?.shared;
}
