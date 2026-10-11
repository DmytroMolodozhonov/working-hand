/**
 * WaterVortex.js — «Water Vortex» (with «Bubble» and «Frozen») and «Fire Maxima».
 *
 *   «Water Vortex»  a wand in the hand (Creative: a bare hand too); stand by water,
 *                   point the hand AT the water and say it (25 mana — a very strong spell).
 *                   Within 3 s start swinging the hand round and round: water rises out of
 *                   the river and flows round you — a whole vortex, ring after ring with
 *                   gaps between them. It is the real hand that drives it: every turn of the
 *                   hand brings more water (one more turn = more water, up to 6 rings), and
 *                   the faster the hand goes, the faster the water follows and the more of it
 *                   each turn brings. Nothing is gathered while the hand does not go round.
 *   pointing        stop swinging and point the hand somewhere (hold it still a moment): the
 *                   vortex stops gathering and ALL its water flies there, a spinning torrent
 *                   that goes faster and faster (a small correction towards a creature the
 *                   hand pointed at, never a hard turn).
 *   hit             any creature (wizard, villager, knight, zombie, animal…): pushed hard by
 *                   the water — not hurt; a big vortex (10 m³ and more) knocks it down.
 *                   A «Protection» raised beforehand (facing it) or a dome stops it: the water
 *                   breaks on the shield.
 *   «Bubble»        said by the caster at the moment of the hit (a little before, or within
 *                   ~1.5 s after): the water wraps the creature in a bubble that grows until the
 *                   whole vortex has flowed into it. The one inside floats and can't get out.
 *                   From inside, «Protection Maxima» (arms out in a T) bursts it — but only
 *                   before it freezes. A liquid bubble bursts by itself after 15 s.
 *   «Frozen»        said by the caster while the bubble is liquid: it freezes. Inside: −1 HP a
 *                   second from the cold and −1 HP a second without air; the body can't move.
 *                   Only «Fire Maxima» helps now (cast by the one inside or by anyone pointing at
 *                   the ice): the ice melts very fast in golden fire.
 *   «Fire Maxima»   (20 mana) a spiral of golden magic fire flies from the hand to where it points
 *                   (up to 22 m) and blooms into a fire flower ~3 m wide: it melts every ice there
 *                   (ice bubbles, ice balls and shapes, frozen creatures thaw), burns the creatures
 *                   in it (3 HP to a wizard, 6 to others; a shield stops it) and sets trees on fire.
 *                   Said from inside an ice bubble it blooms around you and frees you unhurt.
 *
 * Network: the caster's vortex is sent ~10×/s ('vx' st) and drawn round the caster everywhere.
 * The flight is replayed on every computer ('vx' launch); a wizard's own computer decides a hit
 * on them (it knows their shield), the host decides other creatures. Bubble / freeze / burst /
 * fire are events everybody applies; the one inside (or the host for a creature) takes the damage.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { createWaterMaterial } from '../fx/WaterMaterial.js';

export const VORTEX = {
    COST: 25, // mana (see Combat.SPELL_COST)
    START_TIME: 3, // s to start swinging the hand after the words
    START_TURNS: 0.3, // turns of the hand that mean «it has started»
    MIN_RADIUS: 0.08, // m: the hand must really go round (after the slow centre is taken out)
    MIN_SPEED: 0.35, // m/s
    GATHER: 3.2, // m³ of water a full turn of the hand brings (at a calm speed)
    MAX_VOLUME: 48,
    LAYER_VOLUME: 8, // m³ in one ring
    LAYER_R0: 1.45, // m: the first ring round the body
    LAYER_GAP: 0.72, // m between the rings (a gap of air between the layers)
    SOURCE: 30, // m: the water it gathers from must be this close
    IDLE_END: 10, // s without swinging or pointing → the vortex falls
    AIM_STILL: 0.35, // s the pointing hand stays still → it flies
    MIN_LAUNCH: 1.5, // m³
    V0: 7, // m/s at the start of the flight
    ACCEL: 26, // m/s² — faster and faster
    VMAX: 46,
    RANGE: 50, // m
    TURN: 1.4, // rad/s while correcting towards the target
    BEND: 0.2, // rad: the most it turns in all
    CLING: 1.6, // s the water clings to the one it hit (time to say «Bubble»)
    BUBBLE_ARM: 2.5, // s before the hit a «Bubble» still counts
    BUBBLE_GROW: 2.2, // s: the whole vortex flows into the bubble
    BUBBLE_LIFE: 15, // s a liquid bubble holds
    ICE_LIFE: 90, // s at most (then it cracks)
    COLD_DPS: 1, // HP a second from the cold
    AIR_DPS: 1, // HP a second without air
    KNOCK_VOLUME: 10, // m³: from this much water the hit knocks down
    BUBBLE_COST: 5,
};

export const FIRE_MAXIMA = {
    COST: 20,
    RANGE: 22, // m
    RADIUS: 3.2, // m: the fire flower
    TRAVEL: 0.35, // s the fire spiral flies
    PLAYER_DMG: 3,
    CREATURE_DMG: 6,
    MELT_TIME: 1.1, // s the ice takes to melt
};

const TAU = Math.PI * 2;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** How much water one turn of the hand brings at this hand speed (m/s): faster → more. */
export function turnWater(handSpeed) {
    return VORTEX.GATHER * (0.6 + 0.4 * clamp(handSpeed / 1.5, 0, 3));
}

/** How full each ring is (0…1), inner ring first. */
export function layersOf(volume) {
    const out = [];
    let v = clamp(volume, 0, VORTEX.MAX_VOLUME);
    while (v > 1e-6) {
        out.push(Math.min(1, v / VORTEX.LAYER_VOLUME));
        v -= VORTEX.LAYER_VOLUME;
    }
    return out;
}

export const layerRadius = (i) => VORTEX.LAYER_R0 + i * VORTEX.LAYER_GAP;

/** Flight speed after `t` seconds: faster and faster. */
export function flightSpeed(t) {
    return Math.min(VORTEX.VMAX, VORTEX.V0 + VORTEX.ACCEL * t);
}

/** How hard the water pushes (m/s) and whether it knocks down. */
export function pushOf(volume, power = 1) {
    return { speed: Math.min(26, (6 + 0.35 * volume) * power), knock: volume >= VORTEX.KNOCK_VOLUME };
}

/** The bubble's size when all `volume` has flowed in. */
export function bubbleRadius(volume) {
    return clamp(1.25 + volume * 0.025, 1.3, 2.5);
}

/** HP a second inside the frozen bubble (cold + no air). */
export const iceDamagePerSecond = () => VORTEX.COLD_DPS + VORTEX.AIR_DPS;

/**
 * Measures how the hand goes round: feed it the hand's place (relative to the body)
 * every frame. A slow average of the places is the circle's centre (so a circle in any
 * plane counts — round the body, over the head, in front); only movement ROUND that
 * centre turns the counter — shaking or moving the hand back and forth does not.
 */
export class SwingMeter {
    constructor() {
        this.reset();
    }

    reset() {
        this.c = null;
        this.prev = new THREE.Vector3();
        this.axis = new THREE.Vector3();
        this.lastT = 0;
        this.turns = 0; // full turns so far
        this.rate = 0; // turns a second (smoothed)
        this.speed = 0; // hand speed m/s (smoothed)
        this.last = 0; // turns added by the last sample
    }

