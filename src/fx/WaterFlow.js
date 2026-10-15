/**
 * WaterFlow.js — water that FLOWS: streams, jets, swirling bands, a funnel.
 *
 * The water-bending spells used to draw their water as hundreds of little balls.
 * Real water is one continuous body, so here it is drawn as smooth tubes laid
 * along paths (a stream from the river to the hand, a ring round the caster, a
 * jet flying at a target, a spiral climbing into a ball…):
 *   - one mesh for all the tubes of a spell (one draw call), rebuilt every frame
 *     from the paths the spell gives (`tube(points, radius)`);
 *   - the surface keeps moving ALONG the flow: ripples and bright streaks slide
 *     down the stream at the water's speed (the flow coordinate is advanced on the
 *     CPU, so every tube can flow at its own speed), the surface swells a little;
 *   - a fresnel rim, thicker-looking edges, sky/sun glints and a darker clear core
 *     (cheap refraction look — no extra render pass), white foam where the water
 *     is thin or torn (the ends, the edges of a jet);
 *   - `WaterSpray`: round droplets with a glint and soft mist puffs (Points, one
 *     draw call) for the spray at the edges and the mist at a vortex's foot.
 * Colours match the sea / lake water (SeaSurface, WaterMaterial).
 */

import * as THREE from 'three';

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const TAU = Math.PI * 2;

const VERT_HEAD = /* glsl */ `
attribute vec4 aFlow; // x: flow coordinate (m, already moving), y: round the tube 0..1, z: foam 0..1, w: tube radius
uniform float uTime;
varying vec4 vFlow;
varying vec3 vWPos;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uTime;
varying vec4 vFlow;
varying vec3 vWPos;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** The flowing-water material (Phong lighting kept so it sits in the scene like the lake). */
export function createFlowMaterial() {
    const mat = new THREE.MeshPhongMaterial({
        color: 0x2f8fe0, emissive: 0x062a4a, specular: 0xffffff, shininess: 140,
        transparent: true, opacity: 0.62, depthWrite: false, side: THREE.FrontSide,
    });
    const uniforms = { uTime: { value: 0 } };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vFlow = aFlow;
                // the surface swells as the water runs (bigger on a thick stream, none on a thread)
                float sw = sin(aFlow.x * 2.3 + aFlow.y * 18.85 + uTime * 1.7) * 0.6 + sin(aFlow.x * 5.1 - aFlow.y * 12.57 - uTime * 3.1) * 0.4;
                transformed += normal * sw * aFlow.w * 0.12;
                vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
                // ripples running down the stream bend the light
                vec2 fp = vec2(vFlow.x * 1.6, vFlow.y * 6.0);
                float r1 = wNoise(fp * 2.0 + vec2(0.0, uTime * 0.6)) - 0.5;
                float r2 = wNoise(fp * 4.3 + vec2(uTime * 0.4, 3.1)) - 0.5;
                normal = normalize(normal + vec3(r1, r2, r1 - r2) * 0.55);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                vec3 vdir = normalize(vViewPosition);
                float fres = pow(1.0 - clamp(abs(dot(vdir, normal)), 0.0, 1.0), 2.4);
                // the clear core is darker and bluer (you look through more water), the rim reflects the sky
                diffuseColor.rgb = mix(diffuseColor.rgb * 0.75, vec3(0.62, 0.84, 1.0), fres * 0.7);
                totalEmissiveRadiance += vec3(0.35, 0.62, 0.85) * fres * 0.55;
                // bright streaks carried by the current
                float st = wNoise(vec2(vFlow.x * 0.9, vFlow.y * 9.0)) * wNoise(vec2(vFlow.x * 2.7 + 7.0, vFlow.y * 14.0 + 2.0));
                totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * smoothstep(0.32, 0.7, st) * 0.6;
                // foam: where the stream is thin / torn, broken into flecks
                float fn = wNoise(vec2(vFlow.x * 3.5, vFlow.y * 11.0)) * 0.6 + wNoise(vec2(vFlow.x * 9.0, vFlow.y * 23.0 + uTime)) * 0.4;
                float foam = smoothstep(0.55, 0.85, fn + vFlow.z * 0.75 - 0.25) * clamp(vFlow.z * 1.6, 0.0, 1.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), foam);
                totalEmissiveRadiance += vec3(0.5, 0.55, 0.6) * foam;
                diffuseColor.a = clamp(diffuseColor.a * (0.75 + 0.9 * fres) + foam * 0.5, 0.0, 0.97);`);
    };
    mat.customProgramCacheKey = () => 'water-flow';
    return mat;
}

