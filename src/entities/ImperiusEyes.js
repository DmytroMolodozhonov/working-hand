/**
 * ImperiusEyes.js — the white burning eyes of a hero whose mind is in another body («Империус» — ImperiusControl.js).
 *
 * On the face's own eyes (Appearance: the 16-px face on the 1.2 m head — the eyes at px 3…5 / 10…12, rows 6…8:
 * ±0.26 m from the middle, 0.08 m over it): a white glowing iris over each eye, a brighter pupil-less core, and a soft
 * halo round both — the light seems to come from inside the head. No light source (the shaders stay as they are):
 * unlit white and an additive halo; every piece shared (geometry, materials, the halo's texture made once), so a
 * whole crowd of entranced heroes costs nothing new. The halo breathes slowly (`pulse`, one shared material).
 */

import * as THREE from 'three';

let _parts = null;

function parts() {
    if (_parts) return _parts;
    let map = null;
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(235,245,255,0.75)');
        gr.addColorStop(0.6, 'rgba(190,215,255,0.22)');
        gr.addColorStop(1, 'rgba(160,200,255,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 64, 64);
        map = new THREE.CanvasTexture(c);
    }
    _parts = {
        iris: new THREE.BoxGeometry(0.26, 0.17, 0.03), // (over the painted eye: a little wider, its white)
        core: new THREE.BoxGeometry(0.13, 0.08, 0.02),
        halo: new THREE.PlaneGeometry(1, 1),
        irisMat: new THREE.MeshBasicMaterial({ color: 0xeaf4ff }),
        coreMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        haloMat: new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
    for (const k of ['iris', 'core', 'halo']) _parts[k].userData.shared = true;
    return _parts;
}

/** The eyes on a character's head (made once, then only shown / hidden). */
export function setEyes(ch, on) {
    if (!ch?.head) return;
    if (!on && !ch._impEyes) return;
    if (!ch._impEyes) {
        const P = parts(), g = new THREE.Group();
        g.name = 'imperius-eyes';
        for (const s of [-1, 1]) {
            const iris = new THREE.Mesh(P.iris, P.irisMat);
            iris.position.set(0.26 * s, 0.08, -0.615);
            const core = new THREE.Mesh(P.core, P.coreMat);
            core.position.set(0.26 * s, 0.085, -0.632);
            const halo = new THREE.Mesh(P.halo, P.haloMat);
            halo.position.set(0.26 * s, 0.08, -0.66);
            halo.scale.set(0.62, 0.48, 1);
            halo.renderOrder = 2;
            g.add(iris, core, halo);
        }
        const wide = new THREE.Mesh(P.halo, P.haloMat); // (the two lights melt into one glow over the face)
        wide.position.set(0, 0.08, -0.7);
        wide.scale.set(1.25, 0.6, 1);
        wide.renderOrder = 2;
        g.add(wide);
        g.traverse((o) => { o.castShadow = false; o.layers.mask = ch.head.layers.mask; });
        ch.head.add(g);
        ch._impEyes = g;
    }
    ch._impEyes.visible = !!on;
}

/** The halo breathes (seconds of the game's clock): one shared material for every entranced head. */
export function pulse(t) {
    if (!_parts) return;
    _parts.haloMat.opacity = 0.55 + 0.25 * Math.sin(t * 2.4) + 0.08 * Math.sin(t * 7.1);
}

/** (Game.prewarm) the materials, compiled at the loading screen. */
export function sample() {
    const P = parts();
    return [new THREE.Mesh(P.iris, P.irisMat), new THREE.Mesh(P.halo, P.haloMat)];
}
