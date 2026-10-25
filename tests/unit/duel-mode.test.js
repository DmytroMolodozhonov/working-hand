/**
 * Режим «Перед дуэлью» (старт в Творческом): большая арена, зрители не нападают, окно после победы.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { ARENA, ARENA_BIG, onArenaFloor } from '../../src/world/DuelArenas.js';
import { DUEL, Duel } from '../../src/game/Duel.js';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';
import { HeroApply } from '../../src/game/HeroApply.js';
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
    const g = { localId: 'me', character: { group: { position: { x: 1, z: 2 } } }, world: {}, hud: {} };
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
    const hero = { mana: 200, maxMana: 200, hp: 20, maxHp: 20, mastery: 40, power: 2, wandK: 1.15, wand: { power: 0 }, creative: true };
    const s = duelReport.start({ foe, hero });
    assert.match(s, /Альфред/); assert.match(s, /продвинутый/); assert.match(s, /дуэльное мастерство 40/); assert.match(s, /равны сопернику/);
    const row = { mySpell: 'Stupefy', foeSpell: 'Jolt', secs: 6, myPush: 2.3, foePush: 2.9, myContact: 0.5, foeContact: 1, share: 0, lost: 'me' };
    assert.match(duelReport.clash(row), /Уступили вы/);
    const e = duelReport.end({ who: 'a', why: 'wand', secs: 40, casts: { me: { Stupefy: 3 }, foe: { Jolt: 2 } }, clashes: [row], foe, hero });
    assert.match(e, /победил соперник/); assert.match(e, /Stupefy ×3/); assert.match(e, /Проигранных столкновений: 1/); assert.match(e, /рука сходила с него — 1/);
    const D = Object.assign(Object.create(ArenaDuels.prototype), { mode: { arenaId: 'a', id: 'me' } });
    assert.equal(D.quietKill({ arena: { id: 'a' } }, 'me'), true);
    assert.equal(D.quietKill({ arena: { id: 'a' } }, 'other'), false);
    assert.equal(D.quietKill({}, 'me'), false);
});

test('дуэль в Творческом: мана играет роль, когда «Бесконечная мана» снята; с галочкой — как раньше', () => {
    const mk = (finite, fatigue, duelPower = null) => {
        const g = { localId: 'me', config: { mode: 'creative' }, hero: { infiniteMana: !finite }, combat: { fatigue, hp: 20, maxHp: 20 }, mana: { mastery: duelPower ?? 0 }, remotes: new Map(), playerHP: 20, maxHP: 20 };
        const foe = { id: 'w', mana: 90, hp: 14, maxHp: 14, role: 'student', wizard: true };
        const D = Object.assign(Object.create(Duel.prototype), { game: g, _npcWizard: (id) => (id === 'w' ? foe : null), _mastery: Duel.prototype._mastery, _playerMana: () => 0 });
        return D._strength('me', 0, 'w');
    };
    // (the survival rules: the mana now — 200 mana beats a foe's 90; 30 loses to it)
    assert.ok(mk(true, 200) > mk(true, 90) && mk(true, 90) > mk(true, 30));
    assert.ok(Math.abs(mk(true, 200) - 200) < 1e-9);
    // (the endless mana: equal to the foe's mana, whatever the cells; the mastery set by the player is added)
    assert.ok(Math.abs(mk(false, 5) - 90) < 1e-9);
    assert.equal(mk(false, 5, 250), 90 + 250, 'мастерство героя прибавляется к мане соперника');
    // (finite mana: the mana now + the mastery)
    assert.equal(mk(true, 200, 250), 200 + 250);
});

import { CreateMemory } from '../../src/ui/CreateMemory.js';

test('«Создать мир» помнит выбор отдельно для каждого режима', () => {
    const store = new Map();
    const mem = new CreateMemory({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
    assert.equal(mem.load('creative'), null);
    mem.save('creative', { smooth: true, hero: { spawn: 'arena' } });
    mem.save('creative', { smooth: false }); // (merged with what was kept)
    mem.save('survival', { smooth: true });
    assert.deepEqual(mem.load('creative'), { smooth: false, hero: { spawn: 'arena' } });
    assert.deepEqual(mem.load('survival'), { smooth: true });
    mem.setLastMode('survival');
    assert.equal(mem.lastMode(['creative', 'survival']), 'survival');
    assert.equal(mem.lastMode(['creative']), null);
    assert.doesNotThrow(() => new CreateMemory(null).save('x', {})); // (no cache: just not remembered)
    assert.equal(new CreateMemory({ getItem: () => '{bad' }).load('x'), null);
});

test('старт «Перед дуэлью»: жители не говорят вслух и не болтают, мир сведён к арене', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../../src/game/Game.js', import.meta.url), 'utf8');
    assert.match(src, /this\.duelOnly = config\.mode === 'creative' && this\.hero\.spawn === 'arena'/);
    for (const sys of ['animals', 'spiders', 'dragons', 'iceCastle', 'owls', 'gargoyles', 'livingTrees']) assert.match(src, new RegExp(`!duelOnly\\) this\\.${sys}\\b`), sys);
    const life = (await import('node:fs')).readFileSync(new URL('../../src/game/CastleLife.js', import.meta.url), 'utf8');
    assert.match(life, /const mute = !!this\.game\.duelOnly/);
    assert.match(life, /this\.game\.duelOnly\) return; \/\/ \(the duel-only start: nobody chatters\)/);
});

import { liveShouts } from '../../src/game/Duel.js';

test('«Максима» копится до конца столкновения, но в два раза слабее прежнего', () => {
    assert.equal(liveShouts([0, 3, 6, 9], 9.5), 4); // (they add up)
    assert.equal(liveShouts([], 10), 0);
    assert.equal(liveShouts(undefined, 10), 0);
    assert.equal(DUEL.MAXIMA_BOOST, 0.025); // (it was 0.05)
});

test('режим дуэлей: палочка — своя запоминается; нет вовсе — простая в руку', () => {
    const calls = [];
    const inv = { slots: [], hasUid: () => false };
    const items = { wand: null, loose: new Map(), removeLoose() {}, spawnLoose: (it) => calls.push('spawn:' + (it.spare ? 'spare' : 'own')), pickUp: () => calls.push('pick') };
    const g = { localId: 'me', items, inventory: inv, character: { group: { position: { x: 0, y: 0, z: 0 } } } };
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: g, mode: { arenaId: 'a', id: 'me' } });
    D._wandBack(); // never held one, none in the slots → a plain wand into the hand
    assert.deepEqual(calls, ['spawn:spare', 'pick']);
    // a stand-in held, lost later → given back; an own one held → it wins in memory
    D.mode = { arenaId: 'a', id: 'me' }; items.wand = { kind: 'wand', uid: 's1', spare: true }; D._rememberWand();
    assert.equal(D.mode.wand.uid, 's1');
    items.wand = { kind: 'wand', uid: 'o1' }; D._rememberWand();
    assert.equal(D.mode.wand.uid, 'o1');
    items.wand = { kind: 'wand', uid: 's2', spare: true }; D._rememberWand();
    assert.equal(D.mode.wand.uid, 'o1'); // (a stand-in never overwrites the own wand)
});

test('каждая дуэль начинается с настроек мира: выросшие ячейки, мастерство и победы снимаются; окно меняет настройки', () => {
    const calls = [];
    const c = { fatigue: 50, maxFatigue: 900, hp: 3, maxHp: 20 };
    const g = { combat: c, mana: { growth: 400, mastery: 12, beaten: new Set(['w']), duelsWon: new Map([['w', 'win']]) }, bonus: { fatigue: 100, hp: 5 }, config: {}, hero: { cells: 200, foe: 'mid' },
        heroApply: null };
    g.heroApply = Object.assign(Object.create(HeroApply.prototype), { game: g, applyMana: () => { c.maxFatigue = 200 + g.bonus.fatigue + g.mana.growth; calls.push('mana'); }, applyHealth: () => calls.push('hp') });
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: g, mode: { arenaId: 'a', id: 'me', foe: 'mid' } });
    D._resetHero();
    assert.equal(c.maxFatigue, 200); assert.equal(c.fatigue, 200); assert.equal(c.hp, 20);
    assert.equal(g.mana.mastery, 0); assert.equal(g.mana.beaten.size, 0); assert.equal(g.bonus.fatigue, 0);
    assert.deepEqual(calls, ['mana', 'hp']);
    D._applyHero({ cells: 500, foe: 'master' });
    assert.equal(g.hero.cells, 500); assert.equal(g.config.hero.foe, 'master'); assert.equal(D.mode.foe, 'master');
});

test('победа в столкновении лучей доходит до проигравшего, даже в мантии и доспехах', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../../src/game/Duel.js', import.meta.url), 'utf8');
    assert.match(src, /applyToCreature\(winnerBolt\.spell, lw, winnerBolt\.by, null, null, \{ clash: true \}\)/);
    assert.match(src, /applyToMe\(winnerBolt\.spell, winnerBolt\.by, winnerBolt\.side, \{ clash: true \}\)/);
    assert.match(src, /if \(!opts\?\.clash && g\.armor\?\.guard\(spell\)\) return;/);
    assert.match(src, /if \(!opts\?\.clash && c\.isVillager && \(\(c\.robe && ROBE_BLOCKS\.has\(spell\)\)/);
});

import { arcRate, ARC, AIM } from '../../src/game/Duel.js';

test('молнии из столкновения: слабые маги — как раньше (нет), чем сильнее — тем больше; помощь прицела на 30% больше', () => {
    assert.equal(arcRate(1.6), 0); assert.equal(arcRate(ARC.FROM), 0);
    assert.ok(arcRate(2.9) > 0.5 && arcRate(4.4) > arcRate(2.9) * 2); // (the Master's clash is a storm)
    assert.ok(Math.abs(AIM.CONE / 0.12 - 1.3) < 1e-9 && Math.abs(AIM.BEND / 0.21 - 1.3) < 1e-9 && Math.abs(AIM.TURN / 3.2 - 1.3) < 1e-9);
    assert.ok(AIM.MEET_BEND > AIM.BEND); // (towards the opposing charge it may turn more than towards a body)
});

import { BossRetry, isBossStart, BOSS_STARTS } from '../../src/game/BossRetry.js';

test('повтор боя с боссом: смерти нет, окно настроек, потом герой снова у босса; дуэль — своя система', () => {
    assert.deepEqual(BOSS_STARTS, ['dragon', 'queen', 'castle', 'tower', 'spider', 'blackship']);
    assert.equal(isBossStart('arena'), false); assert.equal(isBossStart('start'), false); assert.equal(isBossStart('port'), false);
    const calls = [], shown = {};
    const g = { config: { mode: 'creative' }, hero: { spawn: 'dragon', cells: 200 }, net: null, paused: false,
        combat: { revive: () => calls.push('revive') },
        heroApply: { resetToSettings: () => calls.push('reset'), requestSpawn: () => calls.push('spawn') },
        dragons: { list: [{ id: 'ctest-dragon', dead: false }], _remove: () => calls.push('rmDragon') } };
    const B = new BossRetry(g);
    B.ui = { showAgain: (o) => { Object.assign(shown, o); } };
    assert.equal(B.intercept(), true); // (no death)
    assert.deepEqual(calls, ['revive']); assert.equal(g.paused, true); assert.match(shown.title, /попробовать ещё раз/);
    assert.equal(B.intercept(), false); // (the window is open: a second fall is not asked again)
    shown.onStart({ spawn: 'dragon', cells: 400 });
    assert.deepEqual(calls, ['revive', 'reset', 'rmDragon', 'spawn']);
    assert.equal(g.hero.cells, 400); assert.equal(g.config.hero.cells, 400); assert.equal(g.paused, false); assert.equal(g._tdGone, 60);
    g.hero.spawn = 'arena';
    assert.equal(new BossRetry(g).intercept(), false); // (the arena: ArenaDuels' own)
    g.hero.spawn = 'start';
    assert.equal(new BossRetry(g).intercept(), false);
});

test('дуэлянт в бою ходит боком: лицом к сопернику, не разворачивается и не уходит', () => {
    const L = { _walkable: () => true };
    const D = Object.assign(Object.create(ArenaDuels.prototype), { game: { castleLife: L } }); // (`life` is the game's castleLife)
    const A = { def: { axis: { a: { x: 0, z: -15 }, b: { x: 0, z: 15 }, r: 23 } } };
    const v = { x: 0, z: -14, y: 0, yaw: Math.PI, speed: 0 }; // (the foe is at +z: a villager's yaw π looks along +z)
    const fp = { x: 0, y: 0, z: 14 };
    for (let i = 0; i < 60; i++) D._strafe(A, v, fp, 8, -14, 1 / 60); // a step to the side
    assert.ok(v.x > 0.5, `moved sideways ${v.x.toFixed(2)}`);
    assert.ok(Math.abs(Math.atan2(Math.sin(v.yaw - Math.PI), Math.cos(v.yaw - Math.PI))) < 0.15, `still faces the foe (yaw ${v.yaw.toFixed(2)})`);
    assert.ok(v.speed > 0 && v.speed < 2.3);
    L._walkable = () => false; // a wall: he stays
    const x0 = v.x; D._strafe(A, v, fp, 20, -14, 0.1); assert.equal(v.x, x0); assert.equal(v.speed, 0);
});

import { collapseMaxima } from '../../src/audio/MaximaShout.js';

test('«Максима» в столкновении лучей: сплошной поток «максимум максиму сим…» — один выкрик; обычная речь не трогается', () => {
    const streams = [
        'максимум максимум максимум максимум максимум максиму максиму максиму максиму ксим аксиму максиму максима максиму максиму',
        'сммаксима максима максиму маким мксим мксим максим си сим си макси сим максима максим максима максима максимум',
        'максимум максимам максимам', 'максима максима',
    ];
    for (const s of streams) assert.equal(collapseMaxima(s), 'максима', s.slice(0, 30));
    assert.equal(collapseMaxima('максима'), 'максима');
    assert.equal(collapseMaxima('бомбардо максима'), 'бомбардо максима'); // (a spell with Maxima is not a shout)
    assert.equal(collapseMaxima('это очень интересный разговор про дуэль'), 'это очень интересный разговор про дуэль');
    assert.equal(collapseMaxima('вайнд максима'), 'вайнд максима');
    assert.equal(collapseMaxima(''), '');
});
