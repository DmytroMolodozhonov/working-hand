/**
 * DevilDeathFx.js — смерть Дьяволоса от божественного меча, «ещё эффектнее» (слова автора): он РАЗЛЕТАЕТСЯ во все стороны.
 *
 * Слои (все — из общих форм и одного-двух шейдеров, без источников света; прогрев — `DevilDeathFx.samples()` в Game.prewarm):
 *   лучи    — из трещин света по телу вырываются лучи во все стороны (InstancedMesh, 32): их всё больше, они длиннее, к пеплу — ослепительные;
 *   осколки — светящиеся куски кожи и пепла (InstancedMesh, 40): разлетаются радиально, падают, подпрыгивают, тлеют и тают;
 *   кольца  — ударные кольца света бегут по земле (цепь лопнула, пал на колени, распад) — 3 из пула;
 *   купол   — вспышка-шар в миг распада, растёт до 180 м и тает;
 *   искры   — фонтан искр на сотни метров (общий пул `fx.glow`, ≤ 30 за кадр);
 *   экран   — белая вспышка у всех, кто ближе 400 м: до 0,85 за 0,15 с, плавный возврат за 0,6 с (не режет глаза; одна полупрозрачная плашка DOM).
 * Время — то же, что у DEATH (0…20 с): каждый компьютер играет сам по сообщению «die» хоста.
 */
import * as THREE from 'three';

export const DEATH_FX = {
    RAYS: 32, SHARDS: 40, RINGS: 3,
    RAY_LEN: [30, 320],     // м — длина луча от появления до распада
    RAY_W: [2.5, 9],        // м — ширина у конца
    SHARD: [4, 13],         // м — размер куска (в масштабе тела 122 м)
    SHARD_V: [28, 85],      // м/с — разлёт (радиально) + вверх
    GRAV: 24,
    RING_R: 320, RING_T: 2.6,
    DOME_R: 180, DOME_T: 1.4,
    FLASH_R: 400, FLASH_UP: 0.15, FLASH_DOWN: 0.6, FLASH_MAX: 0.85,
    SPARK_MAX: 30,
};

