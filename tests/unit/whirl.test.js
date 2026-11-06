// «Спиралис» (WhirlRules.js, Whirl.js): 500 маны, только в дуэли лучей, не с «Дай»; машешь — держишь вихрь ≤ 10 с; замер НА соперника — двойной удар (два заклинания одним лучом);
// остановился не на него / не начал / 10 с — оба заклинания врезаются в тебя; «Attack» — отпустить сразу (если наведено и раскручено).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WHIRL, newWhirl, stepWhirl, attackNow, aimedAt, whirlRefusal, WHIRL_TARGETS } from '../../src/game/WhirlRules.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { Whirl } from '../../src/game/Whirl.js';

test('цифры автора: 500 маны, не больше 10 секунд; слово узнаётся', () => {
    assert.equal(SPELL_COST.Spiralis, 500);
    assert.equal(WHIRL.COST, 500);
    assert.equal(WHIRL.MAX_T, 10);
    for (const w of ['spiralis', 'Спиралис', 'спиралис']) assert.equal(matchSpell(w), 'Spiralis', w);
    for (const w of ['спираль', 'спирали', 'спиртное']) assert.notEqual(matchSpell(w), 'Spiralis', w);
});

test('не работает с «Дай» — ни у меня, ни у соперника; нужен запас маны 500', () => {
    assert.ok(whirlRefusal('Die', 'Stupefy', 1000));
    assert.ok(whirlRefusal('Stupefy', 'Die', 1000));
    assert.ok(whirlRefusal('Stupefy', 'SapiraDuel', 300));
    assert.equal(whirlRefusal('Stupefy', 'SapiraDuel', 500), null);
    assert.equal(whirlRefusal('AvadaKedavra', 'IceDuel', 1000), null, 'с остальными заклинаниями всё работает');
});

/** Run the state machine for `secs` at a hand speed, returns the first event. */
function run(S, secs, speed, aimed, dt = 0.05) { for (let t = 0; t < secs; t += dt) { const r = stepWhirl(S, dt, speed, aimed); if (r) return r; } return null; }

test('вихрь: махал → замер на соперника → отпускает; замер не на него — врезается; не начал — врезается; 10 с — врезается', () => {
    let S = newWhirl();
    assert.equal(run(S, 2, 8, false), null, 'машет: всё идёт');
    assert.equal(run(S, 1, 0, true), 'release', 'замер на него после раскрутки → отпустить');
    S = newWhirl(); run(S, 2, 8, false);
    assert.equal(run(S, 1, 0, false), 'stop', 'резко перестал махать не на соперника → врежется в тебя');
    S = newWhirl();
    assert.equal(run(S, 3, 0, false), 'idle', 'не начал махать за 2 с');
    S = newWhirl();
    assert.equal(run(S, 12, 8, false), 'timeout', 'десять секунд — не больше');
    S = newWhirl(); S.t = 0;
    let n = 0; while (!stepWhirl(S, 0.1, 8, false)) n++;
    assert.ok(Math.abs(n * 0.1 - 10) < 0.2, `держится ~10 с, а не дольше: ${n * 0.1}`);
    // быстро замер, не раскрутив (меньше 1,2 с махания): это не выпуск, а «stop»
    S = newWhirl(); run(S, 0.5, 8, true);
    assert.equal(run(S, 1, 0, true), 'stop', 'не раскручено — не выпустить');
});

test('«Attack»: отпустить сразу — только наведя и раскрутив', () => {
    const S = newWhirl(); run(S, 2, 8, false);
    assert.equal(attackNow(S, true), 'release');
    assert.equal(attackNow(S, false), null, 'не наведено');
    assert.equal(attackNow(newWhirl(), true), null, 'не раскручено');
});

test('наведение: палочка на грудь соперника в пределах ~25°', () => {
    const o = { x: 0, y: 3, z: 0 }, t = { x: 0, y: 3, z: -10 };
    assert.ok(aimedAt(o, { x: 0, y: 0, z: -1 }, t));
    assert.ok(aimedAt(o, new THREE.Vector3(0.3, 0, -1).normalize(), t));
    assert.ok(!aimedAt(o, new THREE.Vector3(1, 0, -1).normalize(), t));
});

