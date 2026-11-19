/**
 * CreatureCaps.js — a hard ceiling per kind of creature (the author 19.11: «животные не могли копиться: не больше столько-то сов,
 * а потом они исчезали»). The spawners already stop at MAX; this also trims a list that is over it for any other reason (a saved
 * game, a net message, a rule changed) — the ones FARTHEST from every player and calm go first, so nothing near a player vanishes.
 * Pure: the caller removes what `overflow` returns.
 */
export const CAPS = { owl: 3, phoenix: 2 };

/** items: any list; max: the ceiling; distOf(item) → m to the nearest player; calm(item) → may it be removed now? Returns the extras to remove. */
export function overflow(items, max, distOf, calm = () => true) {
    const extra = items.length - max;
    if (extra <= 0) return [];
    return items.filter(calm).sort((a, b) => distOf(b) - distOf(a)).slice(0, extra);
}
