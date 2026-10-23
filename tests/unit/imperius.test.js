// «Империус» / «Империус Максима» (Imperius.js): the author's numbers, who may be taken, the link fading with the
// distance, the words that cast it and the ones that never do, the scrolls' sources, the held rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPERIUS, IMPERIUS_MAXIMA, IMPERIUS_TARGETS, canTake, imperiusBlock, upkeep, linkAt, kindOf, flies } from '../../src/game/Imperius.js';
import { matchSpell, imperiusWords } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { FIRST_SPELL, GOD_SPELLS } from '../../src/game/Mana.js';
import { isDivine } from '../../src/game/ProtectionGods.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { SCROLL_WEIGHTS, SPELL_RU, SCROLL_RIBBON_RU, SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { SHOP_SPELLS } from '../../src/game/WizardShop.js';
import { knows, START_SPELLS } from '../../src/game/SpellBook.js';
import { HELD, mayCast } from '../../src/game/Concentration.js';
import { spaceSpellBlock } from '../../src/game/Space.js';
import { spellFamily } from '../../src/game/Blame.js';
import { SPELL_PHYSICS } from '../../src/game/Impact.js';

test('the author\'s numbers: 100 mana and a maximum of 150, 1 a second; Maxima 500, 750, 2 a second', () => {
    assert.equal(SPELL_COST.Imperius, 100);
    assert.equal(SPELL_COST.ImperiusMaxima, 500);
    assert.equal(IMPERIUS.COST, 100); assert.equal(IMPERIUS.NEED_MAX, 150); assert.equal(IMPERIUS.UPKEEP, 1);
    assert.equal(IMPERIUS_MAXIMA.COST, 500); assert.equal(IMPERIUS_MAXIMA.NEED_MAX, 750); assert.equal(IMPERIUS_MAXIMA.UPKEEP, 2);
    assert.equal(upkeep('Imperius', 1), 1);
    assert.equal(upkeep('ImperiusMaxima', 1), 2);
    assert.equal(upkeep('ImperiusMaxima', 0.5), 1);
    // the maximum first, then the mana now
    assert.equal(imperiusBlock('Imperius', { enabled: true, max: 149, mana: 149 }), 'max');
    assert.equal(imperiusBlock('Imperius', { enabled: true, max: 150, mana: 99 }), 'mana');
    assert.equal(imperiusBlock('Imperius', { enabled: true, max: 150, mana: 100 }), null);
    assert.equal(imperiusBlock('ImperiusMaxima', { enabled: true, max: 749, mana: 749 }), 'max');
    assert.equal(imperiusBlock('ImperiusMaxima', { enabled: true, max: 750, mana: 499 }), 'mana');
    assert.equal(imperiusBlock('ImperiusMaxima', { enabled: true, max: 750, mana: 500 }), null);
    assert.equal(imperiusBlock('ImperiusMaxima', { enabled: false, max: 30, mana: 0 }), null, 'Creative: free');
    // the first success: a strong scroll of the Earth +15; the gods' library — its 100
    assert.equal(FIRST_SPELL.Imperius, 15);
    assert.equal(FIRST_SPELL.ImperiusMaxima, 100);
});

test('who may be taken: the plain one — ordinary creatures; magic ones, bosses, players — only the Maxima', () => {
    for (const k of ['zombie', 'villager', 'knight', 'wizard', 'cow', 'sheep', 'horse', 'pig', 'sailor']) {
        assert.ok(canTake(k, false).ok, `${k}: the plain one takes it`);
        assert.ok(canTake(k, true).ok, `${k}: the Maxima too`);
    }
    for (const k of ['dragon', 'spider', 'bookbird', 'owl', 'phoenix', 'pegasus', 'runbook', 'guardBeast', 'tree', 'skeleton', 'snowman', 'iceMonster', 'iceQueen', 'blackbeard', 'pirateSkeleton', 'king', 'towerHead']) {
        const r = canTake(k, false);
        assert.ok(!r.ok && /Максима/.test(r.say), `${k}: the plain one says why (${r.say})`);
        assert.ok(canTake(k, true).ok, `${k}: the Maxima takes it`);
    }
    const p = canTake('player', false);
    assert.ok(!p.ok && /упорный/.test(p.say), 'a player: «чужой разум слишком упорный»');
    assert.ok(canTake('player', true).ok);
    assert.ok(!canTake('player', true, { shield: true }).ok, 'a player behind a shield: not through it');
    // every row decides
    for (const [k, t] of Object.entries(IMPERIUS_TARGETS)) assert.ok(t.ru && (t.plain || t.magic || t.boss || t.player), `${k}: decided`);
});

