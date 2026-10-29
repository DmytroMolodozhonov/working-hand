// «Nihilis Atra» — белая магия, рассеивает чёрную конусом: слова (оба вместе, не путается с другими), только со свитка, конус, кто/что.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { nihilisWords, NIHILIS_SAID } from '../../src/game/NihilisWords.js';
import { NIHIL, NIHILIS_TARGETS, inCone, blackWound, woundHp, scatters } from '../../src/game/NihilisRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { START_SPELLS, knows, howLearned } from '../../src/game/SpellBook.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { firstSpellGain } from '../../src/game/Mana.js';
import { SCROLL_WEIGHTS, SPELL_RU, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU } from '../../src/game/ItemTypes.js';
import { SHOP_SPELLS } from '../../src/game/WizardShop.js';
import { SPELL_SOUND } from '../../src/audio/SpellMusic.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { aliveDamage } from '../../src/game/LivingTrees.js';
import { pirateBoneDamage } from '../../src/game/Sailors.js';
import { harmOf } from '../../src/game/GargoyleRules.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { Nihilis } from '../../src/game/Nihilis.js';

test('said as two words: yes; one word, everyday talk, other spells: no', () => {
    for (const t of ['нихилис атра', 'нигилис атра', 'Nihilis Atra', 'nihilis atra', 'нихилус атра', 'нихилисатра', 'эй нихилис атра давай']) {
        assert.equal(nihilisWords(t), true, t);
        assert.equal(matchSpell(t), 'Nihilis', t);
    }
    for (const t of ['нигилист', 'нихилис', 'атра', 'я нигилист по натуре', 'атрибут нигилис', 'нигилизм это интересно']) assert.notEqual(matchSpell(t), 'Nihilis', t);
    for (const phrase of NIHILIS_SAID) assert.equal(matchSpell(phrase), 'Nihilis', phrase);
});

test('it does not steal other spells: the neighbours still match as they did', () => {
    const cases = { 'алайв': 'Alive', 'нокс': 'Nox', 'люмос': 'Lumos', 'атака': 'Attack', 'вайнд': 'Wind', 'визибл годи': 'VisibleGodi', 'пентаграниум сангвинис': 'Pentagranium', 'акцентрик': 'Accentric', 'авада кедавра': 'AvadaKedavra', 'инфернo': 'Inferno' };
    for (const [t, spell] of Object.entries(cases)) if (spell !== 'Inferno') assert.equal(matchSpell(t), spell, t);
});

test('only from a scroll, with real sources; a name, a colour, a sound, a book page, an icon', () => {
    assert.ok(!START_SPELLS.has('Nihilis'));
    assert.equal(knows('Nihilis', { mode: 'freeworld' }), false);
    assert.equal(knows('Nihilis', { mode: 'freeworld', spells: { Nihilis: true } }), true);
    assert.equal(knows('Nihilis', { mode: 'creative' }), true);
    assert.equal(howLearned('Nihilis'), 'scroll');
    assert.ok(SCROLL_WEIGHTS.some(([n, w]) => n === 'Nihilis' && w > 0), 'chests give the scroll');
    assert.ok(SHOP_SPELLS.includes('Nihilis'), 'the wizards\' shops sell it');
    assert.equal(SPELL_RU.Nihilis, 'Nihilis Atra');
    assert.ok(SCROLL_SPELL_COLOR.Nihilis && SCROLL_RIBBON_RU.Nihilis);
    assert.equal(SPELL_COST.Nihilis, NIHIL.COST);
    assert.equal(NIHIL.COST, 40);
    assert.equal(firstSpellGain('Nihilis'), 5);
    assert.ok(SPELL_SOUND.Nihilis?.cast, 'its own sound');
    const c = SPELLS.find((s) => s.name === 'Nihilis Atra');
    assert.ok(c && c.icon && c.cat !== 'dark', 'in the book, among the white spells');
});

