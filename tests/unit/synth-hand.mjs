import * as THREE from 'three';

export const ASPECT = 16 / 9;

/**
 * A synthetic hand (as the camera network gives it): built in the hand's own frame
 * (x: index → little finger, y: wrist → fingers, z = x × y), turned by `R` into the
 * hero's space and put into the picture. `bends`: finger → [knuckle, middle, end] rad.
 */
export function synthHand(R, { side = 'right', at = [0.5, 0.6], size = 0.12, bends = {}, spread = {} } = {}) {
    const sx = side === 'right' ? 1 : -1; // (a left hand is the mirror image)
    const knuckles = { thumb: [-0.32, 0.25], index: [-0.2, 0.9], middle: [0, 0.95], ring: [0.18, 0.9], pinky: [0.33, 0.8] };
    const lens = { thumb: [0.35, 0.3, 0.25], index: [0.4, 0.25, 0.2], middle: [0.45, 0.28, 0.2], ring: [0.42, 0.26, 0.2], pinky: [0.32, 0.2, 0.17] };
    const local = [new THREE.Vector3(0, 0, 0)];
    for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
        const [kx, ky] = knuckles[name];
        const base = new THREE.Vector3(kx, ky, 0);
        local.push(base.clone());
        // the finger goes on from its knuckle, turned aside by its spread, bent towards the palm (−z for a right hand)
        let dir = name === 'thumb' ? new THREE.Vector3(-0.6, 0.8, 0).normalize() : new THREE.Vector3(0, 1, 0);
        dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -(spread[name] || 0)); // (+ towards the little finger: −x turn... z axis)
        const b = bends[name] || [0, 0, 0];
        const p = base.clone();
        // bend axis: across the finger in the palm's plane (bending moves it towards −z = the palm)
        const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), dir).normalize();
        let d = dir.clone();
        for (let k = 0; k < 3; k++) {
            d = d.clone().applyAxisAngle(axis, b[k]);
            p.addScaledVector(d, lens[name][k]);
            local.push(p.clone());
        }
    }
    const pts = local.map((v) => new THREE.Vector3(v.x * sx, v.y, v.z).multiplyScalar(size).applyMatrix4(R));
    // hero space → picture: (−x·aspect, −y, z·aspect)
    return pts.map((v) => ({ x: at[0] - v.x / ASPECT, y: at[1] - v.y, z: v.z / ASPECT }));
}