/**
 * Smooth tubes of water along paths, one mesh.
 *   flow.begin(dt)
 *   flow.tube(points, radius, {speed, foam, offset, closed, ends})  — any number of times
 *   flow.end()
 * `points`: an array of {x, y, z}; `radius`: a number or an array (one per point).
 */
export class WaterFlow {
    constructor(scene, { maxVerts = 40000, radial = 12 } = {}) {
        this.scene = scene;
        this.radial = radial;
        this.maxVerts = maxVerts;
        this.time = 0;
        this.nv = 0;
        this.ni = 0;
        this.pos = new Float32Array(maxVerts * 3);
        this.nor = new Float32Array(maxVerts * 3);
        this.flow = new Float32Array(maxVerts * 4);
        this.idx = new Uint32Array(maxVerts * 6);
        const g = new THREE.BufferGeometry();
        this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
        this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
        this.aFlow = new THREE.BufferAttribute(this.flow, 4).setUsage(THREE.DynamicDrawUsage);
        this.aIdx = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.aPos);
        g.setAttribute('normal', this.aNor);
        g.setAttribute('aFlow', this.aFlow);
        g.setIndex(this.aIdx);
        g.setDrawRange(0, 0);
        this.geo = g;
        this.mat = createFlowMaterial();
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        this.mesh.visible = false;
        scene?.add(this.mesh);
        this._frame = { t: [], n: [], b: [] };
        this.tubes = 0;
    }

    begin(dt = 1 / 60) {
        this.time += dt;
        this.mat.userData.uniforms.uTime.value = this.time;
        this.nv = 0;
        this.ni = 0;
        this.tubes = 0;
    }

    /** Rounded ends: a few rings closing the tube like the round front of a jet ('head', 'tail' or 'both'). */
    _capped(pts, radius, which) {
        const n = pts.length, P = this._cp || (this._cp = []), Rr = this._cr || (this._cr = []);
        P.length = 0; Rr.length = 0;
        const rad = (i) => (Array.isArray(radius) ? radius[i] : radius);
        const cap = (i, j, rev) => {
            const a = pts[i], b = pts[j];
            _t.set(a.x - b.x, a.y - b.y, a.z - b.z).normalize();
            const r = rad(i);
            for (const th of rev ? [1.45, 1.15, 0.8, 0.4] : [0.4, 0.8, 1.15, 1.45]) {
                const k = Math.sin(th) * r;
                P.push({ x: a.x + _t.x * k, y: a.y + _t.y * k, z: a.z + _t.z * k });
                Rr.push(Math.max(0.004, Math.cos(th) * r));
            }
        };
        if (which !== 'head') cap(0, 1, true);
        for (let i = 0; i < n; i++) { P.push(pts[i]); Rr.push(rad(i)); }
        if (which !== 'tail') cap(n - 1, n - 2, false);
        return { pts: P, radius: Rr };
    }

    /**
     * One tube along `pts`.
     * @param {Array<{x,y,z}>} pts at least 2 points
     * @param {number|number[]} radius
     * @param {object} o speed: m/s the water runs along it; foam: 0..1 extra foam everywhere;
     *   offset: phase (m) so tubes differ; closed: a ring; ends: taper the two ends to a point (default true)
     */
    tube(pts, radius, o = {}) {
        if (pts.length < 2) return;
        if (o.caps) ({ pts, radius } = this._capped(pts, radius, o.caps));
        const n = pts.length;
        const R = this.radial, ring = R + 1;
        if (this.nv + n * ring > this.maxVerts) return;
        const closed = !!o.closed, ends = o.ends !== false && !closed && !o.caps;
        this.tubes++;
        const speed = o.speed ?? 3, foam0 = o.foam ?? 0;
        const shift = (o.offset || 0) - this.time * speed;
        // tangents and a frame carried along the path (no twisting)
        const T = this._frame.t, N = this._frame.n, B = this._frame.b;
        for (let i = 0; i < n; i++) {
            const a = pts[i > 0 ? i - 1 : (closed ? n - 1 : 0)], c = pts[i < n - 1 ? i + 1 : (closed ? 0 : n - 1)];
            const t = T[i] || (T[i] = new THREE.Vector3());
            t.set(c.x - a.x, c.y - a.y, c.z - a.z);
            if (t.lengthSq() < 1e-12) t.copy(i ? T[i - 1] : _t.set(0, 1, 0)); else t.normalize();
        }
        for (let i = 0; i < n; i++) {
            const nn = N[i] || (N[i] = new THREE.Vector3()), bb = B[i] || (B[i] = new THREE.Vector3());
            if (i === 0) {
                _n.set(0, 1, 0);
                if (Math.abs(T[0].y) > 0.9) _n.set(1, 0, 0);
                bb.crossVectors(T[0], _n).normalize();
                nn.crossVectors(bb, T[0]).normalize();
            } else {
                bb.crossVectors(T[i], N[i - 1]);
                if (bb.lengthSq() < 1e-10) bb.copy(B[i - 1]); else bb.normalize();
                nn.crossVectors(bb, T[i]).normalize();
            }
        }
        let along = 0;
        const v0 = this.nv;
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
            let r = Array.isArray(radius) ? radius[i] : radius;
            const k = n > 1 ? i / (n - 1) : 0;
            let foam = foam0;
            if (ends) {
                const e = Math.min(k, 1 - k) * (n - 1); // points from the nearest end
                if (e < 1.5) { r *= 0.35 + 0.65 * (e / 1.5); foam = Math.max(foam, 0.8 - e * 0.35); }
            }
            const nn = N[i], bb = B[i];
            for (let j = 0; j <= R; j++) {
                const a = (j / R) * TAU, ca = Math.cos(a), sa = Math.sin(a);
                const vi = this.nv++;
                const nx = nn.x * ca + bb.x * sa, ny = nn.y * ca + bb.y * sa, nz = nn.z * ca + bb.z * sa;
                this.pos[vi * 3] = p.x + nx * r; this.pos[vi * 3 + 1] = p.y + ny * r; this.pos[vi * 3 + 2] = p.z + nz * r;
                this.nor[vi * 3] = nx; this.nor[vi * 3 + 1] = ny; this.nor[vi * 3 + 2] = nz;
                this.flow[vi * 4] = along + shift; this.flow[vi * 4 + 1] = j / R; this.flow[vi * 4 + 2] = foam; this.flow[vi * 4 + 3] = r;
            }
        }
        const rows = closed ? n : n - 1;
        for (let i = 0; i < rows; i++) {
            const r0 = v0 + i * ring, r1 = v0 + ((i + 1) % n) * ring;
            for (let j = 0; j < R; j++) {
                const a = r0 + j, b = r0 + j + 1, c = r1 + j, d = r1 + j + 1;
                this.idx[this.ni++] = a; this.idx[this.ni++] = c; this.idx[this.ni++] = b;
                this.idx[this.ni++] = b; this.idx[this.ni++] = c; this.idx[this.ni++] = d;
            }
        }
    }

    end() {
        this.geo.setDrawRange(0, this.ni);
        this.mesh.visible = this.ni > 0;
        if (!this.ni) return;
        // (only the part written this frame goes to the GPU)
        for (const [attr, count] of [[this.aPos, this.nv * 3], [this.aNor, this.nv * 3], [this.aFlow, this.nv * 4], [this.aIdx, this.ni]]) {
            attr.updateRange.offset = 0;
            attr.updateRange.count = count;
            attr.needsUpdate = true;
        }
    }

    dispose() {
        this.scene?.remove(this.mesh);
        this.geo.dispose();
        this.mat.dispose();
    }
}

