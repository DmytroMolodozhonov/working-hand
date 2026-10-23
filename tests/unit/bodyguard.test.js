// The king's bodyguards: who is the first enemy, the formation round him, the owner is never a target,
// help without an order on the castle's land, «охраняй меня».
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARD, guardSlots, matchSlots, assignFoes, rankThreats, isLord, isHurt, Bodyguard } from '../../src/game/Bodyguard.js';
import { detectOrder, validateCall, ARMY } from '../../src/ai/TalkActions.js';

const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;

test('formation: two ahead, one each side, one behind; 3–6 m, never on the owner or each other', () => {
    const m = { x: 100, z: 50 };
    for (const n of [1, 3, 5, 9, 14]) {
        const s = guardSlots(m, 0.7, n, { moving: true });
        assert.equal(s.length, n);
        for (const p of s) { const r = Math.hypot(p.x - m.x, p.z - m.z); assert.ok(r >= 3 && r <= 8.1, `r=${r}`); }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(!near(s[i], s[j], 1.6), `slots ${i},${j} too close at n=${n}`);
    }
    const s5 = guardSlots({ x: 0, z: 0 }, 0, 5);
    assert.ok(s5[0].x > 3 && s5[1].x > 3 && Math.sign(s5[0].z) !== Math.sign(s5[1].z), 'two ahead');
    assert.ok(s5[4].x < -3, 'one behind');
});

test('a hurt owner: a closer ring', () => {
    const far = guardSlots({ x: 0, z: 0 }, 0, 5), close = guardSlots({ x: 0, z: 0 }, 0, 5, { hurt: true });
    assert.ok(Math.hypot(close[2].x, close[2].z) < Math.hypot(far[2].x, far[2].z));
    assert.ok(isHurt(30, 100)); assert.ok(!isHurt(40, 100)); assert.ok(!isHurt(100, 100));
});

test('slots go to the nearest guard (no crossing)', () => {
    const slots = [{ x: 5, z: 0 }, { x: -5, z: 0 }];
    const r = matchSlots([{ x: -4, z: 1 }, { x: 4, z: -1 }], slots);
    assert.equal(r[0], slots[1]); assert.equal(r[1], slots[0]);
});

test('the one who is at the owner is the FIRST target (above a nearer, random enemy)', () => {
    const guards = [{ x: 2, z: 0 }, { x: -2, z: 0 }];
    const T = [
        { key: 'z:1', kind: 'z', x: 3, z: 3, hits: false, dMaster: 4 }, // (nearer, but it only comes)
        { key: 'z:2', kind: 'z', x: 14, z: 0, hits: true, dMaster: 14 }, // (hit the owner)
    ];
    const r = assignFoes(guards, rankThreats(T), { x: 0, z: 0, hurt: false });
    assert.ok(r.some((t) => t && t.key === 'z:2'));
    assert.equal(rankThreats(T)[0].key, 'z:2');
});

test('at most 3 on one, the others take the rest; dragon: nobody attacks (cover)', () => {
    const guards = Array.from({ length: 6 }, (_, i) => ({ x: i, z: 0 }));
    const r = assignFoes(guards, [{ key: 'z:1', kind: 'z', x: 5, z: 5, hits: true, dMaster: 5 }], { x: 0, z: 0, hurt: false });
    assert.equal(r.filter(Boolean).length, GUARD.ON_FOE);
    const d = assignFoes(guards, [{ key: 'D:1', kind: 'D', x: 5, z: 5, hits: true, dMaster: 5 }], { x: 0, z: 0, hurt: false });
    assert.ok(d.every((t) => t === null));
});

test('leashes: free follower goes farther than a strict guard; hurt owner — near only; those at the owner always', () => {
    const g = [{ x: 0, z: 0 }], gs = [{ x: 0, z: 0, strict: true }];
    const far = [{ key: 'z:1', kind: 'z', x: 25, z: 0, hits: false, dMaster: 25 }];
    assert.ok(assignFoes(g, far, { x: 0, z: 0, hurt: false })[0]);
    assert.equal(assignFoes(gs, far, { x: 0, z: 0, hurt: false })[0], null);
    assert.equal(assignFoes(g, far, { x: 0, z: 0, hurt: true })[0], null);
    assert.ok(assignFoes(gs, [{ ...far[0], hits: true }], { x: 0, z: 0, hurt: true })[0]);
});

