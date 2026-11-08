/**
 * Helios.js — «Helios» («Гелиос»): the gods' spell that lights up a planet — a Sun of one's own over the caster. Only on the other planets, only from the gods' library.
 *
 * The author 07.11: «новое заклинание, которое работает только на планетах. Божественное, позволяет симулировать Солнце. Игрок поднимает руку вверх (палочку или руку) и
 * произносит заклинание, крутая магия — появляется большой свет. Он позволит реально очень-очень много осветить, особенно на таких планетах помогает. 500 маны и 3 в секунду.»
 *
 * How it plays: the wand (or the hand) raised to the sky + the word → 500 mana at once, then 3 a second (HELD: concentration; «стоп» puts it out). A thread of gold light
 * runs up from the wand to a spot `HELIOS.HEIGHT` m above, the sky flashes, a wave of light runs out over the ground — and a SUN IGNITES there: a great boiling disc with a granular
 * surface, spots, a corona and turning rays. It hangs over the caster and FOLLOWS him (slowly: `HELIOS.FOLLOW` m/s), so whoever walks keeps their daylight.
 * What it does to the world (only the picture and the light — it burns nobody, and no heat: it is a light, not a star): within `R_FULL` m of it the planet is in FULL DAYLIGHT,
 * fading to the planet's own light at `R_FADE` m (the sky, the fog, the ambient light, the shadows all turn — `Space._planetSky` asks `lightAt`); the shadows fall from it;
 * a titan of the shade sees a light there (Titans._myLook), the iron titan has a Sun over it (Titans.sunAt) — the spell lights the foe too.
 * End: «стоп», no mana, a stun / a knock-down (Concentration.lose), death, going into space / to the Earth, leaving → the Sun goes out in `FADE` s (shrinks, cools, goes dark).
 *
 * The same on every computer: the cast goes as an ordinary spell (`spell Helios`), «стоп» as `stop`, a player leaving ends his Sun; each computer draws the Sun and lights ITS player
 * from the position of the caster's body (the avatar). Nothing is saved (a held spell ends with the session).
 *
 * «А если»: cast on the Earth / in open space / in hell → not cast (a hint, nothing paid: Space.spaceSpellBlock); no mana → not cast; flying / swimming / in another body → allowed
 * except Imperius / a dragon form (the hand is not yours); two casters → each their own Sun (the light of the nearer wins — no doubling, `lightAt` takes the strongest);
 * a second «Helios» while on → «already», nothing paid; two Suns near each other → one light (max); the caster flies away fast → the Sun lags behind him (28 m/s) and his daylight
 * fades gently (R_FADE) instead of vanishing; a planet without sky (Mercury: black) → the ground and everything on it lit, the sky stays black (it is space there); night on the
 * planet → the Sun is the day; a terraformed planet's own clouds etc.: untouched; the world's save: nothing; MAX_T 30 min — nothing holds for ever (a guard); the caster dies → off at once.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { aimedAtSky } from '../fx/Storm.js';

export const HELIOS = {
    DRAIN: 3, // mana a second (the cost at once: Combat.SPELL_COST.Helios — 500)
    HEIGHT: 150, // m above the caster
    SUN_R: 17, // m: the disc's radius
    R_FULL: 260, // m: full daylight within this of the Sun (horizontally)
    R_FADE: 600, // m: no more light than the planet's own beyond this
    FOLLOW: 28, // m/s
    IGNITE: 3.2, // s: from the thread of light to a full Sun
    FADE: 3.5, // s: going out
    MAX_T: 1800, // s: a guard
    LOW_MANA: 30, // warned once
    FIRST: 10, // cells of the mana maximum at the first real light (Mana.FIRST_SPELL.Helios)
};

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/helios.test.js. */
export const HELIOS_TARGETS = {
    world: { does: 'light', why: 'вокруг Солнца — полный дневной свет (небо, туман, тени): до 260 м полностью, до 600 м плавно возвращается к свету самой планеты' },
    me: { does: 'follow', why: 'Солнце висит над заклинателем и идёт за ним (28 м/с); 500 маны сразу и 3 в секунду' },
    players: { does: 'light', why: 'каждый компьютер рисует Солнце и освещает своего игрока от тела заклинателя; всем в радиусе виден день' },
    zombies: { does: 'none', why: 'не действует: это свет, а не жар — никого не жжёт' }, castlePeople: { does: 'none', why: 'не действует' },
    animals: { does: 'none', why: 'не действует' }, sailors: { does: 'none', why: 'не действует' },
    titans: { does: 'light', why: 'Железный титан видит Солнце над собой (его луч и накал работают); Титан-тень видит свет и замирает, когда на неё смотрят; остальных не трогает' },
    vampire: { does: 'none', why: 'граф и его замок — на Земле, а Helios там не колдуется' },
    ghosts: { does: 'none', why: 'призраки — Земля; не действует' },
    fire: { does: 'none', why: 'не греет и не поджигает: это свет, не звезда' },
    water: { does: 'none', why: 'воду не испаряет' },
    blocks: { does: 'none', why: 'ничего не ломает и не плавит; лёд, снег и растения не трогает' },
    earth: { does: 'none', why: 'на Земле не колдуется — у неё своё Солнце (Space.spaceSpellBlock)' },
    space: { does: 'none', why: 'в открытом космосе не колдуется — нужна поверхность планеты (Space.spaceSpellBlock)' },
    hell: { does: 'none', why: 'в аду не колдуется — там Земля под землёй, а не планета' },
    spells: { does: 'none', why: 'другие заклинания идут как обычно (кроме тех, что требуют концентрации: «сначала стоп»)' },
};

