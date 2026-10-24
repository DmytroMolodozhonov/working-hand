/**
 * Gestures.js — what a person does with his hands, head and body while he talks (the author: «анимации общения как в Sims… до 100
 * под разные ситуации… зависит от эмоций»). Pure (no THREE / DOM): tests/unit/gestures.test.js.
 *
 * ~40 base motions (an arm raised, a shrug, hands on the hips, a nod…) × the side (right/left hand) × the manner (soft / wide) = 100+
 * gestures. Each carries the situations it fits (`ctx`) and the feelings it shows (`emo`), so `pickGesture` chooses by what is going on:
 * a greeting waves, an answer explains with an open palm, a refusal stops with the hand, anger shakes a fist, doubt scratches the head.
 *
 * A gesture is joint targets for VillagerModel (the keys of its own modes: aLX/aRX 0 hangs, π/2 forward, π up; aLZ negative / aRZ
 * positive = outward; headX down +; hx the body's lean) with an envelope: it rises, holds (with its own swing) and falls.
 */

import { EMOTIONS } from './Emotions.js';

const TAU = Math.PI * 2;

/**
 * Base motions, written for the RIGHT hand (a left-hand copy mirrors it).
 * x/z/y: the arm (forward-up / outward / twist), w: the wrist, sx/sz/sw: the swing amplitude of the arm / wrist, f: swing speed (Hz);
 * head: {x,y,z}, body: {hx}, both: the other arm copies it mirrored (a two-handed motion), L: the left arm's own values (aLX, aLZ) when it differs.
 */
