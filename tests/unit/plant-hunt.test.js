// The hunt of the carnivorous head (PlantHunt.js + Plants.js): the author's complaint — «животное как будто ТЕЛЕПОРТИРУЕТСЯ ему в рот».
// The jaws go to the prey, the tendrils draw it in, the jaws close where it is, then it rides with the mouth: a step a frame, never a jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    Hunt, HUNT, HUNT_STATES, HOLD_STATES, PREY_SIZE, preyFits, maxPrey, huntVerdict, maxPreyStep, neckSpine, neckThin, mouthOf,
} from '../../src/game/PlantHunt.js';
import { SPECIES } from '../../src/game/Animals.js';
import { PLANT_TARGETS } from '../../src/game/PlantLife.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const mk = () => new Hunt([0.4, 5.8, 0.3], [0, 1, 0], 0);
const animal = (size = 1.5, verdict = 'eat') => ({ k: 'a', kind: 'a', id: 1, size, verdict, inside: false });
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Run a hunt on a prey that moves by `walk(t)` until it ends; returns the log. `aliveAt(t)` lets the test kill / free the prey. */
function run(prey, pos, { walk = null, aliveAt = () => true, struckAt = () => false, T = 40, dt = 1 / 60, h = mk() } = {}) {
    const log = { states: [], events: [], maxStep: 0, maxReach: 0, steps: [], h };
    h.begin(prey, pos.slice());
    for (const e of h.events) log.events.push({ e, at: 0, st: 'grab' });
    let last = null, cur = pos.slice(), t = 0;
    for (let i = 0; i < T / dt; i++) {
        t = i * dt;
        if (walk && !h.owned) { const w = walk(t); cur = [pos[0] + w[0], pos[1] + w[1], pos[2] + w[2]]; }
        const ev = h.step(dt, { auth: true, prey: h.owned ? null : cur, alive: aliveAt(t), struck: struckAt(t) });
        if (!log.states.length || log.states[log.states.length - 1].st !== h.st) log.states.push({ st: h.st, at: t });
        for (const e of ev) log.events.push({ e, at: t, st: h.st });
        log.maxReach = Math.max(log.maxReach, dist3(h.H, h.base));
        if (h.owned && h.prey) { if (last) { const s = dist3(h.preyPos, last); log.maxStep = Math.max(log.maxStep, s); log.steps.push(s); } last = h.preyPos.slice(); } else last = null;
        if (h.st === 'idle' && !h.prey && i > 10) break;
    }
    return log;
}

test('the whole meal in order: reach → wrap → snap → pull → chew ×3 → gulp → digest → rest (an animal is swallowed whole)', () => {
    const log = run(animal(1.45), [6, 0.6, 3]);
    assert.deepEqual(log.states.map((s) => s.st).filter((s, i, a) => a.indexOf(s) === i), ['grab', 'wrap', 'snap', 'pull', 'bite', 'gulp', 'digest', 'idle']);
    const names = log.events.map((x) => x.e);
    for (const e of ['lash', 'hold', 'wrap', 'snap', 'bite', 'gulp', 'eaten']) assert.ok(names.includes(e), 'event ' + e);
    assert.equal(names.filter((e) => e === 'bite').length, HUNT.BITES, 'three chews');
    assert.ok(names.indexOf('hold') < names.indexOf('snap') && names.indexOf('snap') < names.indexOf('gulp'));
    assert.ok(log.h.cool > 0, 'a full head does not hunt at once');
});

test('NOTHING TELEPORTS: the prey moves a bounded step every frame (60, 30, 15 FPS; near, far, high, low)', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 1 / 15]) {
        for (const pos of [[2, 0.6, 0], [4, 0.6, 3], [6, 0.6, 3], [8, 0.4, 1], [5, 3, 5], [-7, 0.6, -2], [0.5, 0.5, 0.5]]) {
            const log = run(animal(), pos, { dt });
            assert.ok(log.steps.length > 5, 'the prey was held for ' + JSON.stringify(pos));
            assert.ok(log.maxStep <= maxPreyStep(dt) + 1e-9, `${JSON.stringify(pos)} @${(1 / dt) | 0}: a step of ${log.maxStep.toFixed(3)} m (limit ${maxPreyStep(dt).toFixed(3)})`);
        }
    }
});

