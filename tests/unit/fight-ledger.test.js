// Награда за бой с волшебником — по красоте магии (FightLedger.js; автор 19.11–20.11)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FightLedger, FIGHT, ARENA, spellWeight, fightCells, fightMastery, isElemental, FoeSet, foeSet } from '../../src/game/FightLedger.js';
import { firstSpellGain, SAME_SPELL, NOT_SPELLS } from '../../src/game/Mana.js';

function ledger(me = 0) {
    let t = 0;
    const L = new FightLedger(() => t, (name) => ({ key: SAME_SPELL[name] || name, w: NOT_SPELLS.has(name) || name === 'Maxima' ? 0 : spellWeight(firstSpellGain(name)) }), () => me);
    return { L, at: (s) => { t = s; } };
}

test('честный бой без ничего: 5 %; нечестный (он на меня не нападал) — ничего, всегда', () => {
    const { L, at } = ledger();
    assert.equal(L.summary('w1').honest, false, 'нет счёта — нечестно');
    L.hit('w1'); // (my spell hit him in his sleep)
    assert.equal(L.summary('w1').honest, false, 'удар по спящему — нечестный бой');
    L.foeCast('w2');
    assert.equal(L.summary('w2').pct, FIGHT.MIN_PCT);
    assert.equal(L.summary('w3', true).pct, FIGHT.MIN_PCT, 'вызывающий знает: бой честный (игрок, арена)');
});

test('одно и то же заклинание много раз — ничего сверх; разные — прибавляют; великие — больше простых', () => {
    const { L, at } = ledger();
    L.foeCast('w');
    for (let i = 0; i < 20; i++) { at(i); L.myCast('Bombardo'); }
    const one = L.summary('w').parts.variety;
    for (const n of ['Wind', 'Fire', 'LevitationMaxima', 'Protection']) { at(25); L.myCast(n); }
    const many = L.summary('w').parts.variety;
    assert.ok(many > one, 'разнообразие растёт: ' + one + ' → ' + many);
    assert.ok(spellWeight(firstSpellGain('Hellfire')) > spellWeight(firstSpellGain('Lumos')), 'великое весит больше света');
    assert.ok(many <= FIGHT.VARIETY_MAX);
});

test('время: идёт, пока заклинания летят; пауза дольше 10 с не считается; минута — полная', () => {
    const { L, at } = ledger();
    at(0); L.foeCast('w');
    for (let s = 5; s <= 30; s += 5) { at(s); L.foeCast('w'); }
    assert.equal(Math.round(L.summary('w').seconds), 30);
    at(100); L.foeCast('w'); // (a pause of 70 s: nothing added)
    assert.equal(Math.round(L.summary('w').seconds), 30, 'пауза не считается');
    for (let s = 105; s <= 160; s += 5) { at(s); L.foeCast('w'); }
    assert.ok(L.summary('w').parts.time <= FIGHT.TIME_PCT + 1e-9);
});

test('столкновение лучей прибавляет, но не больше предела; магия стихий умножает; потолок 45 %', () => {
    const { L, at } = ledger();
    L.foeCast('w');
    for (let i = 0; i < 10; i++) L.clash('w');
    assert.equal(L.summary('w').parts.clash, FIGHT.CLASH_MAX);
    const e = ledger();
    e.L.foeCast('z');
    for (let i = 0; i < 3; i++) { e.at(i * 3); e.L.myCast('IceShards'); e.L.myCast('Waterball'); e.L.myCast('WaterVortex'); }
    assert.ok(isElemental('IceShards'));
    const s = e.L.summary('z');
    assert.equal(s.elemental, true, 'половина заклинаний — стихия');
    // everything at once: never above the ceiling
    const f = ledger();
    f.L.foeCast('big');
    for (let i = 0; i < 12; i++) f.L.clash('big');
    for (let i = 0; i < 60; i++) { f.at(i); for (const n of ['Hellfire', 'Inferno', 'FireMaxima', 'Tornado', 'LightningStrike', 'Earthquake', 'IceMaxima']) f.L.myCast(n); }
    const big = f.L.summary('big').pct;
    assert.ok(big > 40 && big <= FIGHT.MAX_PCT, 'почти всё сразу — около потолка, но не выше: ' + big);
});

test('несколько волшебников сразу — у каждого свой счёт; заклинание пишется во все живые счета, а в давно закончившийся — нет', () => {
    const { L, at } = ledger();
    at(0); L.foeCast('a'); L.foeCast('b');
    at(5); L.myCast('Wind');
    at(100); L.foeCast('c'); L.myCast('Fire'); // (a and b ended long ago)
    assert.equal(L.summary('a').spells, 1);
    assert.equal(L.summary('b').spells, 1);
    assert.equal(L.summary('c').spells, 1);
    L.close('a');
    assert.equal(L.peek('a'), null);
    assert.ok(L.peek('b'));
});

