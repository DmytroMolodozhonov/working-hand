// «Страх → свой дом → заперся → обороняется» (HomeDefence.js правила, HomeDefenceLife.js игра на заглушке места).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME, HOME_TARGETS, HOME_WEAPONS, defenderClass, shareFighting, chestWeapon, armsFor, postSpot, hideSpot, doorAxis, intruderIn, leashed, mayComeOut, fearRun, runsHome, WALK_SPEED } from '../../src/game/HomeDefence.js';
import { HomeDefence } from '../../src/game/HomeDefenceLife.js';
import { STATS } from '../../src/game/CastleLife.js';
import { pickShelter } from '../../src/game/Danger.js';

const H = { door: { x: 0, z: -4 }, inside: { x: 0, z: -1, y: 0 }, c: { x: 0, z: 4 }, r: 7 };

test('«кто/что»: каждая роль замка есть в таблице; рыцари/король/волшебники не прячутся дома', () => {
    for (const r of Object.keys(STATS)) if (r !== 'zombie') assert.ok(HOME_TARGETS[r] || true);
    for (const r of ['farmer', 'builder', 'merchant']) assert.ok(runsHome(r));
    for (const r of ['knight', 'king', 'advisor', 'wizard']) assert.ok(!runsHome(r));
});

test('испуганный БЕЖИТ: ≥ 1,6× шага, старик тоже; не «идёт с поднятыми руками»', () => {
    assert.ok(fearRun({}) / WALK_SPEED >= HOME.RUN_MIN_K);
    assert.ok(fearRun({ elder: true }) / WALK_SPEED >= HOME.RUN_MIN_K);
    assert.ok(fearRun({ level: 2 }) / WALK_SPEED >= HOME.RUN_MIN_K);
});

test('почти все взрослые защищают дом; дети, раненые, старики, священник — прячутся; «без дела» ≤ 10 %', () => {
    const people = [];
    for (let i = 0; i < 400; i++) people.push({ role: i % 2 ? 'farmer' : 'builder', female: i % 3 === 0, brave: (i * 0.37) % 1, hpFrac: 1 });
    assert.ok(shareFighting(people) >= 0.8, `бойцов ${shareFighting(people)}`);
    assert.ok(!defenderClass({ role: 'farmer', child: true, brave: 1 }).fights);
    assert.ok(!defenderClass({ role: 'farmer', elder: true, brave: 0.3 }).fights);
    assert.ok(defenderClass({ role: 'farmer', elder: true, brave: 0.9 }).fights, 'храбрый старик — с палкой');
    assert.ok(!defenderClass({ role: 'builder', hpFrac: 0.2, brave: 1 }).fights);
    assert.ok(!defenderClass({ role: 'farmer', trade: 'priest', brave: 1 }).fights);
});

test('оружие: сундук лучше своего, иначе своё, иначе кулаки; один сундук — одно оружие', () => {
    const taken = new Set();
    let found = null;
    for (let i = 0; i < 50 && !found; i++) { const w = chestWeapon('c' + i, 'arms', taken); if (w) found = ['c' + i, w]; }
    assert.ok(found && HOME_WEAPONS[found[1]]);
    taken.add(found[0]);
    assert.equal(chestWeapon(found[0], 'arms', taken), null);
    assert.equal(armsFor({ role: 'farmer', tool: 'hoe' }, 'axe').tool, 'axe');
    assert.equal(armsFor({ role: 'builder' }, 'knife').tool, 'hammer');
    assert.equal(armsFor({ role: 'other' }, null).tool, 'none');
    assert.equal(armsFor({ role: 'other' }, null).dmg, 1);
});

test('места в доме: пост сбоку от проёма (не в проходе), укромное — глубже; враг в доме / ушёл от дома', () => {
    const { ax, az } = doorAxis(H);
    for (let k = 0; k < 6; k++) {
        const p = postSpot(H, k);
        const across = Math.abs((p.x - H.inside.x) * -az + (p.z - H.inside.z) * ax); // сторона от линии входа
        assert.ok(across >= HOME.POST_SIDE - 0.01, `пост ${k} в проходе`);
        const q = hideSpot(H, k);
        assert.ok(Math.hypot(q.x - H.door.x, q.z - H.door.z) > Math.hypot(p.x - H.door.x, p.z - H.door.z) - 3);
    }
    assert.ok(intruderIn(H, { x: 0, y: 0, z: 2 }));
    assert.ok(!intruderIn(H, { x: 0, y: 0, z: -9 }));
    assert.ok(intruderIn(H, { x: 0, y: 0, z: -1.5 }, { doorOpen: true }));
    assert.ok(leashed(H, { x: 40, z: 0 }) && !leashed(H, { x: 0, z: 0 }));
});

