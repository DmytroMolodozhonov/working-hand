// duelfast — «последняя буква → заклинание» в бою, без нейросети и без звука.
//
// Настоящие записи голоса (tests/fixtures/voice-spells.json: строки нейросети по 40 мс) идут через тот же путь, что в игре:
// голосовая программа смотрит на ещё не законченную фразу каждые ~80 мс (SEG.partial 70 мс + сама нейросеть), каждый взгляд —
// NativeVoice.lookAt, потом решение страницы (soundTrust) и игры (Game: ждать ли «… Максима»). Конец фразы — после 0,85 с тишины.
// Считается, через сколько мс после последней буквы заклинание сработало бы (+ время нейросети COST), сколько узнано верно,
// сколько раз сработало ДРУГОЕ заклинание и сколько раз обычная речь дала заклинание на взгляде посреди фразы.
//
//   node tools/voicebench/duelfast.mjs [--check] [--v]
//
// Сцены: «тишина» (мирно, колонки молчат), «бой» (дуэль/бой: NativeVoice.duelHot), «бой, колонки» (в колонках звучит дуэль —
// заряды, музыка, крики волшебника: far 0,5 и без копии колонок на этом взгляде).
import fs from 'node:fs';
import { unpack, V, BLANK, SPACE, threshold, prepare } from '../../src/audio/SpellSpotter.js';
import { spellPhrase, soundTrust } from '../../src/audio/SpellPhrase.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const args = process.argv.slice(2);
// (--nv путь — другой NativeVoice.js, например прежний из git: сравнить «было → стало»)
const nvAt = args.indexOf('--nv');
const NV = await import(nvAt >= 0 ? new URL(args[nvAt + 1], 'file://' + process.cwd() + '/').href : '../../src/input/NativeVoice.js');
const CHECK = args.includes('--check'), VERB = args.includes('--v');
const rows = JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/voice-spells.json', import.meta.url), 'utf8'));
const spells = rows.filter((r) => r.kind === 'spell');
const talk = rows.filter((r) => r.kind !== 'spell');

/** Боевые заклинания дуэли (их задержку и меряем). */
export const DUEL_WORDS = new Set(['джолт', 'остолбеней', 'экспеллиармус', 'сапира', 'айс', 'даст', 'бомбардо', 'фрозен', 'акцио', 'авада кедавра', 'джолт максима', 'бомбардо максима']);
const STEP = 2;       // 40-мс шагов между взглядами (70 мс + нейросеть)
const COST = 110;     // мс нейросети на взгляд (журнал автора: 94–135)
const END = 22;       // шагов тишины до конца фразы (0,85 с)
/** Пороги (замер 01.11.2026; только ужесточать). */
export const LIMITS = { fightP50: 260, fightP95: 400, fightLoudP50: 260, fightLoudP95: 420, wrong: 0, talkCast: 2 };

const b64 = (lp) => Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64');
/** Первые k строк записи, дальше — тишина. */
function prefix(r, k) {
    const a = unpack(r.lp, r.T), lp = new Float32Array(k * V);
    lp.set(a.subarray(0, Math.min(k, r.T) * V));
    for (let i = r.T; i < k; i++) for (let v = 0; v < V; v++) lp[i * V + v] = v === BLANK ? 0 : -25;
    return b64(lp);
}

/** Как поступит игра с тем, что отдал взгляд (main.js → Game._castLocalSpell): имя или null. */
const GAME_DUEL_FAST = new Set(['Jolt', 'Sapira', 'Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Disarmor', 'Ice', 'Sands']);
function gameTakes(o, d) {
    const s = o.say;
    if (!s || s.talkOnly) return null;
    const name = matchSpell(s.text);
    if (!name || !spellPhrase(s.text).ok) return null;
    const sp = o.heard.spell;
    if (o.heard.sure && sp && !s.byWords) {
        const fit = sp.avg - threshold(sp.len, d.far || 0, Infinity);
        if (soundTrust({ spell: name, canonical: s.text, written: o.heard.near ?? o.heard.written, fit, len: sp.len, far: d.far || 0, lips: true, combat: !!d.duel, hope: !!d.duel, handAimed: !!d.duel })) return null;
    }
    if (!s.isFinal && !s.settled && s.more && !GAME_DUEL_FAST.has(name) && !s.fightNow) return null;
    return name;
}

