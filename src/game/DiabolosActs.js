/**
 * DiabolosActs.js — характер Дьяволоса: его поступки (анимации тела + мимика лица) и то, когда какой (чистые данные, без THREE).
 *
 * Слова автора: «до 20 анимаций дьявола, с мимикой… Он должен быть интересным ПЕРСОНАЖЕМ. И он в разных ситуациях по-разному
 * действует»; «классная анимация — когда он вытягивает язык и, типа, языком такой, троллит игрока».
 *
 * Кто он: древний бог, создатель чёрной магии, заточённый богами. Бессмертен — и знает это: над слабыми заклинаниями смеётся,
 * огнём наслаждается, божественное его жалит; прикован — и это его бесит; скучает тысячу лет — ковыряет в зубах, чешет рог,
 * пускает дым; любит дразнить тех, кто стоит за пределом цепи (язык, «иди сюда»). Во сне — живой: храпит, дёргает ухом,
 * чешет брюхо, бормочет и ухмыляется во сне.
 *
 * Каждый поступок: dur (с), when — ситуации, в которых он бывает (pickAct), w — вес, face(k, t) — мимика (см. poseDiabolos P.face),
 * body(k, t) — тело (поля P: armL/armR {rot: {sx, ab, tw, el, ha}} — углы плеча/локтя/кисти, head {yaw, pitch, roll}, lean, shake,
 * jaw, maw, tail, stretch, inhale…), snd — звуки [{t: доля, k: вид}], fx — частицы [{t, k}]. k — доля 0…1 хода, t — время (с).
 * Номер поступка идёт по сети (ACT_IDS: только дописывать в конец).
 */

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Плавный подъём к `a` и спад после `b` (0…1). */
const env = (k, a = 0.15, b = 0.85) => clamp(k / a) * clamp((1 - k) / (1 - b));
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const osc = (t, f, ph = 0) => Math.sin(t * f + ph);

/** Ситуации (Diabolos._situation): */
export const SITUATIONS = ['sleep', 'wake', 'idle', 'hitWeak', 'hitFire', 'hitDivine', 'taunt', 'intimidate', 'killed', 'surprised', 'sitDown', 'closeLook'];