/** The share of the Sun's light (0…1) at horizontal distance `d` m: full inside R_FULL, falling smoothly to 0 at R_FADE. Pure. */
export function lightShare(d) {
    if (!(d < HELIOS.R_FADE)) return 0;
    if (d <= HELIOS.R_FULL) return 1;
    const t = (d - HELIOS.R_FULL) / (HELIOS.R_FADE - HELIOS.R_FULL);
    return 1 - t * t * (3 - 2 * t);
}
/** The Sun's own size in its life (0…1): 0 before the cast, rising over IGNITE, 1 held, falling over FADE after the end. Pure. */
export function sunSize(age, offAge) {
    const up = Math.max(0, Math.min(1, (age - 0.8) / HELIOS.IGNITE));
    const k = up * up * (3 - 2 * up);
    if (offAge == null) return k;
    const dn = Math.max(0, 1 - offAge / HELIOS.FADE);
    return k * dn * dn;
}
/** Where a Planet's artificial Sun is relative to a point: the horizontal move this frame (follow the caster, at most `max` m/s). Pure. */
export function followStep(sx, sz, tx, tz, dt, max = HELIOS.FOLLOW) {
    const dx = tx - sx, dz = tz - sz, d = Math.hypot(dx, dz);
    if (d < 1e-6) return [sx, sz];
    const m = Math.min(d, max * dt, d * Math.min(1, dt * 1.2) + 0.0);
    return [sx + dx / d * m, sz + dz / d * m];
}

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;
const FLAT_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// the disc: a boiling surface — granulation cells, dark spots, bright faculae, limb darkening, a slow turning
const DISC_FS = `
uniform float uTime, uK;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    if (r > 1.0) discard;
    float z = sqrt(1.0 - r * r);                                 // (the sphere's height: the surface turns away at the edge)
    vec2 p = q / (0.35 + 0.65 * z) * 3.2;                        // (cells shrink toward the limb — the foreshortening)
    float rot = uTime * 0.05;
    p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
    float gran = fbm(p * 2.6 + uTime * 0.25) * 0.65 + fbm(p * 7.0 - uTime * 0.6) * 0.35;
    float cells = smoothstep(0.35, 0.8, gran);
    float spot = smoothstep(0.74, 0.9, fbm(p * 0.7 + 3.0)) * (1.0 - smoothstep(0.0, 0.8, r));
    float fac = smoothstep(0.62, 0.85, fbm(p * 1.3 - uTime * 0.05)) * smoothstep(0.5, 0.95, r);
    float limb = pow(z, 0.55);
    vec3 hot = vec3(1.0, 0.97, 0.82), mid = vec3(1.0, 0.78, 0.3), cool = vec3(0.95, 0.45, 0.12);
    vec3 col = mix(cool, mid, cells);
    col = mix(col, hot, pow(z, 2.0) * 0.55 + fac * 0.5);
    col *= 1.0 - spot * 0.75;
    col *= 0.62 + 0.55 * limb;
    gl_FragColor = vec4(col * (0.9 + 0.25 * uK), uK);
}`;
// the corona and the rays: a soft glow, long rays turning slowly, short flickering prominences at the edge
const CORONA_FS = `
uniform float uTime, uK;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q), a = atan(q.y, q.x);
    float core = smoothstep(0.17, 0.1, r);
    float glow = exp(-r * 3.1) * 1.1 + exp(-r * 8.0) * 1.2;
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.12 + vn(vec2(a * 2.0, uTime * 0.08)) * 6.0), 4.0) * exp(-r * 2.5);
    float rays2 = pow(0.5 + 0.5 * sin(a * 21.0 - uTime * 0.2 + 1.3), 8.0) * exp(-r * 3.6);
    float flare = smoothstep(0.12, 0.2, r) * smoothstep(0.42, 0.18, r) * smoothstep(0.55, 0.9, vn(vec2(a * 5.0 + uTime * 0.4, uTime * 0.7)));   // (prominences)
    float edge = 1.0 - smoothstep(0.8, 1.0, r);
    vec3 col = vec3(1.0, 0.82, 0.45) * (glow * 0.75 + rays * 0.55 + rays2 * 0.35 + flare * 1.4) + vec3(1.0, 0.97, 0.88) * (glow * 0.5);
    float al = clamp((glow * 0.8 + rays * 0.5 + rays2 * 0.3 + flare * 0.9) * edge, 0.0, 1.0) * uK;
    gl_FragColor = vec4(col * uK, al * (1.0 - core * 0.0));
}`;

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
let _geo = null;
function geo() { return _geo || (_geo = (() => { const g = new THREE.PlaneGeometry(1, 1); g.userData.shared = true; return g; })()); }
const shader = (fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: FLAT_VS, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }); m.userData.shared = true; return m; };

