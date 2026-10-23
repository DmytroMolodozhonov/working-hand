/**
 * Particles.js — pooled, instanced particle systems.
 *
 * The original spawned a new Mesh + Geometry + Material for every spark
 * (Inferno: ~900 per second) and never disposed them. Here every effect type
 * is ONE InstancedMesh allocated at start-up: spawning is just writing numbers
 * into typed arrays, so spells cost nothing extra in a fight and shaders are
 * compiled during loading, not mid-battle.
 */

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _sc = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** Adds a per-instance alpha attribute to a basic/lambert material. */
function withInstanceAlpha(material) {
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
            .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vInstanceAlpha;');
    };
    material.customProgramCacheKey = () => 'instanceAlpha';
    return material;
}

/**
 * Glowing / see-through effects (fire, smoke, sparks of magic) are drawn AFTER the see-through water
 * (rivers, lakes, the sea: renderOrder 1; water magic: 2). Drawn before it, the water's surface
 * behind a fire was painted over the flames (the water writes no depth): the fire looked swallowed.
 */
export const FX_RENDER_ORDER = 3;

export class ParticlePool {
    /**
     * @param {THREE.Scene} scene
     * @param {object} o {geometry, capacity, lit, transparent, blending, gravity, ground, depthWrite, shrink}
     */
    constructor(scene, o) {
        this.capacity = o.capacity;
        this.gravity = o.gravity ?? 0;
        this.groundFn = o.ground || null; // (x,z) => y
        this.bounce = o.bounce ?? 0;
        this.friction = o.friction ?? 0.8;
        const mat = o.lit
            ? new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: !!o.transparent })
            : new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !!o.transparent, blending: o.blending ?? THREE.NormalBlending, depthWrite: o.depthWrite ?? true });
        if (o.transparent) withInstanceAlpha(mat);
        this.mesh = new THREE.InstancedMesh(o.geometry, mat, this.capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = !!o.castShadow;
        // Per-instance colour buffer sized for the full capacity
        // (setColorAt() would size it from the current count, which is 0 here).
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.mesh.count = 0;
        if (o.transparent) this.mesh.renderOrder = FX_RENDER_ORDER;
        if (o.transparent) {
            this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity).fill(1), 1);
            this.alpha.setUsage(THREE.DynamicDrawUsage);
            o.geometry.setAttribute('instanceAlpha', this.alpha);
        }
        scene.add(this.mesh);

        const n = this.capacity;
        this.pos = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        this.rot = new Float32Array(n * 3);
        this.rotVel = new Float32Array(n * 3);
        this.size = new Float32Array(n);
        this.shrink = new Float32Array(n);
        this.life = new Float32Array(n);
        this.maxLife = new Float32Array(n);
        this.col = new Float32Array(n * 3);
        this.fade = new Uint8Array(n);
        this.grav = new Float32Array(n);
        this.active = 0; // particles are kept packed in [0, active)
    }

    /**
     * Spawn one particle.
     * @param {number} x,y,z position
     * @param {number} vx,vy,vz velocity
     * @param {number} color hex
     * @param {number} size world size
     * @param {number} life seconds
     * @param {object} [o] {shrink=0.5 (scale lost per second), fade=true, spin=5, gravity}
     */
    spawn(x, y, z, vx, vy, vz, color, size, life, o) {
        let i = this.active;
        if (i >= this.capacity) {
            // Pool full: recycle a random old particle instead of allocating.
            i = Math.floor(Math.random() * this.capacity);
        } else {
            this.active++;
        }
        const i3 = i * 3;
        this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
        this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
        this.rot[i3] = Math.random() * Math.PI; this.rot[i3 + 1] = Math.random() * Math.PI; this.rot[i3 + 2] = Math.random() * Math.PI;
        const spin = o?.spin ?? 5;
        this.rotVel[i3] = (Math.random() - 0.5) * spin; this.rotVel[i3 + 1] = (Math.random() - 0.5) * spin; this.rotVel[i3 + 2] = (Math.random() - 0.5) * spin;
        this.size[i] = size;
        this.shrink[i] = o?.shrink ?? 0.5;
        this.life[i] = life;
        this.maxLife[i] = life;
        this.fade[i] = (o?.fade ?? true) ? 1 : 0;
        this.grav[i] = o?.gravity ?? this.gravity;
        _c.setHex(color);
        this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    }

    _kill(i) {
        const last = --this.active;
        if (i === last) return;
        const i3 = i * 3, l3 = last * 3;
        for (let k = 0; k < 3; k++) {
            this.pos[i3 + k] = this.pos[l3 + k];
            this.vel[i3 + k] = this.vel[l3 + k];
            this.rot[i3 + k] = this.rot[l3 + k];
            this.rotVel[i3 + k] = this.rotVel[l3 + k];
            this.col[i3 + k] = this.col[l3 + k];
        }
        this.size[i] = this.size[last];
        this.shrink[i] = this.shrink[last];
        this.life[i] = this.life[last];
        this.maxLife[i] = this.maxLife[last];
        this.fade[i] = this.fade[last];
        this.grav[i] = this.grav[last];
    }

    update(dt) {
        for (let i = this.active - 1; i >= 0; i--) {
            this.life[i] -= dt;
            if (this.life[i] <= 0) this._kill(i);
        }
        const n = this.active;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            this.vel[i3 + 1] += this.grav[i] * dt;
            this.pos[i3] += this.vel[i3] * dt;
            this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
            this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
            if (this.groundFn) {
                const gy = this.groundFn(this.pos[i3], this.pos[i3 + 2]) + this.size[i] * 0.5;
                if (this.pos[i3 + 1] < gy) {
                    this.pos[i3 + 1] = gy;
                    this.vel[i3 + 1] = -this.vel[i3 + 1] * this.bounce;
                    this.vel[i3] *= this.friction;
                    this.vel[i3 + 2] *= this.friction;
                    this.rotVel[i3] *= 0.7; this.rotVel[i3 + 1] *= 0.7; this.rotVel[i3 + 2] *= 0.7;
                }
            }
            this.rot[i3] += this.rotVel[i3] * dt;
            this.rot[i3 + 1] += this.rotVel[i3 + 1] * dt;
            this.rot[i3 + 2] += this.rotVel[i3 + 2] * dt;
            const age = this.maxLife[i] - this.life[i];
            const scale = Math.max(0.001, this.size[i] * (1 - this.shrink[i] * age));
            _p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
            _q.setFromEuler(_e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]));
            _s.set(scale, scale, scale);
            _m.compose(_p, _q, _s);
            this.mesh.setMatrixAt(i, _m);
            this.mesh.instanceColor.setXYZ(i, this.col[i3], this.col[i3 + 1], this.col[i3 + 2]);
            if (this.alpha) this.alpha.setX(i, this.fade[i] ? this.life[i] / this.maxLife[i] : 1);
        }
        this.mesh.count = n;
        this.mesh.visible = n > 0; // empty pools cost no draw call
        if (n > 0 || this._hadParticles) {
            this.mesh.instanceMatrix.needsUpdate = true;
            this.mesh.instanceColor.needsUpdate = true;
            if (this.alpha) this.alpha.needsUpdate = true;
        }
        this._hadParticles = n > 0;
    }

    clear() {
        this.active = 0;
        this.mesh.count = 0;
    }
}

