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
const AT = { x: 0, z: 13 }; // (south of the start, away from the pedestals in the north)
const W = 4, D = 1.6, H = 1.0; // the counter: length, depth, height

/** The site's def (CastleLife) for a stall whose counter stands at ground level `F`. */
export function marketDef(F) {
    const x0 = AT.x - W / 2, x1 = AT.x + W / 2, z0 = AT.z - D / 2, z1 = AT.z + D / 2;
    const stall = {
        front: { x: AT.x, y: F, z: z1 + 1.8 }, back: { x: AT.x, y: F, z: z0 - 1.1 },
        counter: { x0, x1, z0, z1, top: F + H },
        yaw: 0, // (the merchant looks to +z, at the buyer)
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
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3a1c });
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    box(W, H, D, wood, AT.x, F + H / 2, AT.z);
    box(W + 0.2, 0.08, D + 0.2, dark, AT.x, F + H + 0.04, AT.z); // (the counter top)
    for (const px of [c.x0 - 0.1, c.x1 + 0.1]) for (const pz of [c.z0 - 0.3, c.z1 + 0.3]) box(0.16, 2.8, 0.16, dark, px, F + 1.4, pz);
    const n = 8, aw = (W + 0.6) / n;
    for (let i = 0; i < n; i++) box(aw, 0.08, D + 1.2, i % 2 ? white : red, c.x0 - 0.3 + aw * (i + 0.5), F + 2.85, AT.z);
    game.scene.add(group);
    // (the counter stops bodies and hands; the posts are thin — the counter's box is the whole of it)
    game.collision.addBox({ minX: c.x0, maxX: c.x1, minY: F - 0.5, maxY: F + H, minZ: c.z0, maxZ: c.z1, kind: 'counter' });
    return group;
}
