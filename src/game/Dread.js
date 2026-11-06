/**
 * Dread.js — «Зелье страха» (recipe 'dread': связка паутины + кость + бронзовый рог; the author 06.11: «слабые персонажи с большей вероятностью теперь убегут, если ты когда-либо выпил
 * это зелье; один раз приготовить, один раз выпить, эффект навсегда; с большей вероятностью убегут, чем пойдут в атаку — но против СЛАБЫХ: обычные жители, слабые маги; далеко не против всех»).
 *
 * Drunk: `g.bonus.dread = 1` (saved with the world, taken by a death with the rest of the growth, brought back by «Give Me My Power» — Legacy.js); the potion works ONCE (a second one is refused).
 * What it changes (the host's minds ask `scares`): where a WEAK person would meet the hero with a fight — a villager who hits back, a road wizard of a low rank who answers a spell, a
 * villager of a crowd who joins the mob — he runs more often than he fights (FLEE_P of the time, the crowd is thinner: bravery −0.3). Knights, the king, bosses, strong wizards, animals,
 * zombies — no change (the potion is about nerves, not about the brainless).
 * «А если»: another player drank it — the host does not know their flag (it is their computer's: only the host's own hero scares for now); the hero died — gone with the rest; a villager already
 * running / fighting — nothing is undone (it is asked only where the choice is made: a blow, a spell, the mob's call).
 */
export const DREAD = {
    FLEE_P: 0.7, // the share of the times a weak one runs instead of fighting back
    BRAVE_SHIFT: 0.3, // the crowd: bravery lowered by this
    WIZ_K: 0.3, // a low-rank wizard's chance to answer a spell with a fight × this
    WEAK_ROLES: new Set(['farmer', 'builder', 'merchant', 'seller', 'student']), // («seller» of a tower is a wizard — by rank below)
    WEAK_RANKS: new Set(['novice', 'adept']),
};

/** Is `v` one of the weak — the ones the potion works on? */
export function isWeakOne(v) {
    if (!v || v.role === 'knight' || v.role === 'king' || v.role === 'advisor' || v.boss) return false;
    if (v.wizard) return DREAD.WEAK_RANKS.has(v.rank || 'adept');
    return DREAD.WEAK_ROLES.has(v.role) || !!v.weak || !!v.elder || !!v.child;
}

/** The chance a weak wizard fights back, with the potion on the caster (pure). */
export const dreadedChance = (chance, dread) => (dread ? chance * DREAD.WIZ_K : chance);
/** The crowd's bravery, with the potion on (pure). */
export const dreadedBrave = (brave, dread) => (dread ? Math.max(0, brave - DREAD.BRAVE_SHIFT) : brave);

export class Dread {
    constructor(game) { this.game = game; }

    /** Has the hero `id` drunk it? (the host knows only its own hero's flag) */
    on(id) { const g = this.game; return (id === g.localId || id === 'local') && !!g.bonus?.dread; }

    /** The weak one `v` meeting hero `by` with a fight to pick: does he run instead (this time)? */
    scares(v, by, rnd = Math.random) { return this.on(by) && isWeakOne(v) && rnd() < DREAD.FLEE_P; }

    cantDrink() { return this.game.bonus?.dread ? '😨 Вы уже пили такое зелье — страшнее вы не станете' : null; }

    drink() {
        const g = this.game;
        const B = g.bonus || (g.bonus = { hp: 0, fatigue: 0 });
        B.dread = 1;
        g.perf?.note?.('😨 Зелье страха выпито: слабые теперь чаще бегут');
    }
}
