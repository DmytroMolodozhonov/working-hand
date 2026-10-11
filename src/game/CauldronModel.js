/**
 * CauldronModel.js — the big black iron cauldron (and the glass flask) as THREE models.
 *
 * The cauldron: a round-bellied pot wider than tall (PROFILE in Potions.js), a thick rolled
 * rim, two ring handles, three short legs. Its origin is at the feet (the ground), +Y up.
 * Inside: the liquid (a disc at the water's height, coloured by the brew) and a few bubbles.
 * An old one from a cave is rusty and dusty.
 */

import * as THREE from 'three';
import { CAULDRON, PROFILE, innerRadius } from './Potions.js';

let _iron = null, _rust = null, _rustSpot = null;
function ironMat(old) {
    if (!_iron) {
        _iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide });
        _rust = new THREE.MeshStandardMaterial({ color: 0x2f2621, roughness: 0.85, metalness: 0.45, side: THREE.DoubleSide });
        _rustSpot = new THREE.MeshLambertMaterial({ color: 0x7a4426 });
        for (const m of [_iron, _rust, _rustSpot]) m.userData.shared = true;
    }
    return old ? _rust : _iron;
}

/** A new cauldron model: {group, liquid, bubbles}. old: rusty and dusty (a forgotten one from a cave). */
export function makeCauldronModel({ old = false } = {}) {
    const g = new THREE.Group();
    const iron = ironMat(old);
    // the belly: a lathe of the profile (outer wall), open at the top
    const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), iron);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // the inside's floor (the wall's thickness: seen from above)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(innerRadius(CAULDRON.BOTTOM + 0.05), 32), iron);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CAULDRON.BOTTOM;
    g.add(floor);
    // the thick rolled rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CAULDRON.R_RIM, 0.11, 10, 48), iron);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = CAULDRON.H - 0.09;
    rim.castShadow = true;
    g.add(rim);
    // two ring handles on the sides, under the rim
    for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 20), iron);
        h.position.set(s * (CAULDRON.R_RIM + 0.28), CAULDRON.H - 0.42, 0);
        h.rotation.y = Math.PI / 2;
        g.add(h);
        const lug = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), iron);
        lug.position.set(s * (CAULDRON.R_RIM + 0.04), CAULDRON.H - 0.2, 0);
        g.add(lug);
    }
    // three short legs
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.62, 8), iron);
        leg.position.set(Math.cos(a) * 0.95, 0.31, Math.sin(a) * 0.95);
        leg.rotation.z = Math.cos(a) * 0.12;
        leg.rotation.x = -Math.sin(a) * 0.12;
        leg.castShadow = true;
        g.add(leg);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), iron);
        foot.position.set(Math.cos(a) * 1.0, 0.06, Math.sin(a) * 1.0);
        foot.scale.y = 0.5;
        g.add(foot);
    }
    if (old) {
        // rust and dust: flat patches on the belly and the rim
        const rnd = mulberry(7);
        for (let i = 0; i < 14; i++) {
            const a = rnd() * Math.PI * 2, y = 0.8 + rnd() * 1.7;
            const r = PROFILE.reduce((best, [pr, py]) => (Math.abs(py - y) < Math.abs(best[1] - y) ? [pr, py] : best), PROFILE[0])[0];
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rnd() * 0.22, 6, 4), _rustSpot);
            p.scale.set(1, 0.7, 0.18);
            p.position.set(Math.cos(a) * (r + 0.01), y, Math.sin(a) * (r + 0.01));
            p.lookAt(Math.cos(a) * 5, y, Math.sin(a) * 5);
            g.add(p);
        }
    }
    // the liquid: a disc at the water's height (hidden while dry)
    const liqMat = new THREE.MeshStandardMaterial({ color: 0x3a6fa8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0x000000, emissiveIntensity: 1 });
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 40), liqMat);
    liquid.rotation.x = -Math.PI / 2;
    liquid.visible = false;
    liquid.renderOrder = 1;
    g.add(liquid);
    // bubbles rising in the brew
    const bubMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.7, emissive: 0x000000 });
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubMat, 24);
    bubbles.count = 0;
    bubbles.frustumCulled = false;
    g.add(bubbles);
    g.userData.cauldron = true;
    return { group: g, liquid, bubbles };
}

function mulberry(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * A glass flask: a round belly, a neck, a cork. color: the potion inside (null: empty).
 * Model units before ITEM_SCALE (~0.3 m tall).
 */
export function flaskModel(color = null) {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe9f2, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38 });
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), glass);
    g.add(belly);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.1, 10), glass);
    neck.position.y = 0.12;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0x9c6b3e }));
    cork.position.y = 0.185;
    g.add(cork);
    if (color != null) {
        const c = new THREE.Color(color);
        const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.35), roughness: 0.3 }));
        g.add(liquid);
        const top = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), liquid.material);
        top.rotation.x = -Math.PI / 2;
        top.position.y = 0.05;
        g.add(top);
    }
    return g;
}
