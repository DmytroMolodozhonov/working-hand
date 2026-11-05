// Розыск (автор 05.11): охотников шлют только за тяжкие преступления, которые видели и узнали лицо; невидимого/под чужим лицом не узнают, шлем —
// узнают немногие; шанс найти — 50 % от шанса феникса (дома 70 %, в пещере 0, если не видели, как забежал; маги +15 %); 2–3 охотника;
// мирные просят выкуп («заплачу» — уходят, запись снята), отказ — бой; в доме стучатся, не врываются.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNTY, knowsFace, crimeHeat, findChance, partyFor, huntAnswer, wanted, fineOf } from '../../src/game/BountyRules.js';
import { PHOENIX } from '../../src/game/Phoenixes.js';
import { Bounty } from '../../src/game/Bounty.js';

test('the face: invisible / another face — never; a helmet — only some; too far — no', () => {
    assert.equal(knowsFace({ dist: 5 }, { invisible: true }), false);
    assert.equal(knowsFace({ dist: 5 }, { disguised: true }), false);
    assert.equal(knowsFace({ dist: 50 }, {}), false);
    assert.equal(knowsFace({ dist: 5 }, {}), true);
    assert.equal(knowsFace({ dist: 5 }, { helmet: true }, 0.9), false);
    assert.equal(knowsFace({ dist: 5 }, { helmet: true }, 0.1), true);
    assert.equal(crimeHeat(true, false, 0), 0, 'nobody knew the face: no record');
    assert.equal(crimeHeat(true, true, 2), BOUNTY.CHIEF);
    assert.ok(!wanted({ heat: 1 }) && !wanted({ heat: 2 }), 'one or two killings: no hunters');
    assert.ok(wanted({ heat: 3 }));
});

test('the chance: 50 % of the phoenix’s, 70 % at home, none in a cave unless seen running in; the wizards 15 % better', () => {
    assert.equal(findChance('open'), PHOENIX.SPAWN_CHANCE * 0.5);
    assert.equal(findChance('home'), PHOENIX.SPAWN_CHANCE * 0.7);
    assert.equal(findChance('cave'), 0);
    assert.ok(findChance('cave', false, true) > 0);
    assert.ok(Math.abs(findChance('open', true) - PHOENIX.SPAWN_CHANCE * 0.5 * 1.15) < 1e-12);
    let n2 = 0, n3 = 0;
    for (let i = 0; i < 400; i++) { const p = partyFor({ heat: 4 }, 'open'); if (p.n === 2) n2++; else if (p.n === 3) n3++; else assert.fail('2–3 hunters'); }
    assert.ok(n2 && n3);
    assert.ok(partyFor({ heat: 4 }, 'home').peaceful, 'at the house: first peacefully');
    assert.match(partyFor({ heat: 4, mage: true }, 'open').kind, /^wiz/);
    assert.equal(huntAnswer('ладно, заплачу'), 'pay');
    assert.equal(huntAnswer('нет, не заплачу'), 'refuse');
    assert.ok(fineOf({ heat: 6 }) >= 500);
});

function fake({ cave = false, coins = 5000 } = {}) {
    const said = [], parties = new Map();
    const me = { x: 0, y: 10, z: 0 };
    const g = {
        authority: true, localId: 'me', _inCave: cave,
        inventory: { c: coins, coins() { return this.c; }, spendCoins(n) { if (this.c < n) return false; this.c -= n; return true; }, _render() {} },
        hud: { setVoice() {} }, potionFx: { has: () => false }, armor: { worn: {} }, invis: { hidden: () => false },
        travelers: {
            parties,
            spawnNear(kind, o) {
                const members = Array.from({ length: o.n }, (_, i) => ({ id: 'h' + i, x: 60 + i, y: 10, z: 0, yaw: 0 }));
                const P = { id: 'p1', kind, members, dest: o.dest, state: 'go', cs: { hostile: new Map() } };
                parties.set(P.id, P);
                return P;
            },
            trouble(P, by) { P.state = 'trouble'; for (const v of P.members) v.foe = by; },
        },
    };
    g.castleLife = {
        enabled: true,
        _players: () => [{ id: 'me', p: me }],
        _playerPos: (id) => (id === 'me' ? me : null),
        _sees: () => true, _fights: () => true,
        _say(v, t) { said.push(t); },
    };
    return { g, me, said, parties };
}
const town = { def: { id: 'c1', kind: 'castle', name: 'Белый Брод', x: 300, z: 0 } };
const W = (x) => ({ x, z: 0 });

