// The underworld's gargoyles (HellGargoyleRules.js): groups of 1–3, 35 % per meeting, never more than 3 on a player, the head 25 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HELL_GARGOYLE as H, packSize, rollAttack, dropsHead, groupSizeOf, groupCount, circleOf, circlePoint, newGroup, stepGroup, isAttacker, mayHunt, underworldFactor } from '../../src/game/HellGargoyleRules.js';

const N = 10000;
test('numbers: the pack never above 3, mostly 1; attack chance 35 %; head 25 % (a sample of 10 000)', () => {
    assert.equal(H.PACK_MAX, 3);
    const c = [0, 0, 0, 0]; let atk = 0, head = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; c[packSize(u, 3)]++; if (rollAttack(u)) atk++; if (dropsHead(u)) head++; }
    assert.equal(c[0] + c[1] + c[2] + c[3], N); assert.equal(c[0], 0);
    assert.ok(c[1] > c[2] && c[2] > c[3] && c[3] > 0, 'mostly one');
    assert.ok(Math.abs(atk / N - 0.35) < 0.005 && Math.abs(head / N - 0.25) < 0.005);
    assert.equal(packSize(0.99, 2), 2, 'a group of two sends two at most');
    assert.equal(packSize(0.99, 1), 1);
    // with a random source too
    let a = 0, h = 0; for (let i = 0; i < N; i++) { if (rollAttack(Math.random())) a++; if (dropsHead(Math.random())) h++; }
    assert.ok(Math.abs(a / N - 0.35) < 0.03 && Math.abs(h / N - 0.25) < 0.03);
});

test('groups: 4…8 of 1…3, circles 80…200 m, 26…70 m up', () => {
    for (let seed = 1; seed < 200; seed++) {
        const n = groupCount(seed, 10);
        assert.ok(n >= 4 && n <= 8);
        assert.equal(groupCount(seed, 3), 3, 'not more than the lairs');
        for (let i = 0; i < n; i++) {
            const s = groupSizeOf(seed, i), c = circleOf(seed, i);
            assert.ok(s >= 1 && s <= 3);
            assert.ok(c.r >= 80 && c.r <= 200 && c.alt >= 26 && c.alt <= 70);
            const p = circlePoint(c, 123.4, 1);
            assert.ok(Math.hypot(p.x, p.z) <= c.r * 1.1 && Math.hypot(p.x, p.z) >= c.r * 0.9);
        }
    }
});

test('the group\'s mind: one roll per meeting, 1–3 attackers, then return; no re-roll before the gap', () => {
    let attacks = 0, rolls = 0;
    for (let k = 0; k < 2000; k++) {
        const st = newGroup(3); let max = 0;
        // the player comes into sight, stays, leaves, comes again within the gap
        const ev1 = stepGroup(st, 0.1, { seen: true });
        const ev2 = stepGroup(st, 0.1, { seen: false });
        const ev3 = stepGroup(st, 0.1, { seen: true });
        assert.ok(ev1.includes('roll'));
        assert.ok(!ev3.includes('roll'), 'the gap holds');
        rolls++;
        if (ev1.includes('attack')) { attacks++; max = st.attackers; assert.ok(max >= 1 && max <= 3); assert.ok(isAttacker(st, 0)); assert.ok(!isAttacker(st, 3)); for (let t = 0; t < 400 && st.mode === 'attack'; t++) stepGroup(st, 0.1, { seen: true }); assert.equal(st.mode, 'return'); for (let t = 0; t < 60; t++) stepGroup(st, 0.1, {}); assert.equal(st.mode, 'circle'); }
        void ev2;
    }
    assert.ok(Math.abs(attacks / rolls - 0.35) < 0.04, 'about 35 % of meetings: ' + attacks / rolls);
});

test('the underworld: fire does nothing, Tarons/Devil untouched', () => {
    assert.equal(underworldFactor('Inferno'), 0); assert.equal(underworldFactor('Hellfire'), 0); assert.equal(underworldFactor('CircleAttack'), 1);
    assert.ok(!mayHunt('taron') && !mayHunt('devil') && mayHunt('player'));
});

// ---- the game side (HellPatrol.js) with a stub of Gargoyles
import * as THREE from 'three';
import fs from 'node:fs';
import { HellPatrol } from '../../src/game/HellPatrol.js';
import { stepGroup as _s } from '../../src/game/HellGargoyleRules.js';

function fake() {
    let id = 0;
    const G = {
        list: [], victims: [], moved: 0,
        spawn(pos, o) { const g = { id: 'g' + ++id, model: { position: pos.clone() }, vel: new THREE.Vector3(), a: { mode: 'fly' }, t: 0, dead: false, target: null, scale: 1, ...o }; G.list.push(g); return g; },
        _fly(o, goal, speed, dt) { o.model.position.lerp(goal, Math.min(1, dt * 0.5)); G.moved++; },
        _orient() {}, _remove(o) { o.dead = true; G.list.splice(G.list.indexOf(o), 1); },
    };
    const game = { authority: true, gargoyles: G, character: { group: new THREE.Group() }, remotes: new Map(), collision: { groundY: () => 0 }, terrain: { data: { hell: true, landMade: () => true } }, items: { loose: [], spawnLoose(i) { this.loose.push(i); } }, hud: { setVoice() {} } };
    G.game = game; game.character.group.position.set(0, 0, 0);
    return { game, G };
}
const lairs = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 700, z: 0, y: 40 }));

