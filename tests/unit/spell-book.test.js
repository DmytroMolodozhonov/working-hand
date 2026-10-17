// What a beginner knows (SpellBook.js — the one place) and where every other spell's scroll comes from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { START_SPELLS, BOOK_SPELLS, MANA_SPELLS, knows, teachKey } from '../../src/game/SpellBook.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { FIRST_SPELL, NOT_SPELLS } from '../../src/game/Mana.js';
import { TEMPLE_SCROLLS } from '../../src/world/GodsTemple.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { rollScroll, rollLoot, rollIceQueenLoot, rollPirateLoot, rollShipLoot, rollPortLoot, LOOT_FOR, SPELL_RIBBON, SPELL_RU } from '../../src/game/ItemTypes.js';
import { rollShopScroll, rollWizardHouseLoot } from '../../src/game/WizardShop.js';
import { createRng } from '../../src/core/math.js';

const survival = (spells = {}, learned = new Set()) => ({ mode: 'freeworld', spells, learned });

/** Every spell the game can be asked for. */
function allSpells() {
    const all = new Set([...Object.keys(SPELL_COST), ...Object.keys(FIRST_SPELL)]);
    for (const s of SPELLS) for (const m of (s.say || '').matchAll(/«([^»]+)»/g)) { const n = matchSpell(m[1]); if (n) all.add(n); }
    for (const n of NOT_SPELLS) all.delete(n);
    return all;
}

/** Every spell scroll that turns up anywhere on the Earth (chests, bosses, ships, the towers). */
function scrollsFound() {
    const r = createRng(7), found = new Set();
    const note = (x) => { for (const it of [].concat(x || [])) if (it?.kind === 'scroll' && it.spell) found.add(it.spell); };
    LOOT_FOR.maxMana = 5000;
    for (let i = 0; i < 6000; i++) {
        note(rollScroll(r)); note(rollLoot(r, { royal: true })); note(rollIceQueenLoot(r)); note(rollPirateLoot(r, 'captain'));
        note(rollShipLoot(r)); note(rollPortLoot(r)); note(rollShopScroll(r)); note(rollWizardHouseLoot(r, true));
    }
    LOOT_FOR.maxMana = 0;
    return found;
}

test('the author\'s list: what a beginner knows outside Creative — and the Maximas only from a scroll', () => {
    const me = survival();
    for (const n of ['Bombardo', 'Earthquake', 'Liquidation', 'Protection', 'Ice', 'Frozen', 'Jolt', 'Firefighting', 'Fire', 'ChangeColor', 'CreateBed', 'Stitching', 'Gather', 'Draw', 'Lumos', 'Accio'])
        assert.ok(knows(n, me), `${n}: known from the start`);
    for (const n of ['BombardoMaxima', 'EarthquakeMaxima', 'LiquidationMaxima', 'ProtectionMaxima', 'IceMaxima', 'JoltMaxima', 'CircleAttack', 'CircleAttackMaxima',
        'Drawdown', 'DrawdownMaxima', 'Overgrown', 'OvergrownMaxima', 'Brainrot', 'Waterball', 'WaterForming', 'AirBubble', 'AirBubbleMaxima', 'WaveAttack', 'WaveAttackMaxima',
        'WaterVortex', 'WaterVortexSuperMaxima', 'FirefightingMaxima', 'LetItRain', 'Snowman', 'Unfurl', 'Furl', 'LevitationMaxima', 'CreateFloor', 'CreateWall', 'CreateDoor',
        'CreateBoard', 'CreateHouse', 'CreateCastle', 'IceCastle', 'IceBridge', 'Breakthrough', 'FireMaxima'])
        assert.ok(!knows(n, me), `${n}: only from a scroll / a book`);
    // a burnt scroll teaches its spell (and the Maxima it carries); the default «knew it» of an old save is gone
    assert.ok(knows('DrawdownMaxima', survival({ Drawdown: true })) && knows('Furl', survival({ Unfurl: true })));
    assert.ok(!knows('BombardoMaxima', survival({ Bombardo: true })), 'the plain spell\'s name teaches no Maxima');
    assert.ok(knows('CreateWall', survival({}, new Set(['CreateWall']))), 'a book-bird\'s page');
    for (const n of allSpells()) assert.ok(knows(n, { mode: 'creative' }), `Creative: ${n}`);
});

test('every spell a beginner does not know has a real source: a scroll somewhere, a book-bird, the gods\' temple, or the mana', () => {
    const found = scrollsFound();
    for (const n of allSpells()) {
        if (START_SPELLS.has(n)) continue;
        const k = teachKey(n);
        const ok = found.has(k) || BOOK_SPELLS.has(k) || MANA_SPELLS.has(k) || TEMPLE_SCROLLS.includes(k) || k === 'CreateHouse' || k === 'Inspirius';
        assert.ok(ok, `«${n}»: not known from the start, and no scroll «${k}» turns up anywhere`);
        if (found.has(k)) assert.ok(SPELL_RIBBON[k] && SPELL_RU[k], `the scroll «${k}»: its ribbon and its name`);
    }
});