/**
 * GlowPool — soft round glowing points (THREE.Points with its own tiny shader): the fireworks' sparks and flashes.
 * The same `spawn` as ParticlePool ({shrink, fade, gravity, drag}); no per-spark matrices — only positions, sizes, colours and
 * alphas go to the graphics card, so thousands cost little. Additive, no fog (a far burst must not melt into the 90 m fog),
 * hidden behind trees and hills (depth test), `size` is the visible diameter in metres (the point is the same size seen from any
 * distance in metres, so a far burst stays a bright ball: the pixel size is clamped to what the card can draw).
 */
export class GlowPool {
    constructor(scene, o) {
        const n = this.capacity = o.capacity;
        this.pos = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        this.size = new Float32Array(n);
        this.shrink = new Float32Array(n);
        this.life = new Float32Array(n);
        this.maxLife = new Float32Array(n);
        this.col = new Float32Array(n * 3);
        this.fade = new Uint8Array(n);
        this.grav = new Float32Array(n);
        this.drag = new Float32Array(n);
        this.aSize = new Float32Array(n);
        this.aAlpha = new Float32Array(n);
        this.active = 0;
        const geo = new THREE.BufferGeometry();
        this._pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
        this._size = new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage);
        this._alpha = new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage);
        this._col = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', this._pos);
        geo.setAttribute('aSize', this._size);
        geo.setAttribute('aAlpha', this._alpha);
        geo.setAttribute('aColor', this._col);
        geo.setDrawRange(0, 0);
        this.uniforms = { uScale: { value: 400 }, uMax: { value: 128 }, uHot: { value: 0.6 } }; // (uHot: how white the hot core is — less by day, so the colours survive a bright sky)
        const mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
            vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; uniform float uMax;
