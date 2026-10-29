/**
 * GhostFx.js — how the ghosts of the Castle of Ghosts look (Ghosts.js; rules: GhostRules.js). ONE InstancedMesh for all of them (one draw call).
 *
 * A ghost is a sheet thrown over nothing: a tall bell of cloth with a round head, a hem that ripples and is torn into tatters, two draped
 * «arms» that lift when it looks at you, a tail of cloth trailing behind as it flies. Its face is painted on the cloth: two hollow, sorrowful
 * eye sockets with faint pale pupils deep inside and a long, wavering, wailing mouth — clearly a sheet with a face, not a man. A pale glow at
 * the rim (no light of its own: CLAUDE.md), a slow flicker, ~15 % see-through like everything of the invisible world (Invisibles.ghostAlpha),
 * and its own fade in / out; dissolving (Nihilis Atra) eats it away in glowing holes.
 *
 * Per instance (attributes): aA = (phase, fade, pose of the arms, seed), aB = (lean x, lean z — the velocity in its own frame, trail, dissolve).
 * The material and the shape are made once (module cache) and compiled at load (Game.prewarm → Ghosts.sampleModels); never in flight.
 */
import * as THREE from 'three';

let _geo = null, _mat = null, _matIn = null;

/** The sheet: a lathe from the hem (y 0) to the crown (y 1), the head a little bulging over narrow shoulders. Unit height, scaled per ghost. */
export function ghostGeometry() {
    if (_geo) return _geo;
    const prof = [
        [0.285, 0.0], [0.279, 0.03], [0.27, 0.07], [0.258, 0.12], [0.247, 0.18], [0.238, 0.25], [0.231, 0.32], [0.226, 0.40], [0.222, 0.47],
        [0.218, 0.54], [0.21, 0.60], [0.196, 0.655], [0.176, 0.70], [0.163, 0.735], [0.163, 0.77], [0.168, 0.81], [0.166, 0.85], [0.156, 0.89],
        [0.136, 0.93], [0.105, 0.962], [0.064, 0.987], [0.0, 1.0],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const SEG = 40;
    _geo = new THREE.LatheGeometry(prof, SEG, Math.PI); // (the seam at the back, the face at the front: ang 0 = +z)
    _geo.computeVertexNormals();
    const n = _geo.attributes.normal, rows = prof.length; // (the seam's twin vertices share one normal: no crease down the back)
    for (let j = 0; j < rows; j++) {
        const a = j, b = SEG * rows + j;
        const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
        n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    _geo.computeBoundingSphere();
    _geo.boundingSphere.radius = 1.4; // (the arms and the trail reach out of the lathe: never culled too early)
    return _geo;
}

const VERT = /* glsl */`
attribute vec4 aA; // phase, fade, pose, seed
attribute vec4 aB; // lean x, lean z, trail, dissolve
uniform float uTime;
varying vec3 vLocal;
varying float vFade;
varying float vSeed;
varying float vDiss;
varying float vRim;
varying float vFold;
#include <fog_pars_vertex>
void main() {
    vec3 p = position;
    float y = p.y;
    float ang = atan(p.x, p.z);
    float t = uTime + aA.x;
    vec2 radial = length(p.xz) > 1e-4 ? normalize(p.xz) : vec2(0.0);
    float low = 1.0 - smoothstep(0.0, 0.6, y);
    // the hem ripples (two waves running round it, its own phase)
    float wave = sin(ang * 3.0 + t * 2.3) * 0.55 + sin(ang * 5.0 - t * 3.1 + aA.w * 6.0) * 0.3 + sin(ang * 8.0 + t * 4.3) * 0.15;
    p.xz += radial * wave * 0.04 * low * low;
    p.y += wave * 0.03 * low * low * low;
    // folds of the cloth, deeper low down
    float fold = sin(ang * 7.0 + y * 3.0 + aA.w * 10.0 + sin(t * 0.7) * 0.4);
    p.xz += radial * fold * 0.009 * (0.35 + low);
    vFold = fold;
    // the two draped arms: lifted forward and out by the pose
    float pose = aA.z;
    for (int k = 0; k < 2; k++) {
        float s = k == 0 ? -1.0 : 1.0;
        float da = (ang - s * 1.45) / 0.5;
        float dy = (y - 0.5 - 0.05 * pose) / 0.13;
        float w = exp(-da * da) * exp(-dy * dy);
        float sleeve = exp(-da * da) * exp(-pow((y - 0.4) / 0.12, 2.0)); // (the cloth hanging under the arm)
        float hang = sin(t * 1.7 + s) * 0.015;
        p.x += s * (w * (0.04 + 0.05 * pose) + sleeve * 0.02 * pose);
        p.z += w * (0.02 + 0.15 * pose) + sleeve * 0.07 * pose + w * hang;
        p.y += w * 0.06 * pose;
    }
    // flying: the head leads, the lower cloth trails behind
    vec2 lean = aB.xy;
    float drag = pow(1.0 - y, 1.7);
    p.xz -= lean * drag * aB.z;
    p.xz += lean * y * 0.07;
    p.y += length(lean) * drag * aB.z * 0.35; // (the tail lifts behind it)
    // a lazy sway
    p.x += sin(t * 0.9) * 0.018 * y;
    p.z += cos(t * 0.73) * 0.012 * y;
    vLocal = position;
    vFade = aA.y;
    vSeed = aA.w;
    vDiss = aB.w;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec4 mvPosition = viewMatrix * world;
    vec3 n = normalize((viewMatrix * modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
    vRim = pow(1.0 - abs(dot(n, normalize(-mvPosition.xyz))), 2.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uAlpha;
uniform float uBright;
varying vec3 vLocal;
varying float vFade;
varying float vSeed;
varying float vDiss;
varying float vRim;
varying float vFold;
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    float ang = atan(vLocal.x, vLocal.z);
    float y = vLocal.y;
    // the torn hem: a jagged edge of long and short tatters
    vec2 ring = vec2(cos(ang), sin(ang)); // (round the sheet without a seam: every pattern is read on the circle, not on the angle)
    float jag = 0.02 + 0.07 * pow(vnoise(ring * 4.2 + vSeed * 13.0), 2.0) + 0.025 * vnoise(ring * 11.0 + vec2(vSeed * 9.0, 3.0));
    if (y < jag) discard;
    // dissolving (Nihilis Atra): holes eat the cloth from glowing edges
    float dn = vnoise(ring * 3.0 + vec2(vSeed * 5.0, y * 11.0)) * 0.65 + vnoise(ring * 8.0 + vec2(1.7, y * 34.0 + vSeed)) * 0.35;
    if (vDiss > 0.0 && dn < vDiss) discard;
    float edge = vDiss > 0.0 ? 1.0 - smoothstep(vDiss, vDiss + 0.09, dn) : 0.0;
    // the cloth: pale grey-blue, darker low down and in the folds, a faint weave
    vec3 col = vec3(0.76, 0.82, 0.92);
    col *= mix(0.62, 1.0, smoothstep(0.0, 0.9, y));
    float fold = sin(ang * 7.0 + y * 3.0 + vSeed * 10.0 + sin((uTime + vSeed * 9.0) * 0.7) * 0.4);
    col *= 0.86 + 0.14 * fold * (1.2 - y);
    col *= 0.94 + 0.06 * vnoise(ring * 25.0 + vec2(0.0, y * 120.0));
    float dark = 0.0, glow = 0.0;
    if (gl_FrontFacing) {
        // the face, at the front (ang 0): two sorrowful sockets slanting down outward, pale pupils deep in them, a long wailing mouth
        for (int k = 0; k < 2; k++) {
            float s = k == 0 ? -1.0 : 1.0;
            float ex = ang - s * 0.4;
            float ey = y - 0.838 + s * ex * 0.16; // (the outer corners droop: a sorrowful, hollow stare)
            float e = length(vec2(ex / 0.23, ey / (0.068 - 0.018 * smoothstep(-0.1, 0.2, s * ex))));
            dark = max(dark, 1.0 - smoothstep(0.62, 1.0, e + 0.14 * vnoise(vec2(ang * 30.0, y * 90.0))));
            float pe = length(vec2((ex + s * 0.04) / 0.045, (ey + 0.012) / 0.011));
            glow = max(glow, (1.0 - smoothstep(0.25, 1.0, pe)) * (0.55 + 0.45 * sin(uTime * 1.3 + vSeed * 7.0 + s)));
            // a dark run under each eye, as if it wept
            float st = (1.0 - smoothstep(0.0, 0.035 + 0.02 * vnoise(vec2(y * 40.0, s)), abs(ex + s * 0.05 + 0.02 * sin(y * 60.0)))) * smoothstep(0.64, 0.79, y) * (1.0 - smoothstep(0.785, 0.80, y));
            dark = max(dark, st * 0.55);
        }
        float mx = ang + 0.025 * sin(y * 80.0 + uTime * 1.6);
        float my = (y - 0.695) / (0.08 + 0.01 * sin(uTime * 0.9 + vSeed));
        float m = length(vec2(mx / (0.1 + 0.09 * smoothstep(0.8, -1.0, my)), my));
        dark = max(dark, 1.0 - smoothstep(0.7, 1.0, m + 0.1 * vnoise(vec2(ang * 40.0, y * 60.0))));
        col = mix(col, vec3(0.025, 0.03, 0.06), dark * 0.96);
        col += glow * vec3(0.7, 0.85, 1.0) * 0.9;
    } else {
        col *= 0.3; // (inside the sheet: dark, nothing there)
    }
    col *= uBright;
    col += vec3(0.5, 0.68, 0.98) * vRim * 0.5;
    col += edge * vec3(0.55, 0.85, 1.0) * 1.6;
    float flick = 0.9 + 0.1 * sin(uTime * 7.3 + vSeed * 20.0) * sin(uTime * 2.1 + vSeed * 3.0);
    float a = uAlpha * vFade * mix(0.62, 1.0, vRim) * flick * mix(0.5, 1.0, smoothstep(0.0, 0.45, y)); // (thinner towards the torn hem)
    a = max(a, (dark * 0.95 + glow * 0.5) * uAlpha * vFade);
    a = max(a, edge * vFade);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <fog_fragment>
}
`;

/**
 * The material (made once, compiled at load). `inner`: the inside of the sheet, drawn first as its own pass — one double-sided transparent pass
 * blends the far inside over the near outside in triangle order (a hard seam down the middle); two passes keep it right.
 */
export function ghostMaterial(inner = false) {
    if (inner) {
        if (!_matIn) { _matIn = ghostMaterial().clone(); _matIn.uniforms = ghostMaterial().uniforms; _matIn.side = THREE.BackSide; _matIn.name = 'ghostSheetIn'; }
        return _matIn;
    }
    if (_mat) return _mat;
    _mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uAlpha: { value: 0.85 }, uBright: { value: 1 } }]),
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: true,
    });
    _mat.name = 'ghostSheet';
    return _mat;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** All the ghosts of this computer: one mesh. */
