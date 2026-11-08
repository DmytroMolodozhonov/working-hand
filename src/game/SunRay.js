/**
 * SunRay.js — «Sun Ray» («Сан Рей»): the gods' spell that takes the Sun's energy and sends it as a beam. Rules and the author's words: SunRayRules.js.
 *
 * 1. THE WORD, the wand (or the hand) on the Sun: 500 mana (paid here, nothing more later). If the Sun is not above the horizon / is hidden (roof, cave, rain, black clouds) / the
 *    wand does not point at it / this place is too far from it (the damage at this planet is 0) → nothing is paid, a hint says why («Заклинание не достаёт до Солнца»).
 * 2. THE CHARGE (~3 s with the wand kept on the Sun — it may wander a little; lost if it is off the Sun for 4 s): a column of white-gold light comes down out of the Sun into the
 *    wand's tip, sparks of it pouring down the thread, a little sun grows at the tip. Then the charge is held in the wand for 45 s (the tip burns, the hand glows, a hum), the wand
 *    free to turn: «стоп» / a stun / death / a held spell of the same kind lets it go.
 * 3. «АТАК» (the ordinary «Attack»): the wand at the one it wants — the charge goes out as a BURNING BEAM (REACH 420 m, 2.4 s, it follows the wand): a white-hot core in a shell of
 *    gold and orange fire with energy spiralling along it, pulses of shock running out, a blinding flare and rings of heat where it lands, a pillar of sparks and smoke, the ground and
 *    the air shaking, thunder. Everything on its axis is burnt: a TITAN takes the damage of this planet's place in the list (1000 at Mercury, −200 for each next one); any other
 *    creature is burnt to ashes (as by «Дай»); players are not hurt; blocks, ships and water are not touched. The host decides who is hit (the power rides the packet).
 *
 * The same on every computer: «SunRay» (the charge) and «SunRayFire» (the beam) are ordinary spell packets; «стоп»/leaving ends a charge; each computer draws what it sees.
 *
 * «А если» (CLAUDE.md): cast with no mana / no Sun / indoors → not cast, nothing paid; the wand off the Sun while charging → the charge falls back, then is lost; a second word while
 * charging or charged → «already»; «Атак» with nothing charged → the ordinary «Attack» (servants, serpent…); «Атак» with the arm down → a hint; the caster dies / leaves / goes to space or
 * hell → the charge is gone, the beam stops; two casters → each their own; night comes while the charge is held → it stays (the energy is in the wand); the host is not the caster → the
 * damage is decided by the host from the packet; a titan dies by it → its own death (Titans); the beam into a wall → it ends at the wall, burning nothing behind; saved game: nothing is saved.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { skyVisible } from './SkyRules.js';
import { SUNRAY, sunPowerAt, angleDeg, packPower, unpackPower } from './SunRayRules.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const WARM = [0xfff4d0, 0xffd36b, 0xffa63a, 0xffffff];

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;
// a column of light (the thread out of the Sun / the burning beam): ragged edge, white-hot core, energy veins spiralling along it, pulses running
const COL_VS = `
uniform float uTime, uTremble, uLen;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    vec3 p = position;
    float a = atan(p.z, p.x), along = p.y * uLen;
    float j = (vn(vec2(along * 0.18 - uTime * 11.0, a * 2.0)) - 0.5) * uTremble * (0.4 + 0.6 * smoothstep(0.0, 25.0, along));
    p.xz += normalize(p.xz + 1e-5) * j;
    vY = along; vA = a;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}`;
const COL_FS = `
uniform float uTime, uOpacity, uWhite, uDir;
uniform vec3 uCol, uHot;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float ragged = vn(vec2(vA * 4.0 + vY * 0.03, vY * 0.12 - uTime * 8.0));
    float body = pow(f, 1.4 - 0.6 * ragged);
    float core = pow(f, 4.2 - 1.6 * uWhite);
    float spiral = smoothstep(0.55, 0.95, vn(vec2(vA * 3.0 + vY * 0.06 * uDir + uTime * 6.0 * uDir, vY * 0.05 - uTime * 3.0 * uDir)));
    float pulse = 0.78 + 0.22 * sin(vY * 0.16 * uDir - uTime * 13.0 * uDir) + 0.18 * sin(vY * 0.51 - uTime * 21.0 * uDir);
    float grain = 0.86 + 0.14 * vn(vec2(vA * 29.0, vY * 0.9 - uTime * 34.0));
    vec3 col = mix(uCol, uHot, clamp(core * (0.6 + 0.6 * uWhite) + uWhite * 0.35, 0.0, 1.0)) + uHot * spiral * body * 0.7;
    float a = (body * 0.45 + core * 0.85 + spiral * body * 0.55) * pulse * grain * smoothstep(0.0, 3.0, vY);
    gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
}`;
const FLAT_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// the glare (the orb at the wand's tip / the flare where the beam lands): a white core, a gold halo, turning rays
const GLARE_FS = `
uniform float uTime, uK, uRays;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q), a = atan(q.y, q.x);
    float core = exp(-r * r * 26.0);
    float halo = exp(-r * 3.6) * (1.0 - smoothstep(0.75, 1.0, r));
    float rays = pow(0.5 + 0.5 * sin(a * 12.0 + uTime * 2.6 + vn(vec2(a * 2.0, uTime)) * 5.0), 3.0) * exp(-r * 2.6) * (1.0 - smoothstep(0.85, 1.0, r)) * uRays;
    float fl = 0.85 + 0.3 * vn(vec2(uTime * 13.0, 5.0));
    vec3 col = vec3(1.0, 0.72, 0.26) * (halo * 0.8 + rays * 0.9) + vec3(1.0, 0.97, 0.86) * core * 1.6;
    gl_FragColor = vec4(col * uK, clamp((halo * 0.6 + core + rays * 0.7) * fl, 0.0, 1.0) * uK);
}`;
const RING_FS = `
uniform float uOpacity;
varying vec2 vUv;
void main() {
    float r = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.88, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float trail = smoothstep(0.4, 0.96, r) * smoothstep(0.4, 0.96, r) * 0.05;
    gl_FragColor = vec4(mix(vec3(1.0, 0.62, 0.2), vec3(1.0, 0.97, 0.85), edge), (edge + trail * (1.0 - edge)) * uOpacity * step(r, 1.0));
}`;

const shader = (vs, fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }); m.userData.shared = true; return m; };
let _geo = null;
function geos() {
    if (_geo) return _geo;
    const cyl = (rt, rb) => { const g = new THREE.CylinderGeometry(rt, rb, 1, 20, 12, true); g.translate(0, 0.5, 0); g.userData.shared = true; return g; };
    const plane = new THREE.PlaneGeometry(1, 1); plane.userData.shared = true;
    const flat = new THREE.CircleGeometry(1, 48); flat.rotateX(-Math.PI / 2); flat.userData.shared = true;
    _geo = { thread: cyl(1.5, 0.35), shell: cyl(1, 1.15), core: cyl(0.3, 0.34), plane, flat };
    return _geo;
}

const RIGS = 3;
export class SunRay {
    constructor(game) {
        this.game = game;
        this.phase = 'idle'; // MY state: idle | charging | charged
        this.charge = 0; this.held = 0; this.lost = 0;
        this.power = 0;
        this.casters = new Map(); // by → { by, side, t, k (0…1 charge), held, off }
        this.beams = []; // the burning beams: { by, side, t, o, d, E, hit, power, rig }
        this._first = false;
        const G = geos();
        this.group = new THREE.Group(); this.group.frustumCulled = false;
        game.scene.add(this.group);
        const col = (white, c, h) => shader(COL_VS, COL_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uWhite: { value: white }, uDir: { value: 1 }, uTremble: { value: 0.3 }, uLen: { value: 1 }, uCol: { value: new THREE.Color(c) }, uHot: { value: new THREE.Color(h) } });
        this.rigs = Array.from({ length: RIGS }, () => {
            const thread = new THREE.Mesh(G.thread, col(0.2, 0xffb23a, 0xfff2c0));
            const orb = new THREE.Mesh(G.plane, shader(FLAT_VS, GLARE_FS, { uTime: { value: 0 }, uK: { value: 0 }, uRays: { value: 1 } }));
            const shell = new THREE.Mesh(G.shell, col(0, 0xff8a1e, 0xfff0b8)), core = new THREE.Mesh(G.core, col(1, 0xffe08a, 0xffffff));
            const flare = new THREE.Mesh(G.plane, shader(FLAT_VS, GLARE_FS, { uTime: { value: 0 }, uK: { value: 0 }, uRays: { value: 1.4 } }));
            const rings = [0, 1].map(() => { const m = new THREE.Mesh(G.flat, shader(FLAT_VS, RING_FS, { uOpacity: { value: 0 } })); m.visible = false; m.frustumCulled = false; m.renderOrder = 8; return m; });
            for (const m of [thread, orb, shell, core, flare]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 7; }
            this.group.add(thread, orb, shell, core, flare, ...rings);
            return { thread, orb, shell, core, flare, rings, used: false };
        });
    }

    sampleModels() {
        const G = geos(), R = this.rigs[0];
        const out = [new THREE.Mesh(G.thread, R.thread.material), new THREE.Mesh(G.plane, R.orb.material), new THREE.Mesh(G.flat, R.rings[0].material)];
        for (const m of out) m.scale.setScalar(0.01);
        return out;
    }

    get charged() { return this.phase === 'charged'; }
    get busy() { return this.phase !== 'idle'; }

    // ============================================================ the Sun and the power here
    /** The unit vector to the Sun from the hero's place, or null (open space / no Sun above the horizon). */
    sunDir(out = _e) {
        const g = this.game, S = g.space, realm = S?.realm || 'earth';
        if (realm === 'space') return null;
        if (!S?.offEarth || realm === 'earth') { g.world?.trueSun?.(out); return out; }
        const def = S.planets?.get?.(realm), p = g.character.group.position;
        if (!def || !S.localSun) return null;
        out.copy(S.localSun(def, p.x, p.z, S.now())); // (localSun leaves its answer in a scratch vector: copied at once)
        return out;
    }
    /** The damage at the place the hero stands on (0 — the Sun is too far). */
    powerHere() {
        const S = this.game.space, realm = S?.realm || 'earth';
        if (realm === 'space') return 0;
        const list = S?.planets?.list;
        if (!list) return realm === 'earth' ? 600 : 0;
        return sunPowerAt(list, realm === 'earth' ? 'earth' : realm);
    }

    // ============================================================ my side
    /** The word «Sun Ray» (Game._castLocalSpell). → 'SunRay' | null */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.phase !== 'idle') return hint(this.phase === 'charged' ? '☀️ Заряд уже в палочке — направьте её на цель и скажите «Атак»' : '☀️ Энергия Солнца уже набирается — держите палочку на нём');
        if (g.hellGate?.inHell) return hint('☀️ В аду нет неба — Солнца не видно');
        if (g.space?.realm === 'space') return hint('☀️ В открытом космосе энергию Солнца не взять так — сядьте на землю или на планету');
        if (g.imperius?.active || g.dragonForm?.active || g.monster?.active) return hint('☀️ В этом теле энергию Солнца не взять');
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('☀️ Поднимите руку (палочку) и направьте её на Солнце — и скажите «Sun Ray»');
        const power = this.powerHere();
        if (!(power > 0)) return hint('☀️ Заклинание не достаёт до Солнца — отсюда его энергию не взять');
        const sun = this.sunDir();
        if (!sun || sun.y < SUNRAY.MIN_ELEV) return hint('☀️ Солнца нет на небе — энергию взять неоткуда');
        const p = ch.group.position;
        if (skyVisible(g, p.x, p.y, p.z, { underwater: !!g.swim?.underwater })) return hint('☀️ Солнце отсюда не видно — выйдите под открытое небо');
        if ((g.storm?.raining && g.storm.k > 0.5) || g.gargoyles?.cloudsOver?.(p) || g.vampire?.cloudsOver?.(p)) return hint('☀️ Солнце закрыто тучами — энергию не взять');
        if (angleDeg(aim.dir, sun) > SUNRAY.AIM_DEG) return hint('☀️ Направьте палочку прямо на Солнце — и скажите «Sun Ray»');
        const tired = g.combat.check('SunRay');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('SunRay');
        this.phase = 'charging'; this.charge = 0; this.held = 0; this.lost = 0; this.power = power;
        const o = _v.set(p.x, p.y - 1.9, p.z).clone();
        g.spells.cast('SunRay', o, _d.set(0, 1, 0), aim.side, g.localId);
        g.sync?.spell('SunRay', o, _d.set(0, 1, 0), aim.side);
        g.hud.setVoice('☀️ <span style="color:#ffd36b">Sun Ray!</span> Держите палочку на Солнце — энергия идёт в неё…', true);
        return 'SunRay';
    }

    /** «Атак» with the charge in the wand (Game._castLocalSpell, before the other «Attack»s). → 'SunRay' | null (not mine / hint) */
    attack(isFinal) {
        const g = this.game, ch = g.character;
        if (this.phase !== 'charged') return undefined;
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) { if (isFinal) g.hud.setVoice('☀️ Поднимите палочку и направьте её на цель — и скажите «Атак»', true); return null; }
        const d = aim.dir.clone().normalize(), o = aim.origin.clone();
        this.phase = 'idle'; this.charge = 0; this.held = 0;
        const dp = d.clone().multiplyScalar(packPower(this.power));
        g.spells.cast('SunRayFire', o, dp, aim.side, g.localId);
        g.sync?.spell('SunRayFire', o, dp, aim.side);
        g.hud.setVoice('☀️ <span style="color:#ffd36b">Энергия Солнца!</span>', true);
        return 'SunRayFire'; // (its own sound: SpellMusic.SPELL_SOUND.SunRayFire; «SunRay» is the charge)
    }

    /** «стоп» / a broken concentration / death: let the charge go. true when there was one. */
    cancel(why = 'stop') {
        if (this.phase === 'idle') return false;
        this.phase = 'idle'; this.charge = 0; this.held = 0;
        const c = this.casters.get(this.game.localId);
        if (c) c.off = 0;
        if (why !== 'quiet') { this.game.hud.setVoice(why === 'lost' ? '☀️ Солнце ускользнуло от палочки — заряд пропал' : why === 'time' ? '☀️ Заряд рассеялся в палочке' : '☀️ Энергия Солнца ушла', true); this.game.sync?.stopSpells?.(); }
        this.game.sound?.playSpellFx?.('fxStop', null, 0.6, 0.8);
        return true;
    }

    // ============================================================ every computer
    /** The charge begins (a spell packet): `o` — the caster's feet. */
    start(o, d, casterId, side) {
        const g = this.game, by = casterId === 'local' || casterId == null ? g.localId : casterId;
        this.casters.set(by, { by, mine: by === g.localId, side: side || 'right', t: 0, k: 0, held: false, off: null, seen: performance.now() });
    }
    stopBy(id) {
        const c = this.casters.get(id);
        if (c && c.off == null) c.off = 0;
        if (id === this.game.localId) this.phase = 'idle';
    }

    /** The beam (a spell packet): `o` — the wand's tip, `d` — the direction × (1 + power/5000). */
    fire(o, d, casterId, side) {
        const g = this.game, by = casterId === 'local' || casterId == null ? g.localId : casterId;
        const power = unpackPower(d.length());
        const dir = d.clone().normalize();
        const c = this.casters.get(by); if (c) c.off = 0; // (the charge is spent)
        if (by === g.localId) { this.phase = 'idle'; }
        const rig = this.rigs.find((r) => !r.used);
        if (!rig) return;
        rig.used = true;
        const B = { by, side: side || 'right', t: 0, o: o.clone(), d: dir, E: o.clone().addScaledVector(dir, 40), len: 40, power, rig, hurt: false, burn: 0, shock: 0 };
        this.beams.push(B);
        const fx = g.fx;
        g.sound?.playSpellFx?.('fxSunRayFire', o, 1, 1);
        g.space?._overlay?.('white', 0.4);
        fx?.lightFlash?.(o, 0xffe08a, 7, 0.7, 120);
        if (fx) for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14; fx.spark(_a.copy(o), WARM[i % 4], 0.18, _b.set(Math.cos(a) * sp, (Math.random() - 0.3) * sp, Math.sin(a) * sp), 0.9); }
        if (g.authority) setTimeout(() => this._damage(B), 160); // (the host burns who is on the axis — a moment into the beam, once)
    }

    /** The ray from the wand: how far it goes before a solid thing (stepped every 2 m), the end point into `out`. */
    _reachOf(o, d, out) {
        const g = this.game;
        let L = SUNRAY.REACH;
        for (let k = 2; k < SUNRAY.REACH; k += 2) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            if (g._flameBlock?.(x, y, z) === 'solid') { L = k; break; }
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : -Infinity;
            if (Number.isFinite(gy) && y < gy - 0.3) { L = k; break; }
        }
        out.copy(o).addScaledVector(d, L);
        return L;
    }

    /** (host) Burn what is on the axis: a titan — the damage of its planet's place; the others — to ashes; players, never. */
    _damage(B) {
        const g = this.game;
        if (!g.authority || !g.duel?._bodies) return;
        const bodies = g.duel._bodies(null, SUNRAY.REACH + 10, false);
        const len = this._reachOf(B.o, B.d, _c);
        let hits = 0;
        for (const b of bodies) {
            if (b.kind === 'p') continue; // (players: not hurt)
            // the closest approach of the axis to the body's own axis (a capsule: sampled along it)
            let best = Infinity, at = 0;
            for (let i = 0; i <= 4; i++) {
                _a.copy(b.a).lerp(b.b, i / 4).sub(B.o);
                const t = Math.max(0, Math.min(len, _a.dot(B.d)));
                const dd = _a.addScaledVector(B.d, -t).length();
                if (dd < best) { best = dd; at = t; }
            }
            if (best > b.r + SUNRAY.WIDTH) continue;
            hits++;
            _b.copy(B.o).addScaledVector(B.d, at);
            if (b.kind === 'W') { const T = g.titans?.byId(b.id); if (T) g.titans.hit(T, B.power, null, B.by, 'SunRay', _b.clone()); continue; }
            const body = b.kind === 'z' ? g.zombieById?.get(b.id) : g.duel._creature?.(b.kind, b.id);
            if (body) g.duel.applyToCreature('Die', body, B.by, B.o.clone()); // (to ashes, through any shield — as «Дай»)
        }
        g.castleLife?.alarm?.(_c.copy(B.o).addScaledVector(B.d, Math.min(len, 60)), 'blast', B.by, 70);
        if (hits && (B.by === g.localId || B.by === 'local')) { if (!this._first) { this._first = true; g.mana?.success?.('SunRay'); } }
        else if (hits) this._first = this._first || false;
    }

    // ============================================================ the picture
    _tip(by, side, out) {
        const g = this.game;
        if (by === g.localId || by === 'local') { const h = castingHand(g); if (h) { out.copy(h.origin); return h.dir; } return null; }
        const h = g.handPose?.(by, side);
        if (h) { out.copy(h.origin); return h.dir; }
        const r = g.remotes?.get(by);
        if (r?.position) { out.set(r.position.x, r.position.y + 1.4, r.position.z); return _d.set(0, 1, 0); }
        return null;
    }

    update(dt) {
        const g = this.game;
        // MY charge: the wand kept on the Sun fills it; off the Sun it falls back and is lost
        if (this.phase !== 'idle') {
            const ch = g.character;
            if (g.combat?.dead || g.isDeadLocal || g.hellGate?.inHell || g.space?.realm === 'space' || g.imperius?.active) this.cancel('quiet');
            else if (this.phase === 'charging') {
                const aim = castingHand(g), sun = this.sunDir();
                const on = !!aim && ch.isArmRaised(aim.side) && !!sun && sun.y > 0 && angleDeg(aim.dir, sun) < SUNRAY.HOLD_DEG;
                if (on) { this.charge += dt / SUNRAY.CHARGE_T; this.lost = 0; } else { this.lost += dt; this.charge = Math.max(0, this.charge - dt * 0.3); }
                if (this.lost > SUNRAY.LOSE_T) this.cancel('lost');
                else if (this.charge >= 1) { this.charge = 1; this.phase = 'charged'; this.held = 0; g.hud.setVoice('☀️ Заряд набран — направьте палочку на цель и скажите «Атак»', true); g.fx?.lightFlash?.(castingHand(g)?.origin || ch.group.position, 0xffe08a, 4, 0.5, 40); }
            } else {
                this.held += dt;
                if (this.held > SUNRAY.HOLD_T) this.cancel('time');
            }
        }
        // the charging casters (everybody's): the thread, the orb
        const now = performance.now();
        let ri = 0;
        for (const rig of this.rigs) if (!rig.used) { rig.thread.visible = rig.orb.visible = false; rig.shell.visible = rig.core.visible = rig.flare.visible = false; rig.rings.forEach((r) => { if (r.userData.age == null) r.visible = false; }); }
        for (const [by, c] of this.casters) {
            c.t += dt;
            if (c.mine) { c.k = this.phase === 'idle' ? c.k : Math.min(1, this.charge); c.held = this.phase === 'charged'; if (this.phase === 'idle' && c.off == null) c.off = 0; }
            else { c.k = Math.min(1, c.t / SUNRAY.CHARGE_T); c.held = c.k >= 1; if (c.t > SUNRAY.CHARGE_T + SUNRAY.HOLD_T + 5 && c.off == null) c.off = 0; if (!g.remotes?.get(by) && now - c.seen > 12000 && c.off == null) c.off = 0; else c.seen = g.remotes?.get(by) ? now : c.seen; }
            if (c.off != null) { c.off += dt; if (c.off > 0.7) { this.casters.delete(by); continue; } }
            const rig = this.rigs.slice().reverse().find((r) => !r.used && !r.taken) || null;
            if (!rig || ri >= RIGS) continue;
            rig.taken = true; ri++;
            this._drawCharge(rig, c, dt);
        }
        for (const rig of this.rigs) rig.taken = false;
        // the burning beams
        for (let i = this.beams.length - 1; i >= 0; i--) {
            const B = this.beams[i];
            B.t += dt;
            if (B.t > SUNRAY.BEAM_T + 0.6) { B.rig.used = false; B.rig.shell.visible = B.rig.core.visible = B.rig.flare.visible = false; B.rig.rings.forEach((r) => { r.visible = false; r.userData.age = null; }); this.beams.splice(i, 1); continue; }
            this._drawBeam(B, dt);
        }
    }

    _drawCharge(rig, c, dt) {
        const g = this.game, tip = this._tip(c.by, c.side, _a);
        if (!tip) { rig.thread.visible = rig.orb.visible = false; return; }
        const sun = c.mine ? this.sunDir(_b) : this.sunDir(_b);
        if (!sun) { rig.thread.visible = rig.orb.visible = false; return; }
        const fade = c.off != null ? Math.max(0, 1 - c.off / 0.7) : 1;
        const k = Math.max(0.05, c.k) * fade, t = c.t;
        // the thread: out of the Sun down into the wand's tip (it comes from the Sun's direction, not the wand's: the energy is taken, not shot)
        const L = 260;
        rig.thread.visible = true;
        rig.thread.position.copy(_a);
        _q.setFromUnitVectors(UP, _c.copy(sun).normalize());
        rig.thread.quaternion.copy(_q);
        const w = (0.25 + 0.75 * k) * (1 + 0.08 * Math.sin(t * 17));
        rig.thread.scale.set(w, L, w);
        const u = rig.thread.material.uniforms;
        u.uTime.value = t; u.uOpacity.value = (c.held ? 0.5 : 0.25 + 0.55 * k) * fade; u.uLen.value = L; u.uDir.value = -1; u.uTremble.value = 0.5; // (the pulses run DOWN the thread, into the wand)
        // the orb at the tip: grows as the charge fills, breathes when it is held
        rig.orb.visible = true;
        rig.orb.position.copy(_a);
        if (g.camera) rig.orb.quaternion.copy(g.camera.quaternion);
        const R = (0.5 + 2.6 * k) * (c.held ? 1 + 0.12 * Math.sin(t * 9) : 1);
        rig.orb.scale.set(R * 2, R * 2, 1);
        const ou = rig.orb.material.uniforms; ou.uTime.value = t; ou.uK.value = (0.45 + 0.55 * k) * fade;
        // the sparks pouring down the thread, light on the hand
        const fx = g.fx;
        if (fx && fade > 0.3) {
            c.acc = (c.acc || 0) + dt * (30 + 90 * k);
            while (c.acc >= 1) {
                c.acc -= 1;
                const s = 6 + Math.random() * 200, a = Math.random() * Math.PI * 2, r = (0.2 + s * 0.004) * (0.4 + Math.random());
                _e.copy(_a).addScaledVector(_c, s); _e.x += Math.cos(a) * r; _e.z += Math.sin(a) * r;
                fx.spark(_e, WARM[(Math.random() * 4) | 0], 0.08 + Math.random() * 0.1, _v.copy(_c).multiplyScalar(-(25 + Math.random() * 30)), s / 40);
            }
        }
        g.fireLights?.want(_a.x, _a.y, _a.z, (1.2 + 3 * k) * fade);
    }

    _drawBeam(B, dt) {
        const g = this.game, R = B.rig, t = B.t, fx = g.fx;
        // it follows the wand while it burns
        const tip = this._tip(B.by, B.side, _a);
        if (tip && t < SUNRAY.BEAM_T) { B.o.copy(_a); B.d.lerp(_d.copy(tip).normalize(), 0.35).normalize(); }
        B.len = this._reachOf(B.o, B.d, B.E);
        const env = t < 0.18 ? t / 0.18 : t > SUNRAY.BEAM_T ? Math.max(0, 1 - (t - SUNRAY.BEAM_T) / 0.6) : 1;
        const pulse = 1 + 0.1 * Math.sin(t * 31) + 0.06 * Math.sin(t * 53);
        _q.setFromUnitVectors(UP, B.d);
        for (const [m, w, op, tr] of [[R.shell, 3.6, 0.8, 0.9], [R.core, 1.1, 1.0, 0.35]]) {
            m.visible = env > 0.01;
            m.position.copy(B.o); m.quaternion.copy(_q);
            const ww = w * env * pulse;
            m.scale.set(ww, B.len, ww);
            const u = m.material.uniforms; u.uTime.value = t; u.uOpacity.value = op * env; u.uLen.value = B.len; u.uDir.value = 1; u.uTremble.value = tr * (0.5 + env);
        }
        // the flare where it lands: a blinding glare, rings of heat on the ground
        R.flare.visible = env > 0.01;
        R.flare.position.copy(B.E);
        if (g.camera) R.flare.quaternion.copy(g.camera.quaternion);
        const FS = 26 * env * pulse;
        R.flare.scale.set(FS * 2, FS * 2, 1);
        const fu = R.flare.material.uniforms; fu.uTime.value = t; fu.uK.value = env;
        B.shock -= dt;
        if (B.shock <= 0 && env > 0.3) { B.shock = 0.38; const ring = R.rings.find((r) => r.userData.age == null) || R.rings[0]; ring.userData.age = 0; ring.visible = true; ring.position.set(B.E.x, B.E.y + 0.15, B.E.z); }
        for (const ring of R.rings) {
            if (ring.userData.age == null) continue;
            ring.userData.age += dt;
            const a = ring.userData.age / 1.4;
            if (a >= 1) { ring.userData.age = null; ring.visible = false; continue; }
            ring.scale.setScalar(4 + 70 * (1 - Math.pow(1 - a, 2.2)));
            ring.material.uniforms.uOpacity.value = Math.pow(1 - a, 1.6) * 0.8 * env;
        }
        if (fx && env > 0.05) {
            // the pillar of sparks and smoke at the landing, sparks along the beam
            B.burn += dt * (90 * env);
            while (B.burn >= 1) {
                B.burn -= 1;
                const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 26;
                fx.spark(_e.copy(B.E), WARM[(Math.random() * 4) | 0], 0.2 + Math.random() * 0.4, _v.set(Math.cos(a) * sp * 0.5, 14 + Math.random() * 40, Math.sin(a) * sp * 0.5), 0.8 + Math.random() * 1.3);
                if (Math.random() < 0.35) fx.spark(_e.copy(B.E), 0x2a2620, 0.8 + Math.random() * 1.2, _v.set(Math.cos(a) * 3, 6 + Math.random() * 10, Math.sin(a) * 3), 2 + Math.random() * 1.6); // (smoke)
            }
            for (let i = 0; i < 6; i++) { // (sparks off the beam's body)
                const s = Math.random() * B.len, a = Math.random() * Math.PI * 2;
                fx.spark(_e.copy(B.o).addScaledVector(B.d, s), WARM[(Math.random() * 4) | 0], 0.14, _v.set(Math.cos(a) * 5, 2 + Math.random() * 6, Math.sin(a) * 5), 0.6);
            }
            g.fireLights?.want(B.E.x, B.E.y + 3, B.E.z, 7 * env);
            g.fireLights?.want(B.o.x, B.o.y, B.o.z, 4 * env);
            const c = g.camera?.position;
            if (c) fx.shake = Math.max(fx.shake || 0, 0.35 * env * Math.max(0, 1 - Math.hypot(c.x - B.E.x, c.z - B.E.z) / 260));
        }
        if (t < 0.05 && !B._thunder) { B._thunder = true; setTimeout(() => g.sound?.playThunder?.(0.9), 120); }
    }

    dispose() {
        this.casters.clear(); this.beams.length = 0; this.phase = 'idle';
        this.game.scene.remove(this.group);
        for (const r of this.rigs) for (const m of [r.thread, r.orb, r.shell, r.core, r.flare, ...r.rings]) m.material.dispose();
    }
}
