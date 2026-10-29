#!/usr/bin/env node
/**
 * voicebench/eval.mjs — judges the scenes made by bench.py with the game's own code (the sound spotter, lookAt, the page's checks).
 *   node tools/voicebench/eval.mjs [dir] [--json] [--check]
 * Per scene: spells said → recognized (a cast of the very spell within 3 s of the word's end), wrong/false casts (any other cast: the
 * friend's talk or his spell words made the game cast), the delay from the word's end to the cast (ms: the look's own time, not the
 * network's compute). `--check` fails when the floors in FLOOR are not met (they only go up).
 */
import fs from 'node:fs';
import path from 'node:path';
import { threshold } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { spellPhrase, soundTrust } from '../../src/audio/SpellPhrase.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

export const FLOOR = {}; // (filled by --check from tools/voicebench/floor.json)

/** The casts a scene's events give, as the game takes them (NativeVoice → the page's checks). */
import { trustedFar } from '../../src/audio/SpellPhrase.js';

export function castsOf(events, { duel = false, why = null } = {}) {
    const segs = new Map(), out = [];
    let last = null;
    for (const d of events) {
        if (d.type !== 'seg') continue;
        d.duel = duel;
        const r = lookAt(d, segs.get(d.id));
        if (d.final) segs.delete(d.id); else segs.set(d.id, r.seg);
        if (why && r.say) why.push({ t: d.t1 / 1000, seg: d.id, say: r.say.text, flags: `${r.say.more ? 'more ' : ''}${r.say.talkOnly ? 'talkOnly ' : ''}${r.say.settled ? 'settled' : ''}`, far: d.far, written: r.heard.written });
        if (r.echo || !r.say || r.say.talkOnly || r.say.more) continue; // (more: the page waits for «… Максима» — no cast yet)
        const text = r.say.text, name = matchSpell(text);
        if (!name) { why?.push({ t: d.t1 / 1000, no: 'не заклинание' }); continue; }
        if (!spellPhrase(text, { final: !!d.final || !!r.say.settled }).ok) { why?.push({ t: d.t1 / 1000, no: 'фраза: ' + spellPhrase(text, { final: true }).why, text }); continue; }
        const sp = r.heard.spell;
        if (r.heard.sure && sp && !r.say.byWords) {
            const fit = sp.avg - threshold(sp.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity);
            const no = soundTrust({ spell: name, canonical: text, written: r.heard.near ?? r.heard.written, fit, len: sp.len, far: trustedFar(d, r), running: false, lips: null, hope: duel });
            if (no) { why?.push({ t: d.t1 / 1000, no, text }); continue; }
        }
        const t = d.t1 / 1000;
        if (last && last.name === name && t - last.t < 2.5) continue; // (the same phrase's tail / echo: no second cast)
        last = { name, t };
        out.push({ name, t, seg: d.id, far: d.far, src: d.src });
    }
    return out;
}

export function judge(scene, why = null) {
    const casts = castsOf(scene.events, { why });
    const used = new Set();
    const rows = [];
    // (the duel: the friend says the same spells close to mine — a cast is his echo when his phrase ended nearer before it than mine)
    const friendSpells = scene.scene === 'duel' ? (scene.truth.friend || []) : [];
    const endBefore = (list, t) => Math.max(-Infinity, ...list.filter((s) => s.t1 <= t + 0.05).map((s) => s.t1));
    const hisEcho = (c) => friendSpells.length && endBefore(friendSpells, c.t) > endBefore(scene.truth.spells, c.t);
    for (const s of scene.truth.spells) {
        const want = matchSpell(s.text);
        const i = casts.findIndex((c, k) => !used.has(k) && c.name === want && c.t >= s.t0 && c.t <= s.t1 + 3 && !hisEcho(c));
        if (i >= 0) { used.add(i); rows.push({ text: s.text, ok: true, delay: Math.round((casts[i].t - s.t1) * 1000) }); } else rows.push({ text: s.text, ok: false });
    }
    // every other cast is false: a spell nobody said (the friend's talk, his spell words, an echo), or the wrong one
    const falseCasts = casts.filter((c, k) => !used.has(k));
    const delays = rows.filter((r) => r.ok).map((r) => r.delay).sort((a, b) => a - b);
    return {
        scene: scene.scene, said: scene.truth.spells.length, ok: rows.filter((r) => r.ok).length, falseCasts: falseCasts.length,
        falseList: falseCasts.map((c) => `${c.name}@${c.t.toFixed(1)}`), missed: rows.filter((r) => !r.ok).map((r) => r.text),
        delayP50: delays.length ? delays[Math.floor(delays.length * 0.5)] : null, delayP90: delays.length ? delays[Math.floor(delays.length * 0.9)] : null,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const dir = args.find((a) => !a.startsWith('--')) || path.join(process.env.TMPDIR || '/tmp', 'voicebench');
    if (args.includes('--why')) {
        const f = args.find((a) => a.endsWith('.json'));
        const sc = JSON.parse(fs.readFileSync(f, 'utf8')), why = [], r = judge(sc, why);
        for (const s of sc.truth.spells) if (r.missed.includes(s.text)) { console.log('ПРОПУЩЕНО', s.text, s.t0.toFixed(1)); for (const w of why.filter((x) => x.t >= s.t0 && x.t <= s.t1 + 3.5)) console.log('   ', JSON.stringify(w)); }
        process.exit(0);
    }
    const res = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) res.push(judge(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
    const order = ['clean', 'chat', 'overlap', 'loud', 'friendspell', 'ship', 'duel'];
    res.sort((a, b) => order.indexOf(a.scene) - order.indexOf(b.scene));
    if (args.includes('--json')) console.log(JSON.stringify(res, null, 1));
    else {
        console.log('сцена        сказано  узнано  лишних  задержка мс (50% / 90%)');
        for (const r of res) console.log(`${r.scene.padEnd(12)} ${String(r.said).padStart(6)}  ${String(r.ok).padStart(6)}  ${String(r.falseCasts).padStart(6)}  ${r.delayP50 ?? '-'} / ${r.delayP90 ?? '-'}${r.falseList.length ? '   лишние: ' + r.falseList.join(' ') : ''}${r.missed.length ? '   пропущены: ' + r.missed.join(', ') : ''}`);
    }
    if (args.includes('--check')) {
        const floor = JSON.parse(fs.readFileSync(new URL('./floor.json', import.meta.url), 'utf8'));
        let bad = 0;
        for (const r of res) {
            const f = floor[r.scene]; if (!f) continue;
            if (r.ok < f.ok || r.falseCasts > f.falseCasts || (f.delayP90 && r.delayP90 > f.delayP90)) { console.log('НИЖЕ ПОРОГА:', r.scene, JSON.stringify(f)); bad++; }
        }
        process.exit(bad ? 1 : 0);
    }
}
