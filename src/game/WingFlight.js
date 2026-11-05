/**
 * WingFlight.js — flying on the wings of the potion (HeroWings.js) by the arms' strokes. No mana (the author: «это не будет тратить
 * маны»), and not the «Flight» of the spell: the wings must be worked all the time.
 *
 * The author: «чтобы взлететь, нужно руками махать — прям хорошо махать. Сначала надо разбежаться немножко, потом начать махать руками,
 * как у дракона. Сначала будет не просто летать: чтобы взлететь, нужно реально неплохо махать. Если чуть выше определённого уровня
 * прилетел — там подхватят воздушные потоки, и можно меньше делать взмахов. Но если не делаешь — будешь вниз идти. Руки всегда открытыми
 * держать… можно пикировать. Надо мягко сесть: если упадёшь — можешь умереть или сильно пораниться.»
 *
 *   - a STROKE: both hands down together fast (ImperiusFlight.FlapReader — the same strokes the Maxima's flyers read); harder and more
 *     often — higher and faster;
 *   - take-off: running (≥ HERO_FLY.takeoff m/s on the ground) and a stroke; standing — the strokes only lift the heels (no flight);
 *   - in the air between the strokes: it sinks (the air holds the spread wings while fast); the head bowed — a dive (faster), raised —
 *     up on its own speed; the arms DOWN — the wings folded: a steep dive (a stoop); the arms spread (a T) — a long glide;
 *   - the air's currents (AIR): from THERMAL_FROM m over the ground the sink is less and less, from THERMAL_FULL it is only CALM m/s —
 *     fewer strokes keep the height, but never none: without them it goes down;
 *   - the landing: the arms spread near the ground (FLARE m) brake the fall — a soft touch; coming down fast (a dive, the wings folded,
 *     a fall) hurts (landingHurt: as a fall from the height of that speed; very hard — knocked down), and can kill;
 *   - the wings themselves follow the arms: the arms up — the wings up, the arms down — down (HeroWings.flap), spread in the air,
 *     folded on the ground; each stroke whooshes.
 * What may go wrong: a stroke on a horse, a broom, a board, swimming, in the spell's flight, lying, dead, in another's body, the wings still
 * growing — nothing (no take-off); in the air and any of these starts — the wings let go: the body falls as any body (the normal fall);
 * hit hard in the air (knocked down) — it falls; into a wall / a roof — the body stops (never through), a ceiling — no climb.
 */
import { FlapReader, armsOf } from './ImperiusFlight.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

/*
 * The author (05.11): «туловище должно быть элементом того, что я могу пикировать вниз… управлять вверх-вниз, чуть наклоняюсь — как в
 * полёте через Флайн… в полёте махать периодически крыльями, иначе он упадёт; не должно быть такого, чтобы игрок расслаблялся… чем выше,
 * тем легче, но выше — это прямо в облаках, очень высоко; и даже очень высоко махать нужно». So (wingStep):
 *   - the torso steers as in «Флайн» (Flight.steering, from the pose at the take-off): leaning forward — the nose down, a dive (faster
 *     and steeper the more); leaning back — the nose up, the speed spent on the height (no climb without speed); leaning sideways — a turn;
 *     the head bowed helps the dive (as in «Флайн»);
 *   - the wings hold the body only for a while after a stroke: `hold` falls off as exp(−since/holdT); low down holdT is HOLD_LOW s, up in
 *     the clouds (CLOUD_FULL m over the ground) HOLD_HIGH s — the air there carries longer, but never for ever: no strokes — it falls;
 *   - landing: lean back (or spread the arms) near the ground — the flare brakes; the touch is soft when slow.
 * (The old model held the height with no strokes from 40 m up and while looking straight ahead — one could not come down: gone.)
 */