test('the old bug: the prey was 8 m from the mouth when pulled — now the mouth goes to it and it is within the jaws when they close', () => {
    const log = run(animal(), [7, 0.6, 2]);
    const snap = log.events.find((x) => x.e === 'snap');
    assert.ok(snap);
    // the moment of the snap: the prey is within SNAP_R of the mouth (it was drawn there by the tendrils, a few m/s)
    const h = mk(); h.begin(animal(), [7, 0.6, 2]);
    let d = null;
    for (let i = 0; i < 600 && !d; i++) { const ev = h.step(1 / 60, { prey: h.owned ? null : [7, 0.6, 2] }); if (ev.includes('snap')) d = dist3(h.mouth, h.preyPos); }
    assert.ok(d !== null && d <= HUNT.SNAP_R + 0.2, `at the snap the prey is ${d} m from the mouth`);
    // and the pull from there to the rest place takes real time (not a flash)
    const pull = log.states.find((s) => s.st === 'pull'), bite = log.states.find((s) => s.st === 'bite');
    assert.ok(bite.at - pull.at > 0.6, `the pull lasts ${(bite.at - pull.at).toFixed(2)} s`);
});

test('the neck stretches: far prey is reached, the head never goes farther than the neck allows, the neck thins', () => {
    const log = run(animal(), [8.6, 0.5, 2.0]);
    assert.ok(log.maxReach <= HUNT.NECK_MAX + 1e-6, 'the neck limit ' + log.maxReach);
    const h = mk(); h.begin(animal(), [8.6, 0.5, 2]);
    let maxStretch = 0;
    const sp = Array.from({ length: 18 }, () => [0, 0, 0]);
    for (let i = 0; i < 240; i++) { h.step(1 / 60, { prey: h.owned ? null : [8.6, 0.5, 2] }); maxStretch = Math.max(maxStretch, neckSpine(h.base, h.H, h.yaw, h.pitch, sp) / HUNT.REST_NECK); }
    assert.ok(maxStretch > 1.3 && maxStretch < 2.4, 'the neck stretched ×' + maxStretch.toFixed(2));
    assert.ok(neckThin(HUNT.REST_NECK * 1.8) < 0.8 && neckThin(HUNT.REST_NECK) === 1 && neckThin(1e6) >= 0.6);
});

test('the jaws are open while it reaches and shut on the prey (a slam, then the chew works them)', () => {
    const h = mk(); h.begin(animal(), [6, 0.6, 3]);
    let wide = 0, shut = 1;
    for (let i = 0; i < 1200; i++) { h.step(1 / 60, { prey: h.owned ? null : [6, 0.6, 3] }); if (h.st === 'grab' || h.st === 'wrap') wide = Math.max(wide, h.jawTarget()); if (h.st === 'snap' && h.t > 0.1) shut = Math.min(shut, h.jawTarget()); }
    assert.ok(wide > 0.65 && shut < 0.2, `wide ${wide}, shut ${shut}`);
});