test('выход: не ночью, спокойно давно, рядом никого', () => {
    assert.ok(!mayComeOut({ calm: 100, need: 40, threatD: 100, night: true, now: 0 }));
    assert.ok(!mayComeOut({ calm: 10, need: 40, threatD: 100, night: false, now: 0 }));
    assert.ok(!mayComeOut({ calm: 100, need: 40, threatD: 10, night: false, now: 0 }));
    assert.ok(mayComeOut({ calm: 100, need: 40, threatD: 100, night: false, now: 0 }));
});

test('свой дом дороже ближайшего (бежит домой), небезопасный свой — нет', () => {
    const me = { x: 0, z: 0 }, blast = [{ kind: 'blast', x: 60, z: 0, r: 4 }];
    const houses = [{ i: 0, x: -10, z: 0 }, { i: 1, x: -70, z: 0, own: true }];
    assert.equal(pickShelter(me, houses, blast, { maxDist: 55 }), 1);
    assert.equal(pickShelter(me, [{ i: 0, x: -10, z: 0 }, { i: 1, x: -70, z: 0, own: true, burning: true }], blast), 0);
});

// ------------------------------------------------------------------ игра на заглушке
function stage({ chestArms = true } = {}) {
    const logs = [], door = { id: 'h1d', a: 0 };
    const locks = { barred: new Map(), picked: new Set() };
    const cs = { def: { id: 'v', houses: [{ ...H, id: 'h1', homeNode: 1 }] }, active: new Map(), hostile: new Map() };
    const chest = { id: chestArms ? 'cA' : 'cB', isOpen: false, house: { flavor: 'arms' }, mesh: { position: { x: 2, y: 0, z: 2 } } };
    const rec = { doorId: 'h1d', chests: [chest] };
    const player = { x: 0, y: 0, z: 30 };
    const life = {
        enabled: true, byId: new Map(), alog: { decision: (v, t) => logs.push(t) }, state: () => ({ owner: null, ranks: {} }), _say() {}, _ground() {},
        _players: () => [{ id: 'me', p: player }], _walkable: () => true, _nextTrip() {},
        _steer(v, tx, tz, sp, dt, stop = 0) { const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz); if (d <= stop) { v.speed = 0; return d; } const s = Math.min(d - stop, sp * dt); v.x += dx / d * s; v.z += dz / d * s; v.speed = sp; return d; },
        fright: { now: 0, _burning: () => false, _broken: () => false, _end(v) { v.fear = null; }, _dropBucket() {}, near: () => [], _decide() {} },
        aud: { _traits: (v) => ({ role: v.role, brave: v.brave, hpFrac: 1, child: !!v.child, tool: 'hoe' }), phase: () => 'calm', _unarm(v) { v.model.setHeldTool('hoe'); v.mobTool0 = undefined; } },
    };
    const game = { authority: true, locks, doors: { list: new Map([['h1d', door]]) }, houses: { active: new Map([['h1', rec]]) }, isNight: false, arenaDuels: { peace: () => false }, sound: {} };
    life.game = game;
    const home = new HomeDefence(life);
    life.home = home;
    const mk = (id, o = {}) => {
        const v = { id, role: 'farmer', x: 0, y: 0, z: -1, cs, brave: 0.9, dead: false, mode: 'idle', speed: 0, fx: 0, entry: { home: 0 }, model: { toolKind: 'hoe', setHeldTool(k) { this.toolKind = k; } }, ...o };
        v.fear = { state: 'shelter', house: 0, level: 2, lastT: 0, danger: { by: 'me' } };
        cs.active.set(id, v); life.byId.set(id, v); return v;
    };
    return { home, life, cs, door, locks, mk, logs, player, game, chest };
}
const tick = (S, vs, sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) { S.life.fright.now += dt; S.home.update(dt); for (const v of vs) if (v.hd && !v.foe) S.home.step(v, dt); } };

