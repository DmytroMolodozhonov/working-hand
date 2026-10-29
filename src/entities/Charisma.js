/**
 * Charisma.js — what makes the talk of a villager alive (the author: «нет энтузиазма и харизмы»). Pure (no THREE / DOM): tests/unit/charisma.test.js.
 *   - the character (`archetypeOf`): an energetic trader, a curt guard, a solemn king, a grumbling old man, a nervous newcomer, a haughty mage,
 *     a merry innkeeper — it sets how wide and quick he moves, which gestures he likes, how much his face works, how often he shifts his weight;
 *   - the rhythm of the speech (`accentsOf`, `accentPulse`): the stressed words of a line and the time of each (by the length of the words and the
 *     pauses of the commas — the voice reads them at the same pace), so a hand strikes, the head nods and the brows rise ON the word;
 *   - the bearing of the whole body (`bodyLayer`): weight from one leg to the other, the turn of the trunk, a step toward the listener or away,
 *     leaning in at interest and anger, a start back at fear, laughter, surprise, grief — with the whole body, a listener's nods, a breath, a sigh.
 * Everything is a pose (angles added to the joint targets): nothing moves the villager over the ground, so no wall or body is ever crossed.
 */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * amp/tempo: size and speed of the motions; wide: how much the wide manner is liked; sway: weight shifts; turn: trunk and head turns;
 * nod: nods and beats on the stress; brow/mouth: how much the face works; blink: seconds between blinks; step: leaning/stepping toward;
 * like: gesture bases he likes (x weight); gestMax: how often he gestures at all (added to the chance).
 */
export const ARCHETYPES = {
    plain: { ru: 'обычный', amp: 1, tempo: 1, wide: 1, sway: 1, turn: 1, nod: 1, brow: 1, mouth: 1, blink: 4, step: 1, gestMax: 0, like: {} },
    energetic: { ru: 'энергичный торговец', amp: 1.4, tempo: 1.3, wide: 1.8, sway: 1.5, turn: 1.4, nod: 1.5, brow: 1.4, mouth: 1.3, blink: 3.2, step: 1.6, gestMax: 0.25, like: { open_arms: 2.5, explain_big: 2.5, beckon: 2, weigh: 2, clap: 1.5, point: 1.6, both_beat: 2 } },
    reserved: { ru: 'сдержанный стражник', amp: 0.7, tempo: 0.85, wide: 0.5, sway: 0.5, turn: 0.6, nod: 0.8, brow: 0.6, mouth: 0.6, blink: 5.5, step: 0.5, gestMax: -0.2, like: { behind_back: 3, cross_arms: 2, salute: 2.5, nod: 2, stop: 1.5, hips: 1.5 } },
    solemn: { ru: 'торжественный король', amp: 0.95, tempo: 0.75, wide: 1.1, sway: 0.35, turn: 0.7, nod: 1.2, brow: 0.8, mouth: 0.7, blink: 6, step: 0.4, gestMax: -0.1, like: { sweep: 3, nod_slow: 3, chest_out: 2.5, point: 1.5, hips: 1.5, oath: 2.5, behind_back: 1.5 } },
    grumpy: { ru: 'старик-ворчун', amp: 0.9, tempo: 0.8, wide: 0.9, sway: 1.1, turn: 0.8, nod: 0.7, brow: 1.3, mouth: 1.1, blink: 4.5, step: 0.7, gestMax: 0, like: { dismiss: 3, shake: 2.5, fist_shake: 2, cross_arms: 2, sigh: 2.5, scratch_head: 1.5, rub_neck: 1.5 } },
    nervous: { ru: 'нервный новичок', amp: 0.85, tempo: 1.35, wide: 0.6, sway: 1.8, turn: 1.6, nod: 1.6, brow: 1.5, mouth: 1.2, blink: 2.2, step: 0.8, gestMax: 0.1, like: { wring: 3, scratch_head: 2.5, rub_neck: 2.5, look_away: 2.5, shrug: 2, cover_mouth: 2, wipe_brow: 2 } },
    arrogant: { ru: 'надменный маг', amp: 1.05, tempo: 0.9, wide: 1.3, sway: 0.5, turn: 1.0, nod: 0.6, brow: 1.2, mouth: 0.8, blink: 6.5, step: 0.5, gestMax: 0, like: { dismiss: 2.5, chest_out: 2.5, cross_arms: 2, lean_back: 2.5, tilt: 2, palm_up: 2, point_up: 2.5, sweep: 1.5 } },
    jolly: { ru: 'весёлый трактирщик', amp: 1.35, tempo: 1.15, wide: 1.7, sway: 1.3, turn: 1.3, nod: 1.4, brow: 1.3, mouth: 1.5, blink: 3.5, step: 1.3, gestMax: 0.2, like: { pat_belly: 3, open_arms: 2.5, clap: 2.5, explain_big: 2, wave: 1.5, thumbs: 2, cover_mouth: 1.3 } },
};
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