export const WING = {
    HOLD_LOW: 2.6, HOLD_HIGH: 11, // s the wings carry after a stroke: low / in the clouds
    CLOUD_FROM: 50, CLOUD_FULL: 220, // m over the ground: the air carries more and more up to the clouds
    SINK_LOW: 1.5, SINK_HIGH: 0.7, // m/s down while the wings still carry
    FALL: 11, FALL_SPREAD: 7.5, FALL_FOLDED: 22, // m/s down when they do not (the arms spread fall slower; folded — a stoop)
    DIVE: 0.95, // × speed: the vertical speed a full forward lean gives (down)
    CLIMB: 0.75, // × speed: a full lean back (up, the speed spent)
    TURN: 1.5, // rad/s at a full sideways lean
};

/** How much the air carries at `alt` m over the ground: 0 low … 1 in the clouds. */
export function cloudAt(alt) {
    const k = Math.max(0, Math.min(1, ((alt || 0) - WING.CLOUD_FROM) / (WING.CLOUD_FULL - WING.CLOUD_FROM)));
    return k * k * (3 - 2 * k);
}

/**
 * One step of the flight in the air (pure). st {air, vf, vy, since}; i {stroke, dive (−1 back … 1 forward), arms, alt}; P: HERO_FLY.
 * On the ground: a stroke while running fast enough takes off.
 */
export function wingStep(st, P, i, dt) {
    st.took = false;
    if (!st.air) {
        if (i.stroke > 0 && (i.ground || 0) >= P.takeoff) {
            st.air = true; st.took = true; st.since = 0;
            st.vf = Math.max(i.ground || 0, P.thrust * i.stroke);
            st.vy = Math.min(P.maxUp, P.lift * (1 + i.stroke));
        } else { st.vf = i.ground || 0; st.vy = 0; }
        return st;
    }
    st.since = (st.since || 0) + dt;
    if (i.stroke > 0) {
        st.since = 0;
        st.vy = Math.min(P.maxUp, Math.max(st.vy, 0) + P.lift * i.stroke);
        st.vf = Math.min(P.maxFwd, st.vf + P.thrust * i.stroke);
    }
    const c = cloudAt(i.alt);
    const hold = Math.exp(-st.since / (WING.HOLD_LOW + (WING.HOLD_HIGH - WING.HOLD_LOW) * c));
    const fall = i.arms === 'down' ? WING.FALL_FOLDED : i.arms === 'spread' ? WING.FALL_SPREAD : WING.FALL;
    const sinkMin = WING.SINK_LOW + (WING.SINK_HIGH - WING.SINK_LOW) * c;
    let target = -(sinkMin * hold + fall * (1 - hold));
    if (i.arms === 'down') target = Math.min(target, -WING.FALL_FOLDED * 0.6);
    const dive = Math.max(-1, Math.min(1, i.dive || 0));
    if (dive > 0) {
        // leaning forward: the nose down — steeper and faster
        target -= dive * Math.max(st.vf, 0.4 * P.maxFwd) * WING.DIVE;
        st.vf = Math.min(P.maxFwd * 1.3, st.vf + P.gravity * 0.55 * dive * dt);
    } else if (dive < 0 && st.vf > 2) {
        // leaning back: the nose up — up on its own speed, the speed spent (a flare near the ground)
        target += -dive * st.vf * WING.CLIMB;
        st.vf = Math.max(0, st.vf - P.gravity * 0.5 * -dive * dt);
    }
    // the vertical speed goes to the target: up — gravity takes it; down — the air brakes or lets it fall
    if (st.vy > target) st.vy = Math.max(target, st.vy - P.gravity * (1 - 0.45 * hold) * dt); // (the beating wings bear the climb a while)
    else st.vy = Math.min(target, st.vy + P.gravity * 1.5 * dt);
    st.vf = Math.max(0, st.vf - st.vf * (P.drag + (st.since > 1 ? 0.08 : 0)) * dt * (i.arms === 'down' ? 2 : 1));
    st.hold = hold;
    return st;
}

