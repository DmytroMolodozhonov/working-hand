/**
 * DarkFog.js — «Caligo» («Калиго»): the dark mage's fog (the rules and the author's words: DarkFogRules.js).
 *
 *   word  → 50 mana; the wand lets out a great jet of black smoke for 10 s toward the spot it points at (the ground within 70 m; a house's dome of protection near the spot is
 *           taken as the middle, so the fog wraps the house) — the dome of fog grows out of it to R 60 × H 38, stays 150 s, thins away in 30 s.
 *   every computer draws the same fog (the cast goes over the net as `spell Caligo`: o = the middle, d = the way back to the wand).
 *   the picture inside — Game's render calls `begin()` / `end()` round the frame: the world's fog is swapped for a near black one (restored after, so the day cycle never notices);
 *                         a hero with the night gift (Pentagranium Noctis: `g.sight.night`) sees through it.
 *   the minds — Invisibility.aiPos asks `hides(pos)`: a player in the fog is only «where he was last seen» (DarkFogRules.fogClue).
 *   «стоп» takes down my own fogs (a hero must be able to leave one).
 *
 * «А если»: no fog around (a hero in a cave / under a roof) — the dome is just drawn there, the mind check works the same; two fogs — up to 4, the oldest thins away at once;
 * the caster leaves / dies — the fog stays (it is the world's now); an old world / a late joiner — no fog (it is not saved: it thins away within 3 minutes anyway);
 * the hero inside is dead / in space / in hell — the picture's swap is skipped (hell and space have their own skies); FPS: ONE shared dome geometry, a shader program for
 * all (the material cloned only for its uniforms), ONE point cloud for the smoke jets, nothing allocated in the frame.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { FOG, radiusAt, densityAt, aliveAt, insideFog, fogClue, insideView } from './DarkFogRules.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = new THREE.Vector3();
const _dark = new THREE.Color(FOG.DARK);
const NP = 520; // the smoke jets' particles

let _dome = null;
function domeGeo() {
    if (_dome) return _dome;
    _dome = new THREE.SphereGeometry(1, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2);
    _dome.userData.shared = true;
    return _dome;
}

const NOISE = `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const DOME_VS = `
varying vec3 vW; uniform float uTime;
${NOISE}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float n = n3(w.xyz * 0.045 + vec3(0.0, uTime * 0.04, 0.0)) * 0.6 + n3(w.xyz * 0.12 - vec3(uTime * 0.05)) * 0.4;
  vec3 up = normalize(vec3(position.x, position.y * 0.4, position.z));
  w.xyz += (modelMatrix * vec4(up, 0.0)).xyz * (n - 0.5) * 7.0; // (a billowing silhouette)
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DOME_FS = `
varying vec3 vW; uniform float uTime, uAlpha, uSeer;
${NOISE}
void main(){
  float n = n3(vW * 0.06 + vec3(0.0, uTime * 0.05, 0.0)) * 0.55 + n3(vW * 0.17 - vec3(uTime * 0.04)) * 0.3 + n3(vW * 0.5 + vec3(uTime * 0.1)) * 0.15;
  vec3 col = mix(vec3(0.006, 0.003, 0.012), vec3(0.075, 0.025, 0.11), n * n * 1.4);
  float a = uAlpha * (gl_FrontFacing ? (0.9 + 0.1 * n) : (0.28 + 0.3 * n));
  a *= mix(1.0, 0.14, uSeer);
  gl_FragColor = vec4(col, a);
}`;

const PT_VS = `
attribute float aSize; attribute float aAlpha; varying float vA; uniform float uPx;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha; gl_PointSize = clamp(aSize * uPx / max(0.5, -mv.z), 0.0, 900.0); gl_Position = projectionMatrix * mv; }`;
const PT_FS = `
varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float a = vA * (1.0 - r) * (1.0 - r) * 1.6; gl_FragColor = vec4(0.03, 0.012, 0.05, min(0.95, a)); }`;

export class DarkFog {
    constructor(game) {
        this.game = game;
        this.fogs = []; // {id, by, x, y, z, t, mesh, mat, side, wand: Vector3 (the wand's place at the cast), emit}
        this._n = 0;
        this._saved = null;
        this._lastAt = -1e9;
        this._seen = new Map(); // playerId → {x, y, z, t}: where the minds last saw him outside the fog
        this._clue = { x: 0, y: 0, z: 0 };
        // the smoke jets: one point cloud
        this._pos = new Float32Array(NP * 3); this._vel = new Float32Array(NP * 3); this._size = new Float32Array(NP); this._alpha = new Float32Array(NP);
        this._life = new Float32Array(NP); this._age = new Float32Array(NP); this._s1 = new Float32Array(NP);
        this._head = 0;
        this.points = null;
        this._sound = 0;
    }

    // ============================================================ materials / samples
    _domeMat() {
        return new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
            uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.96 }, uSeer: { value: 0 } } });
    }

    _ensurePoints() {
        if (this.points) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
        g.setAttribute('aSize', new THREE.BufferAttribute(this._size, 1));
        g.setAttribute('aAlpha', new THREE.BufferAttribute(this._alpha, 1));
        const m = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, fog: false, uniforms: { uPx: { value: 600 } } });
        this.points = new THREE.Points(g, m);
        this.points.frustumCulled = false;
        this.points.renderOrder = 7;
        this.points.visible = false;
        this.game.scene.add(this.points);
    }

    /** Samples for the shader warm-up (Game.prewarm): the dome and the smoke. */
    sampleMeshes() {
        this._ensurePoints();
        const d = new THREE.Mesh(domeGeo(), this._domeMat()); d.frustumCulled = false; d.scale.set(1, 1, 1);
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([1]), 1)); pg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([1]), 1));
        const p = new THREE.Points(pg, this.points.material); p.frustumCulled = false;
        return [d, p];
    }

    // ============================================================ my side: the word
    cast(isFinal) {
        const g = this.game, ch = g.character;
        if (!isFinal) return null;
        const now = performance.now();
        if (now - this._lastAt < 2500) return null;
        const hint = (t) => { g.hud.setVoice(t, true); return null; };
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('🌑 Поднимите палочку, направьте её туда, где должен лечь туман, и скажите «Caligo»');
        if (g.dismember?.handLost?.(ch, aim.side)) return hint('🌑 Этой руки нет — колдовать ею нельзя');
        if (g.space?.handles) return hint('🌑 В космосе туман не ляжет');
        const tired = g.combat.check('Caligo');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        // where it lies: the ground the wand points at (or 40 m ahead), a house's dome near it is the middle
        const dir = aim.dir.clone().normalize();
        const hit = g.terrain?.data?.raycast?.(aim.origin, dir, FOG.AIM_RANGE);
        const c = new THREE.Vector3();
        if (hit) c.set(hit.x, hit.y, hit.z);
        else { c.copy(aim.origin).addScaledVector(dir, 40); c.y = g.collision?.groundY ? g.collision.groundY(c.x, c.z) : aim.origin.y - 2; }
        let best = null, bd = FOG.SNAP * FOG.SNAP;
        for (const w of g.wards?.list?.values() || []) { const d2 = (w.c.x - c.x) ** 2 + (w.c.z - c.z) ** 2; if (d2 < bd) { bd = d2; best = w; } }
        if (best) c.set(best.c.x, best.gy ?? c.y, best.c.z); // (the house is wrapped)
        g.combat.pay('Caligo');
        this._lastAt = now;
        const toWand = aim.origin.clone().sub(c);
        g.spells.cast('Caligo', c, toWand, aim.side, g.localId);
        g.sync?.spell('Caligo', c, toWand, aim.side);
        g.hud.setVoice('🌑 Тёмный туман выходит из палочки — десять секунд он растёт («стоп» уберёт его)', true);
        return 'Caligo';
    }

    /** «Стоп»: my fogs thin away at once. */
    stopMine() {
        const g = this.game;
        let any = false;
        for (const f of this.fogs) if (f.by === g.localId && f.t < FOG.RELEASE + FOG.HOLD) { f.t = FOG.RELEASE + FOG.HOLD + FOG.FADE * 0.8; any = true; } // (a short fade: ~6 s)
        return any;
    }

    // ============================================================ every computer
    /** The spell arrives: `o` — the fog's middle, `toWand` — the way back to the wand where it was let out. */
    fire(o, toWand, casterId, side) {
        const g = this.game;
        const by = casterId === 'local' ? g.localId : casterId;
        while (this.fogs.length >= FOG.MAX) this._drop(0);
        const mat = this._domeMat();
        const mesh = new THREE.Mesh(domeGeo(), mat);
        mesh.frustumCulled = false; mesh.renderOrder = 5;
        mesh.position.set(o.x, o.y - 1, o.z);
        mesh.scale.set(0.01, 0.01, 0.01);
        g.scene.add(mesh);
        this.fogs.push({ id: by + ':' + (++this._n), by, x: o.x, y: o.y - 1, z: o.z, t: 0, mesh, mat, side: side || 'right', wand: o.clone().add(toWand), emit: 0 });
        this._ensurePoints();
        g.sound?.spellCast?.('Caligo', o.clone().add(toWand));
    }

    _drop(i) {
        const f = this.fogs[i];
        if (!f) return;
        this.game.scene.remove(f.mesh); f.mat.dispose();
        this.fogs.splice(i, 1);
    }

    /** Where the wand of a fog's caster is now (mine: live; another player's hand; else the place at the cast). */
    _wandOf(f, out) {
        const g = this.game;
        if (f.by === g.localId) { const a = castingHand(g); if (a && g.character.isArmRaised(a.side)) return out.copy(a.origin); }
        else { const r = g.remotes?.get(f.by); if (r?.character?.getHandWorldPosition) return r.character.getHandWorldPosition(f.side, out); }
        return out.copy(f.wand);
    }

    update(dt) {
        const g = this.game;
        const tt = performance.now() / 1000;
        const night = !!g.sight?.night;
        for (let i = this.fogs.length - 1; i >= 0; i--) {
            const f = this.fogs[i];
            f.t += dt;
            if (!aliveAt(f.t)) { this._drop(i); continue; }
            const R = radiusAt(f.t);
            f.mesh.scale.set(Math.max(0.01, R), Math.max(0.01, FOG.H * Math.min(1, 0.15 + R / FOG.R)), Math.max(0.01, R));
            f.mat.uniforms.uTime.value = tt;
            f.mat.uniforms.uAlpha.value = 0.96 * densityAt(f.t);
            f.mat.uniforms.uSeer.value = night ? 1 : 0;
            f.mesh.visible = R > 0.5 && f.mesh.position.distanceToSquared(g.camera.position) < (FOG.R * 6) ** 2;
            // the jet: smoke from the wand toward the middle while it is let out
            if (f.t < FOG.RELEASE) {
                f.emit += dt * 48;
                this._wandOf(f, _o);
                while (f.emit >= 1) { f.emit -= 1; this._puff(_o, f); }
            }
        }
        this._stepSmoke(dt);
    }

    _puff(from, f) {
        const i = this._head; this._head = (this._head + 1) % NP;
        const life = 1.5 + Math.random() * 1.2;
        const to = _v.set(f.x + (Math.random() - 0.5) * 24, f.y + 2 + Math.random() * 14, f.z + (Math.random() - 0.5) * 24);
        this._pos[i * 3] = from.x; this._pos[i * 3 + 1] = from.y; this._pos[i * 3 + 2] = from.z;
        _v2.copy(to).sub(from).multiplyScalar(1 / life);
        this._vel[i * 3] = _v2.x; this._vel[i * 3 + 1] = _v2.y + 2; this._vel[i * 3 + 2] = _v2.z;
        this._life[i] = life; this._age[i] = 0; this._s1[i] = 8 + Math.random() * 8;
        this._size[i] = 0.6; this._alpha[i] = 0.6;
    }

    _stepSmoke(dt) {
        let live = 0;
        for (let i = 0; i < NP; i++) {
            if (!(this._life[i] > 0)) { this._alpha[i] = 0; continue; }
            this._age[i] += dt;
            const u = this._age[i] / this._life[i];
            if (u >= 1) { this._life[i] = 0; this._alpha[i] = 0; continue; }
            live++;
            const j = i * 3;
            this._pos[j] += this._vel[j] * dt; this._pos[j + 1] += this._vel[j + 1] * dt; this._pos[j + 2] += this._vel[j + 2] * dt;
            this._vel[j] *= 1 - dt * 0.4; this._vel[j + 1] *= 1 - dt * 0.4; this._vel[j + 2] *= 1 - dt * 0.4;
            this._size[i] = 0.6 + this._s1[i] * Math.sqrt(u);
            this._alpha[i] = u < 0.15 ? u / 0.15 * 0.85 : 0.85 * (1 - (u - 0.15) / 0.85);
        }
        const P = this.points;
        if (!P) return;
        P.visible = live > 0;
        if (live > 0) {
            P.geometry.attributes.position.needsUpdate = true; P.geometry.attributes.aSize.needsUpdate = true; P.geometry.attributes.aAlpha.needsUpdate = true;
            const cam = this.game.camera;
            P.material.uniforms.uPx.value = (this.game.renderer?.domElement?.height || 800) / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
        }
    }

    // ============================================================ the minds
    /** Is `pos` in any fog (for the creatures' eyes)? */
    hides(pos) {
        for (const f of this.fogs) if (insideFog(f, pos.x, pos.y, pos.z)) return true;
        return false;
    }

    /** Invisibility.aiPos asks: where do the minds think player `id` (at `pos`) is? */
    aiPos(id, pos) {
        if (!this.fogs.length) return pos;
        const now = performance.now();
        if (!this.hides(pos)) {
            let s = this._seen.get(id);
            if (!s) this._seen.set(id, s = { x: 0, y: 0, z: 0, t: 0 });
            s.x = pos.x; s.y = pos.y; s.z = pos.z; s.t = now;
            return pos;
        }
        const c = fogClue(true, pos, this._seen.get(id), now);
        if (!c) return null;
        this._clue.x = c.x; this._clue.y = c.y; this._clue.z = c.z;
        return this._clue;
    }

    // ============================================================ the picture inside
    /** Before the frame is drawn: inside a fog the world's fog is swapped for a near black one (the day cycle's values are kept and given back in `end`). */
    begin() {
        const g = this.game, fog = g.scene.fog;
        if (!this.fogs.length || !fog || g.hellRealm?.active || g.space?.handles) return;
        const cam = g.camera.position;
        let inside = false;
        for (const f of this.fogs) if (insideFog(f, cam.x, cam.y, cam.z)) { inside = true; break; }
        // (eased: the picture darkens in about a second, not at a stroke)
        this._k = (this._k || 0) + ((inside ? 1 : 0) - (this._k || 0)) * Math.min(1, (g.lastDt || 1 / 60) * 3);
        if (this._k < 0.01) { this._k = 0; return; }
        const v = insideView(!!g.sight?.night);
        this._saved = { near: fog.near, far: fog.far, r: fog.color.r, g: fog.color.g, b: fog.color.b, bg: g.scene.background && g.scene.background.isColor ? g.scene.background.clone() : null };
        const k = this._k;
        fog.near = fog.near + (v.near - fog.near) * k; fog.far = fog.far + (v.far - fog.far) * k;
        fog.color.lerp(_dark, k * (g.sight?.night ? 0.35 : 1));
        if (this._saved.bg) g.scene.background.copy(fog.color);
    }

    end() {
        const s = this._saved;
        if (!s) return;
        const fog = this.game.scene.fog;
        fog.near = s.near; fog.far = s.far; fog.color.setRGB(s.r, s.g, s.b);
        if (s.bg) this.game.scene.background.copy(s.bg);
        this._saved = null;
    }

    dispose() { for (let i = this.fogs.length - 1; i >= 0; i--) this._drop(i); if (this.points) { this.game.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); this.points = null; } }
}
