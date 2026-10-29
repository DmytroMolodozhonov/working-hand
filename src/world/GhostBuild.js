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
 *     doors:   [{x, y, z, room}]         (extra) the middles of the doorways on their floors — kept clear of props
 *   }
 *   y everywhere: a block of layer L spans y L − 1.5 … L − 0.5, so the top face of a floor layer Ls is y = Ls − 0.5; `a` (chests, props,
 *   entrance) = atan2(dx, dz) of the direction the thing faces.
 *
 * THE CASTLE (local frame of the Plan: u across, v back; the gate at −v; layer l = 0 the first air over the terrace's top, site.F):
 *  - a black terrace ±68 (from 2 below the lowest ground up to the courtyard), its string courses, buttresses and pale lamps, a parapet;
 *    a grand stair 15 wide down the front (whole steps 1 × 1, balustrades with lamp posts, obelisks and mourners), two side stairs 7 wide;
 *  - the curtain ±62 (5 thick, a wall walk 3 wide at 16, merlons to 18), four corner towers r 12 (7 floors, spiral stairs, spires to l 75),
 *    two side and two back wall towers r 6, a gatehouse with two gate towers (gate 11 × 13, a gallery, murder holes, a roof walk);
 *  - the keep 65 × 57 (3 storeys of 8, a steep mansard roof, dormers, chimneys, a front gable with a rose of pale light), six spired turrets,
 *    the great tower r 14 in its middle (the round throne hall two storeys high, then five floors up to the treasury, a spire to l 78);
 *  - two wings along the side walls (the great hall and the kitchen; the chapel and the library) under steep roofs;
 *  - covered bridges over the alleys from the keep's top floor to the wall walks, covered hoardings from the front towers to the gatehouse;
 *  - inside the terrace, above the ground: the cellars (a wine cellar, store rooms, a dungeon of cells, a hidden store) reached by an open
 *    stair in the west alley, and the crypt (a long vaulted hall with tomb alcoves) reached through a mausoleum in the back garden;
 *  - the courtyard: a dry fountain with a weeping angel, mourners, dead trees, a well, lamp posts; a graveyard and a dead garden.
 * No air is ever carved below layer hi + 1 (the land is never cut); nothing stands above l 78 or outside the ±96 square.
 */
import { BLOCK } from './Terrain.js';
import { Plan } from './Castles.js';
import { createRng } from '../core/math.js';
import { GHOST_CHESTS } from '../game/GhostRules.js';
import { GhostKit } from './GhostKit.js';
import { GhostRoom, furnishGhostRoom } from './GhostRooms.js';

const T = 68; // the terrace's half-size
const CW = 62; // the curtain's outer face (5 thick: 58…62)
const IN = 57; // the courtyard's inner edge
const STEPS = 26; // the front stair's steps (the terrace 14 + the ground's spread 12)
const LOOK = Object.fromEntries(GHOST_CHESTS.map((c) => [c.id, c]));

export function buildGhostCastle(site) {
    const B = BLOCK;
    const p = new Plan(site.x, site.z, site.F, site.rot);
    const rng = createRng((site.seed >>> 0) ^ 0x9e3779b1);
    rng();
    const K = new GhostKit(p, rng);
    const lowL = site.lo - 2 - (site.F + 1); // the terrace's foot (local)
    const hiL = site.hi - (site.F + 1); // the highest ground (local; −15 with the plinth of 14)
    const BS = hiL + 2; // the cellars' standing layer (their floor slab on hi + 1)
    const air = (u0, u1, l0, l1, v0, v1) => p.box(u0, u1, l0, l1, v0, v1, 0);
    const put = (u0, u1, l0, l1, v0, v1, t) => p.box(u0, u1, l0, l1, v0, v1, t);
    const late = []; // (cut after the furniture: holes through floors the rooms lay)
    const rooms = []; // GhostRoom grids furnished at the end (after every wall and door is cut)
    const mk = (id, kind, name, u0, u1, v0, v1, l, h, doors = [], opt = {}) => {
        air(u0, u1, l, l + h - 1, v0, v1);
        const R = new GhostRoom(K, id, kind, name, u0, u1, v0, v1, l, h);
        for (const [du, dv] of doors) R.addDoor(du, dv);
        R.furnish = opt.furnish !== false;
        R.kindF = opt.as || kind;
        rooms.push(R);
        return R;
    };
    /** A doorway 3 wide (5 for `wide`) × 6 high through a wall between (u0..u1, v0..v1). */
    const door = (u0, u1, l, v0, v1, h = 6) => air(u0, u1, l, l + h - 1, v0, v1);

    terrace();
    stairs();
    courtyardFloor();
    curtain();
    wings();
    keep();
    greatTower();
    cornerTowers();
    wallTowers();
    gatehouse();
    bridges();
    yard();
    gardens();
    cellars();
    crypt();
    // ---- the rooms' furniture, then the chests (their niches were kept free on the rooms' grids)
    for (const R of rooms) if (R.furnish) furnishGhostRoom(R, R.kindF);
    else R.spots(2);
    for (const f of late) f();
    placeChests();
    p.flushSlabs();
    const e = p.pt(0, -T - 14, hiL + 1);
    const entrance = { x: e.x, y: p.L(hiL) - 0.5, z: e.z, a: K.yawOf(0, -T - 14, 0, 1) };
    return { parts: p.parts, chests: K.chests, props: K.props, rooms: K.rooms, spots: K.spots, entrance, doors: K.doors };

    // =========================================================== the terrace and its stairs
    function terrace() {
        put(-T, T, lowL, -1, -T, T, B.GHOST_STONE);
        p.walls(-T - 1, T + 1, -T - 1, T + 1, -1, -1, B.GHOST_BRICK); // (the cornice under the parapet)
        p.walls(-T - 1, T + 1, -T - 1, T + 1, -5, -5, B.GHOST_BRICK); // (a string course)
        p.walls(-T - 1, T + 1, -T - 1, T + 1, Math.max(lowL, -11), Math.max(lowL, -11), B.GHOST_BRICK);
        // buttresses with sloped heads, pale lamps between them
        for (const side of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            for (let s = -54; s <= 54; s += 12) {
                if (side[1] === -1 && Math.abs(s) <= 14) continue; // (the grand stair, the obelisks)
                if (side[0] && Math.abs(s + 41) <= 6) continue; // (the side stairs)
                const bx = (d0, d1, a0, a1, l0, l1, t) => (side[0]
                    ? put(side[0] * (T + d0), side[0] * (T + d1), l0, l1, s + a0, s + a1, t)
                    : put(s + a0, s + a1, l0, l1, side[1] * (T + d0), side[1] * (T + d1), t));
                bx(1, 2, -1, 1, lowL, -7, B.GHOST_STONE);
                bx(1, 1, -1, 1, -6, -3, B.GHOST_STONE);
                bx(0, 0, 5, 6, -8, -7, B.GHOST_LAMP); // (a lamp sunk in the face between two buttresses)
            }
        }
        // the parapet, gaps for the stairs, posts with lamps
        p.walls(-T, T, -T, T, 0, 0, B.GHOST_BRICK);
        for (let s = -T + 4; s <= T - 4; s += 8) {
            for (const [u, v] of [[s, -T], [s, T], [-T, s], [T, s]]) { put(u, u, 1, 1, v, v, B.GHOST_BRICK); }
        }
        air(-7, 7, 0, 1, -T, -T);
        air(-T, -T, 0, 1, -44, -38); air(T, T, 0, 1, -44, -38);
        for (const su of [-1, 1]) { put(su * 8, su * 8, 0, 2, -T, -T, B.GHOST_BRICK); put(su * 8, su * 8, 3, 3, -T, -T, B.GHOST_LAMP); }
    }

    function stairs() {
        // the grand stair: 15 wide, 26 whole steps down to below the lowest ground; balustrades, lamp posts
        for (let i = 1; i <= STEPS; i++) {
            const v = -T - i, top = -1 - i;
            put(-7, 7, lowL, top, v, v, i % 2 ? B.GHOST_STONE : B.GHOST_TILE);
            if (top + 6 > hiL) air(-7, 7, Math.max(top + 1, hiL + 1), top + 6, v, v); // (the cornice, the string course, the parapet: headroom over every step — never into the land)
            for (const su of [-1, 1]) {
                put(su * 8, su * 8, lowL, top + 1, v, v, B.GHOST_BRICK);
                if (i % 5 === 0) { put(su * 8, su * 8, top + 2, top + 2, v, v, B.GHOST_BRICK); put(su * 8, su * 8, top + 3, top + 3, v, v, B.GHOST_LAMP); }
            }
        }
        // obelisks at the top and the foot, mourners halfway down
        for (const su of [-1, 1]) {
            const u = su * 11;
            put(u - 1, u + 1, lowL, 5, -T - 3, -T - 1, B.GHOST_STONE);
            put(u, u, 6, 10, -T - 2, -T - 2, B.GHOST_BRICK);
            put(u, u, 11, 11, -T - 2, -T - 2, B.GHOST_LAMP);
            put(u - 1, u + 1, lowL, hiL + 5, -T - 27, -T - 25, B.GHOST_STONE);
            put(u, u, hiL + 6, hiL + 9, -T - 26, -T - 26, B.GHOST_BRICK);
            put(u, u, hiL + 10, hiL + 10, -T - 26, -T - 26, B.GHOST_LAMP);
            put(u - 1, u + 1, lowL, -14, -T - 14, -T - 12, B.GHOST_STONE);
            K.statue(u, -T - 13, -13, -su, 0, { angel: su > 0 });
        }
        // the side stairs: 7 wide, up to the postern gates
        for (const su of [-1, 1]) {
            for (let i = 1; i <= STEPS; i++) {
                const u = su * (T + i), top = -1 - i;
                put(u, u, lowL, top, -44, -38, i % 2 ? B.GHOST_STONE : B.GHOST_TILE);
                if (top + 6 > hiL) air(u, u, Math.max(top + 1, hiL + 1), top + 6, -44, -38);
                for (const v of [-45, -37]) {
                    put(u, u, lowL, top + 1, v, v, B.GHOST_BRICK);
                    if (i % 5 === 0) { put(u, u, top + 2, top + 2, v, v, B.GHOST_BRICK); put(u, u, top + 3, top + 3, v, v, B.GHOST_LAMP); }
                }
            }
        }
    }

    function courtyardFloor() {
        put(-IN, IN, -1, -1, -IN, IN, B.GHOST_TILE);
        for (let s = -56; s <= 56; s += 8) { put(s, s, -1, -1, -IN, IN, B.GHOST_STONE); put(-IN, IN, -1, -1, s, s, B.GHOST_STONE); }
        // the processional way from the gate to the keep: tiles, a brick border with pale stones set in it
        put(-3, 3, -1, -1, -IN, -17, B.GHOST_TILE);
        for (const su of [-1, 1]) {
            put(su * 4, su * 4, -1, -1, -IN, -17, B.GHOST_BRICK);
            for (let v = -54; v <= -20; v += 6) put(su * 4, su * 4, -1, -1, v, v, B.GHOST_LAMP);
        }
        put(-1, 1, -1, -1, -IN, -17, B.ARCANE_DARK);
    }

    // =========================================================== the curtain
    function curtain() {
        put(-CW, CW, 0, 15, -CW, -58, B.GHOST_STONE);
        put(-CW, CW, 0, 15, 58, CW, B.GHOST_STONE);
        put(-CW, -58, 0, 15, -CW, CW, B.GHOST_STONE);
        put(58, CW, 0, 15, -CW, CW, B.GHOST_STONE);
        p.walls(-CW - 1, CW + 1, -CW - 1, CW + 1, 0, 2, B.GHOST_STONE); // (the battered foot)
        p.walls(-CW - 1, CW + 1, -CW - 1, CW + 1, 9, 9, B.GHOST_BRICK); // (a string course)
        // the wall walk: tiles, the outer parapet with merlons, a low rail inside
        for (const [a, b] of [[-61, -59], [59, 61]]) { put(-61, 61, 15, 15, a, b, B.GHOST_TILE); put(a, b, 15, 15, -61, 61, B.GHOST_TILE); }
        p.walls(-CW, CW, -CW, CW, 16, 16, B.GHOST_BRICK);
        p.walls(-58, 58, -58, 58, 16, 16, B.GHOST_BRICK);
        for (let s = -60; s <= 59; s += 4) {
            put(s, s + 1, 17, 18, -CW, -CW, B.GHOST_STONE); put(s, s + 1, 17, 18, CW, CW, B.GHOST_STONE);
            put(-CW, -CW, 17, 18, s, s + 1, B.GHOST_STONE); put(CW, CW, 17, 18, s, s + 1, B.GHOST_STONE);
        }
        // arrow loops (shallow, on the outer face), pale lamps on the inner face
        for (let s = -48; s <= 48; s += 8) {
            if (Math.abs(s) <= 20) continue;
            air(s, s, 5, 7, -CW - 1, -CW); air(s, s, 5, 7, CW, CW + 1); air(-CW - 1, -CW, 5, 7, s, s); air(CW, CW + 1, 5, 7, s, s);
        }
        for (let s = -50; s <= 50; s += 10) {
            put(s, s, 4, 4, -58, -58, B.GHOST_LAMP); put(s, s, 4, 4, 58, 58, B.GHOST_LAMP);
            if (s < -24 || s > 20) { put(-58, -58, 4, 4, s, s, B.GHOST_LAMP); put(58, 58, 4, 4, s, s, B.GHOST_LAMP); }
        }
        // the postern gates at the side stairs (the battered foot cut through), a dark brick frame
        for (const su of [-1, 1]) {
            air(su * 58, su * (CW + 1), 0, 5, -42, -40);
            put(su * (CW + 1), su * (CW + 1), 0, 6, -43, -43, B.GHOST_BRICK); put(su * (CW + 1), su * (CW + 1), 0, 6, -39, -39, B.GHOST_BRICK);
            put(su * (CW + 1), su * (CW + 1), 6, 6, -43, -39, B.GHOST_BRICK);
            put(su * (CW + 1), su * (CW + 1), 7, 7, -41, -41, B.GHOST_LAMP);
            K.door(su * 60, -41, 0, 'courtyard');
        }
    }

    // =========================================================== the wings along the side walls
    function wings() {
        for (const su of [-1, 1]) {
            const a = su * 57, b = su * 44; // (the curtain's inner face is the outer wall)
            const u0 = Math.min(a, b), u1 = Math.max(a, b);
            put(u0, u1, -1, 15, -20, 18, B.GHOST_STONE);
            const iu0 = su < 0 ? -57 : 46, iu1 = su < 0 ? -46 : 57; // (the interior)
            const wall = su * 44; // (the alley side, 2 thick: ±44…±45)
            const doorA = (v0, v1) => (su < 0 ? door(-45, -44, 0, v0, v1) : door(44, 45, 0, v0, v1));
            const front = su * 52;
            door(front - 2, front + 2, 0, -20, -19, 8); // (the great door, 5 wide × 8 high)
            if (su < 0) {
                mk('wing_hall', 'hall', 'Большой зал', iu0, iu1, -18, 3, 0, 15, [[front, -20], [wall, -7], [-52, 4]]);
                doorA(-8, -6);
                door(-53, -51, 0, 4, 6);
                mk('wing_kitchen', 'kitchen', 'Кухня', iu0, iu1, 7, 16, 0, 15, [[-52, 6], [wall, 12]]);
                doorA(11, 13);
            } else {
                mk('wing_chapel', 'chapel', 'Часовня', iu0, iu1, -18, 1, 0, 15, [[front, -20], [wall, -7]]);
                doorA(-8, -6);
                mk('wing_library', 'library', 'Библиотека', iu0, iu1, 5, 16, 0, 15, [[wall, 10]]);
                doorA(9, 11);
            }
            // tall lancets on the alley side, two tiers
            for (const v of su < 0 ? [-15, -11, -2, 8] : [-15, -11, -2, 14]) {
                K.lancet(su * 45, v, -su, 0, 3, 6, 2, rng() < 0.3);
                K.lancet(su * 45, v, -su, 0, 10, 4, 2, rng() < 0.3);
            }
            // the front: a rose of pale light over the great door, lancets in the gable
            for (let dl = -3; dl <= 3; dl++) { const w = 3 - Math.abs(dl); put(front - w, front + w, 11 + dl, 11 + dl, -20, -20, B.GHOST_LAMP); }
            put(front, front, 8, 14, -20, -20, B.GHOST_BRICK); put(front - 3, front + 3, 11, 11, -20, -20, B.GHOST_BRICK);
            put(front - 3, front + 3, 8, 8, -21, -21, B.GHOST_BRICK); // (a drip moulding over the door)
            // the steep roof (2 : 1), its ridge finials
            for (let k = 0; k <= 6; k++) put(u0 + k, u1 - k, 16 + 2 * k, 17 + 2 * k, -20, 18, B.GHOST_ROOF);
            for (const v of [-20, 18]) { put(su * 50, su * 51, 30, 31, v, v, B.GHOST_BRICK); put(su * 50, su * 50, 32, 32, v, v, B.GHOST_LAMP); }
            for (let dl = -1; dl <= 1; dl++) put(su * 51 - (1 - Math.abs(dl)), su * 51 + (1 - Math.abs(dl)), 22 + dl, 22 + dl, -20, -20, B.GHOST_LAMP); // (a small rose in the gable)
            // a chimney over the kitchen / the library
            put(su * 55 - 1, su * 55 + 1, 16, 31, 10, 12, B.GHOST_BRICK);
            put(su * 55 - 1, su * 55 + 1, 32, 32, 10, 12, B.GHOST_STONE);
        }
    }

    // =========================================================== the keep
    function keep() {
        const turrets = [[-32, -16], [32, -16], [-32, 40], [32, 40], [-12, -17], [12, -17]];
        for (const [u, v] of turrets) p.cyl(u, v, 4, -1, 23, B.GHOST_STONE);
        put(-32, 32, -1, 23, -16, 40, B.GHOST_BRICK);
        p.walls(-32, 32, -16, 40, 0, 23, B.GHOST_STONE, 2);
        // ---- the ground floor (l 0)
        // the atrium: three storeys high, the grand stair in two flights each side, galleries on floors 8 and 16
        air(-13, 13, 0, 22, -14, -1);
        K.room('atrium', 'hall', 'Парадный холл', -13, 13, -14, -1, 0, 23);
        door(-2, 2, 0, -16, -15, 8); // (the main door)
        K.door(0, -16, 0, 'atrium');
        for (const su of [-1, 1]) {
            const a = su * 10, b = su * 12, c = su * 7, d = su * 9;
            for (let i = 0; i < 8; i++) put(Math.min(a, b), Math.max(a, b), 0, i, -11 + i, -11 + i, B.GHOST_BRICK); // (the first flights: up to floor 8)
            for (let j = 0; j < 8; j++) put(Math.min(c, d), Math.max(c, d), 0, 8 + j, -4 - j, -4 - j, B.GHOST_BRICK); // (the second: back down the hall to floor 16)
            put(Math.min(su * 10, su * 13), Math.max(su * 10, su * 13), 15, 15, -11, -4, B.GHOST_TILE); // (the side galleries of floor 16)
        }
        put(-13, 13, 7, 7, -3, -1, B.GHOST_TILE); put(-6, 6, 7, 7, -4, -4, B.GHOST_TILE); put(-6, 6, 8, 8, -4, -4, B.FENCE); // (the balcony of floor 8, its rail)
        put(-13, 13, 15, 15, -3, -1, B.GHOST_TILE); put(-9, 9, 15, 15, -4, -4, B.GHOST_TILE); put(-9, 9, 16, 16, -4, -4, B.FENCE); // (floor 16 at the back, its rail over the hall and the flights)
        for (const su of [-1, 1]) put(su * 10, su * 10, 16, 16, -10, -5, B.FENCE); // (the side galleries' rails over the second flights)
        put(-13, 13, 15, 15, -14, -12, B.GHOST_TILE); put(-6, 6, 15, 15, -11, -11, B.GHOST_TILE); put(-6, 6, 16, 16, -11, -11, B.FENCE); // (the landing of floor 16 at the front)
        put(-13, 13, -1, -1, -14, -1, B.GHOST_TILE); put(-2, 2, -1, -1, -14, -1, B.CARPET_RED); put(-1, 1, -1, -1, -14, -1, B.CARPET_PURPLE);
        for (const [u, v] of [[-6, -14], [6, -14]]) K.prop('candelabra', u, v, -1);
        K.chandelier(0, -8, 23, 8, true);
        for (const su of [-1, 1]) {
            K.banner(su * 5, -1, 0, -1, 9, 13, B.CARPET_PURPLE); K.banner(su * 5, -1, 0, -1, 17, 21, B.CARPET_RED);
            K.portrait(su * 10, -14, 0, 1, 18, B.CARPET_BLUE, B.GOLD);
            K.mirror(su * 13, -9, -su, 0, 1, 2, 4);
            K.cobweb(su * 13, -14, -su, 1, 23); K.cobweb(su * 13, -1, -su, -1, 23);
        }
        for (const [u, v, l] of [[0, -8, 0], [-11, -13, 0], [11, -13, 0], [0, -2, 8], [-11, -7, 16], [11, -7, 16], [0, -13, 16], [0, -2, 16]]) K.spot(u, v, l, 'atrium');
        // ground-floor rooms
        mk('k_dining', 'dining', 'Трапезная', -30, -17, -14, 12, 0, 7, [[-14, -8], [-24, 13], [-32, -3]]);
        door(-16, -14, 0, -9, -7); door(-25, -23, 0, 13, 15); door(-32, -31, 0, -4, -2);
        mk('k_armoury', 'armoury', 'Оружейная', -30, -17, 16, 38, 0, 7, [[-24, 15], [-14, 34], [-32, 26]]);
        door(-16, -14, 0, 33, 35); door(-32, -31, 0, 25, 27);
        mk('k_gallery', 'gallery', 'Галерея портретов', 17, 30, -14, 12, 0, 7, [[14, -8], [24, 13], [32, -3]]);
        door(14, 16, 0, -9, -7); door(23, 25, 0, 13, 15); door(31, 32, 0, -4, -2);
        mk('k_mirror', 'mirror', 'Зеркальный зал', 17, 30, 16, 38, 0, 7, [[24, 15], [14, 34], [32, 26]]);
        door(14, 16, 0, 33, 35); door(31, 32, 0, 25, 27);
        mk('k_pantry', 'store', 'Кладовая дворецкого', -13, -7, 30, 38, 0, 7, [[-14, 34], [-10, 40]]);
        door(-11, -9, 0, 39, 40);
        mk('k_servants', 'servants', 'Комната прислуги', 7, 13, 30, 38, 0, 7, [[14, 34], [10, 40]], { as: 'store' });
        door(9, 11, 0, 39, 40);
        const tr = mk('k_treasury', 'treasury', 'Сокровищница трона', -4, 4, 30, 36, 0, 7, [[0, 29]]);
        tr.keep(-3, 3, 33, 36); // (the throne's chest; its door through the great tower's back wall is cut with the tower)
        // ---- floor 8
        mk('k_ballroom', 'ballroom', 'Бальный зал', -30, -17, -14, 12, 8, 7, [[-14, -2], [-24, 13]]);
        door(-16, -14, 8, -3, -1); door(-25, -23, 8, 13, 15);
        mk('k_bed_a', 'bedroom', 'Спальня наследника', -30, -17, 16, 26, 8, 7, [[-24, 15], [-24, 27]]);
        door(-25, -23, 8, 27, 29);
        mk('k_bed_b', 'bedroom', 'Спальня гувернантки', -30, -17, 30, 38, 8, 7, [[-24, 29], [-14, 34]]);
        door(-16, -14, 8, 33, 35);
        mk('k_nursery', 'nursery', 'Детская', -13, 13, 30, 38, 8, 7, [[-14, 34], [14, 34]]);
        door(14, 16, 8, 33, 35);
        mk('k_servhall', 'servants', 'Людская', 17, 30, 24, 38, 8, 7, [[14, 34], [24, 23]]);
        door(23, 25, 8, 21, 23);
        mk('k_bed_c', 'bedroom', 'Спальня капитана стражи', 17, 30, 4, 20, 8, 7, [[24, 21], [24, 3]]);
        door(23, 25, 8, 1, 3);
        mk('k_study', 'study', 'Кабинет управляющего', 17, 30, -14, 0, 8, 7, [[14, -2], [24, 1]]);
        door(14, 16, 8, -3, -1);
        // ---- floor 16
        mk('k_royal', 'bedroom', 'Королевская опочивальня', -30, -17, -14, 8, 16, 7, [[-14, -13], [-24, 9]]);
        door(-16, -14, 16, -14, -12); door(-25, -23, 16, 9, 11);
        mk('k_music', 'music', 'Музыкальная комната', -30, -17, 12, 24, 16, 7, [[-24, 11], [-24, 25], [-32, 21]]);
        door(-25, -23, 16, 25, 27); door(-32, -31, 16, 20, 22);
        mk('k_boudoir', 'bedroom', 'Будуар', -30, -17, 28, 38, 16, 7, [[-24, 27], [-14, 34]]);
        door(-16, -14, 16, 33, 35);
        mk('k_ancestors', 'gallery', 'Зал предков', -13, 13, 30, 38, 16, 7, [[-14, 34], [14, 34]]);
        door(14, 16, 16, 33, 35);
        mk('k_countess', 'bedroom', 'Спальня графини', 17, 30, 28, 38, 16, 7, [[14, 34], [24, 27]]);
        door(23, 25, 16, 25, 27);
        mk('k_alchemy', 'study', 'Кабинет алхимика', 17, 30, 12, 24, 16, 7, [[24, 25], [24, 11], [32, 21]]);
        door(23, 25, 16, 9, 11); door(31, 32, 16, 20, 22);
        mk('k_guest', 'bedroom', 'Гостевая спальня', 17, 30, -14, 8, 16, 7, [[14, -13], [24, 9]]);
        door(14, 16, 16, -14, -12);
        // ---- the outside of the keep: the portal, pilasters, string courses, lancets
        for (const su of [-1, 1]) { put(su * 3, su * 4, 0, 9, -17, -17, B.GHOST_BRICK); }
        put(-4, 4, 9, 9, -17, -17, B.GHOST_BRICK); put(-3, 3, 8, 8, -17, -17, B.GHOST_BRICK); put(0, 0, 9, 9, -17, -17, B.GHOST_LAMP);
        for (let k = 0; k <= 5; k++) put(-6 + k, 6 - k, 10 + k, 10 + k, -18, -17, B.GHOST_ROOF); // (a pointed hood over the portal)
        p.walls(-33, 33, -17, 41, 7, 7, B.GHOST_BRICK); p.walls(-33, 33, -17, 41, 15, 15, B.GHOST_BRICK); p.walls(-33, 33, -17, 41, 23, 23, B.GHOST_BRICK);
        air(-2, 2, 0, 7, -17, -17); // (the courses never close the door)
        for (const u of [-24, -18, 18, 24]) put(u, u, 0, 22, -17, -17, B.GHOST_STONE); // (pilasters on the front)
        for (const u of [-27, -21, -15, 15, 21, 27]) put(u, u, 0, 22, 41, 41, B.GHOST_STONE); // (pilasters on the back; none by the back doors and the mausoleum's lane)
        for (const l0 of [0, 8, 16]) {
            for (const u of [-27, -21, 21, 27]) K.lancet(u, -15, 0, -1, l0 + 2, 5, 2, rng() < 0.35);
            for (const u of [-24, -18, -4, 4, 18, 24]) if (l0 > 0 || Math.abs(u) > 12) K.lancet(u, 39, 0, 1, l0 + 2, 5, 2, rng() < 0.35);
            for (const v of [-10, 4, 8, 32]) {
                if (l0 === 0 && (Math.abs(v + 3) <= 3 || Math.abs(v - 26) <= 3)) continue;
                if (l0 === 16 && Math.abs(v - 21) <= 3) continue;
                K.lancet(-31, v, -1, 0, l0 + 2, 5, 2, rng() < 0.35); K.lancet(31, v, 1, 0, l0 + 2, 5, 2, rng() < 0.35);
            }
        }
        // ---- the roof: a steep mansard (2 : 1) with a flat crest, dormers, chimneys, the front gable and its rose
        for (let k = 0; k <= 5; k++) put(-32 + k, 32 - k, 24 + 2 * k, 25 + 2 * k, -16 + k, 40 - k, B.GHOST_ROOF);
        p.walls(-27, 27, -11, 35, 36, 36, B.GHOST_BRICK);
        for (let u = -24; u <= 24; u += 8) { put(u, u, 37, 37, -11, -11, B.GHOST_LAMP); put(u, u, 37, 37, 35, 35, B.GHOST_LAMP); }
        const dormer = (u, v0, v1, face) => {
            put(u - 2, u + 2, 24, 29, Math.min(v0, v1), Math.max(v0, v1), B.GHOST_STONE);
            put(u - 1, u + 1, 25, 27, face, face, B.GHOST_LAMP); put(u, u, 25, 28, face, face, B.GHOST_BRICK);
            for (let k = 0; k <= 3; k++) put(u - 3 + k, u + 3 - k, 30 + k, 30 + k, Math.min(v0, v1) - 1, Math.max(v0, v1) + 1, B.GHOST_ROOF);
        };
        for (const u of [-24, 24]) dormer(u, -14, -11, -14);
        for (const u of [-22, 0, 22]) dormer(u, 35, 38, 38);
        for (const u of [-20, 20]) { put(u - 1, u + 1, 24, 41, 30, 32, B.GHOST_BRICK); put(u - 2, u + 2, 42, 42, 29, 33, B.GHOST_STONE); put(u, u, 42, 42, 31, 31, B.GHOST_LAMP); }
        for (let k = 0; k <= 8; k++) put(-8 + k, 8 - k, 24 + 2 * k, 25 + 2 * k, -16, -12, B.GHOST_STONE);
        for (let dl = -3; dl <= 3; dl++) { const w = 3 - Math.abs(dl); put(-w, w, 30 + dl, 30 + dl, -16, -16, B.GHOST_LAMP); }
        put(0, 0, 27, 33, -16, -16, B.GHOST_BRICK); put(-3, 3, 30, 30, -16, -16, B.GHOST_BRICK);
        put(0, 0, 42, 44, -14, -14, B.GHOST_BRICK); put(0, 0, 45, 45, -14, -14, B.GOLD);
        // the turrets above the roof, their spires
        for (const [u, v] of turrets) {
            p.cyl(u, v, 4, 24, 41, B.GHOST_STONE);
            p.cyl(u, v, 5, 39, 41, B.GHOST_BRICK, 3.6);
            for (const l of [12, 20, 30]) { const du = u > 0 ? 4 : -4; put(u + du, u + du, l, l + 1, v, v, B.GHOST_LAMP); }
            K.spire(u, v, 5.5, 42, Math.abs(u) === 12 ? 12 : 15);
        }
    }

    // =========================================================== the great tower and the throne hall
    function greatTower() {
        const u = 0, v = 14;
        p.cyl(u, v, 14, -1, 55, B.GHOST_STONE);
        p.cyl(u, v, 15, 53, 55, B.GHOST_BRICK, 13.6); // (the machicolations' ring)
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const cu = Math.round(u + Math.cos(a) * 14.6), cv = Math.round(v + Math.sin(a) * 14.6); put(cu, cu, 52, 52, cv, cv, B.GHOST_BRICK); }
        // ---- the throne hall: two storeys, a ring of pillars, the dais, banners, a great chandelier
        p.cyl(u, v, 12, 0, 14, 0);
        door(-2, 2, 0, -2, 3, 7); // (from the atrium, 5 wide)
        door(-1, 1, 0, 24, 29); // (behind the throne: to the treasury)
        K.door(0, -1, 0, 'throne');
        p.cyl(u, v, 12, -1, -1, B.GHOST_TILE);
        p.cyl(u, v, 9.6, -1, -1, B.GHOST_STONE, 8.6);
        p.cyl(u, v, 1.2, -1, -1, B.GHOST_LAMP);
        K.room('throne', 'throne', 'Тронный зал', -12, 12, 2, 26, 0, 15);
        for (const deg of [-150, -110, -70, -30, 10, 170]) {
            const a = deg * Math.PI / 180, pu = Math.round(u + Math.cos(a) * 9.5), pv = Math.round(v + Math.sin(a) * 9.5);
            put(pu, pu + 1, 0, 14, pv, pv + 1, B.GHOST_BRICK);
            put(pu, pu + 1, 0, 0, pv, pv + 1, B.GHOST_STONE); put(pu, pu + 1, 11, 11, pv, pv + 1, B.GHOST_STONE);
            put(pu, pu, 10, 10, pv, pv, B.GHOST_LAMP);
        }
        put(-5, 5, 0, 0, 15, 20, B.GHOST_BRICK); // (the dais: two steps)
        put(-3, 3, 1, 1, 17, 20, B.ARCANE_DARK);
        put(-1, 1, 2, 2, 18, 19, B.GHOST_BRICK); // (the throne: its seat, arms, its tall back, a crown of gold)
        put(-1, -1, 3, 3, 18, 19, B.GHOST_STONE); put(1, 1, 3, 3, 18, 19, B.GHOST_STONE);
        put(-1, 1, 2, 7, 20, 20, B.GHOST_STONE); put(0, 0, 8, 9, 20, 20, B.GHOST_STONE);
        put(-1, 1, 8, 8, 20, 20, B.GOLD); put(0, 0, 10, 10, 20, 20, B.GOLD); put(0, 0, 4, 4, 19, 19, B.CARPET_PURPLE);
        put(-1, 1, -1, -1, 2, 14, B.CARPET_PURPLE); put(-2, -2, -1, -1, 2, 14, B.CARPET_RED); put(2, 2, -1, -1, 2, 14, B.CARPET_RED);
        for (const su of [-1, 1]) { K.prop('candelabra', su * 3, 18, 1); K.prop('candelabra', su * 5, 14, -1); K.prop('candle', su * 4, 15, 0); }
        for (const deg of [-125, -55, 30, 150, 60, 120]) { // (banners and lamps on the round wall)
            const a = deg * Math.PI / 180, wu = Math.round(u + Math.cos(a) * 12.9), wv = Math.round(v + Math.sin(a) * 12.9);
            put(wu, wu, 3, 11, wv, wv, deg % 2 ? B.CARPET_RED : B.CARPET_PURPLE); put(wu, wu, 12, 12, wv, wv, B.GOLD);
        }
        for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 6, wu = Math.round(u + Math.cos(a) * 12.9), wv = Math.round(v + Math.sin(a) * 12.9); put(wu, wu, 5, 5, wv, wv, B.GHOST_LAMP); }
        K.chandelier(0, 8, 15, 4, true);
        K.chandelier(0, 14, 15, 2, false);
        for (const [su, sv] of [[0, 4], [-6, 8], [6, 8], [-8, 18], [8, 18], [0, 23], [-6, 23], [6, 23]]) K.spot(su, sv, 0, 'throne');
        // ---- the floors above (16 … 48): a spiral stair, the door from the atrium's gallery, the chest's place kept at the top
        const gt = K.roundTower(u, v, {
            R: 14, Rin: 12, bandIn: 8.4, floors: [16, 24, 32, 40, 48], from: 15, top: 55, stone: B.GHOST_STONE, slab: B.GHOST_TILE, stepT: B.GHOST_BRICK,
            doors: [{ floor: 0, du: 0, dv: -1, off: 0 }], keep: [{ floor: 4, ang: Math.PI / 2, half: 0.5 }], courses: false,
            windows: (i) => i >= 3,
        });
        void gt;
        const names = [['gt16', 'tower', 'Зал великой башни'], ['gt24', 'study', 'Алхимическая лаборатория'], ['gt32', 'bedroom', 'Покои Белой Дамы'], ['gt40', 'study', 'Обсерватория'], ['gt48', 'treasury', 'Сокровищница башни']];
        [16, 24, 32, 40, 48].forEach((l, i) => {
            const [id, kind, name] = names[i];
            K.room(id, kind, name, -12, 12, 2, 26, l, 7);
            K.spot(i === 3 ? 0 : 0, i === 3 ? 9 : 14, l, id);
            K.spot(-4, 10, l, id);
            K.chandelier(0, 14, l + 7, 0, true);
            if (i === 1) { put(-3, -1, l, l, 16, 17, B.FENCE); put(-3, -1, l + 1, l + 1, 16, 17, B.PLANKS_DARK); K.prop('candle', -2, 16, l + 1); K.prop('urn', -1, 17, l + 1); }
            if (i === 2) { put(2, 5, l, l + 1, 10, 14, B.CLOTH_WHITE); K.prop('candelabra', 1, 9, l - 1); }
            if (i === 3) { // the telescope on its tripod, a star chart of runes on the floor
                p.cyl(0, 14, 3.4, l - 1, l - 1, B.RUNE, 2.4);
                put(0, 0, l, l + 1, 14, 14, B.PLANKS_DARK); put(0, 1, l + 2, l + 2, 14, 14, B.GOLD); put(1, 2, l + 3, l + 3, 14, 14, B.GOLD); put(2, 3, l + 4, l + 4, 14, 14, B.GOLD); put(3, 3, l + 5, l + 5, 14, 14, B.GHOST_LAMP);
                K.prop('stool', -2, 14, l - 1, 1, 0);
            }
            if (i === 4) { put(-5, -4, l, l, 18, 19, B.GOLD); put(4, 5, l, l, 18, 19, B.GOLD); K.prop('urn', -5, 16, l - 1); K.prop('urn', 5, 16, l - 1); K.prop('candelabra', 0, 19, l - 1); }
        });
        // ---- the spire: four pinnacles round its foot, the cone, a pale lamp and gold on the tip
        for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, pu = Math.round(u + Math.cos(a) * 13.5), pv = Math.round(v + Math.sin(a) * 13.5); put(pu, pu, 56, 59, pv, pv, B.GHOST_BRICK); put(pu, pu, 60, 60, pv, pv, B.GHOST_LAMP); }
        K.spire(u, v, 14.5, 56, 21);
    }

    // =========================================================== the towers of the curtain
    function cornerTowers() {
        for (const sv of [-1, 1]) for (const su of [-1, 1]) {
            const u = su * 56, v = sv * 56, id = 'ct' + (sv < 0 ? 'f' : 'b') + (su < 0 ? 'w' : 'e');
            const doors = [
                { floor: 0, du: -su, dv: 0, off: 0 }, // (into the courtyard)
                { floor: 2, du: -su, dv: 0, off: sv * 4 }, // (the front / back wall walk; the side walks are reached by the covered bridges — a spiral has no room for two doors on one floor)
            ];
            if (sv < 0) doors.push({ floor: 3, du: -su, dv: 0, off: sv * 4 }); // (the hoarding to the gatehouse)
            K.roundTower(u, v, { R: 12, Rin: 10, bandIn: 6.4, floors: [0, 8, 16, 24, 32, 40, 48], from: -1, top: 55, stone: B.GHOST_STONE, slab: B.GHOST_TILE, stepT: B.GHOST_BRICK, doors, windows: (i) => i > 0 });
            p.cyl(u, v, 13, 53, 55, B.GHOST_BRICK, 11.6);
            for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const cu = Math.round(u + Math.cos(a) * 12.6), cv = Math.round(v + Math.sin(a) * 12.6); put(cu, cu, 52, 52, cv, cv, B.GHOST_BRICK); }
            K.spire(u, v, 13.2, 56, 18);
            const names = ['Караульная', 'Склад башни', 'Выход на стену', 'Дозорная', 'Кладовая башни', 'Комната сторожа', 'Верх башни'];
            [0, 8, 16, 24, 32, 40, 48].forEach((l, i) => {
                const rid = id + '_' + l;
                K.room(rid, 'tower', names[i], u - 10, u + 10, v - 10, v + 10, l, 7);
                if (i === 0 || i === 2 || i === 3 || i === 6) K.spot(u, v, l, rid);
                if (i === 0 || i === 3) K.prop(i === 0 ? 'stool' : 'candle', u + 2, v - 2, l - 1);
                if (i === 6) K.prop('candelabra', u - 2, v + 2, l - 1);
                K.chandelier(u, v, l + 7, 0, false);
            });
        }
    }

    function wallTowers() {
        const small = (u, v, along, yardDoor, rid, name) => {
            p.cyl(u, v, 6, -1, 23, B.GHOST_STONE);
            p.cyl(u, v, 4, 0, 6, 0); p.cyl(u, v, 4, -1, -1, B.GHOST_TILE);
            p.cyl(u, v, 4, 16, 22, 0); p.cyl(u, v, 4, 15, 15, B.GHOST_TILE);
            p.cyl(u, v, 7, 22, 23, B.GHOST_BRICK, 5.6);
            // the wall walk goes through it; a door into the courtyard below
            if (along === 'v') air(u - 1, u + 1, 16, 21, v - 7, v + 7); else air(u - 7, u + 7, 16, 21, v - 1, v + 1);
            yardDoor();
            K.spire(u, v, 7.5, 24, 14);
            K.room(rid, 'tower', name, u - 4, u + 4, v - 4, v + 4, 0, 7);
            K.room(rid + '_w', 'tower', name + ' (стена)', u - 4, u + 4, v - 4, v + 4, 16, 6);
            K.spot(u, v, 0, rid); K.spot(u, v, 16, rid + '_w');
            K.prop('candle', u + 2, v + 2, -1);
        };
        for (const su of [-1, 1]) {
            const u = su * 60;
            small(u, -28, 'v', () => { air(Math.min(su * 53, su * 57), Math.max(su * 53, su * 57), 0, 5, -29, -27); K.door(su * 55, -28, 0, 'courtyard'); }, 'wt_s' + (su < 0 ? 'w' : 'e'), 'Боковая башня');
            const ub = su * 28;
            small(ub, 60, 'u', () => { air(ub - 1, ub + 1, 0, 5, 53, 57); K.door(ub, 55, 0, 'garden'); }, 'wt_b' + (su < 0 ? 'w' : 'e'), 'Задняя башня');
        }
    }

    // =========================================================== the gatehouse
    function gatehouse() {
        put(-16, 16, -1, 23, -66, -52, B.GHOST_STONE);
        for (const su of [-1, 1]) p.cyl(su * 14, -63, 5, -1, 31, B.GHOST_STONE);
        air(-5, 5, 0, 12, -66, -52); // (the gate passage 11 × 13)
        put(-5, 5, -1, -1, -66, -52, B.GHOST_TILE); put(-1, 1, -1, -1, -66, -52, B.ARCANE_DARK);
        for (const [a, l0] of [[5, 10], [4, 11], [3, 12]]) { put(-a, -a, l0, 12, -66, -52, B.GHOST_BRICK); put(a, a, l0, 12, -66, -52, B.GHOST_BRICK); } // (the pointed vault)
        K.room('gate', 'gate', 'Воротный проход', -5, 5, -66, -52, 0, 13);
        for (const [u, v] of [[0, -63], [0, -55], [-3, -59], [3, -59]]) K.spot(u, v, 0, 'gate');
        // the guard rooms, the gallery over the gate, its murder holes
        mk('gate_gw', 'store', 'Караульня', -14, -7, -64, -54, 0, 7, [[-6, -59]]);
        mk('gate_ge', 'armoury', 'Караульня', 7, 14, -64, -54, 0, 7, [[6, -59]]);
        door(-6, -6, 0, -60, -58); door(6, 6, 0, -60, -58);
        mk('gate_gallery', 'armoury', 'Галерея над воротами', -14, 14, -64, -54, 16, 7, [[-15, -60], [15, -60]]);
        late.push(() => { for (const [u, v] of [[-3, -62], [0, -62], [3, -62], [-3, -56], [0, -56], [3, -56]]) { air(u, u, 13, 14, v, v); put(u, u, 15, 15, v, v, B.GHOST_LAMP); } }); // (the murder holes: shafts in the vault, a pale grate in the gallery's floor — nobody slips through)
        for (const su of [-1, 1]) air(Math.min(su * 13, su * 20), Math.max(su * 13, su * 20), 16, 21, -61, -59); // (out to the wall walks, through the gate towers)
        // the roof walk: a parapet with merlons
        put(-15, 15, 23, 23, -65, -53, B.GHOST_TILE);
        p.walls(-16, 16, -66, -52, 24, 24, B.GHOST_BRICK);
        for (let s = -14; s <= 14; s += 4) { put(s, s + 1, 25, 25, -66, -66, B.GHOST_STONE); put(s, s + 1, 25, 25, -52, -52, B.GHOST_STONE); }
        K.room('gate_roof', 'gate', 'Крыша надвратной башни', -15, 15, -65, -53, 24, 8);
        K.spot(0, -59, 24, 'gate_roof');
        // the facade: a pointed arch round the gate, a keystone of pale light, machicolations, banners, lancets of the gallery
        for (const su of [-1, 1]) put(su * 6, su * 7, 0, 13, -67, -67, B.GHOST_BRICK);
        put(-7, 7, 13, 14, -67, -67, B.GHOST_BRICK); put(0, 0, 14, 14, -67, -67, B.GHOST_LAMP);
        for (let s = -8; s <= 8; s += 2) put(s, s, 21, 21, -67, -67, B.GHOST_BRICK);
        put(-9, 9, 22, 23, -67, -67, B.GHOST_STONE);
        for (const su of [-1, 1]) { put(su * 2, su * 2, 15, 20, -67, -67, B.CARPET_PURPLE); put(su * 2, su * 2, 21, 21, -67, -67, B.GOLD); }
        for (const u of [-6, 6]) K.lancet(u, -65, 0, -1, 17, 5, 2, u === 6);
        // the gate towers: their corbels and spires
        for (const su of [-1, 1]) {
            p.cyl(su * 14, -63, 6, 29, 31, B.GHOST_BRICK, 4.6);
            for (const l of [6, 14, 26]) put(su * 14 + su * 5, su * 14 + su * 5, l, l + 1, -63, -63, B.GHOST_LAMP);
            K.spire(su * 14, -63, 6.5, 32, 14);
        }
    }

    // =========================================================== bridges and hoardings
    function bridges() {
        for (const su of [-1, 1]) {
            // a covered bridge from the keep's top floor over the alley to the wall walk
            const a = su * 58, b = su * 33, u0 = Math.min(a, b), u1 = Math.max(a, b);
            put(u0, u1, 13, 15, 19, 23, B.GHOST_STONE);
            put(u0, u1, 15, 15, 20, 22, B.GHOST_TILE);
            put(u0, u1, 16, 21, 19, 19, B.GHOST_BRICK); put(u0, u1, 16, 21, 23, 23, B.GHOST_BRICK);
            for (let k = 0; k <= 2; k++) put(u0, u1, 22 + k, 22 + k, 19 + k, 23 - k, B.GHOST_ROOF);
            air(u0, u1, 16, 21, 20, 22);
            for (let u = u0 + 3; u <= u1 - 3; u += 5) { air(u, u + 1, 17, 19, 19, 19); air(u, u + 1, 17, 19, 23, 23); }
            put(su * 45, su * 44, 0, 12, 19, 23, B.GHOST_STONE); // (a pier at the wing's back)
            K.room('bridge_' + (su < 0 ? 'w' : 'e'), 'gallery', 'Крытый мост', u0, u1, 20, 22, 16, 6);
            K.spot(su * 45, 21, 16, 'bridge_' + (su < 0 ? 'w' : 'e'));
            K.door(su * 33, 21, 16, 'bridge'); K.door(su * 58, 21, 16, 'bridge');
            // the hoarding from the front corner tower to the gatehouse's roof walk, over the wall walk
            const h0 = su * 45, h1 = su * 17, hu0 = Math.min(h0, h1), hu1 = Math.max(h0, h1);
            put(hu0, hu1, 23, 23, -62, -58, B.GHOST_TILE);
            put(hu0, hu1, 24, 29, -62, -62, B.GHOST_BRICK); put(hu0, hu1, 24, 29, -58, -58, B.GHOST_BRICK);
            put(hu0, hu1, 30, 30, -62, -58, B.GHOST_ROOF); put(hu0, hu1, 31, 31, -61, -59, B.GHOST_ROOF); put(hu0, hu1, 32, 32, -60, -60, B.GHOST_ROOF);
            air(hu0, hu1, 24, 28, -61, -59);
            for (let u = hu0 + 2; u <= hu1 - 2; u += 4) { air(u, u, 25, 27, -62, -62); air(u, u, 25, 27, -58, -58); }
            for (let u = hu0 + 4; u <= hu1 - 1; u += 6) { put(u, u, 17, 22, -62, -62, B.GHOST_BRICK); put(u, u, 17, 22, -58, -58, B.GHOST_BRICK); } // (posts on the parapets)
            air(Math.min(su * 9, su * 20), Math.max(su * 9, su * 20), 24, 28, -61, -59); // (through the gate tower onto the roof walk)
            K.room('hoard_' + (su < 0 ? 'w' : 'e'), 'gallery', 'Крытая галерея на стене', hu0, hu1, -61, -59, 24, 5);
            K.spot(su * 30, -60, 24, 'hoard_' + (su < 0 ? 'w' : 'e'));
            // spots along the wall walks
            for (const [wu, wv] of [[su * 60, -10], [su * 60, 30], [su * 30, -60], [su * 30, 60], [su * 60, 40]]) K.spot(wu, wv, 16, 'wallwalk');
        }
    }

    // =========================================================== the courtyard
    function yard() {
        // the dry fountain with a weeping angel
        const fu = 0, fv = -36;
        p.cyl(fu, fv, 6, 0, 0, B.GHOST_BRICK, 4.6); // (a rim one block high: whoever lands in the dry basin steps out)
        p.cyl(fu, fv, 6, 1, 1, B.GHOST_STONE, 5.4);
        p.cyl(fu, fv, 4.6, -1, -1, B.GHOST_TILE);
        for (const [du, dv] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) put(fu + du, fu + du, -1, -1, fv + dv, fv + dv, B.GHOST_LAMP);
        p.cyl(fu, fv, 1.2, 0, 4, B.GHOST_STONE);
        p.cyl(fu, fv, 2.6, 5, 5, B.GHOST_BRICK);
        p.cyl(fu, fv, 2.6, 6, 6, B.GHOST_BRICK, 1.8);
        K.statue(fu, fv, 6, 0, -1, { angel: true, ped: B.GHOST_STONE });
        K.room('yard', 'courtyard', 'Двор', -IN, IN, -IN, -21, 0, 30);
        // mourners and broken statues along the way, lamp posts, benches
        for (const su of [-1, 1]) {
            K.statue(su * 11, -46, 0, -su, 0, { angel: su > 0 });
            K.statue(su * 11, -26, 0, -su, 0, { broken: su > 0 });
            for (const v of [-50, -42, -30, -22]) { put(su * 6, su * 6, 0, 4, v, v, B.GHOST_BRICK); put(su * 6, su * 6, 5, 5, v, v, B.GHOST_LAMP); put(su * 6, su * 6, 6, 6, v, v, B.GHOST_STONE); }
            put(su * 9, su * 9, 0, 0, -38, -34, B.GHOST_BRICK);
            K.prop('candle', su * 9, -36, 0);
        }
        // the well
        const wu = 28, wv = -44;
        p.cyl(wu, wv, 2.5, 0, 1, B.GHOST_BRICK, 1.4);
        p.cyl(wu, wv, 1.4, 0, 0, B.GHOST_LAMP); // (pale «water» one block under the rim's top: nobody is trapped in the well)
        put(wu - 2, wu - 2, 2, 5, wv, wv, B.PLANKS_DARK); put(wu + 2, wu + 2, 2, 5, wv, wv, B.PLANKS_DARK);
        put(wu - 2, wu + 2, 6, 6, wv, wv, B.PLANKS_DARK);
        put(wu - 3, wu + 3, 7, 7, wv - 1, wv + 1, B.GHOST_ROOF); put(wu - 2, wu + 2, 8, 8, wv, wv, B.GHOST_ROOF);
        put(wu, wu, 3, 5, wv, wv, B.FENCE); // (the rope)
        K.prop('urn', wu + 3, wv + 2, -1);
        // dead trees, rubble, a broken statue in the far corner
        for (const [u, v, h] of [[-30, -48, 9], [34, -50, 8], [-42, -32, 10], [42, -30, 9], [-22, -26, 7], [22, -28, 8]]) K.deadTree(u, v, 0, h);
        for (const [u, v] of [[-48, -24], [46, -40], [-34, -38]]) { put(u, u + 1, 0, 0, v, v + 1, B.GHOST_STONE); put(u, u, 1, 1, v, v, B.GHOST_STONE); }
        K.statue(-26, -44, 0, 1, 0, { broken: true });
        for (const [u, v] of [[0, -48], [-20, -40], [20, -40], [-40, -52], [40, -52], [0, -24], [-48, -32], [48, -32], [-30, -24], [30, -24], [-38, 0], [38, 0], [-38, -16], [38, -16]]) K.spot(u, v, 0, 'yard');
    }

    function gardens() {
        // the graveyard behind the west wing, the dead garden behind the east
        K.room('graveyard', 'courtyard', 'Кладбище', -IN, -33, 19, IN, 0, 30);
        for (const u of [-53, -49, -45, -41]) for (const v of [27, 31, 35, 39, 43]) {
            if (Math.hypot(u + 56, v - 56) < 14) continue;
            const broken = rng() < 0.3;
            put(u, u, 0, broken ? 0 : 1, v, v, B.GHOST_BRICK);
            if (!broken) { put(u, u, 2, 3, v, v, B.GHOST_STONE); put(u, u, 3, 3, v - 1, v + 1, B.GHOST_STONE); }
            if (rng() < 0.12) K.prop('candle', u + 1, v, -1);
        }
        K.deadTree(-37, 33, 0, 9);
        for (const [u, v] of [[-43, 25], [-51, 23], [-38, 45], [-38, 50]]) K.spot(u, v, 0, 'graveyard');
        K.room('deadgarden', 'courtyard', 'Мёртвый сад', 33, IN, 19, IN, 0, 30);
        // a ruined pavilion: four posts and a pointed roof
        const gu = 46, gv = 32;
        for (const [du, dv] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) put(gu + du, gu + du, 0, 5, gv + dv, gv + dv, B.GHOST_BRICK);
        for (let k = 0; k <= 3; k++) put(gu - 4 + k, gu + 4 - k, 6 + k, 6 + k, gv - 4 + k, gv + 4 - k, B.GHOST_ROOF);
        put(gu, gu, 10, 10, gv, gv, B.GHOST_LAMP);
        put(gu - 1, gu + 1, 0, 0, gv + 2, gv + 2, B.GHOST_BRICK);
        K.prop('stool', gu, gv, -1);
        for (const [u, v, h] of [[38, 24, 8], [52, 44, 9], [38, 44, 7], [52, 22, 8]]) K.deadTree(u, v, 0, h);
        p.cyl(42, 50, 3.5, 0, 0, B.GHOST_BRICK, 2.4); p.cyl(42, 50, 2.4, -1, -1, B.GHOST_LAMP); // (a dry pond with pale light in its bed)
        for (const [u, v] of [[40, 28], [50, 38], [44, 26]]) K.spot(u, v, 0, 'deadgarden');
        // the back garden: the mausoleum over the crypt's stair, angels at its door
        K.room('backgarden', 'courtyard', 'Задний сад', -IN, IN, 41, IN, 0, 30);
        put(-8, 8, -1, 9, 45, 55, B.GHOST_STONE);
        air(-7, 7, 0, 8, 46, 54);
        put(-7, 7, -1, -1, 46, 54, B.GHOST_TILE);
        door(-2, 2, 0, 45, 45, 7);
        for (const su of [-1, 1]) { put(su * 4, su * 4, 0, 9, 44, 44, B.GHOST_BRICK); put(su * 3, su * 3, 0, 1, 47, 54, B.GHOST_BRICK); }
        for (let k = 0; k <= 8; k++) put(-9 + k, 9 - k, 10 + k, 10 + k, 44, 56, B.GHOST_ROOF);
        K.statue(0, 44, 19, 0, -1, { angel: true });
        for (const su of [-1, 1]) {
            K.statue(su * 11, 47, 0, 0, -1, { angel: true });
            put(su * 5, su * 6, 0, 1, 48, 52, B.CS_WHITE); put(su * 5, su * 6, 2, 2, 48, 52, B.GHOST_BRICK); // (two old tombs inside)
            K.prop('candle', su * 5, 50, 2);
            put(su * 7, su * 7, 4, 4, 50, 50, B.GHOST_LAMP);
        }
        K.room('mausoleum', 'crypt', 'Мавзолей', -7, 7, 46, 54, 0, 9);
        K.door(0, 45, 0, 'mausoleum');
        for (const [u, v] of [[0, 43], [-20, 46], [20, 46], [-34, 47], [14, 51]]) K.spot(u, v, 0, 'backgarden');
        for (const [u, v, h] of [[-24, 50, 9], [24, 50, 8]]) K.deadTree(u, v, 0, h);
        // the stair down: 13 whole steps under the mausoleum and on into the terrace
        for (let k = 1; k <= 13; k++) {
            const v = 45 + k, top = -1 - k;
            air(-2, 2, top + 1, v <= 54 ? -1 : top + 6, v, v);
            put(-2, 2, top, top, v, v, B.GHOST_TILE);
        }
        K.stairs.push({ kind: 'crypt', u: 0, v0: 46, v1: 58 });
    }

    // =========================================================== the cellars (inside the terrace, above the ground)
    function cellars() {
        // the open stair in the west alley: a gate of two pillars, low walls round the pit, 13 steps down
        put(-40, -40, 0, 6, 1, 1, B.GHOST_BRICK); put(-36, -36, 0, 6, 1, 1, B.GHOST_BRICK);
        put(-40, -36, 7, 7, 1, 1, B.GHOST_BRICK); put(-41, -35, 8, 8, 0, 2, B.GHOST_ROOF); put(-38, -38, 7, 7, 1, 1, B.GHOST_LAMP);
        for (let k = 1; k <= 13; k++) {
            const v = 1 + k, top = -1 - k;
            air(-39, -37, top + 1, -1, v, v);
            put(-39, -37, top, top, v, v, B.GHOST_TILE);
        }
        put(-40, -40, 0, 1, 2, 15, B.GHOST_BRICK); put(-36, -36, 0, 1, 2, 15, B.GHOST_BRICK); put(-40, -36, 0, 1, 15, 15, B.GHOST_BRICK); // (walls 2 high: nobody steps into the pit by chance)
        put(-40, -40, 1, 1, 8, 8, B.GHOST_LAMP); put(-36, -36, 1, 1, 8, 8, B.GHOST_LAMP);
        K.door(-38, 1, 0, 'cellar');
        const L = BS; // (−13)
        air(-39, -37, L, L + 6, 14, 18);
        mk('c_corridor', 'store', 'Подвальный коридор', -39, -14, 16, 18, L, 7, [], { furnish: false });
        // the wine cellar: a vault on pillars
        const wine = mk('c_wine', 'wine', 'Винный погреб', -32, -6, -10, 12, L, 7, [[-24, 13]]);
        door(-25, -23, L, 13, 15);
        air(-31, -7, L + 7, L + 7, -9, 11); // (the vault's crown)
        for (const pu of [-26, -19, -12]) for (const pv of [-4, 6]) wine.put(pu, pu + 1, pv, pv + 1, () => put(pu, pu + 1, L, L + 7, pv, pv + 1, B.GHOST_BRICK), 9);
        mk('c_store', 'store', 'Подвальная кладовая', -36, -24, 20, 32, L, 7, [[-30, 19]]);
        door(-31, -29, L, 19, 19);
        // the dungeon: a passage, an aisle, cells behind bars (each door 3 wide: the bars were broken long ago)
        air(-16, -14, L, L + 6, 16, 27);
        mk('c_aisle', 'cell', 'Тюремный коридор', -16, 16, 28, 30, L, 7, [], { furnish: false });
        K.room('c_passage', 'cell', 'Спуск в темницу', -16, -14, 16, 27, L, 7);
        let ci = 0;
        for (const [cv0, cv1, bar] of [[20, 26, 27], [32, 38, 31]]) for (const u0 of [-12, -6, 0, 6]) {
            const R = mk('c_cell' + ci++, 'cell', 'Темница', u0, u0 + 4, cv0, cv1, L, 7, [[u0 + 2, bar]]);
            put(u0, u0 + 4, L, L + 5, bar, bar, B.FENCE);
            air(u0 + 1, u0 + 3, L, L + 5, bar, bar);
            void R;
        }
        // the hidden store: round two corners from the aisle's dark end
        air(12, 14, L, L + 6, 20, 27);
        air(15, 18, L, L + 6, 20, 22);
        const hid = mk('c_hidden', 'store', 'Тайная кладовая', 19, 28, 15, 25, L, 7, [[18, 21]]);
        hid.keep(24, 28, 17, 23); // (the cellar's chest)
        K.room('c_bend', 'cell', 'Тёмный проход', 12, 18, 20, 27, L, 7);
        for (const [u, v] of [[-30, 17], [-20, 17], [-15, 22], [-8, 29], [8, 29], [15, 29], [13, 24], [16, 21], [-38, 15]]) K.spot(u, v, L, 'cellar');
    }

    function crypt() {
        const L = BS;
        air(-46, 29, L + 7, L + 7, 60, 64); // (the vault's crown)
        const R = mk('crypt', 'crypt', 'Склеп', -47, 30, 59, 65, L, 7, [[0, 58]], { furnish: true });
        R.keep(-47, -44, 59, 65);
        for (let u = -44; u <= 28; u += 6) put(u, u, L + 6, L + 7, 59, 65, B.GHOST_BRICK); // (the ribs of the vault)
        for (const uc of [-42, -34, -26, -18, -10, 10, 18, 26]) {
            air(uc - 2, uc + 2, L, L + 5, 53, 58);
            put(uc - 2, uc + 2, L - 1, L - 1, 53, 58, B.GHOST_TILE);
            put(uc - 1, uc + 1, L, L + 1, 54, 56, B.CS_WHITE); // (a tomb, its black lid)
            put(uc - 1, uc + 1, L + 2, L + 2, 54, 56, B.GHOST_BRICK);
            put(uc, uc, L + 3, L + 3, 52, 52, B.GHOST_LAMP);
            K.prop(rng() < 0.5 ? 'candle' : 'urn', uc, 57, L - 1);
            K.room('crypt_a' + uc, 'crypt', 'Ниша склепа', uc - 2, uc + 2, 53, 58, L, 6);
        }
        for (let u = -44, i = 0; u <= 28; u += 3, i++) { put(u, u, L + 3, L + 3, 66, 66, i % 2 ? B.GHOST_LAMP : B.CS_WHITE); put(u, u, L + 1, L + 1, 66, 66, B.CS_WHITE); } // (the ossuary wall: bones and pale lamps)
        for (const u of [-36, -4, 20]) K.prop('candle', u, 65, L - 1);
        for (const [u, v] of [[-40, 62], [-30, 62], [-20, 62], [-10, 62], [10, 62], [20, 62], [0, 61]]) K.spot(u, v, L, 'crypt');
    }

    // =========================================================== the four chests
    function placeChests() {
        const c = (id, u, v, fu, fv, l) => { const g = LOOK[id]; K.chest(id, g.look, g.where, u, v, fu, fv, l); };
        c('throne', 0, 35, 0, -1, 0); // (behind the throne: the treasury beyond the door in the hall's back wall)
        c('tower', 0, 23, 0, -1, 48); // (the top of the great tower)
        c('cellar', 27, 20, -1, 0, BS); // (the hidden store of the cellars)
        c('crypt', -50, 62, 1, 0, BS); // (the crypt's far end)
    }
}
