/**
 * PentagramRules.js — pentagrams on the ground: the rules, pure (node-testable). The author: «рисовать пентаграммы вообще не надо» — the hero points
 * the wand at the ground and says «Pentagranium <Name>» (PentagramWords.js); the figure draws itself (Pentagranium.js). Each pentagram (`PENTAGRAMS`,
 * Pentagrams.js) has its OWN picture (figureOf / figureLines: lines, not colour) and its own scroll ({kind: 'scroll', stat: 'pentagram', pent: id}):
 * a burnt scroll teaches it (the hero's `seen` list, saved); unrolled and looked at it teaches nothing. Black magic only for the black ones.
 *
 * The rite (devil): the body of a killed WIZARD (not bones) whose power the hero has already taken (Mana.killWon / duelWon — the same body) lies
 * inside the lit pentagram. It flares with hellfire, the body sinks into ash, and the hero gets once more `RITE.K` (25 %) of the killed wizard's
 * power ((his maximum − 30), the same formula as a kill — Mana.killGain). Once per body (`b.rit`).
 *
 * ON WHOM / ON WHAT (CLAUDE.md): see PENTAGRAM_TARGETS.
 */

import { PENTAGRAMS as TABLE, registerPentagram } from './Pentagrams.js';
import { ENCHANT_PENTAGRAM } from './Enchant.js';
import { NIGHT_LINES, SIGHT_LINES, FIRM_LINES, INFERNUM_LINES } from './PentagramFigures.js';
import { INFERNUM } from './HellRules.js';

export const PENT = {
    COST: 20, // mana at once (Combat.SPELL_COST.Pentagranium)
    DRAIN: 1, // mana a second while drawing
    R: 3.5, // m: EVERY pentagram has this one size (the author: «все пентаграммы одного размера»): the hero is 3.5 m, a body lies inside
    DRAW_T: 2.8, // s: the figure draws itself this long (a tip of light runs round the ring and along its lines), then it fades in
    LIFE: 480, // s of game time a pentagram stays lit (8 minutes) if no rite is made
    R_MIN: 3, R_MAX: 8, // m: the circle's radius that counts (the author: 3…8; the hero is ~3.5 m, a body lies ~3.5 m long)
    MAX_PTS: 640, // pieces of the drawing's light trail (one preallocated ribbon)
    REACH: 28, // m: the wand's ray looks for the ground this far
    MAX_ALIVE: 6, // pentagrams lit at once (the oldest goes out)
    FLOOR_DIFF: 1, // layers: the ground under the ring changed by more — the pentagram goes out
    FAR: 140, // m: farther than this a pentagram is not drawn
};

/** The rite: the share of the killed wizard's power given once more (the author: 25 %), the time of the burning. */
export const RITE = { K: 0.25, BURN: 5, EMBERS: 8, REACH_K: 0.85, SETTLE: 0.6, DARK: 1 };

/** Only the rite of the black (devil) pentagram darkens the hero (+1, DarkMagic.addDark); making a pentagram is no sin: there are good ones too (the author). */

const TAU = Math.PI * 2;

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** The lines of a table entry's drawing (closed polylines, unit radius, the first corner up) — from its `shape` (a star {n/skip}) or its `draw` list (polygons). */
function linesOf(def) {
    const S = def.shape;
    if (def.lines?.length) return def.lines.map((poly) => poly.map(([x, z]) => [x, z])); // (по точкам кольца: PentagramFigures.js)
    if (S?.star) {
        const n = S.star, skip = S.skip || 1, k = gcd(n, skip), rot = S.inverted ? Math.PI : 0, per = n / k;
        const corner = (i) => { const a = rot + Math.PI / 2 + i * (TAU / n); return [Math.cos(a), Math.sin(a)]; };
        return Array.from({ length: k }, (_, o) => Array.from({ length: per }, (_, j) => corner((o + j * skip) % n)));
    }
    // a `draw` list (circle / poly): the inner circles are sampled as polygons, the polygons as they are
    const polys = (def.draw || []).filter((d) => d.t === 'poly' || (d.t === 'circle' && d.r < 0.99)).map((d) => (d.t === 'poly' ? d.pts.map(([x, z]) => [x, -z]) : Array.from({ length: 28 }, (_, i) => [Math.cos((i / 28) * TAU) * d.r, Math.sin((i / 28) * TAU) * d.r])));
    return polys.length ? polys : null;
}