test('crimes before eyes that knew the face heat the settlement; a party comes; the peaceful ones take the ransom and the record is cleared', () => {
    const { g, me, said, parties } = fake();
    const B = new Bounty(g);
    B.crime(town, 'me', { role: 'farmer' }, true, [W(3), W(5)]);
    B.crime(town, 'me', { role: 'farmer' }, true, [W(4)]);
    assert.ok(!B._worst('me'), 'two killings: not yet wanted');
    B.crime(town, 'me', { role: 'farmer' }, true, [W(4)]);
    assert.ok(B._worst('me'), 'three: wanted');
    // the roll: forced to hit
    const H = B._send({ id: 'me', p: me }, B._worst('me'), 'open');
    assert.ok(H && H.P.members.length >= 2 && H.P.members.length <= 3);
    H.peaceful = true;
    for (const v of H.P.members) { v.x = 6; v.z = 0; } // (they came up)
    B._hunt(H, 0.5);
    assert.equal(H.phase, 'talk');
    assert.ok(said.some((t) => /Именем «Белый Брод»/.test(t)));
    const r = B.hear(H.P.members[0], 'хорошо, заплачу');
    assert.match(r, /Выкуп принят/);
    assert.ok(g.inventory.c < 5000);
    assert.ok(!B._worst('me'), 'the record cleared');
    assert.ok(!B.hunts.size);
    void parties;
});

test('a refusal — a fight; the hero ran into a cave unseen — they lose him; at his house — they knock, never break in, and go away', () => {
    const A = fake();
    const B = new Bounty(A.g);
    for (let i = 0; i < 3; i++) B.crime(town, 'me', { role: 'farmer' }, true, [W(3)]);
    const H = B._send({ id: 'me', p: A.me }, B._worst('me'), 'open');
    H.peaceful = true;
    for (const v of H.P.members) { v.x = 6; }
    B._hunt(H, 0.5);
    assert.match(B.hear(H.P.members[0], 'нет, не заплачу'), /Взять/);
    assert.equal(H.phase, 'fight');
    assert.ok(H.P.members.every((v) => v.foe === 'me'));
    // a cave
    const C = fake();
    const B2 = new Bounty(C.g);
    for (let i = 0; i < 3; i++) B2.crime(town, 'me', { role: 'farmer' }, true, [W(3)]);
    const H2 = B2._send({ id: 'me', p: C.me }, B2._worst('me'), 'open');
    C.g.castleLife._sees = () => false;
    C.g._inCave = true;
    H2.t = 100; H2.seenAt = 0;
    B2._hunt(H2, 0.5);
    assert.equal(H2.P.dest.name, 'след', 'to the last place they saw him');
    for (const v of H2.P.members) { v.x = H2.last.x; v.z = H2.last.z; }
    B2._hunt(H2, 0.5);
    assert.ok(!B2.hunts.size, 'lost him: the hunt is over');
    assert.equal(B2._where('me', C.me), 'cave');
    assert.equal(findChance(B2._where('me', C.me)), 0, 'in a cave nobody finds him');
    // the house
    const D = fake();
    D.g.houseMagic = { _key: () => 'k', list: new Map([['h', { owner: 'k', x: 2, z: 2 }]]) };
    const B3 = new Bounty(D.g);
    for (let i = 0; i < 3; i++) B3.crime(town, 'me', { role: 'farmer' }, true, [W(3)]);
    assert.equal(B3._where('me', D.me), 'home');
    const H3 = B3._send({ id: 'me', p: D.me }, B3._worst('me'), 'home');
    assert.equal(H3.phase, 'door');
    D.g.castleLife._sees = () => false;
    for (const v of H3.P.members) { v.x = 2; v.z = 12; }
    for (let t = 0; t < BOUNTY.KNOCK_S + 2; t += 0.5) { if (!B3.hunts.size) break; B3._hunt(H3, 0.5); }
    assert.ok(D.said.some((t) => /Откройте|дверь|выйди/.test(t)), 'they knock');
    assert.ok(H3.P.members.every((v) => !v.foe), 'nobody broke in or attacked');
    assert.ok(!B3.hunts.size, 'they went away');
});

