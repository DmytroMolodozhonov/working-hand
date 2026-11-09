/**
 * NpcArmor.js — armour of the NPCs is the player's armour (the author 07.11, forever: «жители считаются так же, как игрок — всё то же самое»).
 *
 * Before: castle people and sailors had their own little pool (`v.armor`: soaks the blow to the last point, 20 % leaks; a king 200, a knight 50) and bounced the «simplest
 * magic» by two flags (`v.robe`, `v.magicSet`) with no reserve. Now each armoured NPC WEARS REAL PIECES (ArmorTypes: helmet 10 / chest 20 / legs 10 points, magic ×2 and mending,
 * a magic reserve) and every blow and every spell goes through THE SAME functions the player's Armor.js uses: `wornEffects`, `soakBlow` (cover 20/50/30 %, steel takes 80 %,
 * fire heats through, thunder from above passes plain steel, «Авада» is cut by the reserves), `spellGuard` + `guardSpend` (the robe and the magic set bounce the simplest spells and pay
 * their reserve; a magic robe at 0 falls apart; a plain piece at 0 falls off). `v.armor` / `v.maxArmor` stay as the sum of the pieces' points (the health bars read them).
 *
 * Who wears what (`NPC_GEAR`): a knight — three plain pieces; the king — the whole magic set; an advisor — a magic breastplate and greaves; a ship's captain — helmet and
 * breastplate, a boatswain — a helmet (plain); each wizard — a real plain or magic robe; a magic one rolls its category, reserve and effects as for the player.
 * A wizard's WARD (his `armor` pool by rank: WIZ stats) is magic, not steel: it stays as it is. «Disarmor» / swimming strip the steel (`v.stripped`) — a magic robe stays.
 *
 * What is NOT yet the same (the list the next sessions go through, the rule stays): «Авада Кедавра» on an NPC still kills outright (`pierce`) instead of 25 cut by the
 * reserves; travellers (Travelers.js), the black ship's skeletons and creatures with their own HP models (dragons, titans, the Ice Queen) keep their own armour numbers.
 */
import { PIECES, makePiece, makeRobe, wornEffects, soakBlow, spellGuard, guardSpend, hasMag, magOf, ensureMag, ROBE_TIERS } from './ArmorTypes.js';

/** Who wears what: plain / magic pieces of the three. */
export const NPC_GEAR = {
    knight: { plain: ['helmet', 'chest', 'legs'] },
    king: { magic: ['helmet', 'chest', 'legs'] },
    advisor: { magic: ['chest', 'legs'] },
    captain: { plain: ['helmet', 'chest'] },
    boatswain: { plain: ['helmet'] },
};