/** The figures of the shared table (Pentagrams.js: the other sessions' pentagrams too) that have a drawing, with what the picture, the scroll and the codex need. */
const _figs = new Map();
export function figureOf(id) {
    const def = TABLE[id];
    if (!def) return null;
    let f = _figs.get(id);
    if (f && f.def === def) return f;
    const lines = linesOf(def);
    if (!lines) return null;
    const star = def.shape?.star;
    f = {
        def, id, lines,
        ru: def.title || def.ru || id,
        ink: def.glow ?? 0xc01830, paper: 0x2a1418, seal: 0x7a0d18,
        figure: star ? (def.shape.inverted ? `перевёрнутая ${star === 5 ? 'пятиконечная' : star}-лучевая звезда` : star === 5 ? 'пятиконечная звезда' : `${star}-лучевая звезда`) : def.lines ? 'фигура по точкам кольца' : 'фигура со свитка',
        works: true,
    };
    _figs.set(id, f);
    return f;
}
/** Ids of all the pentagrams that can be drawn. */
export const figureIds = () => Object.keys(TABLE).filter((id) => figureOf(id));
/** The figure's lines turned by `a` in the (x, z) plane: (the figure's own turn on the ground). */
export function figureLines(id, a = 0) {
    const f = figureOf(id) || figureOf('devil');
    const ca = Math.cos(a), sa = Math.sin(a);
    return f.lines.map((poly) => poly.map(([x, z]) => [x * ca - z * sa, x * sa + z * ca]));
}

// The good pentagrams the author asked for (PentagramUse.js: what standing on them does). `permanent`: drawn once, they stay on the ground for good (saved, at most USE.PERM_MAX).
const sq = Math.SQRT1_2;
registerPentagram({
    id: 'teleport', title: 'Пентаграмма телепортации', dark: false, glow: 0xcfe8ff, cost: 50, permanent: true, scroll: 'PentagramTeleport',
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, z]) => [x * 0.999, z * 0.999]) }, { t: 'circle', r: 0.3 }], // (a square set in the circle by its corners, a small circle inside it that touches nothing)
    effect: 'Встаньте на неё, постойте 3 секунды и заплатите 50 маны — вы окажетесь на парной пентаграмме телепортации, где бы она ни была. Нужны две такие пентаграммы.',
});
registerPentagram({
    id: 'life', title: 'Пентаграмма жизни', dark: false, glow: 0x9be88a, cost: 50, permanent: true, scroll: 'PentagramLife',
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[0, 0.7], [0, -0.7]] }, { t: 'poly', pts: [[0, 0.05], [-0.6, -0.5], [-0.5, 0.2]] }, { t: 'poly', pts: [[0, -0.2], [0.6, 0.35], [0.5, -0.4]] }], // (a sprout: a stem and two leaves)
    effect: 'Встаньте на неё и заплатите 50 маны — здоровье вернётся целиком, кровь перестанет течь. Пользоваться можно сколько угодно раз.',
});
registerPentagram({
    id: 'mend', title: 'Пентаграмма починки брони', dark: false, glow: 0xdfe6f0, cost: 'MEND_COST', permanent: true, scroll: 'PentagramMend',
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[-0.55, 0.6], [0.55, 0.6], [0.55, -0.05], [0, -0.75], [-0.55, -0.05]] }], // (a shield)
    effect: 'Встаньте на неё — броня, которая на вас, будет починена. Плата за каждую часть своя; на что не хватило маны, то останется как было.',
});

// The pentagrams of sight (SightRules.js, SecondSight.js): drawn once, they stay; stand in the circle — a gift for good (until death).
registerPentagram({
    id: 'night', title: 'Пентаграмма ночного зрения', dark: false, glow: 0x9fb4ff, cost: 50, permanent: true, scroll: 'PentagramNight', lines: NIGHT_LINES,
    effect: 'Встаньте в круг и заплатите 50 маны — вы навсегда (до смерти) станете видеть в темноте на 50 % лучше: и ночью, и в пещерах.',
});
registerPentagram({
    id: 'sight', title: 'Пентаграмма видения невидимых', dark: false, glow: 0xff7ad9, cost: 150, permanent: true, scroll: 'PentagramSight', lines: SIGHT_LINES,
    effect: 'Встаньте в круг с пером птички Спенсера (или травой Беслана) и заплатите 150 маны — вы навсегда (до смерти) начнёте видеть всё невидимое.',
});

// «Абсолютная устойчивость» (FirmRules.js, Firmitas.js): a gift for good (until death); costs 300 mana and a magic pebble (a swamp canary's) lying on the circle.
registerPentagram({
    id: 'firm', title: 'Пентаграмма абсолютной устойчивости', dark: false, glow: 0xf0b25a, cost: 300, permanent: true, scroll: 'PentagramFirm', lines: FIRM_LINES,
    effect: 'Положите на круг волшебный камушек, встаньте в него и заплатите 300 маны — вас навсегда (до смерти) больше не повалит ни ветер, ни заклинание, ни падение с любой высоты.',
});

