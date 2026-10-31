/**
 * PentagramFigures.js — рисунки пентаграмм «по точкам кольца»: 16 точек кольца (шаг 22,5°): вершины фигур лежат на них, чтобы рисунки были ровными и разными.
 * Точка `i` — на круге единичного радиуса, 0 — сверху, дальше против часовой стрелки (шаг 22,5°). Линия — пара точек, цепочка — ломаная.
 * Чистые данные, без THREE. Каждая пентаграмма — СВОЯ фигура (линии, а не цвет): проверяет `tests/unit/pentagram-figures.test.js`.
 */

export const RING_N = 16;
const TAU = Math.PI * 2;

/** Точка кольца `i` (единичный радиус, первая — вверху). */
export function ringPt(i) {
    const a = Math.PI / 2 + (((i % RING_N) + RING_N) % RING_N) * (TAU / RING_N);
    return [+Math.cos(a).toFixed(4), +Math.sin(a).toFixed(4)];
}

/** Открытая цепочка точек кольца → набор отрезков (каждый — свой полигон из двух точек). */
export const chain = (...ids) => ids.slice(1).map((b, k) => [ringPt(ids[k]), ringPt(b)]);
/** Замкнутый многоугольник по точкам кольца. */
export const loop = (...ids) => [ids.map(ringPt)];

/**
 * «Слом магической защиты»: разорванное кольцо — два обломка (слева внизу и справа вверху) и молния-трещина, что бьёт
 * от верхней точки через щит вниз; в звезду и квадраты других пентаграмм не похожа.
 */
export const BREAKWARD_LINES = [
    ...chain(2, 4, 6), // обломок кольца слева
    ...chain(10, 12, 14), // обломок кольца справа
    ...chain(0, 5, 11, 8), // трещина-молния сверху вниз
    ...chain(11, 13), ...chain(5, 3), // осколочные трещинки от изломов
];

/**
 * «Адские горгульи»: морда — треугольник вершиной вниз, на верхних углах два острых рога, от нижних углов вниз к вершине — крылья.
 */
export const GARGOYLE_LINES = [
    ...loop(3, 13, 8), // морда
    ...loop(3, 1, 4), ...loop(13, 15, 12), // рога
    ...chain(4, 6, 8), ...chain(12, 10, 8), // крылья
];

/**
 * «Пентаграмма объединённой силы»: два треугольника — вершиной вверх и вершиной вниз, — сливающиеся в одну фигуру,
 * и поперёк них горизонтальная черта-«шов» через центр (знак соединения двух сил в одну).
 */
export const UNITY_LINES = [
    ...loop(0, 6, 10), // треугольник вершиной вверх
    ...loop(8, 2, 14), // треугольник вершиной вниз
    ...chain(4, 12), // шов, где две силы сошлись
];

/**
 * «Колдовать без палочки» (белая): раскрытая ладонь — трапеция-ладонь, от её верхнего края к кольцу идут пять лучей-пальцев
 * (светятся ладони), а в центре ладони — маленький ромб-«искра» (источник силы без палочки).
 */
export const BARE_LINES = [
    ...loop(3, 13, 10, 6), // ладонь
    ...[[-0.78, 2], [-0.39, 1], [0, 0], [0.39, 15], [0.78, 14]].map(([x, i]) => [[x, 0.3827], ringPt(i)]), // пять пальцев от верхнего края ладони к кольцу
    [[0, 0.28], [0.2, 0], [0, -0.28], [-0.2, 0]], // искра в центре ладони (замкнутый ромб)
];

/**
 * «Пентаграмма чудовищной живучести»: капля крови — вершиной вверх — внутри чаши из двух дуг, что сходятся внизу в острие;
 * над каплей две боковые черты-«вены», уходящие к кольцу.
 */
export const VITALITY_LINES = [
    ...loop(0, 5, 7, 9, 11), // капля
    ...chain(2, 6, 8, 10, 14), // чаша под каплей
    ...chain(0, 14), ...chain(0, 2), // вены сверху к кольцу
];
// ---------------------------------------------------------------- the pentagrams of sight (white magic)
/** An open curve through `pts` ([x, y] each) → separate segments (every one its own two-point line). */
const curve = (pts) => pts.slice(1).map((q, k) => [pts[k], q]);
/** `n + 1` points of an arc of the circle (cx, cy, r) from angle `a0` to `a1` (radians, 0 = right, counter-clockwise). */
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [+(cx + Math.cos(a) * r).toFixed(4), +(cy + Math.sin(a) * r).toFixed(4)]; });
const pt = (x, y) => [+x.toFixed(4), +y.toFixed(4)];

/**
 * «Ночное зрение» (Pentagranium Noctis): a crescent moon, horns to the right, and a four-pointed star glittering in its bay —
 * an outer arc, an inner arc through the same two horn tips, and the star as a closed little figure.
 */
