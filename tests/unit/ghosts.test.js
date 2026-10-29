// The ghosts of the Castle of Ghosts (src/game/Ghosts.js, the look: src/fx/GhostFx.js, the castle's things: src/fx/GhostProps.js; rules: GhostRules.js).
// A fake game: a hall of blocks with an inner wall (corners to peek out of), a seer standing in it, a castle record with spots and props.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ghosts } from '../../src/game/Ghosts.js';
import { GHOST, GHOST_SPELLS, awayFor, NO_EFFECT_HINT } from '../../src/game/GhostRules.js';
import { invisibleInfo, INVISIBLE_WORLD } from '../../src/game/Invisibles.js';
import { MAX_SHOWN } from '../../src/fx/GhostProps.js';

/** Blocks: the floor (surface y −0.5), a ceiling at 11.5, outer walls at ±40.5, an inner wall x ∈ [9.5, 10.5] for z < 20.5, a narrow passage at z ∈ [−30, −27]. */
function solidAt(x, y, z) {
    if (y < -0.5 || y >= 11.5) return true;
    if (Math.abs(x) > 40.5 || Math.abs(z) > 40.5) return true;
    if (x >= 9.5 && x < 10.5 && z < 20.5) return true;
    if (z >= -30.5 && z < -26.5 && (x < -21.5 || (x >= -18.5 && x < 9.5))) return true; // (a wall with a 3 m doorway at x −21.5…−18.5)
    if (x >= -2.5 && x < -1.5 && z >= 11.5 && z < 12.5) return true; // (a pillar)
    return false;
}

function fakeGame({ hp = 20 } = {}) {
    const boxes = new Map();
    let nid = 0;
    const hints = [];
    const sounds = [];
    const look = new THREE.Vector3(0, 0, 1);
    const g = {
        localId: 'me', config: { mode: 'normal' }, playerHP: hp, maxHP: 20,
        scene: { add() {}, remove() {} },
        terrain: { data: { isSolidAt: solidAt, landMade: () => true } },
        character: { group: { position: new THREE.Vector3(0, 1.5, 0), rotation: { y: 0 } }, slowScale: 1 },
        camera: { getWorldDirection: (o) => o.copy(look), getWorldPosition: (o) => o.set(0, 2.9, 0) },
        combat: { enabled: true, hp, maxHp: 20, dead: false, frozen: false, chill: 0, damage(a) { this.hp -= a; } },
        sight: { sees: true },
        hud: { setVoice: (t) => hints.push(t), setFrozenOverlay() {} },
        sound: { playGhost: (p, id) => sounds.push(id), ghostDrone() {} },
        collision: { addBox: (b) => { boxes.set(++nid, b); return nid; }, removeBox: (id) => boxes.delete(id) },
        fx: { spark() {} },
        beds: {}, flight: {}, imperius: {},
    };
    const spots = [];
    for (let x = 14; x <= 36; x += 4) for (let z = -16; z <= 16; z += 4) spots.push({ x, y: -0.5, z, room: 'east' });
    for (let x = -36; x <= 6; x += 6) for (let z = -24; z <= 36; z += 6) spots.push({ x, y: -0.5, z, room: 'hall' });
    const props = [
        { kind: 'chair', x: 4, y: -0.5, z: 6, a: 0 }, { kind: 'chair', x: -6, y: -0.5, z: 9, a: 1 }, { kind: 'stool', x: 6, y: -0.5, z: -5, a: 0 },
        { kind: 'candle', x: 3, y: -0.5, z: 12, a: 0 }, { kind: 'candelabra', x: -8, y: -0.5, z: 14, a: 0 }, { kind: 'urn', x: 8, y: -0.5, z: 14, a: 0 },
        { kind: 'chair', x: 8.6, y: -0.5, z: 2, a: 0 }, // (against the inner wall)
        { kind: 'chair', x: -20, y: -0.5, z: -28.5, a: 0 }, // (in the doorway)
    ];
    const site = { id: 'test', x: 0, z: 0, shown: true, spots, props, rooms: [], covers: (x, z, m = 0) => Math.abs(x) <= 40 + m && Math.abs(z) <= 40 + m };
    g.ghostCastle = { site, inside: (p) => Math.abs(p.x) <= 40 && Math.abs(p.z) <= 40, sees: true };
    return { g, boxes, hints, sounds, look, site };
}

