import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AUD, DEEDS, blank, valueOf, deed, ease, phaseOf, fightsInMob, leavesVillage, weaponFor, ROLE_MOB, MOB, musterSpot, goNow, pickLeader,
    EXODUS, refugeSpot, mayReturn, withTool, toolOf, MOB_TOOLS,
} from '../../src/game/Audacity.js';
import { AudacityLife } from '../../src/game/AudacityLife.js';

// ------------------------------------------------------------------ the rules
test('audacity: a deed with witnesses grows it; without any witness — nothing', () => {
    const seen = deed(blank(), 'rob', { witnesses: 2 });
    assert.ok(valueOf(seen.rec) >= DEEDS.rob, `${valueOf(seen.rec)}`);
    const unseen = deed(blank(), 'slay', { witnesses: 0 });
    assert.equal(valueOf(unseen.rec), 0);
    assert.equal(unseen.add, 0);
});

test('audacity: one blow is little; a murder is fear but not yet a crowd; murder + robbery = a crowd', () => {
    const blow = deed(blank(), 'hurt', { witnesses: 1, victimId: 'a', now: 0 });
    assert.ok(valueOf(blow.rec) < AUD.WARY, `a single blow: ${valueOf(blow.rec)}`);
    const murder = deed(blank(), 'slay', { witnesses: 1, victimId: 'a', now: 0 });
    assert.equal(phaseOf(valueOf(murder.rec)), 'fear');
    const both = deed(murder.rec, 'rob', { witnesses: 1 });
    assert.equal(phaseOf(valueOf(both.rec)), 'mob');
});

test('audacity: blows at several victims weigh more than the same blow at one', () => {
    const one = blank(), many = blank();
    for (let i = 0; i < 4; i++) deed(one, 'hurt', { witnesses: 1, victimId: 'a', now: i });
    for (let i = 0; i < 4; i++) deed(many, 'hurt', { witnesses: 1, victimId: 'v' + i, now: i });
    assert.ok(valueOf(many) > valueOf(one) + 5, `${valueOf(many)} vs ${valueOf(one)}`);
});

test('audacity: it only goes down after CALM_S of quiet, slowly, and never below 0', () => {
    const r = deed(blank(), 'slay', { witnesses: 1 }).rec;
    const v0 = valueOf(r);
    for (let t = 0; t < AUD.CALM_S - 1; t++) ease(r, 1);
    assert.equal(valueOf(r), v0, 'no decay while it is recent');
    for (let t = 0; t < 60; t++) ease(r, 1);
    assert.ok(valueOf(r) < v0 && valueOf(r) > 0);
    for (let t = 0; t < 2000; t++) ease(r, 1);
    assert.equal(valueOf(r), 0);
});

test('audacity: the phases have a hysteresis (the crowd does not flicker at the threshold)', () => {
    assert.equal(phaseOf(AUD.MOB + 1, 'calm'), 'mob');
    assert.equal(phaseOf(AUD.MOB - 2, 'mob'), 'mob');
    assert.equal(phaseOf(AUD.MOB - 2, 'calm'), 'fear');
    assert.equal(phaseOf(AUD.MOB_KEEP - 1, 'mob'), 'fear');
    assert.equal(phaseOf(AUD.CALM - 1, 'fear'), 'wary');
    assert.equal(phaseOf(0, 'wary'), 'calm');
});