test('the kind from the game\'s creature', () => {
    assert.equal(kindOf('z', {}), 'zombie');
    assert.equal(kindOf('v', { role: 'knight' }), 'knight');
    assert.equal(kindOf('v', { role: 'king' }), 'king');
    assert.equal(kindOf('v', { role: 'master', wizard: true, cs: { def: { kind: 'tower' } } }), 'towerHead');
    assert.equal(kindOf('v', { role: 'master', wizard: true, cs: { def: { kind: 'village' } } }), 'wizard');
    assert.equal(kindOf('v', { role: 'farmer' }), 'villager');
    assert.equal(kindOf('a', { type: 'cow' }), 'cow');
    assert.equal(kindOf('a', { type: 'horse', pegasus: true }), 'pegasus');
    assert.equal(kindOf('a', { type: 'runbook' }), 'runbook');
    assert.equal(kindOf('a', { type: 'cow', form: 2 }), 'guardBeast');
    assert.equal(kindOf('s', { role: 'blackbeard' }), 'blackbeard');
    assert.equal(kindOf('s', { role: 'skeleton' }), 'pirateSkeleton');
    assert.equal(kindOf('s', { role: 'sailor' }), 'sailor');
    assert.equal(kindOf('I', { type: 'queen' }), 'iceQueen');
    assert.equal(kindOf('t', { skel: true }), 'skeleton');
    assert.equal(kindOf('pl', {}), 'player');
    // flying with the arms: only the Maxima, only what has wings
    assert.ok(flies('dragon', true) && flies('owl', true) && flies('bookbird', true) && flies('phoenix', true) && flies('pegasus', true) && flies('pig', true));
    assert.ok(!flies('pig', false) && !flies('cow', true) && !flies('dragon', false));
});

test('the link: clear to half the range, darker and darker, torn at the range (60 / 120 m)', () => {
    assert.equal(IMPERIUS.RANGE, 60);
    assert.equal(IMPERIUS_MAXIMA.RANGE, 120);
    assert.deepEqual(linkAt('Imperius', 10), { dark: 0, torn: false });
    assert.equal(linkAt('Imperius', 30).dark, 0);
    const a = linkAt('Imperius', 40).dark, b = linkAt('Imperius', 50).dark, c = linkAt('Imperius', 59).dark;
    assert.ok(a > 0 && b > a && c > b && c < 1, `${a} < ${b} < ${c}`);
    assert.ok(!linkAt('Imperius', 59.9).torn);
    assert.ok(linkAt('Imperius', 60).torn && linkAt('Imperius', 60).dark >= 0.99);
    assert.equal(linkAt('ImperiusMaxima', 60).dark, 0);
    assert.ok(linkAt('ImperiusMaxima', 90).dark > 0 && !linkAt('ImperiusMaxima', 119).torn && linkAt('ImperiusMaxima', 120).torn);
});

test('the words: «империус» (as the recognizer writes it) and «… максима» cast; «империя», «император» are talk', () => {
    for (const w of ['империус', 'Империус', 'империюс', 'империос', 'эмпириус', 'imperius', 'Imperius!', 'ну империус']) assert.equal(matchSpell(w), 'Imperius', w);
    for (const w of ['империус максима', 'Империус Максима', 'империюс максима', 'imperius maxima', 'империус макс']) assert.equal(matchSpell(w), 'ImperiusMaxima', w);
    for (const w of ['империя', 'Римская империя пала', 'император', 'империал', 'империализм', 'имперский', 'империи', 'империум']) {
        assert.equal(imperiusWords(w), null, w);
        assert.ok(!/^Imperius/.test(matchSpell(w) || ''), `${w} → ${matchSpell(w)}`);
    }
});