    /** @returns {number} turns added by this sample */
    push(t, p) {
        this.last = 0;
        if (!this.c) { this.c = p.clone(); this.prev.copy(p); this.lastT = t; return 0; }
        const dt = t - this.lastT;
        if (dt <= 1e-4) return 0;
        this.lastT = t;
        if (dt > 0.35) { this.prev.copy(p); this.c.copy(p); return 0; } // (a gap: start again)
        const v = _a.subVectors(p, this.prev).divideScalar(dt);
        this.prev.copy(p);
        this.c.lerp(p, 1 - Math.exp(-dt / 0.5));
        const r = _b.subVectors(p, this.c);
        const r2 = r.lengthSq();
        const sp = v.length();
        this.speed += (Math.min(sp, 8) - this.speed) * (1 - Math.exp(-dt / 0.25)); // (a jump of the tracking is not a hand that fast)
        let dTheta = 0;
        if (r2 > VORTEX.MIN_RADIUS * VORTEX.MIN_RADIUS && sp > VORTEX.MIN_SPEED && sp < 25) {
            const w = _c.crossVectors(r, v).divideScalar(r2); // rad/s round the centre (axis = its direction)
            this.axis.lerp(w, 1 - Math.exp(-dt / 0.6));
            const ax = this.axis.length();
            if (ax > 1e-6) dTheta = Math.min(0.8, Math.max(0, w.dot(this.axis) / ax) * dt); // (the same way round only)
        }
        const turns = dTheta / TAU;
        this.turns += turns;
        this.rate += (turns / dt - this.rate) * (1 - Math.exp(-dt / 0.2));
        this.last = turns;
        return turns;
    }
}

/** Closest distance from point p to the segment a–b. */
function segDist(p, a, b) {
    const ab = _c.subVectors(b, a);
    const L = ab.lengthSq();
    const k = L > 1e-9 ? clamp(_d.subVectors(p, a).dot(ab) / L, 0, 1) : 0;
    return _d.copy(a).addScaledVector(ab, k).distanceTo(p);
}

