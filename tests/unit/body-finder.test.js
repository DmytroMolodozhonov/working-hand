// «Reperio»: the finding of my own last body (BodyFinderRules.js) — its rules; the light and the map are drawn by BodyFinder.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEEK, findTarget, routePoints, beadsNear, waveAt, arrived, bearing, compass, SEEK_TARGETS } from '../../src/game/BodyFinderRules.js';

const body = (id, who, x, z, age = 0, k = 'p') => ({ id, k, who, x, y: 5, z, age });

test('the target: my newest body (its place now), else the place of the last death, else nothing', () => {
    const bodies = [body('pme_a1', 'me', 10, 20), body('pme_zz', 'me', 100, 200), body('pyou_zz', 'you', 5, 5), body('v1', 'me', 1, 1, 0, 'v')];
    assert.deepEqual(findTarget(bodies, 'me', { x: 1, y: 1, z: 1 }), { x: 100, y: 5, z: 200, from: 'body', id: 'pme_zz' });
    const t = findTarget([body('pyou_1', 'you', 5, 5)], 'me', { x: 7, y: 2, z: -9, t: 1 });
    assert.deepEqual(t, { x: 7, y: 2, z: -9, from: 'record' });
    assert.equal(findTarget([], 'me', null), null);
    assert.equal(findTarget([body('pme_1', 'me', NaN, 0)], 'me', { x: NaN, y: 0, z: 0 }), null, 'broken numbers are no place');
    assert.equal(findTarget(null, 'me', undefined), null);
});

test('the way: a point every STEP m, the ends exact; a far body gets the ends only (the direction)', () => {
    const r = routePoints({ x: 0, z: 0 }, { x: 40, z: 30 });
    assert.equal(r.points.length, Math.round(50 / SEEK.STEP) + 1);
    assert.deepEqual(r.points[0], { x: 0, z: 0 }); assert.deepEqual(r.points[r.points.length - 1], { x: 40, z: 30 });
    assert.ok(!r.far && Math.abs(r.length - 50) < 1e-9);
    const far = routePoints({ x: 0, z: 0 }, { x: 5000, z: 0 });
    assert.ok(far.far && far.points.length === 2);
    assert.equal(routePoints({ x: 3, z: 3 }, { x: 3, z: 3 }).points.length, 2, 'standing on it: still a valid way');
});

test('the beads: only near the hero, at most BEADS, the nearest first', () => {
    const pts = routePoints({ x: 0, z: 0 }, { x: 600, z: 0 }).points;
    const idx = beadsNear(pts, { x: 0, z: 0 });
    assert.ok(idx.length <= SEEK.BEADS);
    for (const i of idx) assert.ok(pts[i].x <= SEEK.BEAD_RANGE + 1e-9);
    assert.equal(idx[0], 0);
    assert.deepEqual(beadsNear(pts, { x: 5000, z: 5000 }), []);
});

test('the wave of light runs towards the body and the beads are never dark', () => {
    for (let s = 0; s < 60; s += 3) for (let t = 0; t < 4; t += 0.37) { const w = waveAt(s, t); assert.ok(w >= 0.25 - 1e-9 && w <= 1 + 1e-9); }
    const crest = (t) => { let best = 0, bs = -1; for (let s = 0; s < SEEK.WAVE_LEN; s += 0.25) { const w = waveAt(s + 100 * SEEK.WAVE_LEN, t); if (w > best) { best = w; bs = s; } } return bs; };
    const a = crest(0), b = crest(0.5);
    const moved = ((b - a) % SEEK.WAVE_LEN + SEEK.WAVE_LEN) % SEEK.WAVE_LEN;
    assert.ok(Math.abs(moved - (0.5 * SEEK.WAVE_SPEED) % SEEK.WAVE_LEN) < 0.6, 'moved ' + moved);
});

