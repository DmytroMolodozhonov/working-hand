/**
 * SaviorRules.js — «Волшебник-спаситель» (the author 08.11): pure rules, numbers and words (Savior.js plays them).
 *
 * The idea: a player who cuts down the wizards of the world meets one who has come to stop him.
 *   WHEN   10 wizards killed by one player within 2 minutes → a 50 % roll → the Saviour comes (the killing of anybody but wizards does not count).
 *   AFTER  the player beat him: two game days he cannot come at all; then — only by chance (50 %) and only after FIVE wizards killed — a new Saviour: 1500 mana, a little
 *          different (another name, stronger dome and ward, quicker), the same in principle. Beaten again: the next one is again of 1500 (STAGES[1]), again after two days.
 *   WHO    a white wizard in white robes (the «white sage» robe of the tower's Head, TowerUniforms m2): 700 mana, fast, flies (hovers and sweeps over the ground),
 *          holds «Protection Maxima» well (the dome: more hits, longer, quicker again), knows the earth magic («Пески» — the earth's own), his favourite is «Электром»;
 *          every protection pentagram is closed on him (the dark ×½, fire none, blasts none / ×½ — ResistRules; steady on his feet — a stun holds him a fifth as long);
 *          WHITE: no black magic ever (no «Авада», no «Сапира»: DarkMagic).
 *   WORDS  up to ten prepared lines: he despises killers, he spares nobody of them.
 *   ENDS   the player's death / the player far away / ten quiet minutes → he goes (a flash of white light); killed → he stays dead as any wizard.
 * Who / what (CLAUDE.md): `SAVIOR_TARGETS`.
 */

export const SAVIOR = {
    WINDOW_S: 120, // s: the kills are counted within this time …
    KILLS: 10, // … this many wizards killed by one player
    CHANCE: 0.5, // the roll
    COOLDOWN_S: 600, // s: a player is not visited again so soon (and only one Saviour in the world at a time)
    MANA: 700, // (the first Saviour; the later ones: STAGES[1])
    REST_DAYS: 2, // game days after the player beat him: no Saviour for him
    SPEED_K: 1.9, // × the wizards' running speed
    FLY_H: 3.2, // m above the ground he hovers (a sweep, never in a wall)
    ARRIVE_H: 26, // m up where he appears; he comes down in a few seconds
    COME: [38, 60], // m from the player where he appears
    FAR: 420, // m from the foe — he turns back (the foe has got away)
    QUIET_S: 600, // s without a fight and he goes
    STUN_K: 0.2, // a stun holds him this much as long (steady: Firmitas)
    DOME: { hits: 8, t: 11, cd: 9 }, // «Protection Maxima»: held well (the Master's: 3 hits, 6 s, 25 s)
    HP: 60, WARD: 40,
    // favourite spells: «Электром» first; the earth («Пески»), «Джолт Максима», «Остолбеней», the white «Айс» — nothing dark
    SPELLS: { Electrum: 0.42, JoltMaxima: 0.16, SandsDuel: 0.14, Stupefy: 0.16, IceDuel: 0.12 },
    LINE_GAP_S: 9, // s between two lines
};

/** The Saviours by stage: 0 — the first (700 mana, after 10 killed), 1 — every later one (1500 mana, after 5 killed). */
export const STAGES = [
    { n: 0, mana: 700, kills: 10, hp: 60, ward: 40, speed: 1.9, dome: { hits: 8, t: 11, cd: 9 }, names: [['Аурелий Светлый', 'Аурелия Светлая']] },
    { n: 1, mana: 1500, kills: 5, hp: 90, ward: 70, speed: 2.15, dome: { hits: 12, t: 14, cd: 7 }, names: [['Лучезар Сияющий', 'Лучезара Сияющая']] },
];
export const stageOf = (n) => STAGES[Math.min(1, Math.max(0, n | 0))];

