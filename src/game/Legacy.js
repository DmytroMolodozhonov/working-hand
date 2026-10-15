/**
 * Legacy.js — what a hero had, left in the body when they die (the author: «Смерть всё убирает
 * полностью. Умер — всё. Игра начинается сначала, но в том же мире… Максимум — игрок найдёт своё
 * умершее тело, заберёт все достижения, всё, что было. И костюм он может спокойно забрать»).
 *
 *  - On death (not in Creative) everything the hero grew is taken off them: the burnt scrolls
 *    (health, strength, flight, the spells they taught), the books' spells, the mana grown with
 *    practice and crystals (and the firsts already counted), the achievements («Высший маг» with
 *    them). The things — the suit of the High Mage too — drop at the body (Death.takeEverything).
 *    The hero comes back as new, in the same world.
 *  - All of it lies in the body (`b.lg`, Death.js): only its owner can take it back — a hand that
 *    closes on their own body (or «Gather» pointed at it). Then it is all theirs again, added to
 *    what they have grown since (two deaths: two bodies, each gives back its own).
 *  - A body with its owner's legacy never crumbles to dust (it stays as bones) and never goes for
 *    the bodies' limit; golden sparks rise over it near its owner.
 *
 * Who / what (CLAUDE.md): only the hero who died takes it (other players, people, creatures,
 * spells — nothing: «Gather» of another player only moves things, not the legacy); blasts / fire /
 * «Левиоса» move or leave the body as any. Multiplayer: the dying player's own computer makes it
 * (the body with `lg` goes to everybody and the host keeps it in the world save); taking it — the
 * owner's computer, then 'dblg' tells everybody the body is empty now.
 */

import { MANA } from './Mana.js';

export const LEGACY = {
    TOUCH: 1.5, // m from the body's middle a closing hand takes the legacy
    GLOW_R: 40, // m: golden sparks over the owner's body when they are this near
};

/** Who I am for my legacy (the lasting player id; a single player — 'me'). */
export function legacyOwner(g) {
    return String(g.net?.pid || 'me');
}

/** Everything the hero grew (or null: nothing). */
export function captureLegacy(g) {
    const B = g.bonus || {};
    const mana = g.mana?.snapshot?.() || null;
    const rec = {
        owner: legacyOwner(g),
        hp: Math.max(0, B.hp || 0),
        fatigue: Math.max(0, B.fatigue || 0),
        flight: !!B.flight,
        spells: Object.keys(B.spells || {}).filter((k) => B.spells[k]),
        learned: g.books ? [...g.books.learned] : [],
        mana: mana && (mana.growth > 0 || mana.spells?.length || mana.kills?.length) ? { growth: mana.growth || 0, spells: mana.spells || [], kills: mana.kills || [] } : null,
        ach: g.achievements ? [...g.achievements.done] : [],
    };
    const empty = !rec.hp && !rec.fatigue && !rec.flight && !rec.spells.length && !rec.learned.length && !rec.mana && !rec.ach.length;
    return empty ? null : rec;
}

/**
 * Death: the scrolls' health / strength / flight / spells and the books' spells are taken off
 * (Mana.onDeath and Achievements.onDeath take the rest).
 */
export function wipeHero(g) {
    const B = g.bonus || {};
    const c = g.combat;
    if (B.hp > 0) {
        g.maxHP = Math.max(1, (g.maxHP || 20) - B.hp);
        if (c?.enabled) { c.maxHp = Math.max(1, (c.maxHp || g.maxHP) - B.hp); c.hp = Math.min(c.hp, c.maxHp); }
        g.playerHP = Math.min(g.playerHP, g.maxHP);
    }
    if (B.fatigue > 0 && c) {
        c.maxFatigue = Math.max(MANA.BASE, (c.maxFatigue || MANA.BASE) - B.fatigue);
        c.fatigue = Math.min(c.fatigue, c.maxFatigue);
        c._hudKey = '';
    }
    g.bonus = { hp: 0, fatigue: 0 };
    g.books?.learned?.clear();
}

/** The hero takes their legacy back: all of it added to what they have now. */
export function absorbLegacy(g, rec) {
    if (!rec) return;
    const B = (g.bonus = g.bonus || { hp: 0, fatigue: 0 });
    B.hp = B.hp || 0; B.fatigue = B.fatigue || 0;
    if (rec.hp > 0) {
        B.hp += rec.hp;
        g.maxHP += rec.hp;
        g.playerHP += rec.hp;
        if (g.combat?.enabled) { g.combat.addMaxHp(rec.hp); g.maxHP = g.combat.maxHp; g.playerHP = g.combat.hp; }
    }
    if (rec.fatigue > 0) { B.fatigue += rec.fatigue; g.combat?.addMaxFatigue?.(rec.fatigue); }
    if (rec.flight) B.flight = true;
    if (rec.spells?.length) B.spells = { ...(B.spells || {}), ...Object.fromEntries(rec.spells.map((k) => [k, true])) };
    for (const k of rec.learned || []) g.books?.learned?.add(k);
    const M = g.mana;
    if (M && rec.mana) {
        for (const k of rec.mana.spells || []) M.spellsUsed.add(String(k));
        for (const k of rec.mana.kills || []) M.killsMade.add(String(k));
        M.grow(Math.max(0, Math.min(10000, Number(rec.mana.growth) || 0)), 'legacy');
    }
    const A = g.achievements;
    let got = 0;
    if (A) for (const k of rec.ach || []) if (A.gain(k, { quiet: true })) got++;
    if (got) A.resend?.();
    if (g.combat) g.combat._hudKey = '';
    if (!g.combat?.enabled) g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount);
    g.hud?.setVoice?.(`✨ Вы забрали из своего тела всё, что было${got ? ` — и ачивки (${got})` : ''}`, true);
}
