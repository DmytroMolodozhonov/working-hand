// The jump against ledges, with the real body (Character.update) and the real walls (CollisionWorld.resolveCylinder),
// stepped as Game does: 1–2 blocks are jumped onto, 3 are not, a low roof cuts the jump, a doorway is no trap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { jumpHeight, JUMP_ASSIST, ledgePush } from '../../src/game/Jump.js';

const R = 0.48, DT = 1 / 60;

/** Blocks: column (ix, iz) top layer = top(ix, iz); `roof(ix, iz)` = one block floating at that layer (a ceiling). */
function terrain(top, roof = () => null) {
    const solid = (ix, iz, l) => l <= top(ix, iz) || roof(ix, iz) === l;
    return {
        topLayer: (ix, iz) => roof(ix, iz) ?? top(ix, iz),
        surfaceY: (x, z) => top(Math.round(x), Math.round(z)) - 0.5,
        floorBelow(ix, iz, L) { for (let l = L; l > -10; l--) if (solid(ix, iz, l)) return l; return -10; },
        ceilingAbove(ix, iz, L) { for (let l = L; l < 40; l++) if (solid(ix, iz, l)) return l; return Infinity; },
        solidIn(ix, iz, L0, L1) { for (let l = L0; l <= L1; l++) if (solid(ix, iz, l)) return true; return false; },
    };
}

/** Faces −z (yaw 0), stands 0.6 from a wall of `high` blocks whose face is at z = −1.5; jumps with `strength`; `run`: units/s forward. */
function leap({ high, strength, roofAt = null, run = 0, T = null }) {
    const col = new CollisionWorld();
    col.setTerrain(T || terrain((ix, iz) => (iz <= -2 ? high : 0), roofAt ? (ix, iz) => (iz <= -2 ? roofAt : null) : () => null));
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setIdlePose();
    ch.group.position.set(0, -0.5 + PLAYER_GROUND_OFFSET, -1.5 + R + 0.1); // (floor top y −0.5)
    ch.group.rotation.y = 0;
    for (let i = 0; i < 30; i++) ch.update(DT, col, true);
    const resolve = () => {
        const p = ch.group.position, feet = p.y - PLAYER_GROUND_OFFSET;
        const f = ch.onGround ? Math.max(feet, Math.min(ch.groundY, feet + 1.05)) : feet;
        col.resolveCylinder(p, R, f, 3.5, 1.05 + (ch.jumpAir ? JUMP_ASSIST : 0), true, 3.5);
    };
    assert.ok(ch.jump(strength), 'took off');
    if (run) { ch.jumpVel.x = 0; ch.jumpVel.z = -run; }
    let top = -1e9;
    for (let i = 0; i < 240; i++) {
        ch.update(DT, col, true);
        resolve();
        top = Math.max(top, ch.group.position.y - PLAYER_GROUND_OFFSET);
    }
    const p = ch.group.position;
    return { z: p.z, feet: p.y - PLAYER_GROUND_OFFSET, onGround: ch.onGround, top, groundY: ch.groundY };
}

const floorTop = -0.5;

test('jump heights: a small hop, a normal jump, the strongest', () => {
    assert.ok(jumpHeight(0) >= 0.45 && jumpHeight(0) < 0.7);
    assert.ok(jumpHeight(0.36) > 0.85 && jumpHeight(0.36) < 1.2);
    assert.ok(jumpHeight(1) > 1.4 && jumpHeight(1) < 1.7);
});

test('a normal jump from a stand gets onto a 1-block and onto a 2-block ledge', () => {
    for (const high of [1, 2]) {
        const r = leap({ high, strength: 0.36, run: 3 });
        assert.ok(r.z < -1.5 && r.onGround && Math.abs(r.feet - (floorTop + high)) < 0.05, `${high} blocks: ${JSON.stringify(r)}`);
    }
});

test('the strongest jump does not get onto a 3-block wall; the body lands back where it took off', () => {
    const r = leap({ high: 3, strength: 1, run: 3 });
    assert.ok(r.z > -1.5 && r.feet < floorTop + 0.05 && r.onGround, JSON.stringify(r));
});

