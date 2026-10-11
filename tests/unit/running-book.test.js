import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RunningBook, RUNNER, runSpeed, staminaStep, hideSpot, hidden, palmOnBook, closing, runningBookModel, BODY } from '../../src/game/RunningBook.js';

/** A small world: flat ground at 0, me at the origin, one running book (an Animals-like list). */
function world({ authority = true } = {}) {
    const sent = [], toasts = [], removed = [];
    const me = new THREE.Group();
    const palm = new THREE.Vector3(0, 1, -2);
    const curl = { left: 0, right: 0 };
    const book = { id: 5, type: 'runbook', dead: false, group: new THREE.Group(), model: runningBookModel(0x8e2b2b), target: new THREE.Vector3(), walkT: 0, stateT: 0, damageCooldown: 0 };
    book.model = book.group = runningBookModel(0x8e2b2b);
    book.group.position.set(6, 0, 0);
    const list = [book];
    const byId = new Map([[5, book]]);
    const g = {
        localId: 'me', authority, bonus: null, isDeadLocal: false, currentPose: {},
        remotes: new Map(), combat: { dead: false },
        character: {
            group: me, runBonus: 1,
            getGripCurl: (s) => curl[s],
            getHandWorldPosition: (s, out) => out.copy(palm),
        },
        weapons: { hands: { left: {}, right: {} } }, items: { held: {} },
        hud: { toast: (t) => toasts.push(t) },
        collision: { groundY: () => 0 },
        world: { trees: [] },
        animals: {
            enabled: true, list, byId,
            _remove: (a) => { removed.push(a.id); list.splice(list.indexOf(a), 1); byId.delete(a.id); },
            _body: () => {},
            push: (a, v, stun) => { a.vel = (a.vel || new THREE.Vector3()).add(v); a.stunT = stun; },
        },
        sync: { net: { isHost: authority, send: (m) => sent.push(m) } },
    };
    const rb = new RunningBook(g);
    return { g, rb, book, palm, curl, sent, toasts, removed };
}

test('running book: fresh it outruns a player, tired it is slow; stamina drains running and comes back resting', () => {
    assert.ok(runSpeed(1) > 7.5 && runSpeed(1) === RUNNER.RUN, 'fresh: faster than a running player');
    assert.ok(runSpeed(0) < 5, 'tired: easy to reach');
    let s = 1;
    for (let i = 0; i < 72; i++) s = staminaStep(s, 0.1, 1);
    assert.equal(s, 0, `${RUNNER.TIRE} s of full running empties it`);
    for (let i = 0; i < 25; i++) s = staminaStep(s, 0.1, 0);
    assert.ok(s > 0.45 && s < 0.55, 'half back after 2.5 s rest');
});

test('running book: hides behind an obstacle away from the person, not towards them', () => {
    const book = { x: 0, z: 0 }, person = { x: -10, z: 0 };
    const spot = hideSpot(book, person, [{ x: -4, z: 0, r: 0.8 }, { x: 4, z: 1, r: 0.8 }]);
    assert.ok(spot, 'a place found');
    assert.equal(spot.from.x, 4, 'the tree on the far side (not the one between it and the person)');
    assert.ok(spot.x > 4, 'behind the tree as seen from the person');
    assert.ok(hidden({ x: spot.x, z: spot.z }, person, spot.from), 'out of sight there');
    assert.equal(hideSpot(book, person, [{ x: -14, z: 0, r: 0.8 }]), null, 'only a tree behind the person: no hiding there');
});

test('running book: only a hand that closes right on its body catches it', () => {
    const pos = new THREE.Vector3(0, 0, 0), s = RUNNER.SIZE;
    const mid = new THREE.Vector3(0, (BODY.y0 + BODY.h / 2) * s, 0);
    assert.ok(palmOnBook(mid, pos, 0), 'the palm on its middle');
    assert.ok(palmOnBook(mid.clone().add(new THREE.Vector3(0, 0, -0.3)), pos, 0), 'on its face (a hand thickness away)');
    assert.ok(!palmOnBook(mid.clone().add(new THREE.Vector3(0, 0, -1.2)), pos, 0), 'a metre in front: no');
    assert.ok(!palmOnBook(new THREE.Vector3(0, 3.2, 0), pos, 0), 'above its head: no');
    // turned 90°: its thin side faces −Z
    assert.ok(palmOnBook(mid.clone().add(new THREE.Vector3(0, 0, 0.5)), pos, Math.PI / 2), 'turned: along its width');
    assert.ok(closing(0.9, 1000, 1500), 'open half a second ago, now a fist');
    assert.ok(!closing(0.9, 0, 3000), 'a fist made long ago does not catch (bumping into it is no catch)');
    assert.ok(!closing(0.3, 1000, 1100), 'open fingers do not catch');
});

