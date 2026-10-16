/**
 * DoomView.js — «Planet Liquidation» seen from space (SpaceView's scene): the great beam of magic from the caster to
 * the planet, the planet cracking (its red-hot core through the cracks — PLANET_FS uDoom), shaking and swelling, then
 * the blast — a white flash, a ball of fire, two rings of the shock wave, hundreds of red-hot rocks flying apart,
 * and the new meteor cluster of its rocks spreading out and cooling (scatter). Also the gods' golden shield flashing
 * on the Earth or Venus when the spell is tried on them.
 *
 * Every step from the shared clock (def.doomAt — PlanetDoom.DOOM): the same picture on every computer, also after
 * the host took the planet out of the registry (its last orbit kept here: `recs`).
 *
 * For the frame rate (CLAUDE.md): a fixed set of meshes made once (one beam, one fire ball, two rings, two flash
 * sprites, one instanced cloud of rocks, one shield) on the shared geometries of SpaceView, compiled with the rest
 * on the loading screen (compileShow); hidden when nothing happens; no lights (each shader lights itself).
 */
import * as THREE from 'three';
import { planetPosition } from './Planets.js';
import { DOOM, doomAge, doomable } from './PlanetDoom.js';

const BEAM_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the beam: brightest down its middle as seen, flowing pulses towards the planet, its tip coming on
const BEAM_FS = /* glsl */ `
uniform vec3 uCol; uniform float uK; uniform float uTime; uniform float uTip;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
    if (vUv.y > uTip) discard;
    float c = abs(dot(normalize(vN), normalize(-vW)));
    float core = pow(c, 1.6);
    float flow = 0.65 + 0.35 * sin(vUv.y * 60.0 - uTime * 26.0) * sin(vUv.x * 18.85 + uTime * 3.0);
    float tip = 1.0 + 2.5 * smoothstep(uTip - 0.04, uTip, vUv.y);
    gl_FragColor = vec4(uCol * core * flow * tip * uK, 1.0);
}`;
const SHELL_VS = /* glsl */ `
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() { vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the fire ball of the blast (k: 0 → 1 over its life): white-hot, then orange, then dark red smoke-glow, boiling
const FIRE_FS = /* glsl */ `
uniform float uK; uniform float uTime;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
float h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
    float c = abs(dot(normalize(vN), normalize(-vW)));
    float boil = n3(vObj * 4.0 + uTime * 0.8) * 0.6 + n3(vObj * 11.0 - uTime * 1.3) * 0.4;
    vec3 hot = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.45, 0.08), smoothstep(0.0, 0.35, uK));
    hot = mix(hot, vec3(0.45, 0.06, 0.02), smoothstep(0.35, 1.0, uK));
    float body = pow(c, 0.7) * (0.55 + 0.9 * boil);
    float fade = (1.0 - smoothstep(0.55, 1.0, uK));
    gl_FragColor = vec4(hot * body * fade * 1.4, 1.0);
}`;
// the gods' golden shield: a golden skin round the planet, bright at its edge, a lattice of light running over it
const SHIELD_FS = /* glsl */ `
uniform float uK; uniform float uTime;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() {
    float c = abs(dot(normalize(vN), normalize(-vW)));
    float rim = pow(1.0 - c, 2.2);
    vec3 d = normalize(vObj);
    float lat = abs(sin(d.y * 18.0)) , lon = abs(sin(atan(d.x, d.z) * 12.0));
    float grid = (1.0 - smoothstep(0.0, 0.08, min(lat, lon))) * (0.5 + 0.5 * sin(uTime * 7.0 - d.y * 9.0));
    gl_FragColor = vec4(vec3(1.0, 0.8, 0.3) * (rim * 1.6 + grid * 0.5 + 0.06) * uK, 1.0);
}`;
const RINGW_VS = /* glsl */ `
varying vec3 vL;
void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// a ring of the shock wave: a bright band at its edge, a faint haze inside it
const RINGW_FS = /* glsl */ `
uniform vec3 uCol; uniform float uK;
varying vec3 vL;
void main() {
    float r = length(vL.xy);
    float band = smoothstep(0.78, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
    float haze = 0.12 * smoothstep(0.2, 0.9, r);
    gl_FragColor = vec4(uCol * (band * 1.5 + haze) * uK, 1.0);
}`;
const FRAG_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() { mat4 m = modelMatrix * instanceMatrix; vN = normalize(mat3(m) * normal); vec4 w = m * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the flying rocks: lit by the Sun, glowing red-hot as they fly (uHeat), cooling to dark rock
const FRAG_FS = /* glsl */ `
uniform vec3 uSun; uniform float uHeat;
varying vec3 vN; varying vec3 vW;
void main() {
    float l = max(dot(normalize(vN), normalize(uSun - vW)), 0.0);
    vec3 rock = vec3(0.42, 0.36, 0.32) * (0.08 + l);
    vec3 glow = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.75, 0.35), uHeat * uHeat);
    gl_FragColor = vec4(rock + glow * uHeat * 1.3, 1.0);
}`;

const FRAGS = 160; // rocks flying apart (one blast at a time — the newest)
const BEAM_COL = new THREE.Color(0xff3d8b), BEAM_CORE = new THREE.Color(0xfff0f6);
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const hash01 = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const _p = { x: 0, y: 0, z: 0 }, _f = { x: 0, y: 0, z: 0 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _hot = new THREE.Color(0xff5a1a);

export class DoomView {
    /** @param {import('./SpaceView.js').SpaceView} view */
    constructor(view, glowTex) {
        this.view = view;
        this.planets = view.planets;
        this.recs = new Map(); // planet id -> {def (its last orbit), at}
        this.shield = null; // {id, t0}: the gods' golden shield flashing (PlanetDestroy: a refusal)
        const root = view.root;
        const add = (o) => { o.visible = false; o.frustumCulled = false; root.add(o); return o; };
        // the beam: two cones (the glow, the white core), base at y = 0, the planet's end at y = 1
        const cg = new THREE.CylinderGeometry(1, 0.04, 1, 24, 1, true);
        cg.translate(0, 0.5, 0);
        this.beamGeo = cg;
        const beamMat = (col) => new THREE.ShaderMaterial({ uniforms: { uCol: { value: col.clone() }, uK: { value: 1 }, uTime: { value: 0 }, uTip: { value: 1 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        this.beam = add(new THREE.Group());
        this.beamOuter = new THREE.Mesh(cg, beamMat(BEAM_COL));
        this.beamCore = new THREE.Mesh(cg, beamMat(BEAM_CORE));
        this.beamOuter.frustumCulled = this.beamCore.frustumCulled = false;
        this.beam.add(this.beamOuter, this.beamCore);
        this.beam.renderOrder = 3;
        // the fire ball, the shield (on SpaceView's sphere)
        this.fireU = { uK: { value: 0 }, uTime: { value: 0 } };
        this.fire = add(new THREE.Mesh(view.geoLo, new THREE.ShaderMaterial({ uniforms: this.fireU, vertexShader: SHELL_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        this.shieldU = { uK: { value: 0 }, uTime: { value: 0 } };
        this.shieldMesh = add(new THREE.Mesh(view.geoLo, new THREE.ShaderMaterial({ uniforms: this.shieldU, vertexShader: SHELL_VS, fragmentShader: SHIELD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
        // two rings of the shock wave (one in the plane of its orbit, one tilted)
        this.ringGeo = new THREE.RingGeometry(0.02, 1, 128, 1);
        this.rings = [0xffd2a0, 0xbfd8ff].map((c) => add(new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(c) }, uK: { value: 0 } }, vertexShader: RINGW_VS, fragmentShader: RINGW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))));
        // the flash (and the light where the beam strikes)
        this.flashes = [0, 1, 2].map(() => add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }))));
        for (const s of this.flashes) s.renderOrder = 4;
        // the rocks flying apart
        this.fragU = { uSun: { value: new THREE.Vector3() }, uHeat: { value: 1 } };
        this.frags = add(new THREE.InstancedMesh(view.rockGeo, new THREE.ShaderMaterial({ uniforms: this.fragU, vertexShader: FRAG_VS, fragmentShader: FRAG_FS }), FRAGS));
        this.time = 0;
    }

    /** The planets dying now (from the registry), kept after they are gone from it until their blast is over. */
    _track(t) {
        for (const def of this.planets.list) {
            if (!def.doomAt || !doomable(def)) continue;
            const r = this.recs.get(def.id);
            if (!r || r.at !== def.doomAt) this.recs.set(def.id, { id: def.id, at: def.doomAt, def: { ...def }, from: def.doomFrom });
            else r.def = { ...def }; // (its orbit as it goes — the copy is what is left after it is gone)
        }
        for (const [id, r] of this.recs) if (t - r.at > DOOM.T + DOOM.AFTER + 2 || t < r.at - 5) this.recs.delete(id);
    }

    /**
     * SpaceView.update for each body: a dying planet cracks (uDoom), shakes, swells; gone at the blast.
     * Returns how much bigger it is drawn (×).
     */
    body(b, def, t) {
        const a = doomAge(def, t);
        if (a < 0) { if (b.u.uDoom && b.u.uDoom.value) b.u.uDoom.value = 0; return 1; }
        if (a >= DOOM.T) { b.group.visible = false; return 1; } // (the blast: no planet any more — the host takes it away)
        const k = smooth((a - DOOM.CRACK0) / (DOOM.T - DOOM.CRACK0));
        if (b.u.uDoom) b.u.uDoom.value = Math.max(1e-4, k);
        // shaking harder and harder, swelling — the last half second it bulges out
        const R = def.radius, sh = R * (0.002 + 0.012 * k * k);
        b.group.position.x += (Math.random() - 0.5) * sh; b.group.position.y += (Math.random() - 0.5) * sh; b.group.position.z += (Math.random() - 0.5) * sh;
        return 1 + 0.1 * k * k * k + 0.18 * smooth((a - (DOOM.T - 0.6)) / 0.6);
    }

    /**
     * The debris cluster of a blown-up planet, `a` s after the blast: its rocks fly out from the middle and slow down
     * into the heap, red-hot, cooling (the rocks' places from base9 — SpaceView._addCluster).
     */
    scatter(c, m, a) {
        const B = m.userData.base9;
        if (!B) return;
        const done = a >= DOOM.AFTER;
        if (done && m.userData.scattered) return;
        m.userData.scattered = done;
        const k = done ? 1 : (1 - Math.exp(-a * 0.55)) / (1 - Math.exp(-DOOM.AFTER * 0.55));
        for (let i = 0; i < c.count; i++) {
            const j = i * 9;
            _a.set(B[j] * k, B[j + 1] * k, B[j + 2] * k);
            _e.set(B[j + 3] + (done ? 0 : a * (1 + hash01(i, 3))), B[j + 4], B[j + 5]);
            _s.set(B[j + 6], B[j + 7], B[j + 8]);
            m.setMatrixAt(i, _m.compose(_a, _q.setFromEuler(_e), _s));
        }
        m.instanceMatrix.needsUpdate = true;
        const u = m.material.uniforms.uCol.value, base = m.userData.base ?? (m.userData.base = u.getHex());
        u.setHex(base).lerp(_hot, done ? 0 : 1 - smooth(a / (DOOM.AFTER * 0.8)));
    }

    /** The gods' golden shield on a protected body (PlanetDestroy: the spell tried on it). */
    flashShield(id, t) { this.shield = { id, t0: t }; }

    /** Every frame, after the bodies (SpaceView.update): the beam, the blast, the shield. cam: the camera in space. */
    update(t, cam, sunRel) {
        this.time = t;
        this._track(t);
        // the newest planet still dying or blowing up
        let rec = null;
        for (const r of this.recs.values()) if (!rec || r.at > rec.at) rec = r;
        const a = rec ? t - rec.at : -1;
        let beamOn = false, fireOn = false, ringsOn = false, fragsOn = false, fl = 0;
        if (rec && a >= 0) {
            planetPosition(rec.def, t, _p, this.planets);
            const px = _p.x - cam.x, py = _p.y - cam.y, pz = _p.z - cam.z, R = rec.def.radius;
            const dCam = Math.hypot(px, py, pz);
            // the beam: from the caster to the planet, its tip flying out over 0.7 s; it burns until BEAM, then fades
            if (a < DOOM.BEAM + 0.9 && rec.from) {
                const fx = rec.from[0] - cam.x, fy = rec.from[1] - cam.y, fz = rec.from[2] - cam.z;
                _b.set(px - fx, py - fy, pz - fz);
                const len = _b.length();
                if (len > R * 1.05) {
                    _b.divideScalar(len);
                    const start = Math.min(60, len * 0.1), L = len - start - R * 0.85;
                    this.beam.position.set(fx + _b.x * start, fy + _b.y * start, fz + _b.z * start);
                    this.beam.quaternion.setFromUnitVectors(_up, _b);
                    const w = Math.max(R * 0.16, 30);
                    this.beamOuter.scale.set(w, L, w);
                    this.beamCore.scale.set(w * 0.35, L, w * 0.35);
                    const tip = smooth(a / 0.7), k = 1 - smooth((a - DOOM.BEAM) / 0.9);
                    for (const mesh of [this.beamOuter, this.beamCore]) { const u = mesh.material.uniforms; u.uTip.value = Math.max(0.001, tip); u.uK.value = k * (0.9 + 0.1 * Math.sin(t * 40)); u.uTime.value = t; }
                    beamOn = true;
                    // the light where it strikes (seen from anywhere: a few dozen pixels at least)
                    if (tip > 0.98) { this._flash(0, px - _b.x * R, py - _b.y * R, pz - _b.z * R, Math.max(R * 3.2, dCam * 0.05), 0xff5aa0, k * (1 + 0.3 * Math.sin(t * 23))); fl = 1; }
                }
            }
            // the cracking planet's own red glow growing (seen from far too)
            if (a < DOOM.T && a > DOOM.CRACK0) { const k = smooth((a - DOOM.CRACK0) / (DOOM.T - DOOM.CRACK0)); this._flash(fl++, px, py, pz, Math.max(R * (2.5 + 2 * k), dCam * 0.04), 0xff4a10, 0.25 + 0.9 * k * k); }
            // the blast
            const b = a - DOOM.T;
            if (b >= 0 && b < DOOM.AFTER) {
                const fk = Math.exp(-b * 2.2);
                this._flash(fl++, px, py, pz, Math.max(R * 34 * (0.6 + 0.4 * fk), dCam * 0.3 * fk), 0xffffff, 2.2 * fk);
                if (fl < this.flashes.length) this._flash(fl++, px, py, pz, Math.max(R * 9, dCam * 0.08), 0xffb060, 1.4 * Math.exp(-b * 0.6));
                // the fire ball
                const k = Math.min(1, b / 4.5);
                if (k < 1) { this.fire.position.set(px, py, pz); this.fire.scale.setScalar(R * (1 + 2.8 * Math.pow(k, 0.5))); this.fireU.uK.value = k; this.fireU.uTime.value = t; fireOn = true; }
                // the rings of the shock wave
                const rk = Math.min(1, b / 8);
                if (rk < 1) {
                    const tilt = 0.35 + hash01(rec.at | 0, 5) * 0.6;
                    this.rings.forEach((m, i) => {
                        m.position.set(px, py, pz);
                        m.rotation.set(-Math.PI / 2 + (i ? tilt : 0.05), i ? tilt * 1.7 : 0, 0);
                        m.scale.setScalar(R * (1.2 + (i ? 10 : 16) * Math.pow(rk, 0.55)));
                        m.material.uniforms.uK.value = Math.pow(1 - rk, 1.4) * (i ? 0.7 : 1.1);
                    });
                    ringsOn = true;
                }
                // the rocks flying apart
                this._frags(rec, b, px, py, pz, R);
                this.fragU.uSun.value.copy(sunRel);
                fragsOn = true;
            }
        }
        this.beam.visible = beamOn;
        this.fire.visible = fireOn;
        for (const m of this.rings) m.visible = ringsOn;
        this.frags.visible = fragsOn;
        for (let i = fl; i < this.flashes.length; i++) this.flashes[i].visible = false;
        // the gods' shield
        const s = this.shield, sa = s ? t - s.t0 : -1;
        const sd = s && sa >= 0 && sa < 2.6 ? this.planets.get(s.id) : null;
        if (sd) {
            planetPosition(sd, t, _f, this.planets);
            this.shieldMesh.position.set(_f.x - cam.x, _f.y - cam.y, _f.z - cam.z);
            this.shieldMesh.scale.setScalar(sd.radius * (1.1 + 0.03 * Math.sin(sa * 9)));
            this.shieldU.uK.value = smooth(sa / 0.25) * (1 - smooth((sa - 1.6) / 1)) * 1.2;
            this.shieldU.uTime.value = t;
            this.shieldMesh.visible = true;
        } else { this.shieldMesh.visible = false; if (s && sa > 3) this.shield = null; }
    }

    _flash(i, x, y, z, size, color, k) {
        const s = this.flashes[i];
        if (!s) return;
        s.visible = k > 0.01;
        if (!s.visible) return;
        s.position.set(x, y, z);
        s.scale.setScalar(size);
        s.material.color.setHex(color).multiplyScalar(Math.min(2.2, k));
    }

    /** The rocks of the blast `b` s after it: out from the planet's middle fast, slowing down, tumbling, cooling. */
    _frags(rec, b, px, py, pz, R) {
        const m = this.frags, seed = rec.at | 0;
        const tau = 2.6, go = 1 - Math.exp(-b / tau), fade = 1 - smooth((b - DOOM.AFTER * 0.7) / (DOOM.AFTER * 0.3));
        for (let i = 0; i < FRAGS; i++) {
            const h1 = hash01(i, seed), h2 = hash01(i, seed + 7), h3 = hash01(i, seed + 13);
            const th = h1 * Math.PI * 2, u = h2 * 2 - 1, w = Math.sqrt(1 - u * u);
            const v = R * (1.0 + 3.2 * h3) * tau; // (how far it flies: 1…4 radii past the ground)
            const d = R * 0.6 + v * go;
            _a.set(px + Math.cos(th) * w * d, py + u * d * 0.8, pz + Math.sin(th) * w * d);
            _e.set(h1 * 6 + b * (0.5 + h2 * 2), h2 * 6 + b * h3, h3 * 6);
            const sz = R * (0.015 + 0.06 * Math.pow(hash01(i, seed + 21), 2.2)) * fade + 1e-3;
            _s.set(sz, sz * (0.6 + 0.4 * h2), sz * (0.7 + 0.3 * h1));
            m.setMatrixAt(i, _m.compose(_a, _q.setFromEuler(_e), _s));
        }
        m.instanceMatrix.needsUpdate = true;
        this.fragU.uHeat.value = 1 - smooth(b / (DOOM.AFTER * 0.75));
    }

    /** SpaceView.compile: everything shown once (its shaders compiled on the loading screen), then hidden again. */
    compileShow(on) {
        const list = [this.beam, this.fire, this.shieldMesh, this.frags, ...this.rings, ...this.flashes];
        for (const o of list) { o.visible = on; if (on) o.position.set(0, 0, -800); }
        if (on) { this.beamOuter.scale.set(10, 100, 10); this.beamCore.scale.set(4, 100, 4); }
    }

    dispose() {
        this.beamGeo.dispose(); this.ringGeo.dispose();
    }
}