export const ACTS = {
    // ================================================================ сон
    snoreDeep: {
        ru: 'храпит', dur: 6, when: ['sleep'], w: 3,
        face: (k, t) => ({ lid: 0, brow: 0.1 + 0.1 * osc(t, 1.1), ear: -0.3, nostril: 0.5 + 0.5 * osc(t, 1.1), snarl: 0.1 }),
        body: (k, t) => ({ jaw: 0.12 + 0.1 * Math.max(0, osc(t, 1.1)), breath: 1 }),
        snd: [{ t: 0.1, k: 'snore' }, { t: 0.6, k: 'snore' }], fx: [{ t: 0.45, k: 'nostrilSmoke' }, { t: 0.95, k: 'nostrilSmoke' }],
    },
    earFlick: {
        ru: 'во сне дёргает ухом и хвостом', dur: 2.4, when: ['sleep'], w: 2,
        face: (k, t) => ({ lid: 0, earL: Math.max(0, osc(t, 22)) * env(k, 0.05, 0.4) * 1.4, ear: -0.3, brow: 0.2 * env(k) }),
        body: (k, t) => ({ tail: 1.6 * env(k, 0.1, 0.6) }),
    },
    sleepScratch: {
        ru: 'во сне чешет брюхо', dur: 4.5, when: ['sleep'], w: 1.5,
        face: (k, t) => ({ lid: 0, brow: 0.3 * env(k), snarl: 0.15, nostril: 0.3 }),
        body: (k, t) => ({ armR: { rot: { sx: 0.45 + 0.1 * env(k), ab: -0.3 * env(k), el: 1.5 * env(k) + 0.6, ha: 0.4 + 0.35 * Math.sin(t * 9) * env(k, 0.2, 0.8) } } }),
        snd: [{ t: 0.3, k: 'mumble' }],
    },
    sleepMumble: {
        ru: 'бормочет и ухмыляется во сне', dur: 3.6, when: ['sleep'], w: 1.2,
        face: (k, t) => ({ lid: 0, brow: 0.4 * osc(t, 3), snarl: 0.4 * env(k), tilt: 0.3 * env(k), tongue: 0.25 * Math.max(0, osc(t, 2)) * env(k) }),
        body: (k, t) => ({ jaw: 0.15 * Math.abs(osc(t, 6)) * env(k), head: { roll: 0.1 * env(k) } }),
        snd: [{ t: 0.15, k: 'mumble' }],
    },

    // ================================================================ пробуждение
    wakeOneEye: {
        ru: 'открывает один глаз, смотрит, кто посмел', dur: 3.2, when: ['wake'], w: 1,
        face: (k, t) => ({ lidL: k < 0.5 ? 0.05 : sm((k - 0.5) * 3), lidR: sm(k * 3), browR: 0.6 * env(k, 0.3, 0.7), browL: -0.6, ear: sm(k * 2) * 0.6 - 0.3, nostril: 0.6 * Math.max(0, osc(t, 4)), pupil: 1.3 - 0.6 * k }),
        body: (k) => ({ head: { pitch: 0.15 * k } }),
        snd: [{ t: 0.4, k: 'sniff' }],
    },
    yawn: {
        ru: 'зевает — в пасти жар', dur: 3.6, when: ['wake', 'idle'], w: 1,
        face: (k) => ({ lid: 1 - 0.9 * env(k, 0.3, 0.75), brow: 0.6 * env(k, 0.3, 0.75), ear: -0.8 * env(k), nostril: env(k), tongue: 0.2 * env(k, 0.4, 0.7) }),
        body: (k) => ({ jaw: env(k, 0.35, 0.75), maw: 0.8 * env(k, 0.35, 0.75), head: { pitch: 0.45 * env(k, 0.35, 0.75) }, inhale: 0.6 * env(k, 0.2, 0.5), armR: { rot: { sx: 2.4 * env(k, 0.3, 0.8), ab: 0.5, el: 0.9, ha: -0.4 } } }),
        snd: [{ t: 0.25, k: 'yawn' }], fx: [{ t: 0.55, k: 'mouthSmoke' }],
    },
    stretch: {
        ru: 'потягивается, хрустят плечи', dur: 3.4, when: ['wake'], w: 1,
        face: (k) => ({ lid: 0.3 + 0.4 * (1 - env(k)), brow: -0.3 * env(k), snarl: 0.4 * env(k, 0.3, 0.7), nostril: 0.6 * env(k) }),
        body: (k) => ({ stretch: env(k, 0.3, 0.75), jaw: 0.3 * env(k, 0.4, 0.7) }),
        snd: [{ t: 0.55, k: 'crack' }],
    },

    // ================================================================ без цели — скучает тысячу лет
    sniffAir: {
        ru: 'нюхает воздух, ищет чужой запах', dur: 3.8, when: ['idle', 'wake'], w: 1.5,
        face: (k, t) => ({ lid: 0.55, brow: -0.4, nostril: 0.5 + 0.5 * Math.max(0, osc(t, 14)) * env(k), ear: 0.7 * env(k), pupil: 0.8 }),
        body: (k, t) => ({ head: { pitch: 0.35 * env(k), yaw: 0.5 * Math.sin(k * Math.PI * 2) } }),
        snd: [{ t: 0.2, k: 'sniff' }, { t: 0.6, k: 'sniff' }],
    },
    lookAround: {
        ru: 'хмуро осматривается', dur: 4.2, when: ['idle'], w: 1.5,
        face: (k, t) => ({ lid: 0.75, brow: -0.6, ear: 0.5 * Math.sin(k * Math.PI * 2), pupil: 0.8 }),
        body: (k) => ({ head: { yaw: 0.8 * Math.sin(k * Math.PI * 2), pitch: 0.05 } }),
    },
    pickTeeth: {
        ru: 'ковыряет когтем в зубах', dur: 5, when: ['idle'], w: 1,
        face: (k, t) => ({ lid: 0.5, lidL: 0.25, brow: -0.2, browR: 0.3, snarl: 0.8 * env(k), tilt: 0.2 }),
        body: (k, t) => ({ jaw: 0.25 * env(k), head: { roll: -0.15 * env(k), yaw: -0.15 * env(k) },
            armR: { rot: { sx: 2.05 * env(k, 0.2, 0.85), ab: -0.25, tw: 0.3, el: 2.2 * env(k, 0.2, 0.85), ha: 0.3 + 0.25 * osc(t, 11) * env(k, 0.3, 0.75) } } }),
        snd: [{ t: 0.85, k: 'spit' }],
    },
    scratchHorn: {
        ru: 'чешет рог', dur: 4.4, when: ['idle'], w: 1,
        face: (k, t) => ({ lid: 0.35, brow: 0.3 * env(k), snarl: 0.2, ear: -0.2 }),
        body: (k, t) => ({ head: { roll: 0.25 * env(k), yaw: 0.2 * env(k) }, armL: { rot: { sx: 2.7 * env(k, 0.2, 0.85), ab: 0.55, el: 1.9 * env(k, 0.2, 0.85), ha: 0.4 * osc(t, 10) * env(k, 0.3, 0.75) } } }),
        snd: [{ t: 0.4, k: 'scrape' }],
    },
    smokePuff: {
        ru: 'скучает и пускает кольца дыма', dur: 4.6, when: ['idle', 'sleep'], w: 1,
        face: (k) => ({ lid: 0.35, brow: -0.1, nostril: env(k, 0.3, 0.6), snarl: 0.1 }),
        body: (k) => ({ inhale: env(k, 0.3, 0.4) * 0.6, jaw: 0.15 * env(k, 0.55, 0.9), head: { pitch: 0.15 } }),
        snd: [{ t: 0.55, k: 'sigh' }], fx: [{ t: 0.6, k: 'smokeRing' }, { t: 0.75, k: 'smokeRing' }],
    },
    knuckleCrack: {
        ru: 'хрустит костяшками, глядя на вас', dur: 3.2, when: ['idle', 'intimidate'], w: 1,
        face: (k) => ({ lid: 0.7, brow: -0.8, snarl: 0.6 * env(k), pupil: 0.6, ear: -0.4 }),
        body: (k) => ({ armL: { rot: { sx: 1.3 * env(k), ab: -0.7 * env(k), el: 1.3, ha: -0.5 * env(k, 0.4, 0.6) } }, armR: { rot: { sx: 1.3 * env(k), ab: -0.7 * env(k), el: 1.3, ha: 0.6 * env(k, 0.4, 0.6) } } }),
        snd: [{ t: 0.4, k: 'crack' }, { t: 0.55, k: 'crack' }],
    },

    // ================================================================ реакции на удары (бессмертен — и знает это)
    laugh: {
        ru: 'хохочет над слабым заклинанием, брюхо трясётся', dur: 3.8, when: ['hitWeak', 'killed'], w: 2,
        face: (k, t) => ({ lid: 0.35, brow: 0.6, tilt: -0.3, snarl: 0.5, ear: 0.4, tongue: 0.2 * env(k, 0.3, 0.7) }),
        body: (k, t) => ({ jaw: (0.45 + 0.3 * Math.abs(osc(t, 11))) * env(k), shake: env(k), head: { pitch: 0.4 * env(k) },
            armL: { rot: { sx: 0.6, ab: -0.15, el: 1.4 * env(k), ha: 0 } }, armR: { rot: { sx: 0.6, ab: -0.15, el: 1.4 * env(k), ha: 0 } } }),
        snd: [{ t: 0.05, k: 'laugh' }],
    },
    scoff: {
        ru: 'презрительно фыркает и пожимает плечами', dur: 2.8, when: ['hitWeak'], w: 1.5,
        face: (k) => ({ lid: 0.5, browL: 0.8 * env(k), browR: -0.4, snarl: 0.6 * env(k), nostril: env(k, 0.2, 0.4), tilt: 0.2 }),
        body: (k) => ({ head: { roll: 0.2 * env(k), pitch: 0.2 * env(k) }, shrug: env(k, 0.3, 0.7), armL: { rot: { sx: 0.4, ab: 0.5 * env(k), tw: -0.6 * env(k), el: 1.3 * env(k), ha: 0 } }, armR: { rot: { sx: 0.4, ab: 0.5 * env(k), tw: -0.6 * env(k), el: 1.3 * env(k), ha: 0 } } }),
        snd: [{ t: 0.2, k: 'snort' }], fx: [{ t: 0.22, k: 'nostrilSmoke' }],
    },
    bask: {
        ru: 'наслаждается огнём, раскинув руки', dur: 4, when: ['hitFire'], w: 1,
        face: (k) => ({ lid: 0.1, brow: 0.5, tilt: -0.2, snarl: 0.3, nostril: 0.8 * env(k), ear: -0.5 }),
        body: (k) => ({ head: { pitch: 0.5 * env(k) }, jaw: 0.25 * env(k), armL: { rot: { sx: 0.9 * env(k), ab: 1.1 * env(k), el: 0.3, ha: -0.2 } }, armR: { rot: { sx: 0.9 * env(k), ab: 1.1 * env(k), el: 0.3, ha: -0.2 } }, heat: 1 }),
        snd: [{ t: 0.1, k: 'sigh' }],
    },
    headShake: {
        ru: 'божественное ужалило — трясёт головой, как пёс', dur: 2.4, when: ['hitDivine'], w: 1,
        face: (k, t) => ({ lid: 0.1, brow: -1, snarl: 0.9, ear: -1, nostril: 1, earL: 0.6 * osc(t, 30), earR: -0.6 * osc(t, 30) }),
        body: (k, t) => ({ head: { yaw: 0.6 * osc(t, 24) * env(k, 0.1, 0.6), roll: 0.25 * osc(t, 24, 1) * env(k, 0.1, 0.6) }, jaw: 0.3, lean: -0.3 * env(k) }),
        snd: [{ t: 0.05, k: 'roar' }],
    },

    // ================================================================ дразнит того, кто за цепью
    tongueTaunt: {
        ru: 'высовывает язык и болтает им — дразнит', dur: 3.6, when: ['taunt'], w: 2.5,
        face: (k, t) => ({ tongue: env(k, 0.15, 0.85), wag: env(k, 0.25, 0.8), lid: 0.6, lidL: 0.25, browR: 0.9, browL: -0.3, ear: 0.8, tilt: 0.3, snarl: 0.3 }),
        body: (k, t) => ({ jaw: 0.75 * env(k, 0.12, 0.88), head: { roll: 0.2 * osc(t, 5) * env(k), yaw: 0.15 * osc(t, 3), pitch: 0.1 }, shake: 0.4 * env(k, 0.3, 0.7) }),
        snd: [{ t: 0.2, k: 'blep' }, { t: 0.5, k: 'laugh' }],
    },
    lickLips: {
        ru: 'медленно облизывается, глядя на вас', dur: 2.8, when: ['taunt', 'closeLook', 'intimidate'], w: 1.5,
        face: (k) => ({ tongue: 0.55 * env(k, 0.2, 0.8), lick: Math.sin(clamp(k * 1.2) * Math.PI), lid: 0.55, brow: -0.6, pupil: 0.5, snarl: 0.2 }),
        body: (k) => ({ jaw: 0.35 * env(k, 0.15, 0.85), head: { yaw: 0.25 * Math.sin(k * Math.PI * 2), pitch: -0.05 } }),
        snd: [{ t: 0.25, k: 'lick' }],
    },
    beckon: {
        ru: 'манит пальцем: «иди сюда»', dur: 3.4, when: ['taunt'], w: 2,
        face: (k, t) => ({ lid: 0.6, browL: 0.7, browR: -0.5, snarl: 0.5, tilt: 0.2, ear: 0.3 }),
        body: (k, t) => ({ head: { roll: -0.2 * env(k) }, armR: { rot: { sx: 1.35 * env(k), ab: 0.1, tw: -0.4, el: 0.6 + 0.6 * Math.max(0, osc(t, 6)) * env(k, 0.25, 0.8), ha: -0.9 * Math.max(0, osc(t, 6)) * env(k, 0.25, 0.8) } } }),
        snd: [{ t: 0.3, k: 'chuckle' }],
    },
    chainPull: {
        ru: 'хватает цепь руками и рвёт её', dur: 4.6, when: ['taunt'], w: 1.5,
        face: (k, t) => ({ lid: 1, brow: -1, snarl: 1, ear: -1, nostril: 0.6 + 0.4 * osc(t, 9), pupil: 0.45 }),
        body: (k, t) => {
            const pull = k < 0.35 ? 0 : 0.5 + 0.5 * Math.sin((k - 0.35) * 22);
            return { lean: 0.8 * (1 - pull) * env(k), strain: pull * env(k), jaw: 0.4 + 0.4 * pull,
                armL: { rot: { sx: 0.9 - 0.7 * pull, ab: -0.4, el: 0.3 + 1.2 * pull, ha: 0.8 } }, armR: { rot: { sx: 0.9 - 0.7 * pull, ab: -0.1, el: 0.3 + 1.2 * pull, ha: 0.8 } } };
        },
        snd: [{ t: 0.4, k: 'chain' }, { t: 0.55, k: 'roar' }, { t: 0.7, k: 'chain' }],
    },

    // ================================================================ устрашение, торжество, удивление
    chestBeat: {
        ru: 'бьёт себя кулаками в грудь', dur: 3.4, when: ['intimidate'], w: 1.5,
        face: (k, t) => ({ lid: 1, brow: -1, snarl: 1, ear: -0.8, nostril: 1, pupil: 0.5 }),
        body: (k, t) => {
            const a = Math.max(0, osc(t, 9)), b = Math.max(0, osc(t, 9, Math.PI));
            return { jaw: 0.6 * env(k), head: { pitch: 0.3 * env(k) }, armL: { rot: { sx: 1.0 + 0.5 * a, ab: -0.35, el: 2.0 - 0.5 * a, ha: 0 } }, armR: { rot: { sx: 1.0 + 0.5 * b, ab: -0.35, el: 2.0 - 0.5 * b, ha: 0 } } };
        },
        snd: [{ t: 0.1, k: 'beat' }, { t: 0.3, k: 'beat' }, { t: 0.5, k: 'beat' }, { t: 0.7, k: 'roar' }],
    },
    triumph: {
        ru: 'торжествует: руки вверх, хохот', dur: 4.4, when: ['killed'], w: 1,
        face: (k, t) => ({ lid: 0.6, brow: 0.7, snarl: 0.7, ear: 0.6, tongue: 0.3 * env(k, 0.5, 0.8) }),
        body: (k, t) => ({ head: { pitch: 0.55 * env(k) }, jaw: (0.5 + 0.3 * Math.abs(osc(t, 10))) * env(k), shake: 0.6 * env(k), armL: { rot: { sx: 2.9 * env(k), ab: 0.6, el: 0.3, ha: 0.6 } }, armR: { rot: { sx: 2.9 * env(k), ab: 0.6, el: 0.3, ha: 0.6 } } }),
        snd: [{ t: 0.05, k: 'roar' }, { t: 0.4, k: 'laugh' }],
    },
    surprise: {
        ru: 'удивлён: брови вверх, отшатнулся', dur: 2.6, when: ['surprised'], w: 1,
        face: (k) => ({ lid: 1, brow: 1, tilt: 0.6, ear: 1, pupil: 1.6, snarl: 0 }),
        body: (k) => ({ lean: -0.5 * env(k, 0.1, 0.6), jaw: 0.35 * env(k, 0.1, 0.6), head: { pitch: 0.2 * env(k) }, armL: { rot: { sx: 0.9 * env(k, 0.1, 0.6), ab: 0.4, el: 1.0, ha: -0.6 } }, armR: { rot: { sx: 0.9 * env(k, 0.1, 0.6), ab: 0.4, el: 1.0, ha: -0.6 } } }),
        snd: [{ t: 0.05, k: 'snort' }],
    },
    sighSit: {
        ru: 'тяжело вздыхает и садится', dur: 3.2, when: ['sitDown'], w: 1,
        face: (k) => ({ lid: 0.6 - 0.3 * k, brow: 0.2, tilt: 0.3, ear: -0.5 }),
        body: (k) => ({ inhale: env(k, 0.3, 0.4), head: { pitch: -0.2 * k }, breath: 1 }),
        snd: [{ t: 0.35, k: 'sigh' }], fx: [{ t: 0.5, k: 'nostrilSmoke' }],
    },
    sniffClose: {
        ru: 'наклоняется и обнюхивает того, кто рядом', dur: 3.6, when: ['closeLook'], w: 1,
        face: (k, t) => ({ lid: 0.4, brow: -0.7, nostril: 0.5 + 0.5 * Math.max(0, osc(t, 16)), ear: 0.8, pupil: 0.5 }),
        body: (k) => ({ lean: env(k, 0.3, 0.7), head: { pitch: -0.45 * env(k, 0.3, 0.7) } }),
        snd: [{ t: 0.35, k: 'sniff' }, { t: 0.55, k: 'sniff' }, { t: 0.75, k: 'chuckle' }],
    },
};
/** Порядок для сети (только дописывать в конец). */
export const ACT_IDS = ['snoreDeep', 'earFlick', 'sleepScratch', 'sleepMumble', 'wakeOneEye', 'yawn', 'stretch', 'sniffAir', 'lookAround', 'pickTeeth', 'scratchHorn',
    'smokePuff', 'knuckleCrack', 'laugh', 'scoff', 'bask', 'headShake', 'tongueTaunt', 'lickLips', 'beckon', 'chainPull', 'chestBeat', 'triumph', 'surprise', 'sighSit', 'sniffClose'];

