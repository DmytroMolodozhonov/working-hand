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

test('«Бомбардо Максима» is no «Айс Максима» twice: the end «…максима» of the same phrase is never another «X Максима» (the author\'s case)', async () => {
    const { afterCast } = await import('../../src/audio/SpellPhrase.js');
    const last = { spell: 'BombardoMaxima', at: 1000, seg: 7 };
    // (the look at the phrase's end starts inside «бомбардо»: «…до максима» fits «лёд максима» WELL — fit 1.9 on the recordings)
    assert.ok(afterCast(last, 'IceMaxima', { native: true, seg: 7, fit: 1.9 }, 1400));
    assert.ok(afterCast(last, 'IceMaxima', { native: true, seg: 8, fit: 1.9 }, 1600)); // (the next «phrase» of the same breath)
    assert.ok(afterCast(last, 'IceMaxima', null, 1600)); // (the browser's voice tells no segment, no fit)
    assert.equal(afterCast(last, 'IceMaxima', { native: true, seg: 9, fit: 1.9 }, 3600), null); // (a new phrase, a moment later: mine)
    // (the journal 22:39: «Бомбардо» alone, then «…максима» 2.3 s on read as «Айс Максима»)
    const alone = { spell: 'Bombardo', at: 1000, seg: 7 };
    assert.ok(afterCast(alone, 'IceMaxima', { native: true, seg: 8, fit: 1.9 }, 3300));
    assert.equal(afterCast(alone, 'IceMaxima', { native: true, seg: 9, fit: 1.9 }, 5200), null);
    assert.equal(afterCast({ spell: 'Jolt', at: 1000, seg: 7 }, 'IceMaxima', { native: true, seg: 8, fit: 1.9 }, 2000), null); // (a duel chain)
    assert.equal(afterCast(last, 'Ice', { native: true, seg: 8, fit: 1.9 }, 1800), null); // (plain «Айс» is not a «Максима» tail)
});

test('running with no word said: breathing and steps read as «Даст» / «Джолт» never cast (the author\'s case)', async () => {
    const { bodyNoise } = await import('../../src/audio/SpellPhrase.js');
    assert.ok(bodyNoise({ spell: 'Sands', text: 'даст', native: true, fit: 0.2, len: 4, running: true, lips: null })); // (only just made out, on the run)
    assert.ok(bodyNoise({ spell: 'Jolt', text: 'джолт', native: false, running: true, lips: false })); // (the mouth stayed still — the browser's voice: no fit to weigh it with)
    assert.ok(bodyNoise({ spell: 'Jolt', text: 'джолт', native: true, fit: 0.3, len: 5, snr: 8, lips: null })); // (in noise)
    assert.equal(bodyNoise({ spell: 'Jolt', text: 'джолт', native: true, fit: 0.9, len: 5, running: true, lips: true }), null); // (said, clearly)
    assert.equal(bodyNoise({ spell: 'Sands', text: 'даст', native: true, fit: 0.2, len: 4, snr: 25, lips: null }), null); // (standing, quiet room)
    assert.equal(bodyNoise({ spell: 'BombardoMaxima', text: 'бомбардо максима', native: true, fit: 0.1, len: 15, running: true, lips: null }), null);
});

test('the journal tells how fast a spell went off after it was said', () => {
    const line = formatEntry({ text: 'ликвидейшн максима', meta: { native: true, lag: 212, fromStart: 1180 }, spell: 'Liquidation Maxima', ok: true });
    assert.match(line, /✅ сработало за 212 мс после последней буквы \(1180 мс от начала слова\)/);
});

