// How a wizard thinks in trouble (WizardMind.js): reaction time, «Firefighting», the answer to each kind of magic, the dome of the strong,
// the hunt for a criminal (the hidden wanted level), the stroke that turns smoke aside; and their wiring (a crowd runs to safe places and spreads).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    REACT_LAG, REACT_LEVEL, reactLag, reactLevel, reactLagText, seededRng, FIRE, knowsFirefighting, onFire, MAGIC_REACT, reaction, SHIELD, canDome, chooseShield,
    HUNT, huntRole, huntLeash, huntStart, huntStep, huntGuess, LONERS, SMOKE, smokeStroke, smokeKick, npcSweeps,
} from '../../src/game/WizardMind.js';
import { fleeSearch, FLEE } from '../../src/game/FleePlan.js';
import { wantedLevel, WANTED } from '../../src/game/Wanted.js';
import { WIZ_RANKS } from '../../src/game/WizardAI.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('reaction time: four levels by rank — a beginner is lost for seconds, the head of the tower reacts in a blink', () => {
    assert.deepEqual(Object.keys(REACT_LAG).map(Number), [1, 2, 3, 4]);
    for (const r of Object.keys(WIZ_RANKS)) assert.ok(REACT_LEVEL[r] >= 1 && REACT_LEVEL[r] <= 4, `${r} has a level`);
    assert.equal(reactLevel('novice'), 1); assert.equal(reactLevel('adept'), 2); assert.equal(reactLevel('teacher'), 3); assert.equal(reactLevel('elder'), 3); assert.equal(reactLevel('master'), 4);
    const mean = (rank, n = 400) => { const rng = seededRng(7); let s = 0; for (let i = 0; i < n; i++) s += reactLag(rank, rng).t; return s / n; };
    assert.ok(mean('novice') > mean('adept') && mean('adept') > mean('teacher') && mean('teacher') > mean('master'), 'the more experienced, the faster');
    assert.ok(mean('novice') >= 2.5, 'a beginner takes seconds'); assert.ok(mean('master') < 0.4, 'the Master: a blink');
    let lost = 0; const rng = seededRng(3);
    for (let i = 0; i < 400; i++) { const l = reactLag('novice', rng); if (l.lost) { lost++; assert.ok(l.t >= REACT_LAG[1].min + REACT_LAG[1].lostExtra); } }
    assert.ok(lost > 60 && lost < 180, 'a third of the beginners are lost altogether: ' + lost);
    for (let i = 0; i < 100; i++) assert.equal(reactLag('master', rng).lost, false);
    assert.match(reactLagText(reactLag('novice', seededRng(1))), /реакция \(младший\): \d\.\d\d с/);
    assert.deepEqual(reactLag('adept', seededRng(5)), reactLag('adept', seededRng(5)), 'the same wizard, the same lag, on every computer');
});

test('«Firefighting»: 4 wizards in 5 know it (the Master always); a burning one puts himself out for mana, the rest run', () => {
    let n = 0; const N = 2000;
    for (let i = 0; i < N; i++) if (knowsFirefighting('c1:' + i, 'adept')) n++;
    assert.ok(Math.abs(n / N - FIRE.KNOW) < 0.04, 'about 80 %: ' + n / N);
    assert.ok(knowsFirefighting('x', 'master'));
    assert.equal(knowsFirefighting('c1:5', 'adept'), knowsFirefighting('c1:5', 'adept'));
    const a = onFire({ knows: true, mana: 20, rank: 'adept' }, () => 0.5);
    assert.equal(a.a, 'douse'); assert.ok(a.t >= 0.9 && a.t <= 1.7);
    assert.ok(onFire({ knows: true, mana: 20, rank: 'master' }, () => 0.5).t < a.t, 'a strong one is quicker');
    assert.equal(onFire({ knows: false, mana: 20 }).a, 'run');
    assert.equal(onFire({ knows: true, mana: FIRE.COST - 1 }).a, 'run', 'no mana');
    assert.equal(onFire({ knows: true, mana: 20, noWand: true }).a, 'run', 'no wand');
});

