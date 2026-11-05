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
import { FlapReader, flyStep, armsOf } from './ImperiusFlight.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

/** The hero's wings: lift / thrust per stroke, top speeds, gravity, the glide's sink, the drag, the run needed to take off. */
export const HERO_FLY = { lift: 3.4, thrust: 3.0, maxUp: 8, maxFwd: 22, gravity: 9, sink: 2.6, drag: 0.1, takeoff: 4.0, turn: 1 };
/** The air's currents over the land. */
export const AIR = { THERMAL_FROM: 14, THERMAL_FULL: 40, CALM: 0.6, CEIL: 160 };
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
        this.st = { air: false, vf: 0, vy: 0 };
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

    update(dt) {
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
        flyStep(st, HERO_FLY, { stroke, arms, ground: this._gs, alt: null, pitch: g.smoothHead?.pitch || 0 }, dt);
        if (stroke > 0) g.sound?.playSwan?.(p, 'wings');
        if (!st.air) { if (wasAir) this._touch(0, 0); this._pose(false, arms, dt); return; }
        if (!wasAir) g.hud?.setVoice?.('🪽 Взлёт! Машите руками — выше и быстрее; руки в стороны — планируете', true);
        // the air's currents: high up the sink is small — but never a climb without strokes
        const k = thermalAt(alt);
        if (!stroke && st.vy < 0 && k > 0) st.vy = Math.max(st.vy, -(AIR.CALM + (1 - k) * 99));
        // the flare: the arms spread near the ground brake the fall (a soft landing); folded or a dive — no brake
        if (arms === 'spread' && alt < LAND.FLARE && st.vy < -LAND.FLARE_VY) { st.vy += (-LAND.FLARE_VY - st.vy) * Math.min(1, dt * 3); st.vf *= 1 - Math.min(0.9, dt * 0.8); }
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