test('the author\'s journal (16.10): a sound only just made out, its letters nothing like the spell, never casts; real ones still do', async () => {
    const { soundTrust, wordsOfLine, stopFirst } = await import('../../src/audio/SpellPhrase.js');
    // [spell, its words, what the network wrote, fit, lips, running, speakers] — from the journal
    const no = [['Stupefy', 'остолбеней', 'страх', 0.1, null, false, 0.77], ['Sands', 'даст', 'да', 0.5, null, false, 0], ['Sands', 'даст', 'ат', 0.9, null, false, 0],
        ['Wind', 'вайнд', 'вайнд', 0, null, false, 0.11], ['Hellfire', 'лет зе хеллфаер кам', 'да этоне тупая ка', 0.1, null, false, 0.44],
        ['AvadaKedavra', 'авада кедавра', 'здк', 0.5, null, false, 0], ['CreateCastle', 'криейт э касл', 'стоочное банполо', 1, null, false, 0],
        ['CreateCastle', 'криейт э касл', 'настрой свой', 0, false, false, 0], ['Frozen', 'фрозен', 'просто', 0.1, true, false, 0],
        ['Gather', 'гэзер', 'а я ще у', 0.3, true, true, 0], ['Sands', 'даст', 'все я получил васего', 0.8, true, false, 0],
        ['Sands', 'даст', 'ну да в мультиплеере играли вместе заходил сюда та ну ибы в', 0.9, null, false, 0.36]];
    for (const [spell, canonical, written, fit, lips, running, far] of no) assert.ok(soundTrust({ spell, canonical, written, fit, lips, running, far }), `${written} → ${spell}`);
    const yes = [['Lumos', 'люмос', 'глемус', 0.9, true], ['Lumos', 'люмос', 'лемус', 0.5, true], ['Inferno', 'инферно', 'интерно', 1.3, true],
        ['Hellfire', 'лет зе хеллфаер кам', 'х фаркам', 1.1, true], ['BombardoMaxima', 'бомбардо максима', 'бам барда', 0.5, true],
        ['Stand', 'стоп', 'стоп', 2, false], ['Firefighting', 'файрфайтинг', 'файфайтин', 2, false],
        ['LiquidationMaxima', 'ликвидейшн максима', 'ликвидейшн максимум ликвидейшн максимум', 2.6, false, true], ['Accio', 'акцио', 'королева акце', 1.4, true]];
    for (const [spell, canonical, written, fit, lips, running = false] of yes) assert.equal(soundTrust({ spell, canonical, written, fit, lips, running }), null, `${written} → ${spell}`);
    assert.ok(wordsOfLine('так спасибо', 'Спасибо, братцы!'));
    assert.ok(!wordsOfLine('бомбардо', 'Спасибо, братцы!'));
    assert.ok(stopFirst('стоп раскрой свои секреты') && !stopFirst('стоп'));
    // a word or two before a spell is no talk
    assert.ok(spellPhrase('так теперь вайнд максима').ok);
});

test('«Дай» said alone is found by its sound and casts with a clear fit; «дай мне», «да» never', async () => {
    const { HEARD } = await import('../../src/audio/SpellSpotter.js');
    const { soundTrust } = await import('../../src/audio/SpellPhrase.js');
    assert.ok(HEARD.has('Die'));
    assert.ok(spellPhrase('дай').ok && spellPhrase('бум').ok);
    for (const t of ['дай мне', 'дайте', 'дай посмотреть']) assert.equal(spellPhrase(t).ok, false, t);
    assert.equal(soundTrust({ spell: 'Die', canonical: 'дай', written: 'дай', fit: 0.4 }), null);
    assert.ok(soundTrust({ spell: 'Die', canonical: 'дай', written: 'да', fit: 1.0 })); // («да» is no «дай»)
});

