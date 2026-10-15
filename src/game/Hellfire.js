/**
 * Hellfire.js — «Let the Hellfire Come» («Да придёт адский огонь»), the strongest fire there is.
 *
 *   Casting      the wand in the hand (Creative: a bare raised hand too) + the words
 *                («Let the Hellfire Come», «Hellfire come», «Come, hellfire»; the Russian
 *                recognizer writes «лет зе хеллфаер кам», «хелфайр кам»…).
 *   Mana         (the free world) only for one whose mana MAXIMUM is 100 or more; 80 at once,
 *                then 2 a second while the fire is held (twice a held «Protection» or a living
 *                tree; no mana comes back meanwhile). No mana left or «стоп» → it goes out.
 *                Creative: no mana rules.
 *   Reward       the first time it really burns something (a tree, a creature, anything that
 *                burns) the caster's mana maximum grows (Mana.js FIRST_SPELL: +20, once).
 *   The blaze    a huge, pulsing mass of fire bursts out of the wand and stays where the wand
 *                points; it flows after the wand (a heavy mass: it lags a little). The hand
 *                controls it: an arm bent close to the body keeps it near, a stretched arm
 *                pushes it far (up to 18 m); the longer it is held the bigger it grows, and the
 *                hands spread apart make it bigger still (together: smaller). It sits on what it
 *                meets (the ground, a wall) and burns everything it reaches: creatures of every
 *                kind, trees catch fire (and the fire jumps on from them), dry blocks, plants.
 *   The ring     the wand hand going round and round draws the fire into a ring round the
 *                caster: a roaring wall of flame with fire serpents racing round it, as fast as
 *                the hand goes. It burns every creature round the caster. The hand stops going
 *                round and points: the fire flows back to where it points.
 *   Danger       no immunity: the blaze turned onto the caster (pointed at the feet, made so
 *                big it reaches back, walked into) burns them like anybody. A «Protection»
 *                (or the dome, a shield in the hand) only halves the burn: fire goes round a
 *                shield. Water fights it: water balls, the vortex's water, a river or the sea —
 *                the blaze hisses into steam and shrinks there (and goes out if it is drowned);
 *                whoever stands in water magic is not burnt.
 *   «Стоп»       costs 50 mana (free world): without 50 it can't be stopped by voice — it burns
 *                on until the mana runs out. Stopped (or out of mana), it no longer grows, follows
 *                the hand or circles: it breaks into fires left on the ground where it was (the
 *                blaze, the ring's wall) that burn on for 30 s more, then die down — still
 *                burning anyone who walks in (the caster too). What caught fire (trees, plants,
 *                wood) burns on till it has burnt out (Fire.js). Water puts the fires out.
 *   Firefighting a plain burst only knocks the blaze back (smaller, no growth for a moment) and puts
 *                out the small fires left on the ground it reaches; «Firefighting Maxima» held on the
 *                blaze or the ring drowns it (Firefighting.js → douse).
 *   Network      the caster's fire is sent ~10×/s ('hf'); every computer draws it, sets its
 *                trees on fire and burns its own player; the host burns the creatures.
 */

import * as THREE from 'three';
import { ParticlePool } from '../fx/Particles.js';
import { SwingMeter } from './WaterVortex.js';

export const HELLFIRE = {
    NAME: 'Hellfire',
    MIN_MAX_MANA: 100, // the mana maximum one must have (free world)
    COST: 80, // mana at once
    DRAIN: 2, // mana a second while it is held
    REACH_MIN: 3, // m: the blaze from the wand's tip, the arm bent…
    REACH_MAX: 18, // …the arm stretched out
    R0: 1.7, // m: the blaze's radius when it bursts out
    R_GROW: 0.45, // m a second it grows while held…
    R_TIME: 2.4, // …up to this much more
    R_MIN: 0.9, // smaller than this (drowned in water): it is out
    R_MAX: 6.5,
    FOLLOW: 6, // 1/s: how quickly the blaze flows after the wand
    SPEED: 16, // m/s at most
    RING_RATE: 0.25, // turns a second of the hand that mean «it goes round»
    RING_IN: 1.4, // 1/s: the fire flows into the ring
    RING_OUT: 0.7, // 1/s: …and back to the wand's point when the hand stops
    RING_HOLD: 0.7, // s the hand may pause without the ring falling apart
    RING_W: 1.6, // m: the ring's wall is this thick…
    RING_H: 3.4, // …and this high
    TURN_GROW: 1.3, // m wider (the radius) with every full turn of the hand while the ring goes…
    TURN_WALL: 0.45, // …its wall this much thicker (the flames reach further out)…
    TURN_TALL: 0.25, // …and this much taller
    TURNS_MAX: 12, // (it grows for this many turns: a ring ~20 m wide)
    TICK: 0.25, // s between burns
    HEAT_R: 2.5, // m beyond the fire's edge its heat still burns (+ HEAT_PER_R × the blaze's radius)…
    HEAT_PER_R: 0.6,
    HEAT_DMG: 2, // …this much a tick right at the edge, less further out (through shields and armour too)
    FEAR_R: 6, // m beyond the heat: people and animals already back off from such a fire
    PUSH: 3, // m/s: the fire's breath throws bodies back from it (every PUSH_EVERY s)…
    SURGE_PUSH: 9, // …a surge (the blaze swung fast, the ring spreading out) throws hard, off the feet
    SURGE_SPEED: 6, // m/s of the blaze that make a surge
    PUSH_EVERY: 0.5,
    CREATURE_DMG: 4, // a burn (a tick) to a creature
    PLAYER_TICK: 0.5, // s between burns of a player
    PLAYER_DMG: 2, // HP a burn (4 HP a second: a 20-HP wizard lasts 5 s in it)
    SHIELD: 0.5, // what a shield lets through
    PLAYER_HEAT_R: 1.5, // m from the fire's edge its heat burns a player…
    PLAYER_HEAT_DMG: 1, // …1 HP a second (a shield: half)
    QUENCH: 2.2, // m a second of the blaze's radius lost in water
    MAX_LIFE: 90, // s at most (the mana runs out much sooner in the free world)
    STOP_COST: 50, // mana «стоп» takes to put it out (without it: it burns on until the mana runs out)
    LEFT_LIFE: 30, // s the fires left on the ground (after «стоп» / no mana) burn at full strength…
    LEFT_FADE: 6, // …then die down over this long
    LEFT_MAX: 18, // fires left at once (all wizards)
    DOUSE_KNOCK: 1.3, // m off the blaze's radius by one «Firefighting» burst (it only knocks it back)…
    DOUSE_HOLD: 1.5, // …and it can't grow again for this long
    DOUSE_RATE: 2, // m a second off it while «Firefighting Maxima» is held on it (it drowns)
    LEFT_KNOCK: 1.6, // m off a fire left on the ground by a burst (the ring's sections go out)
    SEND: 0.1, // s between network updates
    STALE: 1.5, // s without news: another computer's fire is gone
};

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------- the rules (pure)
/**
 * May it be cast now? null = yes, otherwise why not: 'max' (the mana maximum is under 100) or
 * 'mana' (not 80 mana now). `enabled`: the free world's mana rules apply (Creative: never).
 */
