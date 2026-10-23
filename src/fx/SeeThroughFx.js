/**
 * SeeThroughFx.js — the picture of «Visible Godi» (the rules: game/VisibleGodi.js).
 *
 * A little cloud in the middle of the screen: blurred and unsharp, clearer in the middle, milky-blue at its rim, its
 * edge slowly breathing, a few sparkles drifting in it. Inside the cloud — what lies BEHIND the wall in front of the
 * hero: the scene is drawn once more from the same eyes with the camera's near plane stood just past the far side
 * of the wall (so the wall itself is not in the picture), into a small picture (a quarter of the screen, 24 times a
 * second — 15 on a weak computer), and the cloud shows it: the less clear the look (VisibleGodi.clearOf), the more it
 * is blurred, the greyer-blue, the lower in contrast and the grainier; below SEE.SHAPES only dim shapes are left (a
 * difference of two blurs), below SEE.WORKED no second picture is drawn at all — only milk. Magic stops the look:
 * milky «nothing», slowly swirling.
 *
 * Cheap on purpose (CLAUDE.md «Производительность»): the shader and its quad are made once (Game.prewarm); the small
 * picture is made when the spell is switched on and freed when it ends; the second scene pass runs only while the
 * look really goes through a wall; nothing else is drawn when the spell is off. No new lights, no new materials of
 * the scene, no shadow pass of its own (the sun's shadow map stays as the main picture left it).
 */
import * as THREE from 'three';
import { SEE, nearOf } from '../game/VisibleGodi.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tBehind;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uTime;
uniform float uRadius;
uniform float uSee;
uniform float uBlock;
uniform float uHaze;
uniform float uClear;
uniform float uShape;
uniform int uTaps;
varying vec2 vUv;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

/** The picture behind, blurred over a disc of 'px' texels (a golden-angle spiral, turned by a per-pixel angle). */
vec3 blurred(vec2 uv, float px, float rot, int n) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 13; i++) {
        if (i >= n) break;
        float fi = float(i);
        float rr = sqrt((fi + 0.5) / float(n));
        float th = fi * 2.39996 + rot;
        acc += texture2D(tBehind, uv + vec2(cos(th), sin(th)) * rr * px * uTexel).rgb;
    }
    return acc / float(n);
}

