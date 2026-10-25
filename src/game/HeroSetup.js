/**
 * HeroSetup.js — «Настройки героя» Творческого мира (чистые правила, без THREE; игровая часть — HeroApply.js).
 *
 * Автор: когда игрок создаёт мир в Творческом режиме, в окне создания появляются настройки героя:
 *  - мана: «Бесконечная мана» (речь про ЯЧЕЙКИ — максимум маны) либо своё число ячеек 30…100 000 (по умолчанию 500) —
 *    тогда мана обычная: тратится, набирается по правилам (1/с × бонусы);
 *  - «Магическая броня» и «Магическая мантия» — каждая своей галочкой (4 сочетания);
 *  - заклинания: «Все заклинания есть» либо «Только заклинания сильного мага» (всё, кроме заклинаний богов и «Инспириуса»);
 *  - дуэльная сила: полная (100 %) либо 1…100 %;
 *  - здоровье: «Бессмертен» (как раньше) или «Обычное здоровье» (урон и смерть как в Свободном мире; максимум HP, по умолчанию 20);
 *  - место появления: «Начальная площадка» или рядом с драконом / Ледяной Королевой / замком короля (SpawnSpots.js);
 *  - продвинутые: уровень чёрной магии 0…100, «метка слома магической защиты», устойчивость 1…100.
 *
 * Настройки лежат в мире (`config.hero` → сохранение мира → гостям от хоста: «правила мира»). Мир без них (старый) —
 * `LEGACY_HERO`: так в Творческом было раньше (бесконечная мана, все заклинания, БЕЗ брони и мантии, полная сила,
 * тьма 0, устойчивость 100).
 */

import { GOD_SPELLS } from './Mana.js';
import { isDivine } from './ProtectionGods.js';
import { normalizeSpawn, normalizeFoe } from './SpawnSpots.js';
import { rankDuelRange } from './WizardAI.js';

export const HERO = {
    CELLS_MIN: 30, CELLS_MAX: 100000, CELLS_DEFAULT: 500,
    // (дуэльная сила — в очках, как в бою: мана, которая есть сейчас; от 1 очка до самого сильного — Мастера башни)
    DUEL_MIN: 1, DUEL_MAX: Math.round(rankDuelRange('master')[1]),
    DARK_MAX: 100, STEADY_MIN: 1, STEADY_MAX: 100,
    WAND_MAX: 200, // добавка к силе палочки в дуэли, % (Duel._wandK)
    HP_MIN: 1, HP_MAX: 1000, HP_DEFAULT: 20,
};

/** Для нового Творческого мира, пока игрок ничего не менял. */
export const DEFAULT_HERO = Object.freeze({
    infiniteMana: true, cells: HERO.CELLS_DEFAULT,
    armor: true, robe: true,
    spells: 'all', // 'all' | 'mage'
    duelPts: 100, // дуэльная сила героя в очках (как мана в бою: 50 — начинающий волшебник, 100 — продвинутый, 500 — глава башни); null — полная: как у соперника
    dark: 0, breakward: false, steady: 100,
    health: 'immortal', // 'immortal' (as in Creative always) | 'normal' (damage and death as in the free world)
    maxHp: HERO.HP_DEFAULT,
    spawn: 'start', // where the hero appears (SpawnSpots.js)
    wandBonus: 0, // дополнительный процент к силе палочки героя в дуэли (не сама палочка и не её красота): 0…WAND_MAX
    foe: 'mid', // who stands opposite on the arena of «Перед дуэлью» (SpawnSpots.DUEL_FOES)
    noCrew: false, // ships without sailors (and the black ship without Black Moustache and his skeletons) — Sailors.setCrewless
});

/** Старые Творческие миры (без записи в сохранении): как было до настроек — брони и мантии у героя не было. */
export const LEGACY_HERO = Object.freeze({ ...DEFAULT_HERO, armor: false, robe: false, duelPts: null });

const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Привести то, что пришло из окна / сохранения / сети, к допустимому виду (недостающее — из `base`). */
export function normalizeHero(raw, base = DEFAULT_HERO) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const b = { ...DEFAULT_HERO, ...base };
    return {
        infiniteMana: r.infiniteMana == null ? !!b.infiniteMana : !!r.infiniteMana,
        cells: clamp(Math.round(num(r.cells, b.cells)), HERO.CELLS_MIN, HERO.CELLS_MAX),
        armor: r.armor == null ? !!b.armor : !!r.armor,
        robe: r.robe == null ? !!b.robe : !!r.robe,
        spells: r.spells === 'mage' ? 'mage' : r.spells === 'all' ? 'all' : b.spells === 'mage' ? 'mage' : 'all',
        duelPts: normalizeDuelPts(r, b),
        dark: clamp(Math.round(num(r.dark, b.dark)), 0, HERO.DARK_MAX),
        breakward: r.breakward == null ? !!b.breakward : !!r.breakward,
        steady: clamp(Math.round(num(r.steady, b.steady)), HERO.STEADY_MIN, HERO.STEADY_MAX),
        health: r.health === 'normal' ? 'normal' : r.health === 'immortal' ? 'immortal' : b.health === 'normal' ? 'normal' : 'immortal',
        maxHp: clamp(Math.round(num(r.maxHp, b.maxHp)), HERO.HP_MIN, HERO.HP_MAX),
        spawn: normalizeSpawn(r.spawn ?? b.spawn),
        foe: normalizeFoe(r.foe ?? b.foe),
        wandBonus: clamp(Math.round(num(r.wandBonus, b.wandBonus ?? 0)), 0, HERO.WAND_MAX),
        noCrew: r.noCrew == null ? !!b.noCrew : !!r.noCrew,
    };
}

