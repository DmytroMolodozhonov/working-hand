/**
 * DarkLordFx.js — how the turning into a true dark mage looks (DarkLord.js, DarkLordLife.js). Cheap by the project's rules:
 *  - THREE meshes made ONCE (hidden when the rite is not on), their shaders compiled while loading (`darkLordSamples`, Game.prewarm):
 *      the BALL of darkness (a sphere, double-sided: from inside the hero's own eyes see only the dark), the FUNNEL (an open spiral of streaks
 *      round it, narrow at the feet, wide above) and the rune CIRCLE on the ground under him (the rite's ring, turning);
 *  - the dust, embers and violet motes — the shared spark pool (`fx.spark`), a few per frame; the pulse of light — the shared flash light
 *    (`fx.lightFlash`): no PointLight of its own;
 *  - nothing is made in the frame; each rite (mine, and the others' from the network) has its own three meshes and its own copies of the
 *    materials (the shader programs and the shapes are shared); they are made when the rite begins and freed when it ends.
 */

import * as THREE from 'three';
import { LORD, darknessAt, phaseAt } from '../game/DarkLord.js';

const VERT = `
varying vec3 vP; varying vec3 vN; varying vec2 vUv;
void main() { vP = position; vN = normalize(normalMatrix * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// the ball: ink-black violet, spiral bands of a deeper black wound round the axis, a thin violet rim where it meets the light
const BALL_FRAG = `
varying vec3 vP; varying vec3 vN; varying vec2 vUv;
uniform float uTime; uniform float uPower;
void main() {
    float a = atan(vP.z, vP.x);
    float s = a * 2.0 + vP.y * 5.0 - uTime * 3.2 + sin(vP.y * 3.0 + uTime) * 0.8;
    float bands = 0.5 + 0.5 * sin(s * 1.5);
    float streak = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(a * 7.0 - vP.y * 9.0 + uTime * 4.0));
    float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 2.0);
    vec3 col = mix(vec3(0.015, 0.0, 0.03), vec3(0.09, 0.0, 0.16), bands * 0.6) + vec3(0.32, 0.08, 0.6) * (rim * 0.5 + streak * 0.22);
    float alpha = clamp(uPower * (0.62 + 0.3 * bands + 0.2 * rim), 0.0, 0.94);
    gl_FragColor = vec4(col, alpha);
}`;

// the funnel: streaks of dark winding up and out, bright violet threads in them
const FUNNEL_FRAG = `
varying vec3 vP; varying vec3 vN; varying vec2 vUv;
uniform float uTime; uniform float uPower;
void main() {
    float a = atan(vP.z, vP.x);
    float w = a * 3.0 + vUv.y * 9.0 - uTime * 2.6;
    float dark = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(w * 2.0 + sin(vUv.y * 11.0 + uTime) * 1.2));
    float thread = smoothstep(0.93, 1.0, 0.5 + 0.5 * sin(w * 5.0));
    float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    vec3 col = mix(vec3(0.02, 0.0, 0.04), vec3(0.62, 0.22, 1.0), thread);
    gl_FragColor = vec4(col, (dark * 0.55 + thread * 0.8) * fade * uPower);
}`;

// the ring on the ground: two circles, a belt of runes between them turning, eight spokes
const CIRCLE_FRAG = `
varying vec3 vP; varying vec3 vN; varying vec2 vUv;
uniform float uTime; uniform float uPower;
void main() {
    float r = length(vP.xy);                     // the ring lies in the xy plane of its geometry
    float a = atan(vP.y, vP.x);
    float c1 = smoothstep(0.03, 0.0, abs(r - 3.4)), c2 = smoothstep(0.025, 0.0, abs(r - 2.5));
    float belt = step(2.5, r) * step(r, 3.4);
    float glyph = belt * step(0.55, 0.5 + 0.5 * sin(a * 24.0 + uTime * 0.8)) * step(0.4, 0.5 + 0.5 * sin(r * 40.0));
    float spoke = step(r, 2.5) * smoothstep(0.03, 0.0, abs(sin(a * 4.0 - uTime * 0.5))) * 0.6;
    float glow = smoothstep(3.6, 0.0, r) * 0.25;
    float v = c1 + c2 + glyph * 0.7 + spoke + glow;
    gl_FragColor = vec4(vec3(0.5, 0.15, 0.95) * (0.5 + v), clamp(v, 0.0, 1.0) * uPower);
}`;

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    const mk = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPower: { value: 0 } }, vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...extra });
    SHARED = {
        ballGeo: new THREE.SphereGeometry(1, 32, 24),
        funnelGeo: new THREE.CylinderGeometry(1.9, 0.5, 1, 36, 6, true),
        circleGeo: new THREE.RingGeometry(0.2, 3.7, 48, 1),
        ballMat: mk(BALL_FRAG),
        funnelMat: mk(FUNNEL_FRAG),
        circleMat: mk(CIRCLE_FRAG, { blending: THREE.AdditiveBlending }),
    };
    for (const g of [SHARED.ballGeo, SHARED.funnelGeo, SHARED.circleGeo]) g.userData = { shared: true };
    return SHARED;
}

/** One small mesh per material (Game.prewarm: the shaders compile at loading, never in a frame). */
export function darkLordSamples() {
    const S = shared();
    return [new THREE.Mesh(S.ballGeo, S.ballMat), new THREE.Mesh(S.funnelGeo, S.funnelMat), new THREE.Mesh(S.circleGeo, S.circleMat)];
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class DarkLordFx {
    constructor(game) {
        this.game = game;
        this.group = null;
        this._flashT = 0;
        this._acc = 0;
    }

    _make() {
        if (this.group) return;
        const S = shared(), g = this.game;
        this.group = new THREE.Group();
        // (own copies of the materials: the same shader program, but this rite's own time and power — two rites at once do not fight)
        this.mats = { ball: S.ballMat.clone(), funnel: S.funnelMat.clone(), circle: S.circleMat.clone() };
        for (const m of Object.values(this.mats)) m.uniforms = { uTime: { value: 0 }, uPower: { value: 0 } };
        this.ball = new THREE.Mesh(S.ballGeo, this.mats.ball);
        this.funnel = new THREE.Mesh(S.funnelGeo, this.mats.funnel);
        this.circle = new THREE.Mesh(S.circleGeo, this.mats.circle);
        this.circle.rotation.x = -Math.PI / 2;
        this.ball.renderOrder = 6; this.funnel.renderOrder = 5; this.circle.renderOrder = 3;
        this.ball.frustumCulled = this.funnel.frustumCulled = this.circle.frustumCulled = false;
        this.group.add(this.circle, this.funnel, this.ball);
        this.group.visible = false;
        g.scene?.add(this.group);
    }

    /**
     * One frame of a rite. `center` — the body's middle (the ball's middle), `ground` — the y under the feet at the rite's start,
     * `t` — seconds since it began.
     */
    update(dt, t, center, ground) {
        this._make();
        const M = this.mats, p = darknessAt(t), ph = phaseAt(t);
        M.ball.uniforms.uTime.value = M.funnel.uniforms.uTime.value = M.circle.uniforms.uTime.value = t;
        M.ball.uniforms.uPower.value = p;
        M.funnel.uniforms.uPower.value = p;
        M.circle.uniforms.uPower.value = Math.min(1, p * 1.4);
        this.group.visible = true;
        const R = 0.6 + 4.6 * p * (1 + 0.04 * Math.sin(t * 7));
        this.ball.position.copy(center);
        this.ball.scale.setScalar(R);
        this.ball.rotation.y = t * 0.6;
        const h = Math.max(0.5, center.y - ground + 3);
        this.funnel.position.set(center.x, ground + h / 2 - 1.5, center.z);
        this.funnel.scale.set(1 + p * 0.6, h + 2, 1 + p * 0.6);
        this.funnel.rotation.y = -t * 0.9;
        this.circle.position.set(center.x, ground + 0.1, center.z);
        this.circle.rotation.z = t * 0.5;
        this._particles(dt, t, center, ground, p, ph.phase);
    }

    _particles(dt, t, c, ground, p, phase) {
        const fx = this.game.fx;
        if (!fx) return;
        this._acc += dt * (30 + 110 * p);
        let n = Math.min(14, this._acc | 0);
        this._acc -= n;
        while (n-- > 0) {
            const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 4.2 * (0.4 + p), y = ground + 0.2 + Math.random() * (c.y - ground + 3.5);
            _v.set(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
            // (they wind round the axis and are pulled in and up)
            _w.set(-Math.sin(a) * (2 + 3 * p) - Math.cos(a) * 1.4, 1.0 + Math.random() * 2.2, Math.cos(a) * (2 + 3 * p) - Math.sin(a) * 1.4);
            const k = Math.random();
            fx.spark(_v, k < 0.55 ? 0x0a0612 : k < 0.85 ? 0x3a1668 : 0x9a5cff, k < 0.55 ? 0.5 + Math.random() * 0.5 : 0.09, _w, k < 0.55 ? 1.5 : 1.1);
        }
        this._flashT -= dt;
        if (this._flashT <= 0 && p > 0.3) {
            this._flashT = phase === 'hold' ? 0.25 : 0.5;
            fx.lightFlash?.(_v.set(c.x, c.y + 1, c.z), 0x6a1ad0, 1.6 + 2.2 * p, 0.45, 40);
        }
    }

    /** The rite is over: everything is hidden again (nothing freed — the shapes are shared). */
    stop() {
        if (this.group) this.group.visible = false;
        this._acc = 0;
    }

    /** The burst when the clothes change: the hero is wrapped in dark for a moment (sparks all round). */
    swapBurst(c) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), sp = 5 + Math.random() * 9;
            _w.set(Math.cos(a) * s * sp, u * sp, Math.sin(a) * s * sp);
            fx.spark(_v.set(c.x, c.y, c.z), i % 3 ? 0x7a2be0 : 0x07030c, i % 3 ? 0.11 : 0.6, _w, 1.1);
        }
        fx.lightFlash?.(_v.set(c.x, c.y + 1, c.z), 0x9a5cff, 5, 0.5, 60);
    }

    dispose() {
        if (this.group) { this.game.scene?.remove(this.group); for (const m of Object.values(this.mats)) m.dispose(); this.group = null; }
    }
}

export { LORD };
