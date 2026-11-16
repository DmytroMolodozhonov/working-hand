/**
 * BrawlRules.js — «Битва существ» (карты → «Битва существ»): the pure rules. No THREE, no game.
 *
 * The author 16.11: «можно будет игроку спавнить разных магов, обычных или стихий, зомби, животных — и заставлять сражаться.
 * Игрок просто действует как камера: наблюдает, ходит мышкой и клавиатурой, камера (веб-камера) не нужна». Two teams, A and B: by the SIDE of the field the fighter is put on (a strip between them, BRAWL.STRIP), not by a button (the author 17.11).
 *
 * Elemental mages are the game's REAL ones (their own brain, poses, auras, spells: ElementalMages.js, EarthMages.js); their foe is a pseudo player id
 * `bf|k|id` that CastleLife._playerPos resolves to the enemy creature's place (Brawl.foePos).
 *
 * How they fight (Brawl.js): every fighter who is not a mage is a «servant» of its team (Servants.js: a team is a pseudo-master `brawl:A`), so each system's own
 * walking and blows work as they do for «Брейнрот» (zombies, animals, people); the mages fight by their OWN real brains (WizardFight, ElementalMages, EarthMages) aimed at the enemy creature (Brawl.foePos, _feedFoes).
 */

export const TEAM_IDS = ['A', 'B'];
export const TEAMS = {
    A: { id: 'A', master: 'brawl:A', label: 'Красные', color: 0xff5a44, css: '#ff5a44' },
    B: { id: 'B', master: 'brawl:B', label: 'Синие', color: 0x4a90ff, css: '#4a90ff' },
};
/** A foe the real brains of the mages aim at: a pseudo player id `bf|k|id` (CastleLife._playerPos → Brawl.foePos) and back to the creature {k, id}. */
export const foeId = (k, id) => `bf|${k}|${id}`;
export const foeRef = (fid) => {
    const m = typeof fid === 'string' ? /^bf\|([zav])\|(.+)$/.exec(fid) : null;
    return m ? { k: m[1], id: m[1] === 'v' ? m[2] : +m[2] } : null;
};
/** Mages (ordinary and elemental) fight by their own real brains; the others as servants of their team. */
export const isMage = (def) => !!def && (!!def.elemental || def.group === 'Маги');
export const masterOfTeam = (t) => TEAMS[t]?.master ?? null;
export const teamOfMaster = (m) => (typeof m === 'string' && m.startsWith('brawl:') && TEAMS[m.slice(6)] ? m.slice(6) : null);
export const otherTeam = (t) => (t === 'A' ? 'B' : 'A');

/**
 * Whom the player can put on the field. kind: 'z' zombie, 'a' animal (type), 'v' a person (role/rank); mages (group «Маги», elemental) fight by their own brains.
 * `group` — the tab of the panel.
 */
