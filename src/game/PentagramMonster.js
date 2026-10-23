/**
 * PentagramMonster.js — «Пентаграмма страшного монстра»: строка таблицы пентаграмм, её рисунок и как его узнают
 * (pure, no THREE, node-testable). Игровая часть рисования — MonsterCircle.js, превращение — MonsterTransform.js.
 *
 * Рисунок (отличим от звезды дьявольской силы, телепортации, жизни, брони, горгулий): КРУГ, а поперёк него —
 * ПАСТЬ: зубчатая черта из конца в конец (четыре клыка вниз, между ними — вверх), над ней — ГЛАЗ: короткая черта
 * с точкой-зрачком нет — только пасть: её легко нарисовать палочкой по земле и не спутать (у звёзд — прямые
 * лучи из вершин, у пасти — частые зубцы поперёк). Узнаётся облаком точек ($P: порядок черт и направление не важны),
 * при любом повороте (рисуют с любой стороны), любого размера (1,2–5 м в радиусе).
 *
 * Как у всех пентаграмм автора: учится только сожжением свитка («Инферно»; без выученного рисунка не засчитывается),
 * чёрная (`dark: true`: +1 к уровню тьмы за каждое использование — MonsterTransform.begin → addDark(hero, 1, 'ritual')),
 * вид — багрово-чёрный. Встал в нарисованный круг — 200 маны — превращение.
 */

export const MONSTER_PENTAGRAM = {
    id: 'monster',
    ru: 'Пентаграмма страшного монстра',
    dark: true,
    glow: [0xb3121e, 0x2a0306], // багровое свечение · чёрный ожог по краю
    cost: 200,
    learn: 'scroll',          // только со свитка (сжечь «Инферно»); Творческий — известна
    scroll: { kind: 'scroll', stat: 'pentagram', pentagram: 'monster', dark: true },
    key: 'PentagramMonster',  // как хранится выученное (g.bonus.spells — смерть забирает, Legacy возвращает)
    how: 'круг на земле концом палочки, поперёк — зубчатая пасть (четыре клыка); встать в круг',
};

/** (Таблица PENTAGRAMS соседних сессий) — добавить эту строку, когда таблица есть. */
export function registerPentagram(table) {
    if (Array.isArray(table)) { if (!table.some((p) => p.id === MONSTER_PENTAGRAM.id)) table.push(MONSTER_PENTAGRAM); }
    else if (table && typeof table === 'object') table[MONSTER_PENTAGRAM.id] = MONSTER_PENTAGRAM;
    return table;
}

// ------------------------------------------------------------------ образцы (черты в единицах круга радиуса 1)

const circle = (n = 40, r = 1) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
const poly = (pts) => pts.map(([x, y]) => [x, y]);
const star = (k = 5, inv = false) => {
    const v = Array.from({ length: k }, (_, i) => { const a = (inv ? -Math.PI / 2 : Math.PI / 2) + (i / k) * Math.PI * 2; return [Math.cos(a) * 0.95, Math.sin(a) * 0.95]; });
    const out = [];
    for (let i = 0; i <= k; i++) out.push(v[(i * 2) % k]);
    return out;
};
/** Пасть: зубчатая черта поперёк круга (клыки вниз — длинные, вверх — короткие). */
const jaw = () => poly([[-0.92, 0.12], [-0.7, -0.42], [-0.48, 0.12], [-0.24, -0.42], [0, 0.12], [0.24, -0.42], [0.48, 0.12], [0.7, -0.42], [0.92, 0.12]]);

/** Образцы: свой и «чужие» (чтобы похожее на другой рисунок не засчитывалось за пасть). */
export const TEMPLATES = {
    monster: [circle(), jaw()],
    circle: [circle()],
    star: [circle(), star(5)],
    starInv: [circle(), star(5, true)],
    cross: [circle(), [[-0.95, 0], [0.95, 0]], [[0, -0.95], [0, 0.95]]],
    line: [circle(), [[-0.95, 0], [0.95, 0]]],
    triangle: [circle(), poly([[0, 0.95], [-0.82, -0.47], [0.82, -0.47], [0, 0.95]])],
    square: [circle(), poly([[-0.67, -0.67], [0.67, -0.67], [0.67, 0.67], [-0.67, 0.67], [-0.67, -0.67]])],
    eye: [circle(), poly([[-0.8, 0], [-0.4, 0.3], [0, 0.4], [0.4, 0.3], [0.8, 0], [0.4, -0.3], [0, -0.4], [-0.4, -0.3], [-0.8, 0]])],
};

export const RECOGNIZE = {
    N: 40,          // точек в облаке
    TURNS: 18,      // поворотов (через 20°): рисуют с любой стороны
    MAX_D: 0.36,    // средняя дальность точек (в долях размера) — дальше: «не то»
    MIN_POINTS: 24,
    MIN_R: 1.0, MAX_R: 6, // м: радиус нарисованного круга
};

// ------------------------------------------------------------------ $P: облако точек

function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }

