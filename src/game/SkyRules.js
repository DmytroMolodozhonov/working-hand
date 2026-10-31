/**
 * SkyRules.js — «небесные» заклинания: те, что берут силу у неба (молния, солнечный луч, дождь, гром, салют, чёрные тучи ритуала).
 * Слова автора: «запретить использовать их в помещении. Не запрет, а просто сообщение… Неважно что: главное, что НЕБО НЕ ВИДНО — оно закрыто,
 * значит, нельзя воспользоваться». Одна проверка на всех: `skyVisible(game, pos)` → null (небо видно) или причина закрытого неба.
 *
 * Чистый модуль без THREE. Игра спрашивает `skyBlockFor(game, name)` в одном месте — `Game._castLocalSpell` (рядом со `spaceSpellBlock`/`hellSpellBlock`):
 * решает компьютер колдующего, мана не списывается (проверка стоит ДО оплаты), гости видят только результат.
 *
 * Что считается небом (решения):
 *  • над точкой столб воздуха/воды до ~120 м (`SKY.REACH`) без твёрдых блоков — небо видно; крыша, потолок, свод пещеры, этаж выше — закрыто;
 *  • дверной проём и дыра в крыше — столб над точкой свободен, значит открыто (смотрим прямо вверх над головой, а не «из комнаты наружу»);
 *  • стеклянная крыша — стекло твёрдый блок, закрывает (небо «не видно»: заклинание не сработает);
 *  • листва: густая крона (≥ `SKY.CANOPY` слоёв листвы в столбе над головой, или листва над любым твёрдым блоком) закрывает; один-два слоя листьев — нет;
 *  • навес — это крыша, закрывает; паруса не закрывают (это не блоки мира), палуба-потолок каюты закроет, когда корабль даст `ceilingAt` (пока — только блоки мира);
 *  • под водой неба не видно; в аду неба нет; в космосе и на планетах решает `spaceSpellBlock` (Space.js) — здесь не вмешиваемся;
 *  • Ледяной замок: своды и стены из блоков — те же правила; ворота/люстра — не потолок.
 */

import { BLOCK } from '../world/Terrain.js';

export const SKY = {
    REACH: 120, // м: дальше крыша над головой считается «небом»
    CANOPY: 3, // слоёв листвы над головой, при которых крона закрывает небо
    HEAD: 1.1, // м: от ног игрока (group.y) до уровня, с которого смотрим вверх (ceilingAt берёт «голову»)
    MSG_GAP: 2000, // мс между сообщениями (не спамить)
};

/** Причины закрытого неба → сообщение игроку (одно короткое). */
export const SKY_WHY = {
    roof: '🏠 Вы в помещении — заклинание не сработает',
    cave: '🕳️ Вы в пещере — над вами не видно неба, заклинание не сработает',
    canopy: '🌳 Крона закрывает небо — заклинание не сработает',
    water: '🌊 Под водой неба не видно — заклинание не сработает',
    hell: '🔥 В аду нет неба — заклинание не сработает',
};

/**
 * «Заклинание → нужно ли небо». needs: true — без видимого неба не срабатывает.
 * Небо смотрим над КОЛДУЮЩИМ (`at: 'caster'`). У молнии ещё и над ЦЕЛЬЮ: цель под крышей молния не бьёт, удар приходится в крышу (`target: true`).
 * false — просмотрено и небо не нужно (с причиной): тест требует, чтобы каждое известное небесное слово было здесь.
 */
export const SKY_SPELLS = {
    LightningStrike: { needs: true, at: 'caster', target: true, why: 'молния падает из туч; цель под крышей не поражается — удар приходится в крышу' },
    ToTheSun: { needs: true, at: 'caster', why: 'луч идёт сквозь тучи к солнцу' },
    LetItRain: { needs: true, at: 'caster', why: 'тучи собираются в небе над вами' },
    Thunderwave: { needs: true, at: 'caster', why: 'удар идёт сверху (ThunderWave.roofAbove защищает тех, кто под крышей)' },
    Fireworks: { needs: true, at: 'caster', why: 'залпы взлетают в небо и рвутся над палочкой' },
    // не заклинание-слово, а ритуал пентаграммы «Pentagranium Gargoyles»: чёрные тучи собираются в небе над кругом
    PentagramGargoyles: { needs: true, at: 'circle', why: 'чёрные тучи ритуала собираются в небе над кругом' },
    // предмет: Молот Тора — молния бьёт в молот только под небом (Gear._updateHammer)
    ThorHammer: { needs: true, at: 'caster', why: 'молния падает с неба в поднятый молот' },

    // ——— просмотрено, небо НЕ нужно ———
    Hellfire: { needs: false, why: 'огонь рождается у палочки и идёт от земли' },
    Inferno: { needs: false, why: 'огонь из палочки' },
    Inspirius: { needs: false, why: 'божественная волна от колдующего, не с неба' },
    Boom: { needs: false, why: 'божественный разрыв изнутри' },
    TotalDestruction: { needs: false, why: 'разрушение от колдующего вовне' },
    TotalDestructionMaxima: { needs: false, why: 'то же' },
    CircleAttack: { needs: false, why: 'круг вокруг колдующего' },
    CircleAttackMaxima: { needs: false, why: 'то же' },
    WaterVortexSuperMaxima: { needs: false, why: 'вода идёт вокруг колдующего, а не с неба' },
    Frozen: { needs: false, why: 'холод из руки' },
    Snowman: { needs: false, why: 'из снега под палочкой' },
    Flight: { needs: false, why: 'полёт сам решает, где ему тесно (UpSpell/Flight)' },
    FlyingMaxima: { needs: false, why: 'уже решает «крыша над головой» (Space.js)' },
    AvadaKedavra: { needs: false, why: 'прямой луч' },
    Wind: { needs: false, why: 'ветер из руки' },
};