/** A ghost made visible in front of the hero (for the spells). */
function shown(G, x = 0, z = 12) {
    const o = G.list.find((q) => q.state === 'lurk' && !q.away);
    o.size = 4; o.hover = 1.5; o.floor = -0.5;
    o.pos.set(x, 1, z); o.fade = o.fadeTo = 1; o.state = 'scare'; o.plan = { type: 'behind', hold: 99 };
    G._step(o, 0.001);
    return o;
}

function run(G, sec, dt = 1 / 30, each = null) { for (let t = 0; t < sec; t += dt) { G.update(dt); each?.(); } }

test('the registry: ghosts are of the invisible world', () => {
    assert.equal(invisibleInfo('ghost')?.does, 'ghost');
    assert.equal(INVISIBLE_WORLD.ghosts?.does, 'ghost');
    assert.ok(INVISIBLE_WORLD.ghosts.why.length > 20);
});

test('every spell of GHOST_SPELLS: its verdict and its time away', () => {
    for (const [kind, row] of Object.entries(GHOST_SPELLS)) {
        const { g, hints } = fakeGame();
        const G = new Ghosts(g);
        G.update(0.05);
        const o = shown(G);
        const does = G.hit(o, 5, kind, 'me');
        const want = kind === 'Imperius' ? 'none' : row.does;
        assert.equal(does, want, kind);
        if (want === 'none') {
            assert.ok(!o.away, kind + ': nothing happens');
            assert.equal(o.hp, Infinity);
            assert.ok(hints.includes(NO_EFFECT_HINT), kind + ': the hint');
        } else {
            assert.ok(o.away, kind + ': away');
            assert.equal(o.awayT, awayFor(want, kind.endsWith('Maxima')), kind);
        }
    }
    // the hint at most once in 20 s
    const { g, hints } = fakeGame();
    const G = new Ghosts(g); G.update(0.05);
    const o = shown(G);
    G.hit(o, 1, 'Avada', 'me'); G.hit(o, 1, 'Fire', 'me'); G.hit(o, 1, 'Overgrown', 'me');
    assert.equal(hints.filter((h) => h === NO_EFFECT_HINT).length, 1);
    G.hit(o, 1, 'Avada', 'someone'); // (a friend's spell: the hint is not mine)
    assert.equal(hints.length, 1);
    // gods' spells scatter; Imperius Maxima (a gods' spell) still never takes a ghost
    assert.equal(G.hit(o, 1, 'ImperiusMaxima', 'me'), 'none');
    assert.equal(G.hit(o, 1, 'Boom', 'me'), 'scatter');
    assert.equal(o.awayT, GHOST.DIVINE);
});

