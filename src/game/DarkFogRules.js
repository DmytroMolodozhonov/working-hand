/**
 * DarkFogRules.js — «Caligo» («Калиго»), the dark mage's fog (pure rules; DarkFog.js plays them). The author 06.11: «заклинание тёмного мага за 50 маны: тёмная дымка, тёмный туман,
 * невероятно тёмный; сквозь него ничего не видно — видно только тем, у кого эффект видеть в тёмных пространствах (ночное зрение). Окружает любое здание или, если здания нет, —
 * огромное; выходит из палочки огромной струёй, в течение 10 секунд игрок его выпускает. Огроменный — окутать целую площадь. Так можно скрыться: NPC потеряли, потому что сквозь
 * него не видят — идут в ту сторону, но дезориентированы».
 *
 * How it plays: the word with the wand raised (50 mana): the fog is let out of the wand in a great jet for RELEASE s — it grows from the spot the wand points at (the ground within
 * 70 m; a house's dome of protection near it is taken as the middle, so the fog wraps the house) to a dome of radius R × H, stays for HOLD s, then thins away over FADE s. «Стоп»
 * takes down my own fog at once (the player must be able to leave it).
 *   in the fog — whoever is in it (the dome's volume): the picture of a hero without the night gift is almost black (the world's fog: 0.3…4 m), a hero WITH the night gift
 *                (Pentagranium Noctis) sees through it (a faint haze, 90 m); from outside the dome is a dark cloud (a seer sees through it a little);
 *   the minds — every creature asks `Invisibility.aiPos(playerId, pos)` where a player is: a player in the fog is not seen — only where they were seen last (CLUE_T s), then nowhere:
 *                the people go to that place and lose him — disoriented. Bosses (the callers that pass `boss`: spider, dragon, the Ice Queen, Black Moustache) see through it.
 */
export const FOG = {
    COST: 50,
    RELEASE: 10, // s the jet lasts (the dome grows)
    HOLD: 150, // s the full fog stays
    FADE: 30, // s it thins away
    R: 60, // m: the radius at the end of the release («огромный»: ~11 000 m²)
    H: 38, // m: the height of the dome
    WARD_PAD: 22, // m: more than a house's dome of protection (the fog wraps the house)
    AIM_RANGE: 70, // m: where the wand's ground point may be
    SNAP: 35, // m: a dome of a house nearer than this to the aimed point is taken as the middle
    CLUE_T: 7, // s: the creatures know about where a player was last seen
    CLUE_JITTER: 4, // m: «примерно» (they search, not know)
    MAX: 4, // fogs at a time
    IN_NEAR: 0.3, IN_FAR: 4.5, // the picture inside (a hero without the gift)
    SEER_NEAR: 8, SEER_FAR: 90, // … with the night gift
    DARK: 0x040208, // the fog's colour
};

/** The radius at `t` s since the cast (an ease-out while it is let out, full, then thinning: the radius shrinks from the rim). */
export function radiusAt(t) {
    if (t < 0) return 0;
    if (t < FOG.RELEASE) { const k = t / FOG.RELEASE; return FOG.R * (1 - (1 - k) * (1 - k)); }
    if (t < FOG.RELEASE + FOG.HOLD) return FOG.R;
    const u = (t - FOG.RELEASE - FOG.HOLD) / FOG.FADE;
    return u >= 1 ? 0 : FOG.R * (1 - u * u * 0.5);
}
/** How dense the fog is at `t` (1 full … 0 gone): the dome's opacity fades in the last seconds, the jet's front is thin. */
export function densityAt(t) {
    if (t < 0) return 0;
    if (t < FOG.RELEASE) return Math.min(1, 0.25 + t / 3);
    const end = FOG.RELEASE + FOG.HOLD;
    if (t < end) return 1;
    return Math.max(0, 1 - (t - end) / FOG.FADE);
}
export const aliveAt = (t) => t < FOG.RELEASE + FOG.HOLD + FOG.FADE;

