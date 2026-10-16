// The clever owl (src/game/Owls.js, OwlBosses.js): twice as often as phoenixes; the words that ask
// for a boss; meat → love → one request → it leads; a second request is not heard; a simple spell
// only makes it dart away (and it stops loving), a scroll's spell kills it and leaves its feather.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Owls, OWL, owlModel, poseOwl, isStrong } from '../../src/game/Owls.js';
import { PHOENIX } from '../../src/game/Phoenixes.js';
import { bossOfWords, BOSS_FINDERS, bossWords } from '../../src/game/OwlBosses.js';
import { ACHIEVEMENTS } from '../../src/game/Achievements.js';

test('owls: twice as often as phoenixes', () => {
    assert.equal(OWL.SPAWN_CHANCE, PHOENIX.SPAWN_CHANCE * 2);
    assert.equal(OWL.SPAWN_MIN, PHOENIX.SPAWN_MIN);
    assert.equal(OWL.SPAWN_MAX, PHOENIX.SPAWN_MAX);
    assert.ok(OWL.HEIGHT > 1 && OWL.HEIGHT < 1.4, 'a quarter of a hero (4.8 m)');
});

test('the words: «я хочу найти паучиху», «где дракон», «Снежная королева»… — and not a talk', () => {
    const cases = {
        'я хочу найти паучиху': 'spider', 'найди гигантского паука': 'spider', 'покажи где дракон': 'dragon',
        'я хочу найти снежную королеву': 'iceQueen', 'Ледяная королева': 'iceQueen', 'где королева льда': 'iceQueen',
        'отведи меня к королю': 'king', 'хочу найти королеву замка': 'king',
        'найди капитана чёрные усы': 'blackbeard', 'где пират': 'blackbeard', 'покажи мастера башни волшебников': 'tower',
        'дракон': 'dragon', 'паучиха': 'spider',
    };
    for (const [t, id] of Object.entries(cases)) assert.equal(bossOfWords(t), id, t);
    for (const t of ['привет как дела', 'сегодня мы пойдём на рынок за хлебом и сыром', 'инферно', 'бомбардо максима']) assert.equal(bossOfWords(t), null, t);
});

test('every boss (every achievement) has words and a finder', () => {
    const words = new Map(bossWords());
    for (const a of ACHIEVEMENTS) {
        assert.ok(words.get(a.id)?.length, `no words for ${a.id}`);
        assert.equal(typeof BOSS_FINDERS[a.id], 'function', `no finder for ${a.id}`);
    }
    assert.ok(isStrong('AvadaKedavra') && isStrong('Lightning') && isStrong('TotalDestruction'));
    assert.ok(!isStrong('Bombardo') && !isStrong('Inferno') && !isStrong('Stupefy') && !isStrong('melee') && !isStrong('arrow'));
});

test('the model: a quarter of a hero; the head turns far round (270°), cocks, blinks', () => {
    const m = owlModel();
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    const h = box.max.y - box.min.y;
    assert.ok(h > 1.0 && h < 1.45, `height ${h}`);
    const a = { mode: 'stand', head: 2.3, cock: 0.4 };
    for (let i = 0; i < 30; i++) poseOwl(m, a, 0.05);
    assert.ok(m.userData.head.rotation.y > 2.2, 'the head turned ~130° to one side');
    assert.ok(m.userData.head.rotation.z > 0.3, 'cocked');
    for (const mode of ['glide', 'flap', 'hop', 'eat', 'land', 'shake', 'fall']) poseOwl(m, { mode }, 0.05);
});

/** A small world: flat ground, me at the origin, a loose meat list. */
function world() {
    const notes = [];
    const loose = new Map();
    const g = {
        config: { mode: 'survival' }, authority: true, localId: 'me', remotes: new Map(),
        character: { group: new THREE.Group() },
        collision: { groundY: () => 0 },
        hud: { setVoice: (t) => notes.push(t) },
        items: {
            loose,
            removeLoose(uid) { const L = loose.get(uid); loose.delete(uid); return L?.item; },
            spawnLoose(item, pos) { const L = { item, model: { position: pos.clone() } }; loose.set(item.uid, L); return L; },
        },
        iceCastle: { plan: { x: 900, z: -400, throne: { x: 905, z: -410 } }, state: { queenDead: false }, queen: null },
    };
    g.character.group.position.set(0, 1.95, 0);
    return { g, notes, loose };
}