export class Helios {
    constructor(game) {
        this.game = game;
        this.suns = new Map(); // caster id → { by, mine, x, z, y, tx, tz, age, offAge|null, seen }
        this.on = false; // MY Sun is lit
        this._warned = false; this._first = false; this._fx = 0;
        const G = geo();
        this.group = new THREE.Group(); this.group.visible = false;
        this.discMat = shader(DISC_FS, { uTime: { value: 0 }, uK: { value: 0 } });
        this.coronaMat = shader(CORONA_FS, { uTime: { value: 0 }, uK: { value: 0 } });
        this.haloMat = shader(CORONA_FS, { uTime: { value: 0.5 }, uK: { value: 0 } });
        this.halo = new THREE.Mesh(G, this.haloMat); this.corona = new THREE.Mesh(G, this.coronaMat); this.disc = new THREE.Mesh(G, this.discMat);
        for (const [m, o] of [[this.halo, 5], [this.corona, 6], [this.disc, 7]]) { m.frustumCulled = false; m.renderOrder = o; this.group.add(m); }
        game.scene.add(this.group);
        this.pool = []; // (a Sun's meshes are one group; two suns at once reuse it for the nearer — the other is only light)
    }

    sampleModels() {
        const out = [new THREE.Mesh(geo(), this.discMat), new THREE.Mesh(geo(), this.coronaMat)];
        for (const m of out) m.scale.setScalar(0.01);
        return out;
    }

    get active() { return this.suns.size > 0; }

    // ============================================================ my side: the word
    /** Voice on my computer. → 'Helios' (cast) | null. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        const S = g.space, realm = S?.realm;
        if (!S?.offEarth || !realm || realm === 'earth') return hint('☀️ «Helios» работает только на других планетах — на Земле у вас есть настоящее Солнце');
        if (realm === 'space' || !S.planets?.get?.(realm)) return hint('☀️ «Helios» зажигается над поверхностью планеты — сядьте на неё');
        if (this.on) return hint('☀️ Ваше Солнце уже горит. «Стоп» — погасить его');
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('☀️ Поднимите руку (или палочку) к небу и скажите «Helios»');
        if (!aimedAtSky(aim.dir, 0.5)) return hint('☀️ Направьте руку или палочку вверх, к небу — и скажите «Helios»');
        if (g.imperius?.active || g.dragonForm?.active || g.monster?.active) return hint('☀️ В этом теле Солнце не зажечь');
        const tired = g.combat.check('Helios');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Helios');
        this.on = true; this._warned = false;
        const p = ch.group.position, o = _v.set(p.x, p.y - 1.9, p.z).clone();
        g.spells.cast('Helios', o, _d.set(0, 1, 0), aim.side, g.localId);
        g.sync?.spell('Helios', o, _d.set(0, 1, 0), aim.side);
        g.hud.setVoice('☀️ <span style="color:#ffd36b">Helios!</span> Над вами зажигается Солнце. «Стоп» — погасить; мана уходит по капле', true);
        return 'Helios';
    }

    /** «стоп» / a broken concentration / no mana: true when mine was on. */
    stop(why = 'stop') {
        if (!this.on) return false;
        this.on = false;
        const S = this.suns.get(this.game.localId);
        if (S && S.offAge == null) S.offAge = 0;
        const g = this.game;
        g.perf?.note?.('☀️ Helios: погашен' + (why ? ' (' + why + ')' : ''));
        if (why === 'mana') g.hud.setVoice('☀️ Мана кончилась — Солнце гаснет', true);
        else if (why === 'stop') g.hud.setVoice('☀️ Солнце гаснет', true);
        g.sound?.playSpellFx?.('fxStop', null, 0.6, 0.8);
        if (why !== 'dispose') g.sync?.stopSpells?.();
        return true;
    }

