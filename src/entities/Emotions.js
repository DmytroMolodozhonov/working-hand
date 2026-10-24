/**
 * Emotions.js — what a person feels, and how it shows on his face and in his bearing (the author: «как у Sims… анимации общения под
 * разные ситуации… зависит от эмоций: разгневан, счастлив… все эмоции подключи… и на лице искривления, мимика вместе с анимациями»).
 * Pure (no THREE / DOM): tests/unit/emotions.test.js. The face is drawn by VillagerModel from `face` (brows, mouth, lids); the bearing
 * (`body`) and the manner of the gestures (`tempo`, `amp`) come from the same row.
 *
 *   brow   y (up +), tilt (the inner ends: down +, so ANGRY +, SAD −), asym (one brow higher: − left … + right)
 *   mouth  curve (−1 frown … +1 smile), open (0…1), wide (0.7…1.3), asym (one corner higher)
 *   lid    0 eyes wide … 1 shut (a smile narrows the eyes, tiredness drops the lids)
 *   body   headX (down +), headZ (tilt), lean (torso forward +), shoulders (arms hang wider +)
 */

export const EMOTIONS = {
    neutral: { ru: 'спокойствие', face: { brow: { y: 0, tilt: 0, asym: 0 }, mouth: { curve: 0, open: 0, wide: 1, asym: 0 }, lid: 0 }, body: { headX: 0, headZ: 0, lean: 0, shoulders: 0 }, tempo: 1, amp: 1 },
    happy: { ru: 'радость', face: { brow: { y: 0.03, tilt: -0.1, asym: 0 }, mouth: { curve: 0.9, open: 0.12, wide: 1.15, asym: 0 }, lid: 0.14 }, body: { headX: -0.08, headZ: 0, lean: -0.03, shoulders: 0.05 }, tempo: 1.15, amp: 1.15 },
    joy: { ru: 'восторг', face: { brow: { y: 0.05, tilt: -0.12, asym: 0 }, mouth: { curve: 1, open: 0.8, wide: 1.3, asym: 0 }, lid: 0.4 }, body: { headX: -0.18, headZ: 0.06, lean: -0.06, shoulders: 0.1 }, tempo: 1.4, amp: 1.4 },
    laugh: { ru: 'смех', face: { brow: { y: 0.04, tilt: -0.1, asym: 0 }, mouth: { curve: 1, open: 1, wide: 1.3, asym: 0 }, lid: 0.6 }, body: { headX: -0.3, headZ: 0, lean: -0.12, shoulders: 0.1 }, tempo: 1.6, amp: 1.3 },
    sad: { ru: 'грусть', face: { brow: { y: -0.01, tilt: -0.5, asym: 0 }, mouth: { curve: -0.85, open: 0, wide: 0.9, asym: 0 }, lid: 0.28 }, body: { headX: 0.3, headZ: 0.08, lean: 0.08, shoulders: -0.04 }, tempo: 0.7, amp: 0.7 },
    angry: { ru: 'гнев', face: { brow: { y: -0.05, tilt: 0.6, asym: 0 }, mouth: { curve: -0.55, open: 0.3, wide: 1.1, asym: 0 }, lid: 0.2 }, body: { headX: 0.12, headZ: 0, lean: 0.1, shoulders: 0.12 }, tempo: 1.4, amp: 1.45 },
    afraid: { ru: 'страх', face: { brow: { y: 0.11, tilt: -0.4, asym: 0 }, mouth: { curve: -0.35, open: 0.6, wide: 0.9, asym: 0 }, lid: 0 }, body: { headX: -0.05, headZ: 0, lean: -0.1, shoulders: -0.08 }, tempo: 1.3, amp: 0.9 },
    surprised: { ru: 'удивление', face: { brow: { y: 0.13, tilt: 0, asym: 0 }, mouth: { curve: 0, open: 0.9, wide: 0.85, asym: 0 }, lid: 0 }, body: { headX: -0.1, headZ: 0, lean: -0.1, shoulders: 0.03 }, tempo: 1.2, amp: 1.2 },
    disgusted: { ru: 'отвращение', face: { brow: { y: -0.02, tilt: 0.3, asym: 0 }, mouth: { curve: -0.65, open: 0.2, wide: 1, asym: 0.3 }, lid: 0.3 }, body: { headX: 0.05, headZ: 0.12, lean: -0.08, shoulders: 0 }, tempo: 1, amp: 0.9 },
    contempt: { ru: 'презрение', face: { brow: { y: 0.03, tilt: 0.15, asym: -0.6 }, mouth: { curve: 0.2, open: 0, wide: 1, asym: 0.8 }, lid: 0.32 }, body: { headX: -0.15, headZ: 0.1, lean: -0.05, shoulders: 0 }, tempo: 0.9, amp: 0.9 },
    thoughtful: { ru: 'задумчивость', face: { brow: { y: 0.02, tilt: 0.1, asym: 0.7 }, mouth: { curve: -0.1, open: 0, wide: 0.9, asym: 0.2 }, lid: 0.1 }, body: { headX: 0.12, headZ: 0.12, lean: 0, shoulders: 0 }, tempo: 0.8, amp: 0.8 },
    embarrassed: { ru: 'смущение', face: { brow: { y: 0.02, tilt: -0.28, asym: 0 }, mouth: { curve: 0.25, open: 0.05, wide: 0.9, asym: 0.2 }, lid: 0.14 }, body: { headX: 0.22, headZ: 0.1, lean: 0.05, shoulders: -0.05 }, tempo: 0.9, amp: 0.8 },
    love: { ru: 'влюблённость', face: { brow: { y: 0.02, tilt: -0.18, asym: 0 }, mouth: { curve: 0.75, open: 0.05, wide: 1, asym: 0 }, lid: 0.32 }, body: { headX: 0.05, headZ: 0.14, lean: 0.06, shoulders: 0.02 }, tempo: 0.85, amp: 0.9 },
    tired: { ru: 'усталость', face: { brow: { y: -0.03, tilt: -0.1, asym: 0 }, mouth: { curve: -0.25, open: 0.05, wide: 0.95, asym: 0 }, lid: 0.58 }, body: { headX: 0.22, headZ: 0.05, lean: 0.1, shoulders: -0.06 }, tempo: 0.6, amp: 0.6 },
    proud: { ru: 'гордость', face: { brow: { y: 0.03, tilt: 0, asym: 0 }, mouth: { curve: 0.45, open: 0, wide: 1.05, asym: 0 }, lid: 0.12 }, body: { headX: -0.22, headZ: 0, lean: -0.05, shoulders: 0.1 }, tempo: 0.95, amp: 1.2 },
    worried: { ru: 'тревога', face: { brow: { y: 0.04, tilt: -0.55, asym: 0 }, mouth: { curve: -0.45, open: 0.05, wide: 0.9, asym: 0 }, lid: 0.05 }, body: { headX: 0.1, headZ: 0.06, lean: 0.04, shoulders: -0.03 }, tempo: 1.15, amp: 0.85 },
    determined: { ru: 'решимость', face: { brow: { y: -0.03, tilt: 0.32, asym: 0 }, mouth: { curve: 0.05, open: 0, wide: 1, asym: 0 }, lid: 0.1 }, body: { headX: 0.03, headZ: 0, lean: 0.06, shoulders: 0.08 }, tempo: 1.1, amp: 1.2 },
    suspicious: { ru: 'подозрение', face: { brow: { y: 0, tilt: 0.22, asym: 0.4 }, mouth: { curve: -0.25, open: 0, wide: 0.9, asym: -0.2 }, lid: 0.3 }, body: { headX: 0.04, headZ: 0.1, lean: -0.04, shoulders: 0 }, tempo: 0.85, amp: 0.8 },
    mischief: { ru: 'озорство', face: { brow: { y: 0.04, tilt: 0.1, asym: -0.4 }, mouth: { curve: 0.8, open: 0.1, wide: 1.1, asym: 0.5 }, lid: 0.22 }, body: { headX: -0.05, headZ: 0.1, lean: 0, shoulders: 0.04 }, tempo: 1.25, amp: 1.1 },
    pain: { ru: 'боль', face: { brow: { y: 0, tilt: -0.6, asym: 0 }, mouth: { curve: -0.8, open: 0.5, wide: 1, asym: 0 }, lid: 0.7 }, body: { headX: 0.25, headZ: 0.1, lean: 0.14, shoulders: -0.05 }, tempo: 1.2, amp: 0.8 },
};
export const EMOTION_KEYS = Object.keys(EMOTIONS);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** The face row between two emotions (k 0…1) — a face moves smoothly from one to another. */
export function blendFace(a, b, k) {
    const A = EMOTIONS[a]?.face || EMOTIONS.neutral.face, B = EMOTIONS[b]?.face || EMOTIONS.neutral.face;
    return {
        brow: { y: lerp(A.brow.y, B.brow.y, k), tilt: lerp(A.brow.tilt, B.brow.tilt, k), asym: lerp(A.brow.asym, B.brow.asym, k) },
        mouth: { curve: lerp(A.mouth.curve, B.mouth.curve, k), open: lerp(A.mouth.open, B.mouth.open, k), wide: lerp(A.mouth.wide, B.mouth.wide, k), asym: lerp(A.mouth.asym, B.mouth.asym, k) },
        lid: lerp(A.lid, B.lid, k),
    };
}