export function hellfireBlock({ enabled, max, mana }) {
    if (!enabled) return null;
    if (!((max ?? 0) >= HELLFIRE.MIN_MAX_MANA)) return 'max';
    if (!((mana ?? 0) >= HELLFIRE.COST)) return 'mana';
    return null;
}

/** May «стоп» put it out now? (free world: it costs 50 mana) */
export function hellfireCanStop({ enabled, mana }) {
    return !enabled || (mana ?? 0) >= HELLFIRE.STOP_COST;
}

/** How strong a fire left on the ground is `t` s after it was left (1 … 0; 0: gone). */
export function leftStrength(t) {
    if (t <= HELLFIRE.LEFT_LIFE) return 1;
    return Math.max(0, 1 - (t - HELLFIRE.LEFT_LIFE) / HELLFIRE.LEFT_FADE);
}

/** Mana the held fire takes in `dt` seconds. */
export function hellfireDrain(dt) {
    return HELLFIRE.DRAIN * Math.max(0, dt);
}

/** How far the blaze stands from the wand: the arm's stretch (0 bent … 1 stretched out). */
export function blazeReach(stretch) {
    return HELLFIRE.REACH_MIN + (HELLFIRE.REACH_MAX - HELLFIRE.REACH_MIN) * clamp(stretch, 0, 1);
}

/** The blaze's radius after `t` s held, the hands `spread` m apart (null: one hand seen). */
export function blazeRadius(t, spread = null) {
    const base = HELLFIRE.R0 + Math.min(HELLFIRE.R_TIME, HELLFIRE.R_GROW * Math.max(0, t));
    const k = spread == null ? 1 : clamp(0.55 + spread * 1.1, 0.7, 1.9);
    return clamp(base * k, HELLFIRE.R_MIN, HELLFIRE.R_MAX);
}

/** The ring's radius round the caster for a blaze of radius R. */
export const ringRadius = (R) => clamp(2.6 + R * 0.55, 3, 6.5);

/** Is a body (radius `bodyR`) at `p` in the blaze (centre `c`, radius `R`)? */
export function inBlaze(c, R, p, bodyR = 0.5) {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const r = R + bodyR;
    return dx * dx + dy * dy * 0.6 + dz * dz < r * r; // (the flames reach up more than sideways)
}

/**
 * The ring after `turns` full turns of the hand: every turn spreads it further out — wider
 * (radius), a thicker wall of flame, taller, more serpents. {rr, w, h, serpents}
 */
export function ringSize(R, turns = 0) {
    const n = clamp(Math.floor(Math.max(0, turns)), 0, HELLFIRE.TURNS_MAX);
    return {
        rr: ringRadius(R) + n * HELLFIRE.TURN_GROW,
        w: HELLFIRE.RING_W + n * HELLFIRE.TURN_WALL,
        h: HELLFIRE.RING_H + n * HELLFIRE.TURN_TALL,
        serpents: 5 + n,
        turns: n,
    };
}

/** Is a body at `p` in the ring round `c` (the caster's feet), of radius `rr` (wall `w` thick, `h` high)? */
export function inRing(c, rr, p, bodyR = 0.5, w = HELLFIRE.RING_W, h = HELLFIRE.RING_H) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (Math.abs(d - rr) > w / 2 + bodyR) return false;
    return p.y > c.y - 1.5 && p.y < c.y + h + 0.5;
}

// ------------------------------------------------------------------ the look
const CORE = [0xfffbe6, 0xfff2b0, 0xffe680, 0xffd25a];
const FLAME = [0xffb030, 0xff9a1a, 0xff8000, 0xff6400, 0xf04a00, 0xd42a00, 0xb81c00];
const DEEP = [0xd42a00, 0xa81800, 0x8a1000, 0xff4a00];
const SMOKE = [0x4a4440, 0x57504b, 0x625a54, 0x6a625c]; // (grey: what burns smokes; never black blocks hiding the view)
const STEAM = [0xe8eef2, 0xd5dde2, 0xffffff];
const pick = (a) => a[(Math.random() * a.length) | 0];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();

/** Closest distance from point p to the segment a–b. */
function segDist(p, a, b) {
    const ab = _d.subVectors(b, a);
    const L = ab.lengthSq();
    const k = L > 1e-9 ? clamp(_e.subVectors(p, a).dot(ab) / L, 0, 1) : 0;
    return _e.copy(a).addScaledVector(ab, k).distanceTo(p);
}

const r2 = (v) => Math.round(v * 100) / 100;

