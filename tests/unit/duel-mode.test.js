/**
 * Режим «Перед дуэлью» (старт в Творческом): большая арена, зрители не нападают, окно после победы.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { ARENA, ARENA_BIG, onArenaFloor } from '../../src/world/DuelArenas.js';
import { DUEL, Duel } from '../../src/game/Duel.js';
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

test('мир с режимом дуэлей всегда строит большую арену у башни, обычный — прежнюю', () => {
    const mk = (seed, bigArena) => {
        const t = new TerrainData();
        t.generate({ seed, mountains: true, seas: true, lush: true, deepCaves: true, test: true, bigArena });
        const tw = t.towers.only();
        return tw ? t.sites.arenas.ofTower(tw) : null;
    };
    for (const seed of [1, 5, 11, 15, 22, 31, 36, 2026]) { // (seeds where the first version found no room: a mountain, a pond)
        const big = mk(seed, true);
        assert.ok(big && big.axis.r === ARENA_BIG.W, `seed ${seed}: нет большой арены`);
        const m = big.gates[0].mark, o = big.gates[1].mark;
        assert.ok(Math.hypot(m.x - o.x, m.z - o.z) < DUEL.RANGE);
        assert.ok(onArenaFloor(big, m.x, m.z, 0.4) && onArenaFloor(big, o.x, o.z, 0.4));
    }
    const old = mk(2, false);
    assert.ok(old && old.axis.r === ARENA.W);
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

import { domeOf, insideDome, domeCross, domeGeometry, isSpectator } from '../../src/game/ArenaDome.js';

test('купол над ареной: внутри пола — внутри, трибуны снаружи; заряд, идущий к зрителям, упирается в купол', () => {
    const def = { axis: { a: { x: 0, z: -15, y: 10 }, b: { x: 0, z: 15, y: 10 }, r: 23 }, floorY: 10 };
    const D = domeOf(def);
    assert.ok(insideDome(D, 0, 12, 0) && insideDome(D, 20, 12, 5));
    assert.ok(!insideDome(D, 28, 12, 0), 'ряд трибуны (27 м от оси) — снаружи'); // (the first row lies beyond the floor's edge + margin)
    assert.ok(!insideDome(D, 0, 40, 0), 'над куполом снаружи');
    // Авада с середины пола вдоль пола к зрителю на трибуне: перехвачена на коже купола (~23,4 м от оси), не у зрителя
    const c = domeCross(D, { x: 0, y: 13, z: 0 }, { x: 40, y: 13, z: 0 });
    assert.ok(c && Math.abs(c.x - 23.41) < 0.1, `перехват на ${c?.x}`);
    assert.equal(domeCross(D, { x: -5, y: 12, z: 0 }, { x: 5, y: 12, z: 3 }), null); // (two duellists' charges fly inside: untouched)
    assert.equal(domeOf({ practice: true, axis: def.axis }), null); // (a training field has none)
    const g = domeGeometry(D);
    assert.ok(g.pos.length > 300 && g.idx.length > 600);
    assert.equal(isSpectator({ arena: { kind: 'fan' } }), true);
    assert.equal(isSpectator({ arena: { kind: 'duel' } }), false);
    assert.equal(isSpectator({}), false);
});

test('столкновение лучей: рука игрока «на сопернике», если соперник — волшебник башни (раньше считалось «ни на ком» — игрок не давил)', () => {
    const wiz = { id: 'tw:3', x: 0, y: 10, z: -28, wizard: true };
    const g = { localId: 'me', remotes: new Map(), combat: { center: (o) => o.set(0, 12, 0) }, config: {} };
    const D = Object.assign(Object.create(Duel.prototype), {
        game: g, _npcWizard: (id) => (id === wiz.id ? wiz : null), _jerked: () => false,
        _myRay: (side, hand, dir) => { hand.set(0, 12, 0); return dir.set(0, 0.03, -1).normalize(); }, // the hand points at him
    });
    const r = D._contact('me', { side: 'right', spell: 'Stupefy' }, wiz.id);
    assert.equal(r.ok, true);
    D._myRay = (side, hand, dir) => { hand.set(0, 12, 0); return dir.set(1, 0, 0); }; // the hand points aside: off him
    assert.equal(D._contact('me', { side: 'right', spell: 'Stupefy' }, wiz.id).ok, false);
});