/** The face moved toward a target by one step of dt (rate per second). Mutates and returns `face`. */
export function easeFace(face, target, dt, rate = 7) {
    const k = 1 - Math.exp(-rate * dt);
    face.brow.y += (target.brow.y - face.brow.y) * k; face.brow.tilt += (target.brow.tilt - face.brow.tilt) * k; face.brow.asym += (target.brow.asym - face.brow.asym) * k;
    face.mouth.curve += (target.mouth.curve - face.mouth.curve) * k; face.mouth.open += (target.mouth.open - face.mouth.open) * k;
    face.mouth.wide += (target.mouth.wide - face.mouth.wide) * k; face.mouth.asym += (target.mouth.asym - face.mouth.asym) * k;
    face.lid += (target.lid - face.lid) * k;
    return face;
}

export const newFace = () => blendFace('neutral', 'neutral', 0);

/** The boxes that draw the lower part of the face (the brows, the lids and the mouth) — the model puts them as one mesh. Quantised. */
export function quantFace(f) {
    const q = (x, s) => Math.round(x * s) / s;
    return { brow: { y: q(f.brow.y, 40), tilt: q(f.brow.tilt, 8), asym: q(f.brow.asym, 4) }, mouth: { curve: q(f.mouth.curve, 5), open: q(f.mouth.open, 4), wide: q(f.mouth.wide, 4), asym: q(f.mouth.asym, 4) }, lid: q(f.lid, 8) };
}
export const faceKey = (f) => `${f.brow.y}|${f.brow.tilt}|${f.brow.asym}|${f.mouth.curve}|${f.mouth.open}|${f.mouth.wide}|${f.mouth.asym}|${f.lid}`;

