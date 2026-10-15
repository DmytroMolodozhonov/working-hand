// Sailors on their deck: feet always on the floor (never sunk in, never inside a mast or a gun, a wedged
// one gets out by himself), a man overboard is saved by his mates and the one who threw him is the
// ship's foe, and a sailor keeps out of the reach of a player's hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, floorAt } from '../../src/game/ShipLayout.js';
import { ShipPose } from '../../src/game/ShipCollision.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';
import { Sailors, pushOut, railSpots } from '../../src/game/Sailors.js';

function world(cls = 'galleon') {
    const layout = buildLayout(cls);
    const s = {
        id: 'S1', cls: SHIP_CLASSES[cls], layout, crewKilled: new Set(), color: 0x884422, hostile: new Map(), name: 'Тест',
        st: { x: 0, z: 0, yaw: 0, u: 0, roll: 0, pitch: 0 }, pose: new ShipPose(), chests: [], owner: null,
    };
    s.pose.set(0, 0, 0, 0, 0, 0);
    const game = {
        authority: true, scene: { add() {} }, localId: 'me', remotes: new Map(), isNight: false,
        character: { group: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } } }, hud: { setVoice() {} },
    };
    const ships = { list: new Map([[s.id, s]]), loyalTo: () => false, me: null };
    const crew = new Sailors(game, ships);
    crew.wake(s);
    const run = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) crew.update(dt); };
    return { s, layout, game, ships, crew, list: crew.crews.get(s.id), run };
}

test('a sailor sunk into the deck or a stair is stood back up on it', () => {
    const { layout, list, run } = world();
    const v = list.find((x) => x.role === 'sailor');
    v.path = null; v.waitT = 100;
    v.l.y -= 0.8;
    run(0.1);
    assert.equal(v.l.y, floorAt(layout, v.l.x, v.l.z, v.l.y + 1.1));
    // on a stair, halfway up: on its step, not inside it
    const r = layout.ramps.find((x) => x.id.startsWith('quarter'));
    v.l.x = r.ax; v.l.z = (r.az + r.bz) / 2; v.l.y = (r.ay + r.by) / 2 - 0.7;
    run(0.1);
    assert.ok(Math.abs(v.l.y - (r.ay + r.by) / 2) < 0.05, `on the step: ${v.l.y}`);
});

test('a sailor pushed right inside the capstan or a mast is out of it', () => {
    const { layout, list, run } = world();
    const v = list.find((x) => x.role === 'sailor');
    v.path = null; v.waitT = 100;
    for (const kind of ['capstan', 'mast']) {
        const b = layout.solids.find((x) => x.kind === kind && x.y0 <= layout.deck + 0.1 && x.y1 > layout.deck + 1);
        v.l.x = (b.x0 + b.x1) / 2 + 0.05; v.l.z = (b.z0 + b.z1) / 2; v.l.y = layout.deck;
        run(0.2);
        const cx = Math.max(b.x0, Math.min(b.x1, v.l.x)), cz = Math.max(b.z0, Math.min(b.z1, v.l.z));
        assert.ok(Math.hypot(v.l.x - cx, v.l.z - cz) >= 0.49, `out of the ${kind}`);
        assert.equal(v.l.y, floorAt(layout, v.l.x, v.l.z, v.l.y + 1.1));
    }
    // (the helper alone: from the very middle of a box)
    const p = { x: 0, y: layout.deck, z: layout.capstan?.z ?? 0 };
    const cap = layout.solids.find((x) => x.kind === 'capstan');
    p.x = (cap.x0 + cap.x1) / 2; p.z = (cap.z0 + cap.z1) / 2;
    assert.ok(pushOut(layout, p));
});

test('the crew keeps its feet on the deck while the ship rolls and pitches under way', () => {
    const { s, layout, list, run } = world();
    for (let i = 0; i < 300; i++) {
        s.st.roll = Math.sin(i * 0.07) * 0.18; s.st.pitch = Math.cos(i * 0.05) * 0.08; s.st.x += 0.2;
        s.pose.set(s.st.x, Math.sin(i * 0.1) * 0.5, 0, 0, s.st.roll, s.st.pitch);
        run(1 / 30);
    }
    for (const v of list) {
        if (v.dead || v.overboard || v.vy) continue;
        const f = floorAt(layout, v.l.x, v.l.z, v.l.y + 1.1);
        assert.ok(f !== null && Math.abs(f - v.l.y) < 0.31, `${v.name} on the floor (${v.l.y} vs ${f})`);
    }
});

