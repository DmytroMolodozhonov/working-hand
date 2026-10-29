// The author's fight at sea (Creative, «на другом корабле»): the hero is the master of his ship (his crew never turns on him), a
// helmsman always stands at the wheel, the crew sets the sails by the way of the ship, the lateen sail clears the wheel, the boarders
// climb the stairs and the hatch ladder, Captain Black Moustache stays on his ship while a skeleton lives, the skeleton table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ships } from '../../src/game/Ships.js';
import { Blackbeard, BB } from '../../src/game/Blackbeard.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { buildLayout } from '../../src/game/ShipLayout.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';
import { GUST, FIRE_K, pirateBoneDamage } from '../../src/game/Sailors.js';
import { parseCrewOrder } from '../../src/game/FleetMath.js';
import { crewOrder } from '../../src/ai/TalkFlow.js';

function world() {
    const game = {
        config: { mode: 'creative' }, authority: true, scene: { add() {}, remove() {} }, localId: 'me', remotes: new Map(), isNight: false,
        character: { group: { position: { x: 9999, y: 0, z: 9999 }, rotation: { y: 0 } } }, hud: { setVoice() {}, toast() {} }, collision: { addMover() {}, removeMover() {} }, chests: [],
    };
    const S = new Ships(game);
    game.ships = S;
    game.blackbeard = new Blackbeard(game);
    game.creatureImpact = new CreatureImpact(game);
    const B = S.spawn('blackship', 0, 0, 0, { id: BB.ID, wake: false });
    game.blackbeard.ship = B;
    return { game, S, B, bb: game.blackbeard };
}

test('«а если»: the master of a ship is nobody\'s foe — the crew never turns on him (his chest, his wheel, his sails)', () => {
    const { S } = world();
    const T = S.spawn('fluyt', 200, 200, 0, { id: 'T', wake: false });
    T.owner = 'me'; // (HeroApply: the hero starts as the master of his ship)
    S.wake(T);
    S.crew.provoke(T, 'me', 'x');
    S.crew.tookWheel(T, 'me');
    assert.equal(T.hostile.size, 0, 'nobody angry');
    const other = S.spawn('fluyt', 400, 400, 0, { id: 'U', wake: false });
    S.wake(other);
    S.crew.provoke(other, 'me', 'x');
    assert.equal(other.hostile.size, 1, 'a stranger\'s ship: the crew turns on a thief');
});

test('a helmsman is always at the wheel — until a player holds it or the king sends him away', () => {
    const { S } = world();
    const T = S.spawn('fluyt', 200, 200, 0, { id: 'T', wake: false });
    T.owner = 'me';
    S.wake(T);
    const list = S.crew.crews.get(T.id);
    const P = T.layout.helm.stand;
    const run = (sec) => { for (let t = 0; t < sec; t += 1 / 30) S.crew.update(1 / 30); };
    run(25);
    const h = list.find((v) => v.id === T.helmId);
    assert.ok(h, 'somebody was chosen');
    assert.ok(Math.hypot(h.l.x - P.x, h.l.z - P.z) < 0.6, `he stands behind the wheel: ${h.l.x},${h.l.z} vs ${P.x},${P.z}`);
    assert.ok(Math.abs(h.lyaw) < 0.05, 'facing the bow');
    // the king: «отойди от штурвала»
    assert.equal(parseCrewOrder('отойди от штурвала').kind, 'leaveHelm');
    assert.equal(parseCrewOrder('встань к штурвалу').kind, 'takeHelm');
    assert.ok(crewOrder('отойди от штурвала'), 'the words reach the crew');
    T.helmOff = true;
    assert.equal(S.crew._helmsman(T), null);
    T.helmOff = false; T.helmBy = 'me';
    assert.equal(S.crew._helmsman(T), null, 'a player holds the wheel');
    T.helmBy = null;
    assert.ok(S.crew._helmsman(T), 'back');
    // the helmsman fights: another takes the wheel
    h.foe = 'x';
    const h2 = S.crew._helmsman(T);
    assert.ok(h2 && h2 !== h, 'a free man stands in');
});

test('the crew sets the sails by the way of the ship: under way — full open; standing still — rolled up; a hand\'s order is left alone a while', () => {
    const { S } = world();
    const T = S.spawn('fluyt', 200, 200, 0, { id: 'T', wake: false });
    S.wake(T);
    T.state = 'free';
    assert.ok(T.sails.every((sl) => sl.target === 0), 'rolled up');
    T.st.u = 5;
    S._autoSails(T, 0.1);
    assert.ok(T.sails.every((sl) => sl.target === 1), 'under way: all open');
    T.st.u = 0;
    for (let i = 0; i < 200; i++) S._autoSails(T, 0.1);
    assert.ok(T.sails.every((sl) => sl.target === 0), 'standing still: rolled up');
    T.st.u = 5;
    S.setSails(T, 'all', 0, 'me'); // (the player furls them to brake)
    S._autoSails(T, 0.1);
    assert.ok(T.sails.every((sl) => sl.target === 0), 'the order is not undone at once');
});