const BASE = [
    // --- the hands that show and explain
    { id: 'point', ru: 'показывает рукой', arm: { x: 1.55, z: 0.05, w: -0.3 }, dur: 1.6, ctx: ['direct', 'explain', 'order'], emo: ['determined', 'neutral'] },
    { id: 'point_up', ru: 'поднимает палец — «вот мысль»', arm: { x: 2.9, z: 0.1, w: -0.2 }, dur: 1.5, ctx: ['explain', 'idea', 'warn'], emo: ['proud', 'determined', 'happy'] },
    { id: 'palm_up', ru: 'ладонь вверх — «как есть»', arm: { x: 1.2, z: 0.25, w: -1.5, sw: 0.15 }, f: 1.2, dur: 2.2, ctx: ['answer', 'explain', 'plead'], emo: ['neutral', 'sad', 'worried'] },
    { id: 'explain_small', ru: 'объясняет, чуть двигая рукой', arm: { x: 0.8, z: 0.15, sx: 0.22 }, f: 1.6, dur: 2.6, ctx: ['answer', 'explain'], emo: ['neutral', 'thoughtful', 'happy'] },
    { id: 'explain_big', ru: 'объясняет широко', arm: { x: 1.2, z: 0.45, sx: 0.4, sz: 0.2 }, f: 1.3, dur: 2.6, ctx: ['explain', 'story', 'joke'], emo: ['joy', 'happy', 'proud', 'laugh'] },
    { id: 'count', ru: 'считает по пальцам', arm: { x: 1.45, z: 0.15, sx: 0.1, w: -0.9 }, f: 0.9, dur: 2.8, ctx: ['explain', 'list', 'answer'], emo: ['neutral', 'thoughtful'] },
    { id: 'sweep', ru: 'обводит рукой', arm: { x: 1.4, z: 0.2, sz: 0.4 }, f: 0.6, dur: 2.4, ctx: ['show', 'story', 'greet'], emo: ['proud', 'happy', 'neutral'] },
    { id: 'beckon', ru: 'подзывает', arm: { x: 1.4, z: 0.1, w: -0.9, sw: 0.4 }, f: 2.4, dur: 1.8, ctx: ['call', 'order', 'flirt'], emo: ['mischief', 'neutral', 'happy'] },
    { id: 'reach', ru: 'протягивает руки', arm: { x: 1.5, z: 0.3, w: -1.4 }, both: true, dur: 2.0, ctx: ['plead', 'offer', 'sorry'], emo: ['sad', 'worried', 'love', 'afraid'] },
    { id: 'open_arms', ru: 'разводит руки — «ну вот»', arm: { x: 0.9, z: 0.8, w: -1.2 }, both: true, dur: 2.0, ctx: ['greet', 'welcome', 'shrug', 'joke'], emo: ['joy', 'happy', 'surprised', 'proud'] },
    // --- refusal, doubt, thought
    { id: 'stop', ru: 'выставляет ладонь — «стоп»', arm: { x: 1.6, z: 0.1, w: -1.6 }, dur: 1.6, ctx: ['refuse', 'warn', 'wait'], emo: ['angry', 'afraid', 'determined'] },
    { id: 'dismiss', ru: 'отмахивается', arm: { x: 1.2, z: 0.55, sz: 0.45 }, f: 2.6, dur: 1.5, ctx: ['refuse', 'bye', 'joke'], emo: ['contempt', 'disgusted', 'tired'] },
    { id: 'shrug', ru: 'пожимает плечами', arm: { x: 0.45, z: 0.55, w: -1.1 }, both: true, head: { z: 0.1 }, body: { hx: -0.05 }, dur: 1.5, ctx: ['unknown', 'answer', 'refuse'], emo: ['neutral', 'embarrassed', 'sad'] },
    { id: 'scratch_head', ru: 'чешет затылок', arm: { x: 2.9, z: -0.3, sw: 0.1, sz: 0.1 }, f: 2.2, head: { z: 0.1 }, dur: 2.0, ctx: ['unknown', 'think', 'sorry'], emo: ['embarrassed', 'thoughtful', 'worried'] },
    { id: 'chin', ru: 'трёт подбородок', arm: { x: 2.3, z: -0.45, w: -1.4, sx: 0.05 }, f: 1.0, head: { x: 0.1, z: 0.05 }, dur: 2.6, ctx: ['think', 'question', 'unknown'], emo: ['thoughtful', 'suspicious'] },
    { id: 'temple', ru: 'касается виска', arm: { x: 2.6, z: -0.2 }, head: { z: 0.08 }, dur: 1.8, ctx: ['think', 'idea'], emo: ['thoughtful', 'determined'] },
    { id: 'cross_arms', ru: 'скрещивает руки', arm: { x: 1.1, z: -0.9 }, both: true, body: { hx: -0.04 }, dur: 3.2, ctx: ['refuse', 'wait', 'doubt'], emo: ['angry', 'suspicious', 'contempt', 'proud'] },
    { id: 'hips', ru: 'упирает руки в бока', arm: { x: 0.3, z: 0.75 }, both: true, body: { hx: -0.06 }, dur: 3.0, ctx: ['order', 'scold', 'brag'], emo: ['proud', 'angry', 'determined'] },
    { id: 'behind_back', ru: 'руки за спиной', arm: { x: -0.5, z: -0.2 }, both: true, body: { hx: -0.05 }, dur: 3.4, ctx: ['formal', 'wait', 'listen'], emo: ['neutral', 'proud', 'thoughtful'] },
    { id: 'hand_ear', ru: 'прикладывает ладонь к уху', arm: { x: 2.4, z: 0.15 }, head: { z: 0.15, y: 0.15 }, dur: 2.0, ctx: ['listen', 'unknown'], emo: ['surprised', 'thoughtful', 'suspicious'] },
    { id: 'shush', ru: 'палец к губам', arm: { x: 2.3, z: -0.5, w: -1.3 }, dur: 1.6, ctx: ['secret', 'warn'], emo: ['mischief', 'worried', 'determined'] },
    // --- feelings
    { id: 'hand_chest', ru: 'ладонь на груди', arm: { x: 1.8, z: -0.55, w: -1.8 }, dur: 2.2, ctx: ['sorry', 'thanks', 'oath', 'love'], emo: ['love', 'embarrassed', 'sad', 'happy'] },
    { id: 'oath', ru: 'рука на сердце — клятва', arm: { x: 2.0, z: -0.2, w: -1.4 }, head: { x: -0.08 }, dur: 2.0, ctx: ['oath', 'formal', 'loyal'], emo: ['determined', 'proud'] },
    { id: 'face_palm', ru: 'хватается за лоб', arm: { x: 2.5, z: -0.2, w: -1.7 }, head: { x: 0.3 }, dur: 1.8, ctx: ['sorry', 'meh', 'joke'], emo: ['embarrassed', 'tired', 'disgusted', 'pain'] },
    { id: 'cover_mouth', ru: 'прикрывает рот', arm: { x: 2.2, z: -0.4 }, head: { x: 0.12 }, dur: 1.8, ctx: ['joke', 'shy', 'surprise', 'secret'], emo: ['embarrassed', 'laugh', 'surprised', 'mischief'] },
    { id: 'wipe_brow', ru: 'вытирает лоб', arm: { x: 2.7, z: -0.2, sz: 0.15 }, f: 1.4, head: { x: 0.15 }, dur: 1.8, ctx: ['tired', 'relief'], emo: ['tired', 'worried', 'pain'] },
    { id: 'rub_neck', ru: 'трёт шею', arm: { x: 2.8, z: -0.55, sz: 0.08 }, f: 1.8, head: { y: 0.2 }, dur: 2.0, ctx: ['sorry', 'shy', 'unknown'], emo: ['embarrassed', 'tired', 'worried'] },
    { id: 'wring', ru: 'теребит руки', arm: { x: 0.95, z: -0.35, sx: 0.1, sz: 0.1 }, both: true, f: 2.0, head: { x: 0.12 }, dur: 3.0, ctx: ['sorry', 'plead', 'shy'], emo: ['worried', 'afraid', 'embarrassed', 'sad'] },
    { id: 'pat_belly', ru: 'хлопает по животу', arm: { x: 0.9, z: -0.45, sx: 0.1 }, f: 2.0, body: { hx: -0.1 }, head: { x: -0.2 }, dur: 2.0, ctx: ['joke', 'food', 'laugh'], emo: ['laugh', 'joy', 'happy'] },
    { id: 'clap', ru: 'хлопает в ладоши', arm: { x: 1.5, z: -0.2, sz: 0.2 }, both: true, f: 3.0, dur: 2.0, ctx: ['praise', 'joy', 'win'], emo: ['joy', 'happy', 'proud'] },
    { id: 'fist_up', ru: 'вскидывает кулак', arm: { x: 2.9, z: 0.15, w: -0.2 }, dur: 1.6, ctx: ['win', 'praise', 'oath'], emo: ['joy', 'determined', 'proud'] },
    { id: 'fist_shake', ru: 'грозит кулаком', arm: { x: 1.9, z: 0.2, sx: 0.35 }, f: 3.0, head: { x: 0.1 }, dur: 1.8, ctx: ['angry', 'threat'], emo: ['angry'] },
    { id: 'recoil', ru: 'отшатывается, вскинув руки', arm: { x: 1.0, z: 0.5, w: -1.3 }, both: true, body: { hx: -0.25 }, head: { x: -0.1 }, dur: 1.2, ctx: ['fear', 'surprise'], emo: ['afraid', 'surprised', 'disgusted'] },
    { id: 'hide_face', ru: 'закрывается рукой', arm: { x: 2.0, z: -0.3, w: -1.2 }, both: true, head: { x: 0.25 }, body: { hx: 0.1 }, dur: 2.0, ctx: ['fear', 'sorry'], emo: ['afraid', 'pain', 'embarrassed'] },
    { id: 'weigh', ru: 'взвешивает на ладонях', arm: { x: 1.2, z: 0.3, w: -1.4, sx: 0.22 }, both: true, f: 0.8, dur: 3.0, ctx: ['doubt', 'trade', 'think'], emo: ['thoughtful', 'suspicious', 'neutral'] },
    { id: 'salute', ru: 'отдаёт честь', arm: { x: 2.7, z: 0.4 }, dur: 1.8, ctx: ['formal', 'greet', 'loyal', 'bye'], emo: ['proud', 'determined', 'neutral'] },
    { id: 'wave', ru: 'машет рукой', arm: { x: 2.6, z: 0.5, sz: 0.28, sw: 0.3 }, f: 1.8, dur: 2.0, ctx: ['greet', 'bye', 'call'], emo: ['happy', 'joy', 'love', 'neutral'] },
    { id: 'blow_kiss', ru: 'шлёт воздушный поцелуй', arm: { x: 2.3, z: 0.25, w: -1.2 }, head: { z: 0.12, x: -0.05 }, dur: 1.6, ctx: ['flirt', 'bye'], emo: ['love', 'mischief'] },
    { id: 'thumbs', ru: 'показывает «отлично»', arm: { x: 1.7, z: 0.2, w: -0.4 }, dur: 1.6, ctx: ['praise', 'agree'], emo: ['happy', 'proud', 'joy'] },
    // --- only the head and the body
    { id: 'nod', ru: 'кивает', head: { x: 0.0, nodX: 0.2 }, f: 1.7, dur: 1.6, ctx: ['agree', 'listen', 'greet', 'answer'], emo: ['neutral', 'happy', 'thoughtful'] },
    { id: 'nod_slow', ru: 'медленно кивает', head: { x: 0.15, nodX: 0.14 }, f: 0.8, dur: 2.2, ctx: ['agree', 'listen', 'formal', 'think'], emo: ['thoughtful', 'sad', 'determined'] },
    { id: 'shake', ru: 'качает головой', head: { shakeY: 0.28 }, f: 1.8, dur: 1.7, ctx: ['refuse', 'disagree', 'sorry'], emo: ['sad', 'angry', 'disgusted', 'tired'] },
    { id: 'tilt', ru: 'наклоняет голову', head: { z: 0.2, x: 0.05 }, dur: 2.4, ctx: ['question', 'listen', 'flirt', 'think'], emo: ['thoughtful', 'love', 'suspicious'] },
    { id: 'look_away', ru: 'отводит взгляд', head: { y: 0.6, x: 0.12 }, dur: 2.0, ctx: ['shy', 'sorry', 'lie', 'refuse'], emo: ['embarrassed', 'sad', 'contempt', 'tired'] },
    { id: 'glance', ru: 'косится', head: { y: 0.4 }, dur: 1.4, ctx: ['secret', 'doubt'], emo: ['suspicious', 'mischief'] },
    { id: 'bow', ru: 'кланяется', head: { x: 0.35 }, body: { hx: 0.35 }, dur: 1.8, ctx: ['formal', 'greet', 'bye', 'thanks', 'loyal'], emo: ['neutral', 'proud', 'embarrassed'] },
    { id: 'lean_in', ru: 'наклоняется ближе', body: { hx: 0.16 }, head: { x: -0.08 }, dur: 2.6, ctx: ['secret', 'listen', 'flirt', 'question'], emo: ['suspicious', 'love', 'thoughtful', 'mischief'] },
    { id: 'lean_back', ru: 'откидывается назад', body: { hx: -0.14 }, head: { x: -0.06 }, dur: 2.4, ctx: ['doubt', 'refuse', 'surprise'], emo: ['contempt', 'surprised', 'disgusted', 'proud'] },
    { id: 'chest_out', ru: 'выпячивает грудь', body: { hx: -0.1 }, head: { x: -0.18 }, arm: { x: 0.0, z: 0.25 }, both: true, dur: 2.6, ctx: ['brag', 'formal', 'win'], emo: ['proud', 'determined', 'joy'] },
    { id: 'sigh', ru: 'вздыхает', body: { hx: 0.1 }, head: { x: 0.18 }, arm: { x: 0.0, z: 0.1 }, both: true, dur: 2.2, ctx: ['tired', 'sorry', 'meh', 'sad'], emo: ['tired', 'sad', 'worried'] },
];

