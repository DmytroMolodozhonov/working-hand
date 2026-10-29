/**
 * HeldBreak.js — «Liquidation» on what a humanoid HOLDS (the author: «Liquidation Maxima работает против ЛЮБОГО
 * оружия, даже если оно в руке — даже против Чёрных Усов. Обычный Liquidation уничтожает НЕМАГИЧЕСКИЙ предмет,
 * даже в руках… Если предмет магический — нужен Liquidation Maxima, тоже прямо в руках. Приоритет: та рука, в
 * которой человек держит предмет; если там ничего нет — предмет в противоположной руке»).
 *
 * One rule for everybody who has hands: a player (me, and a guest on his own computer), a knight, the king, a
 * wizard, a sailor, Captain Black Moustache, a skeleton, a builder, a farmer… The «hand slots» of a creature are
 * listed in order of priority — the main (sword / wand) hand first, then the other (a knight's shield) — and the
 * FIRST hand that holds anything is the target (an empty main hand: the other one). What the target is decides:
 *   plain  «Liquidation»        → a thing that is not magic: it crumbles in the hand; a magic one — the lump
 *                                 breaks on it (the caster is told: «нужна Максима»)
 *   «Liquidation Максима»       → any thing, magic too (a wand, a king's sword, the captain's rapier)
 *   a gift of the gods          → neither (godGift); an arena wand won from a wizard — neither (the steward's)
 * The duel charges (Duel.js: LiquidationDuel / LiquidationMaximaDuel) use the same rule; and the loser of a
 * «Liquidation Maxima» duel loses his WAND first (`wandFirst`) — only the Maxima takes a wand.
 *
 * Pure rules at the top (tests/unit/held-break.test.js); the game parts below take `game`.
 */

import { isMagicItem, isGodGift } from './ItemTypes.js';
import { WAND_TOOLS } from './Expelliarmus.js';

/** Things that are magic by their kind (the plain splash cannot take them; the Maxima can). */
export const MAGIC_KINDS = new Set(['wand', 'hammer', 'iceRod', 'book', 'scroll', 'potion', 'crystal', 'dragonEgg', 'phoenixFeather', 'owlFeather', 'telewilpinLeaf', 'carnivoreHead', 'brightCore']);
export function liquidationNeedsMaxima(it) {
    if (!it) return false;
    return isMagicItem(it) || MAGIC_KINDS.has(it.kind);
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md): what the splash / the duel charge does to the thing in a hand.
 */
export const HELD_TARGETS = {
    players: { does: 'break', why: 'игрок (я; гость — на своём компьютере, он сам решает о своих руках): вещь в руке (основная рука, иначе другая) рассыпается; волшебное — только «Максима»' },
    knights: { does: 'break', why: 'рыцарь: меч в руке (немагический) рассыпается, дальше бьёт кулаками; щит в другой руке — если меча нет' },
    king: { does: 'break', why: 'король: его меч волшебный (+25) — только «Максима»; щит обычный' },
    wizards: { does: 'break', why: 'волшебник: палочка волшебная — ЕЁ берёт только «Максима»; без палочки — нечего брать' },
    sailors: { does: 'break', why: 'моряк: сабля, топор, пистолет в руке рассыпаются (немагические), без них бьёт кулаками' },
    blackbeard: { does: 'break', why: 'капитан Чёрные Усы: шпага проклята (волшебная) — только «Максима»' },
    skeletons: { does: 'break', why: 'скелет: сабля/топор/пистолет — немагические, берёт и простой; без оружия бьёт кулаками' },
    workers: { does: 'break', why: 'житель с орудием (мотыга, вилы, молот строителя, ведро…) — немагическое, рассыпается' },
    zombies: { does: 'none', why: 'в руках у зомби ничего нет' },
    animals: { does: 'none', why: 'у зверей нет рук' },
    nonHumanoid: { does: 'none', why: 'пауки, драконы, деревья, птицы-книги, совы, горгульи, снеговики, ледяные монстры, Ледяная Королева: рук с вещами нет (Жезл Королевы — дар богов)' },
    godGifts: { does: 'none', why: 'дар богов в руке (Ледяной Жезл) — не действует даже «Максима»' },
    arenaWand: { does: 'none', why: 'палочка с арены — не теряется: распорядитель вернёт её (её и так заберёт следующая дуэль)' },
    carried: { does: 'break', why: 'существо в лапах горгульи держит вещь как обычно — правило то же' },
};

/** The kind of a tool in a villager's hand → what it is: {kind: 'wand' | 'weapon' | 'tool', magic}. */
const WEAPON_TOOLS = new Set(['sword', 'bigsword', 'rapier', 'cutlass', 'axe', 'longbow', 'pistol']);
export function toolSlot(c) {
    const kind = c?.model?.toolKind;
    if (!kind || kind === 'none') return null;
    if (WAND_TOOLS.has(kind)) return c.noWand ? null : { hand: 'right', src: 'tool', kind: 'wand', tool: kind, magic: true };
    if (WEAPON_TOOLS.has(kind)) {
        if (c.disarmed) return null;
        return { hand: 'right', src: 'tool', kind: 'weapon', tool: kind, magic: c.role === 'king' || c.role === 'blackbeard' }; // (the king's sword +25; the captain's rapier is cursed)
    }
    return { hand: 'right', src: 'tool', kind: 'tool', tool: kind, magic: false };
}

/** A knight's / king's shield on the left arm (while it has not been crumbled). */
export function shieldSlot(c) {
    const s = c?.model?.shield;
    if (!s || c.shieldGone || s.visible === false) return null;
    return { hand: 'left', src: 'shield', kind: 'shield', magic: false };
}