/** Черты → n точек поровну по длине (все черты одним облаком). */
export function resample(strokes, n = RECOGNIZE.N) {
    const total = strokes.reduce((a, s) => a + pathLen(s), 0);
    if (!(total > 0)) return [];
    const I = total / (n - 1), out = [];
    let D = 0;
    for (const s of strokes) {
        if (!s.length) continue;
        let prev = s[0];
        if (!out.length) out.push(prev.slice(0, 2));
        for (let i = 1; i < s.length; i++) {
            let q = s[i];
            let d = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
            while (D + d >= I && d > 0) {
                const t = (I - D) / d;
                const p = [prev[0] + t * (q[0] - prev[0]), prev[1] + t * (q[1] - prev[1])];
                out.push(p);
                prev = p; d = Math.hypot(q[0] - prev[0], q[1] - prev[1]); D = 0;
            }
            D += d; prev = q;
        }
    }
    while (out.length < n) out.push(out[out.length - 1].slice());
    return out.slice(0, n);
}

/** Середина в 0, размер 1 (по наибольшему размаху). */
export function normalize(pts) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    let s = 0;
    for (const p of pts) s = Math.max(s, Math.abs(p[0] - cx), Math.abs(p[1] - cy));
    s = s || 1;
    return pts.map((p) => [(p[0] - cx) / s, (p[1] - cy) / s]);
}

function cloudDist(a, b, start) {
    const n = a.length, used = new Uint8Array(n);
    let sum = 0, i = start;
    do {
        let best = Infinity, bi = -1;
        for (let j = 0; j < n; j++) {
            if (used[j]) continue;
            const d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]);
            if (d < best) { best = d; bi = j; }
        }
        used[bi] = 1;
        const w = 1 - ((i - start + n) % n) / n;
        sum += w * best;
        i = (i + 1) % n;
    } while (i !== start);
    return sum;
}

/** Расстояние облаков ($P greedy, в обе стороны), на точку. */
export function cloudMatch(a, b) {
    const n = a.length, step = Math.max(1, Math.floor(Math.sqrt(n)));
    let min = Infinity;
    for (let i = 0; i < n; i += step) min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i));
    return min / (n * 0.5);
}

const _tpl = new Map();
const tplCloud = (id) => { if (!_tpl.has(id)) _tpl.set(id, normalize(resample(TEMPLATES[id]))); return _tpl.get(id); };

/**
 * Что нарисовано: черты на земле — массивы [x, z] (м). @returns {{id, best, d, centre:{x,z}, r}|null}
 * id — образец, если похоже достаточно (`'monster'` — пентаграмма монстра), иначе null; d — насколько похоже.
 * Сразу целиком (тесты); в игре — по кусочку за кадр (`recognizeSteps`).
 */
export function recognize(strokes) {
    const it = recognizeSteps(strokes);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
}

/** То же по шагам: каждый `next()` — один образец при одном повороте (~0,5 мс); `value` в конце — ответ. */
export function* recognizeSteps(strokes) {
    const pts = strokes.reduce((a, s) => a + s.length, 0);
    if (pts < RECOGNIZE.MIN_POINTS) return null;
    // середина и радиус круга — по самой длинной черте (её рисуют первой и целиком)
    let cx = 0, cz = 0, n = 0;
    const ring = strokes.reduce((a, s) => (pathLen(s) > pathLen(a) ? s : a), strokes[0]);
    for (const p of ring) { cx += p[0]; cz += p[1]; n++; }
    cx /= n; cz /= n;
    let r = 0;
    for (const p of ring) r += Math.hypot(p[0] - cx, p[1] - cz);
    r /= n;
    if (r < RECOGNIZE.MIN_R || r > RECOGNIZE.MAX_R) return null;
    const cloud = normalize(resample(strokes));
    if (cloud.length < RECOGNIZE.N) return null;
    let best = null;
    for (let k = 0; k < RECOGNIZE.TURNS; k++) {
        const a = (k / RECOGNIZE.TURNS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const rot = normalize(cloud.map(([x, y]) => [x * c - y * s, x * s + y * c]));
        for (const id of Object.keys(TEMPLATES)) {
            const d = cloudMatch(rot, tplCloud(id));
            if (!best || d < best.d) best = { id, d, turn: a };
            yield k; // (~0,5 мс: один образец при одном повороте)
        }
    }
    return { id: best.d <= RECOGNIZE.MAX_D ? best.id : null, best: best.id, d: best.d, centre: { x: cx, z: cz }, r };
}

/** Образец как черты в мире (тесты, подсказка-рисунок): середина (x, z), радиус r, поворот `turn`. */
export function figureAt(id, x, z, r, turn = 0, jitter = null) {
    const c = Math.cos(turn), s = Math.sin(turn);
    return TEMPLATES[id].map((st) => st.map(([u, v]) => {
        const j = jitter ? jitter() : 0, k = jitter ? jitter() : 0;
        return [x + (u * c - v * s) * r + j, z + (u * s + v * c) * r + k];
    }));
}
