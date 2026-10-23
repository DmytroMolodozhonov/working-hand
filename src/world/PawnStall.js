/**
 * PawnStall.js — the buyer's stall (a pawnbroker, `stall.pawn`): the same one by the wizards' tower and in the small wizard
 * villages (in old worlds too, by the author's wish). CastleTalk buys anything from a hand put on its counter (40 % under: WizardMarket.pawnPrice),
 * BuyerSigns.js hangs the «Скупка» plaque on the counter, CastleLife / HamletLife set the seller behind it.
 *
 * Built in plan coordinates (Castles.Plan) with the customer on the −u side, the seller on the +u side, looking −u. The counter
 * is 4 long and 2 high like the potion master's (the city's is 5; the hero is 3.5 high, the counter comes to the waist): dark
 * planks, a white cloth, a gold rim at its ends; the scales (a lamp for the pan, gold weights) and a coin on it; behind the
 * seller a shelf with the things taken in; an awning on four posts (5 × 8, 7 high, a stepped violet roof with ramps and a gold
 * finial), violet lamps on the front posts and a lamp post. Takes no rng: nothing else of the site moves.
 * `du`, `dv` place it (the tower's: 0, 0; counter column u = 8, v = −41…−38); `towards(u, v)` is the road node to join.
 */

import { BLOCK } from './Terrain.js';

export function pawnStall(p, du, dv, towards) {
    const B = BLOCK, first = p.parts.length;
    const bx = (u0, u1, l0, l1, v0, v1, t) => p.box(u0 + du, u1 + du, l0, l1, v0 + dv, v1 + dv, t);
    bx(8, 8, 0, 0, -42, -37, B.PLANKS_DARK); // the counter
    bx(8, 8, 1, 1, -41, -38, B.CLOTH_WHITE);
    bx(8, 8, 1, 1, -42, -42, B.GOLD); bx(8, 8, 1, 1, -37, -37, B.GOLD);
    bx(8, 8, 2, 2, -40, -40, B.ARCANE_LAMP); bx(8, 8, 2, 2, -39, -39, B.GOLD); bx(8, 8, 2, 2, -42, -42, B.GOLD); // scales and coin
    bx(11, 11, 0, 1, -41, -38, B.ARCANE_DARK); // behind the seller: a plinth and a shelf with the things taken in
    bx(11, 11, 2, 2, -41, -38, B.PLANKS_DARK);
    bx(11, 11, 3, 3, -41, -41, B.POTION); bx(11, 11, 3, 3, -40, -40, B.GOLD); bx(11, 11, 3, 3, -39, -39, B.ARCANE_LAMP); bx(11, 11, 3, 3, -38, -38, B.POTION);
    for (const [u, v] of [[7, -43], [7, -36], [11, -43], [11, -36]]) bx(u, u, 0, 5, v, v, B.PLANKS_DARK); // the awning
    for (const v of [-43, -36]) bx(7, 7, 6, 6, v, v, B.ARCANE_LAMP_VIOLET);
    const mark = p.parts.length;
    bx(7, 11, 7, 7, -43, -36, B.ROOF_PURPLE); bx(8, 10, 8, 8, -42, -37, B.ROOF_PURPLE); bx(9, 9, 9, 9, -41, -38, B.ROOF_PURPLE);
    p.slopeTop(mark, B.ROOF_PURPLE);
    bx(9, 9, 10, 10, -40, -39, B.GOLD);
    bx(12, 12, 0, 3, -45, -45, B.PLANKS_DARK); bx(12, 12, 4, 4, -45, -45, B.ARCANE_LAMP); // a lamp post
    const fu = 6 + du, fv = -39.5 + dv;
    const frontNode = p.node(fu, fv, 0, 'stall');
    p.link(frontNode, towards(fu, fv));
    const c0 = p.pt(8 + du, -41 + dv), c1 = p.pt(8 + du, -38 + dv), o = p.pt(0, 0), f = p.pt(-1, 0);
    const cc = p.pt(8 + du, -39.5 + dv), sc = p.pt(10 + du, -39.5 + dv);
    return {
        parts: [first, p.parts.length], // (its blocks in the site's parts: the tests)
        probe: { cx: Math.floor(cc.x), cz: Math.floor(cc.z), cL: p.L(1), sx: Math.floor(sc.x), sz: Math.floor(sc.z), sL: p.L(0) }, // (settlePawn: is the built stall still there?)
        trade: 'pawn', pawn: true, // (WizardMarket.js: the pawnshop takes anything; the seller only buys)
        front: p.pt(fu, fv), back: p.pt(10 + du, fv), frontNode,
        counter: { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z), top: p.L(1) - 0.5 },
        yaw: Math.atan2(-(f.x - o.x), -(f.z - o.z)), // (the seller looks at the customer: −u)
    };
}

/**
 * (the stall of a world made before the buyer came, or a place the player has changed) Is the stall really standing: the white
 * cloth on its counter and room (3 blocks of air) where the seller stands? Not — it is switched off, no seller, no plaque, no deals
 * (nobody stands in rock, no half-stall in a wall). `data` is the terrain data; waits (returns false) while the land is not made.
 * Settled once a stall: true when it is done.
 */
export function settlePawn(data, def) {
    let done = true;
    for (const st of def.stalls || []) {
        const q = st.probe;
        if (!q || st.settled) continue;
        if (data.landMade && (!data.landMade(q.cx, q.cz) || !data.landMade(q.sx, q.sz))) { done = false; continue; }
        const ok = data.get(q.cx, q.cL, q.cz) === BLOCK.CLOTH_WHITE
            && !data.get(q.sx, q.sL, q.sz) && !data.get(q.sx, q.sL + 1, q.sz) && !data.get(q.sx, q.sL + 2, q.sz);
        st.settled = true;
        if (!ok) { st.off = true; st.pawn = false; delete st.trade; }
    }
    return done;
}