/** Is the point inside the fog `f` ({x, y, z, t (age s), R?}) — its volume, the rim a little inside (the edge is soft)? */
export function insideFog(f, x, y, z) {
    const R = radiusAt(f.t) * 0.94, dx = x - f.x, dz = z - f.z;
    if (R <= 1 || densityAt(f.t) < 0.35) return false;
    if (dx * dx + dz * dz > R * R) return false;
    // the dome: height falls toward the rim (an ellipsoid)
    const k = Math.sqrt(dx * dx + dz * dz) / R;
    const top = f.y + FOG.H * Math.sqrt(Math.max(0, 1 - k * k));
    return y >= f.y - 4 && y <= top;
}

/** What the creatures think of a player (pure): `seen` {x, y, z, t (ms)} the last place they saw him; `fogged` — he is in the fog now. → the place or null. */
export function fogClue(fogged, pos, seen, nowMs, rnd = Math.random) {
    if (!fogged) return pos;
    if (!seen || nowMs - seen.t > FOG.CLUE_T * 1000) return null;
    const a = rnd() * Math.PI * 2, r = rnd() * FOG.CLUE_JITTER;
    return { x: seen.x + Math.cos(a) * r, y: seen.y, z: seen.z + Math.sin(a) * r };
}

/** The picture inside the fog for a hero (the world's fog near / far): with the night gift — he sees through. */
export const insideView = (nightGift) => (nightGift ? { near: FOG.SEER_NEAR, far: FOG.SEER_FAR } : { near: FOG.IN_NEAR, far: FOG.IN_FAR });

/** ON WHOM AND ON WHAT (CLAUDE.md «кто/что»). `does`: blind | sees | none. */
export const FOG_TARGETS = {
    me: { does: 'blind', why: 'в тумане я почти ничего не вижу (0,3…4,5 м); с ночным зрением («Pentagranium Noctis») вижу сквозь; «стоп» убирает мой туман' },
    players: { does: 'blind', why: 'другие игроки в тумане: снаружи он тёмное облако; изнутри — как у меня; видящий в темноте видит сквозь' },
    zombies: { does: 'blind', why: 'зомби не видят игрока в тумане: идут к месту, где видели, и теряют (Invisibility.aiPos)' },
    castlePeople: { does: 'blind', why: 'жители, рыцари, король, волшебники теряют меня: идут туда, где видели, и дезориентированы' },
    animals: { does: 'blind', why: 'животные (быки, минотавр) не видят: не нападают и не бегут' },
    sailors: { does: 'blind', why: 'моряки и команды кораблей не видят' },
    spider: { does: 'sees', why: 'паучиха — босс: видит сквозь туман' },
    livingTrees: { does: 'blind', why: 'живые деревья не находят в тумане' },
    bookBirds: { does: 'none', why: 'книги-птицы и так не охотятся' },
    dragon: { does: 'sees', why: 'дракон — босс: видит сквозь туман' },
    iceCastle: { does: 'sees', why: 'Ледяная Королева — босс: видит; её снеговики и монстры (без boss-признака) теряют' },
    blackship: { does: 'sees', why: 'капитан Чёрные Усы — босс: видит; матросы и скелеты теряют' },
    phoenix: { does: 'blind', why: 'феникс не видит' },
    owl: { does: 'blind', why: 'сова не видит' },
    canary: { does: 'blind', why: 'канарейки не видят' },
    taron: { does: 'blind', why: 'Тароны не видят (они не тёмного зрения — как всех, их ведёт aiPos)' },
    spencer: { does: 'none', why: 'птичка Спенсера и так никого не ищет' },
    ghost: { does: 'none', why: 'призраки ни на кого не охотятся' },
    custom: { does: 'blind', why: 'созданные существа теряют добычу' },
    gargoyles: { does: 'blind', why: 'горгульи ада теряют игрока' },
    diabolos: { does: 'sees', why: 'Дьяволос: смотрит по настоящему месту (не спрашивает aiPos) — видит сквозь любое заклинание' },
};
