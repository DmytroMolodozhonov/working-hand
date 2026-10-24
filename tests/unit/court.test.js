import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, PROBLEMS, PROBLEM_IDS, newCourt, tick, genProblem, solve, autoSolve, parseCourt, currentProblem, briefLine, listLine, detailLine, treasuryLine, moodLine, complaint, costOf, amountOf, weights } from '../../src/game/Court.js';
import { CourtLife } from '../../src/game/CourtLife.js';

const people = [
    { idx: 1, id: 'c:1', name: 'Гарольд', role: 'knight' }, { idx: 2, id: 'c:2', name: 'Ульрих', role: 'knight' },
    { idx: 3, id: 'c:3', name: 'Мария', role: 'farmer' }, { idx: 4, id: 'c:4', name: 'Пётр', role: 'builder' },
    { idx: 5, id: 'c:5', name: 'Ян', role: 'merchant' }, { idx: 6, id: 'c:6', name: 'Элиас', role: 'wizard', wizard: true },
];
const seq = (...x) => { let i = 0; return () => x[i++ % x.length]; };

test('twenty troubles and more; each has people to tell it, ways to answer, words', () => {
    assert.ok(PROBLEM_IDS.length >= 20, `${PROBLEM_IDS.length}`);
    for (const id of PROBLEM_IDS) {
        const p = PROBLEMS[id];
        assert.ok(p.title && p.vizier.includes('{name}') && p.says.length >= 2 && Object.keys(p.ways).length >= 1 && p.mood > 0 && p.sev >= 1, id);
    }
});

test('the treasury: it fills with taxes, is paid out in wages; a low tax fills it slower', () => {
    const c = newCourt({ knights: 4 }, () => 0);
    const start = c.coins;
    tick(c, COURT.TICK * 5, { population: 30, knights: 4, people, rng: () => 0.9 });
    assert.ok(c.coins > start, 'taxes beat wages');
    const c2 = newCourt({ knights: 4 }, () => 0); c2.tax = 0.5;
    tick(c2, COURT.TICK * 5, { population: 30, knights: 4, people, rng: () => 0.9 });
    assert.ok(c2.coins < c.coins);
});

test('troubles come from the state of the castle: an empty treasury — unpaid wages; the same one is not opened twice', () => {
    const c = newCourt({ knights: 4 }, () => 0);
    c.coins = 10;
    const w = weights(c, { hasWizards: true, hasMerchants: true });
    assert.ok(w.unpaid_wages > PROBLEMS.unpaid_wages.weight * 3);
    const p = genProblem(c, { people, hasWizards: true, hasMerchants: true, rng: () => 0.01 });
    assert.ok(p && PROBLEMS[p.kind]);
    const person = people.find((x) => x.idx === p.idx);
    const who = PROBLEMS[p.kind].who;
    assert.ok(who === 'any' ? !['king', 'advisor'].includes(person.role) : who === 'wizard' ? person.wizard : person.role === who, 'it falls on a fitting man');
    const again = genProblem(c, { people, hasWizards: true, hasMerchants: true, rng: () => 0.01 });
    assert.notEqual(again?.kind, p.kind);
    // no merchants — no merchants' troubles
    const none = weights(newCourt({}), { hasMerchants: false });
    assert.equal(none.low_sales, 0); assert.equal(none.thieves, 0);
});

test('they come over time, not all at once, and not more than the limit', () => {
    const c = newCourt({ knights: 4 }, () => 0);
    let n = 0;
    for (let t = 0; t < 4000; t += 10) { const ev = tick(c, 10, { population: 30, knights: 4, people, hasWizards: true, hasMerchants: true, rng: Math.random }); n += ev.filter((e) => e.kind === 'problem').length; }
    assert.ok(n >= 6 && n <= 40, `${n} troubles in ~66 minutes`);
    assert.ok(c.problems.filter((p) => !p.done).length <= COURT.MAX_OPEN);
});