/** Одна запись, одна сцена → {name, lag} (lag: мс от последней буквы, null — не сработало). */
function run(r, scene) {
    const full = NV.lookAt({ id: 1, final: true, T: r.T, lp: r.lp, far: 0 }, {});
    const endK = full.heard.spell ? full.heard.spell.b + 1 : r.T;
    // (q: the voice program's speech detector — s of quiet at the look's end. Here: the «nothing» steps at the end of the look,
    // one step late (silero answers per 32 ms); a gap inside a word counts too — stricter than the real detector)
    const am = prepare(unpack(r.lp, r.T), r.T).am;
    let seg = {};
    for (let k = 8; k <= endK + END; k += STEP) {
        const final = k >= endK + END;
        let c = 0;
        for (let j = k - 1; j >= 0 && (j >= r.T || am[j] === BLANK || am[j] === SPACE); j--) c++;
        const d = { id: 1, final, T: k, lp: prefix(r, k), far: scene.far, duel: scene.duel, t1: k * 40, q: Math.max(0, (c - 1) * 0.04) };
        const o = NV.lookAt(d, seg);
        seg = o.seg;
        const name = gameTakes(o, d);
        if (name) return { name, lag: (k - endK) * 40 + COST, k };
        if (final) break;
    }
    return { name: null, lag: null };
}

const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const only = args.indexOf('--scene') >= 0 ? args[args.indexOf('--scene') + 1] : null;
const scenes = [{ id: 'тишина', far: 0, duel: false }, { id: 'бой', far: 0, duel: true }, { id: 'бой, колонки', far: 0.5, duel: true }].filter((s) => !only || s.id === only);
const res = {};
for (const sc of scenes) {
    const lags = [], all = [];
    let ok = 0, wrong = 0, talkCast = 0, n = 0;
    for (const r of spells) {
        const want = matchSpell(r.text);
        const o = run(r, sc);
        const isDuel = DUEL_WORDS.has(r.text);
        if (isDuel) n++;
        if (o.name === want) { ok++; if (isDuel) lags.push(o.lag); all.push(o.lag); }
        else if (o.name && !(NV.FIGHT_UPGRADE?.get?.(o.name) === want)) { wrong++; if (VERB) console.log(`  [${sc.id}] «${r.text}» → ${o.name}`); }
        if (VERB && isDuel) console.log(`  [${sc.id}] «${r.text}» ${o.name || '—'} ${o.lag ?? ''}`);
    }
    for (const r of talk) { const o = run(r, sc); if (o.name) { talkCast++; if (VERB) console.log(`  [${sc.id}] речь «${r.text}» → ${o.name}`); } }
    res[sc.id] = { ok, wrong, talkCast, duelN: n, duelOk: lags.length, p50: pct(lags, 0.5), p95: pct(lags, 0.95), allP50: pct(all, 0.5) };
    console.log(`${sc.id.padEnd(14)} узнано ${ok}/${spells.length}, другое ${wrong}, речь→заклинание ${talkCast}/${talk.length}; боевые ${lags.length}/${n}: последняя буква → каст p50 ${res[sc.id].p50} мс, p95 ${res[sc.id].p95} мс (все: p50 ${res[sc.id].allP50})`);
}
if (CHECK) {
    const f = res['бой'] || {}, l = res['бой, колонки'] || {}, bad = [];
    if (!(f.p50 <= LIMITS.fightP50)) bad.push(`бой p50 ${f.p50} > ${LIMITS.fightP50}`);
    if (!(f.p95 <= LIMITS.fightP95)) bad.push(`бой p95 ${f.p95} > ${LIMITS.fightP95}`);
    if (!(l.p50 <= LIMITS.fightLoudP50)) bad.push(`бой, колонки p50 ${l.p50} > ${LIMITS.fightLoudP50}`);
    if (!(l.p95 <= LIMITS.fightLoudP95)) bad.push(`бой, колонки p95 ${l.p95} > ${LIMITS.fightLoudP95}`);
    for (const s of Object.keys(res)) {
        if (res[s].wrong > LIMITS.wrong) bad.push(`${s}: другое заклинание ${res[s].wrong}`);
        if (res[s].talkCast > LIMITS.talkCast) bad.push(`${s}: речь дала заклинание ${res[s].talkCast}`);
    }
    if (bad.length) { console.log('❌ ' + bad.join('; ')); process.exit(1); }
    console.log('✅ в пределах');
}
