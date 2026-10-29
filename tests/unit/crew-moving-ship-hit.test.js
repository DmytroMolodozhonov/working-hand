// A duel charge must hit a sailor on a MOVING ship: forward speed, a turn, roll and pitch of the sea. His body
// (Duel._villagerBody) is taken from the world place Sailors._place gives him from the ship's pose every frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../../src/game/ShipLayout.js';
import { ShipPose } from '../../src/game/ShipCollision.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';
import { Sailors } from '../../src/game/Sailors.js';
import { Duel, firstTouched, DUEL_SPELLS } from '../../src/game/Duel.js';

function world(cls = 'galleon') {
    const layout = buildLayout(cls);
    const s = {
        id: 'S1', cls: SHIP_CLASSES[cls], layout, crewKilled: new Set(), color: 0x884422, hostile: new Map(), name: 'Тест',
        st: { x: 0, z: 0, yaw: 0, u: 0, roll: 0, pitch: 0 }, pose: new ShipPose(), chests: [], owner: null,
    };
    s.pose.set(0, 0, 0, 0, 0, 0);
    const game = { authority: true, scene: { add() {} }, localId: 'me', remotes: new Map(), isNight: false, character: { group: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } } }, hud: { setVoice() {} } };
    const ships = { list: new Map([[s.id, s]]), loyalTo: () => false, me: null };
    const crew = new Sailors(game, ships);
    crew.wake(s);
    return { s, game, crew, list: crew.crews.get(s.id) };
}

test('a charge hits a sailor on a ship that sails, turns and rolls', () => {
    const { s, crew, list } = world();
    const v = list.find((x) => x.role === 'sailor');
    v.path = null; v.waitT = 100;
    const duel = Object.create(Duel.prototype);
    const dt = 1 / 60, speed = DUEL_SPELLS.AvadaKedavra?.speed || 40;
    let t = 0, hits = 0, tries = 0;
    for (let f = 0; f < 600; f++) {
        t += dt;
        const yaw = 0.25 * t, u = 14;
        s.pose.set(s.pose.x - Math.sin(yaw) * u * dt, 0.4 * Math.sin(t * 1.7), s.pose.z - Math.cos(yaw) * u * dt, yaw, 0.12 * Math.sin(t * 1.3), 0.06 * Math.sin(t * 0.9));
        s.st.x = s.pose.x; s.st.z = s.pose.z; s.st.yaw = yaw;
        crew.update(dt);
        if (f % 20) continue;
        // the charge aimed at his chest from 25 m away flies one frame's step (as Duel._fly does) — the ship moves meanwhile
        const target = new THREE.Vector3(v.x, v.y + 0.3, v.z);
        const dir = new THREE.Vector3(Math.sin(f), 0, Math.cos(f)).normalize();
        const from = target.clone().addScaledVector(dir, -(speed * dt) * 0.5);
        const to = from.clone().addScaledVector(dir, speed * dt);
        const e = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
        duel._villagerBody(v, e);
        const body = { kind: 'c', id: v.id, a: e.a, b: e.b, r: e.r };
        tries++;
        if (firstTouched(from, to, [body])) hits++;
        // and the body stands on the sailor, not where the ship was
        const mid = e.a.clone().add(e.b).multiplyScalar(0.5);
        assert.ok(Math.hypot(mid.x - v.x, mid.z - v.z) < 0.05, 'the body follows the sailor in the world frame');
    }
    assert.equal(hits, tries, `every charge hit: ${hits}/${tries}`);
});
