/**
 * Startle.js — a threat that passed close by (the author: «использовал заклинание, оно не попало — пролетело
 * рядом. Но они никак не отреагировали вообще»). A charge flying past, a ray, a blast near somebody, a spell
 * that hit him without hurting (Остолбеней, Левиоса, Пески, Экспеллиармус…): a threat all the same.
 *
 * What he does (CastleLife.startle — the host decides, as for all the castle people):
 *   1. flinches (ducks, the arms up — the 'flinch' pose) and turns to where it came from;
 *   2. sees who did it (Blame.js: in his sight, a free line — «only who saw it knows»):
 *        the ones who fight (knights, the king, guards, brave wizards, wanderers) go for him — «лицом к цели»
 *        before any blow or spell (FaceTarget / their fight); the others run from him (VillagerFear);
 *      doesn't see: the fighters go to look where it came from (investigate) and catch whoever they see
 *      there; the others run from that place. The ones near hear the cry and come too.
 *   3. on the road (Travelers): the cart stops, the riders get down — as on any trouble.
 *
 * «Кто/что × как» (CLAUDE.md):
 */
export const STARTLE_TARGETS = {
    castlePeople: { does: 'startle', why: 'жители, рыцари, король, стража, волшебники башен: вздрагивают, оборачиваются; видят, кто — в бой (или бегут), не видят — ищут там, откуда прилетело' },
    wanderers: { does: 'startle', why: 'странники, странствующие рыцари, путники с повозками (Travelers): то же; повозка встаёт. Рыцари и волшебники дороги замечают промах шире (≤ 6 м — нападение, ≤ 15 м — оборот и бой по броску, ≤ 30 м громкое), обычные путники отвечают на удар/убийство по броску — WandererMind.js' },
    sailors: { does: 'startle', why: 'моряки (и скелеты Чёрных Усов): пригибаются (brace); видят стрелявшего — команда к бою (Sailors.provoke)' },
    players: { does: 'none', why: 'игрок сам видит и слышит заряд' },
    zombies: { does: 'none', why: 'зомби не пугаются: их ведут слух и зрение (ZombieSpawn), промах их не тревожит' },
    animals: { does: 'none', why: 'животных пугают удары и взрывы (Animals.hitAt), пролетевший заряд — нет' },
    iceCastle: { does: 'none', why: 'Ледяная Королева и её создания сами нападают на всякого, кто близко — промах ничего не меняет' },
    creatures: { does: 'none', why: 'паук, драконы, фениксы, совы, ожившие деревья, книги-птицы — свои правила, промах их не трогает' },
    things: { does: 'none', why: 'предметы и мир: промах — это не попадание' },
};

export const STARTLE = {
    BOLT_R: 3.2, // m: a charge passing this close (beyond the body's own radius) startles
    BLAST_R: 14, // m beyond a blast's radius: it startles (it is heard and felt)
    RAY_R: 6, // m beyond a ray's width
    FLINCH: 0.55, // s: the flinch and the turn to it
    AGAIN_MS: 1500, // one startle a while (a volley is one threat)
    READY_MS: 20000, // ready for the next one (a wizard's shield — WizardFight._notice)
    SEARCH_S: 35, // s a fighter searches the place it came from
    CALL_R: 25, // m: the ones near hear the cry
    FLEE_S: 7, // s the timid run from the place
};

/**
 * How close the segment p→q passes to the point (x, y, z) — the squared distance (no allocations: for every
 * charge, every frame, every person near).
 */
export function segDist2(px, py, pz, qx, qy, qz, x, y, z) {
    const dx = qx - px, dy = qy - py, dz = qz - pz;
    const L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 1e-9 ? ((x - px) * dx + (y - py) * dy + (z - pz) * dz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px + dx * t - x, ey = py + dy * t - y, ez = pz + dz * t - z;
    return ex * ex + ey * ey + ez * ez;
}

/** What a startled one does: 'fight' | 'flee' | 'search' | 'run' (pure: CastleLife.startle). */
export function startleReaction({ fights = false, knows = false } = {}) {
    if (knows) return fights ? 'fight' : 'flee';
    return fights ? 'search' : 'run';
}
