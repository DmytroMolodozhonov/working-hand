/**
 * HeroSettingsUi.js — раздел «Настройки героя» в окне создания Творческого мира (правила — game/HeroSetup.js).
 * `mountHeroPanel(root, prefix)` рисует раздел внутри `root` и возвращает `{ read, set }`:
 * `read()` — настройки в виде, который понимает мир (`config.hero`), `set(h)` — выставить окно.
 * Тексты — как сказал бы человеку автор: польза, потом как пользоваться, на «вы».
 */

import { DEFAULT_HERO, HERO, normalizeHero } from '../game/HeroSetup.js';
import { rankDuelPower, rankDuelRange, WIZ_RANK_RU } from '../game/WizardAI.js';
import { SPAWN_SPOTS, DUEL_FOES } from '../game/SpawnSpots.js';

const T = {
    mana: 'Ячейки маны — сколько маны вы можете накопить. С бесконечной маной заклинания ничего не стоят и колдовать можно сколько угодно. Если убрать галочку, мана станет обычной: тратится на заклинания и сама набирается обратно (1 в секунду). Впишите, сколько ячеек у вас будет.',
    cells: 'Сколько ячеек маны будет у героя. От 30 до 100 000. Чем больше ячеек, тем больше можно наколдовать подряд.',
    armor: 'Магическая броня — шлем, нагрудник и поножи. Они прочнее обычных, сами чинятся и отталкивают простейшие заклинания. Если оставить галочку, герой начнёт игру уже в доспехах.',
    robe: 'Магическая мантия защищает от холода и смягчает часть сильных заклинаний. Её можно носить вместе с бронёй. Если оставить галочку, герой начнёт игру в мантии.',
    spellsAll: 'Все заклинания игры известны сразу — свитки учить не нужно.',
    spellsMage: 'Известны почти все заклинания, кроме божественных (свитки храма богов, «Flying Maxima» и другие) и «Inspirius». Их можно выучить позже, сжигая свитки.',
    duelFull: 'В столкновении лучей герой выступает на полную силу: он не слабее соперника.',
    duelCustom: `Сделайте дуэли честнее: впишите число — столько дуэльной силы будет у героя в столкновении лучей. Это те же числа, что показаны над соперником на арене. От ${HERO.DUEL_MIN} до ${HERO.DUEL_MAX} (сила самого сильного мага). Работает, когда стоит галочка «Бесконечная мана». Если вы её сняли, дуэль идёт по правилам Выживания: сила луча зависит от вашей маны сейчас, дуэльного мастерства и здоровья, а это число не используется.`,
    dark: 'Чёрная магия: с чем герой начинает. 0 — чистый маг, чем выше число, тем темнее кожа и тем хуже к вам относятся волшебники. Уровень можно менять уже в игре.',
    breakward: 'Метка слома защиты снимает требования ячеек маны у заклинаний: хватит той маны, что есть. Но заклинание может вырваться из-под контроля. Если поставить галочку, герой начнёт игру уже с меткой.',
    spawn: 'Где герой появится при входе в мир и после возрождения. Выберите босса, которого хотите проверить, — вы окажетесь рядом с ним, а не на начальной площадке. Если рядом с кроватью — кровать не учитывается: возрождение всегда здесь.',
    foe: 'Кто выйдет против вас на арене. Слабый — начинающий волшебник, средний — продвинутый, сильный — преподаватель, мастер — глава башни (самый сильный). «Случайный» — каждый раз новый уровень. Проиграли — сразу новая дуэль с волшебником того же уровня.',
    noCrew: 'Корабли в порту и в море стоят пустыми: на них нет ни капитана, ни моряков. Чёрный корабль тоже без капитана Чёрные Усы и скелетов — на нём можно спокойно осмотреться. Удобно, чтобы проверить корабли отдельно от команды.',
    health: 'Здоровье. «Бессмертен» — герой не получает урона и не умирает (так в Творческом было всегда). «Обычное здоровье» — как в Свободном мире: удары, огонь, падение ранят, а при нуле герой погибает, роняет вещи и возрождается.',
    maxHp: 'Сколько здоровья у героя при обычном здоровье. По умолчанию 20 — как в Свободном мире.',
    steady: 'Устойчивость — шанс устоять на ногах, когда вас пытаются сбить заклинанием. 100 — всегда устоите, 1 — собьёт почти каждое.',
};

