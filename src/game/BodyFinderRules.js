/**
 * BodyFinderRules.js — «Reperio» (поиск своего тела): the rules (pure, no THREE). The spell itself, its light and the map's path — BodyFinder.js.
 *
 * The author 08.11: «заклинание, которое будет изначально доступно любому, без свитка, стоит 10 маны, позволит искать своё прошлое тело — где ты последний раз умер —
 * автоматически. На карте будет показываться путь, и светом тоже путь. Это заклинание — чёрная магия».
 *
 * What it finds: the body I left at my last death (`Death` keeps it, it may have been moved by «Левиоса»: its place is read NOW), else the PLACE of the last death
 * (`g.lastDeath`, recorded at every death and kept in the save — a body is gone after a day, in Creative with the plain health there is none at all).
 * The way: a trail along the ground from the hero to it (`routePoints`: a point every STEP m), drawn as a row of beads of cold light that glow in a wave running towards the body, and as
 * a dotted line on the minimap, and a tall pillar of light on the body itself. It lasts DUR s, or until the hero stands by the body (ARRIVE m).
 * Mana: 10 (Combat.SPELL_COST.Reperio). Black magic (DarkMagic.DARK_SPELLS): every cast may darken (+1 at 50 %).
 */

export const SEEK = {
    COST: 10,
    DUR: 120, // s the trail lasts
    STEP: 4, // m between the points of the way (the beads)
    MAX_POINTS: 700, // a way is at most this many points (~2.8 km); farther — the direction only (`far`)
    BEAD_RANGE: 90, // m from the hero: beads are drawn only so near (≤ BEADS of them)
    BEADS: 56,
    ARRIVE: 6, // m: standing this near the body, the spell has done its work
    WAVE_SPEED: 14, // m/s the wave of light runs towards the body
    WAVE_LEN: 22, // m between two waves
    PILLAR_H: 60, // m the light over the body
    REFRESH: 0.5, // s between two refreshes of the route
};

/** A place of death: {x, y, z}; valid numbers only. Pure. */
export function validPlace(p) { return !!p && [p.x, p.y, p.z].every(Number.isFinite); }

/**
 * Where my last body / death is. `bodies` — the DeathSystem's bodies (iterable of {id, k, who, x, y, z, age}); `localId` — who I am for the bodies; `lastDeath` — the
 * record {x, y, z, t}. A body of mine wins; of several, the newest (the latest id time, then the smallest `age`).
 * → {x, y, z, from: 'body' | 'record', id?} or null.
 */
export function findTarget(bodies, localId, lastDeath) {
    let best = null;
    for (const b of bodies || []) {
        if (!b || b.k !== 'p' || b.who !== localId || !validPlace(b)) continue;
        const t = parseInt(String(b.id).split('_')[1] || '0', 36) || 0; // (the id carries the time of the death: p<id>_<time in base 36>)
        if (!best || t > best.t || (t === best.t && (b.age ?? 0) < (best.b.age ?? 0))) best = { b, t };
    }
    if (best) return { x: best.b.x, y: best.b.y, z: best.b.z, from: 'body', id: best.b.id };
    if (validPlace(lastDeath)) return { x: lastDeath.x, y: lastDeath.y, z: lastDeath.z, from: 'record' };
    return null;
}

/** The points of the way from `a` to `b` (both {x, z}): one every `step` m, the ends included. `far`: too long for the beads — only the ends. Pure. */
export function routePoints(a, b, step = SEEK.STEP, max = SEEK.MAX_POINTS) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(d / step));
    if (n + 1 > max) return { points: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], far: true, length: d };
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: a.x + dx * i / n, z: a.z + dz * i / n });
    return { points: pts, far: false, length: d };
}

/** Which points of the way get a bead now: those within `range` m of the hero (x, z), at most `max`, the nearest first. → indices. Pure. */
export function beadsNear(points, hero, range = SEEK.BEAD_RANGE, max = SEEK.BEADS) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const d = Math.hypot(points[i].x - hero.x, points[i].z - hero.z);
        if (d <= range) out.push([i, d]);
    }
    out.sort((p, q) => p[1] - q[1]);
    return out.slice(0, max).map((p) => p[0]);
}

/** The brightness (0.25…1) of the bead at `s` m along the way, at time t: a wave of light that runs towards the body (WAVE_LEN apart). Pure. */
export function waveAt(s, t) {
    const u = ((s - t * SEEK.WAVE_SPEED) % SEEK.WAVE_LEN + SEEK.WAVE_LEN) % SEEK.WAVE_LEN / SEEK.WAVE_LEN;
    return 0.25 + 0.75 * Math.max(0, Math.cos((u - 0.5) * Math.PI)) ** 2;
}

/** Has the hero come to the body? (2D distance; the height of a hill is not a distance.) */
export const arrived = (hero, target, r = SEEK.ARRIVE) => Math.hypot(hero.x - target.x, hero.z - target.z) <= r;

/** The bearing from the hero to the body, rad (0 = −Z, like the hero's yaw). */
export const bearing = (hero, target) => Math.atan2(-(target.x - hero.x), -(target.z - hero.z));

/** The compass word for a bearing (0 = north, −Z; positive turns to the west, as the yaw does). */
export function compass(rad) {
    const names = ['север', 'северо-запад', 'запад', 'юго-запад', 'юг', 'юго-восток', 'восток', 'северо-восток'];
    const k = Math.round(((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
    return names[k];
}

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/body-finder.test.js. */
export const SEEK_TARGETS = {
    me: { does: 'guide', why: 'колдун видит путь: бусины холодного света по земле к своему телу, пунктир на миникарте, столб света над телом; 10 маны, вещь не нужна, свиток не нужен (известно с начала)' },
    players: { does: 'none', why: 'путь видит только колдун (другие игроки — нет); искать чужое тело нельзя: только своё' },
    others_bodies: { does: 'none', why: 'тела других игроков, жителей, зверей не ищет: «Reperio» знает только место ВАШЕЙ последней смерти' },
    creatures: { does: 'none', why: 'существа не затронуты: ни ударов, ни толчков, ни испуга; свет — зрелище, не оружие' },
    world: { does: 'none', why: 'блоки, вода, корабли не меняются; бусины лежат над землёй (над водой — на воде); путь прямой, как летит ворон (дороги не ищет)' },
    realms: { does: 'refuse', why: 'тело в другом мире (на другой планете, в космосе, в аду) — пути нет: колдун слышит только в каком мире оно лежит' },
    never_died: { does: 'refuse', why: 'вы ещё не умирали в этом мире — искать нечего (мана не тратится)' },
    dead: { does: 'none', why: 'мёртвый не колдует (сначала вернитесь к жизни); при смерти путь пропадает сразу' },
    dark: { does: 'black', why: 'чёрная магия: каждый каст с шансом 50 % добавляет +1 к тьме (DarkMagic.onDarkCast); волшебники презирают' },
    arrive: { does: 'end', why: 'подошли к телу ближе 6 м — свет гаснет, заклинание выполнено (само по себе заканчивается через 2 минуты)' },
    network: { does: 'local', why: 'это личное зрение колдуна: по сети ничего не шлётся (смерть и тело — как всегда: `deathBody`)' },
};
