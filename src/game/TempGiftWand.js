// TempGiftWand.js — ВРЕМЕННЫЙ КОД (автор 20.11): вернуть игроку потерянную палочку в его мире «Мое выживание — 19.11, 15:30» (seed 800694817).
// Один раз кладётся в ячейку: сила 49 %, любимое заклинание — «Бомбардо», обычная палочка. Автор скажет, когда она появилась — тогда УДАЛИТЬ:
//   этот файл, его импорт и вызов в Inventory.update (строка с `tempGiftWand`), тест tests/unit/temp-gift-wand.test.js.
export const TEMP_GIFT = { SEED: 800694817, UID: 'gift-bombardo-49', KEY: 'zns-temp-gift-wand-v1' };
export const giftWand = () => ({ kind: 'wand', uid: TEMP_GIFT.UID, model: 0, color: 0x6b4a2b, dir: null, fav: 'Bombardo', power: 49 });

/** Is it that world and not given yet? (the flag lives in the browser; the wand's id says it is already here) */
export function wantsGift(game, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const seed = game?.config?.seed ?? game?.seed;
    if (seed !== TEMP_GIFT.SEED || game?.config?.mode === 'creative') return false;
    try { if (storage?.getItem(TEMP_GIFT.KEY)) return false; } catch (e) { /* no storage: the id check below is enough */ }
    return true;
}

/** Give it: into a free cell (a new one if all are full), mine for good. → true when given. */
export function tempGiftWand(game, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const inv = game?.inventory;
    if (!inv || !wantsGift(game, storage) || game.revealed === false || game.isDeadLocal) return false;
    const mark = () => { try { storage?.setItem(TEMP_GIFT.KEY, String(Date.now())); } catch (e) { /* */ } };
    if (inv.hasUid?.(TEMP_GIFT.UID)) { mark(); return false; } // (already in a hand / a cell — the save kept it)
    let i = inv.slots.findIndex((s) => !s);
    if (i < 0 && inv.setExtraSlots) { inv.setExtraSlots(inv.slots.length - 5 + 1); i = inv.slots.findIndex((s) => !s); }
    if (i < 0) return false; // (no room: tried again later)
    inv.slots[i] = giftWand();
    inv.ownWand = TEMP_GIFT.UID;
    inv._render?.();
    mark();
    game.hud?.toast?.('🪄 Ваша палочка вернулась: сила 49%, любимое заклинание — Бомбардо', 6000);
    return true;
}
