/**
 * GhostBuild.js — the blocks of the Castle of Ghosts (GhostCastle.js places it; the rules and numbers: game/GhostRules.js).
 *
 * CONTRACT (what GhostSite.ready() reads — every field is plain data, no THREE):
 *   buildGhostCastle(site) → {
 *     parts:   [Plan parts]              the blocks (Castles.js Plan: k 0 box / 1 disc / 2 ring sector / 3 slab cells), in the order they are laid (later wins)
 *     chests:  [{id, x, y, z, a, look, flavor:'ghost', part}]   exactly 4 (GHOST_CHESTS): 'tower', 'crypt', 'cellar', 'throne'; x,z the chest's middle, y the floor under it
 *     props:   [{kind, x, y, z, a}]      loose things (kind: chair | stool | candle | candelabra | urn): y = the floor's surface (world y of the top face)
 *     rooms:   [{id, kind, name, x0, x1, z0, z1, y0, y1}]       the rooms as world boxes (y0 = floor surface, y1 = ceiling)
 *     spots:   [{x, y, z, room}]         places a ghost may float up from (air with 6+ free layers over the floor)
 *     entrance:{x, y, z, a}              in front of the gate, outside: where a hero arrives (y = the ground of the stair's foot)
 *   }
 * (A placeholder: the terrace and a hall. The real castle replaces this file.)
 */
import { BLOCK } from './Terrain.js';
import { Plan } from './Castles.js';
import { GHOST_CASTLE as GC, GHOST_CHESTS } from '../game/GhostRules.js';

export function buildGhostCastle(site) {
    const B = BLOCK;
    const p = new Plan(site.x, site.z, site.F, site.rot);
    const lo = site.lo - 2 - (site.F + 1);
    p.box(-66, 66, lo, -1, -66, 66, B.GHOST_STONE);
    p.box(-20, 20, 0, 5, -20, 20, B.GHOST_BRICK);
    p.box(-18, 18, 0, 4, -18, 18, B.AIR);
    p.box(-2, 2, 0, 5, -22, -18, B.AIR);
    const chests = GHOST_CHESTS.map((c, i) => ({ id: c.id, x: p.wx(-12 + i * 8, 0), y: p.L(0) - 1, z: p.wz(-12 + i * 8, 0), a: 0, look: c.look, flavor: 'ghost', part: c.where }));
    return { parts: p.parts, chests, props: [], rooms: [], spots: [{ x: site.x, y: p.L(0) - 1, z: site.z, room: 'hall' }], entrance: { x: p.wx(0, -70), y: site.hi + 1, z: p.wz(0, -70), a: 0 } };
}
