import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../../src/game/ShipLayout.js';
import { ShipPose } from '../../src/game/ShipCollision.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';
import { Ships } from '../../src/game/Ships.js';
import { Sailors } from '../../src/game/Sailors.js';
import { FleetOrders } from '../../src/game/FleetOrders.js';
import { FLEET, broadside, gunsBear, beamTurn, yawFacing, lineOfFire, parseCrewOrder, angleDiff } from '../../src/game/FleetMath.js';

// ------------------------------------------------------------------ whose the ship is
const castles = { port: { owner: 'king' }, other: { owner: 'rival' }, empty: { owner: null } };
const shipsLike = (localId = 'king') => ({ game: { localId, castleLife: { state: (id) => castles[id] } }, ownerOf: Ships.prototype.ownerOf, loyalTo: Ships.prototype.loyalTo });

test('loyalTo: the owner of the castle of her port is the ship\'s master — and the one who took her', () => {
    const S = shipsLike();
    const lt = (s, id) => S.loyalTo(s, id);
    assert.equal(lt({ castleId: 'port', owner: null }, 'king'), true, 'the king of the port');
    assert.equal(lt({ castleId: 'port', owner: null }, 'local'), true, 'the local alias');
    assert.equal(lt({ castleId: 'port', owner: null }, 'stranger'), false);
    assert.equal(lt({ castleId: 'other', owner: null }, 'king'), false, 'another port\'s ship is not his');
    assert.equal(lt({ castleId: 'empty', owner: null }, 'king'), false, 'a port nobody holds');
    assert.equal(lt({ castleId: null, owner: 'king' }, 'king'), true, 'taken by him');
    assert.equal(lt({ castleId: 'other', owner: 'king' }, 'king'), true, 'taken from another port');
    assert.equal(lt({ castleId: 'port', owner: 'pirate' }, 'king'), true, 'her own port\'s king still (the port)');
    assert.equal(lt({ castleId: null, owner: null }, 'king'), false);
    assert.equal(lt({ castleId: 'port', owner: null }, null), false);
});

test('the crew does not turn on its master (provoke) and does on a stranger', () => {
    const S = shipsLike();
    const spoken = [];
    const game = { localId: 'king', castleLife: null, hud: { setVoice() {} }, sync: null };
    const crew = {
        auth: true, game, ships: S, crews: new Map(),
        alive: () => 3, _say(v, t) { spoken.push(t); },
    };
    const s = { id: 'sh1', castleId: 'port', owner: null, hostile: new Map() };
    crew.crews.set(s.id, [{ id: 'a', dead: false }]);
    Sailors.prototype.provoke.call(crew, s, 'king', 'x');
    assert.equal(s.hostile.size, 0, 'the king is nobody\'s foe');
    Sailors.prototype.provoke.call(crew, s, 'stranger', 'x');
    assert.equal(s.hostile.has('stranger'), true, 'a stranger is');
    // the ship taken from the crew: her new master is spared as well
    const t = { id: 'sh2', castleId: null, owner: 'pirate-slayer', hostile: new Map() };
    crew.crews.set(t.id, [{ id: 'b', dead: false }]);
    Sailors.prototype.provoke.call(crew, t, 'pirate-slayer', 'x');
    assert.equal(t.hostile.size, 0);
});

// ------------------------------------------------------------------ what was said
test('the orders: каждая фраза понята как нужно', () => {
    const k = (t) => parseCrewOrder(t)?.kind || null;
    assert.equal(k('К бою!'), 'battle');
    assert.equal(k('Пушки к бою'), 'battle');
    assert.equal(k('Приготовиться'), 'battle');
    assert.equal(k('Огонь!'), 'fire');
    assert.equal(k('Залп'), 'fire');
    assert.equal(k('Заряжай'), 'load');
    assert.equal(k('На абордаж!'), 'board');
    assert.equal(k('Отбой'), 'cease');
    assert.equal(k('Отставить огонь'), 'cease');
    assert.equal(k('Паруса поднять'), 'sails');
    assert.equal(parseCrewOrder('Поднять паруса').open, true);
    assert.equal(parseCrewOrder('Паруса убрать').open, false);
    assert.equal(parseCrewOrder('Отдать швартовы').kind, 'cast');
    assert.deepEqual(parseCrewOrder('Поворот налево'), { kind: 'turn', dir: -1 });
    assert.deepEqual(parseCrewOrder('Поворот направо'), { kind: 'turn', dir: 1 });
    assert.equal(parseCrewOrder('Огонь по кораблю').target, 'ship');
    assert.equal(parseCrewOrder('Огонь по тому кораблю').target, 'aim');
    assert.equal(parseCrewOrder('Стреляй по башне порта').target, 'shore');
    assert.equal(parseCrewOrder('Огонь!').target, 'any');
    // talk is not an order
    for (const t of ['Привет, моряки', 'Где капитан?', 'Куда плывём?', 'Сколько стоит этот корабль', 'Я хочу узнать, что у вас в трюме, и как давно вы служите капитану на этом корабле']) assert.equal(parseCrewOrder(t), null, t);
});