test('blow / exorcise / scare: who is caught and for how long; the strongest verdict wins', () => {
    const { g } = fakeGame();
    const G = new Ghosts(g); G.update(0.05);
    const a = shown(G, 0, 12), b = shown(G, 8, -12);
    const org = new THREE.Vector3(0, 2.9, 0), fwd = new THREE.Vector3(0, 0, 1);
    assert.equal(G.blow(org, fwd, 1, 'me', false), 1);
    assert.ok(a.away && !b.away);
    assert.equal(a.awayT, GHOST.BLOWN);
    assert.ok(a.vel.z > 10, 'flies off along the gust');
    assert.ok(G.blow(org, new THREE.Vector3(0, 1, 0), 3, 'me', true) >= 1, 'the ring (straight up) catches the one behind');
    assert.equal(b.awayT, GHOST.BLOWN * 2.2);
    // exorcise beats blown, the time never shrinks after
    const c = shown(G, -3, 14);
    assert.ok(G.exorcise({ o: org, d: fwd, range: 28, by: 'me' }) >= 1, 'the cone');
    assert.equal(c.awayT, GHOST.EXORCISE);
    G.scare(c.model.position, 5, true);
    assert.equal(c.awayWhy, 'exorcise');
    assert.equal(c.awayT, GHOST.EXORCISE);
    // it dissolves (the look), then is gone
    run(G, 3);
    assert.equal(c.diss, 1);
    assert.equal(c.fade, 0);
    assert.ok(c.away);
    // scared: a while
    const { g: g2 } = fakeGame();
    const H = new Ghosts(g2); H.update(0.05);
    const d = shown(H, 0, 10);
    assert.equal(H.scare(new THREE.Vector3(0, 2, 8), 6, false), 1);
    assert.equal(d.awayT, awayFor('scared'));
    run(H, awayFor('scared') + 1);
    assert.ok(!d.away, 'back after its time');
});

test('the exorcised stay out though the castle goes and comes again', () => {
    const { g } = fakeGame();
    const G = new Ghosts(g); G.update(0.05);
    shown(G, 0, 12);
    G.exorcise({ o: new THREE.Vector3(0, 2.9, 0), d: new THREE.Vector3(0, 0, 1), range: 28 });
    g.ghostCastle.site = null;
    run(G, 3);
    assert.equal(G.list.length, 0);
    g.ghostCastle.site = { ...g.ghostCastle.site, id: 'test' };
    const { site } = fakeGame(); g.ghostCastle.site = site;
    G.update(0.05);
    const away = G.list.filter((o) => o.away && o.awayWhy === 'exorcise');
    assert.equal(away.length, 1);
    assert.ok(away[0].awayT > GHOST.EXORCISE - 10);
});

test('ghosts never come nearer than AFRAID by themselves; never more than MAX; scares of every kind happen', () => {
    const { g, sounds } = fakeGame();
    const G = new Ghosts(g);
    let r = 12345;
    G.rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const seen = new Set();
    let minD = Infinity, maxN = 0;
    for (let k = 0; k < 4000; k++) {
        if (k % 20 === 0) G._scareT = 0; // (a scare every 0.66 s: far more than in play)
        G.update(1 / 30);
        for (const e of G.log) if (e.ev === 'scare') seen.add(e.id);
        maxN = Math.max(maxN, G.list.length);
        const me = g.character.group.position;
        for (const o of G.list) {
            if (o.fade <= 0.02 || o.plan?.type === 'through' || o.state === 'banished' || o.state === 'recoil') continue;
            minD = Math.min(minD, Math.hypot(o.pos.x - me.x, o.pos.z - me.z));
            assert.ok(!solidAt(o.pos.x, o.pos.y + 1, o.pos.z), 'never in a wall');
        }
        // the hero turns slowly round
        const a = k * 0.004; g.camera.getWorldDirection = (out) => out.set(Math.sin(a), 0, Math.cos(a));
    }
    assert.ok(minD >= GHOST.AFRAID - 0.05, 'nearest ' + minD);
    assert.ok(maxN <= GHOST.MAX && maxN >= GHOST.MIN, 'ghosts ' + maxN);
    for (const id of ['peek', 'cross', 'behind', 'sound']) assert.ok(seen.has(id), 'scare ' + id + ' ' + [...seen]);
    assert.ok(sounds.length > 20, 'sounds');
});

