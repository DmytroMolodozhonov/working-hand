/**
 * The castle's guard: how many knights and where each stands (pure data, no THREE — read by Castles.js and by CastleLife).
 * The author: «Всего в замке должно быть не больше 10–15 рыцарей, рандомно (по размеру замка). Два у входа, два возле короля,
 * четыре на разных частях башни, два патрулируют, остальные — например, возле порта. Король и визирь к этому числу не относятся».
 * Worlds of generation KNIGHT_CAP_FROM_GEN (Terrain.js) and later; older worlds keep their crowds (7 % of the population).
 */
export const KNIGHTS = { MIN: 10, MAX: 15 };

/** How many knights a castle of this style has: a small one (compact) 10, a middle one (fortress) 12–13, a big one (grand) 14–15. `u` is in [0, 1). */
export function knightCount(style, u) {
    const r = Math.min(0.999999, Math.max(0, u || 0));
    const n = style === 'grand' ? 14 + Math.floor(r * 2) : style === 'fortress' ? 12 + Math.floor(r * 2) : 10;
    return Math.max(KNIGHTS.MIN, Math.min(KNIGHTS.MAX, n));
}

/** The posts, in the order they are filled (kind → how many). The rest after these are `EXTRA_POSTS`. */
export const KNIGHT_POSTS = [
    { kind: 'gate', n: 2 }, // both sides of the gate, facing out
    { kind: 'throne', n: 2 }, // left and right of the throne
    { kind: 'tower', n: 4 }, // four different towers (the corners of the wall walk), looking out
    { kind: 'patrol', n: 2 }, // along the wall walk, round the loop
];
/** The rest: by the port (a sea castle's quay; otherwise they walk the yard), the barracks, the treasury, the kitchen, the quay again. */
export const EXTRA_POSTS = ['port', 'barracks', 'treasury', 'kitchen', 'port'];

/** The list of posts for `count` knights: ['gate','gate','throne','throne','tower'×4,'patrol'×2, …extras]. A castle without a port: the quay walk is the yard. */
export function postPlan(count, { port = false } = {}) {
    const out = [];
    for (const p of KNIGHT_POSTS) for (let i = 0; i < p.n; i++) out.push(p.kind);
    for (const e of EXTRA_POSTS) out.push(e === 'port' && !port ? 'yard' : e);
    return out.slice(0, Math.min(count, KNIGHTS.MAX));
}