    // ============================================================ every computer
    /** The cast arrives: `o` — the caster's feet. */
    fire(o, d, casterId, side) {
        const g = this.game, by = casterId === 'local' || casterId == null ? g.localId : casterId;
        const prev = this.suns.get(by);
        const S = prev && prev.offAge == null ? prev : { by, mine: by === g.localId, x: o.x, z: o.z, y: o.y, tx: o.x, tz: o.z, age: 0, offAge: null, seen: performance.now(), side: side || 'right' };
        this.suns.set(by, S);
        if (by === g.localId) this.on = true;
        this._ignite(S);
    }

    /** A player's «стоп» / leaving: his Sun goes out. */
    stopBy(id) {
        const S = this.suns.get(id);
        if (!S || S.offAge != null) return false;
        S.offAge = 0;
        return true;
    }

    /** The light at the player's place: { k (0…1), dir (unit vector TO the Sun) } of the strongest Sun, or null. (Space._planetSky, Titans.) */
    lightAt(x, y, z, out = null) {
        let best = 0, bx = 0, bz = 0, by2 = 0;
        for (const S of this.suns.values()) {
            const k = lightShare(Math.hypot(S.x - x, S.z - z)) * sunSize(S.age, S.offAge);
            if (k > best) { best = k; bx = S.x; bz = S.z; by2 = S.y + HELIOS.HEIGHT; }
        }
        if (best <= 0.001) return null;
        const o = out || { k: 0, dir: new THREE.Vector3() };
        o.k = best;
        o.dir.set(bx - x, Math.max(by2 - y, 60), bz - z).normalize();
        return o;
    }

    update(dt) {
        const g = this.game;
        if (!this.suns.size) { if (this.group.visible) this.group.visible = false; return; }
        const ch = g.character, now = performance.now();
        if (this.on) {
            if (g.combat?.dead || g.isDeadLocal) this.stop('dead');
            else if (g.imperius?.active || !g.space?.offEarth || g.space?.realm === 'space' || g.space?.realm === 'earth') this.stop('stop');
            else if (g.combat?.drain(HELIOS.DRAIN * dt, dt) === false) this.stop('mana');
            else {
                const c = g.combat;
                if (c?.enabled && !this._warned && c.fatigue > 0 && c.fatigue <= HELIOS.LOW_MANA) { this._warned = true; g.hud.setVoice('☀️ Мана на исходе — Солнце скоро погаснет', true); }
            }
        }
        for (const [by, S] of this.suns) {
            S.age += dt;
            if (S.offAge != null) S.offAge += dt;
            if (S.mine) { const p = ch.group.position; S.tx = p.x; S.tz = p.z; S.y = p.y; S.seen = now; }
            else { const r = g.remotes?.get(by); if (r?.position) { S.tx = r.position.x; S.tz = r.position.z; S.y = r.position.y; S.seen = now; } else if (now - S.seen > 10000 && S.offAge == null) S.offAge = 0; }
            [S.x, S.z] = followStep(S.x, S.z, S.tx, S.tz, dt);
            if (S.age > HELIOS.MAX_T && S.offAge == null) { S.offAge = 0; if (S.mine) this.stop('time'); }
            if (S.offAge != null && S.offAge > HELIOS.FADE + 0.2) { this.suns.delete(by); if (S.mine) this.on = false; }
        }
        this._draw(dt);
        // my first real light: +cells once
        if (this.on && !this._first) { const L = this.lightAt(ch.group.position.x, ch.group.position.y, ch.group.position.z); if (L && L.k > 0.6) { this._first = true; g.mana?.success?.('Helios'); } }
    }