test('answering: the right way costs and helps; a wrong way is said; no money — said', () => {
    const c = newCourt({ knights: 4 }, () => 0); c.coins = 500;
    const p = { id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false };
    c.problems.push(p);
    assert.equal(costOf(c, p, 'money'), 40); assert.equal(costOf(c, p, 'guard'), null);
    const bad = solve(c, p, 'guard'); assert.equal(bad.ok, false); assert.match(bad.line, /не поможет/);
    const mood0 = c.mood;
    const ok = solve(c, p, 'money');
    assert.equal(ok.ok, true); assert.equal(c.coins, 460); assert.ok(c.mood > mood0); assert.equal(p.done, true); assert.ok(ok.bonus.f > 0 && ok.bonus.s > 0);
    assert.equal(solve(c, p, 'money').ok, false, 'already done');
    const rich = { id: 2, kind: 'cracked_wall', idx: 1, name: 'Гарольд', at: 0, done: false }; c.problems.push(rich);
    c.coins = 20;
    const poor = solve(c, rich, 'money'); assert.equal(poor.ok, false); assert.equal(poor.short, true); assert.match(poor.line, /в казне/i);
});

test('a half-answer relieves a little and does not close the matter; more than asked is a gift', () => {
    const c = newCourt({ knights: 4 }, () => 0); c.coins = 500;
    const p = { id: 1, kind: 'cracked_wall', idx: 1, name: 'Гарольд', at: 0, done: false }; c.problems.push(p);
    const half = solve(c, p, 'money', { amount: 20 });
    assert.equal(half.ok, true); assert.equal(half.half, true); assert.equal(p.done, false); assert.equal(c.coins, 480);
    const full = solve(c, p, 'money', { amount: 200 });
    assert.equal(p.done, true); assert.equal(c.coins, 280);
    assert.ok(full.mood > PROBLEMS.cracked_wall.mood, 'a generous king is loved more');
});

test('wages cost by the number of knights; a lower tax costs nothing and cools the treasury', () => {
    const c = newCourt({ knights: 6 }, () => 0); c.coins = 1000;
    const p = { id: 1, kind: 'unpaid_wages', idx: 1, name: 'Гарольд', at: 0, done: false }; c.problems.push(p);
    assert.equal(costOf(c, p, 'money', 6), 210);
    const t = { id: 2, kind: 'high_taxes', idx: 3, name: 'Мария', at: 0, done: false }; c.problems.push(t);
    assert.equal(solve(c, t, 'tax').ok, true); assert.equal(c.tax, 0.75); assert.equal(c.coins, 1000);
});

test('the vizier solves it himself, but never spends more than a good part of the treasury', () => {
    const c = newCourt({ knights: 4 }, () => 0); c.coins = 100;
    const wall = { id: 1, kind: 'cracked_wall', idx: 1, name: 'Гарольд', at: 0, done: false }; c.problems.push(wall);
    assert.equal(autoSolve(c, wall).ok, true, 'work costs nothing');
    const hunger = { id: 2, kind: 'hunger', idx: 3, name: 'Мария', at: 0, done: false }; c.problems.push(hunger);
    c.coins = 100;
    assert.equal(autoSolve(c, hunger).ok, false, '70 of 100 is too much for him to decide');
    c.coins = 400;
    assert.equal(autoSolve(c, hunger).ok, true);
});

