/**
 * DivineSwordModel.js — the look of «Божественный меч» (DivineSword.js): a long, slender sword born of the Ice Queen's rod and a classic
 * sword (Pentagranium Unitas). Model space as every weapon (WeaponModels.js): the pommel at the origin, the point along +Y, the edge plane XY.
 *
 * Measured from the plain sword (WEAPON_SPECS.sword, the same scale 2.6): its blade 1.0 → here 1.14 (≈ +14 %), the point longer and finer,
 * the blade a little narrower at the root and thinner (an elegant blade, not a heavier one): the whole sword 1.30 → 1.50 (≈ 3.9 m in the
 * world beside the plain one's 3.4 m; the hero is ~3.5–4.8 m and every thing is ×2.5 a real one — ITEM_SCALE).
 *
 * Solid parts (one shape per material through FarShape like every weapon): a mirror-white steel blade that glows from inside (emissive),
 * a gold inlay down its fuller with a line of small gold studs, a winged guard swept up towards the point (gold, two ice-crystal tips —
 * the rod's crystal lives on in it), a sun-disc at the guard with the rod's crystal set in it, a white grip bound with gold wire, a pommel
 * of ice crystal held in four gold claws.
 *
 * The light (NOT a PointLight — CLAUDE.md «Производительность»): three additive layers on the weapon's mesh, drawn by two shared shaders
 * (one uniform clock for every divine sword — `divineClock`): the glow sleeve round the blade with runes that run up it and a slow pulse; a
 * cross of soft halo planes with long thin rays that turn; a star at the point. They are made once (shared geometry + materials), and
 * Game.prewarm compiles them (`divineSwordSamples`). Fog does not eat them: seen from far away.
 */
import * as THREE from 'three';

export const DIVINE_SPEC = {
    type: 'divine', scale: 2.6, mass: 1.15, damage: 2, // (light: «как перо» when lifted, lighter than the plain sword's 1.4)
    handle: [0.05, 0.27],
    bladeStart: 0.34, length: 1.5,
    handleRadius: 0.024,
    samples: [[0, -0.04, 0, 0.035], [0, 0.16, 0, 0.03], [-0.2, 0.36, 0, 0.03], [0.2, 0.36, 0, 0.03], [0, 0.62, 0, 0.03], [0, 1.0, 0, 0.024], [0, 1.5, 0, 0.012]],
    com: [0, 0.42, 0],
    stiffness: 28,
};

const BLADE = { y0: 0.34, len: 1.16, hw: 0.05, th: 0.012, point: 0.26 };

/** A long tapered blade, diamond section, a long fine point (the same build as the plain sword's, its own proportions). */
function bladeGeometry(len, baseHalfW, thick, pointLen, steps = 16) {
    const rings = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, y = t * len;
        const toPoint = Math.max(0, (y - (len - pointLen)) / pointLen);
        const taper = 1 - 0.22 * t + 0.06 * Math.sin(t * Math.PI); // (a faint leaf swell in the middle — a noble blade)
        const hw = baseHalfW * taper * (1 - Math.pow(toPoint, 1.3));
        const th = thick * (1 - 0.35 * t) * (1 - 0.85 * toPoint);
        rings.push({ y, hw: Math.max(hw, 0.0005), th: Math.max(th, 0.0004) });
    }
    const pos = [], uv = [], idx = [];
    rings.forEach((r, i) => {
        const v = i / (rings.length - 1);
        pos.push(r.hw, r.y, 0, 0, r.y, r.th, -r.hw, r.y, 0, 0, r.y, -r.th);
        uv.push(1, v, 0.5, v, 0, v, 0.5, v);
    });
    for (let i = 0; i < rings.length - 1; i++) {
        const a = i * 4, b = (i + 1) * 4;
        for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2); }
    }
    const last = (rings.length - 1) * 4;
    pos.push(0, len + 0.002, 0); uv.push(0.5, 1);
    const tip = pos.length / 3 - 1;
    for (let k = 0; k < 4; k++) idx.push(last + k, tip, last + (k + 1) % 4);
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return geo;
}

