// У каждой пентаграммы — СВОЙ рисунок (фигура, а не цвет): попарно разные, ни одна не лежит целиком в другой (с учётом поворота кольца),
// Новая пентаграмма без уникального рисунка роняет этот тест.
import test from 'node:test';
import assert from 'node:assert/strict';
import { figureIds, figureLines, figureOf } from '../../src/game/PentagramRules.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { ringPt, RING_N, BREAKWARD_LINES, GARGOYLE_LINES } from '../../src/game/PentagramFigures.js';

const EPS = 0.03;
/** Отрезки фигуры (замкнутые многоугольники — по рёбрам, двухточечные — один отрезок), повёрнутой на `a`. */
function segs(id, a) {
    const out = [];
    for (const poly of figureLines(id, a)) {
        if (poly.length === 2) out.push([poly[0], poly[1]]);
        else for (let k = 0; k < poly.length; k++) out.push([poly[k], poly[(k + 1) % poly.length]]);
    }
    return out;
}
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < EPS;
const same = (s, t) => (near(s[0], t[0]) && near(s[1], t[1])) || (near(s[0], t[1]) && near(s[1], t[0]));
/** Все отрезки A есть среди отрезков B? */
const within = (A, B) => A.every((s) => B.some((t) => same(s, t)));
const ANGLES = Array.from({ length: 240 }, (_, i) => (i * Math.PI * 2) / 240); // (шаг 1,5°: и ручной поворот, и точки кольца)

test('у каждой пентаграммы из реестра есть рисунок', () => {
    for (const id of Object.keys(PENTAGRAMS)) assert.ok(figureOf(id), `у «${id}» нет рисунка`);
    assert.ok(figureIds().length >= 8, 'ожидалось не меньше 8 пентаграмм');
});

test('рисунки попарно различны и ни один не лежит целиком в другом (при любом повороте)', () => {
    const ids = figureIds();
    for (const a of ids) {
        const A = segs(a, 0);
        for (const b of ids) {
            if (a === b) continue;
            for (const ang of ANGLES) {
                const B = segs(b, ang);
                assert.ok(!within(A, B), `рисунок «${a}» целиком лежит в «${b}» (поворот ${((ang * 180) / Math.PI).toFixed(1)}°) — у каждой пентаграммы должна быть своя фигура`);
            }
        }
    }
});

test('классическая звезда — только у дьявольской силы', () => {
    const star = figureOf('devil').def.shape;
    assert.equal(star.star, 5);
    for (const id of figureIds()) if (id !== 'devil') assert.ok(!(figureOf(id).def.shape?.star === 5 && figureOf(id).def.shape.skip === 2), `у «${id}» такая же пятиконечная звезда`);
});

test('«Слом защиты» и «Горгульи» — по точкам кольца из 16', () => {
    assert.equal(RING_N, 16);
    const ring = Array.from({ length: RING_N }, (_, i) => ringPt(i));
    for (const lines of [BREAKWARD_LINES, GARGOYLE_LINES]) for (const poly of lines) for (const p of poly) assert.ok(ring.some((r) => near(r, p)), 'вершина не на точке кольца');
});