/** The person of a Saviour's site «ww<gx>_<gz>» (gx ≥ GX0: his own place on the world's map of wanderers; gz is the stage): the same on every computer (a guest sees what the host sees). */
export const GX0 = 7000;
export function saviorEntry(gx, gz = 0) {
    const st = stageOf(gz), female = (gx & 1) === 1, seed = (Math.imul(gx, 2654435761) ^ 0x5a17) >>> 0;
    return { idx: 1, role: 'savior', female, name: st.names[0][female ? 1 : 0], home: -1, stall: -1, seed, brave: 1, wizard: true, robe: true, rank: 'savior', mana: st.mana, savior: st.n };
}

/** The prepared lines — he despises killers (the author: «против таких волшебников я никого не жалею»). */
export const SAVIOR_LINES = {
    arrive: ['Хватит. Кровь волшебников на твоих руках — и я пришёл её остановить.', 'Ты убивал моих братьев. Больше не будешь.'],
    attack: ['Против таких, как ты, я никого не жалею!', 'Я презираю тех, кто убивает ради забавы.'],
    hurt: ['Твоя сила — это сила убийцы. Она ничего не стоит!', 'Бей сильнее — ты всё равно проиграешь.'],
    dome: ['Моя защита крепче твоей злобы.'],
    win: ['Ты сам выбрал этот конец.', 'Пусть это будет уроком другим.'],
    leave: ['Я не пощадил бы тебя. Радуйся, что ушёл.'],
};

/** Kills of wizards by one player, counted in a sliding window (pure; `now` in seconds). */
export class KillWatch {
    constructor() { this.by = new Map(); this.until = new Map(); }
    /** A wizard killed by `id` at `now` → true when the tenth within the window is reached (and the window is then emptied). */
    note(id, now, need = SAVIOR.KILLS) {
        const list = (this.by.get(id) || []).filter((t) => now - t <= SAVIOR.WINDOW_S);
        list.push(now);
        this.by.set(id, list);
        if (list.length < need) return false;
        this.by.set(id, []);
        return true;
    }
    /** Is this player on rest (just visited)? */
    resting(id, now) { return now < (this.until.get(id) || 0); }
    rest(id, now) { this.until.set(id, now + SAVIOR.COOLDOWN_S); }
    forget(id) { this.by.delete(id); }
}

/** The roll (rng 0…1) once the tenth kill is made and the player is not on rest. */
export const saviorComes = (rng = Math.random) => rng() < SAVIOR.CHANCE;

/** A line of a kind, never the same twice in a row (`last`: the previous one). */
export function saviorLine(kind, last = null, rng = Math.random) {
    const a = SAVIOR_LINES[kind] || [];
    if (!a.length) return null;
    const b = a.filter((x) => x !== last);
    return (b.length ? b : a)[Math.floor(rng() * (b.length || a.length))];
}

/** The spells he may cast: none of them dark (the white mage). */
export const WHITE_SPELLS = ['Electrum', 'JoltMaxima', 'SandsDuel', 'Stupefy', 'IceDuel'];

/** ON WHOM / ON WHAT (CLAUDE.md): who and what he meets. */
export const SAVIOR_TARGETS = {
    me: { does: 'fight', why: 'приходит ради игрока, убившего 10 волшебников за 2 минуты; бьёт заклинаниями дуэли — защиту решает компьютер игрока (Protection)' },
    players: { does: 'fight', why: 'считает убийства любого игрока (хост ведёт счёт для всех, гость тоже вызывает его); приходит к тому, кто убил' },
    castlePeople: { does: 'none', why: 'жителей не трогает: он белый маг, воюет только с убийцей и с тем, кто нападает на него' },
    animals: { does: 'none', why: 'не трогает' },
    spells: { does: 'immune', why: 'защита от тьмы вдвое, огонь не берёт, Бомбарда не ранит (Бум/Инспириус вдвое); взрыв и толчок его всё же двигают; божественные заклинания действуют на него как на любого' },
    magic: { does: 'white', why: 'никакой чёрной магии: нет Авады, Сапиры, Акцентрика' },
};
