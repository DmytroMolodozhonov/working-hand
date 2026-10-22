/**
 * CreativeMarket.js — a city merchant's stall by the Creative start, to try buying and selling
 * without walking to a castle (author: «где-то рядом поставь продавца из города — его прилавок»).
 *
 * It is a tiny «site» for CastleLife (kind 'stall'): one stall, one merchant, nothing else — the
 * merchant, his goods, the coins, buying and selling are exactly the castle market's (CastleTalk,
 * MarketGoods). The same place on every computer; the counter and posts have collision.
 */
import * as THREE from 'three';

export const MARKET_SITE_ID = 'cvmarket';
// (the counter is laid out like a city one — in whole blocks: x0..x1, z0..z1 are block centres, so it spans
// x0-0.5 .. x1+0.5; CastleTalk's goods, the buyer's strip and the merchant's places all count that way).
// The sizes are the city market's own (Castles.js, the market: blocks of 1 m, a hero 3.5 m tall): the counter
// 5 long, 2 deep and 2 high — at the hero's waist; posts 7 high a block beyond its ends; the striped canopy over
// the counter and the merchant's place, 7 × 5, at 7 m (the author: the stall was small and squeezed — a 1 m
// counter at the knee, the canopy under the hero's eyes).
const AT = { x: 0, z: 13.5 }; // (south of the start, away from the pedestals in the north)
const C = { x0: -2, x1: 2, z0: 13, z1: 14 }; // (5 long, 2 deep, like a city counter)
const W = C.x1 - C.x0 + 1, D = C.z1 - C.z0 + 1, H = 2.0; // the counter: length, depth, height
const POST_H = 7, POST_W = 0.4, ROOF_D = 5; // the posts' height and thickness, the canopy's depth (from the counter's front back)

/** The site's def (CastleLife) for a stall whose counter stands at ground level `F`. */
export function marketDef(F) {
    const stall = {
        front: { x: AT.x, y: F, z: C.z1 + 3 }, back: { x: AT.x, y: F, z: C.z0 - 1.5 },
        counter: { ...C, top: F + H },
        yaw: Math.PI, // (the merchant behind the counter looks to +z, at the buyer: yaw 0 looks to -z)
    };
    return {
        id: MARKET_SITE_ID, kind: 'stall', name: 'Рынок', x: AT.x, z: AT.z, F, zone: 12, gx: 0, gz: 0,
        knights: 0, king: '', population: 1, color: 0xb03a2e,
        houses: [], stalls: [stall], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
        nodes: [{ id: 0, x: stall.back.x, y: F, z: stall.back.z, tag: 'stall' }], edges: [],
    };
}

/** Is this site the Creative stall (it has no castle around it: CastleLife leaves it alone beyond its merchant)? */
export const isStallSite = (def) => !!def && def.kind === 'stall';

/** The stall's wood: a counter, four posts and a striped canopy; solid for bodies and hands. */
export function buildMarketStall(game, def) {
    const s = def.stalls[0], c = s.counter, F = def.F;
    const X0 = c.x0 - 0.5, X1 = c.x1 + 0.5, Z0 = c.z0 - 0.5, Z1 = c.z1 + 0.5;
    // the canopy: from a block beyond the counter's ends, from its front back over the merchant (as the city's)
    const RX0 = X0 - 1, RX1 = X1 + 1, RZ1 = Z1, RZ0 = Z1 - ROOF_D;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3a1c });
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    const SINK = 0.5; // (into the ground a little: on a slope no end of it hangs in the air)
    box(W, H - 0.08 + SINK, D, wood, AT.x, F - SINK + (H - 0.08 + SINK) / 2, AT.z);
    box(W + 0.2, 0.08, D + 0.2, dark, AT.x, F + H - 0.04, AT.z); // (the counter top: flush with c.top, where the goods lie)
    const posts = [];
    for (const px of [RX0 + POST_W / 2, RX1 - POST_W / 2]) for (const pz of [RZ0 + POST_W / 2, RZ1 - POST_W / 2]) { box(POST_W, POST_H + SINK, POST_W, dark, px, F - SINK + (POST_H + SINK) / 2, pz); posts.push([px, pz]); }
    const n = RX1 - RX0, aw = 1; // (a stripe a block wide, red and white in turn)
    for (let i = 0; i < n; i++) box(aw, 0.3, ROOF_D, i % 2 ? white : red, RX0 + aw * (i + 0.5), F + POST_H + 0.15, (RZ0 + RZ1) / 2);
    game.scene.add(group);
    // the counter and the posts stop bodies and hands
    game.collision.addBox({ minX: X0, maxX: X1, minY: F - 0.5, maxY: F + H, minZ: Z0, maxZ: Z1, kind: 'counter' });
    for (const [px, pz] of posts) game.collision.addBox({ minX: px - POST_W / 2, maxX: px + POST_W / 2, minY: F - 0.5, maxY: F + POST_H, minZ: pz - POST_W / 2, maxZ: pz + POST_W / 2, kind: 'post' });
    return group;
}