// «Пентаграмма ада» (HellRules.js, HellGate.js): чёрная; 150 маны и +10 к тьме при слове, жертва — одно тело любого убитого существа, шаг в открытый круг — в ад.
registerPentagram({
    id: 'infernum', title: 'Пентаграмма ада', dark: true, glow: 0xff3010, cost: INFERNUM.COST, darkBonus: INFERNUM.DARK, once: false, scroll: 'PentagramInfernum', lines: INFERNUM_LINES,
    effect: 'Открывает врата в ад. Положите на круг тело любого убитого существа — оно сгорит, врата откроются, и, постояв в круге, вы окажетесь в аду. Чтобы вернуться, положите на метку в аду голову горгульи.',
});

registerPentagram({ ...ENCHANT_PENTAGRAM, title: ENCHANT_PENTAGRAM.ru }); // (the enchanting pentagram of the other session: its circle is laid by EnchantCircles — Pentagranium._others)

// «Пентаграмма дьявольской силы» — the one this module owns (its rite is below); the others' entries come from their own modules (Breakward, Gargoyles, Enchant…).
registerPentagram({
    id: 'devil', title: 'Пентаграмма дьявольской силы', dark: true, glow: 0xc01830, cost: 0, once: false, scroll: 'PentagramDevil',
    shape: { ring: 1, star: 5, skip: 2 }, rite: { cost: 50 }, // (the rite takes 50 mana: laid on the pentagram, nothing is said)
    effect: 'Положите на горящую пентаграмму тело убитого вами волшебника (силу его вы уже забрали) — и получите ещё 25% его силы. Одно тело — один раз.',
});

/** A drawing-scroll with this figure. */
export const pentagramScroll = (id, uid) => ({ kind: 'scroll', uid, stat: 'pentagram', pent: figureOf(id) ? id : 'devil', dark: !!TABLE[figureOf(id) ? id : 'devil']?.dark });
export const isPentagramScroll = (it) => !!it && it.kind === 'scroll' && it.stat === 'pentagram';

/**
 * The mana taken at the word (the author: «в этот момент снимается мана»). Others take theirs where the effect itself pays: the gargoyles' ritual
 * (150, when it starts), the enchanting rite (30 % of the current mana when the thing is laid), the devil rite (50, over the body), mending (by pieces).
 */
export const CAST_COST = { teleport: 50, life: 50, monster: 200, breakward: 50, unity: 120, vitality: 250, infernum: INFERNUM.COST };

/** The figure's turn so that its apex points away from the hero standing at (hx, hz) (it reads upright from where he stands). */
export const turnAway = (cx, cz, hx, hz) => { const dx = cx - hx, dz = cz - hz, d = Math.hypot(dx, dz) || 1; return Math.atan2(-dx / d, dz / d); };

// ---------------------------------------------------------------- the scrolls and what the hero has seen

/** The set of the figures the hero has unrolled and looked at (saved). */
export class Seen {
    constructor() { this.set = new Set(); }
    add(id) { if (!figureOf(id) || this.set.has(id)) return false; this.set.add(id); return true; }
    has(id) { return this.set.has(id); }
    snapshot() { return [...this.set]; }
    restore(list) { this.set = new Set((Array.isArray(list) ? list : []).filter((k) => figureOf(k))); }
    clear() { this.set.clear(); }
}

// ---------------------------------------------------------------- the rite

/**
 * May this body be laid on the pentagram `pent` for the rite? Pure.
 * `b`: a Death body ({k, mm, wz, rit, lg, bones?, who}); `took`: has the hero already taken this body's power
 * (Mana.duelsWon.get(who) === 'kill'); `free`: Creative (no mana rules).
 * @returns {{ok: boolean, why?: string}} why: 'bones' | 'player' | 'legacy' | 'no-power' | 'done' | 'not-taken' | 'blank'
 */
export function riteBody(b, pent = 'devil', { took = false, free = false } = {}) {
    if (pent !== 'devil') return { ok: false, why: 'blank' }; // (the rite is this pentagram's; the others' effects are their own modules')
    if (!b) return { ok: false, why: 'no-power' };
    if (b.rit) return { ok: false, why: 'done' };
    if (b.bones || b.stage === 'bones') return { ok: false, why: 'bones' };
    if (b.lg) return { ok: false, why: 'legacy' }; // (a hero's body holding his own power: only he can take it, by his own spell)
    if (b.k === 'p') return { ok: false, why: 'player' }; // (another player: the power of a hero is his own, Legacy.js)
    if (!b.wz || !(b.mm > 0)) return { ok: false, why: 'no-power' }; // (people, knights, animals: no magic in them)
    if (!free && !took) return { ok: false, why: 'not-taken' };
    return { ok: true };
}