/** Старое сохранение хранило дуэльную силу в процентах (`duel`, 100 = полная). */
export const duelPercentToPts = (pct) => (pct >= 100 ? null : Math.max(HERO.DUEL_MIN, Math.round(clamp(pct / 100, 0, 1) * HERO.DUEL_MAX)));
/** Потом — числом по старой шкале (`duelPower`: √(мана/30) + 0,35): в очках это мана, равная такой силе. */
export const oldPowerToPts = (p) => Math.max(HERO.DUEL_MIN, Math.round(30 * Math.max(0, p - 0.35) ** 2));

function normalizeDuelPts(r, b) {
    let v = r.duelPts;
    if (v === undefined && r.duelPower !== undefined) v = r.duelPower === null || r.duelPower === '' || !Number.isFinite(+r.duelPower) ? null : oldPowerToPts(+r.duelPower); // (миграция)
    if (v === undefined && r.duel !== undefined) v = duelPercentToPts(num(r.duel, 100)); // (миграция)
    if (v === undefined) v = b.duelPts ?? (b.duelPower != null ? oldPowerToPts(+b.duelPower) : null);
    if (v === null || v === '' || !Number.isFinite(+v)) return null;
    const n = Math.round(clamp(+v, HERO.DUEL_MIN, HERO.DUEL_MAX));
    return n >= HERO.DUEL_MAX ? null : n; // (максимум = полная сила)
}

/** Настройки героя этого мира: записанные — как есть; нет записи (старый мир) — как было раньше. */
export const heroOf = (config) => (config?.hero ? normalizeHero(config.hero, LEGACY_HERO) : { ...LEGACY_HERO });

/** Для сети и сохранения: только настоящие настройки (в Творческом); в других режимах их нет. */
export const heroForSave = (config) => (config?.mode === 'creative' && config.hero ? normalizeHero(config.hero, LEGACY_HERO) : undefined);

/** Творческий и мана бесконечная: мана не тратится, ячейки не считаются (как раньше во всём Творческом). */
export const creativeInfiniteMana = (game) => game?.config?.mode === 'creative' && (game.hero ?? heroOf(game.config)).infiniteMana;

/** Творческий с конечной маной: тратится и набирается по обычным правилам. */
export const creativeFiniteMana = (game) => game?.config?.mode === 'creative' && !(game.hero ?? heroOf(game.config)).infiniteMana;

/** Работают ли правила маны (Выживание — всегда; Творческий — только если мана конечная, даже при обычном здоровье). */
export const manaRules = (game) => (game?.config?.mode === 'creative' ? creativeFiniteMana(game) : !!game?.combat?.enabled);

/** Творческий с «Обычным здоровьем»: урон и смерть как в Свободном мире (Combat.enabled). */
export const creativeMortal = (game) => game?.config?.mode === 'creative' && (game.hero ?? heroOf(game.config)).health === 'normal';

/** Заклинания «сильного мага» не включают: заклинания богов (`Mana.GOD_SPELLS`, `ProtectionGods.isDivine`) и «Инспириус». */
export const MAGE_EXCLUDED = new Set(['Inspirius']);

/** Известно ли заклинание в Творческом при этих настройках (`hero` — `heroOf(config)`). */
export function knownInCreative(hero, spell) {
    if (!spell) return false;
    if (!hero || hero.spells !== 'mage') return true;
    return !(GOD_SPELLS.has(spell) || isDivine(spell) || MAGE_EXCLUDED.has(spell));
}

/** Сила героя в Творческой дуэли: заданное число (+удача); null — полная, `full` (как у соперника). */
export const duelStrengthOf = (hero, full) => (hero?.duelPts == null ? full : hero.duelPts);

/** Короткое описание для журнала/отчёта. */
export function heroSummary(h) {
    return [h.infiniteMana ? 'мана ∞' : `ячеек ${h.cells}`, h.armor ? 'броня' : 'без брони', h.robe ? 'мантия' : 'без мантии',
        h.spells === 'mage' ? 'заклинания сильного мага' : 'все заклинания', `дуэль ${h.duelPts ?? 'полная'}`, h.wandBonus ? `палочка +${h.wandBonus}%` : '', `тьма ${h.dark}`, h.breakward ? 'метка слома' : '', h.health === 'normal' ? `HP ${h.maxHp}` : 'бессмертен', `устойчивость ${h.steady}`].filter(Boolean).join(', ');
}