let _tex = null;
/** The blade's own picture: mirror steel with a fine forge pattern (layered steel waves) — drawn once. */
function bladeTexture() {
    if (_tex || typeof document === 'undefined') return _tex;
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 512 });
    const g = c.getContext('2d');
    g.fillStyle = '#eef3f8'; g.fillRect(0, 0, 64, 512);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) { // (folded-steel waves: soft pale lines along the blade)
        g.strokeStyle = `rgba(${200 + rnd() * 40},${210 + rnd() * 35},${230 + rnd() * 25},0.45)`;
        g.lineWidth = 0.6 + rnd() * 1.4;
        const x0 = rnd() * 64, ph = rnd() * 6.28, amp = 2 + rnd() * 5;
        g.beginPath();
        for (let y = 0; y <= 512; y += 8) g.lineTo(x0 + Math.sin(y * 0.03 + ph) * amp, y);
        g.stroke();
    }
    const fl = g.createLinearGradient(22, 0, 42, 0); // (the fuller: a bright gold-white groove)
    fl.addColorStop(0, 'rgba(255,240,200,0)'); fl.addColorStop(0.5, 'rgba(255,232,170,0.75)'); fl.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = fl; g.fillRect(22, 30, 20, 400);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, 3, 512); g.fillRect(61, 0, 3, 512); // (honed edges)
    _tex = new THREE.CanvasTexture(c);
    _tex.anisotropy = 4;
    return _tex;
}

/** Solid parts. `env` — the weapons' reflection map (WeaponModels.getEnvMap). → {group, spec} */
export function buildDivineSword(env) {
    const group = new THREE.Group();
    group.name = 'divine';
    const steel = new THREE.MeshStandardMaterial({ color: 0xf6f9ff, map: bladeTexture(), roughness: 0.14, metalness: 0.75, envMap: env, envMapIntensity: 1.3, emissive: 0xffe4a0, emissiveIntensity: 0.32 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf0b840, roughness: 0.25, metalness: 0.95, envMap: env, envMapIntensity: 1.2, emissive: 0xa86a10, emissiveIntensity: 0.45 });
    const ice = new THREE.MeshStandardMaterial({ color: 0xbff1ff, roughness: 0.05, metalness: 0.2, envMap: env, transparent: true, opacity: 0.92, emissive: 0x5fd8ff, emissiveIntensity: 1.1 });
    const grip = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.7, metalness: 0.0 });

    const blade = new THREE.Mesh(bladeGeometry(BLADE.len, BLADE.hw, BLADE.th, BLADE.point), steel);
    blade.position.y = BLADE.y0;
    group.add(blade);
    // the gold inlay down the fuller on both faces, and a row of tiny studs (a written line of the gods)
    const inlay = new THREE.BoxGeometry(0.008, 0.62, 0.003);
    for (const z of [BLADE.th * 0.82, -BLADE.th * 0.82]) {
        const m = new THREE.Mesh(inlay, gold); m.position.set(0, BLADE.y0 + 0.36, z); group.add(m);
    }
    const stud = new THREE.OctahedronGeometry(0.008, 0);
    for (let i = 0; i < 7; i++) for (const z of [BLADE.th * 0.9, -BLADE.th * 0.9]) {
        const m = new THREE.Mesh(stud, gold); m.position.set(0, BLADE.y0 + 0.73 + i * 0.045, z); m.scale.set(1, 1.6, 0.5); group.add(m);
    }
    // ricasso collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.028), gold);
    collar.position.y = BLADE.y0 + 0.005; group.add(collar);
    // the winged guard: two quillons swept up towards the point, thin at the tips
    for (const sx of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.322, 0), new THREE.Vector3(0.07 * sx, 0.318, 0), new THREE.Vector3(0.14 * sx, 0.33, 0),
            new THREE.Vector3(0.19 * sx, 0.36, 0), new THREE.Vector3(0.215 * sx, 0.405, 0),
        ]);
        const tube = new THREE.TubeGeometry(curve, 20, 0.016, 8, false);
        const p = tube.attributes.position; // (thinner towards the wing tip)
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = Math.min(1, Math.abs(x) / 0.215);
            const k = 1 - 0.55 * t * t;
            const cx = curve.getPointAt(Math.min(1, t)); // (approximate the centre line by x)
            p.setY(i, cx.y + (y - cx.y) * k); p.setZ(i, z * k);
        }
        tube.computeVertexNormals();
        group.add(new THREE.Mesh(tube, gold));
        // a second, finer feather of the wing under it
        const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.05 * sx, 0.31, 0), new THREE.Vector3(0.12 * sx, 0.305, 0), new THREE.Vector3(0.17 * sx, 0.325, 0)]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(c2, 10, 0.008, 6, false), gold));
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), ice);
        tip.position.set(0.218 * sx, 0.415, 0); tip.scale.set(0.8, 1.6, 0.8); tip.rotation.z = -0.5 * sx;
        group.add(tip);
    }
    // the sun-disc at the guard with the rod's crystal in it
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20), gold);
    disc.rotation.x = Math.PI / 2; disc.position.y = 0.31; group.add(disc);
    const rays = new THREE.ConeGeometry(0.009, 0.03, 4);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = new THREE.Mesh(rays, gold);
        r.position.set(Math.cos(a) * 0.05, 0.31 + Math.sin(a) * 0.05, 0); r.rotation.z = a - Math.PI / 2; group.add(r);
    }
    for (const z of [0.017, -0.017]) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), ice);
        gem.position.set(0, 0.31, z); gem.scale.set(1, 1.3, 0.55); group.add(gem);
    }
    // the grip: white wrap with gold wire round it
    const gripGeo = new THREE.LatheGeometry([new THREE.Vector2(0.02, 0.035), new THREE.Vector2(0.024, 0.1), new THREE.Vector2(0.025, 0.17), new THREE.Vector2(0.023, 0.24), new THREE.Vector2(0.02, 0.285)], 16);
    group.add(new THREE.Mesh(gripGeo, grip));
    const wire = new THREE.TorusGeometry(0.0245, 0.0028, 4, 16);
    for (let i = 0; i < 11; i++) {
        const w = new THREE.Mesh(wire, gold); w.rotation.x = Math.PI / 2 + 0.22; w.position.y = 0.055 + i * 0.021; group.add(w);
    }
    for (const y of [0.04, 0.287]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 16), gold); r.position.y = y; group.add(r); }
    // the pommel: ice crystal in four gold claws
    const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), ice);
    crys.scale.set(0.85, 1.35, 0.85); crys.position.y = -0.02; group.add(crys);
    const claw = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.03, 0), new THREE.Vector3(0.036, 0.0, 0), new THREE.Vector3(0.03, -0.04, 0), new THREE.Vector3(0.012, -0.062, 0)]);
    const clawGeo = new THREE.TubeGeometry(claw, 8, 0.0055, 5, false);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(clawGeo, gold); c.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4; group.add(c); }

    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group, spec: DIVINE_SPEC };
}

