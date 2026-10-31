/**
 * SeeThroughFx.js — the window of «Visible Godi» (the rules: game/VisibleGodi.js; the steam itself: SteamFx.js).
 *
 * Where my own steam covers the screen the wall is not drawn: the mask is the union of my puffs projected on the screen
 * (their edges ragged, a milky-blue rim, a few sparkles). Inside it — what lies BEHIND the wall in front of the hero: the
 * scene is drawn once more from the same eyes with the camera's near plane stood just past the far side of the wall, into
 * a small picture (a quarter of the screen, 24 times a second — 15 on a weak computer). The less clear the look
 * (VisibleGodi.clearOf), the more it is blurred, the greyer-blue, the lower in contrast and the grainier; below SEE.SHAPES
 * only dim shapes are left (a difference of two blurs), below SEE.WORKED no second picture is drawn — only milk. Magic
 * stops the look: milky «nothing», slowly swirling.
 *
 * Cheap on purpose (CLAUDE.md «Производительность»): the shader and its quad are made once (Game.prewarm); the small
 * picture is made when the spell is switched on and the steam is on the screen and freed when it ends; nothing is drawn
 * when the spell is off, no steam is on the screen or there is no wall near; no new lights, no new materials of the scene,
 * no shadow pass of its own (the sun's shadow map stays as the main picture left it).
 */