export class GhostFx {
    constructor(max = 9) {
        this.max = max;
        const geo = ghostGeometry().clone(); // (its own instanced attributes; the lathe's arrays are copied once)
        this.aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
        this.aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
        this.aA.setUsage(THREE.DynamicDrawUsage); this.aB.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aA', this.aA);
        geo.setAttribute('aB', this.aB);
        this.mesh = new THREE.InstancedMesh(geo, ghostMaterial(), max);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.count = 0;
        this.mesh.visible = false;
        this.mesh.frustumCulled = false; // (instances anywhere round the hero: the mesh's own sphere is not theirs)
        this.mesh.renderOrder = 3;
        this.mesh.name = 'ghosts';
        this.inner = new THREE.InstancedMesh(geo, ghostMaterial(true), max); // (the inside of the sheets: the same instances, drawn first)
        this.inner.instanceMatrix = this.mesh.instanceMatrix;
        this.inner.count = 0; this.inner.frustumCulled = false; this.inner.renderOrder = 2; this.inner.name = 'ghostsInside';
        this.mesh.add(this.inner);
        this._order = [];
    }

    /** Samples for Game.prewarm: one instance each of the outside and the inside, the same programs. */
    static samples() {
        const geo = ghostGeometry().clone();
        geo.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 0.5, 0.3]), 4));
        geo.setAttribute('aB', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4));
        return [false, true].map((inner) => {
            const m = new THREE.InstancedMesh(geo, ghostMaterial(inner), 1);
            m.setMatrixAt(0, _m.identity());
            m.name = 'ghostSample';
            return m;
        });
    }

    /**
     * Draws the ghosts. `list`: [{pos (hem point), yaw, size, phase, fade, pose, seed, lean:{x,z} (world velocity), trail, diss}];
     * `cam`: the camera's position (far ones first: they are see-through); `t`: s; `alpha`: Invisibles.ghostAlpha.
     */
    draw(list, cam, t, alpha, bright = 1) {
        const mat = ghostMaterial();
        mat.uniforms.uTime.value = t;
        mat.uniforms.uAlpha.value = alpha;
        mat.uniforms.uBright.value = bright;
        const ord = this._order;
        ord.length = 0;
        for (const o of list) if (o.fade > 0.01 && ord.length < this.max) ord.push(o);
        if (!ord.length) { this.hide(); return 0; }
        if (cam) ord.sort((a, b) => b.pos.distanceToSquared(cam) - a.pos.distanceToSquared(cam));
        const A = this.aA.array, B = this.aB.array;
        for (let i = 0; i < ord.length; i++) {
            const o = ord[i];
            _q.setFromAxisAngle(_up, o.yaw);
            _m.compose(_p.copy(o.pos), _q, _s.setScalar(o.size));
            this.mesh.setMatrixAt(i, _m);
            // the lean in its own frame (the velocity turned back by its yaw), scaled to the cloth
            const c = Math.cos(-o.yaw), s = Math.sin(-o.yaw);
            const lx = o.lean ? (o.lean.x * c + o.lean.z * s) : 0, lz = o.lean ? (-o.lean.x * s + o.lean.z * c) : 0;
            const k = 0.045;
            A[i * 4] = o.phase; A[i * 4 + 1] = o.fade; A[i * 4 + 2] = o.pose; A[i * 4 + 3] = o.seed;
            B[i * 4] = Math.max(-0.5, Math.min(0.5, lx * k)); B[i * 4 + 1] = Math.max(-0.5, Math.min(0.5, lz * k)); B[i * 4 + 2] = o.trail ?? 1; B[i * 4 + 3] = o.diss || 0;
        }
        this.mesh.count = this.inner.count = ord.length;
        this.mesh.visible = true;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.aA.needsUpdate = true;
        this.aB.needsUpdate = true;
        return ord.length;
    }

    hide() { this.mesh.count = this.inner.count = 0; this.mesh.visible = false; }

    dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); } // (the inside shares the shape)
}
