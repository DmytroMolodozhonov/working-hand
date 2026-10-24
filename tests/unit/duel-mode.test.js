/**
 * Режим «Перед дуэлью» (старт в Творческом): большая арена, зрители не нападают, окно после победы.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { ARENA, ARENA_BIG, onArenaFloor } from '../../src/world/DuelArenas.js';
import { DUEL } from '../../src/game/Duel.js';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';
import { AGAIN_AFTER } from '../../src/ui/DuelEndUi.js';

const floorArea = (A) => Math.PI * A.W * A.W + 4 * A.W * A.S;

test('большая арена: пол в ~2,5 раза больше, метки в пределах дальности заряда, стол распорядителя на ровной земле', () => {
    const k = floorArea(ARENA_BIG) / floorArea(ARENA);
    assert.ok(k > 2.2 && k < 2.8, `площадь ×${k.toFixed(2)}`);
    assert.ok(2 * ARENA_BIG.MARK < DUEL.RANGE, 'метки дальше заряда');
    const out = ARENA_BIG.S + ARENA_BIG.W + ARENA_BIG.TIERS * ARENA_BIG.STEP; // (the stands' end along the axis)
    assert.ok(out + 5 < ARENA_BIG.ZONE, `стол распорядителя ${out + 5} м за ровной землёй ${ARENA_BIG.ZONE}`);
    assert.equal(ARENA.W, 13); // (ordinary worlds keep their arena)
});

test('мир с режимом дуэлей строит большую арену, обычный — прежнюю', () => {
    const mk = (bigArena) => {
        const t = new TerrainData();
        t.generate({ seed: 7, mountains: true, seas: true, lush: true, deepCaves: true, bigArena });
        for (const tw of t.towers.near(0, 0, 2000)) { const a = t.sites.arenas.ofTower(tw); if (a) return a; }
        return null;
    };
    const big = mk(true), old = mk(false);
    if (!big || !old) return; // (no room for an arena in this seed's tower cell)
    assert.ok(big.axis.r > old.axis.r);
    const m = big.gates[0].mark, o = big.gates[1].mark;
    assert.ok(Math.hypot(m.x - o.x, m.z - o.z) < DUEL.RANGE);
    assert.ok(onArenaFloor(big, m.x, m.z, 0.4) && onArenaFloor(big, o.x, o.z, 0.4));
});

test('зрители в режиме дуэлей только болеют: не боятся и не нападают, смертельное — победа без мстителей', () => {
    const g = { localId: 'me', character: {}, world: {}, hud: {}, castleLife: {}, sync: null };
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: g, list: new Map(), log: { push() {} }, mode: null });
    const A = { id: 'ar1', def: {}, duel: { a: { id: 'w1' }, p: 'me', phase: 'fight' }, fans: new Set() };
    D.list.set('ar1', A);
    const fan = { id: 'f1', arena: { id: 'ar1', kind: 'fan' } };
    assert.equal(D.calm(fan, 'me'), true); // (a duel in progress)
    A.duel = null;
    assert.equal(D.calm(fan, 'me'), false); // (no mode: an empty arena minds nothing special)
    D.mode = { arenaId: 'ar1', id: 'me' };
    assert.equal(D.calm(fan, 'me'), true); // (the mode: always calm about the hero)
    // убил соперника «Авадой»: победа, без «нарушения»
    const foe = { id: 'w1', arena: { id: 'ar1', kind: 'duel' } };
    A.duel = { a: foe, b: null, p: 'me', phase: 'fight', t: 0, go: 0 };
    let ended = null;
    D._end = (a, d, who, why) => { ended = [who, why]; };
    D._foul = () => { throw new Error('foul in the duel mode'); };
    assert.equal(D.onHit(foe, 'me', true, { kind: 'AvadaKedavra' }), true);
    assert.deepEqual(ended, ['p', 'kill']);
});

test('после победы окно «Хотите повторить дуэль?» — через 10 секунд, режим ждёт выбора', () => {
    assert.equal(AGAIN_AFTER, 10);
    const g = { localId: 'me', character: {}, world: {}, hud: {} };
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: g, list: new Map(), log: { push() {} }, mode: null });
    let shown = null;
    D.endUi = { showWin: (s) => { shown = s; }, hide() {}, hideBox() {}, showAgain() {} };
    D.mode = { arenaId: 'ar1', id: 'me', foe: 'mid' };
    D._modeWin();
    assert.ok(shown && D.mode.hold === true && D.mode.winT === 0);
});