/** Text for the refusals of the rite (the action asks — the body is on the pentagram). */
export const RITE_HINT = {
    bones: '🩸 Кости не подходят — нужно тело убитого волшебника',
    player: '🩸 Сила героя принадлежит только ему самому — на чужом теле обряд не идёт',
    legacy: '🩸 В этом теле лежит сила самого героя — обряд над ним не нужен',
    'no-power': '🩸 В теле нет магической силы',
    done: '🩸 Эта сила уже отдана обряду — второй раз тело ничего не даст',
    'not-taken': '🩸 Сначала заберите силу волшебника (победой в дуэли или убив его) — потом тело ляжет на пентаграмму',
    blank: '🩸 Эта пентаграмма пока ничего не делает — вид есть, эффект позже',
};

/** The extra power of the rite: `RITE.K` of (the killed wizard's maximum − 30), at least 1. */
export function riteGain(oppMax, base = 30) {
    const n = Math.round(RITE.K * ((Number(oppMax) || base) - base));
    return Math.max(1, n);
}

// ---------------------------------------------------------------- where it is

/** The point (x, z) is inside the pentagram's circle (scaled by `k`). */
export const inside = (pg, x, z, k = 1) => Math.hypot(x - pg.x, z - pg.z) <= pg.r * k;

/** Is a pentagram a spell target (CLAUDE.md)? The pentagram is a mark on the ground, not a creature or a thing. */
export const PENTAGRAM_TARGETS = {
    me: { does: 'none', why: 'колдующего не задевает: пентаграмма — след на земле, не удар' },
    players: { does: 'none', why: 'других игроков не трогает; они видят пентаграмму и ритуал (сообщения pgm / pgr)' },
    zombies: { does: 'none', why: 'зомби её не боятся и не топчут: это светящийся рисунок, не препятствие' },
    castlePeople: { does: 'alarm', why: 'жители, увидев чёрную магию (круг и звезда), пугаются как от опасной магии — castleLife.alarm(pos, "dark")' },
    animals: { does: 'none', why: 'животные её не замечают' },
    sailors: { does: 'none', why: 'на палубе пентаграмма не рисуется: корабль — не земля (ships.footprintAt)' },
    spider: { does: 'none', why: 'не задевает' },
    livingTrees: { does: 'none', why: 'не задевает' },
    bookBirds: { does: 'none', why: 'не задевает' },
    iceCastle: { does: 'none', why: 'на льду Королевы рисунок не держится: лёд — не земля для чёрной магии; Королеву не задевает' },
    blackship: { does: 'none', why: 'в море нет земли; сам корабль заклинанием не повреждается' },
    dragon: { does: 'none', why: 'дракон не замечает; огонь ритуала дракона не жжёт' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    canary: { does: 'none', why: 'не касается' },
    spencer: { does: 'none', why: 'не касается' },
    ghost: { does: 'none', why: 'не касается: призрак бестелесный' },
    custom: { does: 'none', why: 'не касается' },
    bodies: { does: 'rite', why: 'тело убитого волшебника (не кости), с которого герой забрал силу, на пентаграмме сгорает в пепел: +25 % силы убитого, один раз на тело; на пентаграмме горгулий 3 тела убитых человекоподобных, на пентаграмме монстра рог Минотавра и 1 тело сгорают в тёмном пламени перед ритуалом (PentagramOfferings.js, вне Творческого)' },
    items: { does: 'none', why: 'вещи на земле не трогает' },
    blocks: { does: 'none', why: 'блоков не ломает; если земля под рисунком изменилась — пентаграмма гаснет' },
    water: { does: 'none', why: 'на воде не рисуется (луч палочки не находит земли)' },
    ground: { does: 'mark', why: 'цель — земля под палочкой: там сама рисуется пентаграмма (круг и её линии)' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не рисуется (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'на дарах богов и в их храме не рисуется — защита сильнее' },
    enchanted: { does: 'none', why: 'на заколдованном камне (арены, башни волшебников) рисунок не держится' },
    space: { does: 'none', why: 'в космосе нет земли; на планетах — только там, где есть твёрдая земля (рисунок как на Земле)' },
    spells: { does: 'none', why: 'пентаграмма — не преграда; заряды дуэли и лучи идут сквозь неё' },
};