/** The hand slots of a villager-like creature in the order of priority (main hand first). */
export function creatureSlots(c) {
    return [toolSlot(c), shieldSlot(c)].filter(Boolean);
}

/** The target: the first hand (in the order given) that holds anything. → slot | null */
export function pickHeld(slots) {
    for (const s of slots || []) if (s) return s;
    return null;
}

/**
 * What the spell does to a slot: {act: 'break'} | {act: 'no', code, why}.
 * `max` — the Maxima. The caster is told `why`.
 */
export function slotVerdict(slot, max) {
    if (!slot) return { act: 'no', code: 'empty', why: '' };
    if (slot.godGift) return { act: 'no', code: 'god', why: '✨ Это дар богов — никакое заклинание его не уничтожит' };
    if (slot.arena) return { act: 'no', code: 'arena', why: '🏟️ Палочка арены под защитой распорядителя' };
    if (slot.magic && !max) return { act: 'no', code: 'magic', why: '✨ Эта вещь волшебная — её возьмёт только «Liquidation Максима»' };
    return { act: 'break' };
}

/**
 * Which slot a charge takes. `wandFirst` (the duel's «Liquidation Максима»: the loser's WAND goes): a wand in any hand
 * is the target if the charge is the Maxima; otherwise the priority rule.
 */
export function chooseSlot(slots, max, wandFirst = false) {
    const list = (slots || []).filter(Boolean);
    if (wandFirst && max) { const w = list.find((s) => s.kind === 'wand'); if (w) return w; }
    return pickHeld(list);
}

/** What a duel charge does about hands: the plain one — a non-magic thing; the Maxima — the wand first, then anything. */
export const duelBreaks = (spell) => ({ max: spell === 'LiquidationMaximaDuel', wandFirst: spell === 'LiquidationMaximaDuel' });
export const isLiquidationDuel = (spell) => spell === 'LiquidationDuel' || spell === 'LiquidationMaximaDuel';

// ------------------------------------------------------------------ the game parts

const NAMES = { wand: 'палочка', weapon: 'оружие', shield: 'щит', tool: 'вещь', item: 'вещь' };
export const labelOf = (slot) => NAMES[slot?.kind] || 'вещь';

/** My hands, main (dominant) one first: slots with a way to take the thing away. */
export function mySlots(g) {
    const main = g.dom === 'left' ? 'left' : 'right';
    const out = [];
    for (const side of [main, main === 'right' ? 'left' : 'right']) {
        const w = g.weapons?.hands?.[side]?.held;
        if (w && !w.stuckIn) { out.push({ hand: side, src: 'weapon', kind: 'weapon', magic: !!w.magic, godGift: !!w.godGift, w }); continue; }
        const it = g.items?.held?.[side]?.item;
        if (it) out.push({ hand: side, src: 'item', kind: it.kind === 'wand' ? 'wand' : it.kind === 'shield' ? 'shield' : 'item', magic: liquidationNeedsMaxima(it), godGift: isGodGift(it), arena: !!it.arenaWand, item: it });
    }
    return out;
}

/**
 * The charge reached ME: the thing in my hand crumbles (or not). → {out: 'wand'|'weapon'|'shield'|'item'|null, why}
 * `out` null: nothing was destroyed (`why` — what to tell: empty hands say nothing was held).
 */
export function breakMyHeld(g, { max = false, wandFirst = false } = {}) {
    const slot = chooseSlot(mySlots(g), max, wandFirst);
    if (!slot) return { out: null, why: '' };
    const v = slotVerdict(slot, max);
    if (v.act !== 'break') return { out: null, why: v.why, slot };
    if (slot.src === 'weapon') {
        const ws = g.weapons;
        ws.release(slot.hand);
        if (ws.byId?.has(slot.w.id) || ws.weapons?.includes?.(slot.w)) { ws.remove(slot.w); g.sync?.weaponGone?.(slot.w); }
    } else {
        if (slot.kind === 'wand') {
            if (g.wandMagic?.light) g.wandMagic._nox?.(false); // (Lumos goes out with the wand)
            if (g.inventory && g.inventory.ownWand === slot.item.uid) g.inventory.ownWand = null; // (it is gone: nothing to look for)
        }
        g.items.releaseHand(slot.hand);
        if (g.inventory?.inHand?.item === slot.item) g.inventory.inHand = null;
    }
    return { out: slot.kind, slot, why: '' };
}

/**
 * (the host) The charge reached a creature with hands (a castle person, a sailor, a skeleton, the captain).
 * → {out, slot, why} as above. `fist`: what the creature fights with now — set on the creature (`disarmed` / `noWand`).
 */
export function breakCreatureHeld(g, c, { max = false, wandFirst = false } = {}) {
    const slot = chooseSlot(creatureSlots(c), max, wandFirst);
    if (!slot) return { out: null, why: '' };
    const v = slotVerdict(slot, max);
    if (v.act !== 'break') return { out: null, why: v.why, slot };
    const m = c.model;
    if (slot.src === 'shield') {
        c.shieldGone = true; // (synced to the guests with the sword's flag: CastleLife.netSend)
        m?.dropShield?.();
    } else if (slot.kind === 'wand') {
        c.noWand = true; c.lostWand = null; c.practice = null; // (no wand in the hand any more — and none to fetch)
        m?.setHeldTool?.('none');
    } else {
        if (slot.kind === 'weapon') c.disarmed = true; // (fists now: CastleLife / Sailors halve the blows; Death drops nothing)
        else c.toolGone = true;
        m?.setHeldTool?.('none');
        if (c.gun) c.gun = null; // (a pistol crumbled mid-aim)
    }
    return { out: slot.kind, slot, why: '' };
}
