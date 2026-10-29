/**
 * ArenaDomeFx.js — the look of the arena's magic dome (rules — game/ArenaDome.js).
 *
 * Invisible: it shows itself only where someone comes close to it (a soft glow with a faint honeycomb round the hero) and where a charge
 * bursts on it (a ring of light running out from the hit, a bright core). One mesh and one material for the whole game: built when the
 * hero is near an arena, rebuilt for another; the shader is made on loading (`prewarm`).
 */
import * as THREE from 'three';
import { domeOf, domeGeometry, skinDistance, DOME } from '../game/ArenaDome.js';

const MAX_HITS = 4;

const VERT = `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `
varying vec3 vW;
uniform vec3 uHero; uniform float uNear; uniform float uFlash; uniform float uTime;
uniform vec4 uHits[${MAX_HITS}];
float hexLines(vec2 p) {
  vec2 q = p * vec2(1.0, 1.1547); q.x += floor(q.y * 0.5 + 0.5) * 0.5;
  vec2 f = abs(fract(q) - 0.5);
  return smoothstep(0.38, 0.5, max(f.x * 1.15, f.y * 0.9 + f.x * 0.5));
}
void main() {
  float comb = hexLines(vW.xz * 0.55 + vW.y * 0.35 + 0.0);
  float near = smoothstep(uNear, 0.0, distance(vW, uHero));
  float a = near * (0.10 + 0.35 * comb);
  vec3 col = vec3(0.45, 0.65, 1.0);
  for (int i = 0; i < ${MAX_HITS}; i++) {
    vec4 h = uHits[i];
    if (h.w < 0.0) continue;
    float k = 1.0 - h.w / uFlash;
    float d = distance(vW, h.xyz), r = h.w * 11.0;
    float ring = exp(-pow((d - r) / 1.1, 2.0)) * k;
    float core = exp(-d * d / (2.0 + h.w * 18.0)) * k * k;
    a += ring * (0.55 + 0.45 * comb) + core * 0.9;
    col = mix(col, vec3(0.85, 0.75, 1.0), clamp(core, 0.0, 1.0));
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
}`;

export class ArenaDomeFx {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this.hits = Array.from({ length: MAX_HITS }, () => new THREE.Vector4(0, 0, 0, -1));
        this.mat = new THREE.ShaderMaterial({
            vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            uniforms: { uHero: { value: new THREE.Vector3() }, uNear: { value: DOME.NEAR }, uFlash: { value: DOME.FLASH }, uTime: { value: 0 }, uHits: { value: this.hits } },
        });
        this.mesh = null; this.key = null; this.D = null;
    }

    /** A charge burst on the skin at (x, y, z). */
    hit(x, y, z) {
        let k = 0;
        for (let i = 0; i < MAX_HITS; i++) { if (this.hits[i].w < 0) { k = i; break; } if (this.hits[i].w > this.hits[k].w) k = i; }
        this.hits[k].set(x, y, z, 0);
    }

    _build(def) {
        this._drop();
        const D = domeOf(def);
        if (!D) return;
        const g = domeGeometry(D), geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
        geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
        this.mesh = new THREE.Mesh(geo, this.mat);
        this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false;
        this.game.scene.add(this.mesh);
        this.D = D; this.key = def.id;
    }

    _drop() {
        if (this.mesh) { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
        this.D = null; this.key = null;
    }

    /** Each frame: `def` — the nearest arena's record (or null: nothing near). */
    update(dt, def) {
        this.t += dt;
        if (!def) { if (this.mesh) this._drop(); for (const h of this.hits) h.w = -1; return; }
        if (this.key !== def.id) this._build(def);
        if (!this.mesh) return;
        let live = false;
        for (const h of this.hits) if (h.w >= 0) { h.w += dt; if (h.w > DOME.FLASH) h.w = -1; else live = true; }
        const p = this.game.character.group.position, u = this.mat.uniforms;
        u.uHero.value.set(p.x, p.y + 1.7, p.z); u.uTime.value = this.t;
        this.mesh.visible = live || skinDistance(this.D, p.x, p.y, p.z) < DOME.NEAR;
    }

    /** Make the program on loading (the dome drawn once in a small scene of its own). */
    prewarm() {
        const r = this.game.renderer, cam = this.game.camera;
        if (!r) return;
        // (in the game's own scene: a program's key holds the scene's lights and fog — compiled in an empty scene it was
        // another program, and the real one was made at the first charge bursting on the dome, in the middle of a duel)
        const sc = this.game.scene, geo = new THREE.SphereGeometry(1, 6, 4), m = new THREE.Mesh(geo, this.mat);
        m.position.set(0, 0, -5); sc.add(m);
        try { r.compile(sc, cam); } catch (_) { /* (made on the first frame instead) */ } finally { sc.remove(m); }
        geo.dispose();
    }

    dispose() { this._drop(); this.mat.dispose(); }
}