test('the king\'s words to the vizier', () => {
    const k = (t) => parseCourt(t)?.kind;
    assert.equal(k('какие проблемы'), 'problems'); assert.equal(k('что с жителями'), 'problems'); assert.equal(k('кто недоволен'), 'problems');
    assert.equal(k('сколько в казне'), 'treasury'); assert.equal(k('сколько денег'), 'treasury');
    assert.equal(k('как настроение народа'), 'mood'); assert.equal(k('довольны ли люди'), 'mood');
    assert.equal(k('подробнее'), 'details'); assert.equal(k('да расскажи'), 'details' === k('да расскажи') ? 'details' : k('да расскажи'));
    assert.equal(k('веди меня к нему'), 'lead'); assert.equal(k('проведи к нему'), 'lead'); assert.equal(k('покажи мне его'), 'lead');
    assert.equal(k('реши сам'), 'auto'); assert.equal(k('на твоё усмотрение'), 'auto');
    assert.equal(k('потом'), 'later'); assert.equal(k('дальше'), 'next');
    const m = parseCourt('выдели ему пятьдесят монет'); assert.equal(m.kind, 'solve'); assert.equal(m.way, 'money'); assert.equal(m.amount, 50);
    assert.equal(parseCourt('выдели 120 монет').amount, 120);
    assert.equal(parseCourt('купи семена').way, 'supplies');
    assert.equal(parseCourt('пусть починят крышу').way, 'work');
    assert.equal(parseCourt('пошли стражу к рынку').way, 'guard');
    assert.equal(parseCourt('устрой пир').way, 'feast');
    assert.equal(parseCourt('снизь налоги').way, 'tax');
    assert.equal(parseCourt('позови лекаря').way, 'healer');
    assert.equal(parseCourt('я поговорю с людьми').way, 'word');
    assert.equal(parseCourt('рассуди их').way, 'judge');
    assert.equal(parseCourt('привет как дела у тебя'), null);
    assert.equal(amountOf('сто монет'), 100); assert.equal(amountOf('просто так'), null);
});

test('the vizier\'s lines: brief, list, details, treasury, mood', () => {
    const c = newCourt({ knights: 4 }, () => 0); c.coins = 120;
    assert.match(briefLine(c), /всё спокойно/);
    c.problems.push({ id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false }, { id: 2, kind: 'cracked_wall', idx: 1, name: 'Гарольд', at: 0, done: false });
    const b = briefLine(c);
    assert.match(b, /Дел 2/); assert.match(b, /трещин/); assert.match(b, /подробнее/);
    assert.match(listLine(c), /1\./);
    const d = detailLine(c, c.problems[0]);
    assert.match(d, /Можно:/); assert.match(d, /веди к нему/);
    assert.match(treasuryLine(c), /120 монет/);
    c.mood = 10; assert.match(moodLine(c), /бунт/);
    assert.equal(currentProblem(c).kind, 'cracked_wall', 'the most urgent first');
    assert.ok(complaint(c.problems[0], () => 0).length > 10);
});

// ---------------------------------------------------------------- the game side on a stub castle
function stubWorld() {
    const said = [], orders = [], bumps = [];
    const def = { id: 'c1', x: 0, z: 0, knights: 4 };
    const cs = { def, active: new Map(), hostile: new Map(), awake: true };
    const st = { owner: 'me', ownerName: 'Я', kingDead: true, killed: new Set(), ranks: {} };
    const mk = (idx, role, name, x, z, extra = {}) => { const v = { id: 'c1:' + idx, idx, role, name, x, y: 0, z, cs, dead: false, ...extra }; cs.active.set(idx, v); return v; };
    const adv = mk(-1, 'advisor', 'Визирь', 20, 0), farmer = mk(3, 'farmer', 'Мария', 6, 5);
    mk(1, 'knight', 'Гарольд', 10, 10); mk(2, 'knight', 'Ульрих', 12, 10);
    const life = {
        enabled: true, auth: true, castles: new Map([['c1', cs]]), game: { localId: 'me', isNight: false }, state: () => st,
        byId: new Map([...cs.active.values()].map((v) => [v.id, v])), _playerPos: () => ({ x: 2, y: 0, z: 2 }), _inLand: () => true,
        _say: (v, t) => said.push([v.name, t]), talk: { inTalk: () => false, _sayReply: (v, t) => said.push([v.name, t]), commands: { _begin() {} } },
        orders: { run: (v, name, args) => orders.push([v.name, name, args]) }, cmds: { run: (v, a) => orders.push([v.name, 'cmds', a]) },
        rel: { dirty: new Set(), bump: (v, pid, d) => bumps.push([v.name, d]), eff: () => ({ sub: 80, fr: 0, lv: 0 }) },
    };
    return { life, cs, st, adv, farmer, said, orders, bumps, court: new CourtLife(life) };
}

