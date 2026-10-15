// The game's own voices from the speakers (a merchant, a guard, a wizard) never cast a spell from my hand:
// the game knows what its villagers said and when (src/audio/GameVoices.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aired, clearAired, gameSaid, fromGame, editsInside } from '../../src/audio/GameVoices.js';
import { threshold } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('a spell\'s words in a villager\'s line, heard while it sounded, are the villager\'s', () => {
    clearAired();
    aired('Возьми поджаренный хлеб, он прямо с костра!', 1000, 3500);
    aired('Осторожно, огонь!', 10000, 11000);
    assert.ok(gameSaid('Fire', 3000, 3600), '«костра» is «костёр» — Fire');
    assert.ok(gameSaid('Inferno', 10500, 11200), '«огонь» — Inferno');
    // (heard a little after the line ended: the sound card and the room's echo)
    assert.ok(gameSaid('Fire', 4000, 4300));
});

test('my own spell is mine: another spell, or the same one said long after the line', () => {
    clearAired();
    aired('Возьми поджаренный хлеб, он прямо с костра!', 1000, 3500);
    assert.equal(gameSaid('Bombardo', 2000, 2600), null, 'the merchant said no «Бомбардо»');
    assert.equal(gameSaid('Fire', 8000, 8600), null, 'said 4.5 s after the line');
    assert.equal(gameSaid('Fire', 0, 600), null, 'said before the line');
});

test('a spell word inside a villager\'s word counts too, while it sounds («приятного аппетита» holds «ап»)', () => {
    clearAired();
    aired('Держи! Приятного аппетита.', 0, 3000);
    assert.ok(gameSaid('Up', 1000, 1400));
    assert.equal(gameSaid('Up', 6000, 6400), null);
});

// The network's real hearing (voice_native.py) of the game's own lines that read as a spell — «Жареный
// стейк» as «файр», «Не продаётся» as «даст», «Стой, негодяй!» as «стоп» — with no speakers' copy at all
const lines = JSON.parse(fs.readFileSync(new URL('../fixtures/game-lines.json', import.meta.url), 'utf8'));
const spells = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8')).filter((r) => r.kind === 'spell');
const heard = (r) => {
    const res = lookAt({ type: 'seg', id: 1, T: r.T, lp: r.lp, far: 0, final: true }, {});
    const spell = res.say && matchSpell(res.say.text);
    const meta = { native: true, from: 1000, to: 2000, sure: !!res.heard.sure };
    const sp = res.heard.sure && res.heard.spell;
    if (sp) { meta.fit = sp.avg - threshold(sp.len, 0); meta.len = sp.len; }
    return { spell, meta };
};

test('the game\'s own lines heard by the microphone: a sentence is talk; what still reads as a spell is known as the game\'s', () => {
    let casts = 0;
    for (const r of lines) {
        const res = lookAt({ type: 'seg', id: 1, T: r.T, lp: r.lp, far: 0, final: true }, {});
        const { spell, meta } = heard(r);
        if (!res.say || res.say.talkOnly || !spell) continue;
        casts++;
        clearAired();
        aired(r.text, 900, 2100);
        assert.ok(fromGame(spell, meta), `«${r.text}» cast ${spell}`);
    }
    // (a spell is said on its own: of these 34 lines that once read as a spell only 1 still does by itself)
    assert.ok(casts <= 2, `${casts}`);
});

test('my spells: all cast when no villager speaks, and most even over a villager\'s voice', () => {
    let n = 0, quiet = 0, over = 0;
    for (const [i, r] of spells.entries()) {
        const { spell, meta } = heard(r);
        if (!spell || spell !== matchSpell(r.text)) continue;
        n++;
        clearAired();
        if (!fromGame(spell, meta)) quiet++;
        aired(lines[i % lines.length].text, 900, 2100);
        if (!fromGame(spell, meta)) over++;
    }
    assert.equal(quiet, n);
    assert.ok(over / n >= 0.75, `${over}/${n}`);
});

test('letters a little off still count: a swap of two neighbours is one change', () => {
    assert.equal(editsInside('костер', 'возьмикостре'), 1);
    assert.equal(editsInside('бомбардо', 'кричалбомбарда'), 1);
    assert.equal(editsInside('файр', 'фаер'), 1);
    assert.equal(editsInside('ап', 'капуста'), 0);
});
