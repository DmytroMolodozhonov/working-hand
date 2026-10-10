/**
 * VoiceGate.js — is it really ME who said the spell?
 *
 * The microphone also hears other voices: a friend in the same room, or a
 * friend's voice from the speakers / headphones (a voice chat). Without a check
 * their spells flew out of my hand. A spell is mine only if my lips moved while
 * it was said (the camera sees the mouth), and it is not just the echo of the
 * same spell a friend has just cast.
 *
 * When the camera can't see the mouth (a hand in front of the face, the face out
 * of the picture), the lips can't decide: then only the echo check is made.
 */

export const GATE = {
    WINDOW: 3500, // ms: the spell was said within this (the recognition comes a little late)
    MOVED: 0.07, // the mouth opened and closed by this much (of its width): speaking
    SEEN: 0.35, // the face seen in this share of the pictures: the lips can decide
    ECHO: 3500, // ms: the same spell cast by somebody else just now: an echo of their voice
};

/** How open the mouth is (inner lips apart / mouth width), from the face network's points. */
export function mouthOpenness(face) {
    if (!face || face.length < 292) return null;
    const up = face[13], lo = face[14], l = face[61], r = face[291];
    if (!up || !lo || !l || !r) return null;
    const w = Math.hypot(l.x - r.x, l.y - r.y);
    if (w < 1e-4) return null;
    return Math.hypot(up.x - lo.x, up.y - lo.y) / w;
}

/** The base spell («Бомбардо Максима» is still «Бомбардо» for the echo). */
const ALIAS = { Levitate: 'Levitation', Frozen: 'Ice' };
const baseOf = (name) => { const b = String(name || '').replace(/Maxima$/, '').replace(/Duel$/, ''); return ALIAS[b] || b; };

export class VoiceGate {
    constructor() {
        this.samples = []; // {t, open|null}
        this.remote = []; // {t, base}
    }

    /** Every camera picture: the mouth's openness (null: the face isn't seen). */
    noteFace(t, open) {
        this.samples.push({ t, open });
        while (this.samples.length && t - this.samples[0].t > GATE.WINDOW + 1000) this.samples.shift();
    }

    /** Somebody else cast a spell (the network says so). */
    noteRemote(name, t) {
        this.remote.push({ t, base: baseOf(name) });
        while (this.remote.length && t - this.remote[0].t > GATE.ECHO + 1000) this.remote.shift();
    }

    /** Did my lips move just now? true / false / null (can't tell: the mouth wasn't seen). */
    lipsMoved(t) {
        let seen = 0, n = 0, lo = Infinity, hi = -Infinity;
        for (const s of this.samples) {
            if (t - s.t > GATE.WINDOW) continue;
            n++;
            if (s.open == null) continue;
            seen++;
            lo = Math.min(lo, s.open);
            hi = Math.max(hi, s.open);
        }
        if (!n || seen / n < GATE.SEEN || seen < 4) return null;
        return hi - lo >= GATE.MOVED;
    }

    /**
     * May the spell `name`, just heard by my microphone, be cast?
     * @returns {{ok: boolean, why?: 'lips'|'echo'}}
     */
    check(name, t) {
        const lips = this.lipsMoved(t);
        if (lips === false) return { ok: false, why: 'lips' };
        const base = baseOf(name);
        const echo = this.remote.some((r) => r.base === base && t - r.t < GATE.ECHO);
        // (the lips moved: it's mine, even if a friend said the same just now)
        if (echo && lips !== true) return { ok: false, why: 'echo' };
        return { ok: true };
    }
}