test('a low roof over the ledge cuts the jump: the head never goes into it', () => {
    const r = leap({ high: 2, strength: 1, roofAt: 5 }); // (roof block at layer 5: its underside y 3.5 — 1.5 over the ledge top)
    assert.ok(r.top < floorTop + 2.1, JSON.stringify(r));
});

test('a standing jump beside a wall does not push through it', () => {
    const r = leap({ high: 3, strength: 1, run: 0 });
    assert.ok(r.z >= -1.5 + R - 1e-6, JSON.stringify(r));
});

/** Standing flush to a ledge (no run), the push Game._jumpOnto gives (ledgePush), then the real body's jump. */
function standJump({ top, x = 0, z = -1.5 + R, yaw = 0, strength = 0.36, roof = () => null }) {
    const T = terrain(top, roof);
    const col = new CollisionWorld();
    col.setTerrain(T);
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setIdlePose();
    ch.group.position.set(x, -0.5 + PLAYER_GROUND_OFFSET, z);
    ch.group.rotation.y = yaw;
    const resolve = () => {
        const p = ch.group.position, feet = p.y - PLAYER_GROUND_OFFSET;
        const f = ch.onGround ? Math.max(feet, Math.min(ch.groundY, feet + 1.05)) : feet;
        col.resolveCylinder(p, R, f, 3.5, 1.05 + (ch.jumpAir ? JUMP_ASSIST : 0), true, 3.5);
    };
    for (let i = 0; i < 30; i++) { ch.update(DT, col, true); resolve(); }
    assert.ok(ch.jump(strength), 'took off');
    const p0 = ch.group.position;
    const push = ledgePush(T, p0.x, p0.z, p0.y - PLAYER_GROUND_OFFSET, yaw, R);
    if (push) { ch.jumpVel.x = push.x; ch.jumpVel.z = push.z; }
    let maxY = -1e9;
    for (let i = 0; i < 240; i++) { ch.update(DT, col, true); resolve(); maxY = Math.max(maxY, ch.group.position.y - PLAYER_GROUND_OFFSET); }
    const p = ch.group.position;
    return { push, x: p.x, z: p.z, feet: p.y - PLAYER_GROUND_OFFSET, onGround: ch.onGround, maxY };
}

test('a standing jump flush to a ledge (facing it, a bit aside, at the corner): 1 and 2 blocks are got onto', () => {
    const wall = (high) => (ix, iz) => (iz <= -2 ? high : 0);
    const corner = (high) => (ix, iz) => (iz <= -2 && ix <= -1 ? high : 0); // (the ledge is only diagonally in front)
    for (const high of [1, 2]) {
        for (const yaw of [0, 0.5, -0.5, 1.0]) {
            const r = standJump({ top: wall(high), yaw });
            assert.ok(r.onGround && r.feet > floorTop + high - 0.05, `wall ${high} yaw ${yaw}: ${JSON.stringify(r)}`);
        }
        const r = standJump({ top: corner(high), x: -0.2, z: -1.0, yaw: 0.6 });
        assert.ok(r.onGround && r.feet > floorTop + high - 0.05, `corner ${high}: ${JSON.stringify(r)}`);
    }
});

test('a standing jump flush to a 3-block wall: no push, it lands where it stood; nothing behind the back is climbed', () => {
    const r = standJump({ top: (ix, iz) => (iz <= -2 ? 3 : 0), strength: 1 });
    assert.equal(r.push, null);
    assert.ok(r.feet < floorTop + 0.05 && r.z > -1.5, JSON.stringify(r));
    const back = standJump({ top: (ix, iz) => (iz <= -2 ? 2 : 0), yaw: Math.PI });
    assert.equal(back.push, null);
});

test('a standing jump onto a 2-block ledge under a low roof: the head never goes into it', () => {
    const r = standJump({ top: (ix, iz) => (iz <= -2 ? 2 : 0), roof: (ix, iz) => (iz <= -2 ? 5 : null), strength: 1 });
    assert.ok(r.maxY < floorTop + 2.1, JSON.stringify(r));
});