/** Какие заклинания требуют неба (имена). */
export const SKY_NEEDING = Object.keys(SKY_SPELLS).filter((k) => SKY_SPELLS[k].needs);

export const needsSky = (name) => !!SKY_SPELLS[name]?.needs;

const LEAVES = new Set([BLOCK.LEAVES, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LEAVES, BLOCK.CHERRY_LEAVES, BLOCK.DARK_LEAVES, BLOCK.PLANET_LEAF]);
/** Листва? (крона: один-два слоя неба не закрывают) */
export const isLeaf = (b) => LEAVES.has(b);

const NO_OPTS = {};

/**
 * Над точкой (x, y, z) — небо видно? y — высота ног стоящего. Возвращает null (видно) или причину из `SKY_WHY`.
 * Быстро: один столб блоков (ceilingAt + при листве несколько get), без аллокаций.
 */
export function skyVisible(game, x, y, z, opts = NO_OPTS) {
    if (game?.hellGate?.inHell) return 'hell';
    if (opts.underwater) return 'water';
    const col = game?.collision;
    if (!col?.ceilingAt) return null;
    const head = y + SKY.HEAD;
    const c = col.ceilingAt(x, z, head);
    if (!(c < head + SKY.REACH)) return null; // (Infinity — открытое небо; очень далеко — тоже небо)
    // листва? первый «потолок» — лист: считаем слои, смотрим, есть ли что-то твёрдое выше
    const T = game.terrain;
    if (T?.blockAt) {
        const leaf = isLeaf;
        const ix = Math.round(x), iz = Math.round(z);
        let L = Math.round(c + 1.5), n = 0;
        const top = T.topLayer ? T.topLayer(ix, iz) : L + 30;
        while (L <= top && leaf(T.blockAt(ix, L, iz))) { n++; L++; }
        if (n > 0) {
            // над листвой ещё что-то твёрдое (не воздух/вода) — крыша; иначе только крона
            let solidAbove = false;
            for (let l = L; l <= top; l++) { const b = T.blockAt(ix, l, iz); if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE_SHAPE && !leaf(b)) { solidAbove = true; break; } }
            if (!solidAbove) return n >= SKY.CANOPY ? 'canopy' : null;
        }
    }
    const cv = game.world?.cave || 0;
    return cv > 0.3 ? 'cave' : 'roof';
}

/** Сообщение для причины. */
export const skyMessage = (why) => SKY_WHY[why] || SKY_WHY.roof;

/**
 * Для `Game._castLocalSpell`: причина отказа в виде текста или null. Не вмешивается за пределами Земли (там `spaceSpellBlock`).
 */
export function skyBlockFor(game, name) {
    const r = SKY_SPELLS[name];
    if (!r || !r.needs) return null;
    if (game?.space?.offEarth) return null; // (космос и планеты: Space.spellBlocked)
    const p = game?.character?.group?.position;
    if (!p) return null;
    const why = skyVisible(game, p.x, p.y, p.z, { underwater: !!game.swim?.underwater });
    return why ? skyMessage(why) : null;
}

/**
 * Куда на самом деле бьёт молния, если цель — под крышей: на крышу над целью (удар виден, а тем, кто под ней, не достаётся).
 * Возвращает true, если точку сдвинули.
 */
export function lightningLand(game, point) {
    if (!point) return false;
    const ground = point.y;
    if (!skyVisible(game, point.x, ground, point.z)) return false;
    const T = game.terrain;
    const ix = Math.round(point.x), iz = Math.round(point.z);
    const top = T?.topLayer ? T.topLayer(ix, iz) - 0.5 : ground + 8;
    point.y = Math.max(top, ground) + 3.2; // (шар поражения 3 м не достаёт под крышу)
    return true;
}

/** Не чаще раза в `MSG_GAP` мс: можно ли сейчас показать сообщение (состояние держит вызывающий). */
export function mayTell(state, now) {
    if (now - (state.at || -1e9) < SKY.MSG_GAP) return false;
    state.at = now;
    return true;
}