// ------------------------------------------------------------ the game part, with fakes
function fakeGame() {
    const calls = { cast: [], applyToMe: [], sent: [], said: [] };
    const bolts = new Map();
    const g = { localId: 'A', remotes: new Map(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        character: { group: { position: new THREE.Vector3(0, 0, 0) }, handVelocity: { right: new THREE.Vector3() }, isArmRaised: () => true, getHandWorldPosition: (s, o) => o.set(0, 3, 0), getHandDirection: (s, o) => o.set(0, 0, -1) },
        hud: { setVoice: (t) => calls.said.push(t) }, sound: { playThunder() {} },
        combat: { maxFatigue: 1000, fatigue: 1000, dead: false, check: () => null, pay() { this.fatigue -= 500; } }, isDeadLocal: false,
        sync: { net: { isHost: true, send: (m) => calls.sent.push(m) }, duelClashEnd() {} } };
    const a = { id: 'A:1', by: 'A', spell: 'Stupefy', side: 'right', front: new THREE.Vector3(), state: 'clash' };
    const b = { id: 'B:1', by: 'B', spell: 'SapiraDuel', side: 'right', front: new THREE.Vector3(), state: 'clash' };
    bolts.set(a.id, a); bolts.set(b.id, b);
    g.duel = { me: 'A', bolts, clashes: [{ a, b, marks: [0x112233, 0x445566] }], _referee: () => true, _burst() {}, _npcWizard: () => null,
        cast(spell) { const x = { spell, twin: false }; calls.cast.push(x); return x; },
        applyToMe(spell, by, side, opts) { calls.applyToMe.push([spell, by, !!opts?.clash]); }, _wizardPos: () => null };
    g.whirl = new Whirl(g);
    g.calls = calls;
    return g;
}

test('слово в дуэли: оба луча забраны (дуэль снята, пули нет), 500 маны списано, всем сообщено; без дуэли — «только в дуэли»; с «Дай» — отказ', () => {
    const g = fakeGame();
    g.duel.clashes[0].a.spell = 'Die';
    g.whirl.cast(true);
    assert.equal(g.whirl.mine, null, '«Дай»: не работает');
    assert.equal(g.combat.fatigue, 1000, 'ничего не потрачено');
    g.duel.clashes[0].a.spell = 'Stupefy';
    assert.equal(g.whirl.cast(true), 'Spiralis');
    assert.ok(g.whirl.mine, 'вихрь начат');
    assert.equal(g.combat.fatigue, 500);
    assert.equal(g.duel.clashes.length, 0, 'дуэль снята');
    assert.equal(g.duel.bolts.size, 0, 'оба луча забраны');
    assert.ok(g.calls.sent.some((m) => m.t === 'dwhirl' && m.ph === 'start' && m.spells[0] === 'Stupefy' && m.spells[1] === 'SapiraDuel'));
    const g2 = fakeGame(); g2.duel.clashes.length = 0;
    assert.equal(g2.whirl.cast(true), null);
    assert.ok(g2.calls.said.some((t) => /только в дуэли/.test(t)));
});

test('отпускание: два заклинания (моё и его) летят одним лучом, не дерутся друг с другом; остановился не на него — оба врезаются в меня', () => {
    const g = fakeGame();
    g.whirl.cast(true);
    const S = g.whirl.mine;
    g.whirl._oppPos = (s, out) => out.set(0, 1, -10);
    g.whirl._release(S);
    assert.deepEqual(g.calls.cast.map((x) => x.spell), ['Stupefy', 'SapiraDuel']);
    assert.ok(g.calls.cast.every((x) => x.twin), 'двойной удар: пара не клашится сама с собой');
    assert.equal(g.whirl.mine, null);
    assert.ok(g.calls.sent.some((m) => m.t === 'dwhirl' && m.ph === 'end' && m.res === 'release'));
    // обратный удар
    const h = fakeGame();
    h.whirl.cast(true);
    h.whirl._backfire(h.whirl.mine, 'stop');
    assert.deepEqual(h.calls.applyToMe.map((c) => c[0]).sort(), ['SapiraDuel', 'Stupefy'], 'в меня оба');
    assert.ok(h.calls.applyToMe.every((c) => c[2]), 'как проигравшему: броня и мантия не отводят');
    assert.equal(h.whirl.mine, null);
});

test('гость просит хост забрать дуэль; хост отвечает; дуэль уже кончилась — мана возвращается', () => {
    const g = fakeGame();
    g.sync.net.isHost = false; g.duel._referee = () => false;
    g.whirl.cast(true);
    assert.ok(g.calls.sent.some((m) => m.t === 'dwhirlreq' && m.a === 'A:1'), 'просьба хосту');
    assert.equal(g.whirl.mine, null, 'пока хост не ответил — вихря нет');
    g.whirl.onNet({ t: 'dwhirl', by: 'A', ph: 'end', res: 'none' });
    assert.equal(g.combat.fatigue, 1000, 'мана возвращена');
    // хост
    const h = fakeGame();
    h.whirl.onReq({ by: 'B', a: 'A:1', b: 'B:1', side: 'right' });
    assert.ok(h.whirl.states.has('B'), 'хост забрал дуэль за гостя');
    assert.equal(h.duel.clashes.length, 0);
});

test('таблица «кто/что»: у каждого вида — решение с причиной', () => {
    for (const [k, T] of Object.entries(WHIRL_TARGETS)) assert.ok(['caster', 'opponent', 'none', 'refused'].includes(T.does) && T.why.length > 8, k);
});
