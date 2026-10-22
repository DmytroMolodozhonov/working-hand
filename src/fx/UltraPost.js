/**
 * UltraPost.js — the picture of «Ультра качество», made after the scene is drawn (the way the
 * Minecraft shader packs — BSL, Complementary, SEUS — finish theirs):
 *   - the scene into a bright (HDR) picture with its depth,
 *   - bloom: what is brighter than white (the sun, its glint on water, fires, lanterns, «Люмос»,
 *     glowing spells) softly glows round itself — a chain of ever smaller blurred copies,
 *   - sun rays through the air (god rays): light streaming from the sun past trees, mountains and
 *     clouds (from the moon, faintly, at night),
 *   - mist low over the land (thicker in valleys, at dawn, at night and in the rain) lit warm on the
 *     sun's side,
 *   - a filmic tone curve (bright things roll off softly instead of burning white), warm light and
 *     blue-ish shadows, rich but not garish colours, a cool blue night, a soft vignette,
 *   - smoothing of the jagged edges (FXAA: the scene picture has no MSAA of its own).
 * Every shader here is compiled on the loading screen (prewarm); with the mode off nothing of this
 * is made or drawn.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const LUMA = 'float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';

/** Bright parts, half size (a 4-tap box: each tap a bilinear 2×2; Karis-weighted, no flicker of single pixels). */
const PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
${LUMA}
vec3 tap(vec2 uv) {
    vec3 c = texture2D(tSrc, uv).rgb;
    float l = luma(c);
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float w = max(soft, l - uThreshold) / max(l, 1e-4);
    return c * w / (1.0 + luma(c * w));
}
void main() {
    vec2 o = uTexel;
    vec3 c = tap(vUv + vec2(-o.x, -o.y)) + tap(vUv + vec2(o.x, -o.y)) + tap(vUv + vec2(-o.x, o.y)) + tap(vUv + vec2(o.x, o.y));
    c *= 0.25;
    gl_FragColor = vec4(c / max(1.0 - luma(c), 0.05), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
    vec2 o = uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
}`;

/** A 9-tap tent, added onto the next bigger copy (additive blending). */
const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
    vec2 o = uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += (texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(o.x, 0.0)).rgb
        + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, o.y)).rgb) * 2.0;
    c += texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb
        + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
    gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
}`;

/** Light streaming from the sun: a march over the picture towards it, gathering the bright sky it passes. */
const RAYS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform float uAspect;
varying vec2 vUv;
${LUMA}
void main() {
    const int N = 28;
    vec2 d = (uSun - vUv) / float(N) * 0.9;
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 uv = vUv + d * j;
    float acc = 0.0, decay = 1.0;
    for (int i = 0; i < N; i++) {
        vec2 q = clamp(uv, 0.001, 0.999);
        float sky = step(0.99999, texture2D(tDepth, q).r);
        vec2 s = (q - uSun) * vec2(uAspect, 1.0);
        float near = exp(-dot(s, s) * 9.0);
        acc += sky * near * clamp(luma(texture2D(tColor, q).rgb) - 0.35, 0.0, 2.0) * decay;
        decay *= 0.955;
        uv += d;
    }
    gl_FragColor = vec4(vec3(acc / float(N)), 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform vec2 uTexel;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRayCol;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uFogCol;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uMist;
uniform float uMistBase;
uniform float uNight;
uniform float uWet;
uniform float uTime;
varying vec2 vUv;
${LUMA}
// FXAA (the simple one): blur only across the edges that are steep in brightness
vec3 fxaa(vec2 uv) {
    vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 ne = texture2D(tColor, uv + vec2(1.0, -1.0) * uTexel).rgb;
    vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0) * uTexel).rgb;
    vec3 se = texture2D(tColor, uv + vec2(1.0, 1.0) * uTexel).rgb;
    vec3 m = texture2D(tColor, uv).rgb;
    float lnw = luma(min(nw, 1.0)), lne = luma(min(ne, 1.0)), lsw = luma(min(sw, 1.0)), lse = luma(min(se, 1.0)), lm = luma(min(m, 1.0));
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
    float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    if (lmax - lmin < max(0.04, lmax * 0.12)) return m;
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
    float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uTexel;
    vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);
    float lb = luma(min(b, 1.0));
    return (lb < lmin || lb > lmax) ? a : b;
}
// a soft shoulder: unchanged below k, bright things roll off towards white instead of clipping
vec3 shoulder(vec3 x) {
    const float k = 0.72;
    vec3 over = max(x - k, 0.0);
    return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
void main() {
    vec3 col = fxaa(vUv);
    float depth = texture2D(tDepth, vUv).r;
    // where this pixel is in the world
    vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 vp = uProjInv * ndc;
    vp /= vp.w;
    vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
    vec3 ray = wp - uCamPos;
    float dist = length(ray);
    vec3 rd = ray / max(dist, 1e-4);
    bool sky = depth >= 0.99999;
    if (sky) dist = 260.0;
    // mist low over the land (an exponential layer: thick near uMistBase, thin higher up)
    if (uMist > 0.001) {
        const float H = 9.0;
        float y0 = uCamPos.y - uMistBase, dy = rd.y * dist;
        float k = abs(dy) > 0.01 ? (1.0 - exp(-dy / H)) / (dy / H) : 1.0;
        float od = uMist * exp(-y0 / H) * dist * k;
        float m = (1.0 - exp(-od)) * (sky ? smoothstep(0.12, -0.02, rd.y) : 1.0);
        float sunward = pow(max(dot(rd, normalize(uSunDir)), 0.0), 6.0);
        vec3 mc = uFogCol * 1.02 + uSunCol * sunward * 0.22;
        col = mix(col, mc, clamp(m, 0.0, 0.85));
    }
    col += texture2D(tBloom, vUv).rgb * uBloom;
    col += uRayCol * texture2D(tRays, vUv).r * uRays;
    // the tone and the colours (the night a little brighter: the eye gets used to the moonlight)
    col *= mix(1.0, 1.45, uNight);
    col = shoulder(col);
    float l = luma(col);
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.3 * (1.0 - 0.6 * uNight)); // (a gentle S-curve: depth to the picture)
    l = luma(col);
    float sat = mix(1.2, 0.98, uWet) * mix(1.0, 0.9, uNight);
    col = mix(vec3(l), col, sat);
    // warm light, blue-ish shadows (deeper blue at night: the eye's moonlight)
    col *= mix(vec3(0.95, 0.985, 1.05), vec3(1.0), smoothstep(0.0, 0.4, l));
    col *= mix(vec3(1.0), vec3(1.06, 1.01, 0.92), smoothstep(0.35, 1.0, l) * (1.0 - uNight));
    float dark = 1.0 - smoothstep(0.0, 0.3, l);
    col = mix(col, l * vec3(0.62, 0.8, 1.3) * 1.2, dark * uNight * 0.5);
    col = mix(col, col * vec3(0.94, 0.98, 1.04), uWet * 0.6);
    // a soft vignette
    vec2 v = vUv - 0.5;
    col *= 1.0 - dot(v, v) * 0.32;
    // (a grain of noise: no banding in the sky's gradients)
    col += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const _sun = new THREE.Vector3();
const _v = new THREE.Vector3();
const LEVELS = 5;

export class UltraPost {
    /** @param {THREE.WebGLRenderer} renderer */
    constructor(renderer) {
        this.renderer = renderer;
        const gl = renderer.getContext();
        const isGL2 = renderer.capabilities.isWebGL2;
        // a bright (HDR) picture when the card can draw into one; otherwise the plain 8 bits (no glow beyond white)
        this.hdr = !!(isGL2 ? renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('EXT_color_buffer_half_float') : renderer.extensions.get('OES_texture_half_float') && renderer.extensions.get('EXT_color_buffer_half_float'));
        const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
        const rt = (w, h, depth = false) => {
            const t = new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false });
            t.texture.generateMipmaps = false;
            return t;
        };
        this.scene = rt(4, 4, true);
        this.scene.depthTexture = new THREE.DepthTexture(4, 4);
        this.scene.depthTexture.type = THREE.UnsignedIntType;
        this.mips = [];
        for (let i = 0; i < LEVELS; i++) this.mips.push(rt(2, 2));
        this.rays = rt(2, 2);
        void gl;
        // one triangle over the screen
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        this.quad = new THREE.Mesh(geo);
        this.quad.frustumCulled = false;
        this.qScene = new THREE.Scene();
        this.qScene.add(this.quad);
        this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const mat = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
        this.prefilter = mat(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.9 }, uKnee: { value: 0.35 } });
        this.down = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
        this.up = mat(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
        this.raysMat = mat(RAYS, { tColor: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } });
        this.composite = mat(COMPOSITE, {
            tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tRays: { value: null },
            uTexel: { value: new THREE.Vector2() }, uBloom: { value: 0.2 }, uRays: { value: 0 }, uRayCol: { value: new THREE.Color(1, 0.9, 0.7) },
            uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
            uFogCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
            uMist: { value: 0 }, uMistBase: { value: 0 }, uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 },
        });
        this.size = new THREE.Vector2();
        /** What the picture looks like now (set by Ultra.js each frame). */
        this.look = { bloom: 0.2, threshold: 0.9, rays: 0, rayCol: new THREE.Color(1, 0.9, 0.7), sunDir: new THREE.Vector3(0, 1, 0), mist: 0, mistBase: 0, night: 0, wet: 0, fog: new THREE.Color(0xc3e0fb), sunCol: new THREE.Color(1, 1, 1) };
    }

    _resize() {
        const s = this.renderer.getDrawingBufferSize(this.size);
        const w = Math.max(1, s.x), h = Math.max(1, s.y);
        if (this.scene.width === w && this.scene.height === h) return;
        this.scene.setSize(w, h);
        let mw = w, mh = h;
        for (const m of this.mips) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); m.setSize(mw, mh); }
        this.rays.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    }

    _pass(material, target, clear = true) {
        const r = this.renderer;
        this.quad.material = material;
        r.setRenderTarget(target);
        if (clear) r.clear(true, false, false);
        r.render(this.qScene, this.qCam);
    }

    /** Draw the scene with the ultra picture (to the screen). */
    render(scene, camera, time = 0, resize = true) {
        const r = this.renderer, L = this.look;
        if (resize) this._resize();
        const prevTarget = r.getRenderTarget(), auto = r.autoClear, infoReset = r.info.autoReset;
        // (the frame's numbers — draw calls, triangles — count the scene and the passes together)
        r.info.reset();
        r.info.autoReset = false;
        r.setRenderTarget(this.scene);
        r.autoClear = true;
        r.render(scene, camera);
        r.autoClear = false;
        // bloom: the bright parts, smaller and smaller, then back up adding each onto the next
        const pf = this.prefilter.uniforms;
        pf.tSrc.value = this.scene.texture;
        pf.uTexel.value.set(0.5 / this.scene.width, 0.5 / this.scene.height);
        pf.uThreshold.value = L.threshold;
        this._pass(this.prefilter, this.mips[0]);
        const du = this.down.uniforms;
        for (let i = 1; i < LEVELS; i++) {
            du.tSrc.value = this.mips[i - 1].texture;
            du.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
            this._pass(this.down, this.mips[i]);
        }
        const uu = this.up.uniforms;
        for (let i = LEVELS - 1; i > 0; i--) {
            uu.tSrc.value = this.mips[i].texture;
            uu.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
            uu.uWeight.value = 0.85;
            this._pass(this.up, this.mips[i - 1], false);
        }
        // the sun's rays (only with the sun — or moon — in front, near the picture)
        let rays = 0;
        if (L.rays > 0.001) {
            _sun.copy(L.sunDir).normalize().multiplyScalar(400).add(camera.getWorldPosition(_v)).project(camera);
            camera.getWorldDirection(_v);
            const facing = THREE.MathUtils.smoothstep(_v.dot(L.sunDir) / Math.max(1e-4, L.sunDir.length()), 0.05, 0.45);
            const off = Math.max(Math.abs(_sun.x), Math.abs(_sun.y));
            rays = L.rays * facing * (1 - THREE.MathUtils.smoothstep(off, 1.2, 2.2));
            if (rays > 0.001) {
                const ru = this.raysMat.uniforms;
                ru.tColor.value = this.scene.texture;
                ru.tDepth.value = this.scene.depthTexture;
                ru.uSun.value.set(_sun.x * 0.5 + 0.5, _sun.y * 0.5 + 0.5);
                ru.uAspect.value = this.scene.width / this.scene.height;
                this._pass(this.raysMat, this.rays);
            }
        }
        const cu = this.composite.uniforms;
        cu.tColor.value = this.scene.texture;
        cu.tDepth.value = this.scene.depthTexture;
        cu.tBloom.value = this.mips[0].texture;
        cu.tRays.value = this.rays.texture;
        cu.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
        cu.uBloom.value = L.bloom;
        cu.uRays.value = rays;
        cu.uRayCol.value.copy(L.rayCol);
        cu.uProjInv.value.copy(camera.projectionMatrixInverse);
        cu.uCamWorld.value.copy(camera.matrixWorld);
        camera.getWorldPosition(cu.uCamPos.value);
        cu.uFogCol.value.copy(L.fog);
        cu.uSunDir.value.copy(L.sunDir);
        cu.uSunCol.value.copy(L.sunCol);
        cu.uMist.value = L.mist;
        cu.uMistBase.value = L.mistBase;
        cu.uNight.value = L.night;
        cu.uWet.value = L.wet;
        cu.uTime.value = time % 100;
        this._pass(this.composite, prevTarget, false);
        r.autoClear = auto;
        r.info.autoReset = infoReset;
    }

    /** Compile every shader of the picture now (the loading screen). */
    prewarm(scene, camera) {
        const L = this.look, rays = L.rays;
        L.rays = 1;
        L.sunDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
        // (at the tiny size it was made with: a shader does not care, and with the mode off no big picture is kept)
        try { this.render(scene, camera, 0, false); } finally { L.rays = rays; }
    }

    dispose() {
        for (const t of [this.scene, this.rays, ...this.mips]) t.dispose();
        this.scene.depthTexture?.dispose();
        for (const m of [this.prefilter, this.down, this.up, this.raysMat, this.composite]) m.dispose();
        this.quad.geometry.dispose();
    }
}
