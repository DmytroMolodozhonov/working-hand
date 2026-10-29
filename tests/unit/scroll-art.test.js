import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolOf, SCHOOLS, artKey, paintParchment } from '../../src/fx/ScrollArt.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';

test('every school has a title colour, an accent, a glow, a seal and a picture', () => {
    for (const [k, S] of Object.entries(SCHOOLS)) for (const f of ['ru', 'ink', 'accent', 'glow', 'seal', 'motif']) assert.ok(S[f], `${k}.${f}`);
});
test('a scroll of each spell has a school of its own kind (fire burns warm, water is blue)', () => {
    assert.equal(schoolOf({ stat: 'spell', spell: 'Hellfire' }), 'fire');
    assert.equal(schoolOf({ stat: 'spell', spell: 'Waterball' }), 'water');
    assert.equal(schoolOf({ stat: 'spell', spell: 'IceMaxima' }), 'ice');
    assert.equal(schoolOf({ stat: 'spell', spell: 'AvadaKedavra' }), 'dark');
    assert.equal(schoolOf({ stat: 'pentagram', pent: 'devil' }), 'dark');
    assert.equal(schoolOf({ stat: 'hp' }), 'heart');
    assert.equal(schoolOf({ stat: 'fatigue' }), 'mana');
    const mapped = Object.keys(SCROLL_SPELL_COLOR).filter((s) => schoolOf({ stat: 'spell', spell: s }) !== 'arcane');
    assert.ok(mapped.length >= Object.keys(SCROLL_SPELL_COLOR).length * 0.85, 'most scroll spells have a school');
});
test('the same scroll gives the same cache key; another spell another', () => {
    const a = { school: 'fire', title: 'A', lines: [[{ text: 'x', bold: false }]] };
    assert.equal(artKey(a), artKey({ ...a }));
    assert.notEqual(artKey(a), artKey({ ...a, title: 'B' }));
});
test('painting uses only the 2D context calls and keeps text at 24 px or more', () => {
    const fonts = [];
    const noop = () => {};
    const ctx = new Proxy({}, {
        get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? (s) => ({ width: String(s).length * 12 }) : k in t ? t[k] : noop),
        set: (t, k, v) => { t[k] = v; if (k === 'font') fonts.push(v); return true; },
    });
    paintParchment(ctx, 1024, 440, { school: 'fire', title: 'Свиток «Огонь»', lines: [[{ text: 'Огненное', bold: false }], [{ text: 'Сожгите его и вы научитесь заклинанию Hellfire — адский огонь', bold: false }]], note: 'x' });
    for (const f of fonts) assert.ok(Number(/(\d+)px/.exec(f)[1]) >= 24, f);
});