// ------------------------------------------------------------------ the side
test('broadside: the side that looks at the target, in all 8 directions', () => {
    // (ship frame: x starboard, z aft; the bow is −z)
    const cases = [
        [0, -50, 'прямо по курсу'], [40, -40, 'справа по носу'], [50, 0, 'правый борт'], [40, 40, 'справа по корме'],
        [0, 50, 'прямо за кормой'], [-40, 40, 'слева по корме'], [-50, 0, 'левый борт'], [-40, -40, 'слева по носу'],
    ];
    for (const [x, z, name] of cases) assert.equal(broadside(x, z).name, name, `${x},${z}`);
    assert.equal(broadside(50, 0).side, 1);
    assert.equal(broadside(-50, 5).side, -1);
    // the guns bear only abeam
    assert.equal(gunsBear(broadside(80, 3), { tol: 10 }).ok, true);
    assert.equal(gunsBear(broadside(-80, -3), { tol: 10 }).ok, true);
    assert.equal(gunsBear(broadside(40, -40), { tol: 10 }).why, 'angle');
    assert.equal(gunsBear(broadside(0, -80), { tol: 10 }).why, 'angle', 'dead ahead: no side bears');
    assert.equal(gunsBear(broadside(0, 80), { tol: 10 }).why, 'angle', 'dead astern: no side bears');
    assert.equal(gunsBear(broadside(8, 0)).why, 'near');
    assert.equal(gunsBear(broadside(FLEET.GUN_MAX + 40, 0)).why, 'far', 'out of the balls\' reach');
    assert.equal(gunsBear(broadside(100, 20), { tol: 25 }).ok, true, 'a long ship: the ball still lands on her');
    assert.equal(gunsBear(broadside(100, 40), { tol: 25 }).ok, false);
});

test('beamTurn: the turn that puts the target abeam is the shorter one, and the guns of the right side then bear', () => {
    for (const yaw of [0, 0.7, 2, -2.5, 3.1]) {
        for (const ang of [0, 0.5, 1.3, 2.2, 3.0, -0.9, -2.1]) {
            const tx = Math.sin(ang) * -100, tz = Math.cos(ang) * -100; // (a point 100 m away)
            const psi = yawFacing(0, 0, tx, tz);
            const bt = beamTurn(yaw, psi);
            assert.ok(Math.abs(bt.turn) <= Math.PI / 2 + 1e-6, 'at most a quarter turn');
            // after the turn the target is abeam, on the side bt.side
            const pose = new ShipPose().set(0, 0, 0, bt.yaw);
            const l = pose.toLocal(tx, 0, tz, { x: 0, y: 0, z: 0 });
            assert.ok(Math.abs(l.z) < 1e-6, `abeam (${yaw}, ${ang}): z=${l.z}`);
            assert.equal(Math.sign(l.x), bt.side);
        }
    }
});