test('hurt owner: one guard always stays at his side', () => {
    const guards = [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }];
    const T = [{ key: 'z:1', kind: 'z', x: 5, z: 0, hits: true, dMaster: 5 }, { key: 'z:2', kind: 'z', x: 5, z: 1, hits: true, dMaster: 5 }, { key: 'z:3', kind: 'z', x: 5, z: 2, hits: true, dMaster: 5 }];
    assert.equal(assignFoes(guards, T, { x: 0, z: 0, hurt: true }).filter(Boolean).length, 2);
});

test('the owner is never the enemy of his men', () => {
    assert.ok(isLord({ follow: 'P1' }, 'P1')); assert.ok(isLord({ gOwner: 'P1' }, 'P1')); assert.ok(isLord({}, 'P1', 'P1'));
    assert.ok(!isLord({ follow: 'P1' }, 'P2')); assert.ok(!isLord({}, null));
});

// ------------------------------------------------------------------ the class on a small stage
function stage({ zombies = [], knights = 4, ownerHp = 100 } = {}) {
    const owner = 'P1';
    const mp = { x: 0, y: 2, z: 0 };
    const said = [];
    const def = { id: 'c1' };
    const cs = { awake: true, def, active: new Map(), hostile: new Map() };
    const byId = new Map();
    for (let i = 0; i < knights; i++) {
        const v = { id: i + 1, role: 'knight', x: 3 + i, y: 0, z: 2 - i, cs, follow: owner, followFar: true, followT: 600, hp: 10 };
        cs.active.set(i + 1, v); byId.set(i + 1, v);
    }
    const life = {
        castles: new Map([['c1', cs]]), byId,
        state: () => ({ owner }),
        _fights: (v) => v.role === 'knight', _playerPos: (id) => (id === owner ? mp : null),
        _inLand: () => true, _say: (v, t) => said.push(t), _isPlayer: (id) => id === owner || id === 'P2',
    };
    life.game = { zombies, localId: owner, remotes: new Map(), combat: { enabled: true, hp: ownerHp, maxHp: 100 }, isNight: false, collision: { lineOfSight: () => true } };
    const guard = new Bodyguard(life);
    return { guard, life, cs, mp, said, owner };
}
const zom = (id, x, z) => ({ id, isDead: false, group: { position: { x, y: 2, z } } });

test('zombies from several sides: the one that hit the king is the first foe; he is never a foe; formation set', () => {
    const zs = [zom(1, 30, 0), zom(2, -20, 5), zom(3, 3, 0)];
    const S = stage({ zombies: zs });
    S.guard.masterHurt(S.owner, null, 'zombie'); // (the king was hit; zombie 3 is at his elbow)
    S.guard.update(0.5);
    const knights = [...S.cs.active.values()];
    const foes = knights.map((v) => v.gFoe?.key);
    assert.ok(foes.includes('z:3'), 'the zombie at the king is taken');
    assert.equal(foes.filter((k) => k === 'z:3').length, GUARD.ON_FOE, 'three on it, no more');
    assert.ok(knights.every((v) => v.gOwner === 'P1'));
    assert.ok(knights.every((v) => v.foe == null));
    assert.ok(S.said.length > 0, 'a cry');
    // (all the swords at the king's foe first: z:1 / z:2 get the rest)
    const second = knights.find((v) => v.gFoe && v.gFoe.key !== 'z:3');
    assert.ok(!second || ['z:1', 'z:2'].includes(second.gFoe.key));
});

test('seen before it strikes: a zombie in sight is met; behind a wall only heard near', () => {
    const S = stage({ zombies: [zom(1, 30, 0)] });
    S.guard.update(0.5);
    assert.ok([...S.cs.active.values()].some((v) => v.gFoe?.key === 'z:1'));
    const W = stage({ zombies: [zom(1, 30, 0)] });
    W.life.game.collision.lineOfSight = () => false;
    W.guard.update(0.5);
    assert.ok([...W.cs.active.values()].every((v) => !v.gFoe), 'a wall: not seen at 30 m');
    const N = stage({ zombies: [zom(1, 30, 0)] });
    N.life.game.isNight = true;
    N.guard.update(0.5);
    assert.ok([...N.cs.active.values()].every((v) => !v.gFoe), 'night: 22 m sight');
});

