/**
 * CreativeGuest.js — a plain villager by the Creative start, to talk to (the author: «поставишь в творческом
 * режиме какого-то особого обычного жителя возле входа в игру — чтобы я мог повзаимодействовать, протестировать
 * новую систему» — the quick talk: TalkFlow, TalkAcks, TalkTrace).
 *
 * A tiny «site» for CastleLife (kind 'guest'): one man — farmer Тихон — who stands near the start facing it; no
 * house, no stall, no knights. He is a castle villager in every other way: the same brain (VillagerBrain), the
 * same net (TalkMind), the same voice, the same body (collision, the crowd), the same orders («иди за мной» —
 * he follows, «стой» — he goes back to his place). The same place on every computer.
 */

export const GUEST_SITE_ID = 'cvguest';
const AT = { x: -8, z: 6 }; // (to the south-west of the start: off the pedestals (north), the market (south) and the dummy)

/** The site's def (CastleLife) for the guest standing on ground level `F`. */
export function guestDef(F) {
    const yaw = Math.atan2(AT.x, AT.z); // (facing the start: yaw 0 looks to −z)
    const spot = { x: AT.x, y: F, z: AT.z, yaw };
    return {
        id: GUEST_SITE_ID, kind: 'guest', name: 'Творческий мир', x: AT.x, z: AT.z, F, zone: 10, gx: 0, gz: 0,
        knights: 0, king: '', population: 1, color: 0x5a7a3a, spot,
        // (the one person: a plain man, always the same)
        people: [{ idx: 1, role: 'farmer', female: false, name: 'Тихон', home: -1, stall: -1, seed: 20261023 }],
        houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
        nodes: [{ id: 0, x: AT.x, y: F, z: AT.z, tag: 'guest' }], edges: [],
    };
}

/** Is this site the Creative guest? */
export const isGuestSite = (def) => !!def && def.kind === 'guest';