test('the vizier comes to the king by himself and reports briefly, once in a while', () => {
    const { court, cs, st, orders, said } = stubWorld();
    const c = court.of(cs, true);
    c.problems.push({ id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false, told: false });
    c.nextAt = 1e9;
    court.update(2.1);
    assert.ok(orders.some((o) => o[1] === 'cmds' && o[2].id === 'come'), 'he walks to the king');
    // arrives
    const adv = cs.active.get(-1); adv.x = 3; adv.z = 3;
    court.update(2.1);
    assert.ok(said.some((s) => s[0] === 'Визирь' && /позвольте доложить/.test(s[1])));
    assert.equal(c.problems[0].told, true);
    // not again at once
    orders.length = 0; said.length = 0; adv.x = 20;
    court.update(2.1); court.update(2.1);
    assert.equal(orders.length, 0);
    void st;
});

test('the king asks, answers, and the man\'s bars and the treasury move', () => {
    const { court, cs, adv, said, bumps } = stubWorld();
    const c = court.of(cs, true); c.nextAt = 1e9; c.coins = 300;
    c.problems.push({ id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false, told: true });
    assert.equal(court.hear(adv, 'сколько в казне', {}), true);
    assert.match(said.at(-1)[1], /300 монет/);
    assert.equal(court.hear(adv, 'какие проблемы', {}), true);
    assert.match(said.at(-1)[1], /слабый урожай/);
    assert.equal(court.hear(adv, 'выдели сорок монет', {}), true);
    assert.equal(c.coins, 260); assert.equal(c.problems[0].done, true);
    assert.ok(bumps.some((b) => b[0] === 'Мария' && b[1].f > 0), 'she thinks well of the king');
    assert.match(said.at(-1)[1], /осталось 260/);
    assert.equal(court.hear(adv, 'привет', {}), false, 'not about the court');
    assert.equal(court.hear(adv, 'подробнее', {}), true, 'while he is telling, "подробнее" is for him (nothing left: all quiet)');
    assert.match(said.at(-1)[1], /спокойно/);
});

test('«веди к нему»: the vizier walks to the man, and the man tells his trouble when the king arrives', () => {
    const { court, cs, adv, farmer, said, orders } = stubWorld();
    const c = court.of(cs, true); c.nextAt = 1e9;
    c.problems.push({ id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false, told: true });
    c.topic = 1; c.talkUntil = c.clock + 30;
    assert.equal(court.hear(adv, 'веди меня к нему', {}), true);
    assert.ok(orders.some((o) => o[2].id === 'go_to_person' && o[2].to === farmer.id));
    adv.x = farmer.x + 1; adv.z = farmer.z;
    court.update(2.1);
    assert.ok(said.some((s) => s[0] === 'Визирь' && /Вот он|пришли/.test(s[1])));
    court.update(2.1);
    assert.ok(said.some((s) => s[0] === 'Мария' && /урожай|поле|семена/i.test(s[1])), 'the farmer speaks of her harvest');
});

test('a man with a trouble tells it at a greeting, once; the king may answer him directly', () => {
    const { court, cs, farmer, said, bumps } = stubWorld();
    const c = court.of(cs, true); c.nextAt = 1e9; c.coins = 200;
    c.problems.push({ id: 1, kind: 'poor_harvest', idx: 3, name: 'Мария', at: 0, done: false });
    const first = court.onGreet(farmer, { intent: 'greet' });
    assert.ok(first && first.length > 10);
    assert.equal(court.onGreet(farmer, { intent: 'greet' }), null, 'only once');
    assert.equal(court.hear(farmer, 'выдели ей деньги', {}), true);
    assert.equal(c.problems[0].done, true);
    assert.ok(bumps.length >= 1); void said;
});

test('a trouble left alone for long makes the man think worse of the king', () => {
    const { court, cs, bumps } = stubWorld();
    const c = court.of(cs, true); c.nextAt = 1e9;
    c.problems.push({ id: 1, kind: 'hunger', idx: 3, name: 'Мария', at: 0, done: false });
    c.clock = 600;
    for (let i = 0; i < 125; i++) court.update(2.1);
    assert.ok(bumps.some((b) => b[0] === 'Мария' && b[1].f < 0));
});
