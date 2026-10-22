import test from 'node:test';
import assert from 'node:assert/strict';
import { castContextLine, formatEntry } from '../../src/core/SpellLog.js';

test('a refused spell: the journal line tells the delay and where the hands and the aim were', () => {
    const ctx = castContextLine({
        lift: { left: 0.02, right: 0.4 }, raised: ['правая'], magic: true, hand: 'правая',
        poseAge: 30, poseGap: 50, fps: 41, frameMs: 6.2,
        aim: { k: 'wall', dy: -0.2, dist: 7.3, age: 120 }, mana: 87.6, held: null,
    });
    assert.match(ctx, /подняты: правая/);
    assert.match(ctx, /камера шлёт раз в 50 мс/);
    assert.match(ctx, /прицел «wall»: рука вниз 18°, точка в 7\.3 м/);
    assert.match(ctx, /мана 87/);
    const line = formatEntry({ at: new Date(2026, 9, 22, 12, 0, 0), text: 'fire', isFinal: true, meta: { lag: 1830 }, spell: 'Fire', ok: false, why: 'нет точки на земле', note: ctx });
    assert.match(line, /❌ нет точки на земле \[слово → проверка: 1830 мс\]/);
    assert.match(line, /\(подъём рук:/);
});

test('hands not seen / lowered are said plainly', () => {
    assert.match(castContextLine({}), /поза рук не видна; руки опущены; жест не активен/);
});