/** Звуки поступков (DiabolosSounds: эти виды должны быть синтезированы). */
export const ACT_SOUNDS = [...new Set(Object.values(ACTS).flatMap((a) => (a.snd || []).map((s) => s.k)))];

/**
 * Какой поступок в ситуации `sit` (детерминированно по `r` 0…1; `last` — не повторять тот же подряд, если есть другой).
 * → id или null.
 */
export function pickAct(sit, r, last = null) {
    let list = ACT_IDS.filter((id) => ACTS[id].when.includes(sit));
    if (list.length > 1 && last) list = list.filter((id) => id !== last);
    if (!list.length) return null;
    const sum = list.reduce((s, id) => s + (ACTS[id].w || 1), 0);
    let x = clamp(r, 0, 0.999999) * sum;
    for (const id of list) { x -= ACTS[id].w || 1; if (x < 0) return id; }
    return list[list.length - 1];
}

/** Через сколько секунд следующий поступок в ситуации (во сне — реже, когда скучает — чаще). */
export const actGap = (sit, r) => (sit === 'sleep' ? 9 + 14 * r : sit === 'idle' ? 3 + 5 * r : sit === 'taunt' ? 4 + 4 * r : 2 + 2 * r);

/** Лицо по настроению, когда поступка нет (сон, покой, гнев, натяг цепи). */
export function moodFace(mood, t) {
    switch (mood) {
        case 'sleep': return { lid: 0, brow: 0.05, ear: -0.35, nostril: 0.3 + 0.3 * Math.sin(t * 0.9), snarl: 0.05 };
        case 'calm': return { lid: 0.7, brow: -0.25, ear: 0, nostril: 0.2, pupil: 1 };
        case 'angry': return { lid: 0.95, brow: -1, snarl: 0.55 + 0.15 * Math.sin(t * 2.3), ear: -0.7, nostril: 0.5 + 0.5 * Math.max(0, Math.sin(t * 3.1)), pupil: 0.55 };
        case 'strain': return { lid: 1, brow: -1, snarl: 1, ear: -1, nostril: 1, pupil: 0.45 };
        case 'attack': return { lid: 1, brow: -0.9, snarl: 0.9, ear: -0.8, nostril: 0.9, pupil: 0.5 };
        default: return {};
    }
}

/** Мимика ходов боя (DiabolosRules.MOVES): поверх гнева. */
export function moveFace(id, k) {
    switch (id) {
        case 'fire': case 'ball': return { lid: 0.85, brow: -1, snarl: 1, nostril: 1, ear: -1, pupil: 0.4 };
        case 'roar': case 'rage': return { lid: 1, brow: -1, snarl: 1, ear: -1, nostril: 1, pupil: 0.4, tongue: 0.15 };
        case 'grab': return { lid: 1, brow: -0.6, snarl: 0.7, ear: 0.5, pupil: 0.5, lick: k > 0.5 ? 0.5 : 0, tongue: k > 0.5 ? 0.3 : 0 };
        case 'clap': return { lid: 0.6, brow: -0.8, snarl: 0.8, ear: -0.6 };
        default: return { lid: 0.9, brow: -1, snarl: 0.85, ear: -0.8, nostril: 0.8, pupil: 0.5 };
    }
}

/** Смешать два лица (поступок поверх настроения: w — вес поступка). */
export function blendFace(a, b, w) {
    const out = {};
    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        const x = a?.[key], y = b?.[key];
        out[key] = x == null ? y : y == null ? x : x + (y - x) * w;
    }
    return out;
}