/** The hero's wings: lift / thrust per stroke, top speeds, gravity, the glide's sink, the drag, the run needed to take off. */
export const HERO_FLY = { lift: 3.4, thrust: 3.0, maxUp: 8, maxFwd: 22, gravity: 9, sink: 2.6, drag: 0.1, takeoff: 4.0, turn: 1 };
/** The air's currents over the land. */
export const AIR = { THERMAL_FROM: 14, THERMAL_FULL: 40, CALM: 0.6, CEIL: 320 };
/** The landing. */
export const LAND = { FLARE: 6, FLARE_VY: 2.2, SAFE_VY: 5.5, PER: 2, KNOCK_VY: 11, FWD_SAFE: 13, FWD_PER: 0.6 };

/** How much the air holds at `alt` m over the ground: 0 low … 1 high. */
export function thermalAt(alt) {
    const k = Math.max(0, Math.min(1, ((alt || 0) - AIR.THERMAL_FROM) / (AIR.THERMAL_FULL - AIR.THERMAL_FROM)));
    return k * k * (3 - 2 * k);
}

/** The touch of the ground at vy (m/s up, < 0 down) and vf (forward): {dmg, knock}. Soft (≤ SAFE_VY down, slow forward) — nothing. */
export function landingHurt(vy, vf) {
    const down = Math.max(0, -(vy || 0) - LAND.SAFE_VY), fwd = Math.max(0, (vf || 0) - LAND.FWD_SAFE);
    const dmg = Math.round(down * LAND.PER + fwd * LAND.FWD_PER);
    return { dmg, knock: -(vy || 0) >= LAND.KNOCK_VY || fwd > 6 };
}

export class WingFlight {
    constructor(game) {
        this.game = game;
        this.st = { air: false, vf: 0, vy: 0, since: 0 };
        this.neutral = null; this._samples = 0; // (the torso at the take-off: leaning from it steers — as Flight.steering)
        this.reader = new FlapReader();
        this._gs = 0; // ground speed, smoothed
        this._lx = null; this._lz = null;
        this.t = 0;
    }

    get airborne() { return this.st.air; }

    /** Why the wings cannot be used now (null: they can). */
    _blocked() {
        const g = this.game, ch = g.character;
        if (!g.wings?.has) return 'none';
        if (g.isDeadLocal || g.combat?.dead || g.knock?.down) return 'down';
        if (g.flight?.active || g.space?.handles || ch.swimming || ch.swimY != null || g.animals?.riding || g.dragonRide?.busy || g.boards?.mounted || g.brooms?.riding
            || g.imperius?.busy || g.imperius?.puppet || g.levitation?.lifted || g.beds?.lying || g.ships?.rigging?.climbing || g.ledge?.active || g.spiders?.held || g.diabolos?.holding) return 'busy';
        return null;
    }