test('the scrolls: the plain one rare on the Earth (chests, the towers\' shop); the Maxima only in the gods\' library — a spell of the gods', () => {
    const w = new Map(SCROLL_WEIGHTS);
    assert.ok(w.get('Imperius') > 0 && w.get('Imperius') <= 1.5, 'rare, as the strong ones');
    assert.ok(!w.has('ImperiusMaxima'), 'never in a chest');
    assert.ok(SHOP_SPELLS.includes('Imperius') && !SHOP_SPELLS.includes('ImperiusMaxima'));
    assert.ok(TEMPLE_SCROLLS.includes('ImperiusMaxima') && !TEMPLE_SCROLLS.includes('Imperius'));
    assert.equal(templePlan(7).pedestals.filter((p) => p.spell === 'ImperiusMaxima').length, 1, 'its own pedestal');
    assert.ok(GOD_SPELLS.has('ImperiusMaxima') && isDivine('ImperiusMaxima') && !isDivine('Imperius'));
    for (const n of ['Imperius', 'ImperiusMaxima']) {
        assert.ok(SPELL_RU[n] && SCROLL_RIBBON_RU[n] && SCROLL_SPELL_COLOR[n] != null, n);
        assert.ok(!START_SPELLS.has(n));
        assert.ok(!knows(n, { mode: 'freeworld' }), 'unknown without its scroll');
        assert.ok(knows(n, { mode: 'freeworld', spells: { [n]: true } }), 'known from its scroll');
        assert.ok(knows(n, { mode: 'creative' }), 'Creative knows all');
    }
    assert.ok(!knows('ImperiusMaxima', { mode: 'freeworld', spells: { Imperius: true } }), 'the plain scroll does not teach the Maxima');
});

test('held: in another body no spell of yours works — only «стоп»; space has nobody to go into', () => {
    assert.ok(HELD.Imperius);
    for (const n of ['Lumos', 'Protection', 'Inferno', 'Imperius', 'ImperiusMaxima', 'Flight', 'Attack']) assert.equal(mayCast('Imperius', n), false, n);
    assert.ok(mayCast('Imperius', 'Stand') && mayCast('Imperius', 'Stop'));
    assert.ok(/космосе/.test(spaceSpellBlock('Imperius', 'space', 'none')));
    assert.equal(spaceSpellBlock('Imperius', 'earth', 'air'), null);
    assert.equal(spaceSpellBlock('ImperiusMaxima', 'mars', 'none'), null, 'on a planet: whoever is there');
    assert.equal(spellFamily('Imperius'), 'servant', 'blame: only a seen cast names the master');
    assert.equal(SPELL_PHYSICS.Imperius, null);
    assert.equal(SPELL_PHYSICS.ImperiusMaxima, null);
});

test('the sound: «империя», «император», «империал» heard alone are talk (SpellPhrase.everydayHeard); «империус» itself is the spell', async () => {
    const { everydayHeard } = await import('../../src/audio/SpellPhrase.js');
    for (const w of ['империя', 'империи', 'империю', 'империей', 'империал', 'имперский', 'император', 'великая империя']) assert.ok(everydayHeard(w, 'империус'), w);
    for (const w of ['империус', 'империюс', 'империос', 'империус максима']) assert.equal(everydayHeard(w, 'империус'), null, w);
});

test('a castle\'s guard and a taken creature: a person told to go, then beaten, killed only when it attacks people; animals shooed, never killed', async () => {
    const { guardMode, GUARD, GUARD_REACT } = await import('../../src/game/ImperiusGuards.js');
    const { IMPERIUS_TARGETS } = await import('../../src/game/Imperius.js');
    for (const k of Object.keys(IMPERIUS_TARGETS)) assert.ok(k in GUARD_REACT, `GUARD_REACT decides ${k}`);
    assert.equal(guardMode('villager', 0, 0), 'warn');
    assert.equal(guardMode('knight', GUARD.WARN_FOR + 1, 0), 'beat');
    assert.equal(guardMode('villager', 0, GUARD.MAD), 'kill', 'attacking people: killed');
    for (const k of ['pig', 'sheep', 'owl']) assert.equal(guardMode(k, 999, 999), 'shoo', k + ': shooed, whatever it does');
    for (const k of ['cow', 'horse', 'pegasus']) assert.equal(guardMode(k, 999, 999), 'lead', k + ': led out, never killed');
    for (const k of ['zombie', 'dragon', 'spider', 'player']) assert.equal(guardMode(k, 999, 999), null, k + ': the castle\'s own fight');
});