test('the lateen sail clears the wheel and the helmsman\'s raised hand on every ship', () => {
    for (const id of Object.keys(SHIP_CLASSES)) {
        const L = buildLayout(id), top = L.helm.y + L.helm.handleR;
        for (const s of L.sails) if (s.kind === 'lateen') assert.ok(Math.min(s.tack.y, s.clew.y) - top >= 1.5, `${id}: ${s.tack.y} over ${top}`);
    }
});

test('Captain Black Moustache stays on his ship while one skeleton lives; with none left he goes over', () => {
    const { S, B, bb } = world();
    const T = S.spawn('pinnace', 40, 6, 0.3, { id: 'T', wake: false });
    S.wake(B); S.wake(T);
    B.awake = T.awake = true;
    bb._grapple(B, T);
    for (let i = 0; i < 30 * 15; i++) { bb.lashStep(T, 1 / 30); S._place(B); S._place(T); }
    assert.ok(bb.lash.planks);
    game_players(bb, T);
    const list = S.crew.crews.get(B.id);
    const cap = list.find((v) => v.role === 'blackbeard');
    bb._phaseT = 20; bb._quietT = 0;
    bb._boarding(B, 1 / 30, performance.now());
    assert.ok(!cap.board, 'skeletons alive: the captain stays');
    assert.ok(list.some((v) => v.role === 'skeleton' && v.board), 'the skeletons go');
    for (const v of list) if (v.role === 'skeleton') v.dead = true;
    bb._boarding(B, 1 / 30, performance.now());
    assert.equal(cap.board, T.id, 'all skeletons destroyed: the captain goes himself');
});

function game_players(bb, T) {
    bb._players = () => [{ id: 'me', x: T.st.x, y: 0, z: T.st.z, ship: T }];
}

test('the captain fallen into the sea climbs back (never drowns); the skeleton table: fire half, Liquidation Maxima, the gusts', () => {
    const { S, B, bb } = world();
    S.wake(B); B.awake = true;
    const cap = S.crew.crews.get(B.id).find((v) => v.role === 'blackbeard');
    S.crew._overboard(cap, 1, null, 'me');
    assert.ok(cap.overboard);
    for (let i = 0; i < 30 * 200 && cap.overboard; i++) bb.overboard(cap, B, 1 / 30);
    assert.equal(cap.overboard, null, 'back aboard');
    assert.ok(!cap.dead && cap.ship === B);
    assert.equal(pirateBoneDamage('Inferno', 10, true), 10 * FIRE_K);
    assert.equal(pirateBoneDamage('LiquidationMaxima', 10, true), 10);
    assert.equal(pirateBoneDamage('Liquidation', 10, true), 0);
    for (const k of Object.keys(GUST)) assert.equal(pirateBoneDamage(k, GUST[k], true), GUST[k], k);
    assert.equal(pirateBoneDamage('AvadaKedavra', 25, true), 0);
});

test('boarders climb: a skeleton on the main deck goes up the quarterdeck stairs, one in the hold up the hatch ladder, to the foe', () => {
    const { S, B } = world();
    for (const [cls, from] of [['pinnace', { x: 3.3, y: 4.6, z: -0.5 }], ['blackship', { x: 3.0, y: 0.6, z: -20 }]]) {
        const T = S.spawn(cls, 300 + Math.random() * 50, 300, 0, { id: 'T' + cls, wake: false });
        S.wake(T); T.awake = true;
        const v = S.crew.crews.get(T.id)[0];
        v.l.x = from.x; v.l.y = from.y; v.l.z = from.z; v.node = S.crew._nearestNode(T, v.l); v.path = null; v.waitT = 99;
        const goal = T.layout.nodes.find((n) => n.tag === 'helm');
        for (let t = 0; t < 40 && Math.hypot(v.l.x - goal.x, v.l.z - goal.z) > 1; t += 1 / 30) { v.foe = null; S.crew._goTo(v, T, goal, 5.2, 1 / 30); v.mode = 'run'; S.crew._ground(v, T); }
        assert.ok(Math.hypot(v.l.x - goal.x, v.l.z - goal.z) < 1.5 && Math.abs(v.l.y - goal.y) < 0.5, `${cls}: reached the helm: ${v.l.x.toFixed(1)},${v.l.y.toFixed(1)},${v.l.z.toFixed(1)} of ${goal.x},${goal.y},${goal.z}`);
    }
});
