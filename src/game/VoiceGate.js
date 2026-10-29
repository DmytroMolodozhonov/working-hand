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
    WINDOW: 2500, // ms: the spell was said within this (the recognition comes a little late)
    RECENT: 1500, // ms: the lips moved this lately — sure it's me, even if a friend just said the same
    MOVED: 0.08, // the mouth opened and closed by this much (of its width): speaking
    SEEN: 0.35, // the face seen in this share of the pictures: the lips can decide
    ECHO: 3500, // ms: the same spell said / cast by somebody else just now: an echo of their voice
    HOLD: 700, // ms a spell waits (multiplayer, the lips unseen) for a friend's word to come over the network
    // ms: my phrase began this long after a friend's word came over the network — it is mine, not the echo of theirs. Their voice
    // from my speakers (Discord: 0.1–0.5 s late) begins BEFORE their game can tell me: it sends the word only once they finished
    // it and their recognizer wrote it (≥ 0.6 s after they began). A reply with the same spell in a duel came 1–3.5 s later
    // and was thrown away as an echo whenever the camera couldn't see my mouth (voice-discord-duel.test.js).
    SAID_AFTER: 600,
    // ms round the moment a friend BEGAN his spell (his «say» tells it): the echo of his voice begins within this — before: the
    // network's delay unknown (≤ 0.3 s) and the program's 0.2 s; after: Discord's delay (≤ 1.2 s, a bad connection).
    // Outside it the same spell is mine (a duel: both answer with the same spells).
    BEGAN_BEFORE: 600, BEGAN_AFTER: 1300,
    LOUD: 12, QUIET: 6, // dB over the microphone's background: a voice heard / silence
    SYNC: 0.06, // the mouth this much more open (of its width) while the voice was loud than when quiet: it was me
    CAM_LAG: 100, // ms a camera picture comes after the moment it shows
};

/** Spells that are everyday words («Дай»): the echo of a villager's line is never cast — only my mouth moving with the voice casts it. */
const STRICT = new Set(['Die']);