test('the answer to each kind of magic: fire and quake — away; a blast — the shield; ice — the shield; wind — brace; hurt badly — heal', () => {
    for (const k of ['fire', 'hellfire', 'water', 'ice', 'wind', 'lightning', 'blast', 'quake']) assert.ok(MAGIC_REACT[k]?.first.length && MAGIC_REACT[k].why.length > 20, k);
    const sit = (kind, o = {}) => ({ kind, mana: 50, hpK: 1, knowsFire: true, burning: false, sheltered: false, noWand: false, ...o });
    assert.equal(reaction(sit('hellfire')), 'shelter');
    assert.equal(reaction(sit('hellfire', { sheltered: true })), 'spread');
    assert.equal(reaction(sit('fire', { burning: true, sheltered: true })), 'douse');
    assert.equal(reaction(sit('blast')), 'shield');
    assert.equal(reaction(sit('blast', { mana: 2 })), 'sidestep', 'no mana for a shield: a step aside');
    assert.equal(reaction(sit('ice')), 'shield');
    assert.equal(reaction(sit('lightning')), 'run');
    assert.equal(reaction(sit('quake')), 'run');
    assert.equal(reaction(sit('wind')), 'brace');
    assert.equal(reaction(sit('blast', { hpK: 0.2 })), 'heal');
    assert.equal(reaction(sit('blast', { hpK: 0.2, noWand: true })), 'sidestep', 'no wand: no shield, no healing');
});

test('Protection Maxima: the strong (300+ mana, the Master) may raise the dome — when it is really worth it, not on every shot', () => {
    assert.ok(canDome(400, 'elder') && canDome(500, 'master') && canDome(10, 'master'));
    assert.ok(!canDome(200, 'teacher') && !canDome(100, 'adept') && !canDome(50, 'novice'), 'the others have the hand shield only');
    const base = { mana: 200, maxMana: 400, rank: 'elder', spell: 'Stupefy', incoming: 1, foes: 1, hpK: 1, domeReady: true };
    let dome = 0; const rng = seededRng(11);
    for (let i = 0; i < 200; i++) if (chooseShield(base, rng) === 'dome') dome++;
    assert.equal(dome, 0, 'one plain spell: the hand shield');
    const worth = (o) => { let n = 0; const r = seededRng(2); for (let i = 0; i < 200; i++) if (chooseShield({ ...base, ...o }, r) === 'dome') n++; return n; };
    assert.ok(worth({ spell: 'AvadaKedavra' }) > 150, 'a heavy spell'); assert.ok(worth({ incoming: 4 }) > 100, 'a volley'); assert.ok(worth({ foes: 3 }) > 100, 'many foes'); assert.ok(worth({ boss: true }) > 150, 'a boss');
    assert.ok(worth({ hpK: 0.3 }) > 100, 'hurt and under fire');
    assert.ok(worth({ incoming: 4 }) < 200, 'not always');
    assert.equal(chooseShield({ ...base, maxMana: 200, rank: 'teacher', spell: 'AvadaKedavra' }, () => 0), 'hand', 'a teacher never has the dome');
    assert.equal(chooseShield({ ...base, mana: 3 }), null, 'no mana');
    assert.equal(chooseShield({ ...base, spell: 'AvadaKedavra', domeReady: false }, () => 0), 'hand', 'the dome is on cooldown');
    assert.ok(SHIELD.DOME.hits >= 1 && SHIELD.DOME.cd > SHIELD.DOME.t);
});