test('a ghost the hero walks at or stares at recoils and melts', () => {
    const { g, look } = fakeGame();
    const G = new Ghosts(g); G.update(0.05);
    const o = shown(G, 0, 12);
    o.plan = { type: 'behind', hold: 99 };
    look.set(0, 0, 1);
    g.camera.getWorldDirection = (out) => out.set(0, 0.06, 1).normalize();
    run(G, 0.8);
    assert.equal(o.state === 'recoil' || o.state === 'lurk', true, 'stared at: gone (' + o.state + ')');
    const p = shown(G, 0, -12);
    p.plan = { type: 'behind', hold: 99 };
    g.camera.getWorldDirection = (out) => out.set(1, 0, 0);
    g.character.group.position.set(0, 1.5, -9); // (walks up to it)
    G.update(1 / 30);
    assert.ok(p.state === 'recoil' || p.state === 'lurk');
});

test('flying through: only −1 HP, the chill, never at low health, never twice within the gap, never when dead / asleep / in a duel', () => {
    const mk = (hp = 20) => {
        const F = fakeGame({ hp });
        const G = new Ghosts(F.g); G.rnd = () => 0.01; G.update(0.05);
        G._lastThrough = -1e9;
        return { ...F, G };
    };
    // a good case
    {
        const { g, G } = mk();
        assert.ok(G.canHarm());
        assert.ok(G.run('through'), 'it starts');
        const hp0 = g.combat.hp;
        let slowSeen = 1;
        run(G, 4, 1 / 30, () => { slowSeen = Math.min(slowSeen, g.character.slowScale); });
        assert.equal(hp0 - g.combat.hp, GHOST.THROUGH_DMG);
        assert.ok(Math.abs(slowSeen - GHOST.CHILL_SLOW) < 1e-9, 'slowed while chilled');
        assert.ok(G.log.some((e) => e.ev === 'through'));
        run(G, GHOST.CHILL + 0.5);
        assert.equal(G.chill, 0);
        assert.equal(g.character.slowScale, 1, 'the legs are given back');
        // twice within the gap: no — it only crosses ahead
        const n = G.log.filter((e) => e.ev === 'through').length;
        G.run('through');
        run(G, 5);
        assert.equal(G.log.filter((e) => e.ev === 'through').length, n);
        assert.equal(g.combat.hp, hp0 - 1);
    }
    // low health
    { const { G } = mk(GHOST.THROUGH_MIN_HP); assert.equal(G.canHarm(), false); assert.equal(G._mayThrough(), false); }
    { const { G } = mk(5); assert.equal(G.canHarm(), false, '5 of 20 is under 30 %'); }
    // dead, asleep, a duel, the arena, Imperius, flight, frozen, space
    for (const set of [(g) => { g.combat.dead = true; }, (g) => { g.beds.lying = 'b1'; }, (g) => { g._inDuel = () => true; }, (g) => { g.arenaDuels = { mode: 'duel' }; },
        (g) => { g.imperius.busy = true; }, (g) => { g.flight.busy = true; }, (g) => { g.combat.frozen = true; }, (g) => { g.space = { offEarth: true }; }]) {
        const { g, G } = mk();
        set(g);
        assert.equal(G.canHarm(), false);
    }
    // the hp falls under the line while it flies: spared
    {
        const { g, G } = mk();
        assert.ok(G.run('through'));
        g.combat.hp = 3;
        run(G, 4);
        assert.equal(g.combat.hp, 3);
        assert.ok(G.log.some((e) => e.ev === 'through-spared'));
    }
});