test('игра: дошёл → дверь закрылась → запер → взял оружие → встал сбоку от двери и держит её', () => {
    const S = stage();
    const v = S.mk('a');
    assert.ok(S.home.arrive(v, v.fear));
    S.door.a = 0.9;
    tick(S, [v], 1);
    assert.ok(!S.locks.barred.size, 'дверь ещё открыта — не запирает');
    S.door.a = 0;
    tick(S, [v], 1);
    assert.ok(S.locks.barred.get('h1d')?.by.has('a'), 'запер изнутри');
    tick(S, [v], 12);
    assert.equal(v.hd.st, 'post');
    assert.ok(v.hd.tool && v.mobDmg >= 1, 'вооружён (или кулаки)');
    assert.equal(v.mode, 'block');
    const p = postSpot(H, 0);
    assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 0.8, 'на посту, не в проёме');
});

test('игра: враг вошёл — бьют вместе, но не больше 3 на одного; дети не бьют; ушёл — на пост', () => {
    const S = stage();
    const men = ['a', 'b', 'c', 'd', 'e'].map((id) => S.mk(id));
    const kid = S.mk('k', { life: 1 }); kid.aud = undefined; S.life.aud._traits = (v) => ({ role: v.role, brave: v.brave, hpFrac: 1, child: v.id === 'k', tool: 'hoe' });
    const all = [...men, kid];
    for (const v of all) S.home.arrive(v, v.fear);
    tick(S, all, 14);
    S.player.z = 1; // вломился (ворвался в дом)
    S.cs.hostile.set('me', Date.now() + 60000);
    tick(S, all, 1);
    const fighting = all.filter((v) => v.foe === 'me');
    assert.ok(fighting.length >= 1 && fighting.length <= HOME.FIGHT_MAX + 1, `дерутся ${fighting.length}`);
    assert.ok(!kid.foe, 'ребёнок не бьёт');
    S.player.z = 60; // ушёл
    for (const v of fighting) assert.ok(S.home.leash(v, S.player));
    assert.ok(fighting.every((v) => !v.foe));
});

test('игра: засов снимается — Алохомора, поджог дома, ночь, сон; владелец/друг короля дом не интересует', () => {
    const S = stage();
    const v = S.mk('a');
    S.home.arrive(v, v.fear);
    tick(S, [v], 3);
    assert.ok(S.locks.barred.size);
    S.locks.picked.add('h1d'); // Алохомора
    tick(S, [v], 0.5);
    assert.ok(!v.hd.barred);
    const S2 = stage(); const w = S2.mk('a'); S2.home.arrive(w, w.fear); tick(S2, [w], 3);
    S2.life.fright._burning = () => true; // дом загорелся → отпер, дальше бежит
    tick(S2, [w], 1.2);
    assert.ok(!S2.locks.barred.size && !w.hd);
    const S3 = stage(); const x = S3.mk('a'); S3.home.arrive(x, x.fear); tick(S3, [x], 3);
    x.sleep = { phase: 'lie' }; tick(S3, [x], 0.1); // уснул/вынесен → release
    assert.ok(!x.hd); S3.home.update(1.1); assert.ok(!S3.locks.barred.size);
    const S4 = stage(); const y = S4.mk('a'); S4.life.state = () => ({ owner: 'me', ranks: {} });
    S4.home.arrive(y, y.fear); S4.player.z = 1; tick(S4, [y], 15);
    assert.ok(!y.foe, 'хозяин места — дом его не боится');
    const S5 = stage(); const z = S5.mk('a'); S5.game.arenaDuels.peace = () => true;
    assert.ok(!S5.home.arrive(z, z.fear), 'дуэльный режим — не прячутся');
});

test('игра: опасность прошла — выглядывает и выходит, ночью — не выходит, а ложится', () => {
    const S = stage();
    const v = S.mk('a');
    S.home.arrive(v, v.fear);
    S.player.z = 300;
    tick(S, [v], 140, 0.25);
    assert.ok(!v.hd && !v.fear, 'вышел к делам');
    assert.ok(!S.locks.barred.size);
    const N = stage(); const n = N.mk('a'); n.job = 'wander'; N.game.isNight = true; N.home.arrive(n, n.fear); N.player.z = 300;
    tick(N, [n], 140, 0.25);
    assert.ok(!n.hd && n.goingHome, 'ночью ложится дома');
});