test('the cone: in front, widening, not behind, not beyond the range', () => {
    const o = { x: 0, y: 0, z: 0 }, d = { x: 1, y: 0, z: 0 };
    assert.ok(inCone(o, d, { x: 10, y: 0, z: 0 }) >= 0);
    assert.ok(inCone(o, d, { x: 10, y: 0, z: 4 }) >= 0, 'wider at 10 m than at the wand');
    assert.ok(inCone(o, d, { x: 2, y: 0, z: 4 }) < 0, 'narrow near the wand');
    assert.ok(inCone(o, d, { x: -5, y: 0, z: 0 }) < 0, 'behind');
    assert.ok(inCone(o, d, { x: NIHIL.RANGE + 10, y: 0, z: 0 }) < 0, 'beyond');
    assert.ok(inCone(o, d, { x: 10, y: 9, z: 0 }) < 0, 'above');
    assert.ok(inCone(o, d, { x: 10, y: 0, z: 6 }, 2) >= 0, 'a big body touches the edge');
});

test('black mages: 60+ badly hurt and afraid, lower lightly, a plain mage not at all', () => {
    assert.equal(blackWound(0), null);
    assert.equal(blackWound(30), 'light');
    assert.equal(blackWound(59), 'light');
    assert.equal(blackWound(60), 'heavy');
    assert.equal(blackWound(100), 'heavy');
    assert.ok(woundHp('heavy', 20) >= 12 && woundHp('heavy', 20) > 20 * 0.5);
    assert.ok(woundHp('heavy', 100) === 55);
    assert.ok(woundHp('light', 20) < woundHp('heavy', 20));
    assert.equal(woundHp(null, 20), 0);
});

test('what lives by black magic falls apart: living trees, grave skeletons, the black ship\'s skeletons, gargoyles', () => {
    assert.equal(aliveDamage('Nihilis', 9999), 9999, 'a living tree / a risen skeleton takes it');
    assert.equal(pirateBoneDamage('Nihilis', 9999, true), 9999, 'a skeleton of the black ship breaks');
    assert.equal(harmOf('Nihilis', 5).does, 'kill', 'an infernal gargoyle dies');
    assert.equal(aliveDamage('Wind', 9999), 0, 'while plain spells still do nothing to them');
});

test('black pentagrams go out, the good ones stay', () => {
    for (const id of ['gargoyles', 'unity', 'vitality', 'breakward', 'monster', 'devil']) assert.ok(scatters(PENTAGRAMS[id]), id);
    for (const id of ['teleport', 'life', 'mend']) assert.ok(!scatters(PENTAGRAMS[id]), id);
});

test('«who / what» is written for every creature and thing', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'iceCastle', 'blackship', 'dragon', 'phoenix', 'owl', 'gargoyles', 'monster', 'imperius', 'ghosts', 'bodies', 'marks', 'items', 'blocks', 'doors', 'ships', 'water', 'ward', 'godGift', 'enchanted', 'space', 'spells', 'concentration', 'servants', 'hellfire']) assert.ok(NIHILIS_TARGETS[k]?.why, k);
});

