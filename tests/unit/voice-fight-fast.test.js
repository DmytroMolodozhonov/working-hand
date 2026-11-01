// Бой: заклинание — сразу (жалоба автора: «в дуэли заклинания недостаточно быстро выкидываются»).
// «Бомбардо»/«Фрозен» в бою не ждут «… Максиму» (FIGHT_UPGRADE: Максима следом — усиление), громкие колонки дуэли без друга
// на сервере не задерживают боевое слово до конца фразы (fightClear), строка задержки по этапам — SpellLog.latencyStages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, V, BLANK } from '../../src/audio/SpellSpotter.js';
import { lookAt, FIGHT_UPGRADE } from '../../src/input/NativeVoice.js';
import { afterCast } from '../../src/audio/SpellPhrase.js';
import { latencyStages } from '../../src/core/SpellLog.js';

const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
const b64 = (lp) => Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64');
/** Запись и после неё `quiet` шагов тишины по 40 мс (взгляд на ещё не законченную фразу). */
function withQuiet(r, quiet) {
    const a = unpack(r.lp, r.T), T = r.T + quiet, lp = new Float32Array(T * V);
    lp.set(a);
    for (let k = r.T; k < T; k++) for (let v = 0; v < V; v++) lp[k * V + v] = v === BLANK ? 0 : -25;
    return { T, lp: b64(lp) };
}
/** Первый взгляд посреди фразы, который что-то отдал: {say, quiet}. */
function firstSay(r, d) {
    let seg = {};
    for (let q = 0; q <= 12; q++) {
        const p = withQuiet(r, q);
        const o = lookAt({ id: 1, final: false, T: p.T, lp: p.lp, t1: p.T * 40, ...d }, seg);
        seg = o.seg;
        if (o.say) return { say: o.say, quiet: q, seg };
    }
    return { say: null };
}
const said = (text) => rows.filter((r) => r.kind === 'spell' && r.text === text);

test('бой: «бомбардо» — сразу (settled, fightNow), вне боя — ждёт «… Максиму»', () => {
    let fast = 0, wait = 0;
    for (const r of said('бомбардо')) {
        const f = firstSay(r, { duel: true, far: 0 });
        if (f.say?.settled && f.say.fightNow) fast++;
        const p = firstSay(r, { duel: false, far: 0 });
        if (p.say?.more || (p.say && p.quiet >= f.quiet)) wait++;
    }
    assert.ok(fast >= 1, `в бою «бомбардо» сработало сразу ${fast} из 2`);
    assert.ok(wait >= 1, 'вне боя «бомбардо» по-прежнему ждёт продолжения');
});

test('бой: «… Максима» после «бомбардо», сработавшего сразу, — усиление, а не «уже было»', () => {
    for (const r of said('бомбардо максима')) {
        const o = lookAt({ id: 1, final: true, T: r.T, lp: r.lp, far: 0, duel: true }, { fired: 'бомбардо', settled: true, upSpell: 'Bombardo' });
        if (!o.heard.sure) continue;
        assert.equal(o.say?.upgrade, 'Bombardo');
        // (без быстрого «бомбардо» — прежнее правило: продолжение той же фразы второй раз не колдуется)
        const old = lookAt({ id: 1, final: true, T: r.T, lp: r.lp, far: 0, duel: true }, { fired: 'бомбардо', settled: true });
        assert.equal(old.say, null);
    }
    assert.equal(FIGHT_UPGRADE.get('Frozen'), 'IceMaxima');
});

test('бой, в колонках шум дуэли: боевое слово сразу без друга на сервере; с другом — ждёт сверки с колонками', () => {
    let alone = 0, friend = 0;
    for (const r of [...said('джолт'), ...said('экспеллиармус'), ...said('остолбеней')]) {
        if (firstSay(r, { duel: true, far: 0.5 }).say?.settled) alone++;
        if (firstSay(r, { duel: true, far: 0.5, friends: true }).say?.settled) friend++;
    }
    assert.ok(alone >= 3, `без друга сработало сразу ${alone} из 6`);
    assert.equal(friend, 0, 'с другом на сервере без копии колонок посреди фразы не колдуем');
});

test('afterCast: «… Максима» с пометкой усиления не отсеивается как «продолжение слишком поздно»', () => {
    const last = { spell: 'Bombardo', at: 1000, seg: 7 };
    assert.equal(afterCast(last, 'BombardoMaxima', { native: true, seg: 7, fit: 0.1, upgrade: 'Bombardo' }, 1300), null);
    assert.match(afterCast(last, 'BombardoMaxima', { native: true, seg: 7, fit: 0.1 }, 1300), /слишком поздно/);
});

test('журнал: задержка по этапам', () => {
    const s = latencyStages({ from: 0, to: 600, soundEnd: 700, cost: 110, gameMs: 1.2, lag: 260 });
    assert.match(s, /слово 400 → тишина после слова 100 → нейросеть 110 → доставка 49 → игра 1.2 мс/);
    assert.equal(latencyStages({}), '');
});

// Журнал автора 12:47 (дуэль на арене с главой башни): «сапира» буквами «эпря», «айс» — «эс», «даст» — «ас» отсеяны как
// «короткое заклинание: буквы не похожи — это обычная речь»: игра не считала дуэль на арене боем (Game.inFight), поэтому
// правило боевых слов (губы двигались, громко) не включалось; «Сапира» в списке боевых не было.
import { soundTrust } from '../../src/audio/SpellPhrase.js';
test('дуэль: короткие боевые слова с непохожими буквами — мои, если губы двигались и громко', () => {
    const base = { lips: true, far: 0.3, snr: 24, combat: true, hope: true };
    assert.equal(soundTrust({ ...base, spell: 'Sapira', canonical: 'сапира', written: 'эпря', fit: 0.3 }), null);
    assert.equal(soundTrust({ ...base, spell: 'Ice', canonical: 'айс', written: 'эс', fit: 0.3 }), null);
    assert.equal(soundTrust({ ...base, spell: 'Sands', canonical: 'даст', written: 'ас', fit: 0.3 }), null);
    // (вне боя или без движения губ — как раньше: обычная речь)
    assert.notEqual(soundTrust({ ...base, combat: false, spell: 'Sapira', canonical: 'сапира', written: 'эпря', fit: 0.3 }), null);
    assert.notEqual(soundTrust({ ...base, lips: null, spell: 'Ice', canonical: 'айс', written: 'эс', fit: 0.3 }), null);
});
test('повтор одного слова нейросетью («акцию акцию акцию») — не «разговор»', () => {
    const h = { lips: true, snr: 24, spell: 'Accio', canonical: 'акцио', written: 'акцию акцию акцию акцию', fit: 1.2 };
    assert.doesNotMatch(String(soundTrust(h)), /внутри фразы/);
    assert.match(String(soundTrust({ ...h, written: 'ну давай возьми акцию сейчас' })), /внутри фразы|непохож|не похож|неуверенно/);
});
