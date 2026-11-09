/**
 * SaviorRules.js — «Волшебник-спаситель» (the author 08.11): pure rules, numbers and words (Savior.js plays them).
 *
 * The idea: a player who cuts down the wizards of the world meets one who has come to stop him.
 *   WHEN   each wizard killed gives a separate roll: the killer’s actual black-magic level, in percent (0…100). No kill-count window.
 *   AFTER  the player beat him: two game days he cannot come at all; then — the same per-kill chance by black-magic level — a new Saviour: 1500 mana, a little
 *          different (another name, stronger dome and ward, quicker), the same in principle. Beaten again: the next one is again of 1500 (STAGES[1]), again after two days.
 *   WHO    a white wizard in white robes (the «white sage» robe of the tower's Head, TowerUniforms m2): 700 mana, fast, flies (hovers and sweeps over the ground),
 *          holds «Protection Maxima» well (the dome: more hits, longer, quicker again); his attacks are only the BLUE spells (the author 08.11: «даст он не использует, только синие»):
 *          the duel charge «Электром» (his favourite and the main one), «Wind Maxima», and the blasts — «Bombardo Maxima» if he sees the player use it too, else the plain «Bombardo»
 *          (only when the player has used a «Bombardo» of either kind lately); no «Даст» (Sands), no «Остолбеней», no «Джолт», no «Айс», no disarming;
 *          every protection pentagram is closed on him (the dark ×½, fire none, blasts none / ×½ — ResistRules; steady on his feet — a stun holds him a fifth as long);
 *          WHITE: no black magic ever (no «Авада», no «Сапира»: DarkMagic).
 *   WORDS  up to ten prepared lines: he despises killers, he spares nobody of them.
 *   FLIGHT his insurance: hurt badly / out of mana / a burst of damage → he takes off, flies away (healing), comes back high up and bombs («Bombardo» from above), lands and fights
 *          again; at the next danger — up again.
 *   ENDS   the player's death / the player far away / ten quiet minutes → he goes (a flash of white light); killed → he stays dead as any wizard.
 * Who / what (CLAUDE.md): `SAVIOR_TARGETS`.
 */

import { createRng } from '../core/math.js';
import { SPELL_COST } from './Combat.js';

export const SAVIOR = {
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
    // the duel charges he casts: only the blue «Электром» (his own other spells: SPECIAL below)
    SPELLS: { Electrum: 1 },
    SEEN_S: 25, // s: «he sees the player use it»: a Bombardo cast by the player this long ago counts
    SPECIAL_CD: { BombardoMaxima: 10, Bombardo: 7, WindMaxima: 12 }, // s between two of his casts of each
    // the flight is his insurance (the author 08.11): he hovers low in a fight; at a danger he takes off, flies off, comes back and bombs from above, lands, fights again
    SKY_H: 24, // m above the ground in the air
    AIR_SPEED: 16, // m/s of the flight
    DANGER_HP: 0.5, // below this share of health …
    DANGER_MANA: 0.2, // … or of mana …
    DANGER_BURST: 0.3, // … or this share of his health lost within BURST_S → up he goes
    BURST_S: 5,
    UP_T: 2.2, // s of the climb
    AWAY: [46, 4.5], // flies off to this distance (m) or for this long (s)
    STRAFE_T: 11, // s over the foe, bombing
    STRAFE_R: 18, // m from the foe (horizontal), circling
    BOMB_EVERY: 3.2, // s between two bombs from above
    AIR_REGEN: 1.6, // health a second while he is away
    AIR_CD: 14, // s on the ground before the next take-off (unless below DANGER_HP × 0.6)
    WIND_NEAR: 9, // m: a player this close — the wind first (to push him off)
    GROUND_T: 11, // s of the ground fight (a few «Электром») — and up again for the bombs: the cycle (the author 08.11: from above → down, a few spells → up again)
    ROCKET: 32, // m/s: he flies at the foe like a rocket …
    HELP_FROM: 13, // m: … until he is this close, and at once a «Bombardo» on him (his style: the author 08.11) — and the same each time the foe gets farther than this
    ROCKET_AGAIN: 22, // m: the foe got away this far — a new rocket // m: farther from the foe than this, he flies to him at once (he comes into the fight, not stands aside)
    LINE_GAP_S: 9, // s between two lines
};

/** The Saviours by stage: 0 — the first (700 mana), 1 — every later one (1500 mana); the same per-kill probability at both stages. */
export const STAGES = [
    { n: 0, mana: 700, hp: 60, ward: 40, speed: 1.9, dome: { hits: 8, t: 11, cd: 9 }, names: [['Бирмолиус Храбрый', 'Бирмолия Храбрая']] },
    { n: 1, mana: 1500, hp: 90, ward: 70, speed: 2.15, dome: { hits: 12, t: 14, cd: 7 }, names: [['Лучезар Сияющий', 'Лучезара Сияющая']] },
];
export const stageOf = (n) => STAGES[Math.min(1, Math.max(0, n | 0))];

/** The person of a Saviour's site «ww<gx>_<gz>» (gx ≥ GX0: his own place on the world's map of wanderers; gz is the stage): the same on every computer (a guest sees what the host sees). */
export const GX0 = 7000;
export function saviorEntry(gx, gz = 0) {
    const st = stageOf(gz), female = (gx & 1) === 1, seed = (Math.imul(gx, 2654435761) ^ 0x5a17) >>> 0;
    return { idx: 1, role: 'savior', female, name: st.names[0][female ? 1 : 0], home: -1, stall: -1, seed, brave: 1, wizard: true, robe: createRng(seed ^ 0x726f6265)() < 0.5, rank: 'savior', mana: st.mana, savior: st.n };
}