test('running book: caught by a closing hand — +30% run speed, once; the second gives nothing; death takes it', () => {
    const { g, rb, book, palm, curl, toasts, removed } = world();
    palm.set(6, (BODY.y0 + BODY.h / 2) * RUNNER.SIZE, 0); // on its body
    curl.right = 0; rb.update(0.016); // open
    assert.equal(g.character.runBonus, 1);
    curl.right = 0.9; rb.update(0.016); // closes on it
    assert.deepEqual(removed, [5], 'the book vanished');
    assert.equal(g.bonus.run, 0.3);
    assert.ok(Math.abs(g.character.runBonus - 1.3) < 1e-9, 'run ×1.3');
    assert.ok(toasts.some((t) => t.includes('30%')));
    // a second book: nothing more
    const b2 = { ...book, id: 6, group: runningBookModel(1), dead: false };
    b2.model = b2.group;
    b2.group.position.set(6, 0, 0);
    g.animals.list.push(b2); g.animals.byId.set(6, b2);
    curl.right = 0; rb.update(0.016); curl.right = 0.9; rb.update(0.016);
    assert.equal(g.animals.byId.has(6), true, 'it wriggled out (still there)');
    assert.ok(b2.vel && b2.vel.length() > 1, 'pushed away from the hand');
    assert.ok(Math.abs(g.character.runBonus - 1.3) < 1e-9, 'still ×1.3, not more');
    assert.ok(toasts.some((t) => t.includes('уже')), 'told: only once');
    // the save keeps it (game.bonus goes into the player snapshot)
    assert.deepEqual(g.bonus, { run: 0.3 });
    rb.onDeath();
    rb.update(0.016);
    assert.equal(g.bonus, null, 'death: gone');
    assert.equal(g.character.runBonus, 1);
});

test('running book: other bonuses stay after death; a guest asks the host, the host gives the bonus to the catcher', () => {
    const { g, rb } = world();
    g.bonus = { hp: 5, run: 0.3 };
    rb.onDeath();
    assert.deepEqual(g.bonus, { hp: 5 }, 'only the run bonus is lost');
    // guest
    const G = world({ authority: false });
    G.palm.set(6, 1.1, 0);
    G.curl.left = 0; G.rb.update(0.016); G.curl.left = 0.9; G.rb.update(0.016);
    assert.deepEqual(G.sent.map((m) => m.t), ['rbcatch'], 'the guest asks the host');
    assert.equal(G.g.bonus, null, 'not before the host says so');
    G.rb.onNet({ t: 'rbgot', to: 'me', id: 5 });
    assert.equal(G.g.bonus.run, 0.3, 'the host gave it');
    G.rb.onNet({ t: 'rbgot', to: 'someone', id: 5 });
    // host: a guest caught it
    const H = world();
    H.rb.onNet({ t: 'rbcatch', id: 5, from: 'friend' });
    assert.deepEqual(H.removed, [5]);
    assert.equal(H.g.bonus, null, 'the host gets nothing');
    assert.deepEqual(H.sent.at(-1), { t: 'rbgot', to: 'friend', id: 5 });
});

test('running book: runs from a person, dodges aside when a hand is near, calms down far away', () => {
    const { g, rb, book } = world();
    const p = book.group.position;
    p.set(8, 0, 0);
    for (let i = 0; i < 30; i++) rb.think(book, 0.05);
    assert.ok(p.x > 11, `it ran away (${p.x.toFixed(1)})`);
    assert.ok(book.rb.stamina < 1, 'and got a bit tired');
    // a person right next to it: a jump aside
    p.set(2.5, 0, 0);
    book.rb.dodgeT = 0; book.rb.dodge = null;
    rb.think(book, 0.05);
    assert.ok(book.rb.dodge, 'dodges');
    // far away: calm, looking around
    p.set(40, 0, 0);
    book.rb.dodge = null;
    rb.think(book, 0.05);
    assert.equal(book.rb.mode, 'look');
    // «Акцио»: pulled towards the caster
    rb.accio(book, new THREE.Vector3(0, 1.5, 0));
    assert.ok(book.vel.x < -5 && book.stunT > 1, 'flies to the caster, dazed');
    void g;
});

test('running book: caught, it is a real book in the hand (one page); its quickness comes only when that page is read', () => {
    const { g, rb, palm, curl } = world();
    const held = {};
    g.items = { held, takeIntoHand(item, side) { held[side] = { item }; return true; } };
    palm.set(6, (BODY.y0 + BODY.h / 2) * RUNNER.SIZE, 0);
    curl.right = 0; rb.update(0.016); curl.right = 0.9; rb.update(0.016);
    assert.ok(held.right?.item.runbook && held.right.item.kind === 'book', 'the book is in the hand that caught it');
    assert.ok(!g.bonus?.run, 'not quick yet: the page is not read');
    rb.bless();
    assert.equal(g.bonus.run, 0.3, 'read: its quickness');
});