    /** The drawn Sun: the nearest (to the camera) of the suns; its disc, corona and halo face the camera. */
    _draw(dt) {
        const g = this.game, cam = g.camera?.position;
        let near = null, nd = 1e9;
        for (const S of this.suns.values()) { const d = cam ? Math.hypot(S.x - cam.x, S.z - cam.z) : 0; if (d < nd) { nd = d; near = S; } }
        const size = near ? sunSize(near.age, near.offAge) : 0;
        const vis = !!near && size > 0.005 && nd < 2600 && !g.space?.inSpace;
        this.group.visible = vis;
        if (!vis) return;
        const t = near.age;
        this.group.position.set(near.x, near.y + HELIOS.HEIGHT, near.z);
        if (g.camera) this.group.quaternion.copy(g.camera.quaternion);
        const R = HELIOS.SUN_R * (0.2 + 0.8 * size) * (1 + 0.012 * Math.sin(t * 1.3));
        this.disc.scale.set(R * 2, R * 2, 1);
        this.corona.scale.set(R * 9, R * 9, 1);
        this.halo.scale.set(R * 22, R * 22, 1);
        this.discMat.uniforms.uTime.value = t; this.discMat.uniforms.uK.value = size;
        this.coronaMat.uniforms.uTime.value = t; this.coronaMat.uniforms.uK.value = size;
        this.haloMat.uniforms.uTime.value = t * 0.6 + 4; this.haloMat.uniforms.uK.value = size * 0.45;
        // the sustained picture: sparks of light drifting down from it, the ground flickering under it; the caster's face lit
        const fx = g.fx;
        this._fx -= dt;
        if (fx && this._fx <= 0 && size > 0.3) {
            this._fx = 0.12;
            const p = g.character.group.position;
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 40;
                fx.spark(_c.set(p.x + Math.cos(a) * r, p.y + 8 + Math.random() * 30, p.z + Math.sin(a) * r), 0xffe08a, 0.1 + Math.random() * 0.1, _d.set(0, -1.5 - Math.random() * 2, 0), 2.2);
            }
        }
        g.fireLights?.want(g.character.group.position.x, g.character.group.position.y + 3, g.character.group.position.z, 2.2 * size * lightShare(Math.hypot(near.x - g.character.group.position.x, near.z - g.character.group.position.z)));
    }

    /** The ignition: a thread of gold light up from the hand, a flash, a wave of light over the ground and the sky. */
    _ignite(S) {
        const g = this.game, fx = g.fx;
        const top = _v.set(S.x, S.y + HELIOS.HEIGHT, S.z).clone(), from = _d.set(S.x, S.y - 0.2, S.z).clone();
        if (fx) {
            fx.straightBeam?.(from.setY(S.y + 1.4), top, 0.16, 0xfff0b0, 0.95, 1.5, null, THREE.AdditiveBlending);
            fx.straightBeam?.(from, top, 0.7, 0xffc24a, 0.35, 1.8, null, THREE.AdditiveBlending);
            fx.lightFlash?.(from, 0xffe08a, 6, 0.6, 80);
            for (let i = 0; i < 90; i++) { // the wave of light running out over the ground
                const a = (i / 90) * Math.PI * 2, sp = 38 + Math.random() * 20;
                fx.spark(_c.set(S.x, S.y - 1.7, S.z), i % 3 ? 0xffe08a : 0xffffff, 0.2, _d.set(Math.cos(a) * sp, 0.6, Math.sin(a) * sp), 3.2);
            }
            for (let i = 0; i < 60; i++) fx.spark(_c.set(S.x + (Math.random() - 0.5) * 3, S.y + 1 + Math.random() * 3, S.z + (Math.random() - 0.5) * 3), 0xfff0b0, 0.14, _d.set((Math.random() - 0.5) * 3, 30 + Math.random() * 40, (Math.random() - 0.5) * 3), 2.4);
        }
        setTimeout(() => { // (as the Sun takes its size: a flash over the whole sky)
            const sp = g.space;
            sp?._overlay?.('white', 0.55);
            g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, 0.2));
            g.sound?.playThunder?.(0.5);
        }, 1800);
    }

    dispose() {
        this.suns.clear(); this.on = false;
        const sc = this.game.scene;
        sc.remove(this.group);
        for (const m of [this.discMat, this.coronaMat, this.haloMat]) m.dispose();
    }
}
