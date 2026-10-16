// A phrase casts only when it is the spell itself (SpellPhrase.js): a spell's word inside everyday talk
// («спасибо», «сегодня солнце светит», «стоп, подожди») is talk. And the spell journal's line (SpellLog.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spellPhrase } from '../../src/audio/SpellPhrase.js';
import { VOCAB } from '../../src/audio/SpellSpotter.js';
import { formatEntry } from '../../src/core/SpellLog.js';
import { fromGame, aired, clearAired } from '../../src/audio/GameVoices.js';

const TALK = ['сегодня солнце светит', 'я сапоги купил', 'стоп подожди', 'давай собери вещи', 'спасибо большое', 'спасибо',
    'он заморозил реку', 'акция в магазине', 'мы летим на полет', 'ветер сильный сегодня', 'бомба упала', 'это удар', 'это секрет',
    'смотри на солнце', 'максим иди сюда', 'сапоги', 'запад', 'огонь горит у ворот', 'щит у рыцаря', 'дай мне щит', 'собери войско',
    'пауза в игре', 'привет айс', 'снеговик стоит во дворе', 'сапер', 'я хочу пойти туда где стоит большой дом и там подождать'];

const SPELLS = ['бомбардо', 'ну бомбардо', 'бомбардо бомбардо', 'бомбардо давай', 'бомбардо максима', 'бомбарда', 'огонь', 'щит', 'стоп', 'эй стоп',
    'ап', 'айс', 'лед', 'к солнцу', 'спаси', 'инферно', 'давай инферно', 'протекшн хаус', 'экспеллиармус', 'экспелиармус', 'вингардиум левиоса',
    'люмос', 'нокс', 'bombardo', 'protection', 'лет зе хеллфаер кам', 'заморозь', 'фрозен', 'снеговик', 'криейт э хаус', 'создай дом',
    'верни мне мою силу', 'авада кедавра', 'авада кидавра', 'импульс', 'ту зе сан', 'тузесан', 'землетрясение', 'брейн рот', 'алохомора',
    'джольд', 'стент ап', 'ил бабл'];

test('everyday talk with a spell\'s word in it never casts', () => {
    for (const t of TALK) {
        const r = spellPhrase(t);
        assert.equal(r.ok, false, `«${t}» → ${r.name}`);
    }
});

test('spells said on their own still cast (Russian names, misheard forms, every way of saying them)', () => {
    for (const t of SPELLS) {
        const r = spellPhrase(t);
        assert.ok(r.ok && r.name, `«${t}» → ${r.name} (${r.why})`);
    }
    for (const w of VOCAB) assert.ok(spellPhrase(w.phrase).ok, `«${w.phrase}»`);
});

test('a phrase still being said casts only when it is the spell and nothing else', () => {
    assert.equal(spellPhrase('бомбардо', { final: false }).ok, true);
    assert.equal(spellPhrase('бомбардо там', { final: false }).ok, false);
});

test('the journal line tells what was heard, which spell and why it did not work', () => {
    const line = formatEntry({ at: new Date(2026, 0, 1, 12, 3, 4), text: 'бомбардо', isFinal: true, meta: { native: true, sure: true, snr: 7, fit: 0.4 },
        spell: 'Бомбардо', ok: false, why: 'занято: вы держите «Левиоса» — сначала «стоп» (концентрация)' });
    assert.match(line, /^12:03:04 .*«бомбардо».*конец фразы.*шумно.*→ Бомбардо → ❌ занято: вы держите «Левиоса»/);
    assert.match(formatEntry({ text: 'привет', spell: null, why: 'обычная речь' }), /заклинания нет → ❌ обычная речь/);
});

test('my mouth moving with the voice: a spell over the Ice Queen\'s taunt is mine', () => {
    clearAired();
    aired('Твоя магия здесь бессильна!', 1000, 3000);
    const heard = { from: 1500, to: 2000, native: true, sure: true, fit: 0.2, len: 8 };
    assert.ok(fromGame('Bombardo', heard)); // (unsure, over her voice: was taken for hers)
    assert.equal(fromGame('Bombardo', { ...heard, mine: true }), null);
    aired('Лёд, пронзи их!', 4000, 5000);
    assert.ok(fromGame('Ice', { from: 4200, to: 4600, mine: true })); // (her line says that very spell)
    clearAired();
});

test('«Бомбардо Максима» is that one spell, once: no «Джолт», no second «Бомбардо» after it (the author\'s case)', async () => {
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    const { afterCast } = await import('../../src/audio/SpellPhrase.js');
    const { partOf } = await import('../../src/input/NativeVoice.js');
    for (const t of ['бомбарда максима', 'бомбардо максима', 'бомбарда макс има']) {
        assert.equal(matchSpell(t), 'BombardoMaxima', t);
        assert.ok(spellPhrase(t).ok, t);
    }
    assert.ok(partOf('бомбардо максима', 'бомбардо'));
    const last = { spell: 'BombardoMaxima', at: 1000, seg: 7 };
    assert.ok(afterCast(last, 'Bombardo', { native: true, seg: 7, fit: 1.5 }, 1500)); // (the end of the same phrase)
    assert.ok(afterCast(last, 'BombardoMaxima', { native: true, seg: 7, fit: 1.5 }, 1500));
    assert.ok(afterCast(last, 'Jolt', { native: true, seg: 7, fit: 0.2 }, 1600)); // (the explosion read as a word)
    assert.ok(afterCast(last, 'Jolt', { native: true, seg: 8, fit: 0.2 }, 1800)); // (its echo, the next «phrase»)
    assert.equal(afterCast(last, 'Jolt', { native: true, seg: 8, fit: 1.2 }, 1800), null); // (said clearly: mine)
    assert.equal(afterCast(last, 'Bombardo', { native: true, seg: 9, fit: 0.2 }, 3000), null); // (later: a new spell)
    assert.equal(afterCast({ spell: 'Jolt', at: 1000, seg: 3 }, 'JoltMaxima', { native: true, seg: 3, fit: 0.1 }, 1300), null); // (it grows)
});