// ------------------------------------------------------------------ what he feels
/**
 * The emotion from the moment: his mood (−1…1), the bars to the hero {sub, fr, lv}, the events of the last seconds
 * (`ev`: a kind like 'hit', 'insult', 'wow', 'danger', 'laugh', 'compliment'…), his character.
 * → an emotion key. A short event wins over the standing mood.
 */
export function emotionOf({ mood = 0, eff = { sub: 0, fr: 0, lv: 0 }, ev = null, c = {}, fear = 0, hp = 1, night = false } = {}) {
    if (ev) {
        const E = EVENT_EMOTION[ev];
        if (E) return typeof E === 'function' ? E(c, eff) : E;
    }
    if (fear >= 2) return 'afraid';
    if (fear >= 1) return 'worried';
    if (hp < 0.35) return 'pain';
    if (eff.lv >= 40 && mood > -0.2) return 'love';
    if (mood >= 0.55) return eff.fr >= 20 ? 'joy' : 'happy';
    if (mood >= 0.2) return 'happy';
    if (mood <= -0.6) return (c.temper ?? 35) >= 50 ? 'angry' : 'sad';
    if (mood <= -0.3) return (c.temper ?? 35) >= 55 ? 'suspicious' : 'worried';
    if (eff.fr <= -30 || eff.sub <= -30) return (c.temper ?? 35) >= 50 ? 'angry' : 'contempt';
    if (night && (c.brave ?? 50) < 40) return 'worried';
    return 'neutral';
}
const EVENT_EMOTION = {
    hit: (c) => ((c.brave ?? 50) >= 55 ? 'angry' : 'afraid'), insult: (c) => ((c.temper ?? 35) >= 50 ? 'angry' : 'sad'), threat: (c) => ((c.brave ?? 50) >= 55 ? 'angry' : 'afraid'),
    compliment: (c, eff) => (eff.lv >= 20 ? 'love' : (c.kindness ?? 55) >= 50 ? 'happy' : 'embarrassed'), thanks: 'happy', joke: 'laugh', laugh: 'laugh', flirt: (c, eff) => (eff.fr + eff.lv >= 15 ? 'love' : 'embarrassed'),
    wow: 'surprised', nice: 'happy', meh: 'neutral', sneer: 'contempt', afraid: 'afraid', danger: 'afraid', explosion: 'afraid', win: 'joy', feast: 'joy',
    arrest: 'afraid', protest: 'angry', released: 'disgusted', lost: 'sad', thinking: 'thoughtful', question: 'thoughtful', shy: 'embarrassed', burnout: 'sad', proud: 'proud',
    tired: 'tired', pain: 'pain', suspect: 'suspicious', plot: 'determined', mischief: 'mischief', order: 'determined', ok: 'neutral', greet: 'happy', bye: 'neutral',
};
export const EVENT_KEYS = Object.keys(EVENT_EMOTION);
export { clamp };
