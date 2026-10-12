// «Защита дома» (HouseWards.js): «Protection House» + «Максима» ×N + «стоп», who may come in,
// «Protection Invisible» seen only near, «Protection House Grant», and the book of protection
// (BookBirds.js) that only fire or an ice ball brings down.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HouseWards, WARD, WARD_SPELLS, wardCost, wardRadius, maximaFor, mayPass, crossInto, bodyPush, seenK, houseBounds, keepIn } from '../../src/game/HouseWards.js';
import { BookBirds, bookSpells, isWardId, isSwiftId, WARD_ID, SWIFT_ID, rollBirdId, wardBookFalls } from '../../src/game/BookBirds.js';
import { refusal } from '../../src/game/Hints.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';

test('the three spells are heard as whole phrases — and the plain shield stays the plain shield', () => {
    for (const w of ['Protection House', 'протекшн хаус', 'протекшен хаус', 'протекшн хауз']) assert.equal(matchSpell(w), 'ProtectionHouse', w);
    for (const w of ['Protection House Grant', 'протекшн хаус грант', 'протекшен хаус гранд']) assert.equal(matchSpell(w), 'ProtectionHouseGrant', w);
    for (const w of ['Protection Invisible', 'протекшн инвизибл', 'протекшен инвизибал']) assert.equal(matchSpell(w), 'ProtectionInvisible', w);
    assert.equal(matchSpell('протекшн'), 'Protection');
    assert.equal(matchSpell('протекшн максима'), 'ProtectionMaxima');
    assert.equal(matchSpell('мой хаус'), null, '«house» alone casts nothing');
    assert.equal(matchSpell('максима'), 'Maxima');
});

test('costs: 20 for the sphere, 5 for each «Максима»; it grows 1.5 m a «Максима» from 2.5 m', () => {
    assert.equal(SPELL_COST.ProtectionHouse, 20);
    assert.equal(SPELL_COST.WardGrow, 5);
    assert.equal(SPELL_COST.ProtectionInvisible, 15);
    assert.equal(SPELL_COST.ProtectionHouseGrant, 5);
    assert.equal(wardCost(0), 20);
    assert.equal(wardCost(4), 40);
    assert.equal(wardRadius(0), 2.5);
    assert.equal(wardRadius(3), 7);
    assert.equal(wardRadius(1000), WARD.MAX_R);
    assert.equal(maximaFor(7), 3);
    assert.equal(maximaFor(2), 0);
});

test('geometry: going in from outside is caught, coming out is free; a body is pushed back to the surface', () => {
    const w = { c: { x: 0, y: 2, z: 0 }, r: 5, owner: 'me', grant: ['friend'] };
    const s = crossInto(w, { x: -10, y: 2, z: 0 }, { x: 0, y: 2, z: 0 });
    assert.ok(Math.abs(s - 0.5) < 1e-6, 'enters at the surface');
    assert.equal(crossInto(w, { x: 0, y: 2, z: 0 }, { x: -10, y: 2, z: 0 }), -1, 'from inside out: free');
    assert.equal(crossInto(w, { x: -10, y: 2, z: 9 }, { x: 10, y: 2, z: 9 }), -1, 'passing by');
    assert.ok(Math.abs(crossInto(w, { x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }) - 0.25) < 1e-6, 'right through it: stopped where it touches');
    assert.equal(crossInto(w, { x: -20, y: 2, z: 0 }, { x: -10, y: 2, z: 0 }), -1, 'not there yet');
    const p = bodyPush(w, 4, 0, 3.5, 0, 0.5);
    assert.ok(p && Math.abs(p.x - 1.5) < 1e-6 && Math.abs(p.z) < 1e-9, 'pushed out along x to the surface');
    assert.equal(bodyPush(w, 6, 0, 3.5, 0, 0.5), null);
    assert.ok(mayPass(w, 'me') && mayPass(w, 'friend') && !mayPass(w, 'stranger') && !mayPass(w, ''));
});