test('who fights and who runs: men with tools fight; women, elders, children, the wounded, the seller at the goods, the priest — run', () => {
    const man = { role: 'farmer', brave: 0.6, female: false, hpFrac: 1 };
    assert.ok(fightsInMob(man));
    assert.ok(!fightsInMob({ ...man, female: true }));
    assert.ok(!fightsInMob({ ...man, elder: true }));
    assert.ok(!fightsInMob({ ...man, child: true }));
    assert.ok(!fightsInMob({ ...man, hpFrac: 0.4 }), 'wounded');
    assert.ok(!fightsInMob({ ...man, brave: 0.1 }), 'timid by nature');
    assert.ok(fightsInMob({ role: 'builder', brave: 0.5 }));
    assert.ok(!fightsInMob({ role: 'merchant', brave: 0.4 }), 'a weak merchant');
    assert.ok(fightsInMob({ role: 'merchant', brave: 0.8, trade: 'smith' }), 'a sturdy merchant');
    assert.ok(!fightsInMob({ role: 'merchant', brave: 0.9, atStall: true }), 'goods are not abandoned');
    assert.ok(!fightsInMob({ role: 'farmer', brave: 0.9, trade: 'priest' }), 'the priest');
    // those on the old rules are neither: knights, king, vizier, wizards
    for (const r of ['knight', 'king', 'advisor', 'wizard']) { assert.ok(ROLE_MOB[r].rules); assert.ok(!fightsInMob({ role: r, brave: 1 })); assert.ok(!leavesVillage({ role: r })); }
    // everyone else is exactly one of the two
    for (const role of ['farmer', 'builder', 'merchant', 'seller']) for (const f of [false, true]) for (const b of [0.1, 0.5, 0.9]) {
        const p = { role, female: f, brave: b };
        assert.notEqual(fightsInMob(p), leavesVillage(p), JSON.stringify(p));
    }
});

test('weapons by the place of work: pitchfork, hoe, hammer, kitchen knife, fists; the codes survive the net bits', () => {
    assert.equal(weaponFor({ role: 'farmer', tool: 'pitchfork' }), 'pitchfork');
    assert.equal(weaponFor({ role: 'farmer', tool: 'hoe' }), 'hoe');
    assert.equal(weaponFor({ role: 'builder' }), 'hammer');
    assert.equal(weaponFor({ role: 'merchant', trade: 'smith' }), 'hammer');
    assert.equal(weaponFor({ role: 'merchant', trade: 'baker' }), 'knife');
    assert.equal(weaponFor({ role: 'merchant', trade: 'innkeeper' }), 'knife');
    assert.equal(weaponFor({ role: 'wizard' }), 'none');
    for (const t of MOB_TOOLS.slice(1)) assert.equal(toolOf(withTool(2 | 256, t)), t);
    assert.equal(withTool(2 | 256, 'knife') & 2, 2, 'the bucket bit and the torch bit are not touched');
    assert.equal(withTool(2 | 256, 'knife') & 256, 256);
    assert.equal(toolOf(withTool(withTool(0, 'hoe'), '')), '');
});

test('muster: the places are on the leader\'s side, apart from each other, at stand-off distance — nobody inside another', () => {
    const target = { x: 0, z: 0 }, leader = { x: 20, z: 6 };
    const n = 10;
    const spots = Array.from({ length: n }, (_, k) => musterSpot(leader, target, k, n));
    for (const s of spots) { const d = Math.hypot(s.x, s.z); assert.ok(d >= MOB.STAND - 0.01 && d <= MOB.STAND + 3.01, `${d}`); assert.ok(s.x > 0, 'on his side'); }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > MOB.SLOT * 0.85, `${i}-${j}`);
});

test('the crowd goes together: not before enough have come — unless he comes too close or the wait is over', () => {
    assert.ok(!goNow({ ready: 1, total: 8, t: 1, nearest: 30 }));
    assert.ok(goNow({ ready: 5, total: 8, t: 3, nearest: 30 }));
    assert.ok(goNow({ ready: 1, total: 8, t: MOB.GO_WAIT, nearest: 30 }));
    assert.ok(goNow({ ready: 0, total: 8, t: 1, nearest: MOB.GO_NEAR - 1 }));
    assert.ok(!goNow({ ready: 0, total: 0, t: 100, nearest: 0 }));
    assert.equal(pickLeader([{ id: 'a', role: 'farmer', brave: 0.9, d: 10 }, { id: 'k', role: 'knight', brave: 0.6, d: 40 }]).id, 'k', 'a knight is the landmark');
});

