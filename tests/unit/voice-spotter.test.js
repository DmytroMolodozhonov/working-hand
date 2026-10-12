// The spell is found by its sound (SpellSpotter.js) in what the speech network on this computer heard
// (voice_native.py, GigaAM v3). The fixture holds the network's real output for spells and everyday
// phrases said by two Russian voices; a friend's voice from the speakers never casts (NativeVoice.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, prepare, greedy, hear, VOCAB, encode, threshold } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
const spells = rows.filter((r) => r.kind === 'spell');
const talk = rows.filter((r) => r.kind === 'talk');
const frags = rows.filter((r) => r.kind === 'frag');

test('every way of saying a spell is a spell the game knows (and its «Максима» where it has one)', () => {
    assert.ok(VOCAB.length > 120, `${VOCAB.length}`);
    for (const w of VOCAB) {
        assert.ok(w.spell, `«${w.canonical}» is no spell`);
        assert.equal(matchSpell(w.canonical), w.spell);
        assert.ok(w.toks.length > 0);
    }
    const spellsKnown = new Set(VOCAB.map((w) => w.spell));
    for (const s of ['Bombardo', 'BombardoMaxima', 'Hellfire', 'ProtectionHouse', 'AvadaKedavra', 'Alohomora', 'AlohomoraMaxima', 'Up', 'Jolt', 'JoltMaxima', 'Firefighting', 'WaterVortex', 'Levitation', 'Accio', 'Lumos', 'Nox', 'Stand']) {
        assert.ok(spellsKnown.has(s), s);
    }
    assert.deepEqual(encode('Ёлка м'), encode('елка м'));
});

test('spells said aloud: most are found by their sound — far more than from the written words — and almost never the wrong one', () => {
    let ok = 0, wrong = 0, oldOk = 0;
    for (const r of spells) {
        const h = hear(unpack(r.lp, r.T), r.T);
        const want = matchSpell(r.text);
        const got = h.sure ? matchSpell(h.text) : null;
        if (got === want) ok++; else if (got) wrong++;
        if (matchSpell(h.written) === want) oldOk++;
    }
    const n = spells.length;
    assert.ok(ok / n >= 0.8, `found ${ok}/${n}`);
    assert.ok(ok > oldOk * 1.6, `found ${ok}, the written words found ${oldOk}`);
    assert.ok(wrong / n <= 0.02, `wrong ${wrong}/${n}`);
});

test('everyday talk is never a spell, nor is a piece of a phrase still being said («…сундук» is no «Санд»)', () => {
    for (const r of talk) {
        const h = hear(unpack(r.lp, r.T), r.T);
        assert.equal(h.sure, false, `«${r.text}» → ${h.spell?.phrase} ${h.spell?.avg}`);
    }
    for (const r of frags) {
        const h = hear(unpack(r.lp, r.T), r.T, { final: false, cut: true });
        assert.equal(h.sure, false, `piece of «${r.text}» → ${h.spell?.phrase} ${h.spell?.avg}`);
    }
});

test('the written words still come for talking to villagers', () => {
    const r = talk.find((x) => x.text === 'сколько стоит хлеб') || talk[0];
    const P = prepare(unpack(r.lp, r.T), r.T);
    const words = greedy(P);
    assert.ok(words.length > 5 && /[а-я]/.test(words), words);
});

test('short words must fit better; while the speakers play, better still', () => {
    assert.ok(threshold(2) > threshold(5) && threshold(5) > threshold(9));
    assert.ok(threshold(4, 0.5) > threshold(4, 0) && threshold(9, 0.5) > threshold(9, 0));
});

const one = (text, voice = 'irina') => spells.find((r) => r.text === text && r.voice === voice);
const ev = (r, extra = {}) => ({ type: 'seg', id: 1, T: r.T, lp: r.lp, far: 0, ...extra });

test('a phrase still being said casts after two looks agree (or one very clear one); its end does not cast twice', () => {
    const r = one('бомбардо');
    let seg = {};
    // (unclear first look: only remembered)
    const first = lookAt(ev(r, { final: false }), seg);
    seg = first.seg;
    const said = [first.say];
    const second = lookAt(ev(r, { final: false }), seg);
    said.push(second.say);
    seg = second.seg;
    const end = lookAt(ev(r, { final: true }), seg);
    const casts = said.filter((s) => s && !s.isFinal);
    assert.equal(casts.length, 1, JSON.stringify(said));
    assert.equal(matchSpell(casts[0].text), 'Bombardo');
    // the end still says it (final): the game itself knows it was cast from the unfinished phrase
    assert.equal(end.say?.isFinal, true);
    assert.equal(matchSpell(end.say.text), 'Bombardo');
});

test('a friend\'s spell from the speakers: heard in the speakers\' sound too → an echo, never cast', () => {
    const mine = one('бомбардо', 'irina');
    const friend = one('бомбардо', 'ruslan');
    const other = one('авада кедавра', 'ruslan');
    // the same spell is in what the speakers played: an echo
    const echo = lookAt(ev(mine, { final: true, far: 0.9, ref: friend.lp, refT: friend.T }), {});
    assert.equal(echo.say, null);
    assert.ok(echo.echo);
    // the speakers played another spell meanwhile (a duel: both cast at once): mine is mine
    const duel = lookAt(ev(mine, { final: true, far: 0.9, ref: other.lp, refT: other.T }), {});
    assert.equal(duel.echo, null);
    assert.equal(matchSpell(duel.say?.text), 'Bombardo');
    // the same spell, heard by the microphone just after the speakers played it: their echo
    const after = lookAt(ev(mine, { final: true, far: 0.9, ref: friend.lp, refT: friend.T, refLead: 0.1 }), {});
    assert.ok(after.echo, 'heard 0.1 s after the speakers');
    // the same spell said at another moment (both cast it in a duel; a friend in headphones): mine
    const apart = lookAt(ev(mine, { final: true, far: 0.9, ref: friend.lp, refT: friend.T, refLead: 1.5 }), {});
    assert.equal(apart.echo, null);
    assert.equal(matchSpell(apart.say?.text), 'Bombardo');
    // while the speakers play, a look at an unfinished phrase without their sound never casts
    const early = lookAt(ev(mine, { final: false, far: 0.9 }), { last: 'бомбардо' });
    assert.equal(early.say, null);
});
