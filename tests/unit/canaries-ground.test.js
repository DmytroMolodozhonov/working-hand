// Canaries on uneven ground: every prop of a camp (tent, rack, totem) stands on the real ground under it, never hangs at the fire's height; a body falls to the ground;
// «Авада» kills a standing canary and does not touch a lying one (it is dead already).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Canaries } from '../../src/game/Canaries.js';
import { campPieces } from '../../src/fx/CanaryModel.js';
import { CANARIES as C } from '../../src/game/CanaryRules.js';
import { BLOCK, WORLD_GEN } from '../../src/world/Terrain.js';

/** A game on a slope / cliff: the ground is `h(x, z)`; `made(x, z)` says whether the land is made there. */
function game(h, made = () => true) {
    const t = { topLayer: () => 0, landMade: (x, z) => made(x, z), sites: null, get: (x, y) => (y <= 0 ? BLOCK.GRASS : BLOCK.AIR) };
    const g = {
        gen: WORLD_GEN, seed: 11, authority: true, localId: 'me', scene: new THREE.Scene(), frameCount: 0,
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 } }, remotes: new Map(), isDeadLocal: false,
        combat: { enabled: true, dead: false, hp: 20, damage() {}, shieldFactor() { return 0; }, _blocked() {} },
        collision: { boxes: [], groundY: (x, z) => h(x, z), addBox(b) { this.boxes.push(b); return this.boxes.length; }, removeBox() {}, resolveCylinder() {} },
        terrain: { data: t }, items: { spawnLoose() {} }, fx: { spark() {} }, sound: { playCanary() {} }, hud: { setVoice() {} },
        impact: { apply() {} }, creatureImpact: { apply() {} },
    };
    g.character.group.position.set(500.5 + 40, 12, 700.5 + 30); // (a player far from the fire: outside the territory, within sight of the camp)
    return g;
}
const def = { gx: 3, gz: 4, x: 500.5, z: 700.5, top: 0, seed: 2 };
// a cliff: the fire's side is at 10, the east 15 m on is a drop to 2; a slope along z
const cliff = (x, z) => (x > def.x + 12 ? 2 : 10 + (z - def.z) * 0.1);

test('camp props stand on their own ground: totems on a cliff edge and a slope do not hang at the fire\'s height', () => {
    const g = game(cliff), S = new Canaries(g);
    const camp = S._loadCamp(def);
    assert.ok(camp.pieces.length >= 8 && camp.pieces.every((p) => p.placed && p.mesh.visible));
    let low = 0;
    for (const pc of camp.pieces) {
        const X = def.x + pc.piece.x, Z = def.z + pc.piece.z, ground = cliff(X, Z);
        const foot = pc.mesh.position.y + camp.y - 0.05;
        assert.ok(foot <= ground + 1e-6, `${pc.piece.kind} not above the ground (foot ${foot.toFixed(2)}, ground ${ground.toFixed(2)})`);
        assert.ok(foot >= ground - 1.01, `${pc.piece.kind} not sunk deep (${foot.toFixed(2)} vs ${ground.toFixed(2)})`);
        if (pc.piece.kind === 'totem') low++;
    }
    assert.equal(low, 4);
    assert.ok(camp.pieces.some((p) => Math.abs(p.mesh.position.y) > 0.5), 'some prop is not at the fire\'s height');
    for (const b of g.collision.boxes) assert.ok(b.minY <= cliff((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) + 1e-6, 'a walkers\' box stands on the ground too');
    assert.ok(g.collision.boxes.length >= 6);
});

test('the land under a far totem is not made yet: the prop waits hidden, then stands on the real ground', () => {
    let ready = false;
    const g = game(cliff, (x) => ready || x < def.x + 15), S = new Canaries(g);
    const camp = S._loadCamp(def);
    const waiting = camp.pieces.filter((p) => !p.placed);
    assert.ok(waiting.length >= 1 && waiting.every((p) => !p.mesh.visible) && camp.pending);
    S.camps.set('3,4', camp);
    ready = true; S._aroundT = 0; g.frameCount++; S.update(0.5);
    assert.ok(camp.pieces.every((p) => p.placed && p.mesh.visible) && !camp.pending);
    for (const pc of camp.pieces) assert.ok(pc.mesh.position.y + camp.y - 0.05 <= cliff(def.x + pc.piece.x, def.z + pc.piece.z) + 1e-6);
});

test('a dead canary in the air falls to the ground and lies there (and a standing one is not pulled up out of the bank)', () => {
    const g = game(cliff), S = new Canaries(g);
    const camp = S._loadCamp(def); S.camps.set('3,4', camp);
    const c = camp.members[1], p = c.model.position;
    p.y = cliff(p.x, p.z) + 6; // thrown up and killed in the air
    S.die(c, 'Bombardo', 'me');
    for (let i = 0; i < 90; i++) { g.frameCount++; S.update(1 / 30); }
    assert.ok(Math.abs(p.y - cliff(p.x, p.z)) < 0.05, `lies on the ground (${p.y.toFixed(2)} vs ${cliff(p.x, p.z).toFixed(2)})`);
    // a body whose ground rose (a block placed under it) is not left inside it
    p.y = cliff(p.x, p.z) - 1;
    g.frameCount++; S.update(1 / 30);
    assert.ok(Math.abs(p.y - cliff(p.x, p.z)) < 0.05);
});

test('«Авада Кедавра» kills a standing canary (its body is a target at the true height); a lying one is not a target', () => {
    const g = game(cliff), S = new Canaries(g);
    const camp = S._loadCamp(def); S.camps.set('3,4', camp);
    g.frameCount++; S.update(1 / 30);
    const c = camp.members[0];
    assert.ok(S.targets().includes(c), 'registered as a spell target');
    assert.ok(Math.abs(c.model.position.y - cliff(c.model.position.x, c.model.position.z)) < 0.2, 'stands on the ground, so the hitbox is where it is drawn');
    S.boltHit(c, 'AvadaKedavra', 'me');
    assert.ok(c.dead, 'killed');
    g.frameCount++; S.update(1 / 30);
    assert.ok(!S.targets().includes(c), 'a body is no target (the spell passes: nothing alive in it)');
});

test('pieces: every totem and tent has a box size, the merged camp has all the pieces', () => {
    const ps = campPieces(2, 22);
    assert.equal(ps.filter((p) => p.kind === 'totem').length, 4);
    assert.ok(ps.filter((p) => p.kind === 'tent').length >= 2);
    for (const p of ps) { p.geo.computeBoundingBox(); assert.ok(p.geo.boundingBox.min.y > -0.5, `${p.kind}: its foot is at y≈0`); }
    assert.ok(C.G > 0);
});