const WIZARDS = /wiz|mage|sorc|warlock|archmage|master|teacher|magic/i;
/** → an archetype key (the same for the same villager always; neighbours of one role differ by their seed). */
export function archetypeOf(role = '', seed = 0) {
    const s = Math.abs(seed | 0), r = s % 10;
    if (role === 'king') return 'solemn';
    if (role === 'advisor') return r < 6 ? 'solemn' : 'reserved';
    if (role === 'knight' || role === 'guard') return r < 8 ? 'reserved' : r < 9 ? 'plain' : 'nervous'; // (a young knight is nervous)
    if (role === 'merchant' || role === 'seller') return r < 6 ? 'energetic' : r < 8 ? 'jolly' : 'plain';
    if (role === 'sailor' || role === 'blackbeard') return r < 5 ? 'jolly' : r < 8 ? 'energetic' : 'grumpy';
    if (role === 'skeleton') return 'reserved';
    if (WIZARDS.test(role)) return r < 6 ? 'arrogant' : r < 8 ? 'reserved' : 'grumpy';
    if (role === 'farmer' || role === 'builder' || role === 'villager') return ['plain', 'grumpy', 'jolly', 'plain', 'nervous', 'plain', 'grumpy', 'energetic', 'plain', 'jolly'][r];
    return ['plain', 'plain', 'jolly', 'nervous', 'plain', 'grumpy', 'plain', 'plain', 'energetic', 'plain'][r];
}

// ------------------------------------------------------------------ the rhythm of the speech
/**
 * The stressed words of a line: → { t: [seconds…], w: [strength 0…1…], end } (end = when the line ends). The time of a word follows its
 * place in the line by letters (a comma or a dash holds the voice 0.25 s, a stop 0.45 s). `secs` = how long the line is said.
 */
export function accentsOf(text, secs = 4) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const out = { t: [], w: [], end: Math.max(0.5, secs) };
    if (!words.length) return out;
    let total = 0;
    const cum = [];
    for (const wd of words) {
        const letters = wd.replace(/[^\p{L}\p{N}]/gu, '').length || 1;
        cum.push(total);
        total += letters + 1 + (/[,;:—–-]$/.test(wd) ? 3 : /[.!?…]$/.test(wd) ? 5 : 0);
    }
    const scale = out.end / Math.max(1, total);
    words.forEach((wd, i) => {
        const core = wd.replace(/[^\p{L}\p{N}]/gu, '');
        if (!core) return;
        let w = 0;
        if (core.length >= 7) w += 0.5;
        else if (core.length >= 5) w += 0.25;
        if (/[!]$/.test(wd)) w += 0.6;
        else if (/[?]$/.test(wd)) w += 0.35;
        else if (/[,;:—–]$/.test(wd)) w += 0.2;
        if (core.length > 1 && core === core.toUpperCase() && core !== core.toLowerCase()) w += 0.7;
        if (/^(не|нет|никогда|всегда|очень|только|вот|ни)$/i.test(core)) w += 0.45;
        if (i === words.length - 1) w += 0.2;
        if (w < 0.45) return;
        const last = out.t.length ? out.t[out.t.length - 1] : -9;
        const t = (cum[i] + Math.min(core.length, 4) * 0.5) * scale; // (the beat falls on the stressed syllable: near the start of the word)
        if (t - last < 0.32) return; // (no more than three beats a second)
        out.t.push(t); out.w.push(Math.min(1, w));
    });
    return out;
}

