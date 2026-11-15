/**
 * AirVortex.js — «Air Vortex», the air mage's key spell (the author 15.11): the wind lifts the hero a little off the ground and keeps him there.
 *
 *   hover     he hangs HOVER_MIN above the ground (never lands, whatever he does, until «стоп»); walking is as ever, a blow or a spell can be done meanwhile
 *   up        the head raised (looking up) — he climbs (faster the higher he looks) up to the ceiling; the head level — he stays at the height he has
 *   down      the head lowered — he sinks, but only to the hover height: he does not land
 *   the end   «стоп», no mana (1 a second after the first 20; half for an air mage), death, a stun, the monster form: the wind lets go (he floats down gently)
 *
 * It is the thinking man's «Flight»: no arms up, no Superman — the same hands and spells all the time. Pure rules are `airTarget` / `climbRate` (testable);
 * `AirVortex` drives the hero (`ch.gravityK = 0`, `ch.verticalVelocity`) and the particles (leaves, dust and a ring of air under the feet).
 *
 * «А если»: water under him (the hover is over the water's surface, `waterY`); a roof above (the climb stops under it — the character's own roof test); a ship's deck /
 * a bridge (the ground under him is what `groundAt` says); the flight / a mount / a bed / space (the vortex does not start: a hint); a second cast (nothing, no
 * second price); death / a new world / a loaded save (starts from nothing — a vortex is not saved); the network (everyone sees the hero in the air by his pose; the swirl is drawn locally).
 */
export const AIR_VORTEX = {
    COST: 20, // mana at the cast (SPELL_COST.AirVortex)
    DRAIN: 1, // mana a second while it holds
    HOVER_MIN: 1.9, // m between the feet and the ground: he hangs, he does not stand
    CLIMB_MAX: 11, // m/s straight up (looking at the zenith)
    SINK_MAX: 7, // m/s down (looking at the ground), until the hover height
    LOOK_UP: 0.28, // sin(pitch): looking higher than this climbs
    LOOK_DOWN: -0.35, // looking lower than this sinks
    CEILING: 110, // m above the ground
    EASE: 4, // 1/s: how fast the vertical speed follows what he wants (no jerk)
    BOB: 0.12, // m: the gentle bobbing of the hover
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Vertical speed the wind gives: `look` = the sine of the head's pitch (+ up), `alt` = metres above the ground now. */
export function climbRate(look, alt) {
    const A = AIR_VORTEX;
    if (look > A.LOOK_UP) return alt >= A.CEILING ? 0 : A.CLIMB_MAX * clamp((look - A.LOOK_UP) / (1 - A.LOOK_UP), 0.15, 1);
    if (look < A.LOOK_DOWN) return alt <= A.HOVER_MIN + 0.05 ? 0 : -A.SINK_MAX * clamp((A.LOOK_DOWN - look) / (1 + A.LOOK_DOWN), 0.15, 1);
    return 0;
}
/** Where the feet are held when he is not climbing or sinking: never lower than the hover height over `ground`. */
export function airTarget(ground, y, climbing) {
    const floor = ground + AIR_VORTEX.HOVER_MIN;
    return climbing ? Math.max(y, floor) : Math.max(floor, y);
}

const COLORS = [0xffffff, 0xd8ecff, 0xbfe3ff, 0x9fd49a, 0xc8b06a]; // (air, dust, a leaf or two)

export class AirVortex {
    constructor(game) { this.game = game; this.on = false; this._t = 0; this._acc = 0; this._vy = 0; }
    get active() { return this.on; }

    _hint(text) { this.game.hud?.setVoice?.(text, true); return null; }

    cast(isFinal = true) {
        const g = this.game, c = g.combat, ch = g.character;
        if (this.on) return null;
        if (!isFinal) return null;
        if (g.flight?.active || g.wingFlight?.airborne || g.animals?.riding || g.boards?.mounted || g.boats?.riding || g.beds?.lying || g.dragonRide?.busy || g.monster?.active || (g.space && g.space.state !== 'off')) return this._hint('🌬️ Сейчас воздух вас не поднимет');
        const tired = c?.check('AirVortex');
        if (tired) return this._hint(tired);
        c?.pay('AirVortex');
        this.on = true; this._t = 0; this._vy = Math.max(0, ch.verticalVelocity || 0);
        ch.gravityK = 0;
        g.fx?.lightFlash?.(ch.group.position, 0xdff1ff, 4, 0.4, 20);
        g.hud?.setVoice?.('🌬️ <b>Воздух подхватил вас.</b> Смотрите вверх — поднимаетесь, вниз — опускаетесь (до земли не дойдёте). «Стоп» — отпустить.', true);
        return 'AirVortex';
    }

    stop(why = 'stop') {
        if (!this.on) return false;
        this.on = false;
        const ch = this.game.character;
        ch.gravityK = 1;
        if (why === 'mana') this.game.hud?.setVoice?.('🌬️ Мана кончилась — воздух отпускает вас', true);
        return true;
    }

    /** Before the character's own update (Game): where he is carried this frame. */
    update(dt, lookY) {
        if (!this.on) return;
        const g = this.game, c = g.combat, ch = g.character, p = ch.group.position;
        if (c?.dead || g.isDeadLocal || c?.frozen || c?.stunned || g.monster?.active || g.flight?.active) { this.stop('down'); return; }
        if (c && (c.drain(AIR_VORTEX.DRAIN * (g.heroElement?.k?.('AirVortex') ?? 1) * dt, dt) === false || c.manaOut())) { this.stop('mana'); return; }
        this._t += dt;
        const col = g.collision;
        let ground = col.groundAt ? col.groundAt(p.x, p.z, p.y + 1) : col.groundY(p.x, p.z);
        if (ch.swimY != null) ground = Math.max(ground, ch.swimY); // (over water: above its surface)
        const want = climbRate(lookY, p.y - 2.0 * (ch.size || 1) - ground);
        this._vy += (want - this._vy) * Math.min(1, AIR_VORTEX.EASE * dt);
        let vy = this._vy;
        const feet = p.y - 2.0 * (ch.size || 1); // (PLAYER_GROUND_OFFSET: the feet are 2 m under the group's origin)
        const floor = ground + AIR_VORTEX.HOVER_MIN;
        if (feet < floor && vy < 1) vy = (floor - feet) * 3 + Math.max(0, vy); // (lifted to the hover height at once, softly)
        else if (Math.abs(want) < 0.01) vy += Math.sin(this._t * 2.1) * AIR_VORTEX.BOB; // (the gentle bob)
        ch.gravityK = 0;
        ch.verticalVelocity = vy;
        this._swirl(dt, p, ground);
    }

    _swirl(dt, p, ground) {
        const glow = this.game.fx?.glow; if (!glow) return;
        this._acc += dt * 30;
        let n = 0;
        while (this._acc >= 1 && n++ < 5) {
            this._acc -= 1;
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4, y = p.y - 2.0 + Math.random() * 1.6;
            glow.spawn(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r, -Math.sin(a) * 4, 0.6 + Math.random(), Math.cos(a) * 4, COLORS[(Math.random() * COLORS.length) | 0], 0.1 + Math.random() * 0.12, 0.7, { shrink: 1.2 });
        }
        void ground;
    }
}
