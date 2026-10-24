/**
 * HeroSettingsUi.js — раздел «Настройки героя» в окне создания Творческого мира (правила — game/HeroSetup.js).
 * `mountHeroPanel(root, prefix)` рисует раздел внутри `root` и возвращает `{ read, set }`:
 * `read()` — настройки в виде, который понимает мир (`config.hero`), `set(h)` — выставить окно.
 * Тексты — как сказал бы человеку автор: польза, потом как пользоваться, на «вы».
 */

import { DEFAULT_HERO, HERO, normalizeHero } from '../game/HeroSetup.js';

const T = {
    mana: 'Ячейки маны — сколько маны вы можете накопить. С бесконечной маной заклинания ничего не стоят и колдовать можно сколько угодно. Если убрать галочку, мана станет обычной: тратится на заклинания и сама набирается обратно (1 в секунду). Впишите, сколько ячеек у вас будет.',
    cells: 'Сколько ячеек маны будет у героя. От 30 до 100 000. Чем больше ячеек, тем больше можно наколдовать подряд.',
    armor: 'Магическая броня — шлем, нагрудник и поножи. Они прочнее обычных, сами чинятся и отталкивают простейшие заклинания. Если оставить галочку, герой начнёт игру уже в доспехах.',
    robe: 'Магическая мантия защищает от холода и смягчает часть сильных заклинаний. Её можно носить вместе с бронёй. Если оставить галочку, герой начнёт игру в мантии.',
    spellsAll: 'Все заклинания игры известны сразу — свитки учить не нужно.',
    spellsMage: 'Известны почти все заклинания, кроме божественных (свитки храма богов, «Flying Maxima» и другие) и «Inspirius». Их можно выучить позже, сжигая свитки.',
    duelFull: 'В столкновении лучей герой выступает на полную силу.',
    duelCustom: 'Сделайте дуэли честнее: выставьте, на сколько процентов сильнее или слабее вас будут считаться ваши заклинания в столкновении лучей. 100 % — полная сила.',
    dark: 'Чёрная магия: с чем герой начинает. 0 — чистый маг, чем выше число, тем темнее кожа и тем хуже к вам относятся волшебники. Уровень можно менять уже в игре.',
    breakward: 'Метка слома защиты снимает требования ячеек маны у заклинаний: хватит той маны, что есть. Но заклинание может вырваться из-под контроля. Если поставить галочку, герой начнёт игру уже с меткой.',
    steady: 'Устойчивость — шанс устоять на ногах, когда вас пытаются сбить заклинанием. 100 — всегда устоите, 1 — собьёт почти каждое.',
};

const html = (p) => `
<div class="hero-settings" data-hero-panel>
  <h4 class="hero-h">🧙 Настройки героя</h4>
  <label class="world-opt" title="${T.mana}"><input type="checkbox" id="${p}-inf" checked> ♾️ Бесконечная мана <span class="mp-hint">— заклинания ничего не стоят</span></label>
  <div class="hero-row" id="${p}-cells-row" hidden title="${T.cells}">
    <label for="${p}-cells">🔷 Ячеек маны:</label>
    <input type="number" id="${p}-cells" min="${HERO.CELLS_MIN}" max="${HERO.CELLS_MAX}" step="10" value="${HERO.CELLS_DEFAULT}">
    <span class="mp-hint">от ${HERO.CELLS_MIN} до ${HERO.CELLS_MAX.toLocaleString('ru-RU')}; мана тратится и набирается по правилам</span>
  </div>
  <label class="world-opt" title="${T.armor}"><input type="checkbox" id="${p}-armor" checked> 🪖 Магическая броня <span class="mp-hint">— шлем, нагрудник, поножи</span></label>
  <label class="world-opt" title="${T.robe}"><input type="checkbox" id="${p}-robe" checked> 🧥 Магическая мантия <span class="mp-hint">— можно вместе с бронёй</span></label>
  <div class="hero-group" role="radiogroup" aria-label="Заклинания">
    <span class="hero-cap">✨ Заклинания</span>
    <label class="hero-seg" title="${T.spellsAll}"><input type="radio" name="${p}-spells" value="all" checked> Все заклинания есть</label>
    <label class="hero-seg" title="${T.spellsMage}"><input type="radio" name="${p}-spells" value="mage"> Только заклинания сильного мага</label>
  </div>
  <div class="hero-group" role="radiogroup" aria-label="Дуэльная сила">
    <span class="hero-cap">⚔️ Дуэльная сила</span>
    <label class="hero-seg" title="${T.duelFull}"><input type="radio" name="${p}-duel" value="full" checked> Полная</label>
    <label class="hero-seg" title="${T.duelCustom}"><input type="radio" name="${p}-duel" value="custom"> Настроить</label>
    <span class="hero-slide" id="${p}-duel-wrap" hidden title="${T.duelCustom}"><input type="range" id="${p}-duel-pct" min="${HERO.DUEL_MIN}" max="${HERO.DUEL_MAX}" value="100"> <b id="${p}-duel-val">100</b>%</span>
  </div>
  <details class="hero-adv">
    <summary>⚙️ Продвинутые</summary>
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
        $('duel-wrap').hidden = radio('duel') !== 'custom';
        $('duel-val').textContent = $('duel-pct').value;
        $('dark-val').textContent = $('dark').value;
        $('steady-val').textContent = $('steady').value;
    };
    root.addEventListener('input', sync);
    root.addEventListener('change', sync);
    const read = () => normalizeHero({
        infiniteMana: $('inf').checked, cells: $('cells').value === '' ? HERO.CELLS_DEFAULT : $('cells').value,
        armor: $('armor').checked, robe: $('robe').checked,
        spells: radio('spells'),
        duel: radio('duel') === 'custom' ? $('duel-pct').value : 100,
        dark: $('dark').value, breakward: $('bw').checked, steady: $('steady').value,
    });
    const set = (h) => {
        const v = normalizeHero(h, DEFAULT_HERO);
        $('inf').checked = v.infiniteMana; $('cells').value = v.cells;
        $('armor').checked = v.armor; $('robe').checked = v.robe;
        root.querySelector(`input[name="${prefix}-spells"][value="${v.spells}"]`).checked = true;
        root.querySelector(`input[name="${prefix}-duel"][value="${v.duel >= 100 ? 'full' : 'custom'}"]`).checked = true;
        $('duel-pct').value = v.duel; $('dark').value = v.dark; $('bw').checked = v.breakward; $('steady').value = v.steady;
        sync();
    };
    sync();
    return { read, set };
}
