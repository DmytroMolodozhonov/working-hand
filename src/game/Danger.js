/**
 * Danger.js — what the people of a castle or a village count as danger, and how
 * each of them judges it (pure logic: no three.js, no game — VillagerFear.js runs it).
 *
 * A danger is a real thing that happens near them: a blast, the ground shaking
 * before «Total Destruction», fire, falling stones, the giant spider, zombies at
 * night, a player who attacks people, a fight. Every person judges it by how far
 * it is and what they can see or hear:
 *   level 0 — nothing (too far);
 *   level 1 — heard / seen far off: they stop, look, ask «what was that?»;
 *             a second one soon after → level 2;
 *   level 2 — near: they shout to warn the others and hide in the nearest safe
 *             house (or run out of the gates if the houses burn or fall);
 *   level 3 — right on them: they run away from it at once (never into it).
 *
 * «На кого и на что» (CLAUDE.md): PEOPLE says how each kind of person reacts,
 * DANGERS how far each danger is heard/seen and what it does, REBUILT what the
 * builders put back afterwards (Rebuild.js) and what they never touch.
 */

/** Each kind of danger: r — the deadly radius round it (m); hear / see — how far it is noticed;
 *  near — within this many metres beyond r it is a level-2 danger (hide); fear — how long it is remembered (s). */
export const DANGERS = {
    blast: { r: 4, hear: 110, see: 110, near: 26, fear: 45, ru: 'взрыв (Бомбардо, молния, взрыв бочки)' },
    ruin: { r: 20, hear: 120, see: 120, near: 30, fear: 70, ru: '«Тотальное разрушение»: земля дрожит, потом всё рушится' },
    quake: { r: 6, hear: 70, see: 70, near: 18, fear: 40, ru: '«Землетрясение», «Прорыв»: земля трескается и встаёт стеной' },
    fire: { r: 3, hear: 25, see: 50, near: 14, fear: 40, ru: 'огонь: «Инферно», «Адский огонь», горящие дома и деревья' },
    fall: { r: 3, hear: 30, see: 30, near: 8, fear: 25, ru: 'падающие камни, рушащаяся крыша' },
    spider: { r: 6, hear: 30, see: 45, near: 22, fear: 60, ru: 'гигантский паук' },
    zombie: { r: 2, hear: 12, see: 24, near: 14, fear: 35, ru: 'зомби ночью' },
    attacker: { r: 3, hear: 18, see: 32, near: 18, fear: 40, ru: 'игрок, который бьёт и убивает людей' },
    fight: { r: 3, hear: 22, see: 26, near: 7, fear: 20, ru: 'драка рядом (рыцари бьются)' },
};

/** How each kind of person meets danger (VillagerFear.js does exactly this). */
export const PEOPLE = {
    farmer: { reacts: true, hides: 'в ближайший целый дом (сначала свой)', flees: 'за ворота, прочь от опасности', douses: true, note: 'смелые тушат пожар вёдрами от колодца' },
    builder: { reacts: true, hides: 'в ближайший целый дом', flees: 'за ворота', douses: true, note: 'когда тихо — выходят и чинят замок (Rebuild.js)' },
    merchant: { reacts: true, hides: 'бросает прилавок, прячется в дом', flees: 'за ворота', douses: false, note: 'когда тихо — возвращается за прилавок' },
    king: { reacts: true, hides: 'уходит вглубь замка (подальше от опасности)', flees: 'за ворота, если рушится сам замок', douses: false, note: 'кричит страже; в бой — только когда ударили его' },
    advisor: { reacts: true, hides: 'с королём, вглубь замка', flees: 'за ворота', douses: false, note: '' },
    knight: { reacts: true, hides: 'не прячется', flees: 'не бежит: идёт смотреть, но в огонь и в рушащееся не лезет', douses: false, note: 'кричит людям «В дома!»' },
    wizard: { reacts: true, hides: 'робкие ученики бегут прочь', flees: 'смелые не бегут: идут смотреть (и кто это сделал)', douses: false, note: 'WizardLife.danger; нашли тело своего — тревога и поиск чужаков (BodyFound.js)' },
    servant: { reacts: false, hides: '—', flees: '—', douses: false, note: 'слуга «Брейнрота» идёт за хозяином, а не прячется' },
    sailor: { reacts: false, hides: '—', flees: '—', douses: false, note: 'моряки на кораблях — у них свой бой (CrewTactics.js)' },
};

/** What the builders put back after the danger — and what they never touch (Rebuild.js). */
export const REBUILT = {
    restored: [
        'стены, башни, ворота, дома и крыши замка и деревни — как были построены',
        'двор и улицы: воронки засыпаются, мостовая кладётся обратно',
        'сгоревшие дома: заново из того же дерева и камня',
        'сундуки сгоревших домов: стоят снова, когда строители закончили дом (что сгорело в сундуке — не возвращается)',
        'завалы и обломки на земле разбираются',
    ],
    kept: [
        'то, что построил игрок (его блоки не убирают и не заменяют)',
        'захваченный замок: что новый король сам разобрал — остаётся разобранным; замок остаётся его',
        'деревья, вода, земля далеко за пределами замка, пещеры глубоко под ним',
        'башни волшебников (не чинятся строителями)',
    ],
};