// ------------------------------------------------------------------ the line of fire
test('lineOfFire: the ball flies the Cannons._fly way; a ship, the pier or the land in the way stops the salvo', () => {
    const from = { x: 0, y: 4, z: 0 };
    const probeAt = (wx, kind) => (x) => (x >= wx ? kind : null);
    // nothing in the way: clear to the target
    assert.equal(lineOfFire(from, 1, 0, 0.05, probeAt(1e9, 'x'), { reach: 120 }).clear, true);
    // our own ship / the land across the line, nearer than the target
    const own = lineOfFire(from, 1, 0, 0.05, probeAt(30, 'own'), { reach: 120 });
    assert.equal(own.clear, false); assert.equal(own.blockedBy, 'own');
    const land = lineOfFire(from, 1, 0, 0.05, probeAt(40, 'land'), { reach: 120 });
    assert.equal(land.blockedBy, 'land');
    // the target itself first: clear
    assert.equal(lineOfFire(from, 1, 0, 0.05, probeAt(60, 'target'), { reach: 120 }).clear, true);
    // gravity: a flat shot falls into the sea short of far targets
    const sea = lineOfFire(from, 0, 1, 0, () => null, { reach: 400, water: 0 });
    assert.ok(sea.clear && Math.hypot(sea.x, sea.z) < 400);
});

// ------------------------------------------------------------------ the king's orders on a real galleon
function world() {
    const spoken = [];
    const lights = [];
    const mk = (id, x, z, yaw, extra = {}) => {
        const layout = buildLayout('galleon');
        const s = {
            id, layout, cls: SHIP_CLASSES.galleon, pose: new ShipPose().set(x, 0, z, yaw), awake: true, state: 'free',
            st: { x, z, yaw, u: 0, v: 0, r: 0, wheel: 0, spellWind: { x: 0, z: 0 }, tau: 30 },
            owner: null, castleId: null, hostile: new Map(), changed: false, helmBy: null, lines: [], sails: [],
            guns: new Map(layout.cannons.map((g) => [g.id, { loaded: false, fuse: 0, recoil: 0 }])),
            racks: new Map(layout.racks.map((r) => [r.id, r.balls])),
            collider: { hasXZ: () => false, pointBlocked: () => false },
            ...extra,
        };
        return s;
    };
    const mine = mk('mine', 0, 0, 0, { castleId: 'port' });
    const foe = mk('foe', 90, 0, 0);
    const list = new Map([[mine.id, mine], [foe.id, foe]]);
    const sailors = new Map();
    const crews = new Map();
    const addCrew = (s, n) => {
        const arr = [];
        for (let i = 0; i < n; i++) {
            const gun = s.layout.cannons[i % s.layout.cannons.length];
            const v = { id: `${s.id}:c${i}`, idx: i, ship: s, crew: s, role: i === 0 ? 'captain' : 'sailor', name: 'N' + i, dead: false, overboard: null, l: { x: gun.x - gun.side * 2.6, y: gun.y, z: gun.z }, x: 0, y: 0, z: 0, hp: 10, dmg: 2, gun: null, vy: 0, stunT: 0 };
            arr.push(v); sailors.set(v.id, v);
        }
        crews.set(s.id, arr);
        return arr;
    };
    const C = {
        crews, byId: sailors, auth: true,
        alive: (s) => (crews.get(s.id) || []).filter((v) => !v.dead).length,
        _say(v, t) { spoken.push(t); },
        provoke(s, by) { s.hostile.set(by, 1); },
    };
    const cannons = {
        gunOf: (s, id) => { const spec = s.layout.cannons.find((c) => c.id === id); return spec ? { ship: s, spec, st: s.guns.get(id) } : null; },
        _muzzle: (G, out) => { const m = G.spec.muzzle; const o = G.ship.pose.toWorld(m.x, m.y, m.z, { x: 0, y: 0, z: 0 }); return out.set(o.x, o.y, o.z); },
        _event() {},
        light(G, by) { G.st.fuse = 1.6; lights.push({ id: G.spec.id, side: G.spec.side, by, ship: G.ship.id }); },
    };
    const S = {
        list, awake: [mine, foe], crew: C, cannons, rigging: { liftLine() {} }, _near: () => true,
        game: { localId: 'king', castleLife: { state: (id) => castles[id] } },
        ownerOf: Ships.prototype.ownerOf, loyalTo: Ships.prototype.loyalTo,
        pointVel: (s, x, z, out) => { out.x = 0; out.z = 0; return out; },
        setSails() { return 0; },
    };
    const game = { localId: 'king', authority: true, ships: S, terrain: null, zombies: [], castleLife: { state: (id) => castles[id], alarm() {}, night: { crewAlarm() {} } }, sound: null, remotes: new Map(), sync: null, scene: { add() {}, remove() {} }, collision: { addMover() {}, removeMover() {} } };
    S.game = game;
    const fleet = new FleetOrders(game);
    return { game, S, C, fleet, mine, foe, spoken, lights, addCrew, mk, list, crews };
}