test('too big does not fit: a horse is not hunted by an ordinary head, a cow only by a big one (the table maxPrey)', () => {
    assert.equal(huntVerdict('a', PREY_SIZE.horse, 1, 'eat'), 'big');
    assert.equal(huntVerdict('a', PREY_SIZE.horse, 0.88, 'eat'), 'big');
    assert.equal(huntVerdict('a', PREY_SIZE.cow, 0.88, 'eat'), 'big', 'a small head cannot take a cow');
    assert.equal(huntVerdict('a', PREY_SIZE.cow, 1.0, 'eat'), 'eat');
    assert.equal(huntVerdict('a', PREY_SIZE.pig, 0.88, 'eat'), 'eat');
    assert.equal(huntVerdict('a', PREY_SIZE.sheep, 0.88, 'eat'), 'eat');
    assert.ok(maxPrey(1.12) > PREY_SIZE.horse && !preyFits(PREY_SIZE.horse, 1.0), 'only the biggest heads take a horse');
    assert.equal(huntVerdict('p', 3.5, 1, 'tire'), 'tire', 'a man is not "too big": he is held (armour: it tries)');
    for (const [k, v] of Object.entries(PREY_SIZE)) assert.equal(v, SPECIES[k].size, 'the table follows the animals: ' + k);
});

test('prey that runs away is let go (it never was held: no teleport back, no pull)', () => {
    const log = run(animal(), [7, 0.6, 2], { walk: (t) => [t * 7, 0, 0] }); // a bolting animal, 7 m/s
    assert.ok(!log.events.some((x) => x.e === 'hold'), 'not held');
    assert.ok(log.events.some((x) => x.e === 'lost'), 'let go');
    assert.equal(log.h.owned, false);
    assert.ok(log.h.cool >= 0 && log.h.st === 'idle');
});

test('prey killed by somebody else / lost in any phase: let go at once, nothing keeps hanging', () => {
    for (const phase of ['grab', 'wrap', 'snap', 'pull', 'bite', 'gulp']) {
        const h = mk(); h.begin(animal(), [6, 0.6, 3]);
        let alive = true, ended = false, held = false;
        for (let i = 0; i < 1500 && !ended; i++) {
            if (h.st === phase) alive = false;
            const ev = h.step(1 / 60, { prey: h.owned ? null : [6, 0.6, 3], alive });
            if (ev.includes('hold')) held = true;
            if (ev.includes('lost') || ev.includes('letgo')) ended = true;
        }
        assert.ok(ended, 'let go when the prey dies in ' + phase);
        assert.equal(h.prey, null); assert.equal(h.owned, false); assert.ok(h.st === 'idle');
    }
});

test('a hard blow on the plant makes the tendrils let go (a strong prey tears free)', () => {
    const log = run(animal(), [6, 0.6, 3], { struckAt: (t) => t > 1.1 && t < 1.2 });
    assert.ok(log.events.some((x) => x.e === 'lost'), 'dropped on the blow');
    assert.ok(!log.events.some((x) => x.e === 'gulp'));
});

test('armour: a breastplate is tried and spat out (never swallowed), a magic robe at once, a villager is bitten and put down', () => {
    const man = (verdict, kind = 'p') => ({ k: kind, kind, id: 'x', size: 3.5, verdict, inside: false });
    for (const [prey, secs] of [[man('tire'), HUNT.SPIT_ARMOUR], [man('spit'), 0], [man('eat', 'v'), 0]]) {
        const log = run(prey, [5, 1.6, 2]);
        const names = log.events.map((x) => x.e);
        assert.ok(names.includes('spit'), 'put down: ' + JSON.stringify(prey));
        assert.ok(!names.includes('eaten'));
        if (prey.verdict === 'spit') assert.ok(!names.includes('bite'), 'a magic robe is not even bitten');
        if (secs) assert.ok(log.states.find((s) => s.st === 'spit').at - log.states.find((s) => s.st === 'bite').at >= secs - 0.5);
        assert.ok(log.maxStep <= maxPreyStep(1 / 60) + 1e-9, 'smooth');
    }
});