/** The manners: how big a motion is made and how fast. */
const MANNERS = [
    { key: 'soft', ru: 'сдержанно', amp: 0.7, tempo: 0.9 },
    { key: 'wide', ru: 'широко', amp: 1.15, tempo: 1.1 },
];

const mirrorOf = (v) => (v == null ? v : -v);

/** All gestures: id → { id, ru, base, side: 'r'|'l'|'b', manner, amp, tempo, dur, ctx, emo, arm?, head?, body?, f }. */
export const GESTURES = {};
for (const b of BASE) {
    const sides = b.arm && !b.both ? ['r', 'l'] : ['b'];
    for (const side of sides) for (const m of MANNERS) {
        const id = `${b.id}_${side}_${m.key}`;
        GESTURES[id] = { id, ru: `${b.ru} (${m.ru})`, base: b.id, side, manner: m.key, amp: m.amp, tempo: m.tempo, dur: b.dur, ctx: b.ctx, emo: b.emo, arm: b.arm || null, both: !!b.both, head: b.head || null, body: b.body || null, f: b.f || 1.2, sx: b.arm?.sx || 0, sz: b.arm?.sz || 0, sw: b.arm?.sw || 0 };
    }
}
export const GESTURE_IDS = Object.keys(GESTURES);

/** The situations a gesture is picked for. */
export const CONTEXTS = [...new Set(BASE.flatMap((b) => b.ctx).concat(['angry', 'sad', 'fear', 'listen', 'question', 'unknown']))];