/** Is it a danger for him now (pure)? hurt badly, little mana, or a burst of damage (shares of his health / mana). */
export const dangerNow = ({ hpK = 1, manaK = 1, burst = 0 } = {}) => hpK < SAVIOR.DANGER_HP || manaK < SAVIOR.DANGER_MANA || burst >= SAVIOR.DANGER_BURST;

/** The prepared lines — he despises killers (the author: «против таких волшебников я никого не жалею»). */
export const SAVIOR_LINES = {
    arrive: ['Хватит. Кровь волшебников на твоих руках — и я пришёл её остановить.', 'Ты убивал моих братьев. Больше не будешь.'],
    attack: ['Против таких, как ты, я никого не жалею!', 'Я презираю тех, кто убивает ради забавы.'],
    hurt: ['Твоя сила — это сила убийцы. Она ничего не стоит!', 'Бей сильнее — ты всё равно проиграешь.'],
    dome: ['Моя защита крепче твоей злобы.'],
    fly: ['Я ещё вернусь — и ты ответишь за каждого.'],
    win: ['Ты сам выбрал этот конец.'],
    leave: ['Я не пощадил бы тебя. Радуйся, что ушёл.'],
};

/** Rest between visits; there is no kill counter or time window. */
export class VisitCooldown {
    constructor() { this.until = new Map(); }
    resting(id, now) { for (const [key, until] of this.until) if (until <= now) this.until.delete(key); return now < (this.until.get(id) || 0); }
    rest(id, now) { this.until.set(id, now + SAVIOR.COOLDOWN_S); }
    forget(id) { this.until.delete(id); }
}

/** Each wizard killed: the true black-magic level is the percentage chance, regardless of skin whitening. */
export const saviorComes = (level, rng = Math.random) => rng() < Math.max(0, Math.min(100, Number(level) || 0)) / 100;

/** A line of a kind, never the same twice in a row (`last`: the previous one). */
export function saviorLine(kind, last = null, rng = Math.random) {
    const a = SAVIOR_LINES[kind] || [];
    if (!a.length) return null;
    const b = a.filter((x) => x !== last);
    return (b.length ? b : a)[Math.floor(rng() * (b.length || a.length))];
}

/** The spells he may cast: none of them dark (the white mage). */
export const WHITE_SPELLS = ['NihilisDuel', 'Electrum', 'WindMaxima', 'BombardoMaxima', 'Bombardo'];
/** His spells that are not duel charges (cast as the players' own: SpellManager.cast with his id). Mana of each: WizardAI.NPC_COST. */
export const SAVIOR_SPECIAL = new Set(['WindMaxima', 'BombardoMaxima', 'Bombardo']);

/**
 * Which special spell he casts now (pure): `seen` {Bombardo, BombardoMaxima: seconds since the player cast it, or null}, `cd` {name: s left}, `dist` to the player.
 * «Bombardo Maxima» only if he SEES the player use it; the plain «Bombardo» if the player used any Bombardo; the wind when the player is close or now and then. → name | null
 */
export function pickSpecial({ seen = {}, cd = {}, dist = 20, mana = 100, crowd = 1, rng = Math.random }) {
    const ok = (n, cost) => (cd[n] ?? 0) <= 0 && mana >= cost;
    const lately = (n) => seen[n] != null && seen[n] <= SAVIOR.SEEN_S;
    if (lately('BombardoMaxima') && ok('BombardoMaxima', SPELL_COST.BombardoMaxima)) return 'BombardoMaxima';
    if ((lately('Bombardo') || lately('BombardoMaxima')) && ok('Bombardo', SPELL_COST.Bombardo)) return 'Bombardo';
    if (crowd >= 2 && ok('Bombardo', SPELL_COST.Bombardo)) return 'Bombardo'; // (a crowd of enemies — the blasts roll over all of them, seen or not)
    if (crowd >= 2 && dist < 30 && ok('WindMaxima', SPELL_COST.WindMaxima)) return 'WindMaxima';
    if (dist < SAVIOR.WIND_NEAR && ok('WindMaxima', SPELL_COST.WindMaxima)) return 'WindMaxima';
    if (dist < 24 && ok('WindMaxima', SPELL_COST.WindMaxima) && rng() < 0.01) return 'WindMaxima';
    return null;
}

/** ON WHOM / ON WHAT (CLAUDE.md): who and what he meets. */
export const SAVIOR_TARGETS = {
    me: { does: 'fight', why: 'приходит ради игрока, убившего 10 волшебников за 2 минуты; бьёт заклинаниями дуэли — защиту решает компьютер игрока (Protection)' },
    players: { does: 'fight', why: 'считает убийства любого игрока (хост ведёт счёт для всех, гость тоже вызывает его); приходит к тому, кто убил' },
    castlePeople: { does: 'none', why: 'жителей не трогает: он белый маг, воюет только с убийцей и с тем, кто нападает на него' },
    animals: { does: 'none', why: 'не трогает' },
    spells: { does: 'immune', why: 'защита от тьмы вдвое, огонь не берёт, Бомбарда не ранит (Бум/Инспириус вдвое); взрыв и толчок его всё же двигают; божественные заклинания действуют на него как на любого' },
    magic: { does: 'white', why: 'никакой чёрной магии: нет Авады, Сапиры, Акцентрика' },
};
