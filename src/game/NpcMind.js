// NpcMind.js — the inner life of a person who can be dealt with (pure; Reaction.js reads and writes it): his character, his mood, what he remembers about
// each person, how he gets used to things. «NPC должен реагировать как человек»: no two people answer alike, nobody forgets at once, nobody is a mirror.
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rand01 = (n) => { let t = (n + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The traits (0…1) of a person: his own, from his id; a role leans them (a knight bolder, a merchant greedier, a wizard prouder, a child shyer). */
export const TRAITS = ['bold', 'kind', 'greedy', 'proud', 'shy', 'wary', 'humor'];
const LEAN = {
    knight: { bold: 0.35, proud: 0.2, shy: -0.3 }, king: { proud: 0.4, bold: 0.2 }, merchant: { greedy: 0.35, wary: 0.2, humor: 0.1 }, seller: { greedy: 0.3, wary: 0.15 },
    farmer: { kind: 0.15, shy: 0.1, wary: 0.1 }, wizard: { proud: 0.3, wary: 0.1, bold: 0.1 }, student: { shy: 0.2, humor: 0.15, bold: -0.1 },
    teacher: { kind: 0.15, proud: 0.15 }, child: { shy: 0.3, humor: 0.2, bold: -0.2 }, builder: { kind: 0.1, bold: 0.1 }, guard: { bold: 0.3, wary: 0.25 }, sailor: { bold: 0.2, humor: 0.2 },
};

export function newMind(id, role = 'farmer') {
    const base = hashStr(String(id));
    const tr = {};
    TRAITS.forEach((t, i) => { tr[t] = Math.max(0, Math.min(1, rand01(base + i * 977) * 0.8 + 0.1 + (LEAN[role]?.[t] || 0))); });
    return { id: String(id), role, seed: base, rc: 0, traits: tr, mood: 0, moodAt: null, bonds: new Map(), recent: [], said: [], memory: [], lastAt: -1e9 };
}

/** A fresh random number for this person (deterministic from his seed and how many he has drawn). */
export const rnd = (m) => rand01(m.seed + (m.rc++) * 7919);

/** What he remembers about one person (by id): gratitude, grudge, trust, deeds counted. */
export function bondOf(m, by) {
    const k = String(by ?? '?');
    let b = m.bonds.get(k);
    if (!b) { b = { gr: 0, gu: 0, tr: 0, n: {}, at: null, favours: 0, wrongs: 0, owed: 0 }; m.bonds.set(k, b); }
    return b;
}

export const HALF = { gr: 900, gu: 2400, mood: 150, trust: 3000 };
const decay = (x, dt, half) => x * Math.pow(0.5, Math.max(0, dt) / half);

/** Time passes: mood returns to calm, gratitude and grudge fade (the grudge slower: people forgive slowly). `now` in seconds. */
export function tick(m, now) {
    const prev = m.moodAt ?? now, dt = now - prev;
    if (dt > 0) {
        m.mood = decay(m.mood, dt, HALF.mood);
        for (const b of m.bonds.values()) { const from = b.at ?? prev; b.gr = decay(b.gr, now - from, HALF.gr); b.gu = decay(b.gu, now - from, HALF.gu); b.at = now; }
    }
    m.moodAt = now;
    if (m.recent.length > 60) m.recent.splice(0, m.recent.length - 60);
}

/** How many times this kind was done by this person to him within `win` seconds (the habit of it). */
export function countRecent(m, by, kind, now, win = 300) {
    let n = 0;
    for (const e of m.recent) if (e.by === String(by) && e.kind === kind && now - e.t <= win) n++;
    return n;
}
export function remember(m, ev, now, out) {
    m.recent.push({ by: String(ev.by ?? '?'), kind: ev.kind, t: now });
    m.memory.push({ by: String(ev.by ?? '?'), kind: ev.kind, t: now, emo: out.emotion, say: out.say || null });
    if (m.memory.length > 40) m.memory.shift();
    m.lastAt = now;
}