test('invisible: from farther than ~6 m only the land is seen, from 3–4 m the house is all there', () => {
    const w = { c: { x: 0, y: 2, z: 0 }, r: 5, inv: true };
    const at = (d) => seenK(w, { x: 5 + d, y: 2, z: 0 });
    assert.equal(at(0), 1);
    assert.equal(at(3), 1);
    assert.equal(at(WARD.SEE_FAR + 0.1), 0);
    assert.equal(at(20), 0);
    const mid = at(5);
    assert.ok(mid > 0 && mid < 1, 'it shows little by little');
    assert.ok(at(4) > at(5) && at(5) > at(6), 'more the closer');
    assert.equal(seenK({ ...w, inv: false }, { x: 100, y: 0, z: 0 }), 1, 'not hidden: seen from anywhere');
    assert.ok(WARD.SEE_NEAR >= 3 && WARD.SEE_NEAR <= 4);
});

test('a house: its blocks give the centre and the radius that takes it in', () => {
    const cells = [];
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) for (let L = 1; L <= 3; L++) cells.push([x, L, z]);
    const h = houseBounds(cells);
    assert.deepEqual(h.c, { x: 2, y: 1, z: 2 });
    assert.ok(Math.abs(h.r - Math.hypot(5, 3, 5) / 2) < 1e-9);
});

// ------------------------------------------------------------ the whole spell, on a small world
function world() {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    const edits = [];
    // a little house: 5 × 5, walls 3 high
    for (let L = 1; L <= 3; L++) for (let i = 0; i < 5; i++) for (const [x, z] of [[i, 0], [i, 4], [0, i], [4, i]]) { data.set(10 + x, L, z, BLOCK.PLANKS); edits.push([10 + x, L, z, BLOCK.PLANKS]); }
    return { data, edits };
}

function fakeGame({ id = 'H', host = true } = {}) {
    const { data, edits } = world();
    const me = new THREE.Vector3(0, 0, 2);
    const voice = [];
    const g = {
        authority: host, localId: id, config: { mode: 'freeworld' },
        net: { active: true, isHost: host, localId: id, pid: 'pid-' + id, name: 'Хозяин', players: new Map([['H', { pid: 'pid-H', name: 'Хозяин' }], ['P2', { pid: 'pid-P2', name: 'Друг' }], ['P3', { pid: 'pid-P3', name: 'Чужой' }]]) },
        terrain: { data }, blockEdits: edits,
        character: {
            group: { position: me },
            isArmRaised: () => true,
            getHandWorldPosition: (s, out) => out.set(me.x, me.y + 2, me.z),
            getHandDirection: (s, out) => out.set(12 - me.x, 0.5 - (me.y + 2), 2 - me.z).normalize(),
        },
        combat: {
            fatigue: 100,
            check(n) { const c = SPELL_COST[n] ?? 5; return this.fatigue < c ? `😮‍💨 Не хватает маны: нужно ${c}` : null; },
            pay(n) { this.fatigue -= SPELL_COST[n] ?? 5; },
        },
        hud: { setVoice: (t) => voice.push(t), toast: (t) => voice.push(t) },
        fx: { spark() {}, lightFlash() {} },
        remotes: new Map([['P2', { position: new THREE.Vector3(0, 0, 8) }]]),
        playerName: (pid) => g.net.players.get(pid)?.name,
        zombies: [],
        voice,
    };
    return g;
}

test('«Protection House» aimed at the house: −20; «Максима» ×3 −15 and 7 m; «стоп» fixes it; out of mana it stays', () => {
    const g = fakeGame();
    const W = new HouseWards(g);
    assert.equal(W.cast('ProtectionHouse'), 'ProtectionHouse');
    assert.equal(g.combat.fatigue, 80);
    assert.equal(W.list.size, 1);
    const w = [...W.list.values()][0];
    assert.equal(w.owner, 'pid-H');
    assert.equal(w.r, WARD.START_R);
    assert.ok(Math.abs(w.c.x - 12) < 1e-6 && Math.abs(w.c.z - 2) < 1e-6, 'centred on the house');
    assert.ok(W.setting, 'being set');
    for (let i = 0; i < 3; i++) assert.equal(W.maxima(), 'WardGrow');
    assert.equal(g.combat.fatigue, 65);
    assert.equal(w.r, 7);
    assert.ok(W.fix());
    assert.equal(W.setting, null);
    assert.equal(w.setting, false);
    assert.equal(W.maxima(), null, '«Максима» after «стоп» does nothing to it');
    assert.equal(w.r, 7);
    // a second time on the same house: no new sphere, go on making it bigger (free)
    assert.equal(W.cast('ProtectionHouse'), 'ProtectionHouse');
    assert.equal(W.list.size, 1);
    assert.equal(g.combat.fatigue, 65);
    g.combat.fatigue = 7;
    W.maxima(); // 7 → 2
    W.maxima(); // no mana: it stays
    assert.equal(w.r, 8.5);
    assert.equal(W.setting, null, 'set by itself when the mana ran out');
    // the saved world gives it back
    const W2 = new HouseWards(g);
    W2.restore(JSON.parse(JSON.stringify(W.snapshot())));
    const w2 = [...W2.list.values()][0];
    assert.equal(w2.r, 8.5);
    assert.equal(w2.owner, 'pid-H');
});