export const NIGHT_LINES = (() => {
    const A = pt(0.55, 0.71), B = pt(0.55, -0.71), c = 0.45, r = Math.hypot(0.55 - c, 0.71);
    const outer = arc(0, 0, 0.9, Math.atan2(0.71, 0.55), Math.PI * 2 - Math.atan2(0.71, 0.55), 18); // (the long way round, through the left)
    const a0 = Math.atan2(0.71, 0.55 - c), a1 = Math.PI * 2 - a0;
    const inner = arc(c, 0, r, a0, a1, 14).reverse(); // (from the lower horn round to the upper through the left: bulging towards the left)
    void A; void B;
    const sx = 0.52, s = 0.2, t = 0.05; // the star
    const star = [pt(sx, s), pt(sx + t, t), pt(sx + s, 0), pt(sx + t, -t), pt(sx, -s), pt(sx - t, -t), pt(sx - s, 0), pt(sx - t, t)];
    return [...curve(outer), ...curve(inner), star];
})();

/**
 * «Видение невидимых» (Pentagranium Spectris): an open eye — the almond of the lids (two arcs from corner to corner), a ring for the
 * iris, a diamond for the pupil, and five short lashes fanning over the upper lid.
 */
export const SIGHT_LINES = (() => {
    const lid = (amp) => Array.from({ length: 13 }, (_, k) => { const t = -1 + k / 6; return pt(0.95 * t, amp * Math.pow(1 - t * t, 0.8)); });
    const upper = lid(0.55), lower = lid(-0.42);
    const iris = arc(0, 0, 0.3, 0, Math.PI * 2, 14).slice(0, -1);
    const pupil = [pt(0, 0.12), pt(0.1, 0), pt(0, -0.12), pt(-0.1, 0)];
    const lashes = [-0.6, -0.3, 0, 0.3, 0.6].map((x) => [pt(x * 0.95, 0.55 * Math.pow(1 - x * x, 0.8) + 0.04), pt(x * 1.08, 0.55 * Math.pow(1 - x * x, 0.8) + 0.2)]);
    return [...curve(upper), ...curve(lower), iris, pupil, ...lashes];
})();

/**
 * «Абсолютная устойчивость» (Pentagranium Firmitas, белая): колонна на широкой плите, что вросла корнями в землю — капитель
 * с перекладиной, ствол с двумя бороздками-каннелюрами, широкое основание и три корня, уходящие к нижней части кольца.
 * Ни звезда, ни треугольник, ни капля: у других пентаграмм колонны нет.
 */
export const FIRM_LINES = (() => {
    const col = [pt(-0.17, -0.3), pt(-0.17, 0.62), pt(0.17, 0.62), pt(0.17, -0.3)]; // ствол
    const cap = [pt(-0.4, 0.62), pt(-0.4, 0.78), pt(0.4, 0.78), pt(0.4, 0.62)]; // капитель с перекладиной
    const plinth = [pt(-0.56, -0.3), pt(-0.56, -0.44), pt(0.56, -0.44), pt(0.56, -0.3)]; // плита
    const flutes = [[pt(-0.05, 0.56), pt(-0.05, -0.24)], [pt(0.05, 0.56), pt(0.05, -0.24)]]; // бороздки
    const roots = [[pt(-0.4, -0.44), ringPt(6)], [pt(0, -0.44), ringPt(8)], [pt(0.4, -0.44), ringPt(10)]]; // корни к кольцу
    return [col, cap, plinth, ...flutes, ...roots];
})();

/**
 * «Пентаграмма ада» (Pentagranium Infernum, чёрная): ВРАТА — стрельчатый проём на двух ступенях порога, внутри — язык пламени (три языка вверх), от плеч
 * проёма к кольцу загибаются два рога. Ни звезды, ни треугольника, ни колонны: свой рисунок.
 */
export const INFERNUM_LINES = (() => {
    const L = [pt(-0.42, -0.62), pt(-0.42, 0.16), pt(-0.37, 0.4), pt(-0.24, 0.58), pt(0, 0.74)];
    const gate = [...L, ...L.slice(0, -1).reverse().map(([x, y]) => pt(-x, y))]; // (the pointed arch, down both sides to the threshold)
    const steps = [[pt(-0.66, -0.62), pt(0.66, -0.62)], [pt(-0.52, -0.78), pt(0.52, -0.78)]]; // (two steps down — into the depths)
    const flame = [pt(0, 0.46), pt(0.07, 0.14), pt(0.19, 0.3), pt(0.22, -0.08), pt(0.14, -0.46), pt(-0.14, -0.46), pt(-0.22, -0.08), pt(-0.19, 0.3), pt(-0.07, 0.14)];
    const horn = (k) => curve([pt(-0.42 * k, 0.12), pt(-0.6 * k, 0.2), pt(-0.7 * k, 0.4), ringPt(k > 0 ? 2 : 14)]);
    return [...curve(gate), ...steps, flame, ...horn(1), ...horn(-1)];
})();