export class WaterVortex {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.state = null; // my vortex: {phase 'call'|'gather', side, t, volume, src, angle, spin, ...}
        this.meter = new SwingMeter();
        this.remote = new Map(); // by -> {s: [...], at, angle}
        this.flights = new Map(); // id -> flying / clinging vortex (everyone's)
        this.bubbles = new Map(); // id -> bubble round a creature (everyone's)
        this.effects = []; // fire spirals / blooms
        this.log = []; // events (tests / debugging)
        this._seq = 0;
        this._t = 0;
        this._sendT = 0;
        this._sent = false;
        if (!this.scene) return;
        this.blobMat = createWaterMaterial();
        this.blobMat.userData.uniforms.uWobble.value = 0.16;
        this.bubbleMat = createWaterMaterial();
        this.bubbleMat.userData.uniforms.uWobble.value = 0.07;
        this.iceMat = createWaterMaterial({ ice: true });
        this.iceMat.userData.uniforms.uWobble.value = 0.05;
        this._mats = [this.blobMat, this.bubbleMat, this.iceMat];
        this.blobGeo = new THREE.SphereGeometry(1, 14, 10);
        this.sphereGeo = new THREE.SphereGeometry(1, 40, 28);
        this.blobs = new THREE.InstancedMesh(this.blobGeo, this.blobMat, 1600);
        this.blobs.count = 0;
        this.blobs.visible = false;
        this.blobs.frustumCulled = false;
        this.blobs.renderOrder = 2;
        this.scene.add(this.blobs);
    }

    get me() {
        return this.game.localId;
    }

    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 40) this.log.shift();
    }

    _send(m) {
        if (this.game.sync?.vortex) this.game.sync.vortex(m);
    }

    _hint(text, isFinal = true) {
        if (isFinal) this.game.hud?.setVoice?.(text, true);
        return null;
    }


    // ================================================================ voice
    /**
     * Voice words that belong here. Returns undefined when the word is not this module's
     * business, else what castLocalSpell returns (the name, or null).
     */
    voice(name, text, isFinal = true) {
        const trap = this.myTrap();
        if (trap && trap.phase === 'ice') {
            if (name === 'FireMaxima') return this.castFire(isFinal);
            return this._hint('🧊 Вы во льду и не можете двигаться. Спасёт только <b>«Fire Maxima»</b>', isFinal);
        }
        if (name === 'WaterVortex') return this.cast(isFinal);
        if (name === 'FireMaxima') return this.castFire(isFinal);
        if ((name === 'AirBubble' || name === 'AirBubbleMaxima') && this._bubbleWanted()) return this.sayBubble(isFinal);
        if ((name === 'Frozen' || name === 'Ice') && this._myLiquidBubble()) return this.sayFrozen(isFinal);
        return undefined;
    }

    /** The bubble I am trapped in (or null). */
    myTrap() {
        for (const b of this.bubbles.values()) if (b.tk === 'p' && b.tid === this.me && b.phase !== 'melt' && b.phase !== 'gone') return b;
        return null;
    }

    _myLiquidBubble() {
        let best = null;
        for (const b of this.bubbles.values()) if (b.by === this.me && b.phase === 'liquid' && (!best || b.t < best.t)) best = b;
        return best;
    }

    _bubbleWanted() {
        for (const f of this.flights.values()) if (f.by === this.me && (f.phase === 'fly' || f.phase === 'cling')) return true;
        return false;
    }

    /** Which hand casts: the wand's; Creative without a wand: a raised hand (the spell hand first). */
    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        if (g.config?.mode !== 'creative') return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        for (const s of [pref, pref === 'right' ? 'left' : 'right']) if (ch.isArmRaised?.(s)) return s;
        return pref;
    }

    /** Water the hand points at (or right below it), within reach. */
    _pointedWater(side) {
        const g = this.game;
        const t = g.terrain?.data;
        if (!t) return null;
        const ch = g.character;
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side);
        const d = ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side);
        for (let k = 0.3; k < 16; k += 0.4) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            if (t.get(Math.round(x), Math.floor(y + 1.5), Math.round(z)) === BLOCK.WATER) return new THREE.Vector3(x, y, z);
            if (t.isSolidAt?.(x, y, z)) break;
        }
        // (pointing a little down at the river from its bank: the surface just below the line)
        if (d.y < -0.05) {
            for (let k = 1; k < 12; k += 1) {
                const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
                const s = t.findWaterSurface?.(x, z, 1.2);
                if (s && y - s.y < 3.5 && y - s.y > -1) return new THREE.Vector3(s.x, s.y, s.z);
            }
        }
        return null;
    }

    /** «Water Vortex»: the words. */
    cast(isFinal = true) {
        const g = this.game;
        if (this.state) return null; // (the interim and the final version of one phrase)
        if (g._inDuel?.()) return this._hint('⚡ Идёт дуэль — другие заклинания не работают', isFinal);
        const side = this._castSide();
        if (!side) return this._hint('🪄 «Water Vortex» работает только с волшебной палочкой в руке', isFinal);
        const src = this._pointedWater(side);
        if (!src) return this._hint('🌀 Встаньте у воды и покажите рукой (палочкой) прямо <b>на воду</b> — тогда скажите «Water Vortex»', isFinal);
        const tired = g.combat.check('WaterVortex');
        if (tired) return this._hint(tired, true);
        g.combat.pay('WaterVortex');
        g._manaLater = true; // (mana: it counts as working when the vortex hits — see _hit)
        this.meter.reset();
        this.state = { phase: 'call', side, t: 0, idle: 0, still: 0, volume: 0, shown: 0, src, angle: 0, spin: 0.6, lastDir: null, power: g.wandMagic?.power?.('WaterVortex') || 1 };
        this._note({ ev: 'cast', side });
        g.hud?.setVoice?.('🌀 Вода слушается… <b>крутите рукой по кругу</b> (3 секунды, чтобы начать)', true);
        if (g.sound) g.sound.playWaterRise?.();
        g.noteCaster?.('WaterVortex', this.me);
        return 'WaterVortex';
    }

    /** «Стоп» / the caster can't go on: the gathered water falls. */
    stop() {
        if (!this.state) return false;
        this._collapse(this.game.character.group.position, this.state.volume);
        this.state = null;
        return true;
    }

    _collapse(center, volume) {
        const n = Math.min(60, 10 + volume * 2);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, r = layerRadius(Math.floor(Math.random() * Math.max(1, layersOf(volume).length)));
            this._drop(_a.set(center.x + Math.cos(a) * r, center.y + 0.3, center.z + Math.sin(a) * r), _b.set(0, -2, 0));
        }
        if (this.game.sound) this.game.sound.playSplash?.();
    }

    /** «Bubble» while my vortex flies or clings to the one it hit. */
    sayBubble(isFinal) {
        const g = this.game;
        const tired = g.combat.check('VortexBubble');
        if (tired) return this._hint(tired, true);
        let done = false;
        for (const f of this.flights.values()) {
            if (f.by !== this.me) continue;
            if (f.phase === 'fly' && !f.bubbleAt) { f.bubbleAt = this._t; done = true; }
            if (f.phase === 'cling' && !f.bubbled) { this._startBubble(f); done = true; }
        }
        if (!done) return null;
        g.combat.pay('VortexBubble');
        g.hud?.setVoice?.('🫧 Bubble! Вода обнимает цель…', true);
        return 'VortexBubble';
    }

    /** «Frozen» while my bubble is still liquid. */
    sayFrozen(isFinal) {
        const g = this.game;
        const b = this._myLiquidBubble();
        if (!b) return null;
        const tired = g.combat.check('Frozen');
        if (tired) return this._hint(tired, true);
        g.combat.pay('Frozen');
        this._freeze(b);
        this._send({ ev: 'freeze', id: b.id });
        g.hud?.setVoice?.('🧊 Frozen! Пузырь замёрз', true);
        return 'Frozen';
    }

    // ================================================================ update
    update(dt) {
        this._t += dt;
        if (this._mats) for (const m of this._mats) m.userData.uniforms.uTime.value += dt;
        if (this.state) this._updateMine(dt);
        this._updateFlights(dt);
        this._updateBubbles(dt);
        this._updateEffects(dt);
        this._sendState(dt);
        this._draw(dt);
    }

    _updateMine(dt) {
        const g = this.game, s = this.state, ch = g.character;
        if (g.combat.dead || g.combat.frozen || g.combat.stunned || this.myTrap()) { this.stop(); return; }
        s.t += dt;
        const body = ch.group.position;
        const hand = ch.getHandWorldPosition(s.side, this._hand || (this._hand = new THREE.Vector3())).sub(body);
        const turns = this.meter.push(this._t, hand);
        const sp = this.meter.speed;
        if (s.phase === 'call') {
            // the water bulges where it will come from
            if (Math.random() < 0.6) this._drop(s.src, _b.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2));
            if (this.meter.turns >= VORTEX.START_TURNS) {
                s.phase = 'gather';
                s.volume = Math.max(s.volume, turnWater(sp) * this.meter.turns);
                this._note({ ev: 'gather' });
                g.hud?.setVoice?.('🌀 Водоворот! Крутите быстрее — воды больше. Покажите рукой цель — он полетит', true);
            } else if (s.t > VORTEX.START_TIME) {
                this.state = null;
                this._note({ ev: 'fizzle' });
                this._hint('🌀 Вода опала — нужно было начать крутить рукой в первые 3 секунды');
            }
            return;
        }
        // gathering: only while the hand goes round, and water is near
        const near = s.src.distanceTo(body) < VORTEX.SOURCE;
        if (turns > 0 && near && s.volume < VORTEX.MAX_VOLUME) {
            s.volume = Math.min(VORTEX.MAX_VOLUME, s.volume + turns * turnWater(sp));
            // the water visibly flows from the river into the rings
            const flows = Math.min(4, 1 + sp);
            for (let i = 0; i < flows; i++) if (Math.random() < 0.6) this._flow(s.src, _b.copy(body).add(_c.set(Math.cos(s.angle) * layerRadius(0), 0.3, Math.sin(s.angle) * layerRadius(0))));
        }
        // the water follows the hand: as fast as it goes round (a faster hand: it catches up sooner)
        const target = Math.max(0.5, this.meter.rate * TAU * 1.1);
        s.spin += (target - s.spin) * Math.min(1, dt * (1.2 + 2.5 * sp));
        s.angle += s.spin * dt;
        if (Math.random() < 0.3 + s.volume * 0.01) this._spray(body, s);
        // pointing: the hand stops going round and points (held still a moment) → it flies
        const dir = ch.getPointingDirection ? ch.getPointingDirection(s.side, _c) : ch.getHandDirection(s.side, _c);
        const turnRate = s.lastDir ? s.lastDir.angleTo(dir) / Math.max(dt, 1e-3) : 9;
        s.lastDir = (s.lastDir || new THREE.Vector3()).copy(dir);
        const raised = ch.isArmRaised ? ch.isArmRaised(s.side) : true;
        const calm = this.meter.rate < 0.15 && sp < 0.6 && turnRate < 1.2;
        s.still = calm && raised && dir.y > -0.85 ? s.still + dt : 0;
        s.why = { rate: this.meter.rate, sp, turnRate, raised, dy: dir.y }; // (tests / debugging)
        if (s.still >= VORTEX.AIM_STILL && s.volume >= VORTEX.MIN_LAUNCH) { this._launch(dir.clone()); return; }
        s.idle = turns > 0 ? 0 : s.idle + dt;
        if (s.idle > VORTEX.IDLE_END) {
            this._note({ ev: 'collapse' });
            this.stop();
            this._hint('🌀 Водоворот распался — рука остановилась');
        }
    }

    /** All the water flies where the hand points. */
    _launch(dir) {
        const g = this.game, s = this.state;
        const o = g.character.group.position.clone().add(_a.set(0, 0.4, 0));
        // a creature the hand points right at: a small correction towards it in flight
        let tk = null, tid = null;
        const t = g.duel?.findTarget?.(s.side);
        if (t && t.kind !== 'b') { tk = t.kind; tid = t.id; }
        const id = `${this.me}:${++this._seq}`;
        const m = { ev: 'launch', id, o: [o.x, o.y, o.z].map(r3), d: [dir.x, dir.y, dir.z].map(r3), v: r3(s.volume), a: r3(s.angle), pw: r3(s.power), tk, tid };
        this.state = null;
        this._addFlight(this.me, m);
        this._send(m);
        this._note({ ev: 'launch', id, v: m.v, tk, tid });
        g.hud?.setVoice?.('🌀 Водоворот летит! Скажите <b>«Bubble»</b> в момент удара', true);
        if (g.sound) g.sound.playWhoosh?.();
    }

    _addFlight(by, m) {
        if (this.flights.has(m.id)) return;
        const d = new THREE.Vector3(m.d[0], m.d[1], m.d[2]).normalize();
        this.flights.set(m.id, {
            id: m.id, by, phase: 'fly', t: 0, pos: new THREE.Vector3(m.o[0], m.o[1], m.o[2]), o: new THREE.Vector3(m.o[0], m.o[1], m.o[2]),
            d0: d.clone(), dir: d, volume: +m.v || 1, angle: +m.a || 0, power: +m.pw || 1, tk: m.tk || null, tid: m.tid ?? null,
            flown: 0, squeeze: 1, bent: 0,
        });
    }

    _updateFlights(dt) {
        for (const f of [...this.flights.values()]) {
            f.t += dt;
            f.angle += dt * (6 + 4 * f.squeeze);
            if (f.phase === 'fly') this._fly(f, dt);
            else if (f.phase === 'cling') this._cling(f, dt);
            else if (f.phase === 'feed') this._feed(f, dt);
        }
    }

    _fly(f, dt) {
        const g = this.game;
        f.squeeze = Math.max(0.32, f.squeeze - dt * 2.2);
        const v = flightSpeed(f.t);
        // a small correction towards the creature the hand pointed at (never a hard turn)
        if (f.tk && f.bent < VORTEX.BEND) {
            const tp = g.duel?._targetPos?.({ tk: f.tk, tid: f.tid }, _a);
            if (tp) {
                const want = _b.subVectors(tp, f.pos).normalize();
                const ang = f.dir.angleTo(want);
                if (ang > 1e-3 && ang < 1.2) {
                    const step = Math.min(ang, VORTEX.TURN * dt, VORTEX.BEND - f.bent);
                    const axis = _c.crossVectors(f.dir, want).normalize();
                    if (axis.lengthSq() > 0.5) { f.dir.applyAxisAngle(axis, step).normalize(); f.bent += step; }
                }
            }
        }
        const stepLen = v * dt;
        const n = Math.max(1, Math.ceil(stepLen / 0.4));
        const rf = 0.55 + 0.08 * layersOf(f.volume).length;
        for (let i = 0; i < n; i++) {
            f.pos.addScaledVector(f.dir, stepLen / n);
            f.flown += stepLen / n;
            if (this._touch(f, rf)) return;
            if (this._blockedAt(f.pos)) { this._endFlight(f, 'wall'); return; }
        }
        if (Math.random() < 0.9) this._drop(f.pos, _a.copy(f.dir).multiplyScalar(-3).add(_b.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2)));
        if (f.flown > VORTEX.RANGE) this._endFlight(f, 'range');
    }

    _blockedAt(p) {
        const g = this.game;
        if (g.collision?.pointBlocked?.(p.x, p.y, p.z)) return true;
        const gy = g.collision?.surfaceY?.(p.x, p.z);
        return Number.isFinite(gy) && p.y < gy - 0.2;
    }

    /** Does the flying water touch a body this computer decides about? */
    _touch(f, rf) {
        const g = this.game;
        const bodies = g.duel?._bodies?.(f.by) || [];
        const referee = !!g.authority;
        for (const b of bodies) {
            if (b.kind === 'b') continue; // (book-birds: no)
            const mine = b.kind === 'p' ? b.id === this.me : referee;
            if (!mine) continue;
            if (segDist(f.pos, b.a, b.b) > b.r + rf) continue;
            if (b.kind === 'p') {
                // my own computer knows my shield
                const from = _a.copy(f.pos).addScaledVector(f.dir, -3);
                if (g.combat.shieldFactor(from) >= 1) {
                    g.combat._blocked(from, 'WaterVortex');
                    this._send({ ev: 'block', id: f.id, p: [f.pos.x, f.pos.y, f.pos.z].map(r3) });
                    this._endFlight(f, 'block');
                    return true;
                }
            }
            this._hit(f, b.kind, b.id, true);
            return true;
        }
        return false;
    }

    /** The water hits a creature (decided here: `decided`; or by the computer that decides it). */
    _hit(f, tk, tid, decided) {
        const g = this.game;
        if (f.phase !== 'fly') return;
        f.phase = 'cling';
        f.t = 0;
        f.tk = tk; f.tid = tid;
        f.hitAt = this._t;
        this._note({ ev: 'hit', id: f.id, tk, tid });
        if (f.by === this.me) g.mana?.success('WaterVortex'); // (mana: my strong spell really worked)
        this._splash(f.pos, 1 + f.volume * 0.03, 30);
        if (g.sound) g.sound.playSplash?.();
        if (decided) {
            this._send({ ev: 'hit', id: f.id, tk, tid, p: [f.pos.x, f.pos.y, f.pos.z].map(r3) });
            this._push(f, tk, tid);
        }
        // «Bubble» said a moment before the hit
        if (f.by === this.me && f.bubbleAt && this._t - f.bubbleAt < VORTEX.BUBBLE_ARM) this._startBubble(f);
    }

    /** The push itself (on the computer that decides that creature). */
    _push(f, tk, tid) {
        const g = this.game;
        const { speed, knock } = pushOf(f.volume, f.power);
        const dir = _a.copy(f.dir).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize();
        const by = f.by;
        this._note({ ev: 'push', tk, tid, speed: r3(speed), knock });
        if (tk === 'p') {
            if (tid !== this.me) return;
            const c = g.combat;
            g.knockback?.add(_b.copy(dir).multiplyScalar(speed));
            const ch = g.character;
            ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, knock ? 5 : 3);
            if (knock && !g.flight?.active) {
                c.stun(1.4 + Math.min(2, f.volume / 24), by, 'water');
                ch.knockedDown = true;
            }
            g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, knock ? 0.8 : 0.4));
            g.hud?.setVoice?.(knock ? '🌊 Вас сбило с ног водоворотом!' : '🌊 Вас окатило водоворотом', true);
            return;
        }
        if (tk === 'z') {
            const z = g.zombieById?.get(tid);
            if (!z || z.isDead) return;
            z.windVel = (z.windVel || new THREE.Vector3()).add(_b.copy(dir).multiplyScalar(speed));
            z.vy = Math.max(z.vy || 0, knock ? 6 : 3.5);
            z.stunTimer = Math.max(z.stunTimer || 0, knock ? 2.5 : 0.6);
            return;
        }
        const cr = g.duel?._creature?.(tk, tid);
        if (!cr) return;
        if (tk === 'a') g.animals?.push?.(cr, _b.copy(dir).multiplyScalar(speed).setY(knock ? 6 : 3.5), knock ? 2.5 : 0.8);
        else if (tk === 'v') {
            cr.vx = (cr.vx || 0) + dir.x * speed * 0.7;
            cr.vz = (cr.vz || 0) + dir.z * speed * 0.7;
            cr.vy = Math.max(cr.vy || 0, knock ? 6 : 3.5);
            cr.stunT = Math.max(cr.stunT || 0, knock ? 2.5 : 0.8);
        }
    }

    /** After the hit the water clings round the target for a moment (time to say «Bubble»). */
    _cling(f, dt) {
        const g = this.game;
        const tp = g.duel?._targetPos?.({ tk: f.tk, tid: f.tid }, _a);
        if (tp) f.pos.lerp(tp, Math.min(1, dt * 10));
        f.squeeze = Math.max(0.3, f.squeeze - dt);
        if (f.t > VORTEX.CLING || !tp) this._endFlight(f, 'splash');
    }

    _startBubble(f) {
        if (f.bubbled) return;
        f.bubbled = true;
        f.phase = 'feed';
        f.t = 0;
        this._addBubble({ id: f.id, by: f.by, tk: f.tk, tid: f.tid, v: f.volume, p: f.pos });
        if (f.by === this.me) this._send({ ev: 'bubble', id: f.id, tk: f.tk, tid: f.tid, v: r3(f.volume), p: [f.pos.x, f.pos.y, f.pos.z].map(r3) });
    }

    /** The vortex flows into the bubble until all of it is there. */
    _feed(f, dt) {
        const b = this.bubbles.get(f.id);
        if (!b || b.phase === 'gone') { this.flights.delete(f.id); return; }
        f.pos.copy(b.pos);
        f.volume = Math.max(0, b.total * (1 - f.t / VORTEX.BUBBLE_GROW));
        f.squeeze = 0.3 + 0.4 * (1 - f.t / VORTEX.BUBBLE_GROW);
        if (f.t >= VORTEX.BUBBLE_GROW) this.flights.delete(f.id);
    }

    _endFlight(f, why, broadcast = true) {
        if (!this.flights.has(f.id)) return;
        this.flights.delete(f.id);
        this._note({ ev: 'end', id: f.id, why });
        this._splash(f.pos, 1 + f.volume * 0.04, 25 + f.volume);
        if (this.game.sound) this.game.sound.playSplash?.();
        if (broadcast && f.by === this.me && why !== 'block') this._send({ ev: 'end', id: f.id, why, p: [f.pos.x, f.pos.y, f.pos.z].map(r3) });
    }

    // ============================================================= bubbles
    _addBubble(m) {
        if (this.bubbles.has(m.id)) return this.bubbles.get(m.id);
        const p = m.p instanceof THREE.Vector3 ? m.p.clone() : new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
        const b = {
            id: m.id, by: m.by, tk: m.tk, tid: m.tid, phase: 'liquid', t: 0, total: +m.v || 1,
            r: 0.5, R: bubbleRadius(+m.v || 1), pos: p, anchor: null, dmgT: 0, iceT: 0, meltT: 0, burstAsked: false,
        };
        if (this.scene) {
            b.mesh = new THREE.Mesh(this.sphereGeo, this.bubbleMat);
            b.mesh.renderOrder = 3;
            b.mesh.position.copy(p);
            b.mesh.scale.setScalar(b.r);
            this.scene.add(b.mesh);
        }
        this.bubbles.set(m.id, b);
        this._note({ ev: 'bubble', id: m.id, tk: m.tk, tid: m.tid });
        if (b.tk === 'p' && b.tid === this.me) {
            const g = this.game;
            g.hud?.setVoice?.('🫧 Вы в водяном пузыре! Разведите руки буквой <b>T</b> и скажите «Protection Maxima», пока он не замёрз', true);
            if (g.water?.active) g.water.drop();
            if (g.flight?.busy) g.flight.land?.('stunned');
            this.stop();
        }
        return b;
    }

    _freeze(b) {
        if (!b || b.phase !== 'liquid') return;
        b.phase = 'ice';
        b.iceT = 0;
        b.dmgT = 0;
        b.r = Math.max(b.r, b.R * 0.9);
        if (b.mesh) b.mesh.material = this.iceMat;
        this._sparkle(b.pos, 40, b.r);
        if (this.game.sound) this.game.sound.playIce?.();
        this._note({ ev: 'freeze', id: b.id });
        if (b.tk === 'p' && b.tid === this.me) {
            const c = this.game.combat;
            c.encased = true;
            c.shield = null;
            this.game.hud?.setVoice?.('🧊 Пузырь замёрз! −1 ❤ в секунду от холода и −1 ❤ без воздуха. Спасёт только <b>«Fire Maxima»</b>', true);
        }
    }

    /** The bubble bursts (Protection Maxima from inside, its time ran out, the one inside died). */
    _burst(b, why = 'burst', broadcast = false) {
        if (!b || b.phase === 'gone') return;
        this._note({ ev: 'burst', id: b.id, why });
        if (b.phase === 'ice') this._sparkle(b.pos, 50, b.r);
        else this._splash(b.pos, 1.5 + b.r * 0.5, 50);
        if (this.game.sound) (b.phase === 'ice' ? this.game.sound.playFrozenHit : this.game.sound.playSplash)?.call(this.game.sound);
        this._remove(b);
        if (broadcast) this._send({ ev: 'burst', id: b.id, why });
    }

    /** «Fire Maxima» on the ice: it melts very fast in golden fire. */
    _melt(b) {
        if (!b || b.phase === 'gone' || b.phase === 'melt') return;
        const wasIce = b.phase === 'ice';
        b.phase = 'melt';
        b.meltT = 0;
        this._note({ ev: 'melt', id: b.id, ice: wasIce });
        this._release(b);
        this.game.fx?.lightFlash?.(b.pos, 0xffb040, 4, 0.6, 25);
    }

    _remove(b) {
        b.phase = 'gone';
        this._release(b);
        if (b.mesh) { this.scene.remove(b.mesh); b.mesh = null; }
        this.bubbles.delete(b.id);
        const f = this.flights.get(b.id);
        if (f) this.flights.delete(b.id);
    }

    /** The one inside is free again. */
    _release(b) {
        if (b.released) return;
        b.released = true;
        const g = this.game;
        if (b.tk === 'p' && b.tid === this.me) {
            g.combat.encased = false;
            g.hud?.setFrozenOverlay?.(0);
            g.hud?.setStatus?.('');
            g.character.verticalVelocity = 0;
        }
    }

    _updateBubbles(dt) {
        const g = this.game;
        for (const b of [...this.bubbles.values()]) {
            b.t += dt;
            const tp = g.duel?._targetPos?.({ tk: b.tk, tid: b.tid }, _a);
            const mine = b.tk === 'p' ? b.tid === this.me : !!g.authority;
            const dead = !tp || (b.tk === 'p' && b.tid === this.me && (g.combat.dead || g.isDeadLocal));
            if (dead && b.phase !== 'melt') {
                if (mine || !tp) this._burst(b, 'gone', mine);
                continue;
            }
            if (tp && b.phase !== 'melt') b.pos.lerp(tp, Math.min(1, dt * 8));
            // grows while the vortex flows in
            const grow = Math.min(1, b.t / VORTEX.BUBBLE_GROW);
            if (b.phase === 'liquid') b.r = 0.6 + (b.R - 0.6) * (1 - (1 - grow) * (1 - grow));
            if (b.mesh) {
                b.mesh.position.copy(b.pos);
                b.mesh.scale.setScalar(b.r * (b.phase === 'liquid' ? 1 + 0.03 * Math.sin(this._t * 3 + b.t) : 1));
            }
            if (b.phase === 'liquid') {
                if (Math.random() < 0.25) this._drop(_b.copy(b.pos).addScaledVector(_c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), b.r), _d.set(0, -1, 0));
                if (mine) this._hold(b, dt);
                // From inside: «Protection Maxima» (the dome) bursts it before it freezes
                if (b.tk === 'p' && b.tid === this.me && g.combat.shield?.type === 2 && g.combat.shield.left > 0) {
                    g.hud?.setVoice?.('🛡️ Protection Maxima разорвала пузырь — вы свободны!', true);
                    this._burst(b, 'dome', true);
                    continue;
                }
                // (the caster bursts it on time; if their word never comes — they left — it bursts here too)
                if ((b.by === this.me && b.t > VORTEX.BUBBLE_LIFE) || b.t > VORTEX.BUBBLE_LIFE + 3) { this._burst(b, 'time', b.by === this.me); continue; }
            } else if (b.phase === 'ice') {
                b.iceT += dt;
                if (mine) {
                    this._hold(b, dt);
                    b.dmgT += dt;
                    while (b.dmgT >= 1) { b.dmgT -= 1; this._iceHurt(b); }
                }
                if (Math.random() < 0.08) this._sparkle(b.pos, 1, b.r);
                if ((b.by === this.me && b.iceT > VORTEX.ICE_LIFE) || b.iceT > VORTEX.ICE_LIFE + 3) { this._burst(b, 'time', b.by === this.me); continue; }
            } else if (b.phase === 'melt') {
                this._meltStep(b, dt);
            }
        }
    }

    /** The one inside floats in the bubble and can't get out. */
    _hold(b, dt) {
        const g = this.game;
        if (b.tk === 'p') {
            const ch = g.character;
            if (!b.anchor) b.anchor = ch.group.position.clone().add(_b.set(0, 0.5, 0));
            ch.group.position.lerp(b.anchor, Math.min(1, dt * 12));
            ch.verticalVelocity = 0;
            g.knockback?.set(0, 0, 0);
            this._hudT = (this._hudT || 0) - dt;
            if (this._hudT <= 0) {
                this._hudT = 0.25;
                if (b.phase === 'ice') {
                    g.hud?.setStatus?.('🧊 Вы во льду! −1 ❤ холод, −1 ❤ нет воздуха каждую секунду. Скажите <b>«Fire Maxima»</b>');
                    g.hud?.setFrozenOverlay?.(1);
                } else g.hud?.setStatus?.('🫧 Вы в водяном пузыре! Руки буквой <b>T</b> + «Protection Maxima», пока он не замёрз');
            }
            return;
        }
        if (b.tk === 'z') {
            const z = g.zombieById?.get(b.tid);
            if (z) { z.stunTimer = Math.max(z.stunTimer || 0, 0.4); z.windVel = null; }
            return;
        }
        const c = g.duel?._creature?.(b.tk, b.tid);
        if (!c) return;
        c.stunT = Math.max(c.stunT || 0, 0.4);
        if (b.tk === 'v') { c.vx = 0; c.vz = 0; }
        else if (c.vel) c.vel.x = c.vel.z = 0;
    }

    /** One second in the ice: −1 HP from the cold, −1 HP without air. */
    _iceHurt(b) {
        const g = this.game;
        const dmg = iceDamagePerSecond();
        this._note({ ev: 'iceHurt', id: b.id, dmg });
        if (b.tk === 'p') {
            if (b.tid !== this.me) return;
            if (g.combat.enabled) { g.combat.damage(VORTEX.COLD_DPS, b.by, 'cold'); if (!g.combat.dead) g.combat.damage(VORTEX.AIR_DPS, b.by, 'air'); } else g.damageLocalPlayer?.(dmg);
            return;
        }
        if (b.tk === 'z') {
            const z = g.zombieById?.get(b.tid);
            if (z && !z.isDead) g.damageZombie(z, dmg, false, _c.set(0, 0, 1), b.by);
            return;
        }
        const c = g.duel?._creature?.(b.tk, b.tid);
        if (!c) return;
        if (b.tk === 'a') g.animals?.hit?.(c, dmg, null, b.by);
        else if (b.tk === 'v') g.castleLife?.hit?.(c, dmg, null, b.by, { spell: true });
    }

    _meltStep(b, dt) {
        b.meltT += dt;
        const k = Math.min(1, b.meltT / FIRE_MAXIMA.MELT_TIME);
        if (b.mesh) {
            if (k > 0.45 && b.mesh.material !== this.bubbleMat) b.mesh.material = this.bubbleMat; // ice → water
            b.mesh.scale.setScalar(Math.max(0.05, b.r * (1 - k * k)));
        }
        // golden fire ribbons spiral up round the ice, steam rises, the melt water rains down
        const fx = this.game.fx;
        if (fx?.sparks) {
            for (let s = 0; s < 3; s++) {
                const a = this._t * 9 + s * (TAU / 3);
                const h = (k * 2.2 + s * 0.3) % 2.2 - 1.1;
                const rr = b.r * (1.05 - 0.4 * k);
                fx.sparks.spawn(b.pos.x + Math.cos(a) * rr, b.pos.y + h * b.r, b.pos.z + Math.sin(a) * rr, -Math.sin(a) * 3, 2.5, Math.cos(a) * 3,
                    s === 0 ? 0xffd34a : s === 1 ? 0xff8a1f : 0xfff1b0, 0.16 + Math.random() * 0.1, 0.45, { gravity: 2 });
            }
            if (Math.random() < 0.8) fx.sparks.spawn(b.pos.x + (Math.random() - 0.5) * b.r, b.pos.y + b.r * 0.5, b.pos.z + (Math.random() - 0.5) * b.r, 0, 2 + Math.random() * 2, 0, 0xf2f6ff, 0.35 + Math.random() * 0.25, 0.9, { gravity: 3 });
            if (Math.random() < 0.7) this._drop(_b.copy(b.pos).add(_c.set((Math.random() - 0.5) * b.r, -b.r * 0.6, (Math.random() - 0.5) * b.r)), _d.set(0, -3, 0));
        }
        if (k >= 1) {
            this._splash(b.pos, 1.2, 25);
            if (this.game.sound) this.game.sound.playSplash?.();
            this._remove(b);
        }
    }

    // ============================================================ Fire Maxima
    /** «Fire Maxima»: a spiral of golden fire to where the hand points, blooming into a fire flower. */
    castFire(isFinal = true) {
        const g = this.game, ch = g.character;
        const now = this._t;
        if (now - (this._fireAt ?? -9) < 1.2) return null; // (the interim and final version of one phrase)
        const tired = g.combat.check('FireMaxima');
        if (tired) return this._hint(tired, true);
        const trap = this.myTrap();
        let o, p, dir;
        if (trap) {
            // from inside the ice: the fire blooms round yourself
            o = trap.pos.clone();
            p = trap.pos.clone();
            dir = new THREE.Vector3(0, 1, 0);
        } else {
            const side = (() => {
                const pref = g.magicHand || g.lastMagicHand || 'right';
                const w = g.items?.heldOf?.('wand');
                if (w) return w.side;
                return ch.isArmRaised?.(pref) || !ch.isArmRaised?.(pref === 'right' ? 'left' : 'right') ? pref : (pref === 'right' ? 'left' : 'right');
            })();
            o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side);
            dir = (ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side)).normalize();
            p = this._fireTarget(o, dir, side);
        }
        this._fireAt = now;
        g.combat.pay('FireMaxima'); // (mana: castLocalSpell counts it — it always works once paid)
        g.noteCaster?.('FireMaxima', this.me);
        const m = { ev: 'fire', id: `${this.me}:f${++this._seq}`, o: [o.x, o.y, o.z].map(r3), p: [p.x, p.y, p.z].map(r3), d: [dir.x, dir.y, dir.z].map(r3) };
        this._fire(this.me, m);
        this._send(m);
        g.hud?.setVoice?.(trap ? '🔥 Fire Maxima! Лёд тает…' : '🔥 Fire Maxima!', true);
        return 'FireMaxima';
    }

    /** Where the fire blooms: the first creature, ice bubble or wall along the hand (or at full range). */
    _fireTarget(o, dir, side) {
        const g = this.game;
        let best = FIRE_MAXIMA.RANGE;
        const t = g.duel?.findTarget?.(side);
        if (t && t.dist < best) best = t.dist;
        for (const b of this.bubbles.values()) {
            const to = _a.subVectors(b.pos, o);
            const along = to.dot(dir);
            // (ice right next to the hand — even round it or a little behind the tip — counts too)
            if (along < -b.r || along > best + b.r) continue;
            const miss = _b.copy(o).addScaledVector(dir, Math.max(0, along)).distanceTo(b.pos);
            if (miss < b.r + 1.2) best = Math.min(best, Math.max(0.1, along - b.r * 0.5));
        }
        for (let k = 0.5; k < best; k += 0.5) {
            _a.copy(o).addScaledVector(dir, k);
            if (this._blockedAt(_a)) { best = Math.max(0.5, k - 0.3); break; }
        }
        return o.clone().addScaledVector(dir, best);
    }

    /** A Fire Maxima (mine or another wizard's): the spiral flies, then the flower blooms. */
    _fire(by, m) {
        const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
        const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
        const d = m.d ? new THREE.Vector3(m.d[0], m.d[1], m.d[2]) : _a.subVectors(p, o).normalize().clone();
        this._note({ ev: 'fire', by });
        if (this.game.sound) this.game.sound.playInferno?.();
        const travel = o.distanceTo(p) < 0.5 ? 0.05 : FIRE_MAXIMA.TRAVEL;
        this.effects.push({ kind: 'fire', by, o, p, d, t: 0, travel, bloomed: false, life: travel + 1.0 });
    }

    _updateEffects(dt) {
        const fx = this.game.fx;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.t += dt;
            const k = Math.min(1, e.t / e.travel);
            if (!e.bloomed && fx?.sparks) {
                // the spiral: three golden ribbons twisting round the line to the target
                const head = _a.copy(e.o).lerp(e.p, k);
                const side = _b.crossVectors(e.d, UP);
                if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
                side.normalize();
                const up = _c.crossVectors(side, e.d).normalize();
                for (let s = 0; s < 3; s++) {
                    const a = e.t * 26 + s * (TAU / 3);
                    const rr = 0.35;
                    fx.sparks.spawn(head.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * rr, head.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * rr, head.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * rr,
                        e.d.x * 2, e.d.y * 2 + 0.5, e.d.z * 2, s === 0 ? 0xffe066 : s === 1 ? 0xff7a1a : 0xffb347, 0.2, 0.4, { gravity: 1 });
                }
            }
            if (!e.bloomed && k >= 1) { e.bloomed = true; this._bloom(e); }
            if (e.bloomed && fx?.sparks && e.t < e.travel + 0.6) {
                // the fire flower: petals of flame opening round the point
                const q = (e.t - e.travel) / 0.6;
                for (let s = 0; s < 8; s++) {
                    const a = s * (TAU / 8) + q * 2;
                    const rr = FIRE_MAXIMA.RADIUS * (0.3 + 0.7 * q);
                    fx.sparks.spawn(e.p.x + Math.cos(a) * rr, e.p.y + 0.2 + Math.sin(q * Math.PI) * 0.8, e.p.z + Math.sin(a) * rr, Math.cos(a) * 1.5, 2 + Math.random() * 2, Math.sin(a) * 1.5,
                        s % 2 ? 0xff9a2b : 0xffd84a, 0.25 + Math.random() * 0.15, 0.6, { gravity: 1.5 });
                }
            }
            if (e.t > e.life) this.effects.splice(i, 1);
        }
    }

    /** The flower blooms: ice melts, creatures burn, trees catch fire. (Every computer: its own share.) */
    _bloom(e) {
        const g = this.game;
        const R = FIRE_MAXIMA.RADIUS;
        g.fx?.lightFlash?.(e.p, 0xff9a2b, 5, 0.5, 30);
        this._note({ ev: 'bloom', by: e.by });
        // ice bubbles melt (everybody sees the same: every computer gets the same fire)
        const rescued = new Set();
        for (const b of this.bubbles.values()) {
            if (b.phase === 'melt' || b.phase === 'gone') continue;
            if (b.pos.distanceTo(e.p) < R + b.r) { rescued.add(`${b.tk}:${b.tid}`); this._melt(b); }
        }
        // ice balls and frozen water shapes melt away
        g.water?.explode?.(e.p, R);
        // my own body (not the caster's: their fire doesn't hurt them; not the one being freed)
        const c = g.combat;
        if (e.by !== this.me && !rescued.has(`p:${this.me}`) && !c.dead && c.center(_a).distanceTo(e.p) < R + 0.7) {
            if (c.shieldFactor(e.o) >= 1) c._blocked(e.o, 'FireMaxima');
            else {
                if (c.frozen) c.frozenLeft = 0; // (the ice on me melts too)
                if (c.enabled) c.damage(FIRE_MAXIMA.PLAYER_DMG, e.by, 'Inferno');
                else g.damageLocalPlayer?.(FIRE_MAXIMA.PLAYER_DMG);
            }
        } else if (rescued.has(`p:${this.me}`) && c.frozen) c.frozenLeft = 0;
        // creatures (the host decides)
        if (g.authority) {
            for (const b of g.duel?._bodies?.(e.by) || []) {
                if (b.kind === 'p' || b.kind === 'b' || rescued.has(`${b.kind}:${b.id}`)) continue;
                const mid = _b.copy(b.a).add(b.b).multiplyScalar(0.5);
                if (segDist(e.p, b.a, b.b) > R + b.r * 0.5 && mid.distanceTo(e.p) > R + b.r) continue;
                const dir = _c.subVectors(mid, e.p).setY(0);
                if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
                dir.normalize();
                if (b.kind === 'z') {
                    const z = g.zombieById?.get(b.id);
                    if (z && !z.isDead) { if (z.isFrozen) z.unfreeze?.(); g.damageZombie(z, FIRE_MAXIMA.CREATURE_DMG, false, dir.clone(), e.by); }
                } else {
                    const cr = g.duel?._creature?.(b.kind, b.id);
                    if (!cr) continue;
                    if (b.kind === 'a') g.animals?.hit?.(cr, FIRE_MAXIMA.CREATURE_DMG, dir.clone(), e.by, true);
                    else if (b.kind === 'v') g.castleLife?.hit?.(cr, FIRE_MAXIMA.CREATURE_DMG, dir.clone(), e.by, { spell: true, magic: true });
                    else if (b.kind === 't') g.livingTrees?.hit?.(cr, FIRE_MAXIMA.CREATURE_DMG, 'FireMaxima'); // (a living tree: fire is the only thing that hurts it)
                }
            }
        }
        // trees catch fire
        try { g.fire?.igniteAlong?.(_a.copy(e.p).addScaledVector(e.d, -R), e.d.clone().setY(0).lengthSq() > 1e-3 ? e.d.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0), R * 2); } catch (err) { /* no trees here */ }
    }

    // ============================================================= network
    _sendState(dt) {
        this._sendT += dt;
        if (this._sendT < 0.1) return;
        this._sendT = 0;
        const s = this.state;
        if (!s && !this._sent) return;
        this._sent = !!s;
        this._send({ ev: 'st', s: s ? [s.phase === 'gather' ? 1 : 0, r3(s.shown), r3(s.angle), r3(s.spin)] : null });
    }

    /** Another computer's vortex message. */
    onNet(m) {
        if (!m || !m.by || m.by === this.me) return;
        const by = m.by;
        switch (m.ev) {
            case 'st':
                if (!m.s) this.remote.delete(by);
                else {
                    const r = this.remote.get(by) || { angle: +m.s[2] || 0 };
                    r.s = m.s; r.at = this._t; r.spin = +m.s[3] || 0;
                    this.remote.set(by, r);
                }
                break;
            case 'launch':
                this.remote.delete(by);
                if (Array.isArray(m.o) && Array.isArray(m.d)) this._addFlight(by, m);
                break;
            case 'hit': {
                const f = this.flights.get(m.id);
                if (f && f.phase === 'fly') {
                    if (Array.isArray(m.p)) f.pos.set(m.p[0], m.p[1], m.p[2]);
                    this._hit(f, m.tk, m.tid, false);
                }
                break;
            }
            case 'block': case 'end': {
                const f = this.flights.get(m.id);
                if (f) { if (Array.isArray(m.p)) f.pos.set(m.p[0], m.p[1], m.p[2]); this._endFlight(f, m.ev === 'block' ? 'block' : m.why || 'end', false); }
                break;
            }
            case 'bubble': {
                const f = this.flights.get(m.id);
                if (f) { if (m.tk) { f.tk = m.tk; f.tid = m.tid; } f.phase = 'cling'; this._startBubble(f); } else if (Array.isArray(m.p)) this._addBubble({ ...m, by });
                break;
            }
            case 'freeze': this._freeze(this.bubbles.get(m.id)); break;
            case 'burst': this._burst(this.bubbles.get(m.id), m.why || 'burst', false); break;
            case 'fire': if (Array.isArray(m.o) && Array.isArray(m.p)) this._fire(by, m); break;
        }
    }

    // ============================================================= drawing
    /** Every vortex (mine, other wizards', flying, clinging) as rings of living water blobs. */
    _draw(dt = 1 / 60) {
        const mesh = this.blobs;
        if (!mesh) return;
        let n = 0;
        const cap = mesh.instanceMatrix.count;
        const put = (x, y, z, r) => {
            if (n >= cap) return;
            _m.makeScale(r, r, r).setPosition(x, y, z);
            mesh.setMatrixAt(n++, _m);
        };
        const ring = (c, volume, angle, squeeze, lift = 0) => {
            const layers = layersOf(volume);
            layers.forEach((fill, i) => {
                const R = layerRadius(i) * squeeze;
                const step = 0.3 / Math.max(0.6, R);
                const count = Math.max(1, Math.ceil((TAU / step) * fill));
                // inner rings go round a little faster; each ring has its own height band
                const a0 = angle * (1.15 - i * 0.07) + i * 1.7;
                const h = (-0.55 + (i % 3) * 0.6) * Math.max(0.5, squeeze) + lift;
                for (let j = 0; j < count; j++) {
                    const a = a0 - j * step;
                    const tail = fill < 1 ? 1 - (j / count) * 0.5 : 1; // (a ring still filling: its tail thins)
                    const y = c.y + h + 0.18 * Math.sin(a * 3 + this._t * 2.4 + i);
                    put(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R, (0.24 + 0.05 * Math.sin(a * 5 + i)) * tail * (0.7 + 0.3 * squeeze));
                }
            });
        };
        const s = this.state;
        if (s && s.phase === 'gather') {
            s.shown += (s.volume - s.shown) * 0.15;
            ring(this.game.character.group.position, s.shown, s.angle, 1);
        }
        for (const [by, r] of this.remote) {
            if (this._t - r.at > 1.5) { this.remote.delete(by); continue; }
            const av = this.game.remotes?.get(by);
            if (!av || !r.s[0]) continue;
            r.angle += (r.spin || 0.6) * dt;
            ring(av.position, +r.s[1] || 0, r.angle, 1);
        }
        for (const f of this.flights.values()) ring(f.pos, f.volume, f.angle, f.squeeze, 0.35);
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
    }

    _spray(body, s) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        const layers = layersOf(s.volume).length || 1;
        const i = Math.floor(Math.random() * layers);
        const a = s.angle * (1.15 - i * 0.07) + i * 1.7 - Math.random() * 2;
        const R = layerRadius(i);
        fx.sparks.spawn(body.x + Math.cos(a) * R, body.y + (-0.55 + (i % 3) * 0.6), body.z + Math.sin(a) * R,
            -Math.sin(a) * s.spin * R * 0.6, 1 + Math.random(), Math.cos(a) * s.spin * R * 0.6, Math.random() < 0.5 ? 0x7cc4ff : 0xe6f6ff, 0.08 + Math.random() * 0.08, 0.5, { gravity: -12 });
    }

    _flow(from, to) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        const d = _d.subVectors(to, from);
        const life = 0.5;
        fx.sparks.spawn(from.x, from.y, from.z, d.x / life, d.y / life + 2, d.z / life, 0x7cc4ff, 0.14 + Math.random() * 0.1, life, { gravity: -8 });
    }

    _drop(pos, vel) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        fx.sparks.spawn(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, Math.random() < 0.5 ? 0x7cc4ff : 0xbfe6ff, 0.08 + Math.random() * 0.08, 0.6, { gravity: -12 });
    }

    _splash(pos, size, count) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * TAU, sp = 1.5 + Math.random() * 3 * size;
            fx.sparks.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp,
                Math.random() < 0.5 ? 0x7cc4ff : 0xe6f6ff, 0.1 + Math.random() * 0.12, 0.7, { gravity: -14 });
        }
    }

    _sparkle(pos, count, r = 1) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        for (let i = 0; i < count; i++) {
            fx.sparks.spawn(pos.x + (Math.random() - 0.5) * r * 2, pos.y + (Math.random() - 0.5) * r * 2, pos.z + (Math.random() - 0.5) * r * 2,
                (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0xe8fbff, 0.08 + Math.random() * 0.08, 0.6, { gravity: -6 });
        }
    }

    dispose() {
        for (const b of [...this.bubbles.values()]) this._remove(b);
        this.flights.clear();
        this.state = null;
        if (!this.scene) return;
        this.scene.remove(this.blobs);
        this.blobGeo.dispose();
        this.sphereGeo.dispose();
        for (const m of this._mats) m.dispose();
    }
}

function r3(v) {
    return Math.round(v * 1000) / 1000;
}