varying vec3 vColor; varying float vAlpha;
void main() { vColor = aColor; vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(0.1, -mv.z); gl_PointSize = clamp(aSize * uScale * 2.2 / d, 1.0, uMax); gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float uHot;
void main() { vec2 p = gl_PointCoord - vec2(0.5); float d = length(p) * 2.0; if (d > 1.0) discard;
float core = exp(-d * d * 9.0); float halo = exp(-d * d * 2.6) * (1.0 - d * d);
float lum = max(vColor.r, max(vColor.g, vColor.b)); vec3 hot = mix(vColor, vec3(1.0), uHot * lum);
vec3 c = vColor * (halo * 0.95) + hot * core * 0.8; gl_FragColor = vec4(c * vAlpha, 1.0); }`,
        });
        this.mesh = new THREE.Points(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = FX_RENDER_ORDER;
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    /** The picture's height in pixels and the camera's field of view (°): how big a metre looks. `maxPx`: the card's largest point. */
    view(heightPx, fovDeg, maxPx = 128) {
        this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
        this.uniforms.uMax.value = maxPx;
    }

    spawn(x, y, z, vx, vy, vz, color, size, life, o) {
        let i = this.active;
        if (i >= this.capacity) i = Math.floor(Math.random() * this.capacity);
        else this.active++;
        const i3 = i * 3;
        this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
        this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
        this.size[i] = size;
        this.shrink[i] = o?.shrink ?? 0.5;
        this.life[i] = life;
        this.maxLife[i] = life;
        this.fade[i] = (o?.fade ?? true) ? 1 : 0;
        this.grav[i] = o?.gravity ?? 0;
        this.drag[i] = o?.drag ?? 0;
        _c.setHex(color);
        this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    }

    _kill(i) {
        const last = --this.active;
        if (i === last) return;
        const i3 = i * 3, l3 = last * 3;
        for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[l3 + k]; this.vel[i3 + k] = this.vel[l3 + k]; this.col[i3 + k] = this.col[l3 + k]; }
        this.size[i] = this.size[last]; this.shrink[i] = this.shrink[last]; this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
        this.fade[i] = this.fade[last]; this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
    }

    update(dt) {
        for (let i = this.active - 1; i >= 0; i--) { this.life[i] -= dt; if (this.life[i] <= 0) this._kill(i); }
        const n = this.active, P = this._pos.array, C = this._col.array;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            this.vel[i3 + 1] += this.grav[i] * dt;
            if (this.drag[i] > 0) { const k = Math.exp(-this.drag[i] * dt); this.vel[i3] *= k; this.vel[i3 + 1] *= k; this.vel[i3 + 2] *= k; }
            this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
            P[i3] = this.pos[i3]; P[i3 + 1] = this.pos[i3 + 1]; P[i3 + 2] = this.pos[i3 + 2];
            C[i3] = this.col[i3]; C[i3 + 1] = this.col[i3 + 1]; C[i3 + 2] = this.col[i3 + 2];
            const age = this.maxLife[i] - this.life[i];
            this.aSize[i] = Math.max(0.001, this.size[i] * (1 - this.shrink[i] * age));
            const f = this.life[i] / this.maxLife[i];
            this.aAlpha[i] = this.fade[i] ? Math.min(1, f * 1.6) * (0.55 + 0.45 * f) : 1; // (a quick bloom out of the flash, then a slow cooling)
        }
        this.mesh.visible = n > 0;
        this._pos.needsUpdate = this._size.needsUpdate = this._alpha.needsUpdate = this._col.needsUpdate = n > 0 || this._had;
        this._had = n > 0;
        this.mesh.geometry.setDrawRange(0, n);
    }

    clear() { this.active = 0; this.mesh.geometry.setDrawRange(0, 0); this.mesh.visible = false; }
}

/**
 * Pool of oriented segments (lightning bolts, beams): each instance is a unit
 * cylinder stretched between two points.
 */
export class SegmentPool {
    constructor(scene, { capacity, radius, color, transparent = false, opacity = 1, blending = THREE.NormalBlending, radial = 4 }) {
        const geo = new THREE.CylinderGeometry(1, 1, 1, radial, 1, true);
        geo.translate(0, 0.5, 0);
        this.mat = new THREE.MeshBasicMaterial({ color, transparent, opacity, blending, depthWrite: !transparent, side: THREE.DoubleSide });
        this.mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
        if (transparent) this.mesh.renderOrder = FX_RENDER_ORDER;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        this.capacity = capacity;
        this.radius = radius;
        this.items = [];
        scene.add(this.mesh);
    }

    /** Add a segment from a to b (Vector3-like) living `life` seconds. */
    add(a, b, life, radius = this.radius) {
        if (this.items.length >= this.capacity) this.items.shift();
        this.items.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, life, radius });
    }

    update(dt) {
        let n = 0;
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.life -= dt;
            if (it.life <= 0) this.items.splice(i, 1);
        }
        for (const it of this.items) {
            const dx = it.bx - it.ax, dy = it.by - it.ay, dz = it.bz - it.az;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
            _dir.set(dx / len, dy / len, dz / len);
            _q.setFromUnitVectors(_up, _dir);
            _m.compose(_p.set(it.ax, it.ay, it.az), _q, _sc.set(it.radius, len, it.radius));
            this.mesh.setMatrixAt(n++, _m);
        }
        this.mesh.count = n;
        this.mesh.visible = n > 0; // empty pools cost no draw call
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
        this.items.length = 0;
        this.mesh.count = 0;
    }
}

/**
 * A curved beam (ice beam) whose tube vertices are updated in place —
 * the original recreated a TubeGeometry every few frames and leaked them.
 */
export class CurvedBeam {
    constructor(scene, { segments = 12, radial = 6, radius = 0.15, color = 0x00ffff, opacity = 0.8 } = {}) {
        this.segments = segments;
        this.radial = radial;
        this.radius = radius;
        const vCount = (segments + 1) * (radial + 1);
        const geo = new THREE.BufferGeometry();
        this.positions = new Float32Array(vCount * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        const idx = [];
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < radial; j++) {
                const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
                idx.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        geo.setIndex(idx);
        this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        this.mesh.renderOrder = FX_RENDER_ORDER;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this._t = new THREE.Vector3();
        this._n = new THREE.Vector3();
        this._b = new THREE.Vector3();
        this._pt = new THREE.Vector3();
    }

    /** Quadratic bezier p0 -> p1(control) -> p2 */
    setCurve(p0, p1, p2) {
        const S = this.segments, R = this.radial;
        let k = 0;
        for (let i = 0; i <= S; i++) {
            const t = i / S, it = 1 - t;
            const pt = this._pt.set(
                it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x,
                it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y,
                it * it * p0.z + 2 * it * t * p1.z + t * t * p2.z,
            );
            const tan = this._t.set(
                2 * it * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
                2 * it * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
                2 * it * (p1.z - p0.z) + 2 * t * (p2.z - p1.z),
            ).normalize();
            const ref = Math.abs(tan.y) < 0.9 ? this._n.set(0, 1, 0) : this._n.set(1, 0, 0);
            const bin = this._b.crossVectors(tan, ref).normalize();
            const nor = ref.crossVectors(bin, tan).normalize();
            for (let j = 0; j <= R; j++) {
                const a = (j / R) * Math.PI * 2;
                const c = Math.cos(a) * this.radius, s = Math.sin(a) * this.radius;
                this.positions[k++] = pt.x + nor.x * c + bin.x * s;
                this.positions[k++] = pt.y + nor.y * c + bin.y * s;
                this.positions[k++] = pt.z + nor.z * c + bin.z * s;
            }
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.visible = true;
    }

    hide() {
        this.mesh.visible = false;
    }
}