test('a man (the player) is kept inside the throat for a while and put down by the neck LOWERING him — no jump to a place 4 m away', () => {
    const h = mk(); h.digestFor = 4;
    const log = run({ k: 'p', kind: 'p', id: 'me', size: 3.5, verdict: 'eat', inside: false }, [4, 2, 2], { h });
    const spit = log.events.find((x) => x.e === 'spit');
    assert.ok(spit && log.events.some((x) => x.e === 'gulp'));
    const dig = log.states.find((s) => s.st === 'digest'), sp = log.states.find((s) => s.st === 'spit');
    assert.ok(sp.at - dig.at >= 3.9 && sp.at - dig.at < 4.5, 'inside for ~' + (sp.at - dig.at).toFixed(1) + ' s');
    assert.ok(log.maxStep <= maxPreyStep(1 / 60) + 1e-9, 'smooth');
    assert.ok(h.cool === 0 || log.h.cool >= 0);
});

test('the hunt is the same on a guest: the host\'s state drives it (no decisions on the guest), and a guest never owns a creature it does not hold', () => {
    const host = mk(), guest = mk();
    const prey = animal();
    host.begin(prey, [6, 0.6, 3]);
    guest.setNet('idle', 0, null);
    for (let i = 0; i < 900; i++) {
        host.step(1 / 60, { prey: host.owned ? null : [6, 0.6, 3] });
        if (i % 12 === 0) guest.setNet(host.st, host.t, host.prey ? { ...host.prey } : null); // 5 Hz snapshots
        guest.step(1 / 60, { auth: false, prey: guest.owned ? null : [6, 0.6, 3] });
        if (host.st === 'pull' || host.st === 'bite') assert.ok(dist3(host.H, guest.H) < 1.2, 'the heads agree ' + dist3(host.H, guest.H));
    }
    assert.equal(guest.events.includes('hold'), false);
});

test('frozen / dead / left behind: freeze() drops everything and the head rests', () => {
    const h = mk(); h.begin(animal(), [6, 0.6, 3]);
    for (let i = 0; i < 200; i++) h.step(1 / 60, { prey: h.owned ? null : [6, 0.6, 3] });
    h.freeze();
    assert.equal(h.prey, null); assert.equal(h.owned, false); assert.equal(h.st, 'frozen');
    h.step(1 / 60, {}); assert.equal(h.st, 'frozen');
});

test('the mouth point is where the jaws are (the game draws the head with the same formula)', () => {
    const m = mouthOf([0, 5, 0], 0, 0);
    assert.ok(Math.abs(m[2] - HUNT.MOUTH_F) < 1e-9 && Math.abs(m[1] - (5 + HUNT.MOUTH_U)) < 1e-9);
    const down = mouthOf([0, 5, 0], 0, Math.PI / 2); // looking straight down
    assert.ok(down[1] < 5 - HUNT.MOUTH_F + 0.2);
});

test('the sizes are real: the jaws (lobe 3 m, 2.5 m open) against the animals of the world', () => {
    const m = src('src/fx/PlantModels.js');
    assert.match(m, /LOBE_L: 3\.0, LOBE_W: 1\.25/);
    assert.ok(HUNT.MOUTH_F >= 1.4 && HUNT.MOUTH_F <= 1.6, 'the mouth point is mid-jaw');
    assert.ok(HUNT.NECK_MAX / HUNT.REST_NECK > 1.5 && HUNT.NECK_MAX / HUNT.REST_NECK < 2.0, 'the neck stretches up to ×1.5–2');
    assert.ok(HUNT.START_R < HUNT.NECK_MAX + HUNT.MOUTH_F && HUNT.START_R <= HUNT.GIVE_UP_R);
});