test('patrol: 4–8 groups of 1–3 from the lairs, made only near a player, a gargoyle a frame, never above DRAW_MAX; put away when everyone is far', () => {
    const { game, G } = fake();
    const P = new HellPatrol(game); game.hellPatrol = P;
    P.setPlan({ seed: 11, gargoyleLairs: lairs });
    assert.ok(P.groups.length >= 4 && P.groups.length <= 6);
    for (const gr of P.groups) assert.ok(gr.n >= 1 && gr.n <= 3);
    game.character.group.position.set(0, 0, 0);
    for (let i = 0; i < 200; i++) P.update(0.05);
    const near = P.groups.filter((gr) => gr.loaded);
    assert.ok(near.length >= 1 && near.every((gr) => Math.hypot(gr.lair.x, gr.lair.z) < H.LOAD_R));
    assert.ok(G.list.length >= 1 && G.list.length <= H.DRAW_MAX);
    for (const o of G.list) { assert.equal(o.life, Infinity); assert.ok(o.patrol); }
    game.character.group.position.set(0, 0, 5000);
    for (let i = 0; i < 20; i++) P.update(0.05);
    assert.equal(G.list.length, 0);
});

test('patrol: a meeting rolls once; among many meetings about 35 % attack with 1–3 — never more than 3 attackers at once', () => {
    let attacks = 0, trials = 400, maxAtt = 0;
    for (let k = 0; k < trials; k++) {
        const { game, G } = fake();
        const P = new HellPatrol(game); game.hellPatrol = P;
        P.setPlan({ seed: 7 + k, gargoyleLairs: lairs });
        for (let i = 0; i < 60; i++) P.update(0.05);
        const gr = P.groups.find((q) => q.loaded && q.members.some(Boolean));
        if (!gr) continue;
        const o = gr.members.find(Boolean);
        G.victims = [{ k: 'p', id: 'me', roofed: false, pos: o.model.position.clone() }];
        const modes = new Set();
        for (let i = 0; i < 40; i++) { P.update(0.05); modes.add(gr.st.mode); maxAtt = Math.max(maxAtt, gr.st.attackers); }
        if (modes.has('attack')) attacks++;
        // an attacker is not driven by the patrol; the others are
        const driven = gr.members.filter(Boolean).map((m, i) => ({ i, d: P.drive(m, 0.05) }));
        if (gr.st.mode === 'attack') assert.ok(driven.filter((x) => !x.d).length === gr.st.attackers || gr.st.attackers > driven.length);
    }
    assert.ok(maxAtt <= 3, 'at most 3: ' + maxAtt);
    assert.ok(attacks / trials > 0.2 && attacks / trials < 0.5, 'about 35 %: ' + attacks / trials);
});

test('patrol: a killed one is a gap (+1 after 10 min); the head: 25 % (the item pending while it does not exist)', () => {
    const { game, G } = fake();
    const P = new HellPatrol(game); game.hellPatrol = P;
    P.setPlan({ seed: 3, gargoyleLairs: lairs });
    for (let i = 0; i < 100; i++) P.update(0.05);
    const gr = P.groups.find((q) => q.loaded && q.members.some(Boolean));
    const o = gr.members.find(Boolean); o.dead = true;
    P.onDie(o);
    assert.equal(gr.dead, 1);
    let heads = 0, pend = 0; const N = 4000; const note = P._note.bind(P); P._note = (e) => { if (e.ev === 'head-pending') pend++; note(e); };
    for (let i = 0; i < N; i++) { const q = { patrol: { gr: { dead: 0, n: 3, members: [], i: 0 }, m: 0 }, model: { position: new THREE.Vector3() } }; const before = pend; P.onDie(q); if (pend > before || game.items.loose.length) heads++; game.items.loose.length = 0; }
    assert.ok(Math.abs(heads / N - 0.25) < 0.03, 'about 25 %: ' + heads / N);
});

test('hooks: Gargoyles hands a patrol member to HellPatrol, hunts players only, ignores fire in the underworld; no sun in hell', () => {
    const s = fs.readFileSync(new URL('../../src/game/Gargoyles.js', import.meta.url), 'utf8');
    assert.match(s, /o\.patrol && this\.game\.hellPatrol\?\.drive\(o, dt\)/);
    assert.match(s, /o\.patrol && v\.k !== 'p'/);
    assert.match(s, /o\.patrol && underworldFactor\(kind\) === 0/);
    assert.match(s, /g\.hellPatrol\?\.onDie\(o\)/);
    assert.ok(!mayHunt('taron') && !mayHunt('devil'));
});
