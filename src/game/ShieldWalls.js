/**
 * ShieldWalls.js — a player's «Protection» is SOLID (the author: «через него не может пройти другой
 * волшебник, вообще другое существо»). The hand shield and the dome («Protection Maxima», the gods'
 * shield and dome — ProtectionGods.js: the same Combat.shield) stand in every creature's way like a
 * wall: castle people, knights, wizards, animals, zombies, the spider, dragons, snowmen, owls… press
 * against it, go round it or stop — never through.
 *
 * How: every walker goes through `crowdStep` (CrowdSources.js) — the walls are bodies of the crowd
 * (seen early and gone round as any big body) AND each step is clipped against them (`clipStep`):
 * along the wall, never into it; its goal behind the wall (the player himself) — it stands at it.
 * One already inside when the dome went up is pushed out (`pushOut`, CastleLife._separate, zombies).
 * A new walking creature gets it all through crowdStep.
 *
 * Network: each computer knows every player's shield (Combat.state → RemoteAvatar.combat): the host
 * keeps its creatures off all of them; each player keeps HIS OWN body off the others' (Game: so a
 * friend never walks through my dome — his computer stops him, it sees my dome).
 */

export const WARD = {
    HAND_R: 0.75, // m: the hand shield (a disc in front of the hand)
    DOME_R: 2.6, // m: the dome (Combat PVP.DOME_R)
    UP: 3.2, // m above the feet a wall still stops one (the dome's height)
    DOWN: 1.2, // m below
};

/**
 * The solid shields now (once a frame): [{x, y (feet), z, r, owner ('me' | a player's id), dome}].
 * Me: Combat.shield; the other players: their shield as the network tells it.
 */
export function wardsOf(g, out) {
    const key = g.frameCount ?? -1;
    const cache = g._wards || (g._wards = { key: -2, list: [], hand: null });
    // (the hand's place is written by Character.getHandWorldPosition — a real vector, made once from one the game has)
    const handVec = (like) => cache.hand || (cache.hand = like?.clone ? like.clone() : { x: 0, y: 0, z: 0 });
    if (cache.key === key && key >= 0) return cache.list;
    cache.key = key;
    const L = out || cache.list;
    L.length = 0;
    let n = 0;
    const put = (x, y, z, r, owner, dome) => {
        const w = cache[`w${n}`] || (cache[`w${n}`] = {});
        n++;
        w.x = x; w.y = y; w.z = z; w.r = r; w.owner = owner; w.dome = dome;
        L.push(w);
    };
    const me = g.character?.group?.position, s = g.combat?.shield;
    if (me && s && s.left > 0 && !g.isDeadLocal) {
        if (s.type === 2) put(me.x, me.y - 1.95, me.z, WARD.DOME_R, 'me', true);
        else {
            const h = g.combat.shieldAt ? g.combat.shieldAt(s.side, handVec(me)) : g.character.getHandWorldPosition?.(s.side, handVec(me)); // (at the wand's tip when it is there)
            if (h) put(h.x, me.y - 1.95, h.z, WARD.HAND_R, 'me', false);
        }
    }
    for (const [id, r] of g.remotes || []) {
        const c = r.combat;
        if (r.dead || !r.position || !c?.shield || !(c.shieldLeft > 0)) continue;
        const p = r.position;
        if (c.shield === 2) { put(p.x, p.y - 1.95, p.z, WARD.DOME_R, String(id), true); continue; }
        const h = r.character?.getHandWorldPosition?.(c.side || 'right', handVec(p));
        if (h) put(h.x, p.y - 1.95, h.z, WARD.HAND_R, String(id), false);
    }
    return L;
}

const inHeight = (y, w) => y == null || (y > w.y - WARD.DOWN && y < w.y + WARD.UP);

/**
 * A step of a walker of radius `r` at p {x, y (feet), z} along the unit way (ux, uz), `maxF` m to its
 * goal, against the walls: the same way if no wall is in it; along the wall when it would go into one;
 * null (stand at it) when its goal is behind the wall; out of it when it stands inside.
 * `skip`: an owner whose walls don't count (a player's own body).
 */
export function clipStep(p, ux, uz, r, maxF, wards, skip = null) {
    if (!wards?.length) return { x: ux, z: uz };
    let x = ux, z = uz;
    for (const w of wards) {
        if (w.owner === skip || !inHeight(p.y, w)) continue;
        const dx = w.x - p.x, dz = w.z - p.z;
        const D = Math.hypot(dx, dz), min = w.r + r;
        if (D > min + 0.6) continue; // (not at it yet: the crowd takes it round as a big body)
        if (D < 1e-3) return { x: 1, z: 0 };
        const nx = dx / D, nz = dz / D; // (towards the wall's middle)
        if (D < min - 0.35) return { x: -nx, z: -nz }; // (inside — the dome went up over it: out)
        const into = x * nx + z * nz;
        if (into <= 0) continue; // (going away from it / past it)
        // its goal behind the wall (or in it — the player under his dome): it presses against it and stands
        if (maxF != null && maxF >= D - min && maxF <= D + w.r + 0.3 && Math.abs(-nz * x + nx * z) < 0.5) return null;
        // along the wall, on the side it already leans to
        let tx = x - into * nx, tz = z - into * nz;
        const l = Math.hypot(tx, tz);
        if (l < 0.15) { const side = (-nz * ux + nx * uz) >= 0 ? 1 : -1; tx = -nz * side; tz = nx * side; } else { tx /= l; tz /= l; }
        x = tx; z = tz;
    }
    return { x, z };
}

/**
 * One standing in a wall (the dome went up over it, a shove): out of it, a little a frame.
 * p {x, y, z} is moved (k 0…1 of the way out now). true: it was in one.
 */
export function pushOut(p, r, wards, k = 0.5, skip = null) {
    let moved = false;
    for (const w of wards || []) {
        if (w.owner === skip || !inHeight(p.y, w)) continue;
        const dx = p.x - w.x, dz = p.z - w.z;
        const D = Math.hypot(dx, dz), min = w.r + r;
        if (D >= min) continue;
        const ux = D > 1e-3 ? dx / D : 1, uz = D > 1e-3 ? dz / D : 0;
        const by = (min - D) * k;
        p.x += ux * by; p.z += uz * by;
        moved = true;
    }
    return moved;
}
