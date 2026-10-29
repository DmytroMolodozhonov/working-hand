#!/usr/bin/env node
/**
 * voicebench/echoeval.mjs — judges the scenes of echobench.py with the game's own code: the voice (lookAt, spellPhrase,
 * soundTrust — as eval.mjs) and then the friend's-echo guard (src/audio/EchoGuard.js), fed with the same 10 ms levels the game
 * gets (the microphone; the friend's voice as the game plays it / as his game sent it, with its clock's shift and jitter;
 * his own recognized spells, arriving when his game would send them: ~0.35 s after his phrase).
 *   node tools/voicebench/echoeval.mjs [dir] [--check] [--why scene] [--json]
 * Columns: my spells said → recognized; false casts (the friend's voice made the game cast) — without the guard and with it;
 * my own spells the guard let go (must be 0: «голос игрока никогда не отсеивается»); the delay word's end → cast.
 */
import fs from 'node:fs';
import path from 'node:path';
import { threshold } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { spellPhrase, soundTrust, trustedFar } from '../../src/audio/SpellPhrase.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { EchoGuard, decide } from '../../src/audio/EchoGuard.js';

/** The floors (only raised): with the guard, per scene — my spells recognized at least, false casts at most, mine let go at most. */
export const FLOOR_FILE = new URL('./echofloor.json', import.meta.url);

/** A tiny steady random (the clock's jitter per message). */
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** The phrase's candidates as the game takes them (eval.mjs castsOf), each with when its spell was said (ms). */
function candidates(events, why) {
    const segs = new Map(), out = [];
    for (const d of events) {
        if (d.type !== 'seg') continue;
        d.duel = false;
        const r = lookAt(d, segs.get(d.id));
        if (d.final) segs.delete(d.id); else segs.set(d.id, r.seg);
        if (r.echo || !r.say || r.say.talkOnly || r.say.more) continue;
        const text = r.say.text, name = matchSpell(text);
        if (!name) continue;
        if (!spellPhrase(text, { final: !!d.final || !!r.say.settled }).ok) continue;
        const sp = r.heard.spell;
        let fit = null;
        if (r.heard.sure && sp && !r.say.byWords) {
            fit = sp.avg - threshold(sp.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity);
            const no = soundTrust({ spell: name, canonical: text, written: r.heard.near ?? r.heard.written, fit, len: sp.len, far: trustedFar(d, r), running: false, lips: null, hope: false });
            if (no) { why?.push({ t: d.t1 / 1000, no, text }); continue; }
        }
        // (when the spell was said: NativeVoice._when — the look's frames are 40 ms)
        const from = sp ? d.t0 + sp.a * 40 : d.t0, to = sp ? d.t0 + (sp.b + 1) * 40 : d.t1;
        out.push({ name, text, at: d.t1, from, to, seg: d.id, fit, len: sp?.len || 0 });
    }
    return out;
}

