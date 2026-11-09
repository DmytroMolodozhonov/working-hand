/** Shared polar mesh: the shield reverses its bow, flies out and closes around the bomb on the GPU. */
import * as THREE from 'three';
import { CARDILON } from '../game/CardilonRules.js';
const geo = new THREE.PlaneGeometry(1, 1, 32, 12);
const ball = new THREE.SphereGeometry(1, 16, 12);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const shader = {
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { phase: { value: 0 }, fade: { value: 1 } },
    vertexShader: `uniform float phase; varying vec2 vUv;
    void main(){vUv=uv; float close=smoothstep(.2,.72,phase); float flip=1.-2.*smoothstep(0.,.22,phase);
      float theta=uv.y*mix(.62,3.14159265,close); float phi=uv.x*6.2831853; float r=mix(1./sin(.62),1.16,close);
      float bow=r*(cos(theta)-cos(.62)); float z=mix(flip*bow,-r*cos(theta),close);
      vec3 p=vec3(r*sin(theta)*cos(phi),r*sin(theta)*sin(phi),z);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform float phase; uniform float fade; varying vec2 vUv;
    void main(){float seam=pow(abs(cos(vUv.x*6.2831853*12.)),24.); float bands=pow(abs(cos(vUv.y*3.14159265*10.)),28.);
      float rim=smoothstep(.96,1.,vUv.y)*(1.-smoothstep(.6,.75,phase));
      float pulse=.5+.5*sin(vUv.y*35.-phase*22.); float a=(.12+.35*max(seam,bands)+rim*.6+pulse*.05)*fade;
      gl_FragColor=vec4(mix(vec3(.14,.48,1.),vec3(.7,.94,1.),max(rim,seam*.7)),a); }`,
};
const _z = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3(), _inverse = new THREE.Quaternion();
export class CardilonLook {
    constructor(game) { this.game = game; this.pool = []; }
    _make() {
        const root = new THREE.Group(), mat = new THREE.ShaderMaterial({ ...shader, uniforms: THREE.UniformsUtils.clone(shader.uniforms) });
        const shell = new THREE.Mesh(geo, mat), core = new THREE.Mesh(ball, coreMat);
        shell.frustumCulled = false; root.add(shell, core); root.visible = false;
        this.game.scene.add(root);
        return { root, shell, core, mat, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0 };
    }
    sample() { const e = this.pool[0] || (this.pool[0] = this._make()); const sample = e.root.clone(); sample.visible = true; return sample; }
    start(from, to, power = 1) {
        let e = this.pool.find((p) => !p.active);
        if (!e && this.pool.length < 8) { e = this._make(); this.pool.push(e); }
        if (!e) e = this.pool.reduce((a, b) => a.t > b.t ? a : b);
        e.from.copy(from); e.to.copy(to); e.t = 0; e.active = true; e.flashed = false;
        e.root.visible = true; e.root.scale.setScalar(power > 1 ? 1.65 : 1);
        _dir.subVectors(to, from).normalize(); if (_dir.lengthSq() < 0.1) _dir.set(0, 0, 1);
        e.root.quaternion.setFromUnitVectors(_z, _dir); this._draw(e);
    }
    _draw(e) {
        const phase = Math.min(1, e.t / 0.85), fly = Math.min(1, e.t / 0.6);
        e.root.position.lerpVectors(e.from, e.to, fly * fly * (3 - 2 * fly));
        e.mat.uniforms.phase.value = phase;
        e.mat.uniforms.fade.value = Math.min(1, (CARDILON.FX_TIME - e.t) / 0.35);
        e.core.visible = true;
        // The neutralized charge remains visible at the catch point while its shield flies out.
        e.core.position.copy(e.to).sub(e.root.position).applyQuaternion(_inverse.copy(e.root.quaternion).invert()).divideScalar(e.root.scale.x);
        const shrink = Math.max(0.02, 1 - Math.max(0, e.t - 0.9) / 0.4);
        e.core.scale.setScalar((0.48 + 0.05 * Math.sin(e.t * 55)) * shrink);
        e.shell.scale.setScalar(e.t > 0.9 ? shrink : 1);
        if (!e.flashed && e.t >= 0.72) {
            e.flashed = true;
            this.game.fx?.lightFlash?.(e.to, 0x8fd8ff, 1.5, 0.18, 7);
            for (let i = 0; i < 18; i++) this.game.fx?.glow?.spawn(e.to.x, e.to.y, e.to.z,
                (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6,
                i % 2 ? 0xffbd55 : 0xe1faff, 0.12, 0.23, { shrink: 2 });
        }
    }
    update(dt) {
        for (const e of this.pool) if (e.active) {
            e.t += dt;
            if (e.t >= CARDILON.FX_TIME) { e.active = false; e.root.visible = false; }
            else this._draw(e);
        }
    }
    dispose() { for (const e of this.pool) { this.game.scene.remove(e.root); e.mat.dispose(); } this.pool.length = 0; }
}