test('put away: sight lost (at once), the hero walks out / sleeps (melts), death; the drone stops', () => {
    const drone = [];
    const { g, boxes } = fakeGame();
    g.sound.ghostDrone = (k) => drone.push(k);
    const G = new Ghosts(g); G.update(0.05);
    run(G, 3);
    assert.ok(G.list.length >= GHOST.MIN);
    assert.ok(boxes.size > 0, 'the near things have their boxes');
    assert.ok(drone.at(-1) > 0, 'the hum inside');
    shown(G, 0, 12);
    g.sight.sees = false;
    G.update(1 / 30);
    assert.equal(G.list.length, 0, 'at once');
    assert.equal(G.fx.mesh.visible, false);
    assert.equal(boxes.size, 0, 'no boxes left');
    assert.equal(drone.at(-1), 0);
    g.sight.sees = true;
    run(G, 1);
    assert.ok(G.list.length > 0);
    shown(G, 0, 12);
    g.character.group.position.set(300, 1.5, 300); // (walks far out: not near)
    G.update(1 / 30);
    assert.ok(G.list.length > 0, 'melting, not gone at once');
    run(G, GHOST.FADE_OUT + 0.5);
    assert.equal(G.list.length, 0);
    g.character.group.position.set(0, 1.5, 0);
    run(G, 1);
    g.beds.lying = 'b';
    run(G, GHOST.FADE_OUT + 0.5);
    assert.equal(G.list.length, 0, 'asleep: none');
    g.beds.lying = null;
    run(G, 1);
    g.isDeadLocal = true;
    G.update(1 / 30);
    assert.equal(G.list.length, 0, 'dead: none');
});

test('nothing piles up: 1000 frames of scares and spells, the castle coming and going', () => {
    const { g, boxes } = fakeGame();
    const G = new Ghosts(g);
    const org = new THREE.Vector3(0, 2.9, 0), fwd = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < 1000; k++) {
        if (k % 15 === 0) G._scareT = 0;
        if (k % 97 === 0) G.blow(org, fwd, 1, 'me', k % 2 === 0);
        if (k % 233 === 0) G.exorcise({ o: org, d: fwd });
        if (k % 151 === 0) G.scare(org, 10);
        if (k % 300 === 150) { g.sight.sees = false; }
        if (k % 300 === 170) { g.sight.sees = true; }
        G.update(1 / 30);
        assert.ok(G.list.length <= GHOST.MAX);
        assert.ok(G.fx.mesh.count <= GHOST.MAX + 2);
        assert.ok(G.props.recs.length <= MAX_SHOWN);
    }
    assert.ok(G.log.length <= 80);
    assert.ok(G._exiles.length <= GHOST.MAX);
    assert.ok(boxes.size <= 20, 'boxes only for the near things: ' + boxes.size);
    assert.equal(boxes.size, G.props.boxCount);
    g.ghostCastle.site = null;
    run(G, 3);
    assert.equal(G.list.length, 0);
    assert.equal(boxes.size, 0);
    assert.equal(G.props.recs.length, 0);
});

test('the poltergeist: a thing never moves into a block, a doorway, onto the hero or another thing', () => {
    const { g } = fakeGame();
    const G = new Ghosts(g); G.update(0.05);
    const P = G.props;
    const me = g.character.group.position;
    let r = 777;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    let moves = 0;
    for (let k = 0; k < 300; k++) {
        const t = P.poltergeist(me, new THREE.Vector3(0, 0, 1), rnd);
        if (t && t.what !== 'out') moves++;
        P.update(1, me, k); // (every trick finishes)
        for (const q of P.recs) if (q.st.out > 0) q.st.out = 0; // (candles lit again)
    }
    assert.ok(moves > 20, 'moves ' + moves);
    for (const q of P.recs) {
        const x = q.base.x + q.st.dx, z = q.base.z + q.st.dz;
        if (q.st.dx || q.st.dz) assert.ok(P.freeAt(q.base.kind, x, q.base.y, z, q), q.base.kind + ' at ' + x + ',' + z);
        for (const h of [0.3, 1.2]) assert.ok(!solidAt(x, q.base.y + h, z), 'in a block');
        if (q.base.z < -27 && q.base.z > -30) assert.ok(!q.st.dx && !q.st.dz, 'the doorway chair never moves');
    }
    assert.equal(P.freeAt('chair', 9.2, -0.5, 2), false, 'into the wall');
    assert.equal(P.freeAt('chair', -20, -0.5, -28.5), false, 'a doorway');
    assert.equal(P.freeAt('chair', me.x + 0.5, -0.5, me.z), false, 'onto the hero');
    assert.equal(P.freeAt('chair', 4, -0.5, 25), true, 'open floor');
});