// -------- the game part on a stub
function stub() {
    const calls = { hit: [], tree: [], garg: [], crew: [], fear: [], dome: [], marks: [], sent: [], said: [], dmg: [], breakward: 0, monster: 0, imp: 0, exorcise: 0 };
    const mk = (kind, id, x, o = {}) => ({ kind, id, a: new THREE.Vector3(x, 0, 0), b: new THREE.Vector3(x, 3, 0), r: 1, ...o });
    const creatures = {
        'v:black': { id: 'black', dark: 80, maxHp: 20, x: 12, y: 0, z: 0 }, 'v:light': { id: 'light', dark: 20, maxHp: 20 }, 'v:plain': { id: 'plain', dark: 0, maxHp: 20 }, 'v:far': { id: 'far', dark: 90, maxHp: 20 },
        't:tree': { id: 'tree' }, 'g:garg': { id: 'garg' }, 'c:skel': { id: 'skel', role: 'skeleton' }, 'c:bb': { id: 'bb', role: 'blackbeard', maxHp: 30 }, 'c:sailor': { id: 'sailor', role: 'sailor' }, 'a:cow': { id: 'cow' },
    };
    const bodies = [mk('v', 'black', 12), mk('v', 'light', 14), mk('v', 'plain', 16), mk('v', 'far', 30), mk('t', 'tree', 8), mk('g', 'garg', 10), mk('c', 'skel', 11), mk('c', 'bb', 13), mk('c', 'sailor', 15), mk('a', 'cow', 9), mk('z', 'z1', 9), mk('D', 'd1', 12), mk('p', 'p1', 5)];
    const g = {
        localId: 'me', authority: true, remotes: new Map(),
        hud: { setVoice: (t) => calls.said.push(t) }, perf: { note() {} },
        character: { group: { position: new THREE.Vector3(0, 2, 0) }, isArmRaised: () => true }, fx: { spark() {}, lightFlash() {}, straightBeam() {}, debris: { spawn() {} } },
        combat: { enabled: true, hp: 20, maxHp: 20, check: () => null, pay() {}, center: (v) => v.set(0, 2, 0), damage: (n, by, k) => calls.dmg.push([n, by, k]), shield: null, _shatter() { calls.dome.push('me'); this.shield = null; } },
        maxHP: 20, dark: { level: 0 },
        mana: { success() {} },
        sync: { nihilis: (o, d) => calls.sent.push([o.x, d.x]) },
        duel: { _bodies: () => bodies, _creature: (k, id) => creatures[k + ':' + id] },
        livingTrees: { hit: (c, dmg, kind) => calls.tree.push([c.id, dmg, kind]) },
        gargoyles: { hit: (c, dmg, kind) => calls.garg.push([c.id, dmg, kind]) },
        ships: { crew: { hit: (c, dmg, dir, by, o) => calls.crew.push([c.id, dmg, o.kind]) } },
        castleLife: { fear: (v) => calls.fear.push(v.id), hit: (v, dmg, dir, by, o) => calls.hit.push([v.id, dmg, o.kind]), wizards: { fight: { breakDome: (v) => calls.dome.push(v.id) } } },
        pentagranium: { marks: new Map([['bad', { id: 'bad', pent: 'unity', x: 14, y: 0, z: 1, r: 3.5 }], ['good', { id: 'good', pent: 'teleport', x: 15, y: 0, z: 0, r: 3.5 }], ['off', { id: 'off', pent: 'vitality', x: -20, y: 0, z: 0, r: 3.5 }]]), _remove(id) { calls.marks.push(id); } },
        breakward: { marked: true, onDeath() { calls.breakward++; this.marked = false; } },
        monster: { active: true, end() { calls.monster++; } },
        imperius: { active: false },
        ghosts: { exorcise: () => { calls.exorcise++; } },
        onDeath: [],
    };
    return { g, calls };
}
const aim = () => ({ origin: new THREE.Vector3(0, 2, 0), dir: new THREE.Vector3(1, 0, 0) });

test('cast: 40 mana, tells the others, nothing without a raised hand; once per cooldown', () => {
    const { g, calls } = stub();
    const n = new Nihilis(g);
    assert.equal(n.cast(false, aim()), null, 'half a phrase: wait');
    assert.equal(n.cast(true, aim()), 'Nihilis');
    assert.equal(calls.sent.length, 1);
    assert.equal(n.cast(true, aim()), null, 'cooldown');
    g.combat.check = () => '😮‍💨 мало маны';
    const m = new Nihilis(g);
    assert.equal(m.cast(true, aim()), null, 'no mana: nothing happens');
    assert.equal(calls.sent.length, 1);
});