test('арена — исключение: честный бой без «он напал»; секунды считаются отдельно; итог сливается со счётом соперника', () => {
    const { L, at } = ledger();
    L.arena(true);
    for (let i = 0; i < 30; i++) L.arenaTick(1);
    at(10); L.myCast('Wind'); L.myCast('Fire');
    const s = L.summary('oppX', false, true);
    assert.equal(s.honest, true);
    assert.ok(s.seconds >= 29 && s.spells === 2);
    L.close('oppX');
    assert.equal(L.peek(ARENA), null);
});

test('ячейки и мастерство по доле: от (максимум − 30), не меньше 1; мастерство растёт с долей', () => {
    assert.equal(fightCells(5, 70), 2);
    assert.equal(fightCells(45, 70), 18);
    assert.equal(fightCells(5, 30), 1);
    assert.ok(fightMastery(45, 0) > fightMastery(5, 0));
    assert.ok(fightMastery(5, 250) > fightMastery(5, 0), 'сильный побеждённый даёт ещё');
});

test('FoeSet: каждый «выпустил заклинание в игрока» сообщается (хоть повтор)', () => {
    const got = [];
    FoeSet.onCast = (v, id) => got.push([v.id, id]);
    const v = { id: 'w' };
    foeSet(v).add('me'); foeSet(v).add('me');
    assert.deepEqual(got, [['w', 'me'], ['w', 'me']]);
    assert.ok(v.castAtPlayers.has('me'));
    FoeSet.onCast = null;
});

test('бонус слабому: чем сильнее соперник против меня в начале боя, тем больше процент; равный или слабее — ничего; потолок бонуса 15 %, всего 60 %', () => {
    const weak = ledger(30); weak.L.foeCast('w');
    const eq = ledger(80); eq.L.foeCast('w');
    assert.equal(eq.L.summary('w', false, false, 80).underdog, 0, 'равный — без бонуса');
    assert.equal(eq.L.summary('w', false, false, 60).underdog, 0, 'слабее — без бонуса');
    const s2 = weak.L.summary('w', false, false, 60); // twice mine
    assert.ok(Math.abs(s2.underdog - FIGHT.UNDERDOG_K) < 1e-9, 'вдвое сильнее: +8 %');
    assert.equal(weak.L.summary('w', false, false, 30 * 64).underdog, FIGHT.UNDERDOG_MAX, 'в разы сильнее: потолок бонуса');
    assert.ok(s2.pct > weak.L.summary('w').pct, 'процент выше, чем без бонуса');
    // the strength at the START: growing after does not take it away
    let me = 30; const g = new FightLedger(() => 0, () => ({ key: 'x', w: 1 }), () => me);
    g.foeCast('w'); me = 500;
    assert.ok(g.summary('w', false, false, 60).underdog > 0, 'сила запомнена в начале боя');
    // the whole at the top
    const f = ledger(30); f.L.foeCast('big'); for (let i = 0; i < 12; i++) f.L.clash('big');
    assert.ok(f.L.summary('big', false, false, 1e6).pct <= FIGHT.MAX_PCT + FIGHT.UNDERDOG_MAX);
});

test('толпа: +2 % за каждого ДРУГОГО противника, дерущегося со мной одновременно (до 10 %); один — без прибавки', () => {
    const { L, at } = ledger();
    at(0); L.foeCast('a');
    assert.equal(L.summary('a').crowd, 0, 'один противник — без прибавки');
    at(2); L.foeCast('b'); at(3); L.foeCast('c'); at(4); L.foeCast('a');
    const s = L.summary('a');
    assert.equal(s.peak, 3);
    assert.equal(s.crowd, 2 * FIGHT.CROWD_EACH, 'двое других: +4 %');
    for (const id of ['d', 'e', 'f', 'g', 'h']) { at(5); L.foeCast(id); }
    at(6); L.foeCast('a');
    assert.equal(L.summary('a').crowd, FIGHT.CROWD_MAX, 'потолок 10 %');
    // an opponent that stopped fighting long ago is no crowd
    const f = ledger(); f.at(0); f.L.foeCast('x'); f.at(100); f.L.foeCast('y'); f.L.foeCast('y');
    assert.equal(f.L.summary('y').crowd, 0);
});

test('заклинание, брошенное за 6 с ДО начала боя (первый выстрел летит раньше ответа), входит в счёт; «стоп» и подобные — нет', () => {
    const { L, at } = ledger();
    at(10); L.myCast('Bombardo');
    at(11); L.myCast('Stand'); // (a word of control: no weight)
    at(12); L.foeCast('w');
    assert.equal(L.summary('w').spells, 1);
    const g = ledger();
    g.at(0); g.L.myCast('Wind'); g.at(30); g.L.foeCast('z');
    assert.equal(g.L.summary('z').spells, 0, 'давнее заклинание — не этого боя');
});
