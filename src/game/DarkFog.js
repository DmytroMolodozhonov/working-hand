/**
 * DarkFog.js — «Caligo» («Калиго»): the dark mage's fog (the rules and the author's words: DarkFogRules.js).
 *
 *   word  → 50 mana; the wand lets out a great jet of black smoke for 10 s toward the spot it points at (the ground within 70 m; a house's dome of protection near the spot is
 *           taken as the middle, so the fog wraps the house) — the dome of fog grows out of it to R 60 × H 38, STAYS UNTIL «стоп» (the author 06.11: it never thins by itself), then thins away in 6 s.
 *   every computer draws the same fog (the cast goes over the net as `spell Caligo`: o = the middle, d = the way back to the wand).
 *   the picture inside — Game's render calls `begin()` / `end()` round the frame: the world's fog is swapped for a near black one (restored after, so the day cycle never notices);
 *                         a hero with the night gift (Pentagranium Noctis: `g.sight.night`) sees through it — and so does the one who cast it (his own fog only: `f.by`).
 *   the minds — Invisibility.aiPos asks `hides(pos)`: a player in the fog is only «where he was last seen» (DarkFogRules.fogClue).
 *   «стоп» takes down my own fogs (a hero must be able to leave one).
 *
 * «А если»: no fog around (a hero in a cave / under a roof) — the dome is just drawn there, the mind check works the same; two fogs — up to 4, the oldest thins away at once;
 * the caster dies / leaves the game — the fog has nobody to say «стоп»: it thins away; an old world / a late joiner — no fog (it is not saved: it is gone with the session; the picture inside: its skin is not drawn round a hero who is in it (the author saw «a dome»)); (was: …3 minutes anyway);
 * the hero inside is dead / in space / in hell — the picture's swap is skipped (hell and space have their own skies); FPS: ONE shared dome geometry, a shader program for
 * all (the material cloned only for its uniforms), ONE point cloud for the smoke jets, nothing allocated in the frame.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { FOG, radiusAt, densityAt, aliveAt, insideFog, fogClue, insideView } from './DarkFogRules.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = new THREE.Vector3();
const _dark = new THREE.Color(FOG.DARK);
const NP = 640; // the smoke jets' particles
const RIM = 72; // the billows rolling on a dome's skin, for each of the FOG.MAX fogs (one more point cloud)

let _dome = null;
function domeGeo() {
    if (_dome) return _dome;
    _dome = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    _dome.userData.shared = true;
    return _dome;
}

const NOISE = `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;
// (the smoke is READ by its shape: billows with a lit side and a shaded side, thin wisps at the edge, cold violet light on the rim — not one flat black)
const DOME_VS = `
varying vec3 vW; varying vec3 vN; varying float vH; uniform float uTime;
${NOISE}
void main(){
  vH = position.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  float n = n3(w.xyz * 0.045 + vec3(0.0, uTime * 0.04, 0.0)) * 0.6 + n3(w.xyz * 0.12 - vec3(uTime * 0.05)) * 0.4;
  vec3 up = normalize(vec3(position.x, position.y * 0.4, position.z));
  vec3 nrm = normalize((modelMatrix * vec4(up, 0.0)).xyz);
  w.xyz += nrm * (n - 0.5) * 6.0; // (a billowing silhouette)
  vW = w.xyz; vN = nrm;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DOME_FS = `
varying vec3 vW; varying vec3 vN; varying float vH; uniform float uTime, uAlpha, uSeer;
${NOISE}
void main(){
  vec3 p = vW * 0.045 + vec3(0.0, -uTime * 0.05, 0.0);
  vec3 q = p + 1.6 * vec3(fbm(p + vec3(0.0, uTime * 0.03, 0.0)), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(2.1, 7.7, 0.4))); // (domain-warped: curling smoke, not blobs)
  float d = fbm(q * 1.3);
  vec3 sun = normalize(vec3(0.45, 0.8, 0.35));
  float lit = clamp(0.5 + (d - fbm(q * 1.3 + sun * 0.45)) * 5.0, 0.0, 1.0); // (the billow's side toward the sun is lighter: a cheap self-shadow)
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  float rim = pow(1.0 - facing, 2.2);
  float height = clamp(vH, 0.0, 1.0);
  vec3 shade = vec3(0.012, 0.010, 0.018), mid = vec3(0.20, 0.185, 0.225), hi = vec3(0.47, 0.42, 0.52);
  vec3 col = mix(shade, mid, smoothstep(0.1, 0.8, d));
  col = mix(col, hi, lit * smoothstep(0.45, 0.85, d) * (0.45 + 0.55 * height));
  col += vec3(0.20, 0.08, 0.30) * rim * 0.55; // (cold violet light on the edges: the dark mage's own)
  col *= 0.55 + 0.45 * (0.35 + 0.65 * height);
  float wisp = smoothstep(0.22, 0.62, d); // (thin places let the light through)
  float a = uAlpha * (gl_FrontFacing ? mix(0.5, 1.0, wisp) * (1.0 - 0.6 * rim) : (0.20 + 0.28 * wisp));
  a *= mix(1.0, 0.14, uSeer);
  gl_FragColor = vec4(col, a);
}`;

const PT_VS = `
attribute float aSize; attribute float aAlpha; attribute float aSeed; varying float vA; varying float vS; uniform float uPx;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha; vS = aSeed; gl_PointSize = clamp(aSize * uPx / max(0.5, -mv.z), 0.0, 900.0); gl_Position = projectionMatrix * mv; }`;
const PT_FS = `
varying float vA; varying float vS; uniform float uTime;
${NOISE}
void main(){
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float cs = cos(vS * 6.28), sn = sin(vS * 6.28);
  vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs); // (every puff turned its own way)
  float rad = length(c);
  if (rad > 1.0) discard;
  vec3 p = vec3(r * 1.9, vS * 17.0 + uTime * 0.35);
  float n = fbm(p);
  float shape = smoothstep(1.0, 0.25, rad + (n - 0.5) * 0.95); // (a ragged billow, thin at its edges)
  float lit = clamp(0.5 + (n - fbm(p + vec3(0.0, 0.5, 0.0))) * 3.5 + c.y * 0.35, 0.0, 1.0); // (lighter on top)
  vec3 col = mix(vec3(0.015, 0.012, 0.022), vec3(0.30, 0.27, 0.33), lit * (0.35 + 0.65 * n));
  col += vec3(0.14, 0.05, 0.22) * pow(rad, 2.0) * 0.5;
  gl_FragColor = vec4(col, min(0.92, vA * shape * 1.25));
}`;

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
        this._seed = new Float32Array(NP); this._life = new Float32Array(NP); this._age = new Float32Array(NP); this._s1 = new Float32Array(NP);
        this._head = 0;
        this.points = null;
        this.rim = null;
        const NR = RIM * FOG.MAX;
        this._rpos = new Float32Array(NR * 3); this._rsize = new Float32Array(NR); this._ralpha = new Float32Array(NR); this._rseed = new Float32Array(NR);
        for (let i = 0; i < NR; i++) this._rseed[i] = ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1; // (fixed: every computer rolls the same billows)
        this._sound = 0;
    }

    // ============================================================ materials / samples
    _domeMat() {
        return new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
            uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.85 }, uSeer: { value: 0 } } });
    }

    _ensurePoints() {
        if (this.points) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
        g.setAttribute('aSize', new THREE.BufferAttribute(this._size, 1));
        g.setAttribute('aAlpha', new THREE.BufferAttribute(this._alpha, 1));
        g.setAttribute('aSeed', new THREE.BufferAttribute(this._seed, 1));
        const m = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, fog: false, uniforms: { uPx: { value: 600 }, uTime: { value: 0 } } });
        this.points = new THREE.Points(g, m);
        this.points.frustumCulled = false;
        this.points.renderOrder = 7;
        this.points.visible = false;
        this.game.scene.add(this.points);
        const rg = new THREE.BufferGeometry();
        rg.setAttribute('position', new THREE.BufferAttribute(this._rpos, 3));
        rg.setAttribute('aSize', new THREE.BufferAttribute(this._rsize, 1));
        rg.setAttribute('aAlpha', new THREE.BufferAttribute(this._ralpha, 1));
        rg.setAttribute('aSeed', new THREE.BufferAttribute(this._rseed, 1));
        this.rim = new THREE.Points(rg, m); // (the same material: the same puff, bigger and slower)
        this.rim.frustumCulled = false;
        this.rim.renderOrder = 6;
        this.rim.visible = false;
        this.game.scene.add(this.rim);
    }

    /** Samples for the shader warm-up (Game.prewarm): the dome and the smoke. */
    sampleMeshes() {
        this._ensurePoints();
        const d = new THREE.Mesh(domeGeo(), this._domeMat()); d.frustumCulled = false; d.scale.set(1, 1, 1);
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([1]), 1)); pg.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([0.3]), 1)); pg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([1]), 1));
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

    /** «Стоп»: my fogs thin away (the only thing that ever takes a fog down). */
    stopMine() { return this.stopBy(this.game.localId); }

    /** The fogs of player `id` start to thin away (their «стоп» — also from the net; the caster's death / leaving). True if any was standing. */
    stopBy(id) {
        let any = false;
        for (const f of this.fogs) if (f.by === id && !(f.e >= 0)) { f.e = 0; any = true; }
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
        this.fogs.push({ id: by + ':' + (++this._n), by, x: o.x, y: o.y - 1, z: o.z, t: 0, e: -1, mesh, mat, side: side || 'right', wand: o.clone().add(toWand), emit: 0 });
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
            if (f.e >= 0) f.e += dt;
            // (it stays until «стоп»; the caster dead or gone from the game — it is no one's to stop: it thins away)
            if (f.e < 0 && (f.by === g.localId ? (g.combat?.dead || g.isDeadLocal) : (g.remotes && !g.remotes.has(f.by)))) f.e = 0;
            if (!aliveAt(f.t, f.e)) { this._drop(i); continue; }
            const R = radiusAt(f.t, f.e);
            f.mesh.scale.set(Math.max(0.01, R), Math.max(0.01, FOG.H * Math.min(1, 0.15 + R / FOG.R)), Math.max(0.01, R));
            f.mat.uniforms.uTime.value = tt;
            // (inside the dome its skin is not drawn at all — the author saw «a dome» round him; near the rim it fades in as he nears it from inside)
            const cam = g.camera.position, dd = Math.hypot(cam.x - f.x, cam.z - f.z), inner = R * 0.94 - dd, cy = cam.y - f.y;
            const skin = (cy > -6 && cy < FOG.H * 1.1) ? 1 - Math.min(1, Math.max(0, inner / 10)) : 1;
            f.mat.uniforms.uAlpha.value = 0.85 * densityAt(f.t, f.e) * skin;
            f.mat.uniforms.uSeer.value = (night || f.by === g.localId) ? 1 : 0; // (the caster sees through his own fog — the author 06.11)
            f.mesh.visible = R > 0.5 && skin > 0.01 && f.mesh.position.distanceToSquared(g.camera.position) < (FOG.R * 6) ** 2;
            // the jet: smoke from the wand toward the middle while it is let out
            if (f.t < FOG.RELEASE) {
                f.emit += dt * 48;
                this._wandOf(f, _o);
                while (f.emit >= 1) { f.emit -= 1; this._puff(_o, f); }
            }
        }
        this._stepSmoke(dt);
        this._stepRim();
    }

    /** The billows on every dome's skin: fixed places on the dome that drift round it slowly, breathe, and swell with the dome; thin away with it. */
    _stepRim() {
        const P = this.rim;
        if (!P) return;
        const tt = performance.now() / 1000, cam = this.game.camera.position;
        let any = false;
        this._ralpha.fill(0);
        for (let k = 0; k < this.fogs.length; k++) {
            const f = this.fogs[k];
            const R = radiusAt(f.t, f.e), dens = densityAt(f.t, f.e);
            if (R < 3 || dens < 0.02 || !f.mesh.visible) continue;
            if (f.by === this.game.localId || this.game.sight?.night) { /* (the caster / a seer sees through it: fewer, fainter) */ }
            const seer = (f.by === this.game.localId || this.game.sight?.night) ? 0.3 : 1;
            const H = FOG.H * Math.min(1, 0.15 + R / FOG.R);
            any = true;
            for (let n = 0; n < RIM; n++) {
                const i = k * RIM + n, sd = this._rseed[i];
                const th = sd * 6.2832 * 7.0 + tt * (0.012 + sd * 0.02) * (n & 1 ? 1 : -1); // (round the dome)
                const ph = 0.12 + ((sd * 13.7) % 1) * 1.32; // (from the foot to the crown)
                const rr = R * (0.94 + 0.08 * Math.sin(tt * 0.3 + sd * 40));
                this._rpos[i * 3] = f.x + Math.sin(ph) * Math.cos(th) * rr;
                this._rpos[i * 3 + 1] = f.y + Math.cos(ph) * H + Math.sin(tt * 0.25 + sd * 30) * 2;
                this._rpos[i * 3 + 2] = f.z + Math.sin(ph) * Math.sin(th) * rr;
                this._rsize[i] = (14 + ((sd * 7.3) % 1) * 22) * Math.min(1, R / FOG.R + 0.2);
                this._ralpha[i] = 0.5 * dens * seer;
            }
        }
        P.visible = any;
        if (any) {
            P.geometry.attributes.position.needsUpdate = true; P.geometry.attributes.aSize.needsUpdate = true; P.geometry.attributes.aAlpha.needsUpdate = true;
            P.material.uniforms.uTime.value = tt;
        }
    }

    _puff(from, f) {
        const i = this._head; this._head = (this._head + 1) % NP;
        const life = 1.5 + Math.random() * 1.2;
        const to = _v.set(f.x + (Math.random() - 0.5) * 24, f.y + 2 + Math.random() * 14, f.z + (Math.random() - 0.5) * 24);
        this._pos[i * 3] = from.x; this._pos[i * 3 + 1] = from.y; this._pos[i * 3 + 2] = from.z;
        _v2.copy(to).sub(from).multiplyScalar(1 / life);
        this._vel[i * 3] = _v2.x; this._vel[i * 3 + 1] = _v2.y + 2; this._vel[i * 3 + 2] = _v2.z;
        this._life[i] = life; this._age[i] = 0; this._s1[i] = 10 + Math.random() * 10; this._seed[i] = Math.random();
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
            const sd = this._seed[i] * 40, ag = this._age[i];
            this._vel[j] += Math.sin(sd + ag * 1.7) * dt * 5; this._vel[j + 1] += (0.8 + Math.cos(sd * 1.3 + ag * 1.1)) * dt * 2.2; this._vel[j + 2] += Math.cos(sd * 0.7 + ag * 1.5) * dt * 5; // (curling, rising: smoke is not thrown like a stone)
            this._vel[j] *= 1 - dt * 0.4; this._vel[j + 1] *= 1 - dt * 0.4; this._vel[j + 2] *= 1 - dt * 0.4;
            this._size[i] = 0.6 + this._s1[i] * Math.sqrt(u);
            this._alpha[i] = u < 0.15 ? u / 0.15 * 0.85 : 0.85 * (1 - (u - 0.15) / 0.85);
        }
        const P = this.points;
        if (!P) return;
        P.visible = live > 0;
        if (live > 0) {
            P.geometry.attributes.position.needsUpdate = true; P.geometry.attributes.aSize.needsUpdate = true; P.geometry.attributes.aAlpha.needsUpdate = true;
            P.material.uniforms.uTime.value = performance.now() / 1000;
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
        let inside = false, mine = false; // (mine: in a fog I cast myself — I see through it as with the night gift)
        for (const f of this.fogs) if (insideFog(f, cam.x, cam.y, cam.z)) { inside = true; if (f.by === g.localId) mine = true; }
        this._seer = !!g.sight?.night || mine;
        // (eased: the picture darkens in about a second, not at a stroke)
        this._k = (this._k || 0) + ((inside ? 1 : 0) - (this._k || 0)) * Math.min(1, (g.lastDt || 1 / 60) * 3);
        if (this._k < 0.01) { this._k = 0; return; }
        const v = insideView(this._seer);
        this._saved = { near: fog.near, far: fog.far, r: fog.color.r, g: fog.color.g, b: fog.color.b, bg: g.scene.background && g.scene.background.isColor ? g.scene.background.clone() : null };
        const k = this._k;
        fog.near = fog.near + (v.near - fog.near) * k; fog.far = fog.far + (v.far - fog.far) * k;
        fog.color.lerp(_dark, k * (this._seer ? 0.35 : 1));
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

    dispose() { for (let i = this.fogs.length - 1; i >= 0; i--) this._drop(i); if (this.rim) { this.game.scene.remove(this.rim); this.rim.geometry.dispose(); this.rim = null; } if (this.points) { this.game.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); this.points = null; } }
}