test('not only a house: aimed at bare ground, the sphere stands round that spot', () => {
    const g = fakeGame();
    g.character.getHandDirection = (s, out) => out.set(0.3, -1, -0.2).normalize(); // (at the meadow by my feet)
    const W = new HouseWards(g);
    assert.equal(W.cast('ProtectionHouse'), 'ProtectionHouse');
    const w = [...W.list.values()][0];
    assert.ok(w && Math.hypot(w.c.x - 0.5, w.c.z - 1.6) < 2, 'round the spot shown');
    assert.ok(/Сфера защиты/.test(g.voice.at(-1)), g.voice.at(-1));
});

test('refused: not aimed at a house, not enough mana — the hint says why', () => {
    const g = fakeGame();
    g.character.getHandDirection = (s, out) => out.set(-1, 0.3, 0).normalize(); // (at the sky / the meadow)
    const W = new HouseWards(g);
    assert.equal(W.cast('ProtectionHouse'), null);
    assert.ok(g.voice.at(-1).includes(refusal('wardNoHouse').slice(3, 20)), g.voice.at(-1));
    const g2 = fakeGame();
    g2.combat.fatigue = 10;
    const W2 = new HouseWards(g2);
    assert.equal(W2.cast('ProtectionHouse'), null);
    assert.equal(W2.list.size, 0);
    assert.ok(/маны/.test(g2.voice.at(-1)));
    // «Protection Invisible» on a house without protection; Grant far from my house
    const g3 = fakeGame();
    const W3 = new HouseWards(g3);
    assert.equal(W3.cast('ProtectionInvisible'), null);
    assert.equal(g3.voice.at(-1), refusal('wardInvNone'));
    assert.equal(W3.cast('ProtectionHouseGrant'), null);
    assert.equal(g3.voice.at(-1), refusal('wardGrantFar'));
});

test('nobody comes in but the owner and the granted; a zombie is pushed out; Grant lets a friend in', () => {
    const g = fakeGame();
    const W = new HouseWards(g);
    W.cast('ProtectionHouse');
    for (let i = 0; i < 2; i++) W.maxima();
    W.fix();
    const w = [...W.list.values()][0]; // r 5.5 round (12, ~2, 2)
    // the owner walks in
    const pos = new THREE.Vector3(12 - 4, 0, 2);
    W.keepOut(pos, pos.y, 3.5, 0.016);
    assert.equal(pos.x, 8, 'the owner passes');
    // a stranger's computer: pushed back to the surface
    const gs = fakeGame({ id: 'P3', host: false });
    const Ws = new HouseWards(gs);
    Ws.applyNet(W.netList());
    const ps = new THREE.Vector3(12 - w.r + 0.3, 0, 2);
    Ws.keepOut(ps, ps.y, 3.5, 0.016);
    assert.ok(Math.hypot(ps.x - 12, ps.z - 2) >= w.r - 0.01, `pushed out (${ps.x})`);
    // a zombie walking in (the host pushes creatures)
    const z = { id: 1, group: { position: new THREE.Vector3(12 + w.r - 0.4, 0.4, 2), visible: true }, isDead: false, takeDamage() {} };
    g.zombies.push(z);
    W._creatures(0.016);
    assert.ok(Math.hypot(z.group.position.x - 12, z.group.position.z - 2) >= w.r, 'the zombie is out again');
    // the owner grants the friend (P2) by aiming at him
    g.character.group.position.set(12, 0, 2 + w.r + 1);
    g.remotes.get('P2').position.set(12, 0, 2 + w.r + 6);
    g.character.getHandDirection = (s, out) => out.set(0, -0.2, 1).normalize();
    assert.equal(W.cast('ProtectionHouseGrant'), 'ProtectionHouseGrant');
    assert.ok(g.voice.some((t) => t.includes('Друг') && t.includes('может входить')));
    assert.deepEqual(w.grant, ['pid-P2']);
    // the friend's computer: let in
    const gf = fakeGame({ id: 'P2', host: false });
    const Wf = new HouseWards(gf);
    Wf.applyNet([]);
    Wf.applyNet(W.netList());
    assert.ok(gf.voice.some((t) => t.includes('пустил вас')));
    const pf = new THREE.Vector3(12 - w.r + 0.3, 0, 2);
    Wf.keepOut(pf, pf.y, 3.5, 0.016);
    assert.equal(pf.x, 12 - w.r + 0.3, 'the friend passes');
    // the stranger still can't
    Ws.applyNet(W.netList());
    const ps2 = new THREE.Vector3(12 - w.r + 0.3, 0, 2);
    Ws.keepOut(ps2, ps2.y, 3.5, 0.016);
    assert.notEqual(ps2.x, 12 - w.r + 0.3);
});

