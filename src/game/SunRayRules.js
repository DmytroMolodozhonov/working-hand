/**
 * SunRayRules.js — «Sun Ray» («Сан Рей»): the rules (pure, no THREE). The spell itself, its beam and its picture — SunRay.js.
 *
 * The author 07.11: «другое заклинание. 500 маны, божественное, свиток богов. Берёт энергию солнца и делает луч. Игрок направляет на солнце свою палочку и произносит
 * заклинание — в слове первый «сан». Он берёт энергию солнца, потом перенаправляет её на существо и говорит «атак». Зависит от того, насколько близко игрок к Солнцу:
 * у Меркурия урон 1000, каждая следующая планета в списке — минус 200: на Венере 800, на Земле 600 и так дальше. Если доходит до нуля — пишется, что заклинание не достаёт
 * до Солнца.» And: «этот луч будет очень эпическим — испепеляющий луч энергии солнца; в основном чтобы уничтожить титанов».
 *
 * The list is the planets by their distance from the Sun (the Moon counts as the Earth, the gods' made planets stand in their orbit among the others):
 * Mercury 1000, Venus 800, Earth 600, Mars 400, Jupiter 200, then 0 — «не достаёт до Солнца» (Saturn, Uranus, Neptune, Pluto and everything beyond).
 */

export const SUNRAY = {
    COST: 500, // mana (Combat.SPELL_COST.SunRay) — paid at the word; the attack costs nothing more
    TOP: 1000, // damage at the nearest planet
    STEP: 200, // minus this for each next planet in the list
    AIM_DEG: 16, // the wand must point this near the Sun to take its energy
    HOLD_DEG: 30, // …and the charge goes on while it is kept this near
    CHARGE_T: 3, // s of keeping the wand on the Sun to take the energy
    LOSE_T: 4, // s of the wand off the Sun (while charging) after which the charge is lost
    HOLD_T: 45, // s the taken energy stays in the wand before it fades away
    MIN_ELEV: 0.05, // the Sun's height above the horizon (sin) from which it can be pointed at
    REACH: 420, // m the beam goes
    WIDTH: 2.2, // m: a body this near the beam's axis is burnt (+ its own radius)
    BEAM_T: 2.4, // s the beam burns (it follows the wand)
    FIRST: 10, // cells of the mana maximum the first time the beam really hit something (Mana.FIRST_SPELL.SunRay)
};

/** The damage by the place in the list (0 = Mercury): TOP, −STEP each. Pure. */
export const sunPower = (index) => Math.max(0, SUNRAY.TOP - SUNRAY.STEP * index);

/**
 * The place of a planet in the list of planets by distance from the Sun: `list` — [{id, a, kind, parent?}] (PlanetRegistry.list), `id` the planet the hero stands on.
 * The Moon (or any moon) counts as its parent; the Sun and the moons are not in the list. → index or −1 (unknown). Pure.
 */
export function planetIndex(list, id) {
    const by = new Map(list.map((p) => [p.id, p]));
    let me = by.get(id);
    if (!me) return -1;
    if (me.parent && by.get(me.parent)) me = by.get(me.parent);
    const order = list.filter((p) => p.kind !== 'star' && !p.parent && Number.isFinite(p.a)).sort((x, y) => x.a - y.a);
    return order.findIndex((p) => p.id === me.id);
}
/** The damage on the planet `id` (the Earth: id 'earth'): number ≥ 0. Pure. */
export function sunPowerAt(list, id) {
    const i = planetIndex(list, id);
    return i < 0 ? 0 : sunPower(i);
}

/** The angle (degrees) between the wand's direction and the Sun's. Pure ({x,y,z} both, unit or not). */
export function angleDeg(a, b) {
    const la = Math.hypot(a.x, a.y, a.z) || 1, lb = Math.hypot(b.x, b.y, b.z) || 1;
    const c = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
}

/** The power rides the packet in the direction's length (a unit vector times 1 + power/5000): the host reads it back. Pure. */
export const packPower = (power) => 1 + Math.max(0, power) / 5000;
export const unpackPower = (len) => Math.max(0, Math.round((len - 1) * 5000 / SUNRAY.STEP) * SUNRAY.STEP);

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/sun-ray.test.js. */
export const SUNRAY_TARGETS = {
    titans: { does: 'hurt', why: 'главная цель: урон — по месту планеты в списке (1000 у Меркурия, −200 за каждую следующую; Венера 800, Марс 400, Юпитер 200); Титан-тень от света страдает сильнее (×1,5); Сатурн, Уран, Нептун — до Солнца не достать (0)' },
    me: { does: 'charge', why: 'заклинатель держит палочку на Солнце ~3 с — заряд набран и висит в палочке 45 с, пока не скажет «Атак» или «стоп»; 500 маны сразу, дальше ничего' },
    players: { does: 'none', why: 'не действует на игроков (оружие против существ и титанов; игроков не ранит) — все видят заряд и луч' },
    zombies: { does: 'burn', why: 'испепелены (как «Дай»: насквозь, любая защита)' }, castlePeople: { does: 'burn', why: 'испепелены; жители и рыцари видят, кто стрелял (тревога)' },
    animals: { does: 'burn', why: 'испепелены' }, sailors: { does: 'burn', why: 'испепелены (в координатах корабля)' },
    spider: { does: 'burn', why: 'как «Дай»: Солнце сильнее паучихи' }, dragons: { does: 'burn', why: 'как «Дай»' },
    iceQueen: { does: 'burn', why: 'как «Дай»: лёд перед Солнцем бессилен' },
    diabolos: { does: 'none', why: 'Дьяволос бессмертен кроме божественного меча (в аду заклинание не колдуется)' },
    blocks: { does: 'none', why: 'камень, дома, деревья не ломает и не жжёт: луч выжигает существ; упирается в первую твёрдую преграду' },
    ships: { does: 'none', why: 'корабль не ломает; луч заканчивается на его борту' },
    water: { does: 'none', why: 'воду не испаряет' },
    sun: { does: 'need', why: 'нужно видеть Солнце над горизонтом (не под крышей, не в пещере, не в дождь и не под чёрными тучами) и держать на нём палочку; ночью на Земле Солнца нет' },
    space: { does: 'none', why: 'в открытом космосе не колдуется — нужна поверхность Земли или планеты (Space.spaceSpellBlock)' },
    hell: { does: 'none', why: 'в аду нет неба — не колдуется' },
};