/** How open the mouth is (inner lips apart / mouth width), from the face network's points. */
export function mouthOpenness(face) {
    if (!face || face.length < 292) return null;
    const up = face[13], lo = face[14], l = face[61], r = face[291];
    if (!up || !lo || !l || !r) return null;
    // (in 3D, z when the network gives it: a head tipped up at the sails or down at the wheel, or turned to an enemy, squeezes the mouth's
    // gap or its width in the flat picture — the same words then opened it less than MOVED, and «губы не двигались» refused a spell cast
    // in a fight on a ship. Both the gap and the width are measured along the face itself.)
    const dz = (a, b) => (Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z - b.z : 0);
    const w = Math.hypot(l.x - r.x, l.y - r.y, dz(l, r));
    if (w < 1e-4) return null;
    return Math.hypot(up.x - lo.x, up.y - lo.y, dz(up, lo)) / w;
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
        while (this.samples.length && t - this.samples[0].t > GATE.WINDOW + 2000) this.samples.shift();
    }

    /**
     * Somebody else cast a spell (the network says so).
     * began: when (my clock) they began to say it — their «say» tells how long ago; by: who (one spell of theirs is one note:
     * the cast's message and the word's — the one that knows when it began wins).
     */
    noteRemote(name, t, { began = null, by = null } = {}) {
        const base = baseOf(name), b = Number.isFinite(began) ? began : null;
        if (by != null) {
            const same = (r) => r.by === by && r.base === base && Math.abs(t - r.t) < 4000;
            if (b != null) this.remote = this.remote.filter((r) => !(same(r) && r.began == null));
            else if (this.remote.some((r) => same(r) && r.began != null)) return;
        }
        this.remote.push({ t, base, began: b, by });
        while (this.remote.length && t - this.remote[0].t > GATE.ECHO + 1000) this.remote.shift();
    }

    /**
     * Was the same spell just said by somebody else (a player, or a wizard of the game aloud)?
     * from: when my phrase began (ms, the same clock; unknown: null) — begun after their word came, it is no echo of it.
     */
    echoes(name, t, from = null) {
        const base = baseOf(name);
        const known = Number.isFinite(from);
        return this.remote.some((r) => {
            if (r.base !== base || t - r.t >= GATE.ECHO) return false;
            if (!known) return true;
            if (r.began != null) return from >= r.began - GATE.BEGAN_BEFORE && from <= r.began + GATE.BEGAN_AFTER; // (his voice from my speakers begins just then)
            return from <= r.t + GATE.SAID_AFTER;
        });
    }

    /**
     * Did my lips move just now (within `win` ms)? true / false / null (can't tell: the mouth wasn't
     * seen). Robust to a jumpy picture: the mouth's usual spread (10th to 90th percentile), not one frame.
     */
    lipsMoved(t, win = GATE.WINDOW) {
        let n = 0;
        const open = [];
        for (const s of this.samples) {
            if (t - s.t > win || s.t > t) continue;
            n++;
            if (s.open != null) open.push(s.open);
        }
        if (!n || open.length / n < GATE.SEEN || open.length < 4) return null;
        open.sort((a, b) => a - b);
        const q = (k) => open[Math.min(open.length - 1, Math.floor(k * open.length))];
        return q(0.9) - q(0.1) >= GATE.MOVED;
    }

    /**
     * Did my mouth move WITH the sound my microphone heard just now? My own words open my mouth just
     * when they are loud; a friend's voice from the speakers (or across the room) is loud while my
     * mouth stays as it was — whatever it did a few seconds before. true / false / null (the mouth
     * unseen, nothing loud heard, no microphone level).
     * @param {Array<[number, number]>} levels the microphone's level, [time ms, dB], oldest first
     * @param {number} floor the microphone's background, dB
     */
    lipsSync(t, levels, floor, win = GATE.WINDOW) {
        if (!levels?.length || !Number.isFinite(floor)) return null;
        const loud = [], quiet = [], seen = [];
        let j = 0;
        for (const s of this.samples) {
            if (s.open == null || t - s.t > win + 1000 || s.t > t) continue;
            seen.push(s.open);
            if (t - s.t > win) continue;
            const at = s.t - GATE.CAM_LAG; // (the moment the picture shows)
            while (j < levels.length - 1 && levels[j + 1][0] <= at) j++;
            if (Math.abs(levels[j][0] - at) > 120) continue;
            const db = levels[j][1];
            if (db > floor + GATE.LOUD) loud.push(s.open);
            else if (db < floor + GATE.QUIET) quiet.push(s.open);
        }
        if (loud.length < 3) return null;
        const q = (a, k) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(k * b.length))]; };
        const base = quiet.length >= 3 ? q(quiet, 0.5) : q(seen, 0.3); // (the mouth at rest)
        return q(loud, 0.75) - base >= GATE.SYNC;
    }

    /**
     * May the spell `name`, just heard by my microphone, be cast?
     * sure: my lips moved right then — it is mine (and the others may be told at once).
     * mic: {levels, floor} — the microphone's level, to see whether the mouth moved with the voice.
     * from: when my phrase began (meta.from): begun after a friend's word came, it can't be its echo.
     * @returns {{ok: boolean, why?: 'lips'|'echo', sure?: boolean}}
     */
    check(name, t, mic = null, from = null) {
        // the strongest: did my mouth move with the voice the microphone heard?
        const sync = mic ? this.lipsSync(t, mic.levels, mic.floor) : null;
        if (sync === false) return { ok: false, why: 'lips' };
        if (sync === true) return { ok: true, sure: true };
        const lips = this.lipsMoved(t);
        if (lips === false) return { ok: false, why: 'lips' };
        const recent = lips && this.lipsMoved(t, GATE.RECENT) === true;
        const echo = this.echoes(name, t, from);
        // (my lips moved right then: it's mine, even if a friend said the same just now)
        if (echo && (!recent || STRICT.has(baseOf(name)))) return { ok: false, why: 'echo' };
        return { ok: true, sure: !!recent };
    }
}
