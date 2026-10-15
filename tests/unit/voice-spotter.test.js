// The spell is found by its sound (SpellSpotter.js) in what the speech network on this computer heard
// (voice_native.py). The fixture holds the network's real output for spells and everyday
// phrases said by two Russian voices; a friend's voice from the speakers never casts (NativeVoice.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, prepare, greedy, hear, VOCAB, encode, threshold, GOES_ON } from '../../src/audio/SpellSpotter.js';
import { lookAt, MORE_WAIT } from '../../src/input/NativeVoice.js';
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

test('a phrase still being said: a spell heard whole casts once — one that may go on («Бомбардо…») only tells the game to wait', () => {
    // «Бомбардо» with a short quiet after it: «Максима» may still come — only «more» (the game waits), then its end casts
    let seg = {};
    const said = [];
    for (let i = 0; i < 2; i++) { const r = lookAt(ev(one('бомбардо'), { final: false }), seg); seg = r.seg; said.push(r.say); }
    assert.equal(said.filter((s) => s && !s.more).length, 0, JSON.stringify(said));
    assert.equal(said.filter((s) => s?.more).length, 1, JSON.stringify(said));
    const end = lookAt(ev(one('бомбардо'), { final: true }), seg);
    assert.equal(end.say?.isFinal, true);
    assert.equal(matchSpell(end.say.text), 'Bombardo');
    // «Инферно»: nothing goes on from it — cast from the first look, once; its end is no second word
    seg = {};
    const casts = [];
    for (let i = 0; i < 2; i++) { const r = lookAt(ev(one('инферно'), { final: false }), seg); seg = r.seg; if (r.say) casts.push(r.say); }
    assert.equal(casts.length, 1, JSON.stringify(casts));
    assert.equal(matchSpell(casts[0].text), 'Inferno');
    assert.equal(lookAt(ev(one('инферно'), { final: true }), seg).say, null);
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

test('talk never casts: a spell is said on its own — a spell\'s word inside a sentence is words to a villager', () => {
    for (const r of talk) {
        const res = lookAt(ev(r, { final: true }), {});
        const cast = res.say && !res.say.talkOnly && matchSpell(res.say.text);
        assert.equal(cast || null, null, `«${r.text}» → ${res.say?.text}`);
    }
    // the spells said alone still cast
    let ok = 0;
    for (const r of spells) {
        const res = lookAt(ev(r, { final: true }), {});
        if (res.say && !res.say.talkOnly && matchSpell(res.say.text) === matchSpell(r.text)) ok++;
    }
    assert.ok(ok / spells.length >= 0.8, `${ok}/${spells.length}`);
});

// ------------------------------------------------------------------ a spell that may go on («Protection… Хаус»)
// The phrase as it grows: looks at its first k rows (every 3 rows = 120 ms, as voice_native.py looks while it
// is said), then — with `quiet` ms of silence after it — more looks, then its end. → the spells cast, in order.
const rowsOf = (r) => Buffer.from(r.lp, 'base64');
function grow(r, quiet = 0) {
    const b = rowsOf(r), last = b.subarray((r.T - 1) * 34);
    const pad = Math.round(quiet / 40);
    const all = Buffer.concat([b, ...Array.from({ length: pad }, () => last)]);
    const T = r.T + pad;
    const casts = [];
    let seg = {};
    const look = (k, final) => {
        const res = lookAt({ type: 'seg', id: 1, T: k, lp: all.subarray(0, k * 34).toString('base64'), far: 0, final }, seg);
        seg = res.seg;
        const s = res.say;
        // (the game: a «more» spell waits; a settled one is as good as the end; the end of a cast one is no second word)
        if (s && !s.more && !s.talkOnly && matchSpell(s.text) && !casts.includes(matchSpell(s.text))) casts.push(matchSpell(s.text));
    };
    for (let k = 8; k <= T; k += 3) look(k, false);
    look(T, true);
    return casts;
}

test('«Protection House» is only Protection House — never a Protection on the way; «Бомбардо Максима» only the Maxima', () => {
    for (const voice of ['irina', 'ruslan']) {
        assert.deepEqual(grow(one('протекшн хаус', voice)), ['ProtectionHouse'], voice);
        assert.deepEqual(grow(one('протекшн хаус', voice), 800), ['ProtectionHouse'], voice);
        assert.deepEqual(grow(one('бомбардо максима', voice), 800), ['BombardoMaxima'], voice);
    }
});

test('«Protection» and then quiet: Protection — after a moment of quiet, before the phrase is over', () => {
    for (const voice of ['irina']) {
        const r = one('протекшн', voice);
        const b = rowsOf(r), last = b.subarray((r.T - 1) * 34);
        let seg = {}, cast = null;
        for (let pad = 0; pad <= 20 && !cast; pad++) {
            const all = Buffer.concat([b, ...Array.from({ length: pad }, () => last)]);
            const res = lookAt({ type: 'seg', id: 1, T: r.T + pad, lp: all.toString('base64'), far: 0, final: false }, seg);
            seg = res.seg;
            if (res.say?.settled) cast = { name: matchSpell(res.say.text), quiet: res.heard.tail };
            else assert.ok(!res.say || res.say.more, JSON.stringify(res.say));
        }
        assert.equal(cast?.name, 'Protection', voice);
        assert.ok(cast.quiet >= MORE_WAIT && cast.quiet < MORE_WAIT + 200, `${cast.quiet} ms`);
        // its end is no second «Protection»
        const all = Buffer.concat([b, ...Array.from({ length: 20 }, () => last)]);
        assert.equal(lookAt({ type: 'seg', id: 1, T: r.T + 20, lp: all.toString('base64'), far: 0, final: true }, seg).say, null);
    }
    // what may go on is found in the spells themselves
    for (const p of ['протекшн', 'протекшн хаус', 'бомбардо', 'люмос', 'вайнд', 'джолт', 'алохомора', 'стенд']) assert.ok(GOES_ON.has(p), p);
    for (const p of ['протекшн хаус максима', 'бомбардо максима', 'инферно', 'экспеллиармус', 'авада кедавра', 'стоп', 'нокс']) assert.ok(!GOES_ON.has(p), p);
});

test('a spell nothing goes on from is cast from the first look that hears it whole', () => {
    for (const text of ['инферно', 'экспеллиармус', 'нокс']) {
        for (const voice of ['irina', 'ruslan']) {
            const r = one(text, voice);
            // (the speaker has stopped: a little quiet after the word)
            const b = rowsOf(r), quiet = Buffer.concat([b, ...Array(8).fill(b.subarray((r.T - 1) * 34))]);
            const res = lookAt({ type: 'seg', id: 1, T: r.T + 8, lp: quiet.toString('base64'), far: 0, final: false }, {});
            assert.equal(matchSpell(res.say?.text), matchSpell(text), `${text} ${voice}: ${JSON.stringify(res.heard.spell?.avg)} tail ${res.heard.tail}`);
            assert.ok(res.say.settled);
        }
    }
});