test('spells from outside stop at the sphere, from inside go out; blasts keep the blocks inside', () => {
    const g = fakeGame();
    const W = new HouseWards(g);
    W._add({ id: 'w', owner: 'pid-H', ownerName: 'Хозяин', c: { x: 0, y: 2, z: 0 }, n: 2, inv: false, grant: [], grantNames: [], hp: WARD.HP });
    const len = W.clipRay(new THREE.Vector3(-20, 2, 0), new THREE.Vector3(1, 0, 0), 30);
    assert.ok(Math.abs(len - (20 - 5.5)) < 1e-6, 'a ray stops at the surface');
    assert.equal(W.clipRay(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0), 30), 30, 'from inside: out it goes');
    assert.ok(W.shields(new THREE.Vector3(-10, 2, 0), new THREE.Vector3(1, 2, 0)));
    assert.ok(!W.shields(new THREE.Vector3(1, 2, 0), new THREE.Vector3(-10, 2, 0)));
    const p = W.segmentHit(new THREE.Vector3(-10, 2, 0), new THREE.Vector3(0, 2, 0));
    assert.ok(p && p.x < -5.5, 'a charge bursts just outside');
    // a Bombardo next to it: the house's blocks stay
    const data = new TerrainData();
    data.generate({ seed: 1 });
    for (let L = 1; L <= 4; L++) data.set(3, L, 0, BLOCK.PLANKS);
    for (let L = 1; L <= 4; L++) data.set(8, L, 0, BLOCK.PLANKS);
    const keep = W.keepFor({ x: 7, y: 1, z: 0 }, 3.6);
    assert.equal(keep.length, 1);
    data.removeSphere(7, 1, 0, 3.6, keepIn(keep));
    assert.equal(data.get(3, 2, 0), BLOCK.PLANKS, 'inside the sphere: still there');
    assert.equal(data.get(8, 2, 0), BLOCK.AIR, 'outside: blown away');
    assert.deepEqual(W.keepFor({ x: 0, y: 2, z: 0 }, 3), [], 'a blast inside: the sphere doesn\'t hold it');
    // lightning, Sapira… only make it flash
    W.struck({ x: 8, y: 2, z: 0 }, 3, 'LightningStrike');
    W.struck({ x: 8, y: 2, z: 0 }, 3, 'Sapira');
    assert.equal(W.list.get('w').hp, WARD.HP);
});