    update(dt, pose = null) {
        const g = this.game, ch = g.character;
        if (!ch || !(dt > 0)) return;
        this.t += dt;
        const p = ch.group.position;
        // the speed over the ground (a run before the take-off)
        if (this._lx != null && !this.st.air) { const v = Math.hypot(p.x - this._lx, p.z - this._lz) / dt; if (v < 40) this._gs += (v - this._gs) * Math.min(1, dt * 6); }
        this._lx = p.x; this._lz = p.z;
        const why = this._blocked();
        const hv = ch.handRelVelocity;
        const stroke = why ? 0 : this.reader.update(dt, hv?.left, hv?.right);
        if (why) {
            if (this.st.air) this._letGo(); // (in the air and the wings cannot: the body falls as any)
            return;
        }
        const W = g.wings;
        const ground = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y) : g.collision.groundY(p.x, p.z);
        const feet = p.y - PLAYER_GROUND_OFFSET;
        const alt = Math.max(0, feet - ground);
        const arms = armsOf(ch);
        const st = this.st;
        const wasAir = st.air;
        if (!st.air && !ch.onGround && (ch.verticalVelocity || 0) < -6 && alt > 3) { st.air = true; st.vf = this._gs; st.vy = ch.verticalVelocity || 0; } // (falling off a cliff: the wings catch the air; an ordinary jump stays a jump)
        const steer = this._steer(pose?.torso || null, g.smoothHead?.pitch || 0, dt);
        wingStep(st, HERO_FLY, { stroke, arms, ground: this._gs, alt, dive: steer.dive }, dt);
        if (st.air && steer.turn) { // (leaning sideways turns, as in «Флайн»)
            const yr = steer.turn * WING.TURN * dt; // (the sign of Flight's yawRate)
            if (g.settings?.drifting) g.cameraBaseRotation += yr; else if (g.smoothBody != null) g.smoothBody += yr;
            ch.setBodyRotation?.(g.settings?.drifting ? g.cameraBaseRotation : g.smoothBody);
        }
        if (stroke > 0) g.sound?.playSwan?.(p, 'wings');
        if (!st.air) { if (wasAir) this._touch(0, 0); this._pose(false, arms, dt); return; }
        if (!wasAir) g.hud?.setVoice?.('🪽 Взлёт! Машите руками, иначе упадёте. Наклон вперёд — вниз, назад — вверх, вбок — поворот', true);
        if (st.hold < 0.35 && !this._toldFall) { this._toldFall = true; g.hud?.setVoice?.('🪽 Крылья устали держать — машите!', true); }
        if (st.hold > 0.8) this._toldFall = false;
        // the flare: the arms spread near the ground brake the fall (a soft landing); folded or a dive — no brake
        if ((arms === 'spread' || steer.dive < -0.3) && alt < LAND.FLARE && st.vy < -LAND.FLARE_VY) { st.vy += (-LAND.FLARE_VY - st.vy) * Math.min(1, dt * 3); st.vf *= 1 - Math.min(0.9, dt * 0.8); }
        // the body moves: along its facing, never through a wall; no higher than the sky's ceiling
        const yaw = ch.group.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const col = g.collision;
        const blockedAt = (x, y, z) => col.pointBlocked?.(x, y, z) || col.pointBlocked?.(x, y + 1.2, z) || col.pointBlocked?.(x, y + 2.4, z);
        const dist = st.vf * dt, climb = st.vy * dt;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dist), Math.abs(climb)) / 0.5));
        for (let i = 0; i < steps; i++) {
            const px = p.x, py = p.y, pz = p.z;
            p.x += fx * dist / steps; p.z += fz * dist / steps;
            p.y = Math.min(ground + AIR.CEIL, p.y + climb / steps);
            if (climb > 0 && blockedAt(p.x, p.y, p.z)) { p.y = py; st.vy = Math.min(st.vy, 0); }
            if (blockedAt(p.x, p.y, p.z)) { p.x = px; p.z = pz; st.vf *= 0.3; if (blockedAt(p.x, p.y, p.z)) p.y = Math.max(py, p.y); break; }
        }
        // the ground: the touch (soft or hard)
        const g2 = col.groundAt ? col.groundAt(p.x, p.z, p.y) : col.groundY(p.x, p.z);
        if (p.y - PLAYER_GROUND_OFFSET <= g2 + 0.02 && st.vy <= 0.3) {
            p.y = g2 + PLAYER_GROUND_OFFSET;
            this._touch(st.vy, st.vf);
            st.air = false; st.vy = 0; st.vf = 0;
            this._pose(false, arms, dt);
            return;
        }
        ch.verticalVelocity = 0;
        this._pose(true, arms, dt, stroke);
    }

    /** The torso's lean from its pose at the take-off → {turn, dive} (Flight.steering's rule); the head bowed helps the dive. */
    _steer(torso, headPitch, dt) {
        const st = this.st;
        if (!st.air) { this.neutral = null; this._samples = 0; }
        const n = this.neutral;
        if (st.air && torso && (!n || this._samples < 20)) {
            // the first moments in the air: the body's calm pose (leaning from it steers)
            const k = 1 / (++this._samples), m = n || { lateral: torso.lateral, noseRel: torso.noseRel, depth: torso.depth ?? null };
            m.lateral += (torso.lateral - m.lateral) * k; m.noseRel += (torso.noseRel - m.noseRel) * k;
            if (torso.depth != null) m.depth = m.depth == null ? torso.depth : m.depth + (torso.depth - m.depth) * k;
            this.neutral = m;
            return { turn: 0, dive: Math.max(-1, Math.min(1, -headPitch * 0.6)) };
        }
        let turn = 0, dive = -headPitch * 0.6;
        if (torso && n) {
            turn = Math.max(-1, Math.min(1, (torso.lateral - n.lateral) * 2.2));
            if (torso.depth != null && n.depth != null) dive += (n.depth - torso.depth) * 6;
            dive += (n.noseRel - torso.noseRel) * 1.6;
        }
        const dz = (v, d) => (Math.abs(v) < d ? 0 : v - Math.sign(v) * d);
        return { turn: dz(turn, 0.12), dive: Math.max(-1, Math.min(1, dz(dive, 0.08))) };
    }

    /** The wings let go in the air (busy, knocked, dead): the body falls by itself (Character's own gravity). */
    _letGo() {
        const ch = this.game.character;
        ch.verticalVelocity = Math.min(0, this.st.vy);
        this.st.air = false; this.st.vf = 0; this.st.vy = 0;
        ch.setFlightTilt?.(0); ch.flying = false;
        if (this.game.wings) this.game.wings.open = 0;
    }

    /** The ground touched at (vy, vf): soft — nothing; hard — hurt (and knocked down); can kill. */
    _touch(vy, vf) {
        const g = this.game;
        const h = landingHurt(vy, vf);
        this.game.character.setFlightTilt?.(0);
        this.game.character.flying = false;
        if (!h.dmg) { if (vy < -1) g.sound?.playLand?.(0.3); return; }
        g.sound?.playLand?.(1);
        g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, Math.min(0.4, 0.1 + h.dmg / 40)));
        if (h.knock) g.knock?.knock?.({ dir: 'front', down: 1.5 + Math.min(3, h.dmg * 0.15), kind: 'fall' });
        g.hud?.setVoice?.(h.dmg >= 8 ? '🪽 Вы рухнули на землю! Садитесь мягче: руки в стороны у земли' : '🪽 Жёсткая посадка', true);
        if (g.combat?.enabled) g.combat.damage(h.dmg, null, 'fall');
        else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(h.dmg, 'fall');
    }

    /** The body and the wings: tilted forward in flight (the faster the flatter), the wings follow the arms. */
    _pose(air, arms, dt, stroke = 0) {
        const g = this.game, ch = g.character, W = g.wings;
        const tilt = air ? Math.min(1.25, 0.35 + 1.0 * this.st.vf / HERO_FLY.maxFwd) : 0;
        ch.flightTilt = (ch.flightTilt || 0) + (tilt - (ch.flightTilt || 0)) * Math.min(1, dt * 3);
        ch.setFlightTilt?.(ch.flightTilt);
        ch.flying = air;
        if (!W) return;
        if (!air) return; // (on the ground: HeroWings folds them and breathes)
        // the wings up / down with the arms (the hands over / under the shoulders), spread unless the arms are down
        let flap = 0;
        try {
            const hl = ch.getHandWorldPosition('left'), hr = ch.getHandWorldPosition('right');
            const sh = ch.torso.localToWorld(ch.torso.position.clone().set(0, 0.5, 0));
            flap = Math.max(-0.9, Math.min(0.9, ((hl.y + hr.y) / 2 - sh.y) / 1.8));
        } catch { flap = 0; }
        W.open += ((arms === 'down' ? 0.25 : 1) - W.open) * Math.min(1, dt * 5);
        W.flap += (flap - W.flap) * Math.min(1, dt * 12);
        W.flex = -0.4 * (stroke || 0) + (W.flex || 0) * 0.9;
        g.wings._airFrame = true;
    }
}