test('the host: black things fall apart, black mages are hurt and afraid, everyone else untouched', () => {
    const { g, calls } = stub();
    new Nihilis(g).cast(true, aim());
    assert.deepEqual(calls.tree.map((x) => x[0]), ['tree']);
    assert.deepEqual(calls.garg.map((x) => x[0]), ['garg']);
    assert.deepEqual(calls.crew.map((x) => x[0]).sort(), ['bb', 'skel'], 'a skeleton and the captain, not the sailor');
    const bb = calls.crew.find((x) => x[0] === 'bb');
    assert.ok(bb[1] < 30 && bb[1] > 5, 'the captain is wounded, not killed');
    const sk = calls.crew.find((x) => x[0] === 'skel');
    assert.ok(sk[1] >= 1000, 'a skeleton breaks');
    const heavy = calls.hit.find((x) => x[0] === 'black'), light = calls.hit.find((x) => x[0] === 'light');
    assert.ok(heavy && heavy[1] >= 11 && heavy[2] === 'Nihilis', 'a 80-level black mage: badly hurt');
    assert.ok(light && light[1] < heavy[1], 'a 20-level one: lighter');
    assert.ok(!calls.hit.some((x) => x[0] === 'plain'), 'a plain mage: untouched');
    assert.ok(calls.dome.includes('black') && calls.dome.includes('light') && !calls.dome.includes('plain'), 'a black mage\'s dome is shattered, a plain one\'s never');
    assert.ok(calls.fear.includes('black'), 'the 60+ one is afraid');
    assert.ok(calls.fear.includes('far'), 'the far 60+ black mage within the scare distance… (30 m)');
    assert.ok(!calls.fear.includes('light'));
});

test('black pentagrams in the cone go out; the good ones and the ones outside stay; the caster\'s own light never hits the caster', () => {
    const { g, calls } = stub();
    new Nihilis(g).cast(true, aim());
    assert.deepEqual(calls.marks, ['bad']);
    assert.equal(calls.dmg.length, 0);
    assert.equal(calls.monster, 0);
    assert.equal(calls.breakward, 0);
    assert.equal(calls.exorcise, 1, 'the ghosts\' hook is called');
});

test('my own hero when another\'s light reaches him: a black mage is hurt, the dome shatters, the mark and the monster go; a plain mage: nothing but the dark things', () => {
    const { g, calls } = stub();
    g.dark.level = 70;
    g.combat.shield = { type: 2 };
    const n = new Nihilis(g);
    n.fire(new THREE.Vector3(-5, 2, 0), new THREE.Vector3(1, 0, 0), 'other');
    assert.equal(calls.dmg.length, 1);
    assert.ok(calls.dmg[0][0] >= 11, 'badly hurt');
    assert.deepEqual(calls.dome, ['me'].concat(calls.dome.slice(1)), 'my dome shattered');
    assert.equal(calls.breakward, 1);
    assert.equal(calls.monster, 1);
    const p = stub();
    p.g.dark.level = 0; p.g.combat.shield = { type: 2 };
    new Nihilis(p.g).fire(new THREE.Vector3(-5, 2, 0), new THREE.Vector3(1, 0, 0), 'other');
    assert.equal(p.calls.dmg.length, 0, 'a plain mage is not hurt');
    assert.ok(!p.calls.dome.includes('me'), 'his dome stays');
    const gods = stub();
    gods.g.dark.level = 70; gods.g.combat.shield = { type: 2, gods: true };
    new Nihilis(gods.g).fire(new THREE.Vector3(-5, 2, 0), new THREE.Vector3(1, 0, 0), 'other');
    assert.ok(!gods.calls.dome.includes('me'), 'the gods\' dome is not shattered');
});

test('a guest does not decide the world (the host does); the messages are checked', () => {
    const { g, calls } = stub();
    g.authority = false;
    new Nihilis(g).fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0), 'other');
    assert.equal(calls.tree.length + calls.garg.length + calls.crew.length + calls.hit.length, 0);
    const n = new Nihilis(g);
    n.onNet('x', { o: ['a', 0, 0], d: [1, 0, 0] });
    n.onNet('x', { o: [0, 0, 0], d: [0, 0, 0] });
    n.onNet('x', null);
    assert.ok(true, 'bad messages are ignored');
});
