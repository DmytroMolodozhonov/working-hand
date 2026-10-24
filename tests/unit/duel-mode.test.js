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

test('поражение в режиме дуэлей: надпись и окно через 5 секунд; потерянная палочка возвращается в руку', () => {
    const calls = [];
    const inv = { held: new Set(), hasUid: (u) => inv.held.has(u) };
    const items = { wand: null, loose: new Map([['w1', {}]]), removeLoose: (u) => calls.push('rm:' + u), spawnLoose: (it) => calls.push('spawn:' + it.uid), pickUp: (u, id, side) => calls.push(`pick:${u}:${id}:${side}`) };
    const g = { localId: 'me', items, inventory: inv, character: { group: { position: { x: 0, y: 0, z: 0 } } } };
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: g, list: new Map(), mode: { arenaId: 'a', id: 'me', wand: { kind: 'wand', uid: 'w1' } } });
    let shown = null;
    D.endUi = { showWin: (s, lost) => { shown = [s, lost]; }, hide() {}, hideBox() {} };
    D._wandBack();
    assert.deepEqual(calls, ['rm:w1', 'spawn:w1', 'pick:w1:me:right']);
    items.wand = { kind: 'wand', uid: 'w2' }; inv.held.add('w2'); // (he has one: it is remembered, nothing given)
    calls.length = 0; D._wandBack();
    assert.equal(D.mode.wand.uid, 'w2'); assert.deepEqual(calls, []);
    items.wand = { kind: 'wand', uid: 'sp', spare: true }; inv.held.delete('w2'); // (lost: a plain stand-in in the hand — the own one is given back, the stand-in is not remembered)
    calls.length = 0; D._wandBack();
    assert.equal(D.mode.wand.uid, 'w2'); assert.deepEqual(calls, ['spawn:w2', 'pick:w2:me:right']);
    D._modeWin(true);
    assert.equal(shown[1], true); assert.equal(D.mode.askAfter, 5); assert.equal(D.mode.lost, true);
});

import { duelReport } from '../../src/game/DuelReport.js';

test('дуэльный журнал: соперник, силы, палочки, столкновения и причина победы; убийство в режиме — «тихое»', () => {
    const foe = { name: 'Альфред', rank: 'adept', mana: 90, maxMana: 100, hp: 20, maxHp: 20, skill: 1, power: 2.08, wandK: 1.4, wand: { power: 30, fav: 'Stupefy' } };
    const hero = { mana: 200, maxMana: 200, hp: 20, maxHp: 20, setPower: 2, power: 2, wandK: 1.15, wand: { power: 0 }, creative: true };
    const s = duelReport.start({ foe, hero });
    assert.match(s, /Альфред/); assert.match(s, /продвинутый/); assert.match(s, /вы задали 2/); assert.match(s, /не зависит от вашей маны/);
    const row = { mySpell: 'Stupefy', foeSpell: 'Jolt', secs: 6, myPush: 2.3, foePush: 2.9, myContact: 0.5, foeContact: 1, share: 0, lost: 'me' };
    assert.match(duelReport.clash(row), /Уступили вы/);
    const e = duelReport.end({ who: 'a', why: 'wand', secs: 40, casts: { me: { Stupefy: 3 }, foe: { Jolt: 2 } }, clashes: [row], foe, hero });
    assert.match(e, /победил соперник/); assert.match(e, /Stupefy ×3/); assert.match(e, /Проигранных столкновений: 1/); assert.match(e, /рука сходила с него — 1/);
    const D = Object.assign(Object.create(ArenaDuels.prototype), { mode: { arenaId: 'a', id: 'me' } });
    assert.equal(D.quietKill({ arena: { id: 'a' } }, 'me'), true);
    assert.equal(D.quietKill({ arena: { id: 'a' } }, 'other'), false);
    assert.equal(D.quietKill({}, 'me'), false);
});