/**
 * A stream from `a` to `b` that arcs (a jet of water pulled through the air): returns points.
 * `lift` (m) bows it up in the middle, `wave` makes it sway, `phase` animates the sway.
 */
export function arcPoints(a, b, { lift = 1, wave = 0.15, phase = 0, steps = 14, out = [] } = {}) {
    out.length = steps + 1;
    _p.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const L = _p.length() || 1;
    _q.set(-_p.z, 0, _p.x).normalize();
    if (_q.lengthSq() < 1e-6) _q.set(1, 0, 0);
    for (let i = 0; i <= steps; i++) {
        const k = i / steps, bow = 4 * k * (1 - k);
        const sway = Math.sin(k * 7 + phase) * wave * bow * Math.min(1, L / 3);
        const o = out[i] || (out[i] = { x: 0, y: 0, z: 0 });
        o.x = a.x + _p.x * k + _q.x * sway;
        o.y = a.y + _p.y * k + lift * bow;
        o.z = a.z + _p.z * k + _q.z * sway;
    }
    return out;
}

const SPRAY_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
varying float vAlpha;
varying float vKind;
uniform float uScale;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vAlpha = aAlpha;
    vKind = aKind;
}`;

const SPRAY_FRAG = /* glsl */ `
varying float vAlpha;
varying float vKind;
void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    vec3 col;
    float a;
    if (vKind > 0.5) { // mist: a soft white puff
        a = (1.0 - r * r) * 0.3;
        col = vec3(0.86, 0.93, 1.0);
    } else { // a droplet: clear blue, bright rim, a glint
        float rim = smoothstep(0.55, 1.0, r);
        float glint = smoothstep(0.28, 0.0, length(d - vec2(-0.14, -0.16)));
        col = mix(vec3(0.38, 0.68, 0.95), vec3(0.85, 0.95, 1.0), rim) + glint;
        a = mix(0.45, 0.9, rim) * (1.0 - smoothstep(0.85, 1.0, r)) + glint * 0.5;
    }
    gl_FragColor = vec4(col, a * vAlpha);
}`;

/** Droplets and mist: a small particle pool drawn as soft round points. */
export class WaterSpray {
    constructor(scene, capacity = 1600) {
        this.scene = scene;
        this.cap = capacity;
        this.n = 0;
        this.p = new Float32Array(capacity * 3);
        this.v = new Float32Array(capacity * 3);
        this.life = new Float32Array(capacity);
        this.max = new Float32Array(capacity);
        this.size0 = new Float32Array(capacity);
        this.kind = new Float32Array(capacity);
        this.grav = new Float32Array(capacity);
        this.size = new Float32Array(capacity);
        this.alpha = new Float32Array(capacity);
        const g = new THREE.BufferGeometry();
        this.aP = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
        this.aS = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
        this.aA = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
        this.aK = new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.aP);
        g.setAttribute('aSize', this.aS);
        g.setAttribute('aAlpha', this.aA);
        g.setAttribute('aKind', this.aK);
        g.setDrawRange(0, 0);
        this.geo = g;
        this.mat = new THREE.ShaderMaterial({
            vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG,
            uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false,
        });
        this.points = new THREE.Points(g, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 3;
        scene?.add(this.points);
    }

    /** A droplet (kind 0) or a mist puff (kind 1). */
    add(x, y, z, vx, vy, vz, size = 0.08, life = 0.7, kind = 0, gravity = kind ? -0.3 : -11) {
        let i = this.n;
        if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
        this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
        this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
        this.life[i] = this.max[i] = life;
        this.size0[i] = size;
        this.kind[i] = kind;
        this.grav[i] = gravity;
    }

    /** A burst of drops (and some mist) flying out from a point. */
    burst(x, y, z, count, speed = 3, up = 3, size = 0.09) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
            this.add(x, y, z, Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s, size * (0.6 + Math.random() * 0.9), 0.5 + Math.random() * 0.5);
            if (i % 4 === 0) this.add(x, y, z, Math.cos(a) * s * 0.3, 0.4 + Math.random() * 0.6, Math.sin(a) * s * 0.3, size * 6, 0.9 + Math.random() * 0.6, 1);
        }
    }

    update(dt, camera) {
        if (camera?.isPerspectiveCamera && typeof window !== 'undefined') {
            this.mat.uniforms.uScale.value = (window.innerHeight || 800) / (2 * Math.tan((camera.fov * Math.PI) / 360));
        }
        for (let i = 0; i < this.n; i++) {
            this.life[i] -= dt;
            if (this.life[i] <= 0) { this._kill(i); i--; continue; }
            const i3 = i * 3;
            this.v[i3 + 1] += this.grav[i] * dt;
            if (this.kind[i]) { const d = Math.exp(-dt * 1.5); this.v[i3] *= d; this.v[i3 + 1] *= d; this.v[i3 + 2] *= d; }
            this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
            const k = this.life[i] / this.max[i];
            this.size[i] = this.size0[i] * (this.kind[i] ? 1.6 - 0.6 * k : 0.6 + 0.4 * k);
            this.alpha[i] = this.kind[i] ? k * (1 - k) * 4 : Math.min(1, k * 2.5);
        }
        this.geo.setDrawRange(0, this.n);
        this.points.visible = this.n > 0;
        if (this.n) for (const [a, k] of [[this.aP, 3], [this.aS, 1], [this.aA, 1], [this.aK, 1]]) { a.updateRange.offset = 0; a.updateRange.count = this.n * k; a.needsUpdate = true; }
    }

    _kill(i) {
        const l = --this.n;
        if (i === l) return;
        for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[l * 3 + k]; this.v[i * 3 + k] = this.v[l * 3 + k]; }
        this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size0[i] = this.size0[l];
        this.kind[i] = this.kind[l]; this.grav[i] = this.grav[l];
    }

    dispose() {
        this.scene?.remove(this.points);
        this.geo.dispose();
        this.mat.dispose();
    }
}