const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** A deterministic random for an NPC (the same gear on every computer). */
const rnd = (id) => { let a = hashOf(id) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** What `v` wears: {helmet, chest, legs, robe} (items or null). Built once, kept on `v.worn`; the steel is dropped once `v.stripped`. */
export function npcWorn(v) {
    let w = v.worn;
    if (!w) {
        w = v.worn = { helmet: null, chest: null, legs: null, robe: null };
        const gear = NPC_GEAR[v.role];
        const r = rnd(String(v.id));
        const steelOk = !v.stripped;
        if (gear && steelOk && !v.wizard) {
            for (const p of gear.plain || []) w[p] = makePiece(p, { magic: false }, r);
            for (const p of gear.magic || []) { const it = makePiece(p, { magic: true }, r); if (v.magicReserve != null) it.mag = it.magMax = v.magicReserve; w[p] = it; }
        }
        if ((v.wizard || v.robe) && !v.stripped) w.robe = makeRobe(!!v.robe, r);
        npcSync(v);
    }
    if (v.stripped) for (const p of PIECES) if (w[p]) w[p] = null; // («Disarmor» / the water took the steel; a magic robe stays — it cannot be taken off)
    return w;
}

/** v.armor / v.maxArmor = the pieces' points (the bars). A wizard's ward is not steel: left alone. */
export function npcSync(v) {
    if (v.wizard) return;
    const w = v.worn;
    if (!w) return;
    let hp = 0, max = 0;
    for (const p of PIECES) { const it = w[p]; if (!it) continue; const m = (it.magic ? 2 : 1) * ({ helmet: 10, chest: 20, legs: 10 }[p]); max += m; hp += Math.min(m, it.hp ?? m); }
    if (max > 0 || v.maxArmor) { v.maxArmor = max; v.armor = hp; }
}

/** Does `v` wear anything that matters to a blow (steel pieces, or — for the guard — a robe)? */
export const npcArmored = (v) => !!v && !v.stripped && (PIECES.some((p) => npcWorn(v)[p]) || false);

/**
 * The damage kind of a hit (CastleLife.hit's `opts`) as the armour's rules know it: a spell's name, fire, a blow.
 * (Both «Bombardo» and «Bombardo Maxima» are the blast: kind 'Bombardo' — as for the player, Combat.explosion.)
 */
export function npcKind(opts = {}) {
    const k = opts.kind;
    if (k === 'BombardoMaxima') return 'Bombardo';
    if (opts.fire) return ['Inferno', 'Fire', 'Hellfire', 'fire'].includes(k) ? k : 'fire';
    return k || (opts.weapon ? 'melee' : 'blow');
}

/**
 * A blow of `dmg` on `v`: through the worn pieces exactly as for the player (soakBlow). Returns what reaches his HEALTH;
 * the pieces lose their points (a plain one at 0 falls off), the reserves are spent (Avada), `armor` / `maxArmor` follow.
 */
export function npcSoak(v, dmg, kind, r = Math.random) {
    const w = npcWorn(v);
    if (!PIECES.some((p) => w[p]) && !w.robe) return dmg;
    const fx = wornEffects(w);
    const res = soakBlow(w, fx, dmg, kind, r);
    for (const [slot, n] of Object.entries(res.wear || {})) {
        const it = w[slot];
        if (!it) continue;
        it.hp = Math.max(0, (it.hp ?? 0) - n);
        if (it.hp <= 0 && !it.magic) w[slot] = null; // (beaten to nothing: it falls apart)
    }
    if (res.mag) spendMag(w, res.mag);
    npcSync(v);
    return res.hp;
}

/** Reserve off the worn things ({slot: n}); a magic robe at 0 falls apart, a piece at 0 stays on and turns nothing. */
function spendMag(w, spent) {
    for (const [slot, n] of Object.entries(spent)) {
        const it = w[slot];
        if (!hasMag(it)) continue;
        it.mag = Math.max(0, Math.round((magOf(it) - n) * 100) / 100);
        if (it.mag <= 0 && slot === 'robe' && !it.named) w.robe = null;
    }
}

/**
 * A spell reaches `v`: does it do nothing (the magic set / the robe turn it away — and pay for it with their reserve)? → {block, why} | {block: false, mult}.
 * `cost`: the spell's own mana (as Armor._payGuard: twice the half the shield pays — the caller gives it).
 */
export function npcGuard(v, spell, cost = 10) {
    const w = npcWorn(v);
    if (!w.robe && !PIECES.some((p) => w[p])) return { block: false, mult: 1 };
    const fx = wornEffects(w);
    const r = spellGuard(fx, spell);
    if (r.block && r.why !== 'perk' && cost > 0) { const { spent } = guardSpend(w, fx, spell, cost); spendMag(w, spent); }
    return r;
}

/** Magic pieces mend by themselves (ARMOR.REGEN points a second each) — as the player's. */
export function npcRegen(v, dt) {
    const w = v.worn;
    if (!w || v.stripped) return;
    let changed = false;
    for (const p of PIECES) {
        const it = w[p];
        if (!it || !it.magic) continue;
        const max = 2 * ({ helmet: 10, chest: 20, legs: 10 }[p]);
        if ((it.hp ?? max) < max) { it.hp = Math.min(max, (it.hp ?? 0) + 0.1 * dt); changed = true; }
    }
    if (changed) npcSync(v);
}

export { ensureMag, ROBE_TIERS };
