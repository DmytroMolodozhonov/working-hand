/**
 * Legacy.js — what a hero had, left in the body when they die (the author: «Смерть всё убирает
 * полностью. Умер — всё. Игра начинается сначала, но в том же мире… Максимум — игрок найдёт своё
 * умершее тело, заберёт все достижения, всё, что было. И костюм он может спокойно забрать»).
 *
 *  - On death (not in Creative) everything the hero grew is taken off them: the burnt scrolls
 *    (health, strength, flight, the spells they taught), the books' spells, the mana grown with
 *    practice and crystals (and the firsts already counted), the achievements («Высший маг» with
 *    them), the cave map (what they had seen of the caves — CaveMap.js). The things — the suit of the High Mage too — drop at the body (Death.takeEverything).
 *    The hero comes back as new, in the same world. The gods' scrolls' +100 mana cells (the first «Create a
 *    Planet», «Enlarge Planet», «Terraform Planet», «Wingardium Leviosa Super Maxima» — PlanetMagic.js) are
 *    a part of the mana's growth and its list of firsts: they go into the body with it and come back with it
 *    (until then they can be earned again).
 *  - All of it lies in the body (`b.lg`, Death.js): only its owner can take it back — the spell
 *    «Give Me My Power» (the author: 50 mana, learned only from its scroll — the dark-gold ribbon)
 *    cast at their own skeleton (Game._castGiveMyPower). Then it is all theirs again — and it REPLACES
 *    what they have grown since (the author: «Ты возвращаешь свою силу — и у тебя столько, сколько было
 *    при той силе… Забираешь свою силу — и от второй итерации отказываешься. А то так можно обойти игру»):
 *    the mana cells, the firsts, the achievements, the scrolls' health / strength / flight / spells, the
 *    books' spells, the cave map of the new life are dropped, nothing is added up. The things in the hands
 *    and the bag stay. Two deaths, two bodies: each holds the state of its own life (the second one —
 *    what the hero had then, the first body's power too if it was taken back before); whichever body is
 *    taken LAST is what the hero has (taking one replaces the other). That one spell is never lost on
 *    death — else nobody could ever take their power back.
 *  - A body with its owner's legacy never crumbles to dust (it stays as bones) and never goes for
 *    the bodies' limit; golden sparks rise over it near its owner.
 *
 * «Give Me My Power» — on whom / what (CLAUDE.md): only on the caster's own body that holds their
 * legacy. Another player's body, people, creatures, animals, things, ships, the world — it does not
 * work on them (nothing to give back: no power of yours is there). It pushes nobody (Impact: null),
 * holds no concentration (instant). Blasts / fire / «Левиоса» move or leave the body as any body. Multiplayer: the dying player's own computer makes it
 * (the body with `lg` goes to everybody and the host keeps it in the world save); taking it — the
 * owner's computer, then 'dblg' tells everybody the body is empty now.
 */

import { MANA, DUEL_MASTERY } from './Mana.js';

export const LEGACY = {
    GLOW_R: 40, // m: golden sparks over the owner's body when they are this near
    RANGE: 16, // m: «Give Me My Power» reaches the skeleton this far
    CONE: 0.35, // rad: … the hand pointed this close to it
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
        // (the growth holds the gods' +100 cells too; `spells` — the firsts already counted, theirs among them)
        // (and `found`: space and the planets already counted — their +20 / +50 cells are in the growth)
        // (and «дуэльное мастерство»: the duels won, and whom — Mana.masteryWon)
        mana: mana && (mana.growth > 0 || mana.spells?.length || mana.kills?.length || mana.found?.length || mana.mastery > 0) ? { growth: mana.growth || 0, spells: mana.spells || [], kills: mana.kills || [], found: mana.found || [], mastery: mana.mastery || 0, beaten: mana.beaten || [] } : null,
        ach: g.achievements ? [...g.achievements.done] : [],
        caves: g.caveMap?.snapshot() || null, // (the cave map: what the hero knew of the caves — CaveMap.js)
    };
    const empty = !rec.hp && !rec.fatigue && !rec.flight && !rec.spells.length && !rec.learned.length && !rec.mana && !rec.ach.length && !rec.caves;
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
    if (B.spells?.GiveMyPower) g.bonus.spells = { GiveMyPower: true }; // (kept: the one way to take the rest back)
    g.books?.learned?.clear();
    g.caveMap?.clear(); // (the caves are forgotten: the cave map starts empty)
}

/**
 * The hero takes their legacy back: it REPLACES what they grew since the death (nothing is added up —
 * the new life's growth is given up, as on a death; the things stay), then the body's state is put on.
 */
export function absorbLegacy(g, rec) {
    if (!rec) return;
    g.mana?.onDeath();
    g.achievements?.onDeath();
    wipeHero(g); // («Give Me My Power» itself stays)
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
    if (rec.caves) g.caveMap?.merge(rec.caves);
    const M = g.mana;
    if (M && rec.mana) {
        for (const k of rec.mana.spells || []) M.spellsUsed.add(String(k));
        for (const k of rec.mana.kills || []) M.killsMade.add(String(k));
        for (const k of rec.mana.found || []) M.found?.add(String(k));
        M.grow(Math.max(0, Math.min(20000, Number(rec.mana.growth) || 0)), 'legacy'); // (with the gods' +100s: up to 400 of it)
        M.mastery += Math.max(0, Math.min(1e6, Math.floor(Number(rec.mana.mastery) || 0)));
        for (const k of rec.mana.beaten || []) if (M.beaten && M.beaten.size < DUEL_MASTERY.MAX_BEATEN) M.beaten.add(String(k));
    }
    const A = g.achievements;
    let got = 0;
    if (A) for (const k of rec.ach || []) if (A.gain(k, { quiet: true })) got++;
    if (got) A.resend?.();
    if (g.combat) g.combat._hudKey = '';
    if (!g.combat?.enabled) g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount);
    g.hud?.setVoice?.(`💪 <span style="color:#ffd36e">Give Me My Power!</span> Ваша сила вернулась: всё, что было${got ? `, и ачивки (${got})` : ''}`, true);
}
