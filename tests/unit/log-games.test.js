// Журналы по играм: разбиение, кусок для копирования, старый формат, запасной путь копирования.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitGames, gameText, gameTitle, frameStart, durationLabel, copyText, RULE } from '../../src/core/LogGames.js';

const H1 = '=== игра началась 01.11.2026, 12:37:28 — журнал заклинаний: что услышано';
const H2 = '=== игра началась 01.11.2026, 14:00:00 — журнал заклинаний: что услышано';

test('старый формат: строка «игра началась» делит журнал на игры', () => {
    const t = [H1, '12:37:30 Люмос → ✅', '12:40:00 Нокс → ✅', H2, '14:00:05 Акцио → ❌'].join('\n');
    const p = splitGames(t);
    assert.equal(p.games.length, 2);
    assert.equal(gameText(p, p.games[0]), [H1, '12:37:30 Люмос → ✅', '12:40:00 Нокс → ✅'].join('\n'));
    assert.equal(gameText(p, p.games[1]), [H2, '14:00:05 Акцио → ❌'].join('\n'));
    assert.equal(p.games[0].lineCount, 3);
    assert.equal(p.games[0].durationMs, 150000);
    assert.equal(new Date(p.games[0].startedAt).getHours(), 12);
});

test('рамка из ═══ и пустые строки: рамка принадлежит своей игре, пропуски — нет', () => {
    const t = ['старое', frameStart(H1), '12:37:30 a', frameStart(H2), '14:00:05 b'].join('');
    const p = splitGames(t);
    assert.equal(p.games.length, 3, 'кусок до первой игры — отдельный');
    assert.equal(p.games[0].head, '');
    assert.ok(gameText(p, p.games[1]).startsWith(RULE));
    assert.ok(gameText(p, p.games[1]).includes(H1) && gameText(p, p.games[1]).includes('12:37:30 a'));
    assert.ok(!gameText(p, p.games[1]).includes(H2), 'чужая игра не попадает');
    assert.ok(!/\n$/.test(gameText(p, p.games[1])), 'пустые строки перед следующей рамкой не в игре');
});

test('дневник производительности («=== старт») и строка с временем и меткой (Общие логи)', () => {
    const t = ['12:00:00 === старт 01.11.2026, 12:00:00 | режим creative | видеокарта: X', '12:00:05 FPS 60',
        '12:30:00.123 · [Заклинания] ' + H2, '12:30:01.000 · [Руки] правая'].join('\n');
    const p = splitGames(t);
    assert.equal(p.games.length, 2);
    assert.equal(p.games[0].mode, 'Творческий');
    assert.match(gameTitle(p.games[1], 2), /Игра 2 из 2/);
});

test('пусто, один журнал без игр, очень длинный журнал', () => {
    assert.equal(splitGames('').games.length, 0);
    assert.equal(splitGames(null).games.length, 0);
    assert.equal(splitGames('просто текст').games.length, 1);
    const big = [H1, ...Array.from({ length: 200000 }, (_, i) => `12:00:00 строка ${i}`), H2, 'x'].join('\n');
    const t0 = Date.now();
    const p = splitGames(big);
    assert.equal(p.games.length, 2);
    assert.ok(Date.now() - t0 < 500, 'разбиение быстрое');
});

test('длительность', () => {
    assert.equal(durationLabel(45000), '45 с');
    assert.equal(durationLabel(723000), '12 мин 03 с');
    assert.equal(durationLabel(3900000), '1 ч 05 мин');
    assert.equal(durationLabel(null), '');
});

test('копирование: буфер запрещён → запасной путь через скрытое поле; совсем нельзя → false', async () => {
    const made = [];
    const doc = { createElement: () => { const e = { style: {}, setAttribute() {}, select() {}, remove() { made.push('rm'); } }; made.push(e); return e; }, body: { appendChild() {} }, execCommand: (c) => c === 'copy' };
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, configurable: true });
    assert.equal(await copyText(doc, 'abc'), true);
    assert.equal(made[0].value, 'abc');
    doc.execCommand = () => { throw new Error('no'); };
    assert.equal(await copyText(doc, 'abc'), false);
});