/** Roles that move their hands in their own way: weights of manner per role (a knight is curt, a merchant is lively…). */
const ROLE_LIVELY = { knight: 0.6, king: 0.55, advisor: 0.7, wizard: 0.9, merchant: 1.3, seller: 1.3, farmer: 1.0, builder: 1.0, sailor: 1.2, blackbeard: 1.3, skeleton: 0.8 };
export const livelyOf = (role) => ROLE_LIVELY[role] ?? 1;

/**
 * Chooses a gesture. `ctx` (a situation key), `emo` (an emotion key), `role`, `rng` (0…1 function), `last` (the previous id, not repeated at once),
 * `lively` (0.5…1.5: how much he moves his hands — the character). → a gesture or null (he keeps still — it happens too).
 */
export function pickGesture({ ctx = 'answer', emo = 'neutral', role = '', rng = Math.random, last = null, lively = 1 } = {}) {
    const lv = lively * livelyOf(role);
    if (rng() > 0.55 + 0.3 * Math.min(1.4, lv) * (EMOTIONS[emo]?.amp ?? 1)) return null;
    let total = 0;
    const list = [];
    for (const id of GESTURE_IDS) {
        const g = GESTURES[id];
        let w = 0.25;
        if (g.ctx.includes(ctx)) w += 3;
        if (g.emo.includes(emo)) w += 2;
        if (g.base === (last && GESTURES[last]?.base)) w *= 0.1; // (not the same twice in a row)
        if (g.manner === 'wide') w *= lv >= 1 ? 1.2 : 0.6;
        else w *= lv >= 1 ? 0.8 : 1.4;
        if ((role === 'knight' || role === 'king') && g.base === 'beckon') w *= 0.4;
        total += w; list.push([g, w]);
    }
    let r = rng() * total;
    for (const [g, w] of list) { r -= w; if (r <= 0) return g; }
    return list[list.length - 1][0];
}