test('the mark stays while the creature is seen and goes when it is dead', () => {
    const z = zom(3, 3, 0);
    const S = stage({ zombies: [z], knights: 2 });
    S.guard.masterHurt(S.owner, null, 'zombie');
    S.guard.update(0.5);
    z.group.position.x = 30; // (ran off, still in sight)
    S.guard._t = 0; S.guard.update(0.5);
    assert.ok([...S.cs.active.values()].some((v) => v.gFoe?.key === 'z:3'));
    z.isDead = true;
    S.life.game.zombies = [];
    S.guard._t = 0; S.guard.update(0.5);
    assert.ok([...S.cs.active.values()].every((v) => !v.gFoe));
});

test('a servant of the king is not an enemy; a hostile knight who goes at him is', () => {
    const z = zom(1, 5, 0); z.isThrall = true; z.thrallOwner = 'P1';
    const S = stage({ zombies: [z] });
    S.guard.update(0.5);
    assert.ok([...S.cs.active.values()].every((v) => !v.gFoe));
    const other = { cs: { def: { id: 'c2' } }, id: 99, x: 8, y: 0, z: 0, foe: 'P1' };
    S.life.byId.set(99, other);
    S.life.state = (id) => ({ owner: id === 'c1' ? 'P1' : null });
    S.guard._t = 0; S.guard.update(0.5);
    assert.ok([...S.cs.active.values()].some((v) => v.gFoe?.key === 'v:99'));
});

test('help without an order: the nearest knights run to the king on the castle land; and go back after', () => {
    const S = stage({ zombies: [zom(3, 3, 0)] });
    for (const v of S.cs.active.values()) { v.follow = null; v.followFar = false; } // (nobody sworn)
    S.guard.masterHurt(S.owner, null, 'zombie');
    S.guard.update(0.5);
    const k = [...S.cs.active.values()];
    assert.ok(k.every((v) => v.gOwner === 'P1' && v.gHelp > 0), 'they come');
    assert.ok(k.some((v) => v.gFoe?.key === 'z:3'));
    // busy ones (a fire, asleep, a fight of their own) do not
    const B = stage({ zombies: [zom(3, 3, 0)], knights: 2 });
    for (const v of B.cs.active.values()) { v.follow = null; v.followFar = false; }
    [...B.cs.active.values()][0].fireT = 3; [...B.cs.active.values()][1].foe = 'P2';
    B.guard.masterHurt(B.owner, null, 'zombie');
    B.guard.update(0.5);
    assert.ok([...B.cs.active.values()].every((v) => v.gOwner == null));
    // off the castle's land: only the sworn ones
    const O = stage({ zombies: [zom(3, 3, 0)] });
    O.life._inLand = () => false;
    for (const v of O.cs.active.values()) { v.follow = null; v.followFar = false; }
    O.guard.masterHurt(O.owner, null, 'zombie');
    O.guard.update(0.5);
    assert.ok([...O.cs.active.values()].every((v) => v.gOwner == null));
});

test('a player who hit the king (PvP) is taken as the castle\'s enemy by the guard', () => {
    const S = stage({ knights: 2 });
    S.life._playerPos = (id) => ({ P1: S.mp, P2: { x: 6, y: 2, z: 0 } })[id] || null;
    S.guard.masterHurt('P1', 'P2', 'melee');
    S.guard.update(0.5);
    const v = [...S.cs.active.values()].find((x) => x.gFoe);
    assert.equal(v.gFoe.kind, 'p');
    assert.equal(v.gFoe.id, 'P2');
});

test('«охраняй меня» is a king\'s order in words and in the rules', () => {
    for (const t of ['охраняй меня', 'защищай меня', 'будь рядом', 'будь рядом со мной', 'прикрывай меня', 'охраняйте государя']) assert.equal(detectOrder(t)?.name, 'guard_me', t);
    assert.equal(detectOrder('защищайте замок')?.name, 'defend_castle');
    assert.equal(detectOrder('охраняйте ворота')?.name, 'defend_castle');
    assert.ok(ARMY.has('guard_me'));
    assert.ok(validateCall({ name: 'guard_me', args: {} }, { role: 'knight', playerIsKing: true }).ok);
    assert.equal(validateCall({ name: 'guard_me', args: {} }, { role: 'knight', playerIsKing: false }).ok, false);
});