test('refuge: outside the border, away from the player, spread (not a heap), and toward a near neighbour but never toward the player', () => {
    const def = { x: 1000, z: 1000, zone: 60 };
    const player = { x: 1020, z: 1000 }; // east of the middle
    const spots = Array.from({ length: 9 }, (_, k) => refugeSpot(def, player, null, k));
    for (const s of spots) {
        assert.ok(Math.max(Math.abs(s.x - def.x), Math.abs(s.z - def.z)) >= def.zone + EXODUS.OUT - 0.01, 'beyond the border');
        assert.ok(s.x < def.x, 'west: away from him');
    }
    const uniq = new Set(spots.map((s) => s.x.toFixed(1) + ',' + s.z.toFixed(1)));
    assert.equal(uniq.size, spots.length);
    const nb = refugeSpot(def, player, { x: 900, z: 1100 }, 0); // the neighbour is to the south-west: 45° from «away from him»
    const plain = refugeSpot(def, player, null, 0);
    assert.ok(nb.z !== plain.z, 'the neighbour pulls it a little');
    const toward = refugeSpot(def, player, { x: 1500, z: 1000 }, 0); // the neighbour is on HIS side: ignored
    assert.ok(toward.x < def.x);
    const centre = refugeSpot(def, { x: 1000, z: 1000 }, null, 0); // the player right in the middle: still a finite spot
    assert.ok(Number.isFinite(centre.x) && Number.isFinite(centre.z));
});

test('return from the refuge: when calm and he is away; not while he is near or the fight goes on; never forever', () => {
    assert.ok(!mayReturn({ waited: 10, audacity: 10, playerD: 20, mobOn: false }), 'he is too near');
    assert.ok(mayReturn({ waited: 10, audacity: 10, playerD: 100, mobOn: false }));
    assert.ok(!mayReturn({ waited: 10, audacity: 10, playerD: 100, mobOn: true }));
    assert.ok(!mayReturn({ waited: 10, audacity: 50, playerD: 100, mobOn: false }), 'still hot');
    assert.ok(mayReturn({ waited: EXODUS.WAIT_MAX, audacity: AUD.FEAR - 1, playerD: 100, mobOn: false }), 'does not hide forever');
    assert.ok(mayReturn({ waited: EXODUS.HARD_MAX, audacity: 90, playerD: 30, mobOn: true }));
});

// ------------------------------------------------------------------ the game side, with a stub place
function world({ nKnights = 1 } = {}) {
    const said = [], logs = [], bells = [];
    const def = { id: 'v1', name: 'Тестовая', x: 0, z: 0, zone: 60, kind: 'hamlet', houses: [], knights: nKnights };
    const cs = { def, awake: true, active: new Map(), hostile: new Map(), graph: { nodes: [], nearest: () => -1, tagged: () => [] } };
    const st = { owner: null, ranks: {} };
    const player = { x: 12, y: 2, z: 0 };
    const game = {
        localId: 'me', isNight: false, arenaDuels: { peace: () => game.peace === true }, buildingFx: { alarm: (p, r) => bells.push([p, r]) }, hud: { notify() {} },
    };
    const life = {
        game, auth: true, enabled: true, byId: new Map(), alog: { note: (t) => logs.push(t), decision: (v, t) => logs.push(`${v.id}: ${t}`) },
        night: { noise() {} }, index: { near: () => [] }, state: () => st,
        _isPlayer: (id) => id === 'me', _playerPos: (id) => (id === 'me' ? player : null), _sees: () => true,
        _say: (v, t) => said.push([v.id, t]), _fights: (v) => v.role === 'knight' || !!v.mob, _inLand: (d, p, extra = 0) => Math.max(Math.abs(p.x - d.x), Math.abs(p.z - d.z)) <= d.zone + extra,
        fright: { _traits(v) { if (v.brave == null) { v.brave = v.bravery ?? 0.6; v.elder = !!v.old; } }, _fearful: (v) => !v.dead && !v.sleep && v.role !== 'knight' && !v.foe && !v.aud && !v.mob, _end(v) { v.fear = null; v.path = null; }, _dropBucket() {}, sendHome(v) { if (!life.homeOn) return false; v.fear = { state: 'shelter', level: 2 }; v.homeSent = true; return true; } },
        home: { hasHome: () => !!life.homeOn }, // (no house in the stub place: the timid go out of the village as before; `life.homeOn` — they run home)
        _steer(v, tx, tz, speed, dt, stop = 0) { const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz); if (d <= stop) { v.speed = 0; return d; } const s = Math.min(d - stop, speed * dt); v.x += dx / d * s; v.z += dz / d * s; v.speed = speed; return d; },
        _goTo() { return false; }, _followPath() { return true; }, _ground() {}, _nextTrip(v) { v.nextTrip = (v.nextTrip || 0) + 1; },
    };
    life.aud = new AudacityLife(life);
    let n = 0;
    const add = (role, o = {}) => {
        const id = (o.id || role[0]) + (++n);
        const v = {
            id, idx: n, role, x: o.x ?? -10 + n * 2, y: 0, z: o.z ?? 8, cs, dead: false, foe: null, mode: 'idle', hp: 8, maxHp: 8, fx: 0, speed: 0, job: o.job || 'wander',
            entry: { female: !!o.female, trade: o.trade || null }, model: { toolKind: o.tool || 'hoe', setHeldTool(k) { this.toolKind = k; } }, ...o,
        };
        cs.active.set(n, v); life.byId.set(id, v); return v;
    };
    for (let i = 0; i < nKnights; i++) add('knight', { id: 'k', x: 20, z: 0 });
    const run = (sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) { life.aud.update(dt); for (const v of [...life.byId.values()]) if (v.aud) life.aud.step(v, dt); } };
    return { life, cs, st, said, logs, bells, add, run, player, game, def };
}
const witnessesOf = (cs) => [...cs.active.values()].filter((v) => v.role !== 'knight');