/** The envelope 0…1 of a gesture at time t (rise 0.35 s, hold, fall 0.45 s). */
export function envelope(t, dur) {
    if (t <= 0 || t >= dur) return 0;
    const a = Math.min(1, t / 0.35), b = Math.min(1, (dur - t) / 0.45);
    const e = Math.min(a, b);
    return e * e * (3 - 2 * e);
}

/**
 * Applies a gesture at time t to the joint targets T (mutates). `amp`/`tempo` come from the emotion (angry — wider and quicker, sad — smaller and slower).
 * Returns the envelope (0 = the gesture is over).
 */
export function gesturePose(T, g, t, amp = 1, tempo = 1) {
    if (!g) return 0;
    const e = envelope(t, g.dur / (g.tempo * tempo));
    if (e <= 0) return 0;
    const A = g.amp * amp, ph = t * g.f * g.tempo * tempo * TAU;
    const s = Math.sin(ph);
    const to = (key, val) => { T[key] += (val - T[key]) * e; };
    if (g.arm) {
        const a = g.arm;
        const x = a.x * (0.55 + 0.45 * A) + g.sx * A * s;
        const z = (a.z ?? 0) * (0.6 + 0.4 * A) + g.sz * A * Math.sin(ph + 1.3);
        const w = (a.w ?? T.wrist) + g.sw * A * Math.sin(ph + 0.6);
        // the right arm: aRX, aRZ (outward +); the left: aLX, aLZ (outward −)
        const right = g.side === 'r' || g.side === 'b', left = g.side === 'l' || g.side === 'b';
        if (right) { to('aRX', x); to('aRZ', z); to('wrist', w); }
        if (left) { to('aLX', g.both ? x + (g.sx ? -2 * g.sx * A * s : 0) : x); to('aLZ', mirrorOf(z)); if (!right) to('wrist', w); }
    }
    const h = g.head;
    if (h) {
        const hs = g.side === 'l' ? -1 : 1;
        T.headX += ((h.x ?? 0) + (h.nodX ? Math.abs(Math.sin(ph / 2)) * h.nodX * A : 0)) * e * (h.x != null || h.nodX ? 1 : 0);
        T.headY += ((h.y ?? 0) * hs + (h.shakeY ? Math.sin(ph) * h.shakeY * A : 0)) * e;
        T.headZ += (h.z ?? 0) * hs * e;
    }
    if (g.body) T.hx += (g.body.hx ?? 0) * e * A;
    return e;
}

/** A line to show in a log / test: «пожимает плечами (сдержанно)». */
export const describe = (g) => g?.ru || '';