test('a sailor thrown overboard by a player: the player is the foe, a mate throws the buoy, he is back aboard', () => {
    const { s, layout, game, list, crew, run } = world();
    // (in the water off the side, away from the gangway — on the pier by it they line up at the gangway)
    game.remotes.set('p1', { position: { x: 50, y: 2, z: -20 }, ship: null, name: 'Злодей' });
    const v = list.find((x) => x.role === 'sailor');
    v.hitBy = { id: 'p1', t: performance.now() };
    crew._overboard(v, 1);
    assert.ok(v.overboard);
    assert.ok((s.hostile.get('p1') || 0) > performance.now(), 'the thrower is the ship\'s foe');
    run(0.2);
    const rescuer = list.find((o) => o.rescue?.job === 'buoy');
    assert.ok(rescuer && rescuer !== v, 'somebody goes to save him');
    // the others don't just stand: at the rail facing the thrower (or calling to the man in the water)
    const busy = list.filter((o) => o !== v && !o.dead && (o.rescue || o.alert || o.role === 'captain'));
    assert.equal(busy.length, list.filter((o) => o !== v && !o.dead).length);
    let threw = false;
    for (let t = 0; t < 60 && v.overboard; t += 0.5) { run(0.5); if (rescuer.rescue?.buoy) threw = true; }
    assert.ok(threw, 'the buoy was thrown');
    assert.equal(v.overboard, null, 'back aboard');
    assert.ok(!v.dead);
    assert.equal(v.l.y, floorAt(layout, v.l.x, v.l.z, v.l.y + 1.1));
    run(1);
    assert.ok(!list.some((o) => o.rescue), 'back to work');
});

test('a sailor never stands within the reach of a player\'s hands (unless they fight)', () => {
    const { s, ships, list, run } = world();
    const v = list.find((x) => x.role === 'sailor');
    v.path = null; v.waitT = 100;
    ships.me = { ship: s, l: { x: v.l.x + 0.7, y: v.l.y + 2, z: v.l.z } };
    run(2);
    assert.ok(Math.hypot(v.l.x - ships.me.l.x, v.l.z - ships.me.l.z) >= 1.45);
});

test('every ship has places at its rail to look over the side, on both sides', () => {
    for (const id of Object.keys(SHIP_CLASSES)) {
        const r = railSpots(buildLayout(id));
        assert.ok(r.some((p) => p.side > 0) && r.some((p) => p.side < 0), id);
    }
});

test('a man overboard from a ship under way: caught by the buoy, hauled in along the side, back aboard', () => {
    const { s, list, crew, run } = world();
    const v = list.find((x) => x.role === 'sailor');
    crew._overboard(v, -1);
    s.st.u = 3; // (sailing on: he could never swim after it alone)
    let x = 0;
    for (let t = 0; t < 70 && v.overboard; t += 1 / 30) {
        x -= 3 / 30;
        s.st.x = x; s.pose.set(x, 0, 0, Math.PI / 2, 0, 0); // (bow is −z: yaw π/2 — under way along −x)
        run(1 / 30);
    }
    assert.equal(v.overboard, null, 'back aboard');
    assert.ok(!v.dead);
});

test('a body lying on a stair (dead or knocked down) slides down off it — the stair stays free', () => {
    const { layout, list, crew, run } = world();
    const r = layout.ramps.find((x) => x.id.startsWith('quarter'));
    const [a, b] = list.filter((x) => x.role === 'sailor');
    for (const [v, k] of [[a, 'dead'], [b, 'stun']]) {
        v.path = null; v.waitT = 100;
        v.l.x = r.ax; v.l.z = (r.az + r.bz) / 2; v.l.y = (r.ay + r.by) / 2;
        if (k === 'dead') crew._die(v, null); else v.stunT = 4;
        run(3);
        const lowY = Math.min(r.ay, r.by);
        assert.ok(Math.abs(v.l.y - lowY) < 0.05, `${k}: down on the deck (${v.l.y.toFixed(2)})`);
        assert.equal(floorAt(layout, v.l.x, v.l.z, v.l.y + 1.1), v.l.y, `${k}: on the floor`);
        assert.ok(Math.abs(v.l.x - r.ax) > r.half || Math.abs(v.l.z - (r.ay < r.by ? r.az : r.bz)) > 1, `${k}: clear of the stair's foot`);
    }
});