const RAY_VERT = `attribute float aK; varying vec2 vUv; varying float vK;
void main() { vUv = uv; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const RAY_FRAG = `uniform float uT; varying vec2 vUv; varying float vK;
void main() {
    float along = vUv.y;                          // 0 у тела … 1 на конце
    float across = abs(vUv.x - 0.5) * 2.0;
    float core = exp(-across * across * 9.0);
    float fl = 0.75 + 0.25 * sin(uT * 23.0 + vK * 40.0 + along * 9.0);
    float a = core * pow(1.0 - along, 1.6) * fl * vK;
    vec3 c = mix(vec3(1.0, 0.86, 0.5), vec3(1.0), core * (1.0 - along));
    gl_FragColor = vec4(c * a, a);
}`;
const RING_FRAG = `uniform float uK; uniform float uT; varying vec2 vUv;
void main() {
    float r = vUv.y;                              // 0 внутренний край … 1 внешний
    float a = smoothstep(0.0, 0.25, r) * (1.0 - smoothstep(0.55, 1.0, r)) * uK * (0.85 + 0.15 * sin(uT * 31.0 + vUv.x * 60.0));
    gl_FragColor = vec4(vec3(1.0, 0.9, 0.62) * a, a);
}`;
const RING_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FRAG = `uniform float uK; varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5); float a = (0.25 + 0.75 * f) * uK; gl_FragColor = vec4(vec3(1.0, 0.95, 0.82) * a, a); }`;
const DOME_VERT = `varying vec3 vN; varying vec3 vV; void main() { vec4 w = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -w.xyz; gl_Position = projectionMatrix * w; }`;

let _rayGeo = null, _rayMat = null, _shardGeo = null, _shardMat = null, _ringGeo = null, _ringMat = null, _domeGeo = null, _domeMat = null;
/** Луч: плоская лента вдоль +Y (0…1), ширина 1; две перекрещенные — видно с любой стороны. */
function rayGeo() {
    if (_rayGeo) return _rayGeo;
    const g1 = new THREE.PlaneGeometry(1, 1, 1, 6); g1.translate(0, 0.5, 0);
    const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
    const pos = [], uv = [], idx = [];
    let base = 0;
    for (const g of [g1, g2]) {
        const P = g.getAttribute('position'), U = g.getAttribute('uv');
        for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
        for (const i of g.index.array) idx.push(i + base);
        base += P.count;
    }
    _rayGeo = new THREE.BufferGeometry();
    _rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    _rayGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    _rayGeo.setIndex(idx);
    _rayGeo.userData.keep = true;
    return _rayGeo;
}
function rayMat() {
    if (_rayMat) return _rayMat;
    _rayMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: RAY_VERT, fragmentShader: RAY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    _rayMat.name = 'devil-death-ray'; _rayMat.userData.shared = true;
    return _rayMat;
}
/** Осколок: рваная глыба (икосаэдр со сдвинутыми вершинами), корка тёмная, сколы и трещины светятся золотом (цвет в вершинах, без света). */
function shardGeo() {
    if (_shardGeo) return _shardGeo;
    let g = new THREE.IcosahedronGeometry(0.5, 1); if (g.index) g = g.toNonIndexed();
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    const h = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };
    const key = (x, y, z) => Math.round(x * 100) * 7 + Math.round(y * 100) * 131 + Math.round(z * 100) * 1009;
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = key(x, y, z), j = 0.65 + 0.6 * h(k);
        P.setXYZ(i, x * j * (1 + 0.3 * h(k + 3)), y * j * 0.75, z * j);
    }
    for (let f = 0; f < P.count; f += 3) { // по граням: тёмная обожжённая кожа / раскалённый скол / белый свет из трещины
        const r = h(f * 3.7 + 1);
        const c = r < 0.45 ? [0.16 + 0.08 * h(f), 0.05, 0.035] : r < 0.8 ? [1.0, 0.55 + 0.25 * h(f + 2), 0.16] : [1.0, 0.95, 0.78];
        for (let v = 0; v < 3; v++) { col[(f + v) * 3] = c[0]; col[(f + v) * 3 + 1] = c[1]; col[(f + v) * 3 + 2] = c[2]; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.deleteAttribute('uv');
    _shardGeo = g; _shardGeo.userData.keep = true;
    return g;
}
function shardMat() {
    if (_shardMat) return _shardMat;
    _shardMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    _shardMat.name = 'devil-death-shard'; _shardMat.userData.shared = true;
    return _shardMat;
}
function ringGeo() { if (!_ringGeo) { _ringGeo = new THREE.RingGeometry(0.82, 1, 96, 1); _ringGeo.rotateX(-Math.PI / 2); _ringGeo.userData.keep = true; } return _ringGeo; }
function ringMat() {
    if (_ringMat) return _ringMat;
    _ringMat = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uT: { value: 0 } }, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    _ringMat.name = 'devil-death-ring';
    return _ringMat;
}
function domeGeo() { if (!_domeGeo) { _domeGeo = new THREE.SphereGeometry(1, 40, 20); _domeGeo.userData.keep = true; } return _domeGeo; }
function domeMat() {
    if (_domeMat) return _domeMat;
    _domeMat = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 } }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    _domeMat.name = 'devil-death-dome'; _domeMat.userData.shared = true;
    return _domeMat;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };

/** Детерминированный шум (одинаково у всех компьютеров — по сиду смерти). */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

export class DevilDeathFx {
    constructor(game) { this.game = game; this.on = false; }

    /** Начало (миг пронзания): `at` — центр тела, `floor` — пол, `seed` — один на всех. */
    start(at, floor, seed = 1) {
        const g = this.game;
        this.stop();
        this.on = true; this.t = 0; this.floor = floor; this.at = at.clone(); this.R = rng(seed);
        this.rays = new THREE.InstancedMesh(rayGeo(), rayMat(), DEATH_FX.RAYS);
        const k = new Float32Array(DEATH_FX.RAYS);
        this.rays.geometry = rayGeo().clone(); this.rays.geometry.setAttribute('aK', new THREE.InstancedBufferAttribute(k, 1)); // (своя копия только атрибута силы — формы общие)
        this.rays.frustumCulled = false; this.rays.renderOrder = 5; this.rays.count = 0;
        this.rayK = k;
        this.rayInfo = [];
        for (let i = 0; i < DEATH_FX.RAYS; i++) {
            const R = this.R, dir = new THREE.Vector3(R() * 2 - 1, R() * 1.4 - 0.25, R() * 2 - 1).normalize();
            this.rayInfo.push({ cap: Math.floor(R() * 1e6), t: R(), dir, born: 1 + (i / DEATH_FX.RAYS) * 11 + R() * 0.6, w: R(), len: 0.6 + R() * 0.4 });
        }
        this.shards = new THREE.InstancedMesh(shardGeo(), shardMat(), DEATH_FX.SHARDS);
        this.shards.frustumCulled = false; this.shards.count = DEATH_FX.SHARDS;
        this.shard = [];
        for (let i = 0; i < DEATH_FX.SHARDS; i++) { this.shard.push({ live: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), s: 1, life: 0, bounced: false }); this.shards.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
        this.rings = [];
        for (let i = 0; i < DEATH_FX.RINGS; i++) { const m = new THREE.Mesh(ringGeo(), i ? ringMat().clone() : ringMat()); m.visible = false; m.frustumCulled = false; m.renderOrder = 4; this.rings.push({ m, t: -1 }); g.scene?.add(m); }
        this.dome = new THREE.Mesh(domeGeo(), domeMat()); this.dome.visible = false; this.dome.frustumCulled = false; this.dome.renderOrder = 6;
        g.scene?.add(this.rays, this.shards, this.dome);
        this._flash = 0; this._flashUp = false;
    }

    /** Кольцо света по земле (от `at`, на полу). */
    ring(at) { const r = this.rings?.find((x) => x.t < 0) || this.rings?.[0]; if (!r) return; r.t = 0; r.m.position.set(at.x, this.floor + 0.6, at.z); r.m.visible = true; }
    /** Разлёт кусков: n штук с поверхности тела (body — DevilBody или null: тогда из центра), сила k 0…1. */
    burst(body, n, k = 1) {
        const R = this.R;
        for (let j = 0; j < n; j++) {
            const S = this.shard.find((x) => !x.live);
            if (!S) return;
            const o = this._surface(body, Math.floor(R() * 1e6), R(), _p);
            const out = _s.copy(o).sub(this.at).setY(0);
            if (out.lengthSq() < 1e-4) out.set(R() - 0.5, 0, R() - 0.5);
            out.normalize();
            const sp = DEATH_FX.SHARD_V[0] + (DEATH_FX.SHARD_V[1] - DEATH_FX.SHARD_V[0]) * R() * k;
            S.live = true; S.p.copy(o); S.v.set(out.x * sp, 15 + R() * 45 * k, out.z * sp);
            S.rot.set(R() * 6, R() * 6, R() * 6); S.spin.set(R() * 8 - 4, R() * 8 - 4, R() * 8 - 4);
            S.s = DEATH_FX.SHARD[0] + (DEATH_FX.SHARD[1] - DEATH_FX.SHARD[0]) * R(); S.life = 0; S.bounced = false;
        }
    }
    /** Купол-вспышка и белый экран (у всех ближе 400 м). */
    flash() { this.domeT = 0; this.dome.position.copy(this.at); this.dome.visible = true; this._flashUp = true; }

    _surface(body, ci, t, out) {
        if (!body?.on) return out.copy(this.at).add(_s.set(this.R() * 40 - 20, this.R() * 60 - 30, this.R() * 40 - 20));
        const c = body.capsule(ci % body.n, _cap);
        out.copy(c.a).lerp(c.b, t);
        const n = _s.set(this.R() * 2 - 1, this.R() * 2 - 1, this.R() * 2 - 1).normalize();
        return out.addScaledVector(n, c.r * 0.9);
    }

    /** Кадр: `t` — время смерти (DEATH), `body` — его тело (лучи из кожи), `me` — где я (экран). */
    update(dt, t, body, me) {
        if (!this.on) return;
        this.t = t;
        const g = this.game, F = DEATH_FX;
        rayMat().uniforms.uT.value = t;
        // лучи из трещин: рождаются по одному, растут; к распаду — длинные и яркие; гаснут вместе с пеплом
        let n = 0;
        const fade = t < 15 ? 1 : Math.max(0, 1 - (t - 15) / 4.5);
        for (let i = 0; i < F.RAYS; i++) {
            const I = this.rayInfo[i], age = t - I.born;
            if (age <= 0 || fade <= 0) continue;
            const grow = Math.min(1, age / 2.5), boost = t > 14 ? 1.6 : 1;
            const len = (F.RAY_LEN[0] + (F.RAY_LEN[1] - F.RAY_LEN[0]) * Math.min(1, t / 14)) * I.len * grow * boost;
            const w = (F.RAY_W[0] + (F.RAY_W[1] - F.RAY_W[0]) * I.w) * (0.5 + 0.5 * grow) * boost;
            if (body?.on || !I.o) I.o = this._surface(body, I.cap, I.t, I.o || new THREE.Vector3()).clone();
            _q.setFromUnitVectors(_y, I.dir);
            _m.compose(I.o, _q, _s.set(w, len, w));
            this.rays.setMatrixAt(n, _m);
            this.rayK[n] = Math.min(1, grow * 1.2) * fade * (0.7 + 0.3 * Math.sin(t * 7 + i));
            n++;
        }
        this.rays.count = n;
        this.rays.instanceMatrix.needsUpdate = true;
        this.rays.geometry.getAttribute('aK').needsUpdate = true;
        // осколки: полёт, удар о пол (один отскок), тлеют и тают
        for (let i = 0; i < F.SHARDS; i++) {
            const S = this.shard[i];
            if (!S.live) continue;
            S.life += dt;
            S.v.y -= F.GRAV * dt;
            S.p.addScaledVector(S.v, dt);
            if (S.p.y < this.floor + S.s * 0.35) {
                S.p.y = this.floor + S.s * 0.35;
                if (!S.bounced && S.v.y < -6) { S.v.y *= -0.32; S.v.x *= 0.5; S.v.z *= 0.5; S.bounced = true; S.spin.multiplyScalar(0.5); if (Math.random() < 0.3) g.fx?.spark?.(S.p, 0xffe0a0, 0.6, _s.set(0, 6, 0), 0.8); }
                else { S.v.set(0, 0, 0); S.spin.set(0, 0, 0); }
            }
            S.rot.x += S.spin.x * dt; S.rot.y += S.spin.y * dt; S.rot.z += S.spin.z * dt;
            const k = S.life < 6 ? 1 : Math.max(0, 1 - (S.life - 6) / 3);
            if (k <= 0) { S.live = false; this.shards.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
            _q.setFromEuler(_e.copy(S.rot));
            _m.compose(S.p, _q, _s.setScalar(S.s * k));
            this.shards.setMatrixAt(i, _m);
            if (S.v.lengthSq() > 100 && Math.random() < dt * 8) g.fx?.spark?.(S.p, 0xffc070, 0.35, _s.set(0, 1, 0), 0.7); // (след искр за летящим куском)
        }
        this.shards.instanceMatrix.needsUpdate = true;
        // кольца по земле
        for (const r of this.rings) {
            if (r.t < 0) continue;
            r.t += dt;
            const k = r.t / F.RING_T;
            if (k >= 1) { r.t = -1; r.m.visible = false; continue; }
            const rad = F.RING_R * (1 - Math.pow(1 - k, 2.2));
            r.m.scale.set(rad, 1, rad);
            r.m.material.uniforms.uK.value = (1 - k) * 1.4; r.m.material.uniforms.uT.value = t;
        }
        // купол-вспышка
        if (this.domeT != null) {
            this.domeT += dt;
            const k = this.domeT / F.DOME_T;
            if (k >= 1) { this.dome.visible = false; this.domeT = null; }
            else { this.dome.scale.setScalar(8 + F.DOME_R * (1 - Math.pow(1 - k, 3))); domeMat().uniforms.uK.value = (1 - k) * (1 - k) * 1.3; }
        }
        // фонтан искр на сотни метров — в распад
        if (t > 13.6 && t < 17.5 && g.fx?.glow) {
            const m = Math.min(F.SPARK_MAX, Math.ceil(dt * 900));
            for (let i = 0; i < m; i++) {
                const a = Math.random() * 6.283, up = 50 + Math.random() * 90, side = 10 + Math.random() * 45;
                g.fx.glow.spawn(this.at.x + Math.cos(a) * 8, this.at.y - 20 + Math.random() * 60, this.at.z + Math.sin(a) * 8, Math.cos(a) * side, up, Math.sin(a) * side, Math.random() < 0.6 ? 0xfff6dc : 0xffc860, 2 + Math.random() * 3.5, 3.5 + Math.random() * 2, { shrink: -0.3, spin: 1 });
            }
        }
        // белый экран: у всех ближе 400 м
        if (this._flashUp) {
            const near = me ? Math.hypot(me.x - this.at.x, me.z - this.at.z) < F.FLASH_R : false;
            this._flash = near ? Math.min(F.FLASH_MAX, this._flash + dt * F.FLASH_MAX / F.FLASH_UP) : 0;
            if (this._flash >= F.FLASH_MAX || !near) this._flashUp = false;
        } else this._flash = Math.max(0, this._flash - dt * F.FLASH_MAX / F.FLASH_DOWN);
        this._screen(this._flash);
    }

    _screen(k) {
        if (typeof document === 'undefined') return;
        if (!this._div && k <= 0) return;
        if (!this._div) {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;background:radial-gradient(circle at 50% 45%, #ffffff 0%, #fff8e6 55%, #ffe9b8 100%);opacity:0;';
            document.body.appendChild(d);
            this._div = d;
        }
        this._div.style.opacity = k.toFixed(3);
    }

    stop() {
        const g = this.game;
        if (this.rays) { g.scene?.remove(this.rays); this.rays.geometry.dispose(); this.rays = null; } // (своя копия формы — с атрибутом силы; общая не трогается)
        if (this.shards) { g.scene?.remove(this.shards); this.shards = null; }
        if (this.dome) { g.scene?.remove(this.dome); this.dome = null; }
        for (const r of this.rings || []) { g.scene?.remove(r.m); if (r.m.material !== _ringMat) r.m.material.dispose(); }
        this.rings = null; this.domeT = null;
        if (this._div) { this._div.remove(); this._div = null; }
        this.on = false;
    }

    /** (Game.prewarm) Образцы: луч, осколок, кольцо, купол — программы собираются на загрузке. */
    static samples() {
        const r = new THREE.InstancedMesh(rayGeo().clone(), rayMat(), 1);
        r.geometry.setAttribute('aK', new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
        return [r, new THREE.InstancedMesh(shardGeo(), shardMat(), 1), new THREE.Mesh(ringGeo(), ringMat()), new THREE.Mesh(domeGeo(), domeMat())];
    }
}
