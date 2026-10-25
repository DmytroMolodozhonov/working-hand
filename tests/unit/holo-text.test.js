// «Раскрой свои секреты»: plain readable text, no raw HTML, and a description for every spell it can show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { holoParts, holoPlain, spellDescription, withSpellDescription } from '../../src/game/HoloText.js';
import { describeItem, SPELL_RU } from '../../src/game/ItemTypes.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const clean = (t) => assert.ok(!/[<>]|&lt;|&gt;|&amp;|style=/.test(t), `raw markup in: ${t}`);

test('tags with attributes and entities never reach the card', () => {
    const p = holoParts('<small style="color:#fff">Тёмный</small> <b style="color:#c9a8ff">Объединённая</b>: сила &lt;3 &amp; ещё');
    assert.deepEqual(p.map((x) => x.bold), [false, false, true, false]);
    clean(p.map((x) => x.text).join('').replace('<3', ''));
    assert.equal(holoPlain('<b>а</b>б'), 'аб');
});

test('every spell the hologram can show has a name and a description, with no markup', () => {
    for (const id of Object.keys(SPELL_RU)) {
        const d = describeItem({ kind: 'scroll', stat: 'spell', spell: id });
        const info = withSpellDescription(d, { kind: 'scroll', stat: 'spell', spell: id });
        clean(holoPlain(info.title));
        for (const l of info.lines) clean(holoPlain(l));
        if (id !== 'Pentagranium') assert.ok(spellDescription(id), `${id}: no description`);
        if (spellDescription(id)) assert.ok(info.lines.length > d.lines.length, `${id}: no description added`);
    }
    for (const s of SPELLS) {
        const id = s.name.split(' / ').map((n) => matchSpell(n)).find(Boolean);
        const card = spellDescription(id);
        assert.ok(card?.desc && card.name, `${s.name}: no description`);
        clean(card.desc);
    }
});

test('a wand tells about its favourite spell', () => {
    const it = { kind: 'wand', color: 0x886644, power: 10, fav: 'Inferno', dir: null };
    const info = withSpellDescription(describeItem(it), it);
    assert.ok(info.lines.length > describeItem(it).lines.length);
});