test('game: a killing before witnesses — the bell tolls and the timid go OUT of the village; the fighters are not yet a crowd', () => {
    const w = world();
    const men = [w.add('farmer'), w.add('farmer'), w.add('builder')];
    const weak = [w.add('farmer', { female: true }), w.add('farmer', { old: true }), w.add('merchant', { job: 'stall', bravery: 0.9 })];
    w.life.aud.deed(w.cs, 'me', 'slay', witnessesOf(w.cs), { victim: { id: 'x', role: 'farmer' } });
    assert.equal(w.life.aud.info(w.cs, 'me').phase, 'calm'); // (the look comes at the next tick)
    w.run(1);
    assert.equal(w.life.aud.info(w.cs, 'me').phase, 'fear');
    assert.ok(w.bells.length >= 1, 'the bell');
    w.run(30);
    for (const v of weak) {
        assert.ok(Math.max(Math.abs(v.x - w.def.x), Math.abs(v.z - w.def.z)) >= w.def.zone + EXODUS.OUT - 2, `${v.id} is outside the border: ${v.x.toFixed(1)}, ${v.z.toFixed(1)}`);
        assert.equal(v.aud?.mode, 'wait');
    }
    for (const v of men) { assert.ok(!v.mob, 'no crowd yet'); assert.ok(!v.foe); assert.equal(v.model.toolKind, 'hoe'); }
    assert.ok(w.logs.some((l) => l.includes('бежит из деревни')), 'the journal tells who ran and why');
});