const point = (fleet, ctx) => { // run the guns stations and load every gun by hand-time
    const f = fleet.state(ctx.mine);
    return f;
};

test('the king says «к бою»: gunners at the guns, balls from the racks are used, no orders from a stranger', () => {
    const W = world();
    W.addCrew(W.mine, 9);
    W.addCrew(W.foe, 6);
    W.fleet.execute(W.mine, { kind: 'battle' }, 'stranger');
    assert.equal(W.fleet.st.size, 0, 'a stranger gives no orders');
    W.fleet.execute(W.mine, { kind: 'battle' }, 'king');
    const f = W.fleet.state(W.mine);
    assert.equal(f.mode, 'battle');
    assert.ok(W.spoken.some((t) => /к бою|орудиям|по местам/i.test(t)), 'the captain answers');
    // a few frames: the gunners take their guns and load them from the racks
    const before = [...W.mine.racks.values()].reduce((a, b) => a + b, 0);
    for (let i = 0; i < 60; i++) W.fleet._guns(W.mine, f, 0.1);
    const after = [...W.mine.racks.values()].reduce((a, b) => a + b, 0);
    const loaded = [...W.mine.guns.values()].filter((g) => g.loaded).length;
    assert.ok(loaded >= 2, `guns loaded: ${loaded}`);
    assert.equal(before - after, loaded, 'a ball from a rack for each loaded gun');
    // the captain does not man a gun
    assert.equal(W.crews.get('mine')[0].gun, null);
});

test('«огонь по кораблю»: only the side that looks at the target fires; none bear — the ship is turned; line blocked — nothing', () => {
    const W = world();
    W.addCrew(W.mine, 12);
    W.fleet.execute(W.mine, { kind: 'battle' }, 'king');
    // the enemy right on our starboard beam (yaw 0: starboard is +x)
    W.fleet.execute(W.mine, { kind: 'fire', target: 'ship' }, 'king');
    const f = W.fleet.state(W.mine);
    assert.deepEqual(f.target, { kind: 'ship', id: 'foe' });
    for (let i = 0; i < 80; i++) W.fleet._guns(W.mine, f, 0.1);
    f.aimT = 0;
    W.fleet._firing(W.mine, f, 0.5);
    assert.ok(W.lights.length >= 1, 'a salvo');
    assert.ok(W.lights.every((l) => l.side === 1 && l.by === 'king'), 'only the starboard guns, in the king\'s name');
    // the enemy dead ahead: no side bears → the ship is turned to put her abeam (nobody at the wheel)
    const W2 = world();
    W2.addCrew(W2.mine, 12);
    W2.foe.st.x = 0; W2.foe.st.z = -90; W2.foe.pose.set(0, 0, -90, 0);
    W2.fleet.execute(W2.mine, { kind: 'fire', target: 'ship' }, 'king');
    const f2 = W2.fleet.state(W2.mine);
    f2.aimT = 0;
    W2.fleet._firing(W2.mine, f2, 0.5);
    assert.equal(W2.lights.length, 0, 'no shot into thin air');
    assert.ok(f2.auto, 'the helm turns the ship');
    assert.ok(Math.abs(angleDiff(f2.auto.yaw, W2.mine.st.yaw)) > 1.2, 'about a quarter turn');
    // a player at the wheel: the captain says he cannot
    const W3 = world();
    W3.addCrew(W3.mine, 12);
    W3.mine.helmBy = 'king';
    W3.foe.st.x = 0; W3.foe.st.z = -90; W3.foe.pose.set(0, 0, -90, 0);
    W3.fleet.execute(W3.mine, { kind: 'fire', target: 'ship' }, 'king');
    const f3 = W3.fleet.state(W3.mine);
    f3.aimT = 0;
    W3.fleet._firing(W3.mine, f3, 0.5);
    assert.equal(f3.auto, null);
    assert.ok(W3.spoken.some((t) => /не можем|не повернуть/i.test(t)));
});