const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
/** Подсказки «сколько силы у волшебника такого вида» — числа считаются из тех же данных, что и бой (WizardAI). */
export const DUEL_RANK_ROWS = [
    ['novice', 'Младший (начинающий) волшебник'], ['adept', 'Средний (продвинутый) волшебник'], ['teacher', 'Преподаватель'],
    ['elder', 'Сильный волшебник поселения'], ['master', 'Главный мастер башни — Джовалилиус Правдиус Нотан'],
].map(([rank, label]) => {
    const [lo, hi] = rankDuelRange(rank);
    const avg = rankDuelPower(rank);
    const who = rank === 'master' ? 'Глава башни Джовалилиус Правдиус Нотан' : `Средний ${WIZ_RANK_RU[rank][0]}`;
    return { rank, label, avg: f1(avg), lo: f1(lo), hi: f1(hi), tip: `${who} имеет около ${f1(avg)} дуэльной силы (у разных — от ${f1(lo)} до ${f1(hi)}).` };
});
/** Подпись соперника в списке: кто он и сколько у него дуэльной силы (числа — из боя, WizardAI). */
const FOE_RANK = { weak: 'novice', mid: 'adept', strong: 'teacher', master: 'master' };
const foeOption = (x) => {
    const row = DUEL_RANK_ROWS.find((r) => r.rank === FOE_RANK[x.id]);
    const text = row ? `${x.label} — сила ≈ ${row.avg} (у разных от ${row.lo} до ${row.hi})` : `${x.label} — любой из четырёх`;
    return `<option value="${x.id}" title="${row ? row.tip : 'Каждый раз новый уровень соперника.'}">${text}</option>`;
};

/** Starts where ships are about: only then «Корабли без моряков» is asked. */
const SHIP_STARTS = ['port', 'blackship'];

const html = (p) => `
<div class="hero-settings" data-hero-panel>
  <h4 class="hero-h">🧙 Настройки героя</h4>
  <div class="hero-row" title="${T.spawn}"><label for="${p}-spawn">📍 Где появиться:</label> <select id="${p}-spawn">${SPAWN_SPOTS.map((x) => `<option value="${x.id}" title="${x.hint}">${x.label}</option>`).join('')}</select></div>
  <div class="hero-row" id="${p}-foe-row" hidden title="${T.foe}"><label for="${p}-foe">⚔️ Соперник на арене:</label> <select id="${p}-foe">${DUEL_FOES.map(foeOption).join('')}</select></div>
  <label class="world-opt" title="${T.noCrew}"><input type="checkbox" id="${p}-nocrew"> ⚓ Корабли без моряков <span class="mp-hint">— и чёрный корабль без капитана и скелетов</span></label>
  <label class="world-opt" title="${T.mana}"><input type="checkbox" id="${p}-inf" checked> ♾️ Бесконечная мана <span class="mp-hint">— заклинания ничего не стоят</span></label>
  <div class="hero-row" id="${p}-cells-row" hidden title="${T.cells}">
    <label for="${p}-cells">🔷 Ячеек маны:</label>
    <input type="number" id="${p}-cells" min="${HERO.CELLS_MIN}" max="${HERO.CELLS_MAX}" step="10" value="${HERO.CELLS_DEFAULT}">
    <span class="mp-hint">от ${HERO.CELLS_MIN} до ${HERO.CELLS_MAX.toLocaleString('ru-RU')}; мана тратится и набирается по правилам</span>
  </div>
  <label class="world-opt" title="${T.armor}"><input type="checkbox" id="${p}-armor" checked> 🪖 Магическая броня <span class="mp-hint">— шлем, нагрудник, поножи</span></label>
  <label class="world-opt" title="${T.robe}"><input type="checkbox" id="${p}-robe" checked> 🧥 Магическая мантия <span class="mp-hint">— можно вместе с бронёй</span></label>
  <div class="hero-group" role="radiogroup" aria-label="Дуэльная сила">
    <span class="hero-cap">⚔️ Дуэльная сила</span>
    <label class="hero-seg" title="${T.duelFull}"><input type="radio" name="${p}-duel" value="full"> Полная</label>
    <label class="hero-seg" title="${T.duelCustom}"><input type="radio" name="${p}-duel" value="custom" checked> Настроить</label>
    <span class="hero-slide" id="${p}-duel-wrap" title="${T.duelCustom}"><input type="number" id="${p}-duel-pct" min="${HERO.DUEL_MIN}" max="${HERO.DUEL_MAX}" step="0.1" value="2"> <span class="mp-hint">от ${HERO.DUEL_MIN} до ${HERO.DUEL_MAX}</span></span>
    <span class="mp-hint">Сколько силы у волшебников — смотрите в списке «Соперник на арене».</span>
  </div>
  <div class="hero-group" role="radiogroup" aria-label="Здоровье">
    <span class="hero-cap">❤️ Здоровье</span>
    <label class="hero-seg" title="${T.health}"><input type="radio" name="${p}-health" value="immortal" checked> Бессмертен</label>
    <label class="hero-seg" title="${T.health}"><input type="radio" name="${p}-health" value="normal"> Обычное здоровье</label>
    <span class="hero-slide" id="${p}-hp-wrap" hidden title="${T.maxHp}"><label for="${p}-hp">Максимум HP:</label> <input type="number" id="${p}-hp" min="${HERO.HP_MIN}" max="${HERO.HP_MAX}" value="${HERO.HP_DEFAULT}"></span>
  </div>
  <details class="hero-adv">
    <summary>⚙️ Продвинутые</summary>
    <div class="hero-group" role="radiogroup" aria-label="Заклинания">
      <span class="hero-cap">✨ Заклинания</span>
      <label class="hero-seg" title="${T.spellsAll}"><input type="radio" name="${p}-spells" value="all" checked> Все заклинания есть</label>
      <label class="hero-seg" title="${T.spellsMage}"><input type="radio" name="${p}-spells" value="mage"> Только заклинания сильного мага</label>
    </div>
    <div class="hero-row" title="${T.dark}"><label for="${p}-dark">🜏 Чёрная магия:</label> <input type="range" id="${p}-dark" min="0" max="${HERO.DARK_MAX}" value="0"> <b id="${p}-dark-val">0</b></div>
    <label class="world-opt" title="${T.breakward}"><input type="checkbox" id="${p}-bw"> 🜏 Метка слома магической защиты <span class="mp-hint">— с самого начала</span></label>
    <div class="hero-row" title="${T.steady}"><label for="${p}-steady">🦶 Устойчивость:</label> <input type="range" id="${p}-steady" min="${HERO.STEADY_MIN}" max="${HERO.STEADY_MAX}" value="100"> <b id="${p}-steady-val">100</b></div>
  </details>
</div>`;

