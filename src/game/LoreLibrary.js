/**
 * LoreLibrary.js — the books of the world's history (LoreBooks.js) lying in the libraries: on the reading
 * desk of the wizards' tower and in any site whose record gives `lore` spots (a wizards' town's library).
 *
 * The host lays them when the place wakes (CastleLife._wake: a player comes near) — each book on its spot,
 * a real loose thing: it lies on the desk (falls if the desk is gone), is taken in the hand, opened, read,
 * carried off. One the readers took away is put back the next time the place wakes (the library keeps a
 * copy of each); a book still lying on its spot when the place falls asleep is put away (nothing piles up
 * while one flies about) and is not saved — the place lays it again.
 */
import * as THREE from 'three';
import { loreForSite, loreItem } from './LoreBooks.js';
import { newUid } from './ItemTypes.js';

const ON_SPOT = 1.2; // m: a book this near its spot still lies where the library put it

export class LoreLibrary {
    constructor(game) {
        this.game = game;
        this.placed = new Map(); // site id → [uid | null] by spot
    }

    /** (host) The place is near now: its books on their spots (those not lying there already). */
    wake(def) {
        const g = this.game, items = g.items;
        if (!items || !g.authority) return;
        const list = loreForSite(def);
        if (!list.length) return;
        const uids = this.placed.get(def.id) || [];
        list.forEach(({ id, at }, i) => {
            const L = uids[i] && items.loose.get(uids[i]);
            if (L) return; // (still lying about: on its spot, or dropped somewhere near)
            const uid = 'lore' + newUid();
            const p = new THREE.Vector3(at.x, at.y + 0.2, at.z);
            const N = items.spawnLoose(loreItem(id, uid), p);
            if (N) N.shelfAt = p.clone();
            uids[i] = uid;
        });
        this.placed.set(def.id, uids);
    }

    /** (host) The place is far: the books still on their spots are put away (laid again on waking). */
    sleep(def) {
        const g = this.game, items = g.items;
        const uids = this.placed.get(def.id);
        if (!uids || !items) return;
        uids.forEach((uid, i) => {
            const L = uid && items.loose.get(uid);
            if (!L || !onSpot(L)) return;
            items.removeLoose(uid);
            g.sync?.itemGone?.(uid, null, null);
            uids[i] = null;
        });
    }
}

/** Is this loose thing a library's book still lying where the library put it? (WorldSave does not keep those.) */
export function onSpot(L) {
    return !!L?.shelfAt && L.model.position.distanceTo(L.shelfAt) < ON_SPOT;
}