test('the book of protection: its own id, its three spells; Avada and the duel spells bounce, fire and an ice ball bring it down', () => {
    const id = WARD_ID + 42;
    assert.ok(isWardId(id) && !isSwiftId(id));
    assert.ok(!isWardId(42) && !isWardId(SWIFT_ID + 1));
    assert.deepEqual(bookSpells(id), WARD_SPELLS);
    // as common as an ordinary book-bird
    let ward = 0, plain = 0;
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 4000; i++) { const b = rollBirdId(i + 1, rnd); if (isWardId(b)) ward++; else if (!isSwiftId(b)) plain++; }
    assert.ok(Math.abs(ward - plain) < 0.15 * plain, `${ward} vs ${plain}`);
    assert.ok(wardBookFalls('fire') && wardBookFalls('ice') && !wardBookFalls(null) && !wardBookFalls('arrow'));
    const sparks = [];
    const me = { game: { fx: { spark: () => sparks.push(1) } }, _bounce: BookBirds.prototype._bounce };
    const bird = () => ({ ward: true, hp: 2, state: 'fly', model: { position: new THREE.Vector3() } });
    // «Авада Кедавра» and every duel charge: Duel calls hitBird(c, 99) — no fire, no ice
    const b1 = bird();
    BookBirds.prototype._damage.call(me, b1, 99, null);
    assert.equal(b1.state, 'fly');
    assert.equal(b1.hp, 2);
    assert.ok(sparks.length > 0, 'a spark off its aura');
    const b2 = bird();
    BookBirds.prototype._damage.call(me, b2, 2, 'fire');
    assert.equal(b2.state, 'fall');
    assert.ok(b2.singed);
    const b3 = bird();
    BookBirds.prototype._damage.call(me, b3, 2, 'ice');
    assert.equal(b3.state, 'fall');
    // an ordinary bird still falls to any spell
    const b4 = { ...bird(), ward: false };
    BookBirds.prototype._damage.call(me, b4, 2, null);
    assert.equal(b4.state, 'fall');
});

function warded() {
    const g = fakeGame();
    const W = new HouseWards(g);
    W._add({ id: 'w', owner: 'pid-H', ownerName: 'Хозяин', c: { x: 0, y: 2, z: 0 }, n: 2, inv: false, grant: [], grantNames: [], hp: WARD.HP });
    return { g, W, at: { x: 8, y: 2, z: 0 } };
}

test('only four spells break it: «Total Destruction» and «Бомбардо Максима» at once, «Бомбардо» three times, the Hellfire held ~7 s', () => {
    for (const sp of ['TotalDestruction', 'TotalDestructionMaxima', 'BombardoMaxima']) {
        const { W, at } = warded();
        W.struck(at, 3, sp, 'P3');
        assert.equal(W.list.size, 0, sp);
        assert.ok(W.log.some((e) => e.ev === 'broken' && e.by === 'P3'));
    }
    const b = warded();
    b.W.struck(b.at, 3, 'Bombardo');
    b.W.struck(b.at, 3, 'Bombardo');
    assert.equal(b.W.list.size, 1, 'two blasts: cracked');
    assert.ok(b.W.list.get('w').hp < WARD.HP);
    b.W.struck(b.at, 3, 'Bombardo');
    assert.equal(b.W.list.size, 0, 'the third breaks it');
    // cracks heal when it is left alone for a minute
    const h = warded();
    h.W.struck(h.at, 3, 'Bombardo');
    h.W._t = 30; h.W._heal(1);
    assert.ok(h.W.list.get('w').hp < WARD.HP, 'not yet');
    for (let t = 61; t < 90; t++) { h.W._t = t; h.W._heal(1); }
    assert.equal(h.W.list.get('w').hp, WARD.HP, 'healed');
    // the Hellfire: held on it ~7 s burns through; taken away, it cools
    const f = warded();
    for (let t = 0; t <= 5; t += 0.5) { f.W._t = t; f.W.struck(f.at, 3, 'Hellfire'); }
    assert.equal(f.W.list.size, 1, '5 s: it holds (glowing)');
    f.W._t = 9; f.W._heal(0.1);
    assert.equal(f.W.list.get('w').hellT, 0, 'the fire taken away: it cools');
    for (let t = 10; t <= 18; t += 0.5) { f.W._t = t; f.W.struck(f.at, 3, 'Hellfire'); }
    assert.equal(f.W.list.size, 0, 'held 7 s: burnt through');
    // the others do nothing to it
    const o = warded();
    for (const sp of ['Sapira', 'Thunderwave', 'LightningStrike', 'Inferno', 'AvadaKedavra', 'IceBall', 'arrow']) o.W.struck(o.at, 3, sp);
    assert.equal(o.W.list.get('w').hp, WARD.HP);
    // the owner is told (wherever he is)
    const m = warded();
    m.W.struck(m.at, 3, 'BombardoMaxima');
    assert.ok(m.g.voice.includes(refusal('wardBroken')));
});