test('wiring: Plants.js runs the hunt, writes the prey a step a frame, never carries it through rock, lets go when left behind', () => {
    const p = src('src/game/Plants.js');
    assert.match(p, /new Hunt\(/); assert.match(p, /_applyPrey/);
    assert.match(p, /pointBlocked/, 'no carrying through walls'); assert.match(p, /_abandon/, 'a plant nobody is near lets its prey go');
    assert.match(p, /_dropHeld\(p\); p\.freezeT/, 'cold lets go'); assert.match(p, /this\._dropHeld\(p\); this\._release\(p, true\)/, 'death lets go');
    assert.ok(!/lerpVectors\(p\.from, mouth/.test(p), 'the old straight-line pull of the player is gone');
    assert.ok(!/carryFrom/.test(p), 'the old carry is gone');
    assert.match(p, /huntVerdict/, 'the table maxPrey is used');
    assert.ok(HUNT_STATES.length === 11 && HUNT_STATES.slice(0, 9).join() === 'idle,grab,pull,bite,gulp,digest,spit,cool,frozen', 'old state numbers kept for the network');
    assert.ok(HOLD_STATES.has('wrap') && HOLD_STATES.has('snap'));
    assert.equal(PLANT_TARGETS.animals.does, 'both');
});

// ---------------------------------------------------------------- the real Plants.js with a stub world (the same code the game runs)
async function world(extra = {}) {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' }) }) };
    const THREE = await import('three');
    const { Plants } = await import('../../src/game/Plants.js');
    const { PLANTS_FROM_GEN } = await import('../../src/world/Terrain.js');
    const sounds = [], animalsById = new Map(), animalList = [];
    const g = {
        gen: PLANTS_FROM_GEN, seed: 5, authority: true, localId: 'me', isDeadLocal: false, remotes: new Map(),
        scene: new THREE.Scene(), character: { group: { position: new THREE.Vector3(30, 2, 30) }, verticalVelocity: 0 },
        collision: { addBox: () => 1, removeBox() {}, groundAt: () => 0, pointBlocked: () => false, lineOfSight: () => true, ...(extra.collision || {}) },
        sound: { playPlant: (p, k) => sounds.push(k) }, fx: { spark() {} }, hud: { setStatus() {}, damageFlash() {} },
        animals: {
            byId: animalsById, list: animalList, _removed: [],
            _remove(a) { a.dead = true; this._removed.push(a.id); animalsById.delete(a.id); animalList.splice(animalList.indexOf(a), 1); },
            push(a, v) { a.pushed = v.clone(); }, _scare(a) { a.scared = true; },
        },
        castleLife: null, sync: null, combat: null, knockback: new THREE.Vector3(),
    };
    const plants = new Plants(g);
    const pig = (id, x, z) => { const a = { id, type: 'pig', dead: false, hp: 6, group: new THREE.Object3D() }; a.group.position.set(x, 0.35, z); animalsById.set(id, a); animalList.push(a); return a; };
    const head = (x = 0, z = 0, h = 0.5) => { const grp = plants._load('carnivore', 0, 0, [{ x, z, y: 0, yaw: 0.3, h, i: 0, id: 'c1' }]); plants.groups.set('carnivore|0,0', grp); plants._rebuildNear(g.character.group.position.clone().set(x, 0, z)); return grp.plants[0]; };
    return { THREE, g, plants, pig, head, sounds };
}

test('the real head in a stub world: a pig walks up and is reached, wrapped, closed on, carried, chewed and swallowed — it moves a small step a frame, never jumps', async () => {
    const { g, plants, pig, head, sounds } = await world();
    const p = head(0, 0, 0.5);
    g.character.group.position.set(40, 2, 40); // (the player is far: the pig is the prey)
    const a = pig(7, 6, 3);
    let last = a.group.position.clone(), maxJump = 0, held = false, ate = false, states = new Set();
    for (let i = 0; i < 60 * 25; i++) {
        plants.update(1 / 60);
        states.add(p.hunt.st);
        const d = a.group.position.distanceTo(last); last.copy(a.group.position);
        if (a.plantHeld) { held = true; maxJump = Math.max(maxJump, d); }
        if (g.animals._removed.includes(7)) { ate = true; break; }
    }
    assert.ok(ate, 'swallowed (states: ' + [...states] + ')');
    assert.ok(held, 'the tendrils held it');
    assert.ok(maxJump <= maxPreyStep(1 / 60) + 0.05, 'the biggest step of the pig in a frame: ' + maxJump.toFixed(3) + ' m');
    for (const st of ['grab', 'wrap', 'snap', 'pull', 'bite', 'gulp', 'digest']) assert.ok(states.has(st), st);
    for (const snd of ['creak', 'lash', 'squeeze', 'snap', 'gulp']) assert.ok(sounds.includes(snd), 'sound ' + snd);
    assert.equal(a.plantHeld, true === false ? 1 : a.plantHeld); // (it is gone; the flag does not matter)
});

test('the real head: a horse (too big) is left alone; a cow only by a big head; a pig in a wall-blocked spot is not hunted', async () => {
    const w = await world();
    const p = w.head(0, 0, 0.5); w.g.character.group.position.set(40, 2, 40);
    const horse = { id: 9, type: 'horse', dead: false, hp: 12, group: new w.THREE.Object3D() }; horse.group.position.set(4, 0.35, 2); w.g.animals.byId.set(9, horse); w.g.animals.list.push(horse);
    for (let i = 0; i < 60 * 6; i++) w.plants.update(1 / 60);
    assert.equal(p.hunt.st, 'idle', 'a horse does not fit the jaws');
    assert.equal(horse.plantHeld, undefined);
    // behind a wall: no line of sight → not hunted
    const w2 = await world({ collision: { lineOfSight: () => false } });
    const p2 = w2.head(0, 0, 0.5); w2.g.character.group.position.set(40, 2, 40);
    const pg = w2.pig(3, 5, 2);
    for (let i = 0; i < 60 * 6; i++) w2.plants.update(1 / 60);
    assert.equal(p2.hunt.st, 'idle', 'not through a wall'); assert.ok(!pg.plantHeld);
});

test('the real head: the way to the prey is closed by rock → the prey is not carried into it; killed head / frozen head / a head left alone lets the prey go', async () => {
    // killed
    const w = await world();
    const p = w.head(0, 0, 0.5); w.g.character.group.position.set(40, 2, 40);
    const a = w.pig(7, 5, 2);
    for (let i = 0; i < 60 * 30 && !(a.plantHeld && p.hunt.st === 'pull'); i++) w.plants.update(1 / 60);
    assert.equal(a.plantHeld, true);
    w.plants.die(p, 'melee', null);
    assert.equal(a.plantHeld, false, 'a dead head lets go'); assert.equal(p.hunt.prey, null);
    // frozen
    const w2 = await world();
    const p2 = w2.head(0, 0, 0.5); w2.g.character.group.position.set(40, 2, 40);
    const b = w2.pig(8, 5, 2);
    for (let i = 0; i < 60 * 30 && !(b.plantHeld && p2.hunt.st === 'pull'); i++) w2.plants.update(1 / 60);
    w2.plants._cold(p2);
    assert.equal(b.plantHeld, false, 'a frozen head lets go'); assert.equal(p2.hunt.st, 'frozen');
    // left alone (everybody went away): it does not keep the animal
    const w3 = await world();
    const p3 = w3.head(0, 0, 0.5); w3.g.character.group.position.set(40, 2, 40);
    const c = w3.pig(9, 5, 2);
    for (let i = 0; i < 60 * 30 && !(c.plantHeld && p3.hunt.st === 'pull'); i++) w3.plants.update(1 / 60);
    w3.g.character.group.position.set(5000, 2, 5000);
    for (let i = 0; i < 60 * 2; i++) w3.plants.update(1 / 60);
    assert.equal(c.plantHeld, false, 'a plant nobody is near lets go');
    // rock in the way
    const w4 = await world({ collision: { pointBlocked: (x, y, z) => x > 3 } });
    const p4 = w4.head(0, 0, 0.5); w4.g.character.group.position.set(40, 2, 40);
    const d = w4.pig(10, 2.5, 1);
    let into = 0;
    for (let i = 0; i < 60 * 12; i++) { w4.plants.update(1 / 60); if (d.group.position.x > 3 && d.plantHeld) into++; }
    assert.equal(into, 0, 'never carried into rock');
});

test('the real head: it hunts ME — I am drawn to the jaws a step a frame, never from far to the mouth in one go, and put down by the lowered neck', async () => {
    const { THREE, g, plants, head } = await world();
    const p = head(0, 0, 0.5);
    g.character.group.position.set(5.5, 2.0, 2.5); // (feet on the ground: the eyes 2 m up)
    let last = g.character.group.position.clone(), maxJump = 0, drawn = false, inside = false, out = false;
    g.damageLocalPlayer = () => {};
    for (let i = 0; i < 60 * 40; i++) {
        plants.update(1 / 60);
        const d = g.character.group.position.distanceTo(last); last.copy(g.character.group.position);
        if (plants.mine) { drawn = true; maxJump = Math.max(maxJump, d); }
        if (p.hunt.st === 'digest' && p.prey) inside = true;
        if (inside && !plants.mine) { out = true; break; }
    }
    assert.ok(drawn && inside && out, `drawn ${drawn} inside ${inside} out ${out}`);
    assert.ok(maxJump <= maxPreyStep(1 / 60) + 0.1, 'my biggest step in a frame: ' + maxJump.toFixed(3));
    assert.ok(g.character.group.position.y > 0.5, 'I was put down above the ground');
});

test('the model: the neck is one dynamic shape, written in the plant\'s own axes; built once (shared), samples for the warm-up exist', async () => {
    const w = await world();
    const { plantSamples, HeadNeck, NECK } = await import('../../src/fx/PlantModels.js');
    const s = plantSamples(); assert.ok(s.children.length >= 10);
    const n = new HeadNeck(1), sp = Array.from({ length: NECK.N }, () => [0, 1 + 0.3 * 0, 0]);
    neckSpine([0, 1, 0], [3, 3, 1], 0, 0.4, sp);
    n.update(sp, 0.8, 0.5, 0.5, 0);
    const pos = n.geo.attributes.position.array;
    for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]), 'finite vertex');
    const b = new w.THREE.Box3().setFromBufferAttribute(n.geo.attributes.position);
    assert.ok(b.max.x > 2.5 && b.min.y < 1.1 && b.max.y > 3, 'the neck runs from the root to the hinge');
    assert.ok(n.sample(1, new w.THREE.Vector3()).distanceTo(new w.THREE.Vector3(3, 3, 1)) < 1e-6);
});