// ------------------------------------------------------------------ the light (shared shaders, one clock)
export const divineClock = { value: 0 };
let _glow = null;

const GLOW_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`;
// the sleeve: soft glow (stronger at the silhouette and the edges), runes running up the blade, a slow breathing pulse
const SLEEVE_FS = `
uniform float uT; uniform vec3 uCol; uniform vec3 uRune; uniform float uK;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h(float n) { return fract(sin(n * 91.345) * 47453.53); }
void main() {
    float rim = pow(1.0 - abs(dot(vN, vV)), 1.6);
    float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y) * 0.6);
    float pulse = 0.78 + 0.22 * sin(uT * 2.1 - vUv.y * 7.0);
    float a = (0.05 + 0.5 * rim) * along * pulse;
    // runes: one line of glyphs down the fuller — each drawn of thin strokes (a stem, a slant, a bar, a ring) chosen by its own hash;
    // the line drifts slowly up the blade and each glyph breathes in turn (u: 0.5 at the spine, 0 / 1 at the edges)
    float y = vUv.y * 20.0 - uT * 0.45;
    float row = floor(y);
    vec2 q = vec2((vUv.x - 0.5) * 2.2, (fract(y) - 0.5) * 1.15);
    float run = 0.0;
    if (abs(q.x) < 0.5 && abs(q.y) < 0.5 && vUv.y > 0.06 && vUv.y < 0.84) {
        float w = 0.075;
        float h1 = h(row * 7.13), h2 = h(row * 3.31 + 1.0), h3 = h(row * 5.71 + 2.0), h4 = h(row * 9.97 + 3.0);
        float g = step(0.25, h1) * (1.0 - smoothstep(w * 0.5, w, abs(q.x))) * step(abs(q.y), 0.42);
        float sl = h2 > 0.5 ? abs(q.x - q.y * 0.8) : abs(q.x + q.y * 0.8);
        g = max(g, (1.0 - smoothstep(w * 0.5, w, sl)) * step(abs(q.y), 0.36) * step(0.3, h2));
        g = max(g, step(0.45, h3) * (1.0 - smoothstep(w * 0.5, w, abs(q.y - (h3 > 0.72 ? 0.36 : -0.36)))) * step(abs(q.x), 0.3));
        g = max(g, step(0.62, h4) * (1.0 - smoothstep(w * 0.5, w, abs(length(q - vec2(0.0, 0.12)) - 0.16))));
        float fl = 0.6 + 0.4 * sin(uT * 2.6 + row * 1.7);
        run = g * fl;
    }
    vec3 col = uCol * a + uRune * run * 1.1 * along;
    gl_FragColor = vec4(col * uK, 1.0);
}`;
// the halo planes: a long soft glow round the blade, thin rays reaching out that slowly turn and breathe
const HALO_FS = `
uniform float uT; uniform vec3 uCol; uniform float uK; uniform float uStar;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
    vec2 p = vUv - 0.5;
    float d;
    vec3 col;
    if (uStar > 0.5) { // the star at the point: a bright core and four (and four finer) beams
        float r = length(p) * 2.0;
        float ang = atan(p.y, p.x) + uT * 0.4;
        float beams = pow(abs(cos(ang * 2.0)), 40.0) + 0.5 * pow(abs(cos(ang * 2.0 + 0.785)), 60.0);
        d = exp(-r * r * 30.0) * 0.9 + beams * exp(-r * 3.5) * (0.55 + 0.2 * sin(uT * 3.3));
        col = mix(uCol, vec3(1.0), 0.5) * d;
    } else { // the sleeve's halo: x across the blade, y along it
        float across = abs(p.x) * 2.0;
        float len = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y));
        float soft = exp(-across * across * 9.0) * len;
        // a slow shimmer of light running up the blade (no bands: two waves of different lengths)
        float run = 0.5 + 0.3 * sin(vUv.y * 13.0 - uT * 2.4) + 0.2 * sin(vUv.y * 5.0 + uT * 1.1);
        d = soft * (0.16 + 0.12 * run);
        col = uCol * d;
    }
    gl_FragColor = vec4(col * uK, 1.0);
}`;

function glowParts() {
    if (_glow) return _glow;
    const mk = (fs, extra = {}) => new THREE.ShaderMaterial({
        uniforms: { uT: divineClock, uCol: { value: new THREE.Color(0xffd77a) }, uRune: { value: new THREE.Color(0xffe9a8) }, uK: { value: 1 }, uStar: { value: 0 }, ...extra },
        vertexShader: GLOW_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const sleeveMat = mk(SLEEVE_FS);
    const haloMat = mk(HALO_FS);
    const starMat = mk(HALO_FS, { uStar: { value: 1 }, uCol: { value: new THREE.Color(0xfff0c0) } });
    for (const m of [sleeveMat, haloMat, starMat]) m.userData.shared = true;
    // the sleeve: the blade itself, a little fatter
    const sleeve = bladeGeometry(BLADE.len * 1.01, BLADE.hw * 1.3, BLADE.th * 2.6, BLADE.point * 1.03, 16);
    // the halo: two planes crossed along the blade (wider than the blade: a soft light round it)
    const halo = new THREE.PlaneGeometry(0.34, BLADE.len * 1.2);
    halo.translate(0, BLADE.len * 0.6, 0);
    const halo2 = halo.clone(); halo2.rotateY(Math.PI / 2);
    const haloGeo = mergeTwo(halo, halo2);
    const star = new THREE.PlaneGeometry(0.34, 0.34);
    const star2 = star.clone(); star2.rotateY(Math.PI / 2);
    const starGeo = mergeTwo(star, star2);
    for (const x of [sleeve, haloGeo, starGeo]) x.userData.shared = x.userData.keep = true;
    _glow = { sleeve, haloGeo, starGeo, sleeveMat, haloMat, starMat };
    return _glow;
}

function mergeTwo(a, b) {
    const out = new THREE.BufferGeometry();
    const ai = a.index ? a.toNonIndexed() : a, bi = b.index ? b.toNonIndexed() : b;
    for (const k of ['position', 'normal', 'uv']) {
        const A = ai.attributes[k].array, B = bi.attributes[k].array, C = new Float32Array(A.length + B.length);
        C.set(A); C.set(B, A.length);
        out.setAttribute(k, new THREE.BufferAttribute(C, ai.attributes[k].itemSize));
    }
    return out;
}

/** The light of one divine sword, in MODEL space (the caller puts it where the model is: scale S and the centre-of-mass offset). */
export function divineGlow() {
    const G = glowParts();
    const grp = new THREE.Group();
    grp.name = 'divineGlow';
    const sleeve = new THREE.Mesh(G.sleeve, G.sleeveMat); sleeve.position.y = BLADE.y0 - 0.005;
    const halo = new THREE.Mesh(G.haloGeo, G.haloMat); halo.position.y = BLADE.y0 - 0.06;
    const star = new THREE.Mesh(G.starGeo, G.starMat); star.position.y = BLADE.y0 + BLADE.len; star.userData.star = true;
    for (const m of [sleeve, halo, star]) { m.renderOrder = 9; m.frustumCulled = true; m.userData.noFar = true; m.castShadow = false; m.receiveShadow = false; }
    grp.add(sleeve, halo, star);
    return grp;
}

/** Game.prewarm: the solid parts' and the three glow shaders. */
export function divineSwordSamples(env = null) {
    const { group } = buildDivineSword(env);
    group.add(divineGlow());
    return [group];
}

/** Points along the blade in model space (t 0 → root, 1 → point): for the sparks and the swing trail. */
export function bladePoint(t, out) {
    return out.set(0, BLADE.y0 + BLADE.len * t, 0);
}
