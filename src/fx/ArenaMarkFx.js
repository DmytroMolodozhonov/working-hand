/**
 * ArenaMarkFx.js — the lit places of a duel (the steward's sign-up, ArenaSteward.js; the rules — ArenaDuels.js).
 *
 * Two places on the arena's floor glow while a player's duel is being made: the player's own (warm gold, a rune ring turning,
 * a pulsing disc, a column of light with sparks rising in it, and — for the player who signed up — a bobbing arrow while he is
 * not on it yet) and his opponent's (a cold violet, no arrow). It all lies on the floor's stone: the rings are 1.8 m in
 * radius, the marks are 11 (8) m from the middle, so a ring never reaches the stands.
 *
 * Cheap on purpose (CLAUDE.md «Производительность»): shared geometries, one shader pair (ring/disc, column, sparks) with a program of
 * its own compiled on loading (`prewarm`), the sparks move in the vertex shader (nothing per frame on the processor but a few
 * uniforms), no light in the scene, nothing drawn when no duel is being made.
 */
import * as THREE from 'three';
import { STEWARD } from '../game/ArenaSteward.js';

export const MARK = { R: STEWARD.RING, COLUMN: 9, SPARKS: 26, ARROW_H: 5.2 };

const RING_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec3 uColor; uniform float uPower; uniform float uPulse;
varying vec2 vUv;
float seg(float a, float n, float w) { float k = fract(a * n / 6.2831853); return smoothstep(0.0, w, k) * (1.0 - smoothstep(1.0 - w, 1.0, k)); }
void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p), a = atan(p.y, p.x);
    if (r > 1.0) discard;
    // the outer rune ring: broken arcs turning one way, ticks between them
    float outer = smoothstep(0.86, 0.9, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float arcs = seg(a + uTime * 0.5, 8.0, 0.18);
    float ticks = smoothstep(0.78, 0.8, r) * (1.0 - smoothstep(0.84, 0.86, r)) * seg(a - uTime * 0.3, 24.0, 0.42);
    // the inner ring turning back, thinner
    float inner = smoothstep(0.52, 0.55, r) * (1.0 - smoothstep(0.58, 0.61, r)) * (0.45 + 0.55 * seg(a - uTime * 0.9, 5.0, 0.3));
    // a six-pointed star of the old stone, faint
    float star = 0.0;
    for (int i = 0; i < 3; i++) {
        float t = float(i) * 1.0471976 + uTime * 0.12;
        vec2 d = vec2(cos(t), sin(t));
        star += (1.0 - smoothstep(0.0, 0.02, abs(dot(p, vec2(-d.y, d.x))))) * (1.0 - smoothstep(0.5, 0.52, r));
    }
    // the disc: bright in the middle, a breath of the pulse running outwards
    float disc = (1.0 - smoothstep(0.0, 0.5, r)) * 0.42 + (1.0 - smoothstep(0.5, 0.86, r)) * 0.16;
    float wave = smoothstep(0.06, 0.0, abs(r - fract(uTime * 0.45))) * 0.35;
    float v = outer * (0.55 + 0.45 * arcs) + ticks * 0.8 + inner * 0.9 + star * 0.22 + disc + wave * (1.0 - r);
    v *= uPower * (0.85 + 0.15 * sin(uTime * 3.0 + uPulse));
    vec3 col = mix(uColor, vec3(1.0), clamp(disc * 0.9 + outer * 0.25, 0.0, 0.8));
    gl_FragColor = vec4(col * v, v);
}
`;

const COLUMN_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec3 uColor; uniform float uPower;
varying vec2 vUv; varying float vA;
void main() {
    float up = vUv.y;
    float fade = (1.0 - up) * (1.0 - up);
    float shaft = 0.5 + 0.5 * sin(vA * 6.0 + uTime * 1.6 + up * 5.0);
    float v = fade * (0.1 + 0.14 * shaft) * uPower;
    gl_FragColor = vec4(uColor * v * 2.0, v);
}
`;

const COLUMN_VERT = /* glsl */ `
varying vec2 vUv; varying float vA;
void main() { vUv = uv; vA = atan(position.z, position.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SPARK_VERT = /* glsl */ `
attribute vec4 aSeed; // x angle, y radius, z speed, w phase
uniform float uTime; uniform float uPower; uniform float uHeight; uniform float uScale;
varying float vFade;
void main() {
    float life = fract(aSeed.w + uTime * aSeed.z);
    float rad = aSeed.y * (0.55 + 0.35 * life);
    float ang = aSeed.x + uTime * 0.7 * (aSeed.z + 0.2);
    vec3 p = vec3(cos(ang) * rad, life * uHeight, sin(ang) * rad);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vFade = sin(life * 3.14159) * uPower;
    gl_PointSize = clamp(uScale * (0.5 + aSeed.z) / max(0.5, -mv.z), 1.5, 14.0);
}
`;

const SPARK_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; varying float vFade;
void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float v = (1.0 - d) * vFade;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * v, v);
}
`;