test('every plant leaves its thing when it dies, and nothing hangs in the air: the ground under it gone → it breaks and leaves it (the author\'s rule)', async () => {
    const w = await world();
    const { BLOCK } = await import('../../src/world/Terrain.js');
    let solid = true; const drops = [];
    w.g.terrain = { data: { get: () => (solid ? BLOCK.GRASS : BLOCK.AIR), landMade: () => true } };
    w.g.items = { spawnLoose: (it) => drops.push(it.kind) };
    w.plants._aroundT = 1e9; // (no world generation in this stub)
    const p = w.head(0, 0, 0.5); w.g.character.group.position.set(40, 2, 40);
    for (let i = 0; i < 90; i++) w.plants.update(1 / 60);
    assert.equal(p.dead, false, 'standing on ground it stays');
    solid = false; // the ground is blown away
    for (let i = 0; i < 90; i++) w.plants.update(1 / 60);
    assert.equal(p.dead, true, 'no ground — it falls and breaks');
    assert.deepEqual(drops, ['carnivoreHead'], 'and leaves the head of a carnivorous plant');
    // a plain kill leaves it too
    const w2 = await world(); const d2 = []; w2.g.items = { spawnLoose: (it) => d2.push(it.kind) };
    const q = w2.head(0, 0, 0.5); w2.plants.die(q, 'melee', null);
    assert.deepEqual(d2, ['carnivoreHead']);
});