test('the game\'s own voices playing (the wizards\' tower): a clear spell casts before the phrase\'s end, not 2–3 s later', async () => {
    const fs = await import('node:fs');
    const { unpack, V, BLANK } = await import('../../src/audio/SpellSpotter.js');
    const { lookAt } = await import('../../src/input/NativeVoice.js');
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
    const r = rows.find((x) => x.kind === 'spell' && x.text === 'инферно');
    const lp0 = unpack(r.lp, r.T), T = r.T + 15, lp = new Float32Array(T * V);
    lp.set(lp0);
    for (let t = r.T; t < T; t++) for (let v = 0; v < V; v++) lp[t * V + v] = v === BLANK ? 0 : -25; // (the voices ducked: quiet)
    const b64 = Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64');
    const cast = (game) => { const o = lookAt({ id: 1, final: false, T, lp: b64, far: 0.6, game }, { last: 'инферно' }); return o.say && !o.say.more ? matchSpell(o.say.text) : null; };
    assert.equal(cast(true), 'Inferno');
    assert.equal(cast(false), null); // (a friend's voice — not the game's: the phrase's end decides, with the speakers' copy)
});

test('a duel\'s one-word spells don\'t wait for a «… Максима»; «Дай мне хлеба» from a villager is no «Дай»', async () => {
    const { lookAt } = await import('../../src/input/NativeVoice.js');
    const { spellsIn } = await import('../../src/audio/GameVoices.js');
    const fs = await import('node:fs');
    const { unpack, V, BLANK } = await import('../../src/audio/SpellSpotter.js');
    const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
    let fast = 0, n = 0;
    for (const r of rows.filter((x) => x.kind === 'spell' && x.text === 'джолт')) {
        const lp0 = unpack(r.lp, r.T), T = r.T + 6, lp = new Float32Array(T * V); // (just 240 ms of quiet after it)
        lp.set(lp0);
        for (let t = r.T; t < T; t++) for (let v = 0; v < V; v++) lp[t * V + v] = v === BLANK ? 0 : -25;
        const o = lookAt({ id: 1, final: false, T, lp: Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64'), far: 0 }, { last: 'джолт' });
        n++; if (o.say?.settled) fast++;
        assert.ok(!o.say?.more, 'never «wait for Максима»');
    }
    assert.ok(n && fast >= 1, `${fast}/${n}`); // (a recording heard less clearly waits for the phrase's end — never for a «Максима»)
    assert.ok(!spellsIn('Дай мне хлеба!').has('Die') && spellsIn('Дай!').has('Die'));
});

test('«Бомбардо» waits for a «… Максима» only when the hero knows «Бомбардо Максима»', async () => {
    const { lookAt } = await import('../../src/input/NativeVoice.js');
    const fs = await import('node:fs');
    const { unpack, prepare, V, BLANK, SPACE } = await import('../../src/audio/SpellSpotter.js');
    const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
    const look = (r, knows) => {
        const lp0 = unpack(r.lp, r.T), P = prepare(lp0, r.T);
        let end = r.T - 1; while (end > 0 && (P.am[end] === BLANK || P.am[end] === SPACE)) end--;
        const T = end + 1 + 8, lp = new Float32Array(T * V); // (the word, then 320 ms of quiet)
        lp.set(lp0.subarray(0, (end + 1) * V));
        for (let t = end + 1; t < T; t++) for (let v = 0; v < V; v++) lp[t * V + v] = v === BLANK ? 0 : -25;
        return lookAt({ id: 1, final: false, T, lp: Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64'), far: 0, knows }, { last: 'бомбардо' }).say;
    };
    let checked = 0;
    for (const r of rows.filter((x) => x.kind === 'spell' && x.text === 'бомбардо')) {
        const known = look(r, () => true), unknown = look(r, (s) => s !== 'BombardoMaxima');
        if (!known && !unknown) continue; // (heard too unclearly for a look before the end)
        checked++;
        assert.ok(known?.more, 'knows «Бомбардо Максима»: waits');
        assert.ok(unknown?.settled, 'doesn\'t know it: cast now');
    }
    assert.ok(checked > 0);
});

test('talking to oneself: a lone «с», «айс» or «фроз…» inside words is no Sands / Ice / Frozen; said on their own they still are', async () => {
    const { soundTrust } = await import('../../src/audio/SpellPhrase.js');
    // [spell, its words, what the network wrote, fit] — the sound only just like the spell, the letters talk
    const talk = [['Sands', 'санд', 'с', 1.4], ['Sands', 'санд', 'сам с собой', 1.2], ['Sands', 'даст', 'я вот сам с собой разговариваю', 2],
        ['Ice', 'айс', 'а', 1.5], ['Ice', 'айс', 'найс получилось', 1.3], ['Ice', 'лед', 'лето', 1.2],
        ['Frozen', 'фрозен', 'проза', 0.7], ['Frozen', 'фрозен', 'он заморозил реку', 2], ['Frozen', 'фрозен', 'просто', 1.6]];
    for (const [spell, canonical, written, fit] of talk) assert.ok(soundTrust({ spell, canonical, written, fit, lips: null }), `«${written}» → ${spell}`);
    const said = [['Sands', 'санд', 'санд', 0.8], ['Sands', 'даст', 'даст', 0.6], ['Sands', 'санд', 'сэндс', 0.9], ['Ice', 'айс', 'айс', 0.6], ['Ice', 'лед', 'лёд', 0.7],
        ['Frozen', 'фрозен', 'фрозен', 0.8], ['Frozen', 'фрозен', 'фроза', 1.3], ['Frozen', 'фрозен', 'фроузен', 0.9]];
    for (const [spell, canonical, written, fit] of said) assert.equal(soundTrust({ spell, canonical, written, fit, lips: null }), null, `«${written}» → ${spell}`);
    // the written words (the browser's voice): words inside talk never cast
    for (const t of ['я сам с собой разговариваю', 'найс получилось', 'он заморозил реку', 'сэндвич съел']) assert.equal(spellPhrase(t).ok, false, t);
});

test('«интересно» said to oneself is no Inferno (the author: ran, said it, the fire came); the spell itself still is', async () => {
    const { soundTrust, everydayHeard } = await import('../../src/audio/SpellPhrase.js');
    // the sound only just like «инферно» (7 letters, fit +0.9), the letters the network wrote are the everyday word
    for (const w of ['интересно', 'интересный', 'интересно как', 'нтересно', 'интерьесно', 'интернет', 'информация', 'инфекция']) {
        assert.ok(everydayHeard(w, 'инферно'), `«${w}» is talk`);
        assert.ok(soundTrust({ spell: 'Inferno', canonical: 'инферно', written: w, fit: 0.9, lips: null }), `«${w}» → no Inferno`);
    }
    for (const w of ['инферно', 'инфёрно', 'инферна', 'так инферно']) {
        assert.equal(everydayHeard(w, 'инферно'), null, `«${w}» is the spell`);
        assert.equal(soundTrust({ spell: 'Inferno', canonical: 'инферно', written: w, fit: 0.9, lips: null }), null, `«${w}» → Inferno`);
    }
});

test('the author\'s journal 24.10: a spell from the middle of long speech that surfaces seconds late is not cast; a plain slow spell and «стоп» are', async () => {
    const { lateInSpeech } = await import('../../src/audio/SpellPhrase.js');
    const m = (written, lag) => ({ native: true, to: 10000, written });
    assert.ok(lateInSpeech('Wind', 'вайнд максима', m('валим валим валим валим валим валим что что уене использоват'), 14882));
    assert.ok(lateInSpeech('AvadaKedavra', 'авада кедавра', m('о смотри смотри угу видишь как круто я проиграл абадакида ин'), 17821));
    assert.ok(lateInSpeech('WindMaxima', 'вайнд максима', m('авадакидавра вайнд максима авадакидавра'), 16464));
    assert.equal(lateInSpeech('Lock', 'лок', m('лок'), 12752), null); // (slow, but the phrase is the spell)
    assert.equal(lateInSpeech('Stand', 'стоп', m('так сказал и стоп'), 13228), null);
    assert.equal(lateInSpeech('Wind', 'вайнд максима', m('значит вайнд максима дальше'), 11000), null); // (in time)
    assert.equal(lateInSpeech('Wind', 'вайнд', { native: false, written: 'a b c d e' }, 99999), null);
});