test('game: murder + robbery before witnesses — the strong gather and strike TOGETHER, with what they have; the knight goes too; the weak run', () => {
    const w = world();
    const f1 = w.add('farmer', { tool: 'pitchfork' }), f2 = w.add('farmer', { tool: 'hoe' }), b1 = w.add('builder', { tool: 'hammer' }), sm = w.add('merchant', { trade: 'smith', bravery: 0.8, tool: 'hammer' }), bk = w.add('merchant', { trade: 'baker', bravery: 0.8, tool: 'none' });
    const kid = w.add('farmer', { female: true }), elder = w.add('farmer', { old: true });
    const fighters = [f1, f2, b1, sm, bk];
    const wit = witnessesOf(w.cs);
    w.life.aud.deed(w.cs, 'me', 'slay', wit, { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', wit);
    w.run(0.6);
    assert.equal(w.life.aud.info(w.cs, 'me').phase, 'mob');
    // they muster first: weapons in hand, nobody attacks one by one
    const seenFoe = [];
    for (let t = 0; t < 12; t += 0.1) {
        w.run(0.1);
        const n = fighters.filter((v) => v.foe === 'me').length;
        seenFoe.push(n);
        if (n) break;
    }
    assert.ok(seenFoe[seenFoe.length - 1] >= 3, `they strike together: ${seenFoe.join(',')}`);
    const jump = seenFoe[seenFoe.length - 1] - (seenFoe[seenFoe.length - 2] || 0);
    assert.ok(jump >= 3 || seenFoe.length === 1, 'the foe is given to all at once, not one after another');
    assert.equal(f1.model.toolKind, 'pitchfork'); assert.equal(f2.model.toolKind, 'hoe'); assert.equal(b1.model.toolKind, 'hammer');
    assert.equal(sm.model.toolKind, 'hammer', 'the smith: a hammer'); assert.equal(bk.model.toolKind, 'knife', 'the baker: the kitchen knife');
    assert.equal(toolOf(bk.fx), 'knife', 'the guests see it (bits of fx)');
    assert.ok(fighters.every((v) => v.mob && v.mobDmg >= 1));
    assert.equal(w.cs.active.get(1).foe, 'me', 'the knight is on him too');
    assert.ok(w.cs.hostile.get('me') > Date.now(), 'the place is hostile to him while the crowd lives');
    // the weak did not join; they ran
    for (const v of [kid, elder]) { assert.ok(!v.mob && !v.foe); assert.equal(v.aud?.mode === 'out' || v.aud?.mode === 'wait', true, `${v.id} ${v.aud?.mode}`); }
    assert.ok(w.logs.some((l) => l.includes('нападает вместе')));
    assert.ok(w.logs.some((l) => l.includes('в толпе против игрока')));
});

test('game: it calms down with time — the crowd breaks up, the weapons are put back, the runaways return', () => {
    const w = world();
    const f = w.add('farmer', { tool: 'pitchfork' }), runner = w.add('farmer', { female: true });
    const wit = witnessesOf(w.cs);
    w.life.aud.deed(w.cs, 'me', 'slay', wit, { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', wit);
    w.run(20);
    assert.ok(f.mob && runner.aud);
    w.player.x = 400; // he walks away
    w.run(EXODUS.WAIT_MAX + 400, 0.25);
    assert.ok(!f.mob && !f.foe && f.model.toolKind === 'pitchfork' && toolOf(f.fx) === '', 'the pitchfork is his own again');
    assert.ok(!runner.aud && runner.nextTrip >= 1, 'the runaway came back to his business');
    assert.equal(w.life.aud.info(w.cs, 'me').phase, 'calm');
    assert.ok(w.logs.some((l) => l.includes('возвращается в деревню')));
    assert.ok(w.logs.some((l) => l.includes('разошлась')));
});

test('game: at night the returned do not stand in the road — they go home', () => {
    const w = world();
    const runner = w.add('farmer', { female: true });
    w.life.aud.deed(w.cs, 'me', 'slay', witnessesOf(w.cs), { victim: { id: 'x', role: 'farmer' } });
    w.run(15);
    assert.ok(runner.aud);
    w.game.isNight = true; w.player.x = 500;
    w.run(EXODUS.WAIT_MAX + 400, 0.25);
    assert.ok(!runner.aud && runner.goingHome === true && runner.trips === 0);
});

test('game: nobody saw it — nothing happens; the owner (king) and his friends are not touched; the duel mode has no crowd at all', () => {
    const w = world();
    const f = w.add('farmer');
    w.life.aud.deed(w.cs, 'me', 'slay', [], { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', [{ ...f, dead: true }]);
    w.run(2);
    assert.equal(w.life.aud.info(w.cs, 'me').v, 0);
    w.st.owner = 'me';
    assert.equal(w.life.aud.deed(w.cs, 'me', 'slay', [f]), 0, 'the owner');
    w.st.owner = null; w.st.ranks = { me: { level: 1 } };
    assert.equal(w.life.aud.deed(w.cs, 'me', 'slay', [f]), 0, 'a friend of the king: forgiven');
    w.st.ranks = {};
    // a duel starts while the crowd is gathered: it is gone, nobody keeps the foe
    w.life.aud.deed(w.cs, 'me', 'slay', [f]); w.life.aud.deed(w.cs, 'me', 'rob', [f]);
    w.run(1.5);
    assert.ok(f.mob);
    w.game.peace = true;
    w.run(1);
    assert.ok(!f.mob && !f.foe && !f.aud, 'the duel mode: peace');
    w.game.peace = false;
    assert.equal(w.life.aud.deed(w.cs, 'me', 'rob', [f]) >= 0, true);
});

test('game: the sleeping, the held and those on orders are not touched; a hamlet of wizards / a tower is not a place for the crowd', () => {
    const w = world();
    const sleeper = w.add('farmer', { sleep: { phase: 'lie' } }), onOrder = w.add('farmer', { order: { kind: 'hunt' } }), held = w.add('farmer', { lev: {} });
    const f = w.add('farmer');
    w.life.aud.deed(w.cs, 'me', 'slay', [f], { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', [f]);
    w.run(15);
    for (const v of [sleeper, onOrder, held]) assert.ok(!v.mob && !v.aud && !v.foe, v.id);
    const tower = world();
    tower.def.kind = 'tower';
    const g = tower.add('farmer');
    assert.equal(tower.life.aud.deed(tower.cs, 'me', 'slay', [g]), 0);
    const mage = world(); mage.def.mage = true; mage.def.kind = 'hamlet';
    assert.equal(mage.life.aud.deed(mage.cs, 'me', 'slay', [mage.add('farmer')]), 0, 'a wizards\' hamlet has its own rules');
});

test('game: the player dies — the crowd goes home at once and the heat halves; a place that falls asleep leaves nothing running', () => {
    const w = world();
    const f = w.add('farmer');
    w.life.aud.deed(w.cs, 'me', 'slay', [f], { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', [f]);
    w.run(2);
    assert.ok(f.mob);
    const before = w.life.aud.info(w.cs, 'me').v;
    w.life.aud.playerDied('me');
    assert.ok(!f.mob && !f.foe);
    assert.ok(w.life.aud.info(w.cs, 'me').v <= before / 2 + 0.2);
    w.life.aud.deed(w.cs, 'me', 'slay', [f]); w.life.aud.deed(w.cs, 'me', 'rob', [f]);
    w.run(2);
    w.cs.awake = false;
    w.run(1);
    assert.equal(w.life.aud.mobs.size, 0);
    assert.equal(w.life.aud.recs.size, 0);
});

test('game: a crowd is never bigger than the limit, and the runaways spread over different places (no heap at one point)', () => {
    const w = world();
    for (let i = 0; i < 30; i++) w.add('farmer', { x: -40 + (i % 10) * 3, z: 6 + Math.floor(i / 10) * 3 });
    for (let i = 0; i < 12; i++) w.add('farmer', { female: true, x: -30 + (i % 6) * 3, z: -10 - Math.floor(i / 6) * 3 });
    const wit = witnessesOf(w.cs);
    w.life.aud.deed(w.cs, 'me', 'slay', wit, { victim: { id: 'x', role: 'farmer' } });
    w.life.aud.deed(w.cs, 'me', 'rob', wit);
    w.run(40);
    const crowd = [...w.cs.active.values()].filter((v) => v.mob);
    assert.ok(crowd.length > 0 && crowd.length <= MOB.MAX, `${crowd.length}`);
    const spots = new Set(); let n = 0;
    for (const v of w.cs.active.values()) if (v.aud?.spot) { spots.add(v.aud.spot.x.toFixed(1) + ',' + v.aud.spot.z.toFixed(1)); n++; }
    assert.ok(n >= 10 && spots.size >= Math.min(n, 9) - 1, `${spots.size} places for ${n}`);
});

test('game: the journal says who ran and why, with the number', () => {
    const w = world();
    const g = w.add('farmer', { old: true });
    w.life.aud.deed(w.cs, 'me', 'slay', [g], { victim: { id: 'x', role: 'farmer' } });
    w.run(2);
    const line = w.logs.find((l) => l.startsWith(g.id) && l.includes('бежит из деревни'));
    assert.ok(line && line.includes('старик') && /наглость \d+/.test(line), line);
});

test('game: the weak run to their OWN HOUSE (not out of the village) when they have one; out of the village only without a house', () => {
    const w = world();
    w.life.homeOn = true;
    const weak = [w.add('farmer', { female: true }), w.add('farmer', { old: true })];
    w.life.aud.deed(w.cs, 'me', 'slay', witnessesOf(w.cs), { victim: { id: 'x', role: 'farmer' } });
    w.run(3);
    for (const v of weak) { assert.ok(v.homeSent, 'runs home'); assert.ok(!v.aud, 'not out of the village'); }
    const w2 = world();
    const lone = w2.add('farmer', { female: true });
    w2.life.aud.deed(w2.cs, 'me', 'slay', witnessesOf(w2.cs), { victim: { id: 'x', role: 'farmer' } });
    w2.run(3);
    assert.ok(lone.aud && lone.aud.mode, 'no house: out of the village');
});