test('the line of fire: our own ship or the pier across the way stops the salvo', () => {
    const W = world();
    W.addCrew(W.mine, 12);
    // another ship of the king between us and the enemy, 30 m to starboard
    const friend = W.mk('friend', 30, 0, 0, { castleId: 'port' });
    friend.collider = { hasXZ: (x, z) => Math.abs(x - 30) < 8 && Math.abs(z) < 30, pointBlocked: () => true };
    W.list.set('friend', friend); W.S.awake.push(friend);
    W.fleet.execute(W.mine, { kind: 'fire', target: 'ship' }, 'king');
    const f = W.fleet.state(W.mine);
    f.target = { kind: 'ship', id: 'foe' };
    for (let i = 0; i < 80; i++) W.fleet._guns(W.mine, f, 0.1);
    f.aimT = 0;
    W.fleet._firing(W.mine, f, 0.5);
    assert.equal(W.lights.length, 0, 'no shots through our own ship');
    assert.ok(W.spoken.some((t) => /свои|причал/i.test(t)));
    // and the pier (solid land)
    const W2 = world();
    W2.addCrew(W2.mine, 12);
    W2.game.terrain = { data: { isSolidAt: (x) => x > 25 && x < 35, seas: null } };
    W2.fleet.execute(W2.mine, { kind: 'fire', target: 'ship' }, 'king');
    const f2 = W2.fleet.state(W2.mine);
    for (let i = 0; i < 80; i++) W2.fleet._guns(W2.mine, f2, 0.1);
    f2.aimT = 0;
    W2.fleet._firing(W2.mine, f2, 0.5);
    assert.equal(W2.lights.length, 0, 'no shots into the pier');
});

test('«на абордаж» and «отбой»: the party stands ready at the rail, the grapnels fly alongside, the enemy is hauled in, the captain stays', () => {
    const W = world();
    const crew = W.addCrew(W.mine, 10);
    W.addCrew(W.foe, 6);
    W.fleet.execute(W.mine, { kind: 'board' }, 'king', null);
    const f = W.fleet.state(W.mine);
    assert.equal(f.board, 'foe');
    // not alongside yet (90 m): the helm runs her up; the boarding party is ready, nobody has leapt
    f.t = 10;
    W.fleet._boarding(W.mine, f, 0.1);
    assert.equal(f.phase, 'approach');
    assert.ok(f.auto && f.auto.gain > 5, 'the helm brings her alongside');
    const ready = crew.filter((v) => v.fleetBoard);
    assert.ok(ready.length >= 5, `boarders ready: ${ready.length}`);
    assert.ok(!crew[0].fleetBoard, 'the captain stays at his wheel');
    assert.ok(crew.length - ready.length >= 3, 'the captain and two guards stay');
    // within a leap of the grapnels: the lines fly, she is hauled in alongside, then the plank lies
    W.foe.st.x = 36; W.foe.pose.set(36, 0, 0, 0);
    W.fleet._boarding(W.mine, f, 0.1);
    assert.ok(f.lash, 'the grapnels');
    assert.equal(W.foe.lashTo, 'mine');
    assert.equal(f.lash.planks, false);
    for (let i = 0; i < 400 && f.lash.planks === false; i++) W.fleet.lashStep(W.foe, 0.1);
    assert.equal(f.lash.planks, true, 'hauled in: the plank');
    W.foe.pose.set(W.foe.st.x, 0, W.foe.st.z, W.foe.st.yaw); // (Ships._simulate then the pose)
    const gap = Math.abs(W.foe.st.x) - (W.mine.layout.B + W.foe.layout.B) / 2;
    assert.ok(Math.abs(gap - 1.6) < 0.6, `hull to hull: ${gap}`);
    assert.equal(W.fleet._reach(W.mine, W.foe).ok, true, 'a leap away');
    // «отбой»: everybody is called back, the lines are cast off at once (nobody is over there)
    W.fleet.execute(W.mine, { kind: 'cease' }, 'king');
    assert.equal(f.mode, 'idle'); assert.equal(f.board, null);
    assert.ok(crew.every((v) => !v.fleetBoard && !v.gun));
    assert.equal(f.lash, null); assert.equal(W.foe.lashTo, null, 'the enemy is let go');
    // …but not while some of the men are still over there
    W.fleet.execute(W.mine, { kind: 'board' }, 'king', null);
    W.foe.st.x = 36; W.foe.pose.set(36, 0, 0, 0);
    W.fleet._boarding(W.mine, f, 0.1);
    assert.ok(f.lash);
    crew[3].ship = W.foe; // (one of ours on her deck)
    W.fleet.execute(W.mine, { kind: 'cease' }, 'king');
    assert.ok(f.lash, 'the plank stays till he is back');
    crew[3].ship = W.mine;
    W.fleet.update(0.1);
    assert.equal(f.lash, null, 'all aboard: the lines are off');
});