void main() {
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 p = q / max(uRadius, 1e-3);
    float a = atan(p.y, p.x);
    // the cloud's edge breathes: slow waves and a little noise round it
    float wob = 1.0 + 0.06 * sin(a * 3.0 + uTime * 0.7) + 0.045 * sin(a * 5.0 - uTime * 1.1) + 0.06 * (vnoise(vec2(a * 1.5 + uTime * 0.3, uTime * 0.2)) - 0.5);
    float r = length(p) / wob;
    if (r > 1.3) discard;
    float mask = 1.0 - smoothstep(0.5, 1.0, r);
    float core = 1.0 - smoothstep(0.0, 0.7, r);
    float rim = smoothstep(0.5, 0.98, r) * (1.0 - smoothstep(0.98, 1.2, r));
    vec3 milky = vec3(0.77, 0.86, 0.95);
    float sw = vnoise(p * 2.2 + vec2(uTime * 0.15, -uTime * 0.1)) * 0.6 + vnoise(p * 5.0 - vec2(uTime * 0.2, 0.0)) * 0.4;
    vec3 cloud = milky * (0.8 + 0.32 * sw);

    vec3 seen = cloud;
    if (uSee > 0.01) {
        float rot = hash21(gl_FragCoord.xy) * 6.2831;
        // clearer in the middle, blurrier towards the rim; the less clear the look, the blurrier everywhere
        float px = 0.35 + (1.0 - uClear) * 7.0 + (1.0 - core) * 2.4;
        vec3 col = blurred(vUv, px, rot, uTaps);
        float l = luma(col);
        // the look dims: less contrast, less colour, a blue-grey cast, milk over it, grain
        col = (col - 0.45) * mix(0.35, 1.0, uClear) + 0.45;
        col = mix(vec3(l), col, mix(0.25, 1.0, uClear));
        col *= mix(vec3(0.8, 0.9, 1.04), vec3(1.0), uClear);
        col = mix(col, milky, pow(1.0 - uClear, 1.5) * 0.7);
        col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.15 * (1.0 - uClear);
        if (uShape > 0.01) {
            // almost nothing gets through: only dim shapes — the difference of a small blur and a big one
            float lb = luma(blurred(vUv, 16.0, rot, uTaps));
            float ls = luma(blurred(vUv, 4.0, rot, uTaps));
            vec3 sil = milky * clamp(0.62 + (ls - lb) * 3.4, 0.25, 1.0);
            col = mix(col, sil, uShape);
        }
        seen = col;
    }
    float wSee = uSee / max(uSee + uBlock + uHaze, 1e-3);
    vec3 outc = mix(cloud, seen, wSee);
    float alpha = clamp(mask * (uHaze * 0.26 + uSee * 0.97 + uBlock * 0.9), 0.0, 1.0);
    // the milky-blue rim, shimmering, and a few sparkles drifting in the cloud
    float on = clamp(uSee + uBlock + uHaze, 0.0, 1.0);
    float shimmer = 0.65 + 0.35 * sin(a * 7.0 + uTime * 2.3) * sin(a * 3.0 - uTime * 1.7);
    outc += vec3(0.62, 0.8, 1.0) * rim * 0.42 * shimmer;
    alpha = max(alpha, rim * 0.38 * on);
    vec2 g = q * 46.0 + vec2(0.0, uTime * 0.6);
    vec2 cell = floor(g);
    float h = hash21(cell + floor(uTime * 1.5));
    float spark = step(0.982, h) * pow(max(0.0, 1.0 - length(fract(g) - 0.5) * 2.0), 3.0) * smoothstep(0.1, 0.5, r) * (1.0 - smoothstep(0.9, 1.15, r));
    outc += vec3(0.9, 0.96, 1.0) * spark * 0.9;
    alpha = max(alpha, spark * 0.8 * on);
    gl_FragColor = vec4(outc, alpha);
}
`;

const EASE_OPEN = (u) => { const c = 1.35; const x = Math.min(1, Math.max(0, u)) - 1; return 1 + (c + 1) * x * x * x + c * x * x; }; // easeOutBack: the eye opens with a little overshoot
const _s = new THREE.Vector3();
const _sz = new THREE.Vector2();

export class SeeThroughFx {
    /** @param {object} game  { renderer, scene, camera, quality? } */
    constructor(game) {
        this.game = game;
        this.renderer = game.renderer;
        this.scene = game.scene;
        this.camera = game.camera;
        this.on = false;
        this.open = 0; // the eye's opening 0…1 (the cloud grows while it is switched on, closes when off)
        this.see = 0; this.block = 0; this.haze = 0; this.clear = 1; // smoothed
        this.target = { see: 0, block: 0, haze: 1, clear: 1, shape: 0 };
        this.near = 1;
        this.rt = null; // the small picture: made when switched on, freed when over
        this._behindAt = -1; // when the picture behind was drawn last
        this._clock = 0;
        this._t = 0;
        this.stats = { rtMade: 0, rtFreed: 0, passes: 0, overlays: 0, materials: 1 }; // (tests: nothing is made or freed in a frame)
        this.cam2 = new THREE.PerspectiveCamera(75, 1, 0.5, 1000);
        this.cam2.matrixAutoUpdate = true;
        // the cloud: one big triangle-pair, one shader, made now and never again
        this.mat = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                tBehind: { value: null }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 288) }, uAspect: { value: 16 / 9 }, uTime: { value: 0 },
                uRadius: { value: 0 }, uSee: { value: 0 }, uBlock: { value: 0 }, uHaze: { value: 0 }, uClear: { value: 1 }, uShape: { value: 0 }, uTaps: { value: 13 },
            },
            transparent: true, depthTest: false, depthWrite: false,
        });
        this.mat.userData.keep = true;
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
        this.quad.frustumCulled = false;
        this.quad.geometry.userData.keep = true;
        this.qScene = new THREE.Scene();
        this.qScene.add(this.quad);
        this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    /** Weak computer (the quality manager's low levels): a smaller, slower picture and fewer taps. */
    get low() {
        const q = this.game.quality?.current;
        return !!q && q.pixelRatio <= 0.8 && !this.game.quality?.ultra;
    }

    /** The spell on / off (VisibleGodi.set). */
    setOn(on) {
        if (this.on === on) return;
        this.on = on;
        if (on) this._behindAt = -1;
    }

    /** What the last ray found (VisibleGodi.update, ~10 times a second). */
    setTarget(info) {
        const t = this.target;
        if (!info || info.state === 'open' || info.state === 'far') { t.see = 0; t.block = 0; t.haze = 1; t.shape = 0; t.clear = 1; this.near = 1; return; }
        if (info.state === 'blocked') { t.see = 0; t.block = 1; t.haze = 0; t.shape = 0; t.clear = 0; return; }
        if (info.clear < SEE.WORKED) { t.see = 0; t.block = 0.8; t.haze = 0; t.shape = 0; t.clear = 0; return; } // (too thick: only milk)
        t.see = 1; t.block = 0; t.haze = 0; t.clear = info.clear;
        t.shape = info.clear < SEE.SHAPES ? 1 - (info.clear - SEE.WORKED) / (SEE.SHAPES - SEE.WORKED) : 0;
        this.near = nearOf(info);
    }

    _ensureRT() {
        const r = this.renderer;
        r.getDrawingBufferSize(_sz);
        const k = this.low ? 0.34 : 0.5; // a quarter of the screen (a ninth on a weak computer)
        const w = Math.max(64, Math.round(_sz.x * k)), h = Math.max(36, Math.round(_sz.y * k));
        if (!this.rt) {
            this.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
            this.rt.texture.generateMipmaps = false;
            this.stats.rtMade++;
        } else if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
        this.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
        this.mat.uniforms.uTaps.value = this.low ? 7 : 13;
    }

    _freeRT() {
        if (!this.rt) return;
        this.rt.dispose();
        this.rt = null;
        this.stats.rtFreed++;
    }

    /** The scene once more from the same eyes with the near plane past the wall → the small picture. */
    _drawBehind() {
        const r = this.renderer, cam = this.camera, c2 = this.cam2;
        this._ensureRT();
        cam.updateMatrixWorld();
        cam.matrixWorld.decompose(c2.position, c2.quaternion, _s);
        c2.fov = cam.fov; c2.aspect = cam.aspect; c2.far = cam.far; c2.near = Math.min(this.near, c2.far * 0.5);
        c2.updateProjectionMatrix();
        c2.updateMatrixWorld(true);
        const prevT = r.getRenderTarget(), auto = r.autoClear, sa = r.shadowMap.autoUpdate, sn = r.shadowMap.needsUpdate;
        r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; // (the sun's shadow stays as the main picture made it)
        r.setRenderTarget(this.rt);
        r.autoClear = true;
        r.render(this.scene, c2);
        r.setRenderTarget(prevT);
        r.autoClear = auto;
        r.shadowMap.autoUpdate = sa; r.shadowMap.needsUpdate = sn;
        this.stats.passes++;
    }

    /** After the main picture is on the screen (Game._draw): the second picture when due, then the cloud. */
    render(now = performance.now() / 1000) {
        const dt = this._clock ? Math.min(0.1, Math.max(0, now - this._clock)) : 0;
        this._clock = now;
        const k = 1 - Math.exp(-dt * 7);
        const T = this.target;
        // the eye opens while on, closes when off; the three looks follow their targets
        this.open = this.on ? Math.min(1, this.open + dt / 0.45) : Math.max(0, this.open - dt / 0.3);
        const live = this.on ? 1 : 0;
        this.see += (T.see * live - this.see) * k;
        this.block += (T.block * live - this.block) * k;
        this.haze += (T.haze * live - this.haze) * k;
        this.clear += (T.clear - this.clear) * (1 - Math.exp(-dt * 5));
        if (!this.on && this.open <= 0.001) { this._freeRT(); return false; }
        const seeing = this.on && this.see > 0.02 && T.see > 0;
        if (seeing) {
            const every = this.low ? 1 / 15 : 1 / 24;
            if (!this.rt || now - this._behindAt >= every) {
                // (the beat is kept, not restarted at each frame: 24 a second on average even at 60 frames)
                this._behindAt = !this.rt || now - this._behindAt > 2 * every ? now : this._behindAt + every;
                this._drawBehind();
            }
        } else if (this.rt && this.see < 0.02 && !this.on) this._freeRT();
        const u = this.mat.uniforms, r = this.renderer;
        r.getDrawingBufferSize(_sz);
        u.tBehind.value = this.rt ? this.rt.texture : null;
        u.uAspect.value = _sz.x / Math.max(1, _sz.y);
        u.uTime.value = now % 1000;
        u.uRadius.value = 0.27 * EASE_OPEN(this.open); // a quarter of the screen's height (22–30%)
        u.uSee.value = this.rt ? this.see : 0;
        u.uBlock.value = this.block;
        u.uHaze.value = this.haze;
        u.uClear.value = this.clear;
        u.uShape.value = T.shape * (this.see > 0.02 ? 1 : 0);
        const prevT = r.getRenderTarget(), auto = r.autoClear;
        r.setRenderTarget(null);
        r.autoClear = false;
        r.render(this.qScene, this.qCam);
        r.setRenderTarget(prevT);
        r.autoClear = auto;
        this.stats.overlays++;
        return true;
    }

    /** Compile the cloud's shader now (the loading screen). */
    prewarm() {
        this.renderer.compile(this.qScene, this.qCam);
    }

    dispose() {
        this._freeRT();
        this.mat.dispose();
        this.quad.geometry.dispose();
    }
}