import * as THREE from 'three';
import { SEE, LENS, nearOf, puffStrength } from '../game/VisibleGodi.js';

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
uniform vec4 uPuffs[40]; // the hero's own steam on the screen: x, y (height units from the middle), radius, strength
uniform int uN;
uniform float uSee;
uniform float uBlock;
uniform float uHaze;
uniform float uClear;
uniform float uShape;
uniform int uTaps;
uniform float uLens; // the lens (0…1): the picture is the far look, enlarged
uniform vec2 uLensC; // where the lens's centre is on the screen now (uv)
uniform vec3 uCrop; // the crop drawn into the picture: centre (in the lens's own screen) and 1 / size
uniform float uZoom;
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
    // the steam's mask: the union of the puffs on the screen, their edges ragged with slow noise
    float wob = 0.8 + 0.4 * vnoise(q * 7.0 + vec2(uTime * 0.25, -uTime * 0.18));
    float keep = 1.0;
    for (int i = 0; i < 40; i++) {
        if (i >= uN) break;
        vec4 pf = uPuffs[i];
        float d = length(q - pf.xy) / max(pf.z * wob, 1e-4);
        keep *= 1.0 - pf.w * (1.0 - smoothstep(0.3, 1.0, d));
    }
    float mask = 1.0 - keep;
    if (mask < 0.004) discard;
    float core = smoothstep(0.25, 0.95, mask);
    float rim = smoothstep(0.04, 0.3, mask) * (1.0 - smoothstep(0.3, 0.75, mask));
    float a = 0.0;
    vec3 milky = vec3(0.77, 0.86, 0.95);
    float sw = vnoise(q * 3.0 + vec2(uTime * 0.15, -uTime * 0.1)) * 0.6 + vnoise(q * 7.0 - vec2(uTime * 0.2, 0.0)) * 0.4;
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
    float wSee = uSee / max(uSee + uBlock, 1e-3);
    vec3 outc = mix(cloud, seen, wSee);
    float alpha = clamp(mask * (uSee * 0.97 + uBlock * 0.9), 0.0, 1.0);
    if (uLens > 0.01) {
        // THE LENS: the far look, enlarged and sharp. The pixel at offset d from the lens's centre shows what is d / zoom
        // from the cloud's direction: the picture is the narrow view, cropped round the window.
        vec2 rad = vUv - uLensC;
        vec2 tuv = (vec2(0.5) + rad - uCrop.xy) * uCrop.z + 0.5;
        // a slow shimmer of the steam: the glass is a breathing cloud, not a pane (tiny, a few pixels)
        vec2 sh = vec2(vnoise(q * 5.0 + vec2(uTime * 0.7, 3.0)), vnoise(q * 5.0 + vec2(11.0, -uTime * 0.6))) - 0.5;
        tuv += sh * 0.006 * (1.0 - core * 0.6);
        // a light chromatic fringe that grows towards the rim of the window (and with the enlargement)
        float ca = (1.0 - core) * (0.0016 + 0.0007 * uZoom) * uCrop.z;
        vec3 lc = vec3(texture2D(tBehind, tuv + rad * ca).r, texture2D(tBehind, tuv).g, texture2D(tBehind, tuv - rad * ca).b);
        float ll = luma(lc);
        lc = mix(vec3(ll), lc, 1.06);                       // a touch livelier
        lc *= vec3(0.97, 1.0, 1.04);                        // a faint cool cast of the vapour
        lc *= 1.0 - (1.0 - core) * 0.2;                     // the rim darkens a little (a lens, not a hole)
        lc = mix(lc, milky, (1.0 - core) * 0.28 * (0.6 + 0.4 * sw)); // and mists over, softly
        float la = smoothstep(0.08, 0.55, mask) * 0.99;
        float wL = uLens / max(uLens + uSee + uBlock, 1e-3);
        outc = mix(outc, lc, wL);
        alpha = mix(alpha, la * uLens, wL);
    }
    // the milky-blue rim, shimmering, and a few sparkles drifting in the cloud
    float on = clamp(uSee + uBlock + uLens, 0.0, 1.0);
    float shimmer = 0.65 + 0.35 * sin(q.x * 23.0 + uTime * 2.3) * sin(q.y * 17.0 - uTime * 1.7);
    outc += vec3(0.62, 0.8, 1.0) * rim * 0.42 * shimmer;
    alpha = max(alpha, rim * 0.38 * on);
    vec2 g = q * 46.0 + vec2(0.0, uTime * 0.6);
    vec2 cell = floor(g);
    float h = hash21(cell + floor(uTime * 1.5));
    float spark = step(0.982, h) * pow(max(0.0, 1.0 - length(fract(g) - 0.5) * 2.0), 3.0) * smoothstep(0.1, 0.5, mask);
    outc += vec3(0.9, 0.96, 1.0) * spark * 0.9;
    alpha = max(alpha, spark * 0.8 * on);
    gl_FragColor = vec4(outc, alpha);
}
`;

/** How far behind the wall the second picture draws (m): the cloud is a blur, the far world only costs. */
export const SEE_FAR = 110;
const EASE_OPEN = (u) => { const c = 1.35; const x = Math.min(1, Math.max(0, u)) - 1; return 1 + (c + 1) * x * x * x + c * x * x; }; // easeOutBack: the eye opens with a little overshoot
const _s = new THREE.Vector3(), _pv = new THREE.Vector3();
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
        this.lens = 0; this.zoom = LENS.ZOOM_DEFAULT; // the lens's opening (smoothed 0…1) and its enlargement (smoothed)
        this.lensInfo = null; // VisibleGodi.lens: the cloud's centre, its enlargement, the near plane
        this._drawnMode = ''; this._drawnSeed = -1; // what the small picture shows now: 'wall' | 'lens' (and which cloud)
        this._cuv = { x: 0.5, y: 0.5, ok: false }; this._bb = { x: 0.5, y: 0.5, h: 0.5 }; this._crop = { x: 0.5, y: 0.5, inv: 1 };
        this.target = { see: 0, block: 0, haze: 1, clear: 1, shape: 0, lens: 0 };
        this.near = 1;
        this.coverage = -1; // puffs of my steam on the screen now (-1: not looked yet)
        this._puffs = null; this._now = 0;
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
                uPuffs: { value: Array.from({ length: 40 }, () => new THREE.Vector4()) }, uN: { value: 0 }, uSee: { value: 0 }, uBlock: { value: 0 }, uHaze: { value: 0 }, uClear: { value: 1 }, uShape: { value: 0 }, uTaps: { value: 13 },
                uLens: { value: 0 }, uLensC: { value: new THREE.Vector2(0.5, 0.5) }, uCrop: { value: new THREE.Vector3(0.5, 0.5, 1) }, uZoom: { value: 3 },
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
        if (!info || info.state === 'open' || info.state === 'far') { t.see = 0; t.block = 0; t.haze = 0; t.shape = 0; t.clear = 1; this.near = 1; return; } // (no near wall: the lens, setLens)
        t.lens = 0; // (a wall within reach: the wall's look, never the lens)
        if (info.state === 'blocked') { t.see = 0; t.block = 1; t.haze = 0; t.shape = 0; t.clear = 0; return; }
        if (info.clear < SEE.WORKED) { t.see = 0; t.block = 0.8; t.haze = 0; t.shape = 0; t.clear = 0; return; } // (too thick: only milk)
        t.see = 1; t.block = 0; t.haze = 0; t.clear = info.clear;
        t.shape = info.clear < SEE.SHAPES ? 1 - (info.clear - SEE.WORKED) / (SEE.SHAPES - SEE.WORKED) : 0;
        this.near = nearOf(info);
    }

    /** The lens of the last scan (VisibleGodi.lens: a cloud in the open air) or null. Only when no wall's look is on. */
    setLens(l) {
        const t = this.target;
        this.lensInfo = l || null;
        t.lens = l && t.see <= 0 && t.block <= 0 ? 1 : 0;
    }

    /** My steam (VisibleGodi.puffs, performance clock in s): where it is on the screen is where the wall is not drawn. */
    setPuffs(puffs, now) { this._puffs = puffs; this._now = now; }

    /** The puffs → the mask's discs (x, y from the middle in screen heights, radius, strength); returns how many are on the screen. */
    _project() {
        const cam = this.camera, u = this.mat.uniforms, list = u.uPuffs.value;
        let n = 0;
        const P = this._puffs;
        const L = this.lensInfo, lensMode = this.target.lens > 0 && !!L;
        this._cuv.ok = false;
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        if (P && this.on) {
            cam.updateMatrixWorld();
            const inv = cam.matrixWorldInverse, f = 1 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)), asp = cam.aspect;
            if (lensMode) {
                // where the lens's centre is on the screen now (the cloud must be in front of the eyes)
                _pv.set(L.x, L.y, L.z).applyMatrix4(inv);
                const z = -_pv.z;
                if (z < 0.4) { u.uN.value = 0; return 0; }
                this._cuv.x = 0.5 + _pv.x * f / z / asp; this._cuv.y = 0.5 + _pv.y * f / z; this._cuv.ok = true;
            }
            for (let i = P.length - 1; i >= 0 && n < 40; i--) {
                const q = P[i], age = this._now - q.t0, w = puffStrength(age) * this.open;
                if (w <= 0.01) continue;
                if (lensMode && !L.seeds.has(q.seed)) continue; // (one window: the cloud of the lens; the other clouds are only steam)
                _pv.set(q.x, q.y, q.z).applyMatrix4(inv);
                const z = -_pv.z;
                if (z < 0.4 || z > 40) continue;
                const k = f / z, sx = _pv.x * k * 1, sy = _pv.y * k;
                const r = SEE.PUFF_R * 1.25 * k * (0.55 + 0.45 * Math.min(1, age / 0.9));
                if (Math.abs(sx) > 0.5 * asp + r || Math.abs(sy) > 0.5 + r) continue;
                list[n++].set(sx, sy, r, w);
                if (lensMode) { x0 = Math.min(x0, 0.5 + (sx - r) / asp); x1 = Math.max(x1, 0.5 + (sx + r) / asp); y0 = Math.min(y0, 0.5 + sy - r); y1 = Math.max(y1, 0.5 + sy + r); }
            }
            if (lensMode && n) {
                // the crop of the lens picture: the window's box (the screen's own shape), a margin round it
                const hh = Math.max((x1 - x0) / 2, (y1 - y0) / 2) * 1.15 + 0.02;
                this._bb.x = (x0 + x1) / 2; this._bb.y = (y0 + y1) / 2; this._bb.h = Math.min(1, Math.max(0.06, hh));
            }
        }
        u.uN.value = n;
        return n;
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
        c2.clearViewOffset();
        cam.updateMatrixWorld();
        cam.matrixWorld.decompose(c2.position, c2.quaternion, _s);
        c2.fov = cam.fov; c2.aspect = cam.aspect; c2.near = Math.min(this.near, cam.far * 0.5);
        c2.far = Math.min(cam.far, c2.near + SEE_FAR); // (what is far behind a wall is a blur: not drawn at all — fewer things to submit)
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
        this._drawnMode = 'wall';
    }

    /**
     * The LENS picture: the scene from the same eyes, turned to the cloud, with a narrow view (the main view's tangent over the
     * zoom), cropped to the window's box (setViewOffset: the small picture holds only the window — sharper than the whole
     * view would be); the steam itself is hidden for this pass; the near plane stands before the first solid thing.
     */
    _drawLens() {
        const r = this.renderer, cam = this.camera, c2 = this.cam2, L = this.lensInfo, cu = this._cuv, bb = this._bb;
        this._ensureRT();
        cam.updateMatrixWorld();
        cam.matrixWorld.decompose(c2.position, c2.quaternion, _s);
        c2.up.set(0, 1, 0);
        c2.updateMatrixWorld(true); // (lookAt reads the world position: it must be this frame's)
        c2.lookAt(L.x, L.y, L.z);
        c2.updateMatrixWorld(true);
        c2.aspect = cam.aspect;
        c2.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / this.zoom));
        c2.near = Math.min(L.near ?? LENS.NEAR, cam.far * 0.5);
        c2.far = cam.far; // (as far as the scene itself is drawn: nothing is made for it — what is not there is the game's own haze)
        // the box in the lens's own screen (the cloud's centre is its middle): the same offset the pixels have from the centre
        const cx = 0.5 + bb.x - cu.x, cy = 0.5 + bb.y - cu.y, h = bb.h;
        c2.setViewOffset(1000, 1000, (cx - h) * 1000, (1 - cy - h) * 1000, 2 * h * 1000, 2 * h * 1000);
        c2.updateProjectionMatrix();
        this._crop.x = cx; this._crop.y = cy; this._crop.inv = 1 / (2 * h);
        const prevT = r.getRenderTarget(), auto = r.autoClear, sa = r.shadowMap.autoUpdate, sn = r.shadowMap.needsUpdate;
        r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
        this.game.steam?.pause?.(true);
        r.setRenderTarget(this.rt);
        r.autoClear = true;
        r.render(this.scene, c2);
        this.game.steam?.pause?.(false);
        r.setRenderTarget(prevT);
        r.autoClear = auto;
        r.shadowMap.autoUpdate = sa; r.shadowMap.needsUpdate = sn;
        c2.clearViewOffset();
        c2.updateProjectionMatrix();
        this.stats.passes++;
        this.stats.lensPasses = (this.stats.lensPasses || 0) + 1;
        this._drawnMode = 'lens';
        this._drawnSeed = L.seed;
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
        this.lens += (T.lens * live - this.lens) * k;
        if (this.lensInfo) this.zoom += (this.lensInfo.zoom - this.zoom) * (1 - Math.exp(-dt * 4)); // (the enlargement changes smoothly)
        if (!this.on && this.open <= 0.001) { this._freeRT(); this._drawnMode = ''; return false; }
        this.coverage = this._project();
        const seeing = this.on && this.see > 0.02 && T.see > 0 && this.coverage > 0;
        const lensing = this.on && !seeing && this.lens > 0.02 && T.lens > 0 && this.coverage > 0 && this._cuv.ok && !!this.lensInfo;
        if (seeing || lensing) {
            const every = this.low ? 1 / 15 : 1 / 24;
            const mode = seeing ? 'wall' : 'lens';
            const changed = this._drawnMode !== mode || (lensing && this._drawnSeed !== this.lensInfo.seed);
            if (!this.rt || changed || now - this._behindAt >= every) {
                // (the beat is kept, not restarted at each frame: 24 a second on average even at 60 frames)
                this._behindAt = !this.rt || changed || now - this._behindAt > 2 * every ? now : this._behindAt + every;
                if (seeing) this._drawBehind(); else this._drawLens();
            }
        } else if (this.rt && this.see < 0.02 && this.lens < 0.02 && !this.on) this._freeRT();
        const u = this.mat.uniforms, r = this.renderer;
        r.getDrawingBufferSize(_sz);
        u.tBehind.value = this.rt ? this.rt.texture : null;
        u.uAspect.value = _sz.x / Math.max(1, _sz.y);
        u.uTime.value = now % 1000;
        u.uSee.value = this.rt && this._drawnMode === 'wall' ? this.see : 0;
        u.uLens.value = this.rt && this._drawnMode === 'lens' ? this.lens : 0;
        u.uZoom.value = this.zoom;
        u.uLensC.value.set(this._cuv.x, this._cuv.y);
        u.uCrop.value.set(this._crop.x, this._crop.y, this._crop.inv);
        u.uBlock.value = this.block;
        u.uHaze.value = 0;
        u.uClear.value = this.clear;
        u.uShape.value = T.shape * (this.see > 0.02 ? 1 : 0);
        if (this.coverage <= 0 || u.uSee.value + this.block + u.uLens.value < 0.01) return false; // (no steam on the screen, or no wall to look through: nothing to draw) // (none of my steam on the screen: nothing to draw)
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