test('the crew\'s foes: an enemy sailor on the deck — never the master, never a mate', () => {
    const W = world();
    const crew = W.addCrew(W.mine, 6);
    const enemy = W.addCrew(W.foe, 6);
    // a pirate of the other ship stands on our deck
    const b = enemy[2];
    b.ship = W.mine; b.l = { x: 1, y: 6, z: 2 };
    const f = W.fleet.foeFor(crew[1], W.mine);
    assert.ok(f && f.id === 'c:' + b.id, 'the boarder is the foe');
    // our own mates on the same deck are not foes
    assert.equal(W.fleet.sailorFoe(crew[1], W.mine)?.id, 'c:' + b.id);
    b.ship = b.crew; // back home
    W.fleet._intrAt = 0;
    assert.equal(W.fleet.foeFor(crew[1], W.mine), null, 'nobody aboard: no foe');
    // a boarder of ours on her deck: her crew is his foe; he is hers
    const ours = crew[3];
    ours.ship = W.foe; ours.l = { x: 0, y: 6, z: 0 };
    W.fleet._intrAt = 0;
    assert.ok(W.fleet.sailorFoe(ours, W.foe)?.id.startsWith('c:foe:'));
    assert.equal(W.fleet.sailorFoe(enemy[0], W.foe)?.id, 'c:' + ours.id, 'she fights back');
    // the zombies on our deck are foes, those on the pier are not reached
    W.game.zombies = [{ isDead: false, isFrozen: false, id: 7, gOff: 0, group: { position: { x: 1, y: 6, z: 0 } } }];
    W.fleet._intrAt = 0;
    ours.ship = W.mine; W.fleet._zc = null;
    W.mine.pose.set(0, 0, 0, 0);
    const zf = W.fleet.foeFor(crew[1], W.mine);
    assert.ok(zf && zf.id === 'c:z:7', 'a zombie aboard');
    W.game.zombies[0].group.position.x = 30;
    W.fleet._zc = null;
    assert.equal(W.fleet.foeFor(crew[1], W.mine), null, 'a zombie on the pier is out of reach');
});

test('the king hurt by a player: the crew of his ships near him turns on that player; he is hurt by himself — nothing', () => {
    const W = world();
    W.addCrew(W.mine, 6);
    W.game.character = { group: { position: { x: 3, y: 6, z: 0 } } };
    W.game.remotes.set('assassin', { position: { x: 0, y: 0, z: 0 } });
    W.fleet.kingHurt('assassin');
    assert.ok(W.mine.hostile.has('assassin'), 'the crew answers');
    W.mine.hostile.clear();
    W.fleet.kingHurt('king'); W.fleet.kingHurt(null); W.fleet.kingHurt('fall');
    assert.equal(W.mine.hostile.size, 0);
});

test('every ship class: the crew stations (gun spots) lie on the deck inside the rails', async () => {
    const { floorAt, hullHalfWidth } = await import('../../src/game/ShipLayout.js');
    for (const c of ['pinnace', 'fluyt', 'galleon']) {
        const L = buildLayout(c);
        for (const g of L.cannons) {
            const x = g.x - g.side * 2.6;
            const f = floorAt(L, x, g.z, g.y + 1.5);
            assert.ok(f !== null && Math.abs(f - g.y) < 1.2, `${c} ${g.id}: a floor at the gunner's place`);
            assert.ok(Math.abs(x) < hullHalfWidth(L, g.z, g.y) - 0.5, `${c} ${g.id}: inboard`);
        }
        // the gangway points the boarders use are on the deck as well
        assert.ok(hullHalfWidth(L, L.gangZ, L.deck) > 3, `${c} gangway`);
    }
});
