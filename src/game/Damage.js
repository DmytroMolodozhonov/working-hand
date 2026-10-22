// ONE damage for every creature (the author: «Урон единый — для всех существ одинаковый; а дальше всё решает
// количество ХП»): a player (me and over the net), a villager, a wizard, a beast, a zombie… take the same number
// from the same spell or blow. What differs is the creature itself — its HP, armour, shield, immunity
// (Protection, the Queen's cold, a dragon's fire, the gods' gifts), never «player or NPC».

export const DAMAGE = {
    AvadaKedavra: 25, // (no armour stops it — `pierce`)
    Sapira: 10,
    Sands: 0, // only slows (Duel.SLOW) and shoves
    Thunderwave: 10, // everyone in the zone
    Lightning: 20, // «Lightning Strike» and Thor's hammer
    Liquidation: 3,
    Earthquake: 4,
    EarthquakeMaxima: 12,
    BlastPeak: 8, // a Bombardo right at its centre (× power; falls off to 0 at the edge — blastDamage)
};

/**
 * A blast's damage by distance from its centre: the same for every body (Bombardo 8 at the centre,
 * Maxima ×power; Total Destruction is the same blast many times over).
 */
export function blastDamage(dist, radius, power = 1) {
    const reach = radius + 3;
    if (!(dist < reach)) return 0;
    return DAMAGE.BlastPeak * power * (1 - dist / reach);
}
