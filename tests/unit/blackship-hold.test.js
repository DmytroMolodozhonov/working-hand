// The author's ship test (2026-10): a handier helm; Captain Black Moustache far from the start; his skeletons up a
// ship's rope ladder; he and his skeletons hold fast on a deck — no «Вайнд» blows them over the side.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ships } from '../../src/game/Ships.js';
import { SHIP_CLASSES, HELM_LOCK } from '../../src/game/ShipTypes.js';
import { stepShip, newShipState } from '../../src/game/ShipPhysics.js';
import { BRACE } from '../../src/game/Sailors.js';
import { Blackbeard, BB, pirateSea } from '../../src/game/Blackbeard.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { hullHalfWidth } from '../../src/game/ShipLayout.js';
import { SeaIndex } from '../../src/world/Sea.js';
import { WATER_LEVEL_Y } from '../../src/world/Terrain.js';

function world() {
    const game = {
        config: { mode: 'creative' }, authority: true, scene: { add() {}, remove() {} }, localId: 'me', remotes: new Map(), isNight: false,
        character: { group: { position: { x: 9999, y: 0, z: 9999 }, rotation: { y: 0 } } }, hud: { setVoice() {} }, collision: { addMover() {}, removeMover() {} }, chests: [],
    };
    const S = new Ships(game);
    game.ships = S;
    game.blackbeard = new Blackbeard(game);
    game.creatureImpact = new CreatureImpact(game);
    const B = S.spawn('blackship', 0, 0, 0, { id: BB.ID, wake: false });
    game.blackbeard.ship = B;
    return { game, S, B, bb: game.blackbeard };
}

test('the helm: the rudder turns her ≥1.5× quicker than the bare turning circle did — most at steerage way; at rest no spin', () => {
    for (const id of ['pinnace', 'fluyt', 'galleon']) {
        const C = SHIP_CLASSES[id];
        for (const u of [1.5, 5]) {
            const st = newShipState(0, 0, 0); st.forced = { u }; st.wheel = HELM_LOCK / 2;
            stepShip(st, C, { openFrac: 0 }, 6); // (the yaw takes up the rudder within a few seconds)
            const old = u * 0.5 / C.turnR; // (the old steady rate: u·δ/turnR)
            assert.ok(-st.r > old * (u < 3 ? 1.8 : 1.5), `${id} at ${u} m/s: ${(-st.r).toFixed(4)} vs old ${old.toFixed(4)}`);
        }
        const rest = newShipState(0, 0, 0); rest.wheel = HELM_LOCK;
        stepShip(rest, C, { openFrac: 0 }, 10);
        assert.ok(Math.abs(rest.yaw) < 1e-3, `${id}: no turning on the spot`);
    }
});

test('the black ship: its patrol never comes nearer the start than BB.START_FAR, nor on the start\'s own sea', () => {
    for (const seed of [1, 7, 42, 99, 2024, 12345]) {
        const seas = new SeaIndex(seed);
        const P = pirateSea(seas, { x: 0, z: 0 });
        if (!P) continue;
        assert.notEqual(P.sea, seas.nearest(0, 0, 6).id, `seed ${seed}: not the sea by the start`);
        assert.ok(Math.hypot(P.cx, P.cz) - P.R >= BB.START_FAR, `seed ${seed}: ${Math.round(Math.hypot(P.cx, P.cz) - P.R)} m`);
    }
});

test('a skeleton thrown into the sea off the ship it boards climbs back up her rope ladder', () => {
    const { S, B, bb } = world();
    const T = S.spawn('pinnace', 40, 6, 0.3, { id: 'T', wake: false });
    S.wake(B); S.wake(T);
    B.awake = T.awake = true;
    bb._grapple(B, T);
    for (let i = 0; i < 30 * 15; i++) { bb.lashStep(T, 1 / 30); S._place(B); S._place(T); }
    assert.ok(bb.lash.planks);
    T.st.u = 0;
    const sk = S.crew.crews.get(B.id).find((v) => v.role === 'skeleton');
    sk.board = T.id;
    const lad = T.layout.ladders.find((l) => (l.side > 0) === (bb._gangways(bb.lash, {}).sT < 0)) || T.layout.ladders[0]; // (her far side: away from the black ship)
    const p = T.pose.toWorld(lad.x * 1.05 + Math.sign(lad.x) * 4, 0, lad.z, {});
    sk.overboard = { x: p.x, y: WATER_LEVEL_Y - 1, z: p.z, vy: 0, vx: 0, vz: 0, t: 0, wet: true };
    for (let i = 0; i < 30 * 40 && sk.overboard; i++) bb.overboard(sk, B, 1 / 30);
    assert.equal(sk.overboard, null, 'out of the water');
    assert.equal(sk.ship, T, 'on her deck — up her ladder');
});

test('«Вайнд Максима» at the rail: Captain Black Moustache and his skeletons brace — half a metre at most, never overboard', () => {
    const { game, S, B } = world();
    S.wake(B);
    S.crew._place(B);
    for (const role of ['blackbeard', 'skeleton']) {
        const v = S.crew.crews.get(B.id).find((o) => o.role === role);
        const half = hullHalfWidth(B.layout, v.l.z, Math.max(0.2, v.l.y)) - 0.9;
        v.l.x = half - 0.3;
        const x0 = v.l.x, z0 = v.l.z;
        const out = B.pose.dirToWorld(1, 0, new THREE.Vector3());
        for (let i = 0; i < 20; i++) {
            const r = game.creatureImpact.apply(v, { v: new THREE.Vector3(out.x * 78, 6, out.z * 78), by: 'me', spell: 'WindMaxima' });
            assert.notEqual(r, 'knockdown');
            game.creatureImpact.update(1 / 30);
        }
        assert.ok(!v.overboard, `${role}: still aboard`);
        assert.ok(Math.hypot(v.l.x - x0, v.l.z - z0) <= BRACE.SLIDE + 1e-6, `${role}: slid ${Math.hypot(v.l.x - x0, v.l.z - z0).toFixed(2)} m`);
        assert.ok(v.braceT > 0 && !v.vy, `${role}: braced, feet on the deck`);
    }
});