/** The strength 0…1 of the stress at the time `t` after the line began: it jumps up in 60 ms and fades in about 0.3 s. */
export function accentPulse(acc, t) {
    if (!acc || !acc.t.length || t < 0) return 0;
    let best = 0;
    for (let i = 0; i < acc.t.length; i++) {
        const d = t - acc.t[i];
        if (d < -0.02) break;
        const e = d < 0.06 ? Math.max(0, (d + 0.02) / 0.08) : Math.exp(-(d - 0.06) / 0.14);
        if (e * acc.w[i] > best) best = e * acc.w[i];
    }
    return best;
}

/** 1 → 0 over the 0.9 s after a line ends (a breath out, a sigh), else 0. */
export function breathAfter(acc, t) {
    if (!acc) return 0;
    const d = t - acc.end;
    return d >= 0 && d < 0.9 ? Math.sin((d / 0.9) * Math.PI) : 0;
}

// ------------------------------------------------------------------ the whole body
/**
 * What each feeling does to the whole body: shake = laughing/trembling (Hz, size), lean = trunk forward (+) / back (−), slump = head and
 * shoulders down, start = a jerk back when the feeling begins, step = leaning on the front/back leg (+ toward the listener), sway = weight shifts.
 */
export const BODY_EMO = {
    neutral: {}, happy: { bounce: 0.012, sway: 1.1 }, joy: { bounce: 0.03, sway: 1.3, lean: 0.04 },
    laugh: { shake: [6.5, 0.07], bounce: 0.05, lean: 0.07, head: -0.12 },
    angry: { lean: 0.14, step: 0.55, shake: [11, 0.012], sway: 0.4 }, afraid: { lean: -0.2, step: -0.6, shake: [13, 0.02], start: 1 },
    surprised: { lean: -0.12, step: -0.3, start: 1, head: -0.1 }, sad: { slump: 0.14, sway: 0.5, lean: 0.07 }, pain: { slump: 0.2, lean: 0.12, shake: [8, 0.02] },
    worried: { sway: 1.6, lean: 0.03 }, embarrassed: { sway: 1.4, slump: 0.05 }, tired: { slump: 0.12, sway: 0.7 }, disgusted: { lean: -0.08, step: -0.25 },
    contempt: { lean: -0.06, head: -0.1, sway: 0.5 }, proud: { lean: -0.04, head: -0.1, sway: 0.4 }, love: { lean: 0.07, step: 0.3, sway: 1.1 },
    determined: { lean: 0.08, step: 0.35, sway: 0.4 }, thoughtful: { sway: 0.7, head: 0.04 }, suspicious: { lean: -0.03, step: -0.15 }, mischief: { lean: 0.05, bounce: 0.01, sway: 1.2 },
};

/** The joint offsets the layer writes (add them to the targets). */
export const newLayer = () => ({ hx: 0, hy: 0, hz: 0, headX: 0, headY: 0, headZ: 0, lL: 0, lR: 0, kL: 0, kR: 0, bounce: 0, beat: 0, brow: 0, blink: 0, mouth: 0 });

const _sm = (x) => x * x * (3 - 2 * x);

/**
 * Fills `o` (newLayer) with the body language at time `t`.
 *   ch: ARCHETYPES row, emo: key, seed, talk: he speaks, listen: he listens to the hero, acc: the pulse 0…1 (accentPulse), breath: breathAfter,
 *   since: seconds since the feeling began (the start/jerk), look: 0 when the hero is not close, else 1.
 */
