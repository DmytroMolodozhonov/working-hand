/**
 * EnchantedStone.js — the enchanted stone of the duel arenas (DuelArenas.js) and of the walls of the
 * wizards' towers (WizardTowers.js: the drum). The author: «пол арены и трибуны из особого
 * заколдованного камня. Любые взрывные заклинания можно произнести — взрыв будет, но камень не
 * разрушится и не деформируется; любые заклинания, которые деформируют, камень не возьмут. Сломать
 * можно только божественным «Бум», Инспириусом или Total Destruction Максимой — и то ограниченно».
 *
 * Like a gift of the gods (`godGift`, Temple.js), but weaker: its own sign — the block type
 * (`isEnchanted`), and TerrainData asks it in every place a block is broken or changed (set,
 * removeSphere, carveColumn), so every destructive spell meets it without knowing it. Only the
 * three breakers open a small reach round their middle for it (`data.enchantBreak`, a circle on the
 * ground — `breaking`): there the stone breaks as any. Edits from the network and saves are what the
 * host's world did already (`data.enchantFree`).
 *
 * Pure (no THREE, no Terrain import: the terrain workers use it too).
 */

// (the block ids — Terrain.BLOCK.ENCHANTED / ENCHANTED_SEAT / ARCANE_WARD: written here as numbers, no import cycle)
export const ENCHANTED_BLOCKS = { ENCHANTED: 70, ENCHANTED_SEAT: 71, ARCANE_WARD: 72, GHOST_STONE: 73, GHOST_BRICK: 74, GHOST_TILE: 75, GHOST_ROOF: 76, GHOST_LAMP: 77 };
const LO = 70, HI = 77; // (70–72 the arenas' and the towers' stone; 73–77 the Castle of Ghosts' black stone: GhostCastle.js — weak, but not broken by an ordinary spell)

/** A block of the enchanted stone (the arena's floor and stands, the towers' walls)? */
export const isEnchanted = (t) => t >= LO && t <= HI;

/**
 * Who breaks the enchanted stone and how far from the middle of the blow (m, on the ground) — the
 * author's «и то ограниченно»: a little round the middle, never the whole reach of the spell.
 */
export const ENCHANT_BREAKERS = {
    Boom: { r: 12, why: 'божественный «Бум» (заклинание богов): кратер 112 м, но заколдованный камень ломается только в 12 м от середины' },
    Inspirius: { r: 8, why: '«Инспириус»: волна рушит всё на 45 м, а заколдованный камень — только в 8 м от середины ямы' },
    TotalDestructionMaxima: { r: 6, why: '«Total Destruction Максима»: круг 28 м, заколдованный камень — только в 6 м от середины' },
};

/**
 * Every spell that breaks or deforms the ground (the author: «проверь все») and what it does to the
 * enchanted stone. «Не берёт» is a decision too: the reason is written here (the codex and the tests read it).
 */
export const ENCHANTED_VS = {
    Bombardo: 'взрыв есть (урон, отброс, звук, огонь вокруг), а камень цел — ни ямы, ни трещины',
    BombardoMaxima: 'то же: взрыв вдвое сильнее, камень цел',
    Lightning: 'молния бьёт, камень цел',
    Cannons: 'ядра и взрывы пушек — камень цел',
    TotalDestruction: 'не берёт: обычный Total Destruction заколдованный камень не рушит (слова автора)',
    TotalDestructionMaxima: 'ломает, но ограниченно — только в 6 м от середины',
    Inspirius: 'ломает, но ограниченно — только в 8 м от середины ямы',
    Boom: 'ломает (заклинание богов), но ограниченно — только в 12 м от середины кратера',
    CircleAttack: 'не берёт: волна идёт, камень цел',
    Stitching: 'не берёт: камень не сшивается, не сдвигается и не заделывается чужим камнем',
    GroundVortex: 'не берёт: заколдованный камень вихрь не поднимает и летящий блок его не ломает',
    Gather: 'не берёт: заколдованный камень руками/заклинанием не собрать',
    Earthquake: 'не берёт: трещины обходят его',
    LevitationMaxima: 'не берёт: кусок стены башни или трибуны не оторвать',
    Liquidation: 'не берёт: камень не исчезает',
    Fire: 'не горит',
    Ice: 'лёд и заморозка ложатся поверх, камень под ними цел; таяние его не трогает',
    Collapse: 'не обрушивается и держит то, что на нём (как скала)',
    Builders: 'игрок не ломает и не ставит заколдованный камень (только строит поверх)',
};

/**
 * (TerrainData) May this cell of enchanted stone break now? Only inside the breaker's circle
 * (`data.enchantBreak` {x, z, r}) or while edits that were already done elsewhere are applied
 * (`data.enchantFree`).
 */
export function enchantMayBreak(data, ix, iz) {
    if (data.enchantFree) return true;
    const b = data.enchantBreak;
    if (!b) return false;
    const dx = ix - b.x, dz = iz - b.z;
    return dx * dx + dz * dz <= b.r * b.r;
}

/**
 * Run `fn` with the breaker's circle open (`spell`: a key of ENCHANT_BREAKERS) at (x, z); what it
 * breaks of the enchanted stone stays within that circle. Returns what fn returns.
 */
export function breaking(data, spell, x, z, fn) {
    const B = ENCHANT_BREAKERS[spell];
    if (!data || !B) return fn();
    const prev = data.enchantBreak;
    data.enchantBreak = { x, z, r: B.r };
    try { return fn(); } finally { data.enchantBreak = prev; }
}

/** Run `fn` applying edits the host's world already made (the network, a save): the stone obeys them. */
export function applyingDone(data, fn) {
    if (!data) return fn();
    const prev = data.enchantFree;
    data.enchantFree = true;
    try { return fn(); } finally { data.enchantFree = prev; }
}