test('the memory fades each game day and is gone after 10; nobody alive who knew the face — nobody to tell', async () => {
    const { memoryOf, policeChance, darkK } = await import('../../src/game/BountyRules.js');
    assert.equal(memoryOf({ day: 0 }, 0), 1);
    assert.ok(Math.abs(memoryOf({ day: 0 }, 2) - 0.8) < 1e-9, 'two days later: still remembered');
    assert.equal(memoryOf({ day: 0 }, 10), 0);
    assert.ok(darkK(100) === 2 && darkK(0) === 1, 'the darker, the easier to find');
    assert.equal(policeChance({ heat: 3 }, 1, { disguised: true }), 0);
    assert.ok(policeChance({ heat: 3 }, 1, { helmet: true }) < policeChance({ heat: 3 }, 1, {}));
    const { g } = fake();
    const killed = new Set();
    g.castleLife.state = () => ({ killed });
    const B = new Bounty(g);
    for (let i = 0; i < 3; i++) B.crime(town, 'me', { role: 'farmer' }, true, [{ x: 3, z: 0, idx: 10 + i }]);
    assert.ok(B._worst('me'));
    B.days = 9.5;
    assert.ok(B._worst('me'), 'nine days and a half: still');
    killed.add(10); killed.add(11); killed.add(12);
    assert.ok(!B._worst('me'), 'all who knew the face are dead: nobody can tell');
    for (let i = 0; i < 3; i++) B.crime(town, 'me', { role: 'farmer' }, true, [{ x: 3, z: 0, idx: 20 + i }]);
    B.days += 10.01;
    assert.ok(!B._worst('me'), 'ten game days: forgotten');
});

test('a hunter got away: the record fresh, staying near that place — found twice as easily; the town guard knows the face', () => {
    const { g, me } = fake();
    const B = new Bounty(g);
    for (let i = 0; i < 3; i++) B.crime(town, 'me', { role: 'farmer' }, true, [W(3)]);
    const H = B._send({ id: 'me', p: me }, B._worst('me'), 'open');
    H.peaceful = false;
    for (const v of H.P.members) v.x = 6;
    B._hunt(H, 0.5);
    assert.equal(H.phase, 'fight');
    for (const v of H.P.members.slice(1)) v.dead = true;
    H.P.members[0].hp = 10; H.P.members[0].maxHp = 100;
    B.days = 5;
    B._hunt(H, 0.5);
    const r = B.recs.get('me').get('c1');
    assert.ok(r.reported && r.lastSeen && r.day === 5, 'he told them');
    assert.ok(findChance('open', false, false, { stayed: true }) > findChance('open'));
    // the town guard
    const guard = { id: 'k', x: 305, z: 0, foe: null };
    const cs = { def: { ...town.def, zone: 60 }, awake: true, hostile: new Map(), active: new Map([['k', guard]]) };
    g.castleLife.castles = new Map([['c1', cs]]);
    g.castleLife._inLand = () => true;
    me.x = 300;
    const R = Math.random; Math.random = () => 0.001;
    try { B._police(); } finally { Math.random = R; }
    assert.equal(guard.foe, 'me', 'the guard of that very town knew him');
});

test('his house: a blue sphere is never touched (they call and go); a plainly black one — the wizards break it', () => {
    for (const black of [false, true]) {
        const D = fake();
        const wards = new Map([['w1', { id: 'w1', owner: 'k', c: { x: 0, y: 10, z: 0 }, r: 8 }]]);
        let hits = 0;
        D.g.wards = { keyOf: () => 'k', list: wards, struck() { if (++hits >= 3) wards.delete('w1'); } };
        D.g.dark = { level: black ? 90 : 0, skin: black ? 90 : 0 };
        const B = new Bounty(D.g);
        const mageTown = { def: { ...town.def, kind: 'wizvillage' } };
        for (let i = 0; i < 3; i++) B.crime(mageTown, 'me', { role: 'farmer' }, true, [W(3)]);
        const H = B._send({ id: 'me', p: D.me }, B._worst('me'), 'home');
        assert.equal(H.phase, 'door');
        D.g.castleLife._sees = () => false;
        for (const v of H.P.members) { v.x = 0; v.z = 12; }
        for (let t = 0; t < 100 && B.hunts.size; t += 0.5) B._hunt(H, 0.5);
        if (black) { assert.ok(hits >= 3 && H.phase === 'fight', 'the black sphere broken, the fight'); }
        else { assert.equal(hits, 0, 'a blue sphere: not a blow'); assert.ok(H.P.members.every((v) => !v.foe)); }
    }
});