test('the shield of a wizard is the player\'s picture (CombatVisuals), and a strong wizard\'s dome is wired (source)', () => {
    const fx = src('src/fx/WizardFx.js');
    assert.match(fx, /new CombatVisuals\(this\.game\.scene\)/, 'the very same shield and dome as a player\'s «Protection» / «Protection Maxima»');
    assert.ok(!/shieldGeo|domeGeo|CircleGeometry\(1\.82/.test(fx), 'no private disc any more');
    assert.match(fx, /handScale: NPC_SHIELD\.R, domeR: NPC_SHIELD\.DOME_R/, 'sized as the hitbox: what is seen is what stops');
    const wl = src('src/game/WizardLife.js'), wf = src('src/game/WizardFight.js');
    assert.match(wl, /canDome\(max, rank\)/, 'a strong wizard gets a dome in his stats');
    assert.match(wf, /chooseShield\(/); assert.match(wf, /canDome\(v\.maxMana, v\.rank\)/);
});

test('the hunt: the more wanted, the farther and longer; a beginner hides, the Master keeps his chair, a lone wizard who saw the shot comes', () => {
    for (let l = 0; l <= 3; l++) assert.ok(HUNT[l].leash > 0 && HUNT[l].search > 0);
    for (let l = 1; l <= 3; l++) assert.ok(HUNT[l].leash > HUNT[l - 1].leash && HUNT[l].search > HUNT[l - 1].search && HUNT[l].share >= HUNT[l - 1].share);
    const rng = () => 0.1;
    assert.equal(huntRole({ role: 'wanderer', rank: 'adept', level: 0, saw: true }, () => 0.99), 'hunt', 'a lone wizard who saw where it came from: always');
    assert.equal(huntRole({ role: 'master', rank: 'master', level: 3, saw: true, tied: true }, rng), 'guard');
    assert.equal(huntRole({ role: 'student', rank: 'novice', level: 0 }, () => 0.9), 'hide', 'a beginner hides — it is logical');
    assert.equal(huntRole({ role: 'student', rank: 'novice', level: 0, timid: true }, rng), 'hide');
    assert.equal(huntRole({ role: 'teacher', rank: 'teacher', level: 2, hasWand: false }, rng), 'hide', 'no wand');
    const share = (level) => { let n = 0; const r = seededRng(4); for (let i = 0; i < 1000; i++) if (huntRole({ role: 'teacher', rank: 'teacher', level }, r) === 'hunt') n++; return n / 1000; };
    assert.ok(share(0) < share(1) && share(1) < share(2) && share(2) < share(3), 'the higher the level, the more go');
    assert.ok(share(3) > 0.8 && share(0) < 0.4);
    assert.ok(huntLeash({ role: 'wanderer', level: 0, saw: true }) >= 150, 'a lone wizard who saw it follows far from home');
    assert.ok(huntLeash({ role: 'teacher', level: 3 }) > huntLeash({ role: 'teacher', level: 0 }));
    assert.ok(LONERS.has('wanderer') && LONERS.has('mage') && LONERS.has('townwiz'));
    // the level itself grows with deeds and falls with time (Wanted.js) — the hunt only reads it
    assert.equal(wantedLevel(0), 0); assert.equal(wantedLevel(WANTED.LEVELS[3]), 3);
});

test('the search: the last known place, a look round there, then the likely ways on from it; it ends in a fight when he is seen, or by time', () => {
    const h = huntStart({ x: 100, z: 0, dx: 5, dz: 0 }, 2);
    assert.equal(h.t, HUNT[2].search); assert.equal(h.max, HUNT[2].guesses);
    const me = { x: 0, z: 0 };
    let s = huntStep(h, me, false, 0.5);
    assert.equal(s.a, 'go'); assert.deepEqual(s.goal, { x: 100, z: 0 });
    me.x = 99; s = huntStep(h, me, false, 0.5);
    assert.equal(s.a, 'look', 'arrived: looks round');
    let looks = 0, goes = 0; const places = [];
    for (let i = 0; i < 400 && s.a !== 'give'; i++) {
        s = huntStep(h, me, false, 0.5);
        if (s.a === 'look') looks++;
        if (s.a === 'go') { goes++; if (!places.some((p) => p === s.goal)) places.push(s.goal); me.x = s.goal.x; me.z = s.goal.z; }
    }
    assert.equal(s.a, 'give'); assert.ok(places.length === h.max, 'checks the likely places, no more than the level allows: ' + places.length);
    assert.ok(places[0].x > 100, 'the first guess: on along the way he was going');
    assert.equal(huntStep(huntStart({ x: 0, z: 0 }, 0), me, true, 0.1).a, 'found', 'seen — the hunt is over');
    const g = huntGuess({ x: 0, z: 0, dx: 0, dz: 0, picks: 0 }, { x: -10, z: 0 }, () => 0);
    assert.ok(g.x > 0, 'no heading known: on away from where the hunter came from');
});

test('the stroke of the wand: from above downwards, aslant, quick; a chop, a lift, a slow wave or a circle turn nothing', () => {
    const ok = smokeStroke(0.9, -1.0, 0.2, 0.25);
    assert.ok(ok && ok.speed > SMOKE.MIN_SPEED);
    assert.ok(Math.abs(Math.hypot(ok.sx, ok.sz) - 1) < 1e-9);
    assert.equal(smokeStroke(0, -1.4, 0, 0.25), null, 'straight down is a chop, not a sweep');
    assert.equal(smokeStroke(0.9, 1.0, 0.2, 0.25), null, 'upwards');
    assert.equal(smokeStroke(1.4, -0.1, 0, 0.25), null, 'level');
    assert.equal(smokeStroke(0.9, -1.0, 0.2, 1.5), null, 'too slow');
    assert.equal(smokeStroke(0.2, -0.3, 0, 0.1), null, 'too short');
    // the smoke is thrown along the stroke's side, strongest near, nothing beyond the reach
    const near = smokeKick(ok, 1, 0, 1), far = smokeKick(ok, SMOKE.R - 1, 0, 1);
    assert.ok(near.vx > far.vx && near.vx > 0, 'the side of the stroke (+x)');
    assert.ok(near.vy < 0, 'driven a little down');
    assert.equal(smokeKick(ok, SMOKE.R + 1, 0, 1), null);
    assert.equal(SMOKE.COST, 3);
    assert.ok(npcSweeps({ smokeNear: true, mana: 10, noWand: false, castCd: 0, busy: false }));
    assert.ok(!npcSweeps({ smokeNear: true, mana: 2, noWand: false, castCd: 0, busy: false }), 'no mana');
    assert.ok(!npcSweeps({ smokeNear: true, mana: 10, noWand: true, castCd: 0, busy: false }) && !npcSweeps({ smokeNear: true, mana: 10, noWand: false, castCd: 0, busy: true }));
    assert.ok(!npcSweeps({ smokeNear: false, mana: 10, noWand: false, castCd: 0, busy: false }));
    const sw = src('src/game/SmokeSwipe.js'), wl = src('src/game/WizardLife.js'), fx = src('src/fx/WizardFx.js');
    assert.match(sw, /SMOKE\.COST/); assert.match(wl, /_smoke\(v, dt\)/); assert.match(fx, /FX\.SWIPE/);
    assert.match(src('src/game/Game.js'), /this\.smokeSwipe\?\.update\(dt\)/);
    assert.ok(!/SmokeSwipe/.test(src('src/game/SpellBook.js')), 'it is a stroke, not a spoken spell: nothing to learn');
});

test('a crowd under the Hellfire does not heap up: the places that are walled off from the fire score higher, every other runner there costs score', () => {
    // a line of rooms 0…6 along x; the fire at x = −10; room 3 and 4 are equally far — but 3 is behind a wall, 4 is open
    const nodes = []; const adj = [];
    for (let i = 0; i < 7; i++) { nodes.push({ id: i, x: i * 12, y: 0, z: 0 }); adj.push([]); }
    for (let i = 0; i < 6; i++) { adj[i].push(i + 1); adj[i + 1].push(i); }
    const T = [{ x: -10, z: 0, r: 6 }];
    const from = 0, p = { x: 0, y: 0, z: 0 };
    const plain = fleeSearch({ nodes, adj }, from, p, T, { maxRun: 120 });
    assert.ok(plain.goal >= 4, 'far from the fire');
    const walled = fleeSearch({ nodes, adj }, from, p, T, { maxRun: 120, bonus: (n, id) => (id === 4 ? 40 : 0) });
    assert.equal(walled.goal, 4, 'the sheltered place wins');
    const loaded = fleeSearch({ nodes, adj }, from, p, T, { maxRun: 120, bonus: (n, id) => (id === 4 ? 40 : 0), load: (id) => (id === 4 ? 5 : 0) });
    assert.notEqual(loaded.goal, 4, 'five others already run there: this one goes elsewhere');
    assert.ok(FLEE.CROWD > 0);
    // five runners one after another take five different places (the load is counted as they choose)
    const taken = new Map(); const goals = [];
    for (let i = 0; i < 5; i++) {
        const r = fleeSearch({ nodes, adj }, from, p, T, { maxRun: 120, load: (id) => taken.get(id) || 0 });
        goals.push(r.goal); taken.set(r.goal, (taken.get(r.goal) || 0) + 1);
    }
    assert.ok(new Set(goals).size >= 3, 'spread over several places, not one heap: ' + goals);
    const cl = src('src/game/CastleLife.js');
    assert.match(cl, /_fleeExtras\(v, T\)/); assert.match(cl, /lineOfSight\(t\.x, n\.y \+ 2\.5, t\.z/);
    assert.match(src('src/game/WizardLife.js'), /fireRun\(v, x, z, R, heat\)/);
    assert.match(src('src/game/Hellfire.js'), /big: true/, 'the Hellfire tells the wizards it is a great fire');
});

test('wiring: a new fight waits the wizard\'s own reaction time and says it in the log; a hunter follows on past the land; fire reaches far wizards', () => {
    const wf = src('src/game/WizardFight.js');
    assert.match(wf, /_engage\(v, fp\)/); assert.match(wf, /reactLagText\(lag\)/); assert.match(wf, /v\.engage\.t > 0/);
    assert.match(wf, /startHunt\(v,/); assert.match(wf, /huntLeash\(/);
    const wl = src('src/game/WizardLife.js');
    assert.match(wl, /reactLag\(rank, seededRng/); assert.match(wl, /knowsFirefighting\(v\.id, rank\)/);
    assert.match(wl, /answerShot\(v, by, from\)/);
    assert.match(src('src/game/CastleLife.js'), /wizards\?\.answerShot\?\./, 'a shot seen: the wizard answers');
    assert.match(src('src/game/Hellfire.js'), /_bodies\?\.\(null, Math\.min\(400/, 'the fire burns the bodies near IT, not only near the hero');
    assert.match(src('src/game/Burning.js'), /onFire\(\{ knows: v\.knowsFire/);
});

test('the duel of beams has no lightning any more (the author); Give Me My Power is known from the start', async () => {
    const { ARC, arcRate } = await import('../../src/game/Duel.js');
    assert.equal(ARC.ON, false); assert.equal(arcRate(5), 0);
    const { START_SPELLS } = await import('../../src/game/SpellBook.js');
    assert.ok(START_SPELLS.has('GiveMyPower'));
});


// ---- the behaviour itself, with a stand-in for the castle (WizardLife's own methods on a plain object)
import { WizardLife } from '../../src/game/WizardLife.js';
import { FX } from '../../src/fx/WizardFx.js';

function stand(over = {}) {
    const said = [], log = [], steps = [];
    const hostile = new Map();
    const L = {
        said, log, steps, hostile,
        alog: { decision: (v, t) => log.push(t) },
        wantedLevel: () => over.level ?? 0,
        _say: (v, t) => said.push(t),
        _playerPos: (id) => (over.player && id === 'me' ? over.player : null),
        _sees: () => !!over.sees,
        _goSpot: (v, x, z) => { steps.push([x, z]); v.x += Math.sign(x - v.x) * 2; v.z += Math.sign(z - v.z) * 2; v.speed = 5; return false; },
        _ground() {},
        _fleeStep: (v, dt) => { v.fleeT -= dt; steps.push('flee'); },
    };
    const wl = Object.create(WizardLife.prototype);
    wl.life = L; wl.game = {};
    const mk = (o = {}) => ({ id: 'c1:7', role: 'teacher', rank: 'teacher', wizard: true, W: { cast: 2 }, mana: 100, maxMana: 200, hp: 10, maxHp: 10, x: 0, y: 0, z: 0, yaw: 0, fx: 0, speed: 0, job: 'wander', cs: { hostile, def: { x: 0, z: 0 } }, reactLag: { t: 1, level: 3, lost: false }, ...o });
    return { wl, L, mk };
}

test('a reaction waits for the wizard\'s wits: the log says how long; he stands lost (turned to the trouble) and only then acts', () => {
    const { wl, L, mk } = stand();
    const v = mk({ reactLag: { t: 3.2, level: 1, lost: true } });
    let did = 0;
    assert.ok(wl.later(v, 'тревога', () => { did++; }, { x: 10, z: 0 }));
    assert.ok(L.log.some((t) => /реакция \(младший\): 3\.20 с/.test(t) && /растерялся/.test(t)), L.log.join('|'));
    assert.ok(!wl.later(v, 'ещё', () => {}), 'one at a time');
    for (let i = 0; i < 30; i++) { v.later.t -= 0.1; wl._lost(v, 0.1); }
    assert.equal(did, 0); assert.equal(v.speed, 0);
    const quick = mk({ reactLag: { t: 0.15, level: 4, lost: false } });
    wl.later(quick, 'тревога', () => { did++; });
    assert.equal(did, 1, 'the Master: at once, no waiting');
});

test('a lone wizard who saw where the shot came from raises the shield and goes there — far from home; a tower\'s timid student does not', () => {
    const { wl, L, mk } = stand({ level: 0 });
    const lone = mk({ role: 'wanderer', reactLag: { t: 0.1, level: 3, lost: false }, job: 'wander' });
    L.wizards = wl;
    const WizardFight = wl.fight = { constructor: { fights: () => true } };
    assert.equal(typeof wl.answerShot, 'function');
    // (WizardFight.fights is static: with a wand and a nerve he fights)
    const from = { x: 120, y: 0, z: 0 };
    assert.ok(wl.answerShot(lone, 'me', from));
    assert.ok(lone.fx & FX.SHIELD, 'the shield is up (Protection, 5 mana)');
    assert.equal(lone.mana, 95);
    assert.ok(lone.hunt, 'and he goes there: a hunt');
    assert.equal(lone.hunt.x, 120);
    assert.ok(L.log.some((t) => /одиночка — отрывается от дома/.test(t)));
    const noWand = mk({ role: 'wanderer', noWand: true });
    assert.equal(wl.answerShot(noWand, 'me', from), false, 'no wand: nothing to answer with');
});

test('the hunt walks to the last known place, looks, checks the likely ways, gives up by time or far from home — and a sighted enemy ends it in a fight', () => {
    const { wl, L, mk } = stand({ level: 2, sees: false });
    const v = mk({ cs: { hostile: new Map(), def: { x: 0, z: 0 } } });
    assert.ok(wl.startHunt(v, { x: 60, z: 0, dx: 4, dz: 0, saw: true }, 2, 'тест'));
    assert.ok(L.log.some((t) => /розыск \(степень 2\)/.test(t)));
    for (let i = 0; i < 60 && v.hunt; i++) assert.ok(wl.hunting(v, 0.5) || !v.hunt);
    assert.ok(L.steps.some((s) => Array.isArray(s) && s[0] === 60), 'went to the last known place');
    // far from home: gives up
    const w = mk({ cs: { hostile: new Map(), def: { x: 0, z: 0 } } });
    wl.startHunt(w, { x: 900, z: 0, dx: 0, dz: 0 }, 0);
    w.x = 600;
    assert.equal(wl.hunting(w, 0.5), false);
    assert.equal(w.hunt, null, 'too far from home for level 0');
    assert.ok(L.log.some((t) => /слишком далеко от дома/.test(t)));
    // he sees the hunted one: a fight, no new reaction lag
    const sight = stand({ level: 3, sees: true, player: { x: 10, y: 0, z: 0 } });
    const u = mk({ cs: { hostile: new Map([['me', Date.now() + 60000]]), def: { x: 0, z: 0 } }, engage: { t: 2 } });
    sight.wl.startHunt(u, { x: 50, z: 0, dx: 0, dz: 0 }, 3);
    assert.equal(sight.wl.hunting(u, 0.5), false);
    assert.equal(u.foe, 'me'); assert.equal(u.engage.t, 0);
});

test('a great fire: the wizard runs for a safe place (shelter), the shield goes up once he is far enough, and he fights on from there', () => {
    const { wl, L, mk } = stand();
    const v = mk();
    wl.fireRun(v, 50, 0, 20, 1);
    assert.ok(v.shelter && v.fleeAt && v.fleeT >= 6);
    assert.ok(v.fleeAt.r >= 20, 'the whole blaze counts');
    assert.ok(L.log.some((t) => /пожар.*безопасное место.*не в кучу/.test(t)));
    const again = v.fleeAt; wl.fireRun(v, 51, 0, 20, 1);
    assert.equal(v.fleeAt, again, 'the same fire: the plan is not thrown away every tick');
    assert.ok(wl.shelterStep(v, 0.1), 'near the fire: running');
    assert.ok(L.steps.includes('flee'));
    v.x = -20; // out of the blaze (r 34), but its heat is still near
    assert.ok(wl.shelterStep(v, 0.1));
    assert.ok(v.fx & FX.SHIELD, 'safe: the shield towards the fire'); assert.equal(v.mana, 95);
    v.foe = 'me';
    assert.equal(wl.shelterStep(v, 0.1), false, 'safe and a foe known: the usual fight goes on from the refuge');
    wl.fireRun(v, 50, 0, 20, 0.01);
    const small = mk(); wl.fireRun(small, 50, 0, 20, 0.01);
    assert.ok(!small.shelter, 'only the heat of a far edge: nothing yet');
});
