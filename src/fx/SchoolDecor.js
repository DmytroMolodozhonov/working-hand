/**
 * SchoolDecor.js — the school's own magic light (the author 07.11: «свечи убрать — слишком похоже на ту книгу»; «интерьер не чувствуется,
 * что это магия»): WISPS — soft drifting lights of the school's colours (moon-blue, violet, warm gold, sea-green). Each has a bright core
 * and a wide halo, breathes slowly, wanders on its own slow figure under the hall's roof and in every classroom, never two alike.
 * Anchors: the hall — plan.floatCandles (rows under the roof); the rooms — a few each, from plan.rooms.
 * Cheap: two InstancedMeshes (cores, halos) — two draws for the whole castle, one shared shader (made at loading: Game.prewarm via
 * schoolDecorSamples), matrices written every other frame only while the hero is within NEAR; no light sources (one shared light rule).
 */
import * as THREE from 'three';

const NEAR = 160;
const HUES = [0x9fc4ff, 0xc9a6ff, 0xffd79a, 0x8fe8d0, 0xb8d8ff];

let _core = null, _halo = null, _haloMat = null, _coreMat = null;
function geos() {
    if (!_core) { _core = new THREE.IcosahedronGeometry(0.16, 1); _halo = new THREE.PlaneGeometry(1, 1); }
    return { core: _core, halo: _halo };
}
function mats() {
    if (_coreMat) return { core: _coreMat, halo: _haloMat };
    _coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    _coreMat.name = 'schoolWispCore';
    _haloMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */`
            varying vec2 vUv; varying vec3 vCol;
            void main() {
                vUv = uv; vCol = instanceColor;
                vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); // (a billboard: the halo always faces the eye)
                float s = length(instanceMatrix[0].xyz);
                c.xy += position.xy * s;
                gl_Position = projectionMatrix * c;
            }`,
        fragmentShader: /* glsl */`
            varying vec2 vUv; varying vec3 vCol;
            void main() {
                float r = length(vUv - 0.5) * 2.0;
                float a = exp(-r * r * 4.0) * 0.55 + exp(-r * r * 26.0) * 0.6;
                gl_FragColor = vec4(vCol * a, 1.0);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    _haloMat.name = 'schoolWispHalo';
    return { core: _coreMat, halo: _haloMat };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class SchoolDecor {
    constructor(game, plan) {
        this.game = game; this.plan = plan;
        const F = plan.F;
        // the anchors: the hall's rows (fewer than the old candles — every other), three to five in each room at head height and above
        const a = (plan.floatCandles || []).filter((_, i) => i % 2 === 0).map((c) => ({ x: c.x, y: c.y - 2, z: c.z, r: 1.6 }));
        for (const R of Object.values(plan.rooms || {})) {
            const w = R.x1 - R.x0, d = R.z1 - R.z0, n = Math.max(3, Math.min(6, Math.round(w * d / 90)));
            for (let i = 0; i < n; i++) a.push({ x: R.x0 + w * (0.2 + 0.6 * ((i * 0.618) % 1)), y: F + 5.2 + (i % 3) * 0.8, z: R.z0 + d * (0.15 + 0.7 * ((i * 0.382 + 0.2) % 1)), r: 1.1 });
        }
        this.anchors = a;
        this.wisps = a.map((p, i) => ({ ...p, ph: i * 2.399, sp: 0.18 + (i % 5) * 0.035, hue: HUES[i % HUES.length], k: 0.85 + ((i * 7) % 4) * 0.08 }));
        const G = geos(), M = mats(), n = Math.max(1, a.length);
        this.cores = new THREE.InstancedMesh(G.core, M.core, n);
        this.halos = new THREE.InstancedMesh(G.halo, M.halo, n);
        for (const m of [this.cores, this.halos]) { m.frustumCulled = false; m.visible = false; m.castShadow = false; m.count = a.length; }
        this.cores.name = 'schoolWisps'; this.halos.name = 'schoolWispHalos'; this.halos.renderOrder = 4;
        this.wisps.forEach((w, i) => { _c.setHex(w.hue); this.cores.setColorAt(i, _c.clone().lerp(new THREE.Color(0xffffff), 0.55)); this.halos.setColorAt(i, _c); });
        this.cores.instanceColor.needsUpdate = true; this.halos.instanceColor.needsUpdate = true;
        this._frame = 0; this.shown = false; this.added = false;
        this._write(0);
    }

    _write(t) {
        for (let i = 0; i < this.wisps.length; i++) {
            const w = this.wisps[i], u = t * w.sp + w.ph;
            // (a slow figure of its own round its anchor; it breathes — the halo swells and fades a little)
            _p.set(w.x + Math.sin(u) * w.r + Math.sin(u * 0.37) * 0.5, w.y + Math.sin(u * 0.71) * 0.45, w.z + Math.cos(u * 0.83) * w.r);
            const b = w.k * (0.9 + 0.12 * Math.sin(t * 1.3 + w.ph * 3));
            this.cores.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(b)));
            this.halos.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(2.6 * b)));
        }
        this.cores.instanceMatrix.needsUpdate = true; this.halos.instanceMatrix.needsUpdate = true;
    }

    update(dt, t) {
        const me = this.game.character?.group?.position, c = this.plan.centre;
        if (!me || !c) return;
        const show = Math.hypot(me.x - c.x, me.z - c.z) < NEAR || !!this.game.cine?.active;
        if (show && !this.added && this.game.scene) { this.game.scene.add(this.cores, this.halos); this.added = true; }
        if (show !== this.shown) { this.shown = show; this.cores.visible = this.halos.visible = show; }
        if (!show) return;
        mats().halo.uniforms.uTime.value = t;
        if ((this._frame++ & 1) === 0) this._write(t);
    }

    dispose() { for (const m of [this.cores, this.halos]) { this.game.scene?.remove(m); m.dispose?.(); } }
}

/** Samples for Game.prewarm: the wisps' two materials. */
export function schoolDecorSamples() {
    const G = geos(), M = mats();
    const a = new THREE.InstancedMesh(G.core, M.core, 1), b = new THREE.InstancedMesh(G.halo, M.halo, 1);
    a.setMatrixAt(0, _m.identity()); b.setMatrixAt(0, _m.identity());
    a.setColorAt(0, _c.set(0xffffff)); b.setColorAt(0, _c);
    return [a, b];
}