/** Нарисовать раздел в `root`; `prefix` — чтобы окон могло быть несколько (одиночная игра, сервер). */
export function mountHeroPanel(root, prefix = 'hero') {
    root.innerHTML = html(prefix);
    const $ = (s) => root.querySelector(`#${prefix}-${s}`);
    const radio = (n) => root.querySelector(`input[name="${prefix}-${n}"]:checked`)?.value;
    const sync = () => {
        $('cells-row').hidden = $('inf').checked;
        $('foe-row').hidden = $('spawn').value !== 'arena';
        $('nocrew').closest('label').hidden = !SHIP_STARTS.includes($('spawn').value); // (ships' crews: only when the start is at the port or at sea)
        $('duel-wrap').hidden = radio('duel') !== 'custom';
        $('hp-wrap').hidden = radio('health') !== 'normal';
        $('dark-val').textContent = $('dark').value;
        $('steady-val').textContent = $('steady').value;
    };
    root.addEventListener('input', sync);
    root.addEventListener('change', (e) => {
        // (the author: endless health only at the first start, the starting ground; at every other start — ordinary 20)
        if (e.target === $('spawn')) {
            const start = $('spawn').value === 'start';
            root.querySelector(`input[name="${prefix}-health"][value="${start ? 'immortal' : 'normal'}"]`).checked = true;
            if (!start) $('hp').value = HERO.HP_DEFAULT;
        }
        sync();
    });
    const read = () => normalizeHero({
        infiniteMana: $('inf').checked, cells: $('cells').value === '' ? HERO.CELLS_DEFAULT : $('cells').value,
        armor: $('armor').checked, robe: $('robe').checked,
        spells: radio('spells'),
        duelPower: radio('duel') === 'custom' && $('duel-pct').value !== '' ? $('duel-pct').value : null,
        spawn: $('spawn').value, noCrew: SHIP_STARTS.includes($('spawn').value) && $('nocrew').checked, foe: $('foe').value, health: radio('health'), maxHp: $('hp').value === '' ? HERO.HP_DEFAULT : $('hp').value,
        dark: $('dark').value, breakward: $('bw').checked, steady: $('steady').value,
    });
    const set = (h) => {
        const v = normalizeHero(h, DEFAULT_HERO);
        $('inf').checked = v.infiniteMana; $('cells').value = v.cells;
        $('armor').checked = v.armor; $('robe').checked = v.robe;
        root.querySelector(`input[name="${prefix}-spells"][value="${v.spells}"]`).checked = true;
        root.querySelector(`input[name="${prefix}-duel"][value="${v.duelPower == null ? 'full' : 'custom'}"]`).checked = true;
        $('spawn').value = v.spawn; $('nocrew').checked = v.noCrew; $('foe').value = v.foe;
        root.querySelector(`input[name="${prefix}-health"][value="${v.health}"]`).checked = true; $('hp').value = v.maxHp;
        $('duel-pct').value = v.duelPower ?? 2; $('dark').value = v.dark; $('bw').checked = v.breakward; $('steady').value = v.steady;
        sync();
    };
    sync();
    return { read, set };
}