let _shared = null;
function shared() {
    if (_shared) return _shared;
    const plane = new THREE.PlaneGeometry(2 * MARK.R, 2 * MARK.R); plane.rotateX(-Math.PI / 2);
    const column = new THREE.CylinderGeometry(MARK.R * 0.62, MARK.R * 0.8, MARK.COLUMN, 28, 1, true); column.translate(0, MARK.COLUMN / 2, 0);
    const arrow = new THREE.ConeGeometry(0.7, 1.5, 4, 1); arrow.rotateX(Math.PI); // (a pointed block, tip down)
    const sparks = new THREE.BufferGeometry();
    const seed = new Float32Array(MARK.SPARKS * 4), pos = new Float32Array(MARK.SPARKS * 3);
    for (let i = 0; i < MARK.SPARKS; i++) {
        seed[i * 4] = (i / MARK.SPARKS) * Math.PI * 2 + (i % 3) * 0.4;
        seed[i * 4 + 1] = MARK.R * (0.35 + 0.55 * ((i * 7) % 11) / 11);
        seed[i * 4 + 2] = 0.12 + 0.2 * (((i * 5) % 7) / 7);
        seed[i * 4 + 3] = ((i * 13) % MARK.SPARKS) / MARK.SPARKS;
    }
    sparks.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sparks.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    sparks.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, MARK.COLUMN / 2, 0), MARK.COLUMN);
    for (const g of [plane, column, arrow, sparks]) g.userData.shared = true;
    return (_shared = { plane, column, arrow, sparks });
}

const mat = (vs, fs, uniforms, extra = {}) => new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...extra,
});

/** One lit place: the ring/disc on the floor, the column, the sparks, and (for the player's own) the arrow. */
class Place {
    constructor(color, pulse, withArrow) {
        const S = shared();
        this.group = new THREE.Group();
        this.group.visible = false;
        const c = new THREE.Color(color);
        this.U = { uTime: { value: 0 }, uColor: { value: c }, uPower: { value: 0 }, uPulse: { value: pulse } };
        this.ringMat = mat(RING_VERT, RING_FRAG, this.U, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        this.ring = new THREE.Mesh(S.plane, this.ringMat);
        this.colMat = mat(COLUMN_VERT, COLUMN_FRAG, this.U, { side: THREE.DoubleSide });
        this.col = new THREE.Mesh(S.column, this.colMat);
        this.sparkMat = mat(SPARK_VERT, SPARK_FRAG, { ...this.U, uHeight: { value: MARK.COLUMN * 0.8 }, uScale: { value: 260 } });
        this.sparks = new THREE.Points(S.sparks, this.sparkMat);
        this.ring.renderOrder = 4; this.col.renderOrder = 5; this.sparks.renderOrder = 6;
        for (const m of [this.ring, this.col, this.sparks]) { m.frustumCulled = false; this.group.add(m); }
        if (withArrow) {
            this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
            this.arrow = new THREE.Mesh(S.arrow, this.arrowMat);
            this.arrow.renderOrder = 7;
            this.group.add(this.arrow);
        }
    }

    /** `power` 0…1 (0: off), `arrow` show the arrow. */
    set(x, y, z, power, t, arrow = false) {
        const on = power > 0.01;
        this.group.visible = on;
        if (!on) return;
        this.group.position.set(x, y, z);
        this.U.uTime.value = t; this.U.uPower.value = power;
        this.col.scale.y = 0.45 + 0.55 * Math.min(1, power * 1.5);
        if (this.arrow) {
            this.arrow.visible = arrow;
            if (arrow) { this.arrow.position.y = MARK.ARROW_H + Math.sin(t * 3) * 0.4; this.arrow.rotation.y = t * 1.5; this.arrowMat.opacity = 0.55 + 0.35 * Math.sin(t * 5); }
        }
    }

    dispose() { for (const m of [this.ringMat, this.colMat, this.sparkMat, this.arrowMat]) m?.dispose(); }
}

export class ArenaMarkFx {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this.mine = new Place(0xffc14a, 0, true); // the player's own place: warm gold
        this.foe = new Place(0x9a62ff, 2, false); // the opponent's: cold violet
        this.root = new THREE.Group();
        this.root.add(this.mine.group, this.foe.group);
        game.scene.add(this.root);
        this.active = false;
    }

    /**
     * Each frame: `s` = {player: {x,y,z}, foe: {x,y,z}, power: 0…1, foePower, arrow} for the arena where a duel with a player is
     * being made — or null (nothing lit).
     */
    update(dt, s) {
        if (!s) { if (this.active) { this.mine.set(0, 0, 0, 0, 0); this.foe.set(0, 0, 0, 0, 0); this.active = false; } return; }
        this.active = true;
        this.t += dt;
        const k = 0.05;
        this.mine.set(s.player.x, s.player.y + k, s.player.z, s.power, this.t, !!s.arrow);
        this.foe.set(s.foe.x, s.foe.y + k, s.foe.z, s.foePower, this.t);
    }

    /** Make the programs on loading (the places lit for a moment in a small scene of their own, then hidden). */
    prewarm() {
        const r = this.game.renderer, cam = this.game.camera;
        if (!r) return;
        // (in the game's own scene: its lights and fog are in a program's key — an empty scene made other programs)
        const sc = this.game.scene;
        for (const p of [this.mine, this.foe]) { p.set(0, 0, -5, 1, 0, true); sc.add(p.group); }
        try { r.compile(sc, cam); } catch (_) { /* (made on the first frame instead) */ }
        for (const p of [this.mine, this.foe]) { sc.remove(p.group); this.root.add(p.group); p.set(0, 0, 0, 0, 0); }
    }

    dispose() {
        this.game.scene.remove(this.root);
        this.mine.dispose(); this.foe.dispose();
    }
}