export class Hellfire {
    constructor(game) {
        this.game = game;
        this.state = null; // my fire: {side, t, c, R, k (0 blaze … 1 ring), ang, spin, ...}
        this.remote = new Map(); // by -> another computer's fire
        this.meter = new SwingMeter();
        this.left = []; // fires left on the ground (everyone's): {by, c, R0, R, k: 0, t, wet, burnT, meT}
        this.log = []; // events (tests / debugging)
        this._t = 0;
        this._sendT = 0;
        this._sent = false;
        this._acc = { core: 0, body: 0, lick: 0, smoke: 0, ember: 0, wall: 0, snake: 0, link: 0, shim: 0, steam: 0 };
        // its own pool of flames (the shared one would starve every other spell): made at start-up,
        // the same shader as the other glowing particles — nothing compiles mid-fight
        this.pool = game.scene ? new ParticlePool(game.scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 2600, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }) : null;
    }

    get me() { return this.game.localId; }

    /** My fire is burning. */
    get busy() { return !!this.state; }

    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 60) this.log.shift();
    }

    _hint(text, isFinal = true) {
        if (isFinal) this.game.hud?.setVoice?.(text, true);
        return null;
    }

    /** Which hand casts: the wand's; Creative without a wand: a raised hand (the spell hand first). */
    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        if (g.config?.mode !== 'creative' && g.config?.mode !== 'test') return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        for (const s of [pref, pref === 'right' ? 'left' : 'right']) if (ch.isArmRaised?.(s)) return s;
        return pref;
    }

    // ================================================================ voice
    /** The words. @returns the spell name, or null */
    cast(isFinal = true) {
        const g = this.game;
        if (this.state) { if (isFinal && this.state.t > 3) g._why?.('busy', HELLFIRE.NAME); return null; } // (the interim and the final version of one phrase; later: say why)
        if (this._t - (this._endAt ?? -9) < 2.5) return null; // (…and the final one after a quick «стоп»)
        const side = this._castSide();
        if (!side) return this._hint('🪄 «Let the Hellfire Come» вызывается только <b>волшебной палочкой в руке</b>', isFinal);
        const c = g.combat;
        const why = hellfireBlock({ enabled: !!c?.enabled, max: c?.maxFatigue || 30, mana: c?.fatigue ?? 0 });
        if (why === 'max') return this._hint(`🔥 Адский огонь подвластен только сильным магам: нужен <b>максимум маны ${HELLFIRE.MIN_MAX_MANA}</b> (у вас ${Math.floor(c.maxFatigue || 30)})`, isFinal);
        const tired = c?.check(HELLFIRE.NAME);
        if (tired || why) return this._hint(tired || `😮‍💨 Не хватает маны: нужно ${HELLFIRE.COST}`, true);
        c?.pay(HELLFIRE.NAME);
        g._manaLater = true; // (mana: it counts as working when it really burns something)
        const ch = g.character;
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side);
        const d = ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side);
        this.meter.reset();
        this.state = {
            side, t: 0, o: o.clone(), d: d.clone().normalize(),
            c: o.clone().addScaledVector(d, HELLFIRE.REACH_MIN), // (it bursts out of the wand)
            target: new THREE.Vector3(), R: 0.4, k: 0, ang: 0, spin: 1.5, rr: ringRadius(HELLFIRE.R0), rw: HELLFIRE.RING_W, rh: HELLFIRE.RING_H, turns: 0, ns: 5,
            ringT: 0, burnT: 0, meT: 0, roarT: 0, worked: false, wet: 0,
        };
        this._note({ ev: 'cast', side });
        g.fx?.lightFlash?.(o, 0xff5a1a, 9, 0.6, 60);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.6);
        g.sound?.playInferno?.();
        g.sound?.playRumble?.(o, ch.group.position);
        g.hud?.setVoice?.('🔥 <b>Адский огонь!</b> Он идёт за палочкой: рука дальше — огонь дальше, руки шире — огонь больше. <b>Крутите рукой</b> — огонь кольцом вокруг вас. «Стоп» — погасить', true);
        return HELLFIRE.NAME;
    }

    /**
     * «Стоп» said: 50 mana (free world) puts it out — fires stay where it was.
     * @returns true: stopped; 'mana': not enough mana to stop it (it burns on); false: no fire
     */
    sayStop() {
        if (!this.state) return false;
        const c = this.game.combat;
        if (!hellfireCanStop({ enabled: !!c?.enabled, mana: c?.fatigue })) {
            this._note({ ev: 'cantStop', mana: c.fatigue });
            this.game.hud?.setVoice?.(`🔥 Погасить адский огонь словом «стоп» стоит <b>${HELLFIRE.STOP_COST} маны</b> — у вас ${Math.floor(c.fatigue)}. Огонь горит, пока не кончится мана`, true);
            return 'mana';
        }
        if (c?.enabled) c.fatigue = Math.max(0, c.fatigue - HELLFIRE.STOP_COST);
        return this.stop('stop');
    }

    /** «Стоп» / no mana / the caster can't go on: my fire goes out (everywhere) — fires stay where it was (not after water). */
    stop(why = 'stop') {
        if (!this.state) return false;
        const s = this.state;
        this.state = null;
        this._endAt = this._t;
        this._note({ ev: 'out', why });
        if (why === 'water') this._dieDown(s.c, s.R * (1 - s.k));
        else this._leave(this.me, s, this.game.character.group.position);
        this._send(null, why);
        if (why === 'mana') this.game.hud?.setVoice?.('🔥 Адский огонь вышел из-под власти — мана кончилась. Брошенный огонь догорает ещё полминуты', true);
        else if (why === 'water') this.game.hud?.setVoice?.('💨 Вода погасила адский огонь', true);
        else if (why === 'wand') this.game.hud?.setVoice?.('🔥 Палочка не в руке — огонь больше не слушается и догорает', true);
        else if (why === 'stop') this.game.hud?.setVoice?.(`🛑 Адский огонь остановлен (−${HELLFIRE.STOP_COST} маны), но брошенный огонь догорает ещё полминуты — не входите в него`, true);
        return true;
    }

    /** The fire breaks into fires left on the ground: the blaze where it stood, the ring's wall round `body`. */
    _leave(by, f, body) {
        const add = (x, y, z, R) => {
            if (!(R > 0.3)) return;
            if (this.left.length >= HELLFIRE.LEFT_MAX) this.left.shift();
            const g = this.game;
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : y - R * 0.55;
            const c = new THREE.Vector3(x, Math.min(y, gy + R * 0.55), z); // (it falls to the ground)
            this.left.push({ by, c, R0: R, R, k: 0, t: 0, wet: 0, burnT: 0, meT: 0, o: null });
        };
        const wb = 1 - f.k;
        if (wb > 0.2) add(f.c.x, f.c.y, f.c.z, f.R * Math.min(1, wb + 0.2) * 0.85);
        if (f.k > 0.2) {
            const n = clamp(Math.ceil(TAU * f.rr / 5), 6, 12); // (a ring spread wide leaves more fires)
            for (let i = 0; i < n; i++) {
                const a = f.ang + i * (TAU / n);
                add(body.x + Math.cos(a) * f.rr, body.y - 1.4, body.z + Math.sin(a) * f.rr, 1.4 * Math.min(1, f.k + 0.2));
            }
        }
        this._note({ ev: 'left', n: this.left.length });
    }

    /** Fires left on the ground: they burn on (everyone near, the caster too), water puts them out. */
    _updateLeft(dt) {
        for (let i = this.left.length - 1; i >= 0; i--) {
            const f = this.left[i];
            f.t += dt;
            f.wet = this._wet(f.c, f.R);
            if (f.wet > 0) f.R0 = Math.max(0, f.R0 - HELLFIRE.QUENCH * f.wet * dt);
            f.R = f.R0 * leftStrength(f.t);
            if (f.R < 0.25) { this._dieDown(f.c, f.R0 * 0.6); this.left.splice(i, 1); continue; }
            f.burnT -= dt;
            if (f.burnT <= 0) { f.burnT = HELLFIRE.TICK * 2; this._burn(f.by, f, f.c); }
            this._burnMe(f, f.c, dt);
            this._draw(dt, f, f.c, 0.35);
        }
    }

    // ================================================================ update
    update(dt) {
        if (!(dt > 0)) return;
        this._t += dt;
        if (this.state) this._updateMine(dt);
        for (const [by, f] of this.remote) {
            if (this._t - f.at > HELLFIRE.STALE) { this._leave(by, f, f.body); this.remote.delete(by); continue; }
            this._updateRemote(f, dt);
        }
        if (this.left.length) this._updateLeft(dt);
        this.pool?.update(dt);
    }

    _updateMine(dt) {
        const g = this.game, s = this.state, ch = g.character, c = g.combat;
        if (c?.dead || g.isDeadLocal || c?.frozen || c?.stunned) { this.stop('down'); return; }
        if (!this._castSide()) { this.stop('wand'); return; } // (the wand dropped: outside Creative it is out)
        const w = g.items?.heldOf?.('wand');
        if (w && w.side !== s.side) s.side = w.side;
        // the caster pays while holding it (the free world)
        if (c && (c.drain(hellfireDrain(dt), dt) === false || (c.enabled && c.fatigue <= 1e-6))) { this.stop('mana'); return; }
        s.t += dt;
        if (s.t > HELLFIRE.MAX_LIFE) { this.stop('time'); return; }
        // the wand: where it is, where it points, how far the arm is stretched
        const side = s.side;
        if (g.castOrigin) g.castOrigin(side, s.o); else ch.getHandWorldPosition(side, s.o);
        (ch.getPointingDirection ? ch.getPointingDirection(side, s.d) : ch.getHandDirection(side, s.d)).normalize();
        const reach = blazeReach(this._stretch(side));
        // the hands spread apart: a bigger fire
        const spread = this._spread();
        const want = blazeRadius(s.t, spread);
        // water drowns it: it hisses and shrinks there (the blaze, and the ring round the caster)
        s.wet = this._wet(s.c, s.R) * (1 - s.k);
        const rw = s.k > 0.2 ? this._ringWet(ch.group.position, s.rr, s.rw, s.rh) * s.k : 0;
        if (s.dousedT > 0) s.dousedT -= dt; // («Firefighting» on it: it can't grow back yet)
        if (s.wet > 0 || rw > 0) s.R = Math.max(0, s.R - HELLFIRE.QUENCH * (s.wet + rw) * dt);
        else if (!(s.dousedT > 0)) s.R += (want - s.R) * Math.min(1, dt * (s.t < 0.4 ? 6 : 1.6));
        if (s.R < HELLFIRE.R_MIN && s.t > 0.6) { this.stop('water'); return; }
        // the blaze flows after the wand (a heavy mass: it lags a little, never jumps)
        this._aim(s.o, s.d, reach, s.R, s.target);
        _a.subVectors(s.target, s.c).multiplyScalar(1 - Math.exp(-HELLFIRE.FOLLOW * dt));
        const step = HELLFIRE.SPEED * dt;
        if (_a.length() > step) _a.setLength(step);
        s.c.add(_a);
        (s.vel || (s.vel = new THREE.Vector3())).copy(_a).divideScalar(dt); // (a fast swing of the wand: a surge)
        // the hand going round: the fire is drawn into a ring round the caster
        const body = ch.group.position;
        const hand = ch.getHandWorldPosition(side, _b).sub(body);
        this.meter.push(this._t, hand);
        const rate = this.meter.rate;
        if (rate > HELLFIRE.RING_RATE && this.meter.speed > 0.4) s.ringT = HELLFIRE.RING_HOLD;
        else s.ringT -= dt;
        const k0 = s.k;
        s.k = s.ringT > 0 ? Math.min(1, s.k + HELLFIRE.RING_IN * dt) : Math.max(0, s.k - HELLFIRE.RING_OUT * dt);
        if (k0 < 0.5 && s.k >= 0.5) { this._note({ ev: 'ring' }); g.hud?.setVoice?.('🔥 Огненное кольцо! Крутите рукой — оно кружит вокруг вас и жжёт всех рядом', true); }
        if (k0 >= 0.5 && s.k < 0.5) this._note({ ev: 'unring' });
        // every full turn of the hand while the ring goes spreads it further out
        if (s.ringT > 0 && s.k > 0.3) s.turns += this.meter.last;
        else if (s.k <= 0) s.turns = 0; // (back in the wand's blaze: a new ring starts small)
        const size = ringSize(s.R, s.turns);
        if (size.turns > (s.shownTurns || 0)) { s.surgeT = 0.6; this._note({ ev: 'grow', turns: size.turns, rr: r2(size.rr) }); this.game.fx && (this.game.fx.shake = Math.max(this.game.fx.shake || 0, 0.3)); }
        s.shownTurns = size.turns;
        const target = Math.max(1.2, rate * TAU * 1.15);
        s.spin += (target - s.spin) * Math.min(1, dt * 2.5);
        s.ang += s.spin * dt;
        // (it spreads out smoothly, not in jumps)
        s.rr += (size.rr - s.rr) * Math.min(1, dt * 2.5);
        s.rw += (size.w - s.rw) * Math.min(1, dt * 2.5);
        s.rh += (size.h - s.rh) * Math.min(1, dt * 2.5);
        s.ns = size.serpents;
        // the roar
        s.roarT -= dt;
        if (s.roarT <= 0) { s.roarT = 1.3; g.sound?.playInferno?.(); }
        // burning
        s.burnT -= dt;
        if (s.burnT <= 0) {
            s.burnT = HELLFIRE.TICK;
            if (this._burn(this.me, s, body)) this._worked(s);
        }
        this._burnMe(s, body, dt);
        // the network
        this._sendT += dt;
        if (this._sendT >= HELLFIRE.SEND) {
            this._sendT = 0;
            this._send([r2(s.c.x), r2(s.c.y), r2(s.c.z), r2(s.R), r2(s.k), r2(s.ang), r2(s.spin), r2(s.rr), r2(s.o.x), r2(s.o.y), r2(s.o.z), r2(body.x), r2(body.y), r2(body.z), r2(s.rw), r2(s.rh), s.ns]);
        }
        this._draw(dt, s, body);
    }

    /** How far the wand arm is stretched: 0 bent (the hand at the chest) … 1 stretched out. */
    _stretch(side) {
        const ch = this.game.character;
        const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        const len = (ch.BONE_LENGTH_UPPER || 0.3) + (ch.BONE_LENGTH_LOWER || 0.3);
        if (!anchor || !(len > 0)) return 0.5;
        const sh = anchor.getWorldPosition(_c);
        const k = ch.getHandWorldPosition(side, _d).distanceTo(sh) / len;
        return clamp((k - 0.45) / 0.47, 0, 1);
    }

    /** How far apart the two hands are (null: one hand only). */
    _spread() {
        const ch = this.game.character;
        if (ch.handLost?.('left') || ch.handLost?.('right')) return null;
        return ch.getHandWorldPosition('left', _c).distanceTo(ch.getHandWorldPosition('right', _d));
    }

    /** Where the blaze goes: along the wand, `reach` metres — or where the line meets the ground, a wall, water. */
    _aim(o, d, reach, R, out) {
        const g = this.game;
        let t = reach;
        for (let k = 0.5; k < reach; k += 0.5) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            const b = g._flameBlock ? g._flameBlock(x, y, z) : null;
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : -Infinity;
            if (b === 'solid' || b === 'water' || y < gy) { t = Math.max(0.4, k - 0.3); break; }
        }
        out.copy(o).addScaledVector(d, t);
        // a mass of fire sits on what it meets: never sunk into the ground
        const gy = g.collision?.groundY ? g.collision.groundY(out.x, out.z) : -Infinity;
        if (out.y < gy + R * 0.55) out.y = gy + R * 0.55;
        return out;
    }

    /** How much water the blaze is in (0: none): water magic, a river, the sea. */
    _wet(c, R) {
        const g = this.game;
        let w = 0;
        for (const s of g._flameWaters?.() || []) {
            const d = Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z);
            if (d < s.r + R * 0.8) w = Math.max(w, 1 + Math.min(2, s.r / Math.max(0.5, d)));
        }
        if (g._flameBlock) {
            if (g._flameBlock(c.x, c.y - R * 0.5, c.z) === 'water') w = Math.max(w, 1.2);
            if (g._flameBlock(c.x, c.y, c.z) === 'water') w = Math.max(w, 3);
        }
        return w;
    }

    /** How much water is on the ring round `body` (radius rr). */
    _ringWet(body, rr, W = HELLFIRE.RING_W, H = HELLFIRE.RING_H) {
        let w = 0;
        for (const s of this.game._flameWaters?.() || []) {
            const d = Math.hypot(s.x - body.x, s.z - body.z);
            if (Math.abs(d - rr) < s.r + W / 2 && s.y > body.y - 3 && s.y < body.y + H + s.r) w = Math.max(w, 1.5);
        }
        return w;
    }

    /**
     * «Firefighting» (Firefighting.js) sprays the fires this computer keeps: `hit(c, r)` = the water
     * reaches a fire of radius r at c. A burst (`dt` 0) knocks my blaze back (−DOUSE_KNOCK, no growth
     * for DOUSE_HOLD s) and puts out the small fires left on the ground (a big one only shrinks);
     * «Firefighting Maxima» held on it (`dt` s) drowns it: −DOUSE_RATE a second — it goes out.
     * Another wizard's fire is drowned on its own computer (it sends the smaller fire on).
     * @returns true when the water reached some of the fire
     */
    douse(hit, dt = 0) {
        const burst = !(dt > 0);
        let any = false;
        const s = this.state;
        if (s) {
            const body = this.game.character.group.position;
            let on = 1 - s.k > 0.2 && hit(s.c, s.R);
            if (!on && s.k > 0.2) {
                for (let i = 0; i < 12 && !on; i++) {
                    const a = s.ang + i * (TAU / 12);
                    on = hit(_a.set(body.x + Math.cos(a) * s.rr, body.y - 0.5, body.z + Math.sin(a) * s.rr), (s.rw || HELLFIRE.RING_W) / 2);
                }
            }
            if (on) {
                any = true;
                s.R = Math.max(0, s.R - (burst ? HELLFIRE.DOUSE_KNOCK : HELLFIRE.DOUSE_RATE * dt));
                s.dousedT = Math.max(s.dousedT || 0, burst ? HELLFIRE.DOUSE_HOLD : 0.3);
                if (burst) this._note({ ev: 'doused', R: r2(s.R) });
                if (s.R < HELLFIRE.R_MIN) this.stop('water');
            }
        }
        for (const f of this.remote.values()) if ((1 - f.k > 0.2 && hit(f.c, f.R)) || (f.k > 0.2 && hit(f.body, f.rr + 1))) any = true;
        for (let i = this.left.length - 1; i >= 0; i--) {
            const f = this.left[i];
            if (!hit(f.c, f.R)) continue;
            any = true;
            f.R0 = Math.max(0, f.R0 - (burst ? HELLFIRE.LEFT_KNOCK : HELLFIRE.DOUSE_RATE * 1.5 * dt));
            if (f.R0 * leftStrength(f.t) < 0.25) { this._dieDown(f.c, Math.max(0.5, f.R0)); this.left.splice(i, 1); this._note({ ev: 'leftOut' }); }
        }
        return any;
    }

    /** It really burnt something: mana (the first time: its bonus — Mana.js FIRST_SPELL). */
    _worked(s) {
        if (s.worked) return;
        s.worked = true;
        const g = this.game;
        this._note({ ev: 'worked' });
        const n = g.mana?.success?.(HELLFIRE.NAME);
        if (n) this._note({ ev: 'reward', n });
    }

    // ============================================================ burning
    /**
     * One burn of a fire (mine or another wizard's): trees and dry blocks catch fire (every
     * computer), creatures burn (the host). @returns true when something really burnt
     */
    _burn(by, f, body) {
        const g = this.game;
        const blaze = 1 - f.k > 0.2, ring = f.k > 0.2;
        let hit = false;
        // trees, leaves, wood, plants
        if (blaze && g.fire?.ignite?.(f.c, f.R * 0.9)) hit = true;
        if (ring) {
            const n = Math.min(24, Math.max(6, Math.ceil(TAU * f.rr / 4))); // (a wider ring sets more on fire)
            for (let i = 0; i < n; i++) {
                const a = f.ang + i * (TAU / n);
                _a.set(body.x + Math.cos(a) * f.rr, body.y - 1, body.z + Math.sin(a) * f.rr);
                if (g.fire?.ignite?.(_a, Math.max(1.2, (f.rw || HELLFIRE.RING_W) * 0.6))) hit = true;
            }
        }
        // book-birds fall (the book of protection too: it is fire), glass breaks
        if (blaze) { g.books?.hitAt?.(f.c, f.R, by, 'fire'); g.houses?.hitAt?.(f.c, f.R * 0.5); }
        // a house's sphere of protection holds the fire out — and wears down (HouseWards.js)
        if (blaze) g.wards?.struck?.(f.c, f.R, HELLFIRE.NAME, by); // (held on it ~7 s: burnt through)
        if (blaze) g.iceCastle?.meltAt(f.c, 3, by ?? null, f.R + 1); // (the Ice Castle's ice: the Hellfire melts the most)
        // creatures of every kind (players: every computer burns its own — _burnMe): in the fire they
        // burn hard; near it the heat burns them too (through a shield, through armour); they fear it
        // — the brave back off behind their shields step by step, the rest run; its surge throws them back
        const bodies = g.duel?._bodies?.(null) || [];
        const auth = !!g.authority;
        const K = g.fireBoost?.(by) ?? 1; // (the dragon's wand in the caster's hand: 60% hotter)
        const D = HELLFIRE.CREATURE_DMG * K;
        const W = f.rw || HELLFIRE.RING_W;
        const heatR = HELLFIRE.HEAT_R + f.R * HELLFIRE.HEAT_PER_R;
        const fear = heatR + HELLFIRE.FEAR_R;
        f.pushT = (f.pushT || 0) - HELLFIRE.TICK;
        const pushNow = f.pushT <= 0;
        if (pushNow) f.pushT = HELLFIRE.PUSH_EVERY;
        const surge = (f.vel ? Math.hypot(f.vel.x, f.vel.z) : 0) > HELLFIRE.SURGE_SPEED || f.surgeT > 0;
        for (const b of bodies) {
            if (b.kind === 'p' || b.kind === 'b') continue;
            const mid = _c.copy(b.a).add(b.b).multiplyScalar(0.5);
            // how far the body is from the fire's edge (≤ 0: in it), and where the fire is for it
            let gap = Infinity, fx = 0, fz = 0;
            if (blaze) {
                const d = Math.min(segDist(f.c, b.a, b.b), mid.distanceTo(f.c)) - f.R - b.r;
                if (d < gap) { gap = d; fx = f.c.x; fz = f.c.z; }
            }
            if (ring) {
                const ox = mid.x - body.x, oz = mid.z - body.z, L = Math.hypot(ox, oz) || 1;
                const d = Math.abs(L - f.rr) - W / 2 - b.r;
                // (inside the ring — between it and the caster — «away from the flames» must not mean onto the caster:
                // the fire is then reckoned from the caster's side, and its heat and surge send them out, not in)
                if (d < gap && mid.y > body.y - 3 && mid.y < body.y + (f.rh || HELLFIRE.RING_H) + 1) { gap = d; const k = L < f.rr ? Math.min(L, f.rr) - 1.5 : f.rr; fx = body.x + ox / L * k; fz = body.z + oz / L * k; }
            }
            if (!(gap < fear)) continue;
            if (g.wards?.shields(blaze ? f.c : body, mid)) continue; // (in a protected house)
            const inside = gap <= 0;
            const heat = inside ? 1 : Math.max(0, 1 - gap / heatR);
            if (inside) hit = true;
            if (!auth) continue; // (the host decides)
            const dir = new THREE.Vector3(mid.x - fx, 0, mid.z - fz);
            if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
            dir.normalize();
            // the burn: in the fire, or the heat by how close (0 beyond the heat's reach: only the fear)
            const dmg = inside ? D : heat > 0 ? HELLFIRE.HEAT_DMG * heat * K : 0;
            const cr = b.kind === 'z' || b.kind === 's' || b.kind === 'D' ? null : g.duel?._creature?.(b.kind, b.id);
            if (dmg > 0) {
                if (b.kind === 'z') {
                    const z = g.zombieById?.get(b.id);
                    if (z && !z.isDead) { if (z.isFrozen) z.unfreeze?.(); z.damageCooldown = 0; g.damageZombie(z, dmg, false, dir, by); }
                } else if (b.kind === 's') {
                    const sp = g.spiders?.byId?.(b.id);
                    if (sp) g.spiders.hit(sp, dmg * 2, HELLFIRE.NAME, by);
                } else if (b.kind === 'D') {
                    g.dragons?.hit?.(g.dragons.byId(b.id), dmg, HELLFIRE.NAME, by); // (even the hellfire: a dragon does not care — DragonKinds.FIRE_KINDS)
                } else if (b.kind === 'I') {
                    const ic = g.iceCastle?.byId(b.id); // (the Ice Castle's creatures: the mightiest fire — ×3.5, IceQueen.FIRE_K)
                    if (ic) g.iceCastle.hit(ic, dmg, HELLFIRE.NAME, by);
                } else if (cr) {
                    if (b.kind === 'a') { cr.damageCooldown = 0; g.animals?.hit?.(cr, dmg, dir, by, true); }
                    else if (b.kind === 'v') g.castleLife?.hit?.(cr, dmg, dir, by, { spell: true, magic: true, fire: true });
                    else if (b.kind === 't') g.livingTrees?.hit?.(cr, dmg, HELLFIRE.NAME); // (fire: the only thing that kills a living tree)
                    else if (b.kind === 'f') g.phoenixes?.hit?.(cr, dmg, HELLFIRE.NAME, by); // (a phoenix: born of fire — no harm, but an attack)
                }
                this._note({ ev: inside ? 'burn' : 'heat', kind: b.kind, id: b.id, by, dmg: Math.round(dmg * 100) / 100 });
            }
            // the fear: people and animals back off or run (zombies, the spider, living trees know no fear)
            if (cr && b.kind === 'v') g.castleLife?.fear?.(cr, fx, fz, heat, HELLFIRE.TICK);
            else if (cr && b.kind === 'a') g.animals?.fear?.(cr, fx, fz);
            // its surge throws them back (CreatureImpact: a hard surge knocks down)
            if (pushNow && (inside || heat > 0.5)) {
                const sp = (surge ? HELLFIRE.SURGE_PUSH : HELLFIRE.PUSH) * (inside ? 1 : heat);
                const body2 = b.kind === 'z' ? g.zombieById?.get(b.id) : b.kind === 's' ? null : cr;
                if (body2 && sp > 0.5) g.creatureImpact?.apply?.(body2, { v: dir.clone().multiplyScalar(sp).setY(surge ? 2 : 0.5), by, spell: HELLFIRE.NAME, kind: HELLFIRE.NAME, jolt: 0.8, from: new THREE.Vector3(fx, mid.y, fz), always: surge && inside ? { down: 1.2 } : null });
            }
        }
        // the ships' crews
        if (auth && blaze && g.ships?.crew?.hitAt) { g.ships.crew.hitAt(f.c, f.R, D, by, HELLFIRE.NAME); g.ships.crew.hitAt(f.c, f.R + heatR * 0.5, HELLFIRE.HEAT_DMG * 0.5, by, HELLFIRE.NAME); } // (in it, and its heat)
        if (f.surgeT > 0) f.surgeT -= HELLFIRE.TICK;
        // dead animals in it get cooked
        if (blaze) for (const a of g.animals?.list || []) if (a.dead && !a.cooked && a.meat > 0 && inBlaze(f.c, f.R, a.group.position, 0.8)) { a.cooked = true; g.animals._tintCooked?.(a); }
        return hit;
    }

    /** Any fire (mine too: no immunity) on my own body burns me. */
    _burnMe(f, body, dt) {
        const g = this.game, c = g.combat;
        f.meT = (f.meT || 0) - dt;
        if (f.meT > 0 || !c || c.dead || g.isDeadLocal) return;
        const me = c.center ? c.center(_a) : _a.copy(g.character.group.position);
        if (g.wards?.shields(f.c, me) && g.wards.shields(body, me)) return; // (in a protected house)
        const blaze = 1 - f.k > 0.2 && inBlaze(f.c, f.R, me, 0.45);
        // (the ring of another wizard; my own ring goes round me)
        const ring = f.k > 0.2 && f !== this.state && inRing(body, f.rr, me, 0.45, f.rw, f.rh);
        // the heat right beside it burns too (less, and slower): from the blaze, or another wizard's ring
        let near = false;
        if (!blaze && !ring) {
            const gb = 1 - f.k > 0.2 ? me.distanceTo(f.c) - f.R - 0.45 : Infinity;
            const gr = f.k > 0.2 && f !== this.state ? Math.abs(Math.hypot(me.x - body.x, me.z - body.z) - f.rr) - (f.rw || HELLFIRE.RING_W) / 2 - 0.45 : Infinity;
            near = Math.min(gb, gr) < HELLFIRE.PLAYER_HEAT_R;
            if (!near) return;
        }
        // water magic round me keeps the fire off (soaked by «Firefighting» too)
        for (const s of g._flameWaters?.() || []) if (Math.hypot(me.x - s.x, me.y - s.y, me.z - s.z) < s.r) return;
        if (g.firefighting?.wetMe?.()) return;
        f.meT = near ? HELLFIRE.PLAYER_TICK * 2 : HELLFIRE.PLAYER_TICK;
        const from = blaze || near ? f.c : body;
        let dmg = (near ? HELLFIRE.PLAYER_HEAT_DMG : HELLFIRE.PLAYER_DMG) * (g.fireBoost?.(f === this.state ? this.me : f.by) ?? 1); // (the dragon's wand: 60% hotter)
        if ((c.shield && c.shield.left > 0) || c.shieldFactor?.(from) >= 1) dmg *= HELLFIRE.SHIELD; // (fire goes round a shield)
        if (c.frozen) c.frozenLeft = 0; // (the ice on me melts)
        const by = f === this.state || f.by === this.me ? null : f.by;
        this._note({ ev: 'hurtMe', dmg, by: by || 'self', heat: near });
        if (c.enabled) c.damage(dmg, by, HELLFIRE.NAME);
        else g.damageLocalPlayer?.(dmg);
        // flames on my body
        if (this.pool && !near) for (let i = 0; i < 14; i++) this.pool.spawn(me.x + (Math.random() - 0.5) * 0.7, me.y - 0.8 + Math.random() * 1.6, me.z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), pick(FLAME), 0.3 + Math.random() * 0.3, 0.5, { shrink: 0.3, spin: 6 });
    }

    // ============================================================= network
    _send(s, why = null) {
        if (!s && !this._sent) return;
        this._sent = !!s;
        this.game.sync?.hellfire?.(s, why);
    }

    /** Another computer's fire ('hf'). */
    onNet(m) {
        if (!m || !m.by || m.by === this.me) return;
        const s = m.s;
        if (!Array.isArray(s) || s.length < 14 || !s.every(Number.isFinite)) {
            const f = this.remote.get(m.by);
            if (f) { if (m.w === 'water') this._dieDown(f.c, f.R * (1 - f.k)); else this._leave(m.by, f, f.body); this.remote.delete(m.by); }
            return;
        }
        let f = this.remote.get(m.by);
        if (!f) {
            f = { by: m.by, c: new THREE.Vector3(s[0], s[1], s[2]), tc: new THREE.Vector3(), o: new THREE.Vector3(), body: new THREE.Vector3(s[11], s[12], s[13]), R: s[3], k: s[4], ang: s[5], spin: s[6], rr: s[7], burnT: 0, meT: 0, roarT: 0 };
            this.remote.set(m.by, f);
            this.game.sound?.playInferno?.();
        }
        f.tc.set(s[0], s[1], s[2]);
        f.tR = clamp(s[3], 0, HELLFIRE.R_MAX); f.tk = clamp(s[4], 0, 1);
        f.spin = clamp(s[6], 0, 40); f.rr = clamp(s[7], 2, 30);
        f.rw = clamp(Number.isFinite(s[14]) ? s[14] : HELLFIRE.RING_W, 1, 12); f.rh = clamp(Number.isFinite(s[15]) ? s[15] : HELLFIRE.RING_H, 1, 10); f.ns = clamp(s[16] | 0 || 5, 5, 20);
        if (Math.abs(s[5] - f.ang) > 1.5) f.ang = s[5];
        f.o.set(s[8], s[9], s[10]);
        f.netBody = [s[11], s[12], s[13]];
        f.at = this._t;
    }

    _updateRemote(f, dt) {
        const g = this.game;
        const q = 1 - Math.exp(-dt * 8);
        const px = f.c.x, pz = f.c.z, prr = f.rr0 ?? f.rr;
        f.c.lerp(f.tc, q);
        (f.vel || (f.vel = new THREE.Vector3())).set((f.c.x - px) / dt, 0, (f.c.z - pz) / dt);
        if (f.rr > prr + 0.2) f.surgeT = 0.6; // (the ring spread out: a surge)
        f.rr0 = f.rr;
        f.R += ((f.tR ?? f.R) - f.R) * q;
        f.k += ((f.tk ?? f.k) - f.k) * q;
        f.ang += f.spin * dt;
        const av = g.remotes?.get(f.by);
        if (av?.position) f.body.copy(av.position); else if (f.netBody) f.body.set(f.netBody[0], f.netBody[1], f.netBody[2]);
        f.roarT -= dt;
        if (f.roarT <= 0) { f.roarT = 1.6; g.sound?.playInferno?.(); }
        f.burnT -= dt;
        if (f.burnT <= 0) { f.burnT = HELLFIRE.TICK; this._burn(f.by, f, f.body); }
        this._burnMe(f, f.body, dt);
        this._draw(dt, f, f.body);
    }

    // ============================================================= drawing
    _n(key, rate, dt, max) {
        this._acc[key] += rate * dt;
        const n = Math.min(max, Math.floor(this._acc[key]));
        this._acc[key] -= n;
        return n;
    }

    /** One frame of a fire: the blaze (weight 1 − k) and the ring round `body` (weight k). */
    _draw(dt, f, body, amt = 1) {
        const P = this.pool, fx = this.game.fx;
        if (!P || !fx) return;
        const t = this._t;
        const flick = 0.8 + 0.2 * Math.sin(t * 31) * Math.sin(t * 17 + 1.3);
        const pulse = 1 + 0.1 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 13.1 + 0.7);
        const wb = (1 - f.k) * amt, wr = f.k * amt;
        const R = f.R * pulse;
        const c = f.c;
        // ---------------------------------------------------------- the blaze
        if (wb > 0.03 && R > 0.1) {
            const big = Math.min(2.2, R / 2.2);
            // the white-hot heart
            for (let i = this._n('core', 260 * wb * big, dt, 10); i > 0; i--) {
                const u = this._inSphere(R * 0.45);
                P.spawn(c.x + u.x, c.y + u.y * 0.7 - R * 0.15, c.z + u.z, u.x * 0.6, 1.2 + Math.random() * 2, u.z * 0.6, pick(CORE), (0.5 + Math.random() * 0.5) * big, 0.35 + Math.random() * 0.2, { shrink: 0.4, spin: 4 });
            }
            // the body of the fire: billowing orange-red flames rolling up and out
            for (let i = this._n('body', 900 * wb * big, dt, 26); i > 0; i--) {
                const u = this._inSphere(R);
                const out = 0.8 + Math.random() * 1.6;
                const swirl = 1.5;
                P.spawn(c.x + u.x, c.y + u.y * 0.8 - R * 0.1, c.z + u.z,
                    u.x / R * out - u.z / R * swirl, 2 + Math.random() * 3.5 * big, u.z / R * out + u.x / R * swirl,
                    pick(FLAME), (0.35 + Math.random() * 0.55) * big * flick, 0.45 + Math.random() * 0.45, { shrink: -0.9, spin: 7 });
            }
            // tongues of flame licking high above it
            for (let i = this._n('lick', 140 * wb * big, dt, 5); i > 0; i--) {
                const a = Math.random() * TAU, r = R * (0.3 + Math.random() * 0.6);
                const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = c.y + R * 0.3;
                for (let j = 0; j < 4; j++) P.spawn(x, y + j * 0.25, z, Math.cos(a) * 0.6, 6 + Math.random() * 4 + j, Math.sin(a) * 0.6, j < 2 ? pick(FLAME) : pick(DEEP), (0.32 - j * 0.05) * big, 0.35 + Math.random() * 0.2, { shrink: 0.5, spin: 9 });
            }
            // the fire's skirt on the ground, spreading out
            for (let i = this._n('wall', 160 * wb * big, dt, 6); i > 0; i--) {
                const a = Math.random() * TAU, r = R * (0.7 + Math.random() * 0.5);
                P.spawn(c.x + Math.cos(a) * r, c.y - R * 0.45, c.z + Math.sin(a) * r, Math.cos(a) * 2.5, 1 + Math.random() * 2, Math.sin(a) * 2.5, pick(DEEP), (0.3 + Math.random() * 0.3) * big, 0.5, { shrink: -0.4, spin: 6 });
            }
            // black-grey smoke boiling up from its top
            for (let i = this._n('smoke', 14 * wb * big, dt, 2); i > 0; i--) {
                fx.smoke.spawn(c.x + (Math.random() - 0.5) * R, c.y + R * 0.9 + Math.random(), c.z + (Math.random() - 0.5) * R,
                    (Math.random() - 0.5) * 0.8, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, pick(SMOKE), (0.5 + Math.random() * 0.6) * big, 1.8 + Math.random(), { shrink: -0.6, spin: 0.8 });
            }
            // heat: a faint shimmer of hot air rising over it
            for (let i = this._n('shim', 40 * wb, dt, 2); i > 0; i--) {
                P.spawn(c.x + (Math.random() - 0.5) * R * 1.4, c.y + R * 0.9 + Math.random() * R, c.z + (Math.random() - 0.5) * R * 1.4, (Math.random() - 0.5) * 0.4, 1.6, (Math.random() - 0.5) * 0.4, 0x2a1408, 0.9 * big, 0.9, { shrink: -0.6, spin: 1 });
            }
            // embers flying off
            for (let i = this._n('ember', 70 * wb * big, dt, 4); i > 0; i--) {
                const u = this._inSphere(R * 0.8);
                fx.sparks.spawn(c.x + u.x, c.y + u.y, c.z + u.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 5,
                    Math.random() < 0.5 ? 0xffc040 : 0xff7a20, 0.05 + Math.random() * 0.05, 0.8 + Math.random() * 0.8, { shrink: 0.5, gravity: -4 });
            }
            // the link: fire pouring out of the wand into the blaze (it is held, it is fed)
            const o = f.o;
            if (o) {
                const L = o.distanceTo(c);
                for (let i = this._n('link', 160 * wb, dt, 6); i > 0; i--) {
                    const life = 0.18 + Math.random() * 0.12;
                    const j = (Math.random() - 0.5) * 0.15;
                    P.spawn(o.x + j, o.y + j, o.z - j, (c.x - o.x) / life * 0.9, (c.y - o.y) / life * 0.9, (c.z - o.z) / life * 0.9, Math.random() < 0.4 ? pick(CORE) : pick(FLAME), 0.12 + Math.random() * 0.1 + L * 0.01, life, { shrink: -1.5, spin: 5 });
                }
            }
            // steam where it meets water
            if (f.wet > 0) {
                for (let i = this._n('steam', 60, dt, 4); i > 0; i--) {
                    fx.smoke.spawn(c.x + (Math.random() - 0.5) * R, c.y - R * 0.3 + Math.random() * R * 0.5, c.z + (Math.random() - 0.5) * R,
                        (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2, pick(STEAM), 0.6 + Math.random() * 0.5, 1 + Math.random() * 0.6, { shrink: -1.4, spin: 1 });
                }
            }
        }
        // ----------------------------------------------------------- the ring
        if (wr > 0.03) {
            const rr = f.rr, H = f.rh || HELLFIRE.RING_H, W = f.rw || HELLFIRE.RING_W;
            const more = Math.min(3, rr / ringRadius(HELLFIRE.R0)); // (a wider ring: more flames)
            const gy = body.y - 1.95; // (the ground under the caster's feet)
            const sp = f.spin;
            // the roaring wall: flames all round, carried round by the spin
            for (let i = this._n('wall', 1100 * wr * more, dt, 60); i > 0; i--) {
                const a = Math.random() * TAU, r = rr + (Math.random() - 0.5) * W;
                const ca = Math.cos(a), sa = Math.sin(a), v = sp * r;
                P.spawn(body.x + ca * r, gy + Math.random() * 0.6, body.z + sa * r, -sa * v * 0.8, (2.5 + Math.random() * 4 * flick) * H / HELLFIRE.RING_H, ca * v * 0.8,
                    Math.random() < 0.15 ? pick(CORE) : pick(FLAME), 0.35 + Math.random() * 0.5, 0.45 + Math.random() * 0.4, { shrink: -0.8, spin: 7 });
            }
            // fire serpents racing round it: heads high, bodies writhing up and down
            const NS = f.ns || 5;
            for (let i = this._n('snake', 1300 * wr * Math.min(2.2, NS / 5), dt, 60); i > 0; i--) {
                const s = (Math.random() * NS) | 0;
                const seg = Math.floor(Math.pow(Math.random(), 1.6) * 16); // (thicker at the head)
                const head = f.ang * (1 + s * 0.07) + s * (TAU / NS);
                const a = head - seg * 0.11;
                const wave = t * (2.2 + s * 0.3) + s * 1.9 - seg * 0.45;
                const r = rr + Math.sin(wave * 0.8 + s) * (0.9 + W * 0.25);
                const y = gy + 1.2 + 0.4 * (s % 2) + Math.sin(wave) * 1.3 + (seg === 0 ? 0.2 : 0);
                const ca = Math.cos(a), sa = Math.sin(a), v = sp * r;
                const size = (seg === 0 ? 0.75 : 0.55 - seg * 0.025) * (0.8 + Math.random() * 0.4);
                P.spawn(body.x + ca * r + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, body.z + sa * r + (Math.random() - 0.5) * 0.3,
                    -sa * v * 0.25, 0.6 + Math.random(), ca * v * 0.25, seg < 2 ? pick(CORE) : seg < 8 ? pick(FLAME) : pick(DEEP), Math.max(0.15, size), 0.22 + Math.random() * 0.12, { shrink: 0.8, spin: 8 });
            }
            // smoke over the ring, embers flung outwards
            for (let i = this._n('smoke', 10 * wr, dt, 1); i > 0; i--) {
                const a = Math.random() * TAU;
                fx.smoke.spawn(body.x + Math.cos(a) * (rr + 0.5), gy + H + 0.5 + Math.random(), body.z + Math.sin(a) * (rr + 0.5), Math.cos(a) * 1.2, 1.8 + Math.random(), Math.sin(a) * 1.2, pick(SMOKE), 0.6 + Math.random() * 0.5, 1.8, { shrink: -0.5, spin: 0.8 });
            }
            for (let i = this._n('ember', 90 * wr, dt, 4); i > 0; i--) {
                const a = Math.random() * TAU;
                fx.sparks.spawn(body.x + Math.cos(a) * rr, gy + Math.random() * H, body.z + Math.sin(a) * rr, Math.cos(a) * 5 - Math.sin(a) * sp * 2, 2 + Math.random() * 4, Math.sin(a) * 5 + Math.cos(a) * sp * 2,
                    Math.random() < 0.5 ? 0xffc040 : 0xff7a20, 0.06 + Math.random() * 0.05, 0.9, { shrink: 0.5, gravity: -5 });
            }
        }
        // the firelight on everything round it
        _a.copy(c).lerp(_b.set(body.x, body.y + 0.5, body.z), wr);
        if (amt >= 1 || !this.state) fx.lightFlash(_a, 0xff6a1a, (4 + 4 * Math.min(1.5, f.R / 3)) * flick * Math.max(0.5, amt), 0.15, 30 + f.R * 6);
        if (f === this.state) fx.shake = Math.max(fx.shake || 0, 0.05 + 0.08 * Math.min(1, f.R / 4)); // (the roar shakes the air)
    }

    /** A random point in a sphere of radius r (shared vector). */
    _inSphere(r) {
        let x, y, z;
        do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
        return _e.set(x * r, y * r, z * r);
    }

    /** The fire goes out: a last burst of flame and a cloud of smoke. */
    _dieDown(c, R) {
        const fx = this.game.fx;
        if (!fx || !c || !(R > 0.2)) return;
        for (let i = 0; i < 30; i++) {
            fx.smoke.spawn(c.x + (Math.random() - 0.5) * R, c.y + Math.random() * R, c.z + (Math.random() - 0.5) * R, (Math.random() - 0.5), 1.5 + Math.random() * 2, (Math.random() - 0.5), pick(SMOKE), 0.8 + Math.random(), 2.5, { shrink: -0.6, spin: 1 });
        }
        if (this.pool) for (let i = 0; i < 60; i++) { const u = this._inSphere(R); this.pool.spawn(c.x + u.x, c.y + u.y, c.z + u.z, u.x, 2 + Math.random() * 2, u.z, pick(FLAME), 0.4 + Math.random() * 0.4, 0.5, { shrink: 1, spin: 6 }); }
    }

    /** Everything ends (the game ends, a new world). */
    clear() {
        this.state = null;
        this.remote.clear();
        this.left.length = 0;
        this.pool?.clear?.();
    }

    dispose() {
        this.clear();
        if (this.pool?.mesh) { this.game.scene?.remove(this.pool.mesh); this.pool.mesh.geometry?.dispose(); this.pool.mesh.material?.dispose(); }
    }
}
