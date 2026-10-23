/**
 * Attention.js — to whom am I talking? (the author: «он меня замечает, только когда я вплотную подхожу… должно
 * быть быстрое взаимодействие: на кого смотрю, сколько смотрю — быстро посмотрел, это вряд ли; иду я к персонажу
 * или нет; чтобы он понял, реально ли к нему обращаются; может, я ему с 10 метров кричу; и чтобы толпа не мешала»).
 *
 * As people do: one looked at steadily, or walked towards, or the one I was just talking with, is the one I speak
 * to — at a talking distance or across a yard if I raise my voice. Every human-like being near is scored a few times
 * a second by:
 *   - my gaze on him: a cone as wide as he is from here (a man ~1 m wide — narrower far off), held for a moment
 *     (a glance passing over a crowd counts little: the gaze builds up in ~0.6 s and fades in ~1 s);
 *   - my steps towards him (not past him);
 *   - how near he is; the one I was just talking with (a talk goes on even if I look away a moment).
 * The score says who hears my words (CastleTalk._listener), and who notices me first — turns his head to me, greets
 * me from 10–15 m when I look at him and come, not only when I bump into him (CastleTalk._notice).
 *
 * Pure (no THREE / DOM): the caller gives positions, the look direction, the clock.
 */

/** The numbers (m, s). */
export const ATT = {
    NEAR: 4, // m: this near, the one in front of me hears a word without looking long
    TALK: 12, // m: an ordinary voice is heard this far by the one I address
    SHOUT: 30, // m: a raised voice (a shout across a yard)
    BUILD: 0.6, // s of steady gaze to be sure I look at him
    FADE: 1.0, // s for the gaze to fade once I look away
    WIDTH: 0.8, // m: half of a man's width with a margin — the cone of «looking at him»
    MIN_CONE: 0.07, // rad: the narrowest cone (far off; the head is never that still)
    PARTNER: 15, // s: the one I was talking with keeps my attention this long
    NOTICE: 0.55, // the score at which he notices me (turns to me, greets)
};

export class Attention {
    constructor() {
        this.of = new Map(); // id → {gaze 0..1, score 0..1, d, cone}
        this.partner = null; // {id, at}
    }

    /**
     * A step (a few times a second).
     * @param {{x,y,z}} me my eyes
     * @param {{x,y,z}} look the direction I look (unit)
     * @param {{x,z}|null} vel my walking velocity (m/s)
     * @param {Iterable<{id,x,y,z}>} beings the human-like beings near (y: their chest)
     * @param {number} dt s since the last step
     * @param {number} now ms
     */
    update(me, look, vel, beings, dt, now) {
        const seen = new Set();
        const lh = Math.hypot(look.x, look.z) || 1;
        for (const b of beings) {
            const dx = b.x - me.x, dz = b.z - me.z, dy = (b.y ?? me.y) - me.y; // (me: my eyes; b: his chest)
            const d = Math.hypot(dx, dz);
            if (d > ATT.SHOUT + 10) continue;
            seen.add(b.id);
            let a = this.of.get(b.id);
            if (!a) { a = { gaze: 0, score: 0, d, cone: 0, on: false }; this.of.set(b.id, a); }
            a.d = d;
            // the angle between my look and him (his chest; a villager's eyes are about at mine)
            const len = Math.hypot(dx, dy, dz) || 1;
            const cos = (look.x * dx + look.y * dy + look.z * dz) / len;
            const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
            a.cone = Math.max(ATT.MIN_CONE, Math.atan2(ATT.WIDTH, Math.max(0.5, d)));
            a.on = ang < a.cone;
            a.gaze = a.on ? Math.min(1, a.gaze + dt / ATT.BUILD) : Math.max(0, a.gaze - dt / ATT.FADE);
            // my steps towards him (m/s along the way to him) — walking past, or away, counts nothing
            const toward = vel && d > 0.3 ? (vel.x * dx + vel.z * dz) / d : 0;
            const sideways = vel ? Math.hypot(vel.x, vel.z) - Math.max(0, toward) : 0;
            const walk = toward > 0.6 && sideways < toward ? Math.min(1, toward / 2.5) : 0;
            // facing him roughly (no longer in the cone, but he is in front of me)
            const ahead = (look.x * dx + look.z * dz) / (lh * (d || 1));
            const partner = this.partner?.id === b.id && now - this.partner.at < ATT.PARTNER * 1000;
            const near = d < ATT.NEAR ? 1 - d / ATT.NEAR : 0;
            a.score = Math.min(1, a.gaze * 0.7 + walk * 0.6 * Math.max(0, ahead) + near * 0.45 * Math.max(0, ahead) + (partner ? 0.4 : 0));
        }
        for (const id of this.of.keys()) if (!seen.has(id)) this.of.delete(id); // (gone far off: nothing kept — the map never grows)
    }

    /** I talked with this one just now: my next words go on to him. */
    talkedWith(id, now) { this.partner = { id, at: now }; }

    score(id) { return this.of.get(id)?.score || 0; }

    /**
     * Whom my words are for, of the beings `ok` allows: the one I look at / walk to / talk with — within an ordinary
     * voice (TALK), or a shout's reach when I shout (`loud`); otherwise the one right in front of me (NEAR).
     * @returns {string|null} his id
     */
    addressee(ok = null, loud = false) {
        let best = null, bs = -Infinity;
        const reach = loud ? ATT.SHOUT : ATT.TALK;
        for (const [id, a] of this.of) {
            if (a.d > reach || (ok && !ok(id))) continue;
            // (addressed: looked at for a moment, or the talk partner, or right in front of me; the farther, the surer it must be)
            const need = a.d < ATT.NEAR ? 0.12 : 0.3 + 0.2 * Math.min(1, a.d / reach);
            const s = a.score - need + (a.d < ATT.NEAR ? 0.05 * (ATT.NEAR - a.d) : 0);
            if (a.score >= need && s > bs) { bs = s; best = id; }
        }
        return best;
    }
}
