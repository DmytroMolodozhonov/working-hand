/**
 * BrawlRules.js — «Битва существ» (карты → «Битва существ»): the pure rules. No THREE, no game.
 *
 * The author 16.11: «можно будет игроку спавнить разных магов, обычных или стихий, зомби, животных — и заставлять сражаться.
 * Игрок просто действует как камера: наблюдает, ходит мышкой и клавиатурой, камера (веб-камера) не нужна». Two teams, A and B.
 *
 * How they fight (Brawl.js): every fighter is a «servant» of its team (Servants.js: a team is a pseudo-master `brawl:A`), so each system's own
 * walking and blows work as they do for «Брейнрот» (zombies, animals, people); the mages additionally cast bolts (Brawl.casterStep).
 */

export const TEAM_IDS = ['A', 'B'];
export const TEAMS = {
    A: { id: 'A', master: 'brawl:A', label: 'Красные', color: 0xff5a44, css: '#ff5a44' },
    B: { id: 'B', master: 'brawl:B', label: 'Синие', color: 0x4a90ff, css: '#4a90ff' },
};
export const masterOfTeam = (t) => TEAMS[t]?.master ?? null;
export const teamOfMaster = (m) => (typeof m === 'string' && m.startsWith('brawl:') && TEAMS[m.slice(6)] ? m.slice(6) : null);
export const otherTeam = (t) => (t === 'A' ? 'B' : 'A');

/**
 * Whom the player can put on the field. kind: 'z' zombie, 'a' animal (type), 'v' a person (role/rank), caster: the mage's bolt colour.
 * `group` — the tab of the panel.
 */
export const FIGHTERS = [
    { id: 'zombie', label: 'Зомби', icon: '🧟', group: 'Нежить', kind: 'z' },
    { id: 'knight', label: 'Рыцарь', icon: '🛡️', group: 'Люди', kind: 'v', role: 'knight' },
    { id: 'novice', label: 'Начинающий маг', icon: '🧙', group: 'Маги', kind: 'v', role: 'student', rank: 'novice', mana: 40, caster: { color: 0xb08cff, dmg: 3, every: 2.6 } },
    { id: 'wizard', label: 'Маг', icon: '🧙‍♂️', group: 'Маги', kind: 'v', role: 'student', rank: 'adept', mana: 100, caster: { color: 0x7fd0ff, dmg: 5, every: 2.0 } },
    { id: 'archmage', label: 'Сильный маг', icon: '🔮', group: 'Маги', kind: 'v', role: 'teacher', rank: 'teacher', mana: 200, caster: { color: 0xffe27a, dmg: 8, every: 1.5 } },
    { id: 'fire', label: 'Маг огня', icon: '🔥', group: 'Маги стихий', kind: 'v', role: 'teacher', rank: 'teacher', mana: 160, caster: { color: 0xff7a2a, dmg: 7, every: 1.7, element: 'fire' } },
    { id: 'water', label: 'Маг воды', icon: '💧', group: 'Маги стихий', kind: 'v', role: 'teacher', rank: 'teacher', mana: 160, caster: { color: 0x39b6ff, dmg: 6, every: 1.6, element: 'water' } },
    { id: 'earth', label: 'Маг земли', icon: '⛰️', group: 'Маги стихий', kind: 'v', role: 'teacher', rank: 'teacher', mana: 160, caster: { color: 0x9a7a4a, dmg: 9, every: 2.4, element: 'earth' } },
    { id: 'air', label: 'Маг воздуха', icon: '🌪️', group: 'Маги стихий', kind: 'v', role: 'teacher', rank: 'teacher', mana: 160, caster: { color: 0xdff5ff, dmg: 5, every: 1.2, element: 'air' } },
    { id: 'cow', label: 'Корова', icon: '🐄', group: 'Животные', kind: 'a', type: 'cow' },
    { id: 'pig', label: 'Свинья', icon: '🐖', group: 'Животные', kind: 'a', type: 'pig' },
    { id: 'sheep', label: 'Баран', icon: '🐏', group: 'Животные', kind: 'a', type: 'sheep' },
    { id: 'horse', label: 'Конь', icon: '🐎', group: 'Животные', kind: 'a', type: 'horse' },
];
export const fighterDef = (id) => FIGHTERS.find((f) => f.id === id) || null;
export const FIGHTER_GROUPS = [...new Set(FIGHTERS.map((f) => f.group))];

export const BRAWL = {
    MAX: 60, // fighters on the field at most (the arena is 84 m across: more is a heap, and the frame pays for each)
    GROUP: 5, // Shift+click: this many at once
    GROUP_R: 3.2, // m: the spread of such a group
    EDGE: 38, // m: no one is put farther than this from the middle (the meadow is 42 m)
    BOLT_SPEED: 26, // m/s
    BOLT_LIFE: 1.8, // s
    BOLT_HIT_R: 1.7, // m: a bolt hits a body this near its path
    BOLT_PUSH: 6, // m/s: the shove of a hit
    KEEP: [9, 15], // m: a mage keeps this far from its foe (nearer — steps back, farther — closes in)
    RESTART_S: 6, // s the banner of the winners stays
};

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

/** A mage's move by the distance to its foe: 'close' in, 'hold' and cast, 'back' away. */
export function casterMove(d, keep = BRAWL.KEEP) {
    if (d > keep[1]) return 'close';
    if (d < keep[0]) return 'back';
    return 'hold';
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
export function placePoints(x, z, n = 1, rnd = Math.random) {
    const out = [];
    const clamp = (px, pz) => {
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
