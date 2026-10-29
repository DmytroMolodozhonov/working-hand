/**
 * LoreStand.js — the reading stand (аналой) of the world's history: a book lies open on a sloping board on a
 * post of two blocks. Pure numbers (no THREE): the builders (WizardTowers.js, WizardVillages.js) lay the post
 * and the spot, LoreLibrary.js makes the board and the book, tests check the sizes.
 *
 * Sizes (blocks are 1 m, the hero is ~3.5 m, eyes ≈ 3.4 m, a counter 2 m): the post 1 × 1 × 2 m, the board
 * 1.8 × 1.25 m (an open book of the game is 1.54 × 0.96 m with its covers) tilted 25°, its middle 2.3 m above the floor.
 * A spot of `def.lore`: { x, y (the floor), z, face (yaw: where the reader stands — local +Z of the stand) }.
 * Not a gift of the gods: the post is ordinary blocks (any spell that breaks a block breaks it), the board
 * rides on it — the post gone, the stand is gone and the book is an ordinary book on the floor.
 */
export const STAND = {
    POST_H: 2, // m: the post's height (two blocks)
    BOARD_Y: 2.8, // m: the board's middle above the floor (a hand held up reaches it; the eyes, 3.4 m, look down on it)
    BOOK_K: 1.35, // the open book on the stand is this much bigger than a book in the hands: easy to see, read and turn
    TILT: 25 * Math.PI / 180, // rad: the reader's edge is the lower one
    BOARD_W: 2.3, // m across
    BOARD_L: 1.6, // m along the slope
    BOARD_T: 0.1, // m thick
};

/** The world box (x/z axis-aligned: the stand faces along an axis) of the board, for its collision. */
export function boardBox(spot) {
    const dx = Math.sin(spot.face), dz = Math.cos(spot.face); // (to the reader)
    const depth = STAND.BOARD_L * Math.cos(STAND.TILT) + 0.12;
    const alongX = Math.abs(dx) > Math.abs(dz) ? depth : STAND.BOARD_W;
    const alongZ = Math.abs(dx) > Math.abs(dz) ? STAND.BOARD_W : depth;
    const half = (STAND.BOARD_L / 2) * Math.sin(STAND.TILT) + STAND.BOARD_T;
    return {
        minX: spot.x - alongX / 2, maxX: spot.x + alongX / 2, minZ: spot.z - alongZ / 2, maxZ: spot.z + alongZ / 2,
        minY: spot.y + STAND.POST_H, maxY: spot.y + STAND.BOARD_Y + half,
    };
}

/** The world cell (block) of the post's two layers: [ix, iz, lowLayer] (a floor `y` is a block's top: layer = y + 1.5). */
export function postCell(spot) {
    return [Math.round(spot.x), Math.round(spot.z), Math.round(spot.y + 1.5)];
}

/** The yaw (rotation.y of a group whose local +Z is the reader's side) for a world direction (dx, dz). */
export const faceYaw = (dx, dz) => Math.atan2(dx, dz);