export const FIGHTERS = [
    { id: 'zombie', label: 'Зомби', icon: '🧟', group: 'Нежить', kind: 'z' },
    { id: 'knight', label: 'Рыцарь', icon: '🛡️', group: 'Люди', kind: 'v', role: 'knight' },
    { id: 'novice', label: 'Начинающий маг', icon: '🧙', group: 'Маги', kind: 'v', role: 'student', rank: 'novice', mana: 40 },
    { id: 'wizard', label: 'Маг', icon: '🧙‍♂️', group: 'Маги', kind: 'v', role: 'student', rank: 'adept', mana: 100 },
    { id: 'archmage', label: 'Сильный маг', icon: '🔮', group: 'Маги', kind: 'v', role: 'teacher', rank: 'teacher', mana: 200 },
    { id: 'fire', label: 'Маг огня', icon: '🔥', group: 'Маги стихий', kind: 'v', elemental: 'fire', mana: 400 }, // (the real elemental mage: ElementalMages / EarthMages, aimed at the enemy creature — Brawl.foePos)
    { id: 'water', label: 'Маг воды', icon: '💧', group: 'Маги стихий', kind: 'v', elemental: 'water', mana: 220 }, // (the real elemental mage: ElementalMages / EarthMages, aimed at the enemy creature — Brawl.foePos)
    { id: 'earth', label: 'Маг земли', icon: '⛰️', group: 'Маги стихий', kind: 'v', elemental: 'earth', mana: 220 }, // (the real elemental mage: ElementalMages / EarthMages, aimed at the enemy creature — Brawl.foePos)
    { id: 'air', label: 'Маг воздуха', icon: '🌪️', group: 'Маги стихий', kind: 'v', elemental: 'air', mana: 220 }, // (the real elemental mage: ElementalMages / EarthMages, aimed at the enemy creature — Brawl.foePos)
    { id: 'cow', label: 'Корова', icon: '🐄', group: 'Животные', kind: 'a', type: 'cow' },
    { id: 'pig', label: 'Свинья', icon: '🐖', group: 'Животные', kind: 'a', type: 'pig' },
    { id: 'sheep', label: 'Баран', icon: '🐏', group: 'Животные', kind: 'a', type: 'sheep' },
    { id: 'horse', label: 'Конь', icon: '🐎', group: 'Животные', kind: 'a', type: 'horse' },
];
export const fighterDef = (id) => FIGHTERS.find((f) => f.id === id) || null;
export const FIGHTER_GROUPS = [...new Set(FIGHTERS.map((f) => f.group))];

export const BRAWL = {
    MAX: 60, // fighters on the field at most (the arena is 84 m across: more is a heap, and the frame pays for each)
    REACT: { t: 0.35, level: 3, lost: false }, // a mage's reaction at a new foe (WizardFight._engage): the field is a battle, he is ready
    STRIP: 6, // m: the strip between the teams (nobody is put on it): the left half of the field (x < 0, seen from the start camera) is the red team's, the right half the blue's
    GROUP: 5, // Shift+click: this many at once
    GROUP_R: 3.2, // m: the spread of such a group
    EDGE: 38, // m: no one is put farther than this from the middle (the meadow is 42 m)
    RESTART_S: 6, // s the banner of the winners stays
};

/** The team a click at `x` puts the fighter on: the left of the strip — A (red), the right — B (blue), on the strip itself — none. */
export function teamAt(x) {
    const h = BRAWL.STRIP / 2;
    return x < -h ? 'A' : x > h ? 'B' : null;
}

/** `x` kept on its own team's side of the strip (a group put near the strip does not cross it). */
export function onSide(x, team) {
    const h = BRAWL.STRIP / 2 + 1;
    return team === 'A' ? Math.min(x, -h) : team === 'B' ? Math.max(x, h) : x;
}

/** The nearest living fighter of the OTHER team. list: [{k, id, team, x, z}]. → the entry or null. */
export function pickEnemy(team, me, list) {
    let best = null, bd = Infinity;
    for (const e of list) {
        if (e.team === team) continue;
        const d = (e.x - me.x) * (e.x - me.x) + (e.z - me.z) * (e.z - me.z);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

/** Alive counts by team → the winning team, 'draw' (none left), or null (the fight goes on / not started). */
export function winnerOf(alive, started) {
    if (!started) return null;
    const a = alive.A | 0, b = alive.B | 0;
    if (a > 0 && b > 0) return null;
    if (a > 0) return 'A';
    if (b > 0) return 'B';
    return 'draw';
}

/** Where a click puts `n` fighters: the point, or a ring of them round it (never beyond EDGE of the middle). → [{x, z}] */
export function placePoints(x, z, n = 1, rnd = Math.random, team = null) {
    const out = [];
    const clamp = (px, pz) => {
        px = onSide(px, team);
        const d = Math.hypot(px, pz);
        return d > BRAWL.EDGE ? { x: (px / d) * BRAWL.EDGE, z: (pz / d) * BRAWL.EDGE } : { x: px, z: pz };
    };
    if (n <= 1) return [clamp(x, z)];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = BRAWL.GROUP_R * (0.6 + 0.5 * rnd());
        out.push(clamp(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return out;
}