export { candidates };
import { clearFit } from '../../src/audio/EchoGuard.js';
export function judgeScene(sc, { guard = true, why = null, cands = null } = {}) {
    const g = new EchoGuard();
    const mic = sc.mic.db, refs = Object.entries(sc.refs || {});
    const jit = rnd(7);
    // the friend's own recognized spells: his phrase in his clock, arriving ~350 ms after its end (his network + ours)
    const shiftNet = sc.refs?.['net:F'] ? Math.abs(sc.refs['net:F'].t0) : 30;
    const dl = sc.truth.discord || 0;
    const words = sc.truth.friend.filter((f) => matchSpell(f.text)).map((f) => {
        const his0 = (f.t0 * 1000 - dl), his1 = (f.t1 * 1000 - dl); // (his time: before Discord's delay)
        return { spell: matchSpell(f.text), from: his0 + shiftNet, to: his1 + shiftNet, arrive: his1 + 350 + shiftNet };
    });
    let fed = 0, lastTrack = 0, wi = 0;
    const feed = (until) => {
        const k1 = Math.min(mic.length, Math.floor(until / 10));
        for (; fed < k1; fed++) {
            const t = fed * 10;
            g.mic(t, mic[fed]);
            for (const [id, r] of refs) {
                // (a copy over the network comes in messages of 20 frames: each message's clock jitters a little)
                if (r.jitter && fed % 20 === 0) r._j = Math.round((jit() - 0.5) * 2 * r.jitter);
                const k = fed - Math.round(Math.abs(r.t0) / 10); // (t0: my time of the copy's first frame — his clock's shift)
                if (k >= 0 && k < r.db.length) g.ref(id, r.kind, t + (r._j || 0), r.db[k]);
            }
            if (t - lastTrack >= 250) { g.track(t); lastTrack = t; }
            while (wi < words.length && words[wi].arrive <= t) { g.friendWord('F', words[wi].spell, words[wi].from, words[wi].to); wi++; }
        }
    };
    if (!cands) cands = candidates(sc.events, why);
    const casts = [], letGo = [];
    let last = null;
    const pending = new Set(), castSeg = new Set();
    const queue = cands.map((c) => ({ ...c, when: c.at + 60 })); // (+60: the look reaches the page)
    for (let q = 0; q < queue.length; q++) {
        const c = queue[q];
        feed(c.when);
        let block = false, wait = 0, w = '';
        if (guard) {
            const j = g.judge(c.from, c.to);
            const said = g.friendSaid(c.name, c.from, c.to);
            const talking = !!g.friendTalking(c.when, 600) || j.verdict === 'mixed';
            const spoke = g.friendSpoke(c.from, c.to);
            const dcs = decide(j, { said, spoke, lips: null, talking, held: !!c.held, clear: clearFit(c.fit, c.len) });
            block = dcs.block; wait = dcs.hold; w = dcs.why;
            why?.push({ t: c.when / 1000, from: c.from, to: c.to, spell: c.name, verdict: j.verdict, share: +j.share.toFixed(2), near: +j.near.toFixed(2), run: j.nearRun, lag: j.lag, sure: j.sure, said, block, wait });
        }
        // (one wait per spell: the later looks of the same phrase join it — main.js holdEcho)
        if (wait) { if (!pending.has(c.name)) { pending.add(c.name); queue.splice(q + 1, 0, { ...c, when: c.when + wait, held: true }); queue.sort((a, b) => a.when - b.when); } continue; }
        if (c.held) pending.delete(c.name);
        else if (pending.has(c.name)) continue;
        if (block) { letGo.push({ name: c.name, t: c.when / 1000, from: c.from, to: c.to, why: w }); continue; }
        const t = c.when / 1000;
        if (last && last.name === c.name && t - last.t < 2.5) continue;
        if (castSeg.has(c.seg + '|' + c.name)) continue; // (a phrase that cast it already: its end, its tail are no new one — main.js afterCast)
        castSeg.add(c.seg + '|' + c.name);
        last = { name: c.name, t };
        casts.push({ name: c.name, t, said: c.to / 1000 });
    }
    // which casts were my spells; the rest are false
    const used = new Set(), rows = [];
    for (const s of sc.truth.spells) {
        const want = matchSpell(s.text);
        const i = casts.findIndex((c, k) => !used.has(k) && c.name === want && c.t >= s.t0 && c.t <= s.t1 + 3);
        if (i >= 0) { used.add(i); rows.push({ text: s.text, ok: true, delay: Math.round((casts[i].t - s.t1) * 1000) }); } else rows.push({ text: s.text, ok: false });
    }
    const mineLet = letGo.filter((l) => sc.truth.spells.some((s) => matchSpell(s.text) === l.name && l.t >= s.t0 && l.t <= s.t1 + 3.5));
    const falseCasts = casts.filter((c, k) => !used.has(k));
    // (a wrong spell while I was saying mine — my own voice misheard, not the friend's: counted apart)
    const mineWrong = falseCasts.filter((c) => sc.truth.spells.some((s) => c.t >= s.t0 && c.t <= s.t1 + 3));
    const fromFriend = falseCasts.filter((c) => !mineWrong.includes(c));
    const delays = rows.filter((r) => r.ok).map((r) => r.delay).sort((a, b) => a - b);
    return {
        scene: sc.scene, said: sc.truth.spells.length, ok: rows.filter((r) => r.ok).length, falseCasts: fromFriend.length, misheard: mineWrong.length,
        falseList: fromFriend.map((c) => `${c.name}@${c.t.toFixed(1)}`), mineLetGo: mineLet.length, mineList: mineLet.map((l) => `${l.name}@${l.t.toFixed(1)} (${l.why})`),
        stopped: letGo.length - mineLet.length, friendSpells: sc.truth.friend.filter((f) => matchSpell(f.text)).length,
        delayP50: delays.length ? delays[Math.floor(delays.length * 0.5)] : null, delayP90: delays.length ? delays[Math.floor(delays.length * 0.9)] : null,
        echoDelay: sc.truth.delay, discord: sc.truth.discord, loopback: !!sc.loopback,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const dir = args.find((a) => !a.startsWith('--') && !/^[a-z]+$/.test(a)) || path.join(process.env.TMPDIR || '/tmp', 'echobench');
    const files = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort();
    const wi = args.indexOf('--why');
    if (wi >= 0) {
        const sc = JSON.parse(fs.readFileSync(path.join(dir, args[wi + 1] + '.json'), 'utf8'));
        const why = [];
        const r = judgeScene(sc, { why });
        for (const w of why) console.log(JSON.stringify(w));
        console.log(JSON.stringify(r, null, 1));
        process.exit(0);
    }
    const order = ['ingame', 'ingamespell', 'discord', 'discordspell', 'noise', 'delay', 'doubletalk'];
    const res = [];
    for (const f of files) {
        const sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const cands = candidates(sc.events);
        res.push({ with: judgeScene(sc, { cands }), without: judgeScene(sc, { guard: false, cands }) });
    }
    res.sort((a, b) => order.indexOf(a.with.scene) - order.indexOf(b.with.scene));
    if (args.includes('--json')) console.log(JSON.stringify(res, null, 1));
    else {
        console.log('сцена         мои  узнано(без→с)  ложных от друга(без→с)  моих отсеяно  задержка 50/90   эхо мс / Discord мс   (неверно услышанные мои: без→с)');
        for (const { with: r, without: o } of res) {
            console.log(`${r.scene.padEnd(13)} ${String(r.said).padStart(3)}   ${String(o.ok).padStart(4)} → ${String(r.ok).padEnd(4)}     ${String(o.falseCasts).padStart(6)} → ${String(r.falseCasts).padEnd(6)}        ${String(r.mineLetGo).padStart(4)}       ${r.delayP50 ?? '-'} / ${r.delayP90 ?? '-'}      ${r.echoDelay} / ${r.discord}   (${o.misheard} → ${r.misheard})${r.falseList.length ? '   лишние: ' + r.falseList.join(' ') : ''}${r.mineList.length ? '   ОТСЕЯНЫ МОИ: ' + r.mineList.join('; ') : ''}`);
        }
        const tot = (k, w = 'with') => res.reduce((s, x) => s + x[w][k], 0);
        console.log(`всего: мои ${tot('said')}, узнано ${tot('ok', 'without')} → ${tot('ok')}, ложных ${tot('falseCasts', 'without')} → ${tot('falseCasts')}, моих отсеяно ${tot('mineLetGo')}`);
    }
    if (args.includes('--check')) {
        const floor = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
        let bad = 0;
        for (const { with: r } of res) {
            const f = floor[r.scene + (r.loopback ? '+loop' : '')]; if (!f) continue;
            if (r.ok < f.ok || r.falseCasts > f.falseCasts || r.mineLetGo > (f.mineLetGo ?? 0)) { console.log('НИЖЕ ПОРОГА:', r.scene, JSON.stringify(f), '→', JSON.stringify({ ok: r.ok, falseCasts: r.falseCasts, mineLetGo: r.mineLetGo })); bad++; }
        }
        process.exit(bad ? 1 : 0);
    }
}