/** Level 0…3 of one danger for a person `d` metres from it (to its middle). */
export function levelOf(kind, d, { sees = true, r = null } = {}) {
    const D = DANGERS[kind];
    if (!D) return 0;
    const R = r ?? D.r;
    if (d < R + 4) return 3;
    const notice = sees ? Math.max(D.hear, D.see) : D.hear;
    if (d > R + notice) return 0;
    if (d < R + D.near) return 2;
    return 1;
}

/** The worst danger for a person at p: {danger, level, d} or null. dangers: [{x, z, kind, r?}] */
export function worst(p, dangers, sees = () => true) {
    let best = null;
    for (const z of dangers) {
        const d = Math.hypot(z.x - p.x, z.z - p.z);
        const lv = levelOf(z.kind, d, { sees: sees(z), r: z.r });
        if (!lv) continue;
        // (at the same level the nearer one is worse)
        if (!best || lv > best.level || (lv === best.level && d - (z.r ?? 0) < best.d - (best.danger.r ?? 0))) best = { danger: z, level: lv, d };
    }
    return best;
}

/** Is the place q safe from these dangers (each well beyond its deadly radius)? */
export function safeFrom(q, dangers, margin = 10) {
    for (const z of dangers) {
        const R = (z.r ?? DANGERS[z.kind]?.r ?? 3) + margin;
        if (Math.hypot(q.x - z.x, q.z - z.z) < R) return false;
    }
    return true;
}

/**
 * Is going from p to q going towards a danger? (The way passes near it, or q is
 * on its side and the person would have to run at it.)
 */
export function towards(p, q, dangers) {
    for (const z of dangers) {
        const R = (z.r ?? DANGERS[z.kind]?.r ?? 3) + 5;
        // the nearest point of the segment p→q to the danger
        const sx = q.x - p.x, sz = q.z - p.z, L2 = sx * sx + sz * sz || 1;
        const t = Math.max(0, Math.min(1, ((z.x - p.x) * sx + (z.z - p.z) * sz) / L2));
        const cx = p.x + sx * t, cz = p.z + sz * t;
        if (Math.hypot(z.x - cx, z.z - cz) < R && Math.hypot(z.x - p.x, z.z - p.z) > R - 5) return true;
    }
    return false;
}

/**
 * The house to hide in: the nearest whole one that is not on the danger's side.
 * houses: [{i, x, z, own, broken, burning}] → the chosen index or -1.
 */
export function pickShelter(p, houses, dangers, { maxDist = 55 } = {}) {
    let best = -1, bs = Infinity;
    for (const h of houses) {
        if (h.broken || h.burning) continue;
        const d = Math.hypot(h.x - p.x, h.z - p.z);
        if (d > maxDist) continue;
        if (!safeFrom(h, dangers, 10)) continue;
        if (towards(p, h, dangers)) continue;
        // (one's own home is worth a few more steps; farther from the danger is better)
        let s = d - (h.own ? 15 : 0);
        for (const z of dangers) s -= Math.min(20, Math.hypot(h.x - z.x, h.z - z.z) * 0.15);
        if (s < bs) { bs = s; best = h.i; }
    }
    return best;
}

/**
 * Where to run when there is nowhere to hide: of the given places (the gates, the
 * edges of the village) the one away from the danger and not past it; else a point
 * straight away from the danger. → {x, z, i}
 */
export function pickEscape(p, places, dangers, far = 40) {
    let best = null, bs = -Infinity;
    for (let i = 0; i < places.length; i++) {
        const q = places[i];
        if (towards(p, q, dangers)) continue;
        let away = Infinity;
        for (const z of dangers) away = Math.min(away, Math.hypot(q.x - z.x, q.z - z.z) - (z.r ?? 0));
        const s = away - 0.3 * Math.hypot(q.x - p.x, q.z - p.z);
        if (away > 15 && s > bs) { bs = s; best = { x: q.x, z: q.z, i }; }
    }
    if (best) return best;
    // straight away from the dangers (their pull summed)
    let ax = 0, az = 0;
    for (const z of dangers) {
        const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz) || 1;
        ax += dx / d / Math.max(1, d / 10); az += dz / d / Math.max(1, d / 10);
    }
    const L = Math.hypot(ax, az) || 1;
    return { x: p.x + ax / L * far, z: p.z + az / L * far, i: -1 };
}

/** Seconds of calm before a person dares to look out / come out (braver — sooner, older — later). */
export function calmNeeded(brave = 0.5, elder = false) {
    const peek = 14 + (1 - brave) * 16 + (elder ? 8 : 0);
    const out = peek + 22 + (1 - brave) * 30 + (elder ? 15 : 0);
    return { peek, out };
}