test('the barrier is not seen — it shows where a stranger comes close; pushing on it shoves back and takes 2 HP', () => {
    const { g, W } = warded();
    const shoves = [];
    g.impact = { apply: (o) => shoves.push(o) };
    g.combat.enabled = true; g.combat.hp = 20; g.combat.damage = (n) => { g.combat.hp -= n; };
    W._look(W.list.get('w'));
    W.update(0.016);
    assert.equal(W.looks.get('w').dome.visible, false, 'not seen');
    // a stranger's computer (P3) walks into it
    const gs = fakeGame({ id: 'P3', host: false });
    gs.impact = { apply: (o) => shoves.push(o) };
    gs.combat.enabled = true; gs.combat.hp = 20; gs.combat.damage = (n) => { gs.combat.hp -= n; };
    const Ws = new HouseWards(gs);
    Ws.applyNet(W.netList());
    gs.character.group.position.set(-6.5, 0, 0);
    Ws.update(0.016);
    assert.ok(Ws.looks.get('w').dome.visible, 'it flashes into view');
    const p = gs.character.group.position;
    for (let i = 0; i < 60; i++) { p.x += 0.05; Ws._t += 0.05; Ws.keepOut(p, 0, 3.5, 0.05); } // (3 s pushing on it)
    assert.ok(Math.hypot(p.x, p.z) >= 5.5, 'held at the surface');
    assert.ok(shoves.length >= 1 && shoves[0].spell === 'Ward', 'shoved back');
    assert.ok(gs.combat.hp <= 18 && gs.combat.hp >= 14, 'a few HP: ' + gs.combat.hp);
    assert.ok(gs.voice.includes(refusal('wardBarrier')));
    // in Creative: shoved, no harm
    const gc = fakeGame({ id: 'P3', host: false });
    gc.config.mode = 'creative'; gc.impact = { apply() {} }; gc.combat.enabled = true; gc.combat.hp = 20; gc.combat.damage = (n) => { gc.combat.hp -= n; };
    const Wc = new HouseWards(gc);
    Wc.applyNet(W.netList());
    const pc = new THREE.Vector3(-5.9, 0, 0);
    Wc._t = 1; Wc.keepOut(pc, 0, 3.5, 0.016); pc.x += 0.4; Wc._t = 1.05; Wc.keepOut(pc, 0, 3.5, 0.016); // (run into it)
    assert.equal(gc.combat.hp, 20);
    // the owner walks through, nothing shows
    const pos = new THREE.Vector3(-4, 0, 0);
    W.keepOut(pos, 0, 3.5, 0.016);
    assert.equal(pos.x, -4);
    // a zombie pressing on it (the host): shoved back and hurt
    const hurt = [];
    g.damageZombie = (z, n) => hurt.push(n);
    g.creatureImpact = { apply: () => 'stagger' };
    const z = { id: 7, group: { position: new THREE.Vector3(5.6, 1.4, 0), visible: true }, isDead: false, takeDamage() {} };
    g.zombies.push(z);
    for (let i = 0; i < 40; i++) { z.group.position.x -= 0.05; W._t += 0.05; W._creatures(0.05); }
    assert.ok(hurt.length >= 1 && hurt[0] === WARD.SHOVE_HP, 'the zombie is shoved and hurt');
    assert.ok(Math.hypot(z.group.position.x, z.group.position.z) >= 5.5);
});

test('«Protection Invisible» said again on an invisible house: it is seen again, free', () => {
    const g = fakeGame();
    const W = new HouseWards(g);
    W.cast('ProtectionHouse'); W.fix();
    const w = [...W.list.values()][0];
    g.character.getHandDirection = (s, out) => out.set(w.c.x - 0, w.c.y - 2, w.c.z - 2).normalize();
    const m0 = g.combat.fatigue;
    assert.equal(W.cast('ProtectionInvisible'), 'ProtectionInvisible');
    assert.ok(w.inv);
    assert.equal(g.combat.fatigue, m0 - 15);
    assert.equal(W.cast('ProtectionInvisible'), 'ProtectionInvisible');
    assert.equal(w.inv, false);
    assert.equal(g.combat.fatigue, m0 - 15);
});