test('meat → it eats and loves the thrower → asked once it leads to the boss; a second name is not heard', () => {
    const { g, notes, loose } = world();
    const O = new Owls(g);
    O.enabled = false;
    const o = O.spawn(new THREE.Vector3(4, 0, 0));
    O._setState(o, 'perch'); o.stay = 999;
    // I come near: it looks at me 5–10 s and doesn't fly off
    for (let i = 0; i < 20; i++) O.update(0.05);
    assert.ok(O.log.some((e) => e.ev === 'stare' && e.t >= 0), 'curious: it looks at me');
    const st = O.log.find((e) => e.ev === 'stare');
    assert.ok(st && st.t >= OWL.STARE[0] && st.t <= OWL.STARE[1], 'for 5–10 s');
    assert.equal(o.state, 'perch', 'it stays');
    // I throw meat by it
    loose.set('m1', { item: { kind: 'steak', uid: 'm1' }, model: { position: new THREE.Vector3(3, 0, 0.5) }, thrower: 'me' });
    for (let i = 0; i < 400 && !o.love; i++) O.update(0.05);
    assert.ok(!loose.has('m1'), 'the meat is eaten');
    assert.equal(o.love?.by, 'me', 'it loves me');
    assert.equal(o.state, 'adore');
    assert.ok(notes.some((t) => /полюбила/.test(t)));
    // the words are the owl's only now (a loving owl near me)
    assert.ok(O.claims('я хочу найти снежную королеву'));
    assert.ok(!O.claims('привет как дела'));
    assert.ok(O.hear('я хочу найти снежную королеву'));
    for (let i = 0; i < 10 && o.state !== 'guide'; i++) O.update(0.05);
    assert.equal(o.state, 'guide', 'it leads');
    assert.ok(Math.abs(o.guide.at.x - 905) < 1 && Math.abs(o.guide.at.z + 410) < 1, 'to the Ice Queen\'s throne');
    // once: another boss is not taken
    assert.equal(O.ask(o, 'dragon', 'me'), false);
    assert.equal(o.guide.boss, 'iceQueen');
    // it flies ahead of me towards her
    for (let i = 0; i < 100; i++) O.update(0.05);
    assert.ok(o.model.position.x > 5, 'ahead of me, towards the palace');
    // I walk there: it circles over the place, then flies off
    g.character.group.position.set(880, 1.95, -390);
    for (let i = 0; i < 40; i++) O.update(0.05);
    assert.ok(O.log.some((e) => e.ev === 'arrive'), 'it circles over the place');
});

test('no such boss alive: it shakes its head and stays (the request not spent)', () => {
    const { g } = world();
    g.iceCastle.state.queenDead = true;
    const O = new Owls(g);
    O.enabled = false;
    const o = O.spawn(new THREE.Vector3(3, 0, 0));
    o.love = { by: 'me', asked: null, keepT: 100 };
    O._setState(o, 'follow');
    assert.ok(O.hear('где ледяная королева'));
    for (let i = 0; i < 10; i++) O.update(0.05);
    assert.ok(O.log.some((e) => e.ev === 'none'));
    assert.equal(o.love.asked, null, 'not spent');
});

test('a simple spell or a blow: no harm, it darts away and stops loving; a scroll\'s spell kills it — an owl feather', () => {
    const { g, loose } = world();
    const O = new Owls(g);
    O.enabled = false;
    const o = O.spawn(new THREE.Vector3(3, 0, 0));
    o.love = { by: 'me', asked: null, keepT: 100 };
    O.hit(o, 10, 'Bombardo', 'me');
    assert.equal(o.hp, OWL.HP, 'no harm');
    assert.equal(o.state, 'flee', 'it darts away');
    assert.equal(o.love, null, 'it no longer loves me');
    O.hit(o, 12, 'melee', 'me');
    assert.equal(o.hp, OWL.HP, 'a blade: it dodges');
    O.boltHit(o, 'Stupefy', 'me');
    assert.equal(o.hp, OWL.HP);
    O.boltHit(o, 'AvadaKedavra', 'me');
    assert.ok(o.dead, '«Авада Кедавра» (a scroll\'s) kills it');
    assert.ok([...loose.values()].some((L) => L.item.kind === 'owlFeather'), 'an owl feather');
});
