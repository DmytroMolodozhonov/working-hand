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
// x0-0.5 .. x1+0.5; CastleTalk's goods, the buyer's strip and the merchant's places all count that way)
const AT = { x: -0.5, z: 13.5 }; // (south of the start, away from the pedestals in the north)
const C = { x0: -2, x1: 1, z0: 13, z1: 14 }; // (4 long, 2 deep, like a city counter)
const W = C.x1 - C.x0 + 1, D = C.z1 - C.z0 + 1, H = 1.0; // the counter: length, depth, height

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

/** The stall's wood: a counter, four posts and a striped awning; solid for bodies and hands. */
export function buildMarketStall(game, def) {
    const s = def.stalls[0], c = s.counter, F = def.F;
    const X0 = c.x0 - 0.5, X1 = c.x1 + 0.5, Z0 = c.z0 - 0.5, Z1 = c.z1 + 0.5;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3a1c });
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    box(W, H, D, wood, AT.x, F + H / 2, AT.z);
    box(W + 0.2, 0.08, D + 0.2, dark, AT.x, F + H + 0.04, AT.z); // (the counter top)
    for (const px of [X0 - 0.1, X1 + 0.1]) for (const pz of [Z0 - 0.3, Z1 + 0.3]) box(0.16, 2.8, 0.16, dark, px, F + 1.4, pz);
    const n = 8, aw = (W + 0.6) / n;
    for (let i = 0; i < n; i++) box(aw, 0.08, D + 1.2, i % 2 ? white : red, X0 - 0.3 + aw * (i + 0.5), F + 2.85, AT.z);
    game.scene.add(group);
    // (the counter stops bodies and hands; the posts are thin — the counter's box is the whole of it)
    game.collision.addBox({ minX: X0, maxX: X1, minY: F - 0.5, maxY: F + H, minZ: Z0, maxZ: Z1, kind: 'counter' });
    return group;
}