test('arrival and bearing: by the ground distance; north is −Z; the words', () => {
    assert.ok(arrived({ x: 0, z: 0 }, { x: 3, z: 4 }));
    assert.ok(!arrived({ x: 0, z: 0 }, { x: 30, z: 40 }));
    assert.ok(Math.abs(bearing({ x: 0, z: 0 }, { x: 0, z: -10 })) < 1e-9, 'north');
    assert.equal(compass(bearing({ x: 0, z: 0 }, { x: 0, z: -10 })), 'север');
    assert.equal(compass(bearing({ x: 0, z: 0 }, { x: 0, z: 10 })), 'юг');
});

test('the table of whom it acts on names every case; it costs 10', () => {
    for (const k of ['me', 'players', 'others_bodies', 'creatures', 'world', 'realms', 'never_died', 'dead', 'dark', 'arrive', 'network']) assert.ok(SEEK_TARGETS[k]?.why, k);
    assert.equal(SEEK.COST, 10);
});

// ---- the whole spell on a made-up game: find → start → light → the map's line → arrive / die / timeout
import * as THREE from 'three';
import { BodyFinder } from '../../src/game/BodyFinder.js';
function game(extra = {}) {
    const voice = [];
    return Object.assign({
        scene: new THREE.Scene(), isDeadLocal: false, combat: { dead: false }, localId: 'me',
        character: { group: { position: new THREE.Vector3(0, 12, 0) } },
        death: { bodies: new Map() }, lastDeath: null, hud: { setVoice: (t) => voice.push(t), seekPath: null },
        collision: { groundY: () => 10, groundAt: () => 10 }, world: { terrain: { data: null } }, fx: { spark() {} },
        _voice: voice,
    }, extra);
}
test('never died: nothing to find, and the words say so; a body in another realm: no way, the realm is named', () => {
    const g = game(), F = new BodyFinder(g);
    const r = F.find(); assert.equal(r.ok, false); assert.match(r.why, /не умирали/);
    g.lastDeath = { x: 5, y: 1e9, z: 5 }; // (high up: space)
    const s = F.find(); assert.equal(s.ok, false); assert.match(s.why, /другом мире/);
});
test('the trail: beads along the way, the map\'s line, a pillar over the body; the body moved — the way follows; arrival puts it out', () => {
    const g = game(), F = new BodyFinder(g);
    g.lastDeath = { x: 0, y: 10, z: -80, t: 1 };
    const f = F.find(); assert.ok(f.ok && Math.abs(f.length - 80) < 1e-9);
    F.start(f);
    for (let i = 0; i < 30; i++) F.update(1 / 30);
    assert.ok(F.active && F.core.count > 10 && F.core.count <= SEEK.BEADS, 'beads: ' + F.core.count);
    assert.ok(F.pillar.visible);
    assert.ok(g.hud.seekPath?.points.length > 10 && g.hud.seekPath.target.z === -80, 'the map has the line');
    assert.match(g._voice.at(-1), /Тело — в 80 м/);
    // a body of mine appears elsewhere (it was moved): the way is made anew to ITS place
    g.death.bodies.set('pme_zz', { id: 'pme_zz', k: 'p', who: 'me', x: 40, y: 10, z: 0, age: 1 });
    for (let i = 0; i < 40; i++) F.update(1 / 30);
    assert.equal(g.hud.seekPath.target.x, 40);
    // the hero comes to it
    g.character.group.position.set(38, 12, 1);
    F.update(1 / 30);
    assert.ok(!F.active && g.hud.seekPath === null && !F.group.visible, 'put out by the arrival');
    assert.ok(F.log.includes('arrived'));
});
test('it ends by itself: a death, the time; a body far off gets the pillar and the map, no beads', () => {
    const g = game(), F = new BodyFinder(g);
    g.lastDeath = { x: 0, y: 10, z: -60, t: 1 };
    F.start(F.find()); F.update(0.1);
    g.isDeadLocal = true; F.update(0.1);
    assert.ok(!F.active && F.log.includes('died'));
    g.isDeadLocal = false;
    g.lastDeath = { x: 4000, y: 10, z: 0, t: 1 };
    F.start(F.find()); F.update(0.1);
    assert.ok(F.route.far && F.core.count === 0 && F.pillar.visible && g.hud.seekPath.far);
    for (let i = 0; i < 130; i++) F.update(1);
    assert.ok(!F.active && F.log.includes('timeout'));
});
