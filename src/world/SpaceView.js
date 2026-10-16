/**
 * SpaceView.js — what space looks like: the stars and the Milky Way, the Sun, the planets with their
 * atmospheres, the Earth's clouds, Saturn's and Uranus' rings, the orbits, the asteroid belt and the
 * Kuiper belt with their meteor clusters. Its own scene, drawn first (Space.render), the game's own
 * scene over it (the hero's hands, the other players, the spells).
 *
 * For the frame rate (CLAUDE.md): every material here is made once and compiled on the loading screen
 * (compile()); no lights at all (each shader lights itself from the Sun's position); spheres share two
 * geometries (near / far); the maps come from space.worker.js; the scene is drawn round the camera
 * (floating origin: everything is placed relative to it each frame — no wobble 400 km out).
 */
import * as THREE from 'three';
import { planetPosition, spinAt, SPACE, BELTS } from './Planets.js';

const GLSL_NOISE = /* glsl */ `
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.02; a *= 0.5; } return v; }
`;

const PLANET_VS = /* glsl */ `
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() {
    vObj = normalize(position);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PLANET_FS = /* glsl */ `
uniform sampler2D map; uniform vec3 uSun; uniform vec3 uAtmo; uniform float uAtmoK; uniform float uAmb; uniform float uSpec; uniform float uHeat;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() {
    vec3 d = normalize(vObj);
    float lon = atan(d.x, d.z), lat = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927);
    // (no seam where the longitude wraps: the second u, wrapped the other way, where its change is smaller)
    vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dx = dFdx(uv), dy = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
    vec3 tex = (abs(dx.x) + abs(dy.x) > abs(dx2.x) + abs(dy2.x) + 1e-6) ? textureGrad(map, uv2, dx2, dy2).rgb : textureGrad(map, uv, dx, dy).rgb;
    vec3 n = normalize(vN);
    vec3 L = normalize(uSun - vW);
    vec3 V = normalize(-vW);
    float lam = dot(n, L);
    float lit = smoothstep(-0.08, 0.25, lam) * (0.35 + 0.65 * max(lam, 0.0));
    vec3 col = tex * (uAmb + lit * 1.15);
    // the oceans shine (the Earth): a sun glint where the map is blue
    float water = smoothstep(0.08, 0.25, tex.b - max(tex.r, tex.g)) * uSpec;
    col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-L, n), V), 0.0), 40.0) * water * max(lam, 0.0) * 0.8;
    // the air at the edge, on the day side
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
    col += uAtmo * rim * uAtmoK * smoothstep(-0.2, 0.4, lam);
    // red-hot (a planet just made of meteors — PlanetMagic): it glows by itself, cracks brighter, then cools
    float cr = smoothstep(0.35, 0.75, tex.r + 0.25 * sin(d.x * 40.0 + d.y * 31.0) * sin(d.z * 37.0));
    col = mix(col, mix(vec3(0.75, 0.16, 0.03), vec3(1.0, 0.72, 0.3), cr), clamp(uHeat, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
}`;

const ATMO_FS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uAtmo; uniform float uK; uniform vec3 uCenter; uniform float uRatio;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() {
    vec3 n = normalize(vN), V = normalize(-vW), L = normalize(uSun - vW);
    // how close the line of sight passes to the planet: brightest just over its edge, fading out to the
    // shell's edge; over the disc only a faint tint (a haze, not a ring)
    float c = abs(dot(n, V));
    float s = sqrt(max(0.0, 1.0 - c * c));
    float h = (s - uRatio) / (1.0 - uRatio);
    float glow = h < 0.0 ? 0.25 * exp(h * 4.0) : exp(-h * 4.5) * (1.0 - h);
    float day = smoothstep(-0.35, 0.3, dot(normalize(vW - uCenter), L));
    gl_FragColor = vec4(uAtmo * glow * day * uK, glow * day * uK);
}`;

const CLOUD_FS = /* glsl */ `
uniform vec3 uSun; uniform float uTime; uniform float uK;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${GLSL_NOISE}
void main() {
    vec3 p = normalize(vObj);
    float c = fbm3(p * 3.2 + vec3(uTime * 0.004, 0.0, uTime * 0.002));
    c += 0.5 * fbm3(p * 9.0 - vec3(uTime * 0.006));
    float lat = abs(p.y);
    float a = smoothstep(0.62, 0.95, c + 0.12 * (1.0 - smoothstep(0.0, 0.35, abs(lat - 0.5)))) * uK;
    vec3 n = normalize(vN), L = normalize(uSun - vW);
    float lit = smoothstep(-0.1, 0.3, dot(n, L)) * 0.95 + 0.05;
    gl_FragColor = vec4(vec3(lit), a);
}`;

const RING_VS = /* glsl */ `
varying vec3 vL; varying vec3 vW;
void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const RING_FS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uCenter; uniform float uR; uniform float uIn; uniform float uOut; uniform vec3 uCol; uniform float uAlpha; uniform vec3 uNormal;
varying vec3 vL; varying vec3 vW;
float hash(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
    float r = length(vL.xy);
    float t = (r - uIn) / (uOut - uIn);
    if (t < 0.0 || t > 1.0) discard;
    float b = 0.55 + 0.45 * hash(floor(t * 90.0)) * (0.7 + 0.3 * hash(floor(t * 400.0)));
    float gap = 1.0 - smoothstep(0.0, 0.015, abs(t - 0.64)) ; // (the Cassini division)
    float a = uAlpha * b * (1.0 - gap * 0.92) * smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.94, t);
    vec3 L = normalize(uSun - vW);
    float lit = 0.35 + 0.65 * abs(dot(normalize(uNormal), L));
    // the planet's shadow on the rings
    vec3 toC = uCenter - vW; float along = dot(toC, L);
    float dist = length(toC - L * along);
    float sh = along > 0.0 ? smoothstep(uR * 0.96, uR * 1.04, dist) : 1.0;
    gl_FragColor = vec4(uCol * b * lit * (0.25 + 0.75 * sh), a);
}`;

const SUN_FS = /* glsl */ `
uniform float uTime;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${GLSL_NOISE}
void main() {
    vec3 p = normalize(vObj);
    float g = fbm3(p * 9.0 + vec3(uTime * 0.05)) * 0.7 + fbm3(p * 30.0 - vec3(uTime * 0.08)) * 0.3;
    vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.92, 0.6), smoothstep(0.35, 0.75, g));
    float mu = max(dot(normalize(vN), normalize(-vW)), 0.0);
    col *= 0.55 + 0.6 * pow(mu, 0.45); // (darker at the edge: limb darkening)
    gl_FragColor = vec4(col * 1.25, 1.0);
}`;

const STAR_VS = /* glsl */ `
attribute float aSize; attribute vec3 aCol; varying vec3 vCol; uniform float uK;
void main() { vCol = aCol * uK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize; }`;
const STAR_FS = /* glsl */ `
varying vec3 vCol;
void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(vCol * (1.0 - d * 3.2), 1.0); }`;

const MILKY_FS = /* glsl */ `
uniform float uK; varying vec3 vObj;
${GLSL_NOISE}
float fbmL(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
    vec3 d = normalize(vObj);
    vec3 bandN = normalize(vec3(0.35, 0.82, -0.45));
    float b = dot(d, bandN);
    float band = exp(-b * b / 0.025);
    if (band < 0.01) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } // (off the band: only black — cheap)
    float core = exp(-pow(length(d - normalize(vec3(-0.8, -0.1, -0.55))), 2.0) / 0.2);
    float n = fbmL(d * 6.0) * 0.8 + n3(d * 22.0) * 0.3;
    float dust = smoothstep(0.55, 0.75, fbmL(d * 9.0 + 3.0)) * exp(-b * b / 0.004);
    vec3 col = mix(vec3(0.35, 0.38, 0.55), vec3(0.75, 0.65, 0.5), core) * band * n * (0.5 + core);
    col *= 1.0 - dust * 0.8;
    gl_FragColor = vec4(col * 0.45 * uK, 1.0);
}`;

const ROCK_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vN = normalize(mat3(m) * normal);
    vec4 w = m * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ROCK_FS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uCol;
varying vec3 vN; varying vec3 vW;
void main() { float l = max(dot(normalize(vN), normalize(uSun - vW)), 0.0); gl_FragColor = vec4(uCol * (0.08 + l), 1.0); }`;

const _v = new THREE.Vector3(), _p = { x: 0, y: 0, z: 0 };

/** A soft round glow for the Sun (made once). */
function glowTexture(white = false) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (white) { // (the planet spells' glows: white, tinted by the sprite's colour)
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
        g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.18, 'rgba(255,200,110,0.65)');
        g.addColorStop(0.45, 'rgba(255,150,60,0.18)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    }
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return t;
}

/** The planet spells' times in the view (s): the meteors melt into a ball, it cools; a planet grows; its air comes. */
export const VIEW_FX = { FORM: 5, BIRTH: 10, GROW: 3, TERRA: 8 };
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const _hot = new THREE.Color(0xff6a20);

function colorTex(hex) {
    const t = new THREE.DataTexture(new Uint8Array([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
}

export class SpaceView {
    /** @param {import('./Planets.js').PlanetRegistry} planets */
    constructor(planets) {
        this.planets = planets;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000004);
        this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 2, 4e6);
        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.geoHi = new THREE.SphereGeometry(1, 96, 64);
        this.geoLo = new THREE.SphereGeometry(1, 36, 24);
        this.rockGeo = new THREE.IcosahedronGeometry(1, 0);
        this.time = 0;
        this.bodies = new Map();
        this.k = 1; // how much of space is seen (0 while the sky of a planet with air hides it)
        this._makeSky();
        this._makeSun();
        this._makeBelts();
        this._makeGlows();
        this._sync();
        planets.onChange(() => this._sync());
    }

    _makeSky() {
        const N = 7000, pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3);
        let s = 12345;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < N; i++) {
            // (more stars along the Milky Way's band)
            let x, y, z;
            do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.01);
            const l = Math.hypot(x, y, z);
            const band = Math.abs((x * 0.35 + y * 0.82 - z * 0.45) / l);
            if (band > 0.25 && rnd() < 0.45) { i--; continue; }
            pos.set([(x / l) * 1.5e6, (y / l) * 1.5e6, (z / l) * 1.5e6], i * 3);
            const b = rnd();
            size[i] = b > 0.995 ? 3.6 : b > 0.96 ? 2.4 : b > 0.8 ? 1.7 : 1.15;
            const t = rnd(); // (blue-white, white, yellow, orange)
            const c = t < 0.2 ? [0.75, 0.82, 1] : t < 0.7 ? [1, 1, 1] : t < 0.9 ? [1, 0.93, 0.78] : [1, 0.78, 0.6];
            const br = 0.45 + 0.55 * rnd();
            col.set([c[0] * br, c[1] * br, c[2] * br], i * 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
        this.starU = { uK: { value: 1 } };
        this.stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.starU, vertexShader: STAR_VS, fragmentShader: STAR_FS, depthWrite: false }));
        this.stars.frustumCulled = false;
        this.stars.renderOrder = -9;
        this.milkyU = { uK: { value: 1 } };
        this.milky = new THREE.Mesh(new THREE.SphereGeometry(1.8e6, 48, 24), new THREE.ShaderMaterial({ uniforms: this.milkyU, vertexShader: PLANET_VS, fragmentShader: MILKY_FS, side: THREE.BackSide, depthWrite: false }));
        this.milky.frustumCulled = false;
        this.milky.renderOrder = -10;
        this.scene.add(this.milky, this.stars);
    }

    _makeSun() {
        const def = this.planets.get('sun');
        this.sunU = { uTime: { value: 0 } };
        this.sun = new THREE.Mesh(this.geoHi, new THREE.ShaderMaterial({ uniforms: this.sunU, vertexShader: PLANET_VS, fragmentShader: SUN_FS }));
        this.sun.scale.setScalar(def.radius);
        this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        this.sunGlow.scale.setScalar(def.radius * 7);
        this.root.add(this.sun, this.sunGlow);
    }

    _makeBelts() {
        const mk = (belt, color, seed) => {
            const m = new THREE.InstancedMesh(this.rockGeo, this._rockMat(color), belt.count);
            const o = new THREE.Object3D();
            let s = seed;
            const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
            for (let i = 0; i < belt.count; i++) {
                const a = rnd() * Math.PI * 2, r = belt.inner + (belt.outer - belt.inner) * Math.pow(rnd(), 0.8);
                const sz = belt.size[0] + (belt.size[1] - belt.size[0]) * Math.pow(rnd(), 3);
                o.position.set(Math.cos(a) * r, (rnd() - 0.5) * r * Math.sin(((belt.incl || 2) * Math.PI) / 180) * 2, Math.sin(a) * r);
                o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
                o.scale.set(sz * (0.6 + rnd() * 0.8), sz * (0.5 + rnd() * 0.6), sz * (0.6 + rnd() * 0.8));
                o.updateMatrix();
                m.setMatrixAt(i, o.matrix);
            }
            m.frustumCulled = false;
            this.root.add(m);
            return m;
        };
        this.belt = mk(BELTS.asteroids, 0x8a7d6e, 77);
        this.kuiper = mk(BELTS.kuiper, 0xa9b4c2, 991);
        this.beltPeriod = SPACE.YEAR * Math.pow(2.7, 1.5);
        this.kuiperPeriod = SPACE.YEAR * Math.pow(40, 1.5);
        // the meteor clusters (скопления метеоритов): a dense heap of rocks each
        this.clusterMeshes = new Map();
        for (const c of this.planets.clusters) {
            const m = new THREE.InstancedMesh(this.rockGeo, this._rockMat(c.belt === 'kuiper' ? 0xb8c2cc : 0x9a8a78), c.count);
            const o = new THREE.Object3D();
            let s = c.count * 977 + c.a;
            const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
            for (let i = 0; i < c.count; i++) {
                const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = c.r * Math.cbrt(rnd());
                const q = Math.sqrt(1 - u * u);
                o.position.set(Math.cos(th) * q * rr, u * rr * 0.6, Math.sin(th) * q * rr);
                o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
                const sz = 8 + 34 * Math.pow(rnd(), 2.5);
                o.scale.set(sz, sz * (0.6 + rnd() * 0.5), sz * (0.7 + rnd() * 0.5));
                o.updateMatrix();
                m.setMatrixAt(i, o.matrix);
            }
            m.frustumCulled = false;
            this.root.add(m);
            this.clusterMeshes.set(c.id, m);
            // a soft light over the heap, seen from far (the author: on the map they were, in space not to be
            // found): the same size on the screen however far, fading out close by where the rocks are seen
            const beacon = new THREE.Sprite(this._beaconMat || (this._beaconMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xbfe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
            beacon.userData.cluster = c.id;
            this.root.add(beacon);
            m.userData.beacon = beacon;
        }
    }

    /**
     * The planet spells' light (PlanetMagic.js): a few soft glows (the meteors melting into a ball, a planet
     * growing, its new air, the pearl hold of «Wingardium Leviosa Super Maxima»). Made once, compiled with
     * the rest; each frame they go where an effect is (or hide).
     */
    _makeGlows() {
        const tex = glowTexture(true);
        this.glows = [];
        for (let i = 0; i < 3; i++) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
            s.visible = false;
            s.renderOrder = 2;
            this.root.add(s);
            this.glows.push(s);
        }
        this.fx = { hold: null }; // (PlanetMagic: the planet held now, by anybody: {id})
    }

    _glow(i, x, y, z, size, color, k) {
        const s = this.glows[i];
        if (!s) return;
        s.visible = k > 0.01;
        if (!s.visible) return;
        s.position.set(x, y, z);
        s.scale.setScalar(size);
        s.material.color.setHex(color).multiplyScalar(Math.min(1.6, k));
    }

    /**
     * How big a body is drawn now: its radius, or on its way there — born of meteors (def.born: the
     * shared time), grown by «Enlarge Planet» (def.grownAt, from def.radiusFrom). Also its heat (0..1).
     */
    radiusNow(def, t) {
        this._heat = 0;
        if (def.born && t - def.born < VIEW_FX.BIRTH) {
            const a = t - def.born;
            this._heat = 1 - smooth((a - VIEW_FX.FORM) / (VIEW_FX.BIRTH - VIEW_FX.FORM));
            return def.radius * Math.max(0.04, smooth((a - 1.2) / (VIEW_FX.FORM - 1.2)));
        }
        if (def.grownAt && def.radiusFrom && t - def.grownAt < VIEW_FX.GROW && t >= def.grownAt) {
            const k = smooth((t - def.grownAt) / VIEW_FX.GROW);
            return def.radiusFrom + (def.radius - def.radiusFrom) * k;
        }
        return def.radius;
    }

    _rockMat(color) {
        this._rockMats = this._rockMats || [];
        const m = new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color(color) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
        this._rockMats.push(m);
        return m;
    }

    /** Make / update the meshes of every body after the registry changed. */
    _sync() {
        const seen = new Set();
        for (const def of this.planets.list) {
            if (def.kind === 'star') continue;
            seen.add(def.id);
            let b = this.bodies.get(def.id);
            // (its air came or went — «Terraform Planet»: the body made again with it, its map kept)
            if (b && (b.atmoCol ?? null) !== (def.atmosphere ?? def.clouds ?? null)) {
                const map = b.u.map.value;
                this.root.remove(b.group, b.orbit);
                b.orbit?.geometry.dispose();
                this.bodies.delete(def.id);
                b = this._makeBody(def);
                b.u.map.value.dispose?.();
                b.u.map.value = map;
                this.bodies.set(def.id, b);
            }
            if (!b) { b = this._makeBody(def); this.bodies.set(def.id, b); }
            b.def = def;
            b.group.scale.setScalar(def.radius);
            if (b.ru) b.ru.uR.value = def.radius; // (rings round a planet grown bigger)
            b.tilt.rotation.z = (def.kind === 'gas' ? def.tilt || 0 : 0) * Math.PI / 180; // (rocky bodies: their surface frame stays upright — Planets.js)
            this._orbitLine(b, def);
        }
        for (const [id, b] of this.bodies) if (!seen.has(id)) { this.root.remove(b.group, b.orbit); this.bodies.delete(id); }
        for (const [id, m] of this.clusterMeshes) { const c = this.planets.cluster(id); m.visible = !c?.used || !!c.usedAt; }
    }

    _makeBody(def) {
        const group = new THREE.Group(), tilt = new THREE.Group();
        group.add(tilt);
        const u = {
            map: { value: colorTex(def.color) }, uSun: { value: new THREE.Vector3() }, uAtmo: { value: new THREE.Color(def.atmosphere ?? def.clouds ?? 0x000000) },
            uAtmoK: { value: def.atmosphere || def.clouds ? 0.55 : 0 }, uAmb: { value: def.look === 'earth' ? 0.035 : 0.02 }, uSpec: { value: def.look === 'earth' ? 1 : 0 }, uHeat: { value: 0 },
        };
        const mesh = new THREE.Mesh(this.geoLo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLANET_VS, fragmentShader: PLANET_FS }));
        tilt.add(mesh);
        const b = { def, group, tilt, mesh, u, atmo: null, clouds: null, rings: null, atmoCol: def.atmosphere ?? def.clouds ?? null };
        if (def.atmosphere || def.clouds) {
            const k = def.look === 'earth' ? 1.05 : def.kind === 'gas' ? 1.03 : 1.05;
            const au = { uSun: u.uSun, uAtmo: { value: new THREE.Color(def.atmosphere ?? def.clouds) }, uK: { value: def.look === 'earth' ? 1.0 : 0.6 }, uCenter: { value: new THREE.Vector3() }, uRatio: { value: 1 / k } };
            b.atmo = new THREE.Mesh(this.geoLo, new THREE.ShaderMaterial({ uniforms: au, vertexShader: PLANET_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            b.atmo.scale.setScalar(k);
            b.au = au;
            tilt.add(b.atmo);
        }
        if (def.look === 'earth') {
            b.cu = { uSun: u.uSun, uTime: { value: 0 }, uK: { value: 0.9 } };
            b.clouds = new THREE.Mesh(this.geoLo, new THREE.ShaderMaterial({ uniforms: b.cu, vertexShader: PLANET_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
            b.clouds.scale.setScalar(1.012);
            tilt.add(b.clouds);
        }
        if (def.rings) {
            const r = def.rings;
            b.ru = { uSun: u.uSun, uCenter: { value: new THREE.Vector3() }, uR: { value: def.radius }, uIn: { value: r.inner }, uOut: { value: r.outer }, uCol: { value: new THREE.Color(r.color) }, uAlpha: { value: r.alpha }, uNormal: { value: new THREE.Vector3(0, 1, 0) } };
            b.rings = new THREE.Mesh(new THREE.RingGeometry(r.inner, r.outer, 160, 1), new THREE.ShaderMaterial({ uniforms: b.ru, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
            b.rings.rotation.x = -Math.PI / 2;
            tilt.add(b.rings);
        }
        this.root.add(group);
        return b;
    }

    _orbitLine(b, def) {
        const lift = def.liftT != null ? 0 : def.lift || 0; // (a planet settling back: its orbit's line where it goes)
        if (b.orbitA === def.a && b.orbitL === lift && b.orbitI === (def.incl || 0) && b.orbit) return;
        if (b.orbit) { this.root.remove(b.orbit); b.orbit.geometry.dispose(); }
        const N = 256, pos = new Float32Array(N * 3);
        const d = { ...def, phase: 0, period: 1, lift };
        for (let i = 0; i < N; i++) {
            planetPosition({ ...d, phase: (i / N) * Math.PI * 2, node: def.node ?? def.phase ?? 0, period: 1e12 }, 0, _p);
            pos.set([_p.x, _p.y, _p.z], i * 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this._orbitMat = this._orbitMat || new THREE.LineBasicMaterial({ color: 0x6f8fc8, transparent: true, opacity: 0.22, depthWrite: false });
        this._earthOrbitMat = this._earthOrbitMat || new THREE.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.45, depthWrite: false });
        b.orbit = new THREE.LineLoop(g, def.look === 'earth' ? this._earthOrbitMat : this._orbitMat);
        b.orbit.frustumCulled = false;
        b.orbitA = def.a; b.orbitL = lift; b.orbitI = def.incl || 0;
        this.root.add(b.orbit);
    }

    /** A planet's map arrived from the worker. */
    setTexture(id, w, h, data) {
        const b = this.bodies.get(id);
        if (!b) return;
        const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 4;
        t.needsUpdate = true;
        const old = b.u.map.value;
        b.u.map.value = t;
        old?.dispose?.();
    }

    /**
     * Place everything for this frame round the camera.
     * @param {number} t      the shared time (s)
     * @param {{x,y,z}} cam   where the camera is in space (heliocentric)
     * @param {THREE.Quaternion} quat   which way it looks
     * @param {object} o      {fov, aspect, near, hide: a body not drawn (the one stood on), k: 0..1 how much space shows}
     */
    update(t, cam, quat, o = {}) {
        this.time = t;
        const C = this.camera;
        C.position.set(0, 0, 0);
        C.quaternion.copy(quat);
        if (o.fov && C.fov !== o.fov) { C.fov = o.fov; C.updateProjectionMatrix(); }
        if (o.aspect && Math.abs(C.aspect - o.aspect) > 1e-3) { C.aspect = o.aspect; C.updateProjectionMatrix(); }
        const near = Math.max(1, Math.min(60, o.near ?? 2));
        if (Math.abs(C.near - near) > near * 0.1) { C.near = near; C.updateProjectionMatrix(); }
        C.updateMatrixWorld(true);
        const sx = -cam.x, sy = -cam.y, sz = -cam.z; // the Sun, relative to the camera
        this.sun.position.set(sx, sy, sz);
        this.sunGlow.position.set(sx, sy, sz);
        this.sunU.uTime.value = t;
        // (far off, the glow keeps a size on the screen: the Sun is a bright star from Pluto)
        const ds = Math.hypot(sx, sy, sz);
        this.sunGlow.scale.setScalar(Math.max(SPACE.SUN_R * 7, ds * 0.06));
        const sunRel = _v.set(sx, sy, sz);
        const pxK = (o.height || 720) / (2 * Math.tan((C.fov * Math.PI) / 360));
        let gi = 0;
        for (const b of this.bodies.values()) {
            const def = b.def;
            planetPosition(def, t, _p, this.planets);
            b.group.position.set(_p.x - cam.x, _p.y - cam.y, _p.z - cam.z);
            // (the planet spells: a body being born, growing, given air, held — PlanetMagic.js)
            const rNow = this.radiusNow(def, t), heat = this._heat;
            if (b.group.scale.x !== rNow) b.group.scale.setScalar(rNow);
            b.u.uHeat.value = heat;
            if (gi < this.glows.length) {
                const gp = b.group.position;
                if (heat > 0.01) this._glow(gi++, gp.x, gp.y, gp.z, rNow * 4.5, 0xff8a3a, heat * 1.3);
                else if (rNow !== def.radius) this._glow(gi++, gp.x, gp.y, gp.z, rNow * 3.2, 0xfff0d0, 0.6);
                else if (def.terraAt && t - def.terraAt >= 0 && t - def.terraAt < VIEW_FX.TERRA) { const k = Math.sin(Math.PI * (t - def.terraAt) / VIEW_FX.TERRA); this._glow(gi++, gp.x, gp.y, gp.z, def.radius * 3.4, def.atmosphere ?? 0x9fe0ff, 0.9 * k); }
                else if (this.fx.hold?.id === def.id) this._glow(gi++, gp.x, gp.y, gp.z, def.radius * 3, 0xf2e6ff, 0.75 + 0.15 * Math.sin(t * 5));
            }
            b.mesh.rotation.y = spinAt(def, t);
            const d = b.group.position.length();
            b.group.visible = def.id !== o.hide;
            // near: the fine sphere
            const px = (def.radius / Math.max(1, d)) * pxK;
            const geo = px > 140 ? this.geoHi : this.geoLo;
            if (b.mesh.geometry !== geo) { b.mesh.geometry = geo; if (b.atmo) b.atmo.geometry = geo; if (b.clouds) b.clouds.geometry = geo; }
            b.u.uSun.value.copy(sunRel);
            if (b.au) b.au.uCenter.value.copy(b.group.position);
            if (b.cu) { b.cu.uTime.value = t; b.clouds.rotation.y = t * 0.002; }
            if (b.ru) { b.ru.uCenter.value.copy(b.group.position); b.ru.uNormal.value.set(0, 1, 0).applyQuaternion(b.tilt.quaternion); }
            // the orbit round its parent (the Moon round the Earth), round the Sun for the rest
            if (b.orbit) {
                if (def.parent) { planetPosition(this.planets.get(def.parent), t, _p, this.planets); b.orbit.position.set(_p.x - cam.x, _p.y - cam.y, _p.z - cam.z); }
                else b.orbit.position.set(sx, sy, sz);
                b.orbit.visible = o.orbits !== false;
            }
        }
        const beltA = (2 * Math.PI * t) / this.beltPeriod, kA = (2 * Math.PI * t) / this.kuiperPeriod;
        this.belt.position.set(sx, sy, sz); this.belt.rotation.y = -beltA;
        this.kuiper.position.set(sx, sy, sz); this.kuiper.rotation.y = -kA;
        for (const m of this._rockMats) m.uniforms.uSun.value.copy(sunRel);
        for (const c of this.planets.clusters) {
            const m = this.clusterMeshes.get(c.id);
            const bc = m?.userData.beacon;
            if (bc) bc.visible = !!m.visible && !c.used;
            if (!m || !m.visible) continue;
            planetPosition(c, t, _p);
            m.position.set(_p.x - cam.x, _p.y - cam.y, _p.z - cam.z);
            if (bc && bc.visible) {
                const d = m.position.length();
                bc.position.copy(m.position);
                bc.scale.setScalar(Math.max(c.r * 2.5, d * 0.035)); // (a few dozen pixels on the screen from anywhere)
                bc.material.opacity = 0.9; // (shared)
                bc.visible = d > c.r * 4; // (close by: the rocks themselves)
            }
            m.rotation.y = t * 0.01;
            if (c.used) {
                // «Create a Planet»: the rocks drawn in to one point, crashing, red-hot — then gone (the planet is there)
                const a = c.usedAt ? t - c.usedAt : 1e9;
                if (a > VIEW_FX.FORM + 0.5 || a < 0) { m.visible = false; continue; }
                const k = smooth(a / VIEW_FX.FORM);
                m.scale.setScalar(Math.max(0.02, 1 - k));
                m.rotation.y = t * 0.01 + k * k * 9;
                const u = m.material.uniforms.uCol.value, base = m.userData.base || (m.userData.base = u.getHex());
                u.setHex(base).lerp(_hot, Math.min(1, k * 1.4));
                if (gi < this.glows.length) this._glow(gi++, m.position.x, m.position.y, m.position.z, c.r * (1.6 - k), 0xff7a2a, 0.3 + k);
            }
        }
        for (; gi < this.glows.length; gi++) this.glows[gi].visible = false;
        // (close to a planet the orbits' lines would cross the whole view: they fade away)
        const ok = o.orbitK ?? 1;
        this._orbitMat.opacity = 0.22 * ok; this._earthOrbitMat.opacity = 0.45 * ok;
        const k = o.k ?? 1;
        this.starU.uK.value = k;
        this.milkyU.uK.value = k;
    }

    render(renderer) {
        renderer.render(this.scene, this.camera);
    }

    /** Every shader of space made now (the loading screen), never in a frame of play. */
    compile(renderer) {
        const C = this.camera;
        C.position.set(0, 0, 0);
        C.updateMatrixWorld(true);
        // (the far / near spheres both in use once, so both are uploaded too)
        for (const b of this.bodies.values()) { b.group.visible = true; b.group.position.set(0, 0, -b.def.radius * 3); }
        for (const s of this.glows) { s.visible = true; s.position.set(0, 0, -500); }
        try { renderer.compile(this.scene, C); } catch (e) { /* (no GL in tests) */ }
        for (const s of this.glows) s.visible = false;
    }

    dispose() {
        this.geoHi.dispose(); this.geoLo.dispose(); this.rockGeo.dispose();
        this.scene.traverse((o) => { o.material?.dispose?.(); if (o.geometry && o.geometry !== this.geoHi && o.geometry !== this.geoLo && o.geometry !== this.rockGeo) o.geometry.dispose(); });
    }
}