export function bodyLayer(o, { t, ch = ARCHETYPES.plain, emo = 'neutral', seed = 0, talk = false, listen = false, acc = 0, breath = 0, since = 9, look = 1 }) {
    const B = BODY_EMO[emo] || BODY_EMO.neutral, ph = (seed % 97) * 0.37;
    for (const k in o) o[k] = 0;
    // weight from one leg onto the other: every 3–6 seconds a slow roll of the hips, the free knee a little bent, the shoulders against the hips
    const period = 4.5 / (ch.tempo * (B.sway || 1)), u = ((t + ph) / period) % 2;
    const roll = Math.sin(clamp(u > 1 ? 2 - u : u, 0, 1) * Math.PI - Math.PI / 2) * 0.5 + 0.5; // 0…1…0 smooth
    const side = Math.sin(Math.floor((t + ph) / (period * 2)) * 1.7 + ph) > 0 ? 1 : -1;
    const sw = (B.sway || 1) * ch.sway * (talk ? 1.25 : 1);
    const wgt = (roll * 2 - 1) * side;
    o.hz += wgt * 0.045 * sw; o.hy += wgt * 0.05 * sw * ch.turn; o.bounce -= Math.abs(wgt) * 0.015 * sw;
    if (wgt > 0) o.kL -= wgt * 0.12 * sw; else o.kR += wgt * 0.12 * sw;
    // the trunk turns toward the thought and back; the head a little more
    o.hy += Math.sin(t * 0.43 + ph) * 0.05 * ch.turn * (talk ? 1.6 : 0.8);
    o.headY += Math.sin(t * 0.61 + ph * 2) * 0.09 * ch.turn * (talk ? 1.4 : 0.6);
    o.headZ += Math.sin(t * 0.37 + ph) * 0.03 * ch.turn;
    // the feeling of the whole body
    o.hx += (B.lean || 0) * ch.step; o.headX += (B.head || 0) + (B.slump || 0) * 0.8; o.hx += (B.slump || 0) * 0.6;
    if (B.step) { const st = B.step * ch.step * 0.28; o.lL += st; o.lR -= st; o.kR -= Math.abs(st) * 0.4; o.hx += B.step * 0.04; }
    if (B.shake) { const [f, a] = B.shake; const s = Math.sin(t * f * TAU); o.hz += s * a * ch.amp; o.bounce += Math.abs(s) * a * 0.5; o.headX += s * a * 0.6; }
    if (B.bounce) o.bounce += Math.abs(Math.sin(t * 3.1 + ph)) * B.bounce * ch.amp;
    if (B.start && since < 0.6) { const e = Math.sin(clamp(since / 0.6, 0, 1) * Math.PI); o.hx -= 0.28 * e; o.headX -= 0.14 * e; o.beat += 0.5 * e; o.brow += e; o.lL += 0.3 * e; o.lR -= 0.3 * e; }
    // the speech: on the stressed word the head dips, the trunk drives forward, the hand beats, the brows go up
    const a = acc * ch.nod;
    o.headX += 0.16 * a; o.hx += 0.05 * a * ch.amp; o.beat += 0.3 * a * ch.amp; o.brow += 0.9 * a * ch.brow; o.mouth += a;
    o.bounce += 0.018 * a;
    // breath: the shoulders rise at the end of a line — a sigh for a tired or sad person, a short breath for the others
    if (breath > 0) { const sg = (emo === 'tired' || emo === 'sad' || emo === 'worried' ? 1.8 : 1); o.hx += 0.035 * breath * sg; o.headX += 0.05 * breath * sg; o.beat -= 0.25 * breath * sg; }
    // the listener: a short nod now and then, and the glance goes to the one who speaks
    if (listen) {
        const n = ((t * 0.31 + ph) % 1); // one nod a 3 s, a bit different for everybody
        if (n < 0.2) o.headX += Math.sin((n / 0.2) * Math.PI) * 0.13 * ch.nod;
        o.headY += Math.sin(t * 1.3 + ph) * 0.03 * (1 - look);
        o.hx += 0.025 * look; // (leans a little toward who he listens to)
    }
    // a blink: short, every `blink` seconds, never in step with the neighbour
    const per = ch.blink, bt = ((t + ph * 3.1) % (per * (1 + 0.5 * Math.sin(ph + Math.floor((t + ph) / per))))) || 0;
    o.brow = Math.min(1.5, o.brow);
    if (bt < 0.14) o.blink = Math.sin((bt / 0.14) * Math.PI);
    return o;
}
