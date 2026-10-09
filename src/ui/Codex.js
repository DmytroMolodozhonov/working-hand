/**
 * Codex.js — the menu's «Заклинания» and «Предметы» tabs.
 *
 * Spells are grouped into categories. A spell with a stronger «Максима» form
 * is one card with a «Максима» badge (only Protection Maxima keeps its own
 * card: it is a different spell — a sphere instead of a shield).
 * say: how to cast; dmg: to zombies; pvp: to players in «Свободный мир»;
 * cost: fatigue there; max: the Maxima form.
 */

export const SPELL_CATEGORIES = [
    { id: 'fight', name: '🔥 Боевые' },
    { id: 'duel', name: '⚡ Дуэльные' },
    { id: 'guard', name: '🛡️ Защита' },
    { id: 'water', name: '💧 Вода' },
    { id: 'move', name: '🪄 Полёт и предметы' },
    { id: 'build', name: '🧱 Строительство' },
    { id: 'wand', name: '🪄 С палочкой' },
];

export const SPELLS = [
    // ---- fight
    { cat: 'fight', name: 'Инферно', say: 'рука к лицу + «Инферно»', desc: 'Поток огня из руки. Поджигает деревья.', dmg: '1/тик', pvp: '1 каждые 0,6 с', cost: 10, icon: 'assets/icons/inferno.png' },
    { cat: 'fight', name: 'Тандервейв', say: 'рука к лицу + «Тандервейв» / «Гром»', desc: 'Веер молний, отбрасывает.', dmg: '5', pvp: '3 + отброс', cost: 15, icon: 'assets/icons/thunder.png' },
    { cat: 'fight', name: 'Айс', say: 'рука к лицу + «Айс» / «Лёд»', desc: 'Ледяной луч: держите на цели 5 секунд — замораживает. Игрок заморожен на 20 секунд; любой удар по замороженному смертелен.', dmg: '1/сек', pvp: 'заморозка', cost: 10, icon: 'assets/icons/ice.png' },
    { cat: 'fight', name: 'Даст', say: 'рука к лицу + «Даст» / «Санд»', desc: 'Шар песка: зомби рассыпается в песок.', dmg: 'мгновенно', pvp: '3', cost: 8, icon: 'assets/icons/sand.png' },
    { cat: 'fight', name: 'Бомбардо', say: 'рука к лицу + «Бомбардо»', desc: 'Взрывной шар: вырывает куски гор и земли, ломает деревья, раскидывает зомби и предметы. Рядом с собой — ранит и вас.', max: '«Бомбардо Максима»: в 3 раза мощнее, огромная волна из руки, воронка намного шире (урон до 24, усталость 25).', dmg: 'до 8', pvp: 'до 3 (щит −50%)', cost: 15, icon: 'assets/icons/bombardo.svg' },
    { cat: 'fight', name: 'Earthquake', say: 'обе руки в сторону удара, поднять ногу и топнуть + «Earthquake» (слышится и как «Escape»)', desc: 'Землетрясение бежит по земле: трещина, пыль, камни. Всё на пути падает и получает урон.', max: '«Earthquake Максима»: длиннее (32 м) и шире, урон 12, падение 4 с (усталость 25).', dmg: '4', pvp: '3 + падение 2,5 с', cost: 10, icon: 'assets/icons/earthquake.svg' },
    { cat: 'fight', name: 'Вайнд', say: 'поднять руку в нужную сторону + «Вайнд»', desc: 'Порыв ветра сдувает зомби, игроков и предметы на несколько метров. Не ранит.', max: '«Вайнд Максима»: в 3 раза сильнее и дальше, до 24 м (усталость 20).', dmg: '—', pvp: 'отбрасывает', cost: 8, icon: 'assets/icons/wind.svg' },
    { cat: 'fight', name: 'Lightning Strike', say: 'обе руки вверх + «Lightning Strike»', desc: 'Очень сложное: 5 с небо темнеет, потом молния бьёт вам в руки. Плавно наведите руку на цель и задержите — молния ударит туда. Не успели — ударит в вас.', dmg: '20', pvp: '12', cost: 25, icon: 'assets/icons/thunder.png' },
    { cat: 'fight', name: 'Брейнрот', say: 'посмотреть на зомби + «Брейнрот»', desc: 'Гипнотические кольца — зомби становится вашим слугой на 45 с и нападает на других зомби.', dmg: '—', cost: 15, icon: 'assets/icons/brainrot.svg' },
    // ---- duel
    { cat: 'duel', name: 'Сапира', say: 'направить поднятую руку на цель + «Сапира»', desc: 'Медленный тяжёлый фиолетовый заряд. Его можно отбить щитом или встречным заклинанием.', dmg: '10', pvp: '4', cost: 20, icon: 'assets/icons/sapira.png' },
    { cat: 'duel', name: 'Остолбеней', say: 'направить поднятую руку + «Остолбеней»', desc: 'Красный заряд быстро летит к цели. Попал — цель замирает на 15 секунд.', dmg: 'оглушение 15 с', pvp: 'оглушение 15 с', cost: 12, icon: 'assets/icons/stupefy.svg' },
    { cat: 'duel', name: 'Авада Кедавра', say: 'направить поднятую руку + «Авада Кедавра»', desc: 'Зелёный заряд — мгновенная смерть при попадании.', dmg: 'смерть', pvp: 'смерть', cost: 25, icon: 'assets/icons/avada.svg' },
    { cat: 'duel', name: 'Дуэль', say: 'встречное дуэльное заклинание в ответ', desc: 'Два заряда встречаются и давят друг на друга: точка смещается к более слабому. Держите руку на сопернике! Плавно отвести руку и стряхнуть — выйти без потерь; резко дёрнуть — сдаться. Во время дуэли другие заклинания не работают (кроме щита второй рукой).', dmg: '—', icon: 'assets/icons/duel.svg' },
    // ---- guard
    { cat: 'guard', name: 'Protection', say: 'вытянуть руку + «Protection»', desc: 'У вытянутой руки на 3 секунды голубой щит: заклинания отскакивают, взрыв рядом ранит вполовину.', dmg: '—', cost: 5, icon: 'assets/icons/shield.svg' },
    { cat: 'guard', name: 'Protection Maxima', say: 'руки в стороны буквой «T» + «Protection Maxima»', desc: 'Голубой шар вокруг всего тела на 5 секунд: отражает заклинания со всех сторон, взрывы ранят на 75% слабее.', dmg: '—', cost: 20, icon: 'assets/icons/shield_max.svg' },
    // ---- water
    { cat: 'water', name: 'Waterbollow', say: 'рука у самой воды + «Waterbollow»', desc: 'Вода поднимается живым шаром и следует за рукой. Резкий рывок — шар падает.', max: '«Максима», пока держите шар: шар втягивает больше воды и растёт (можно повторять).', dmg: 'ледяной шар: 3–10', pvp: 'ледяной шар: 3', cost: 5, icon: 'assets/icons/water.svg' },
    { cat: 'water', name: 'Water forming', say: '«Water forming», пока вода жидкая', desc: 'Ведите шар — за ним остаются водяные блоки: стены, башни, дома.', dmg: '—', cost: 5, icon: 'assets/icons/water_forming.svg' },
    { cat: 'water', name: 'Frozen', say: '«Frozen» с водным шаром', desc: 'Замораживает шар и всё сформированное: блоки становятся льдом. Без шара работает как «Айс».', dmg: '—', cost: 5, icon: 'assets/icons/ice.png' },
    { cat: 'water', name: 'Wave Attack', say: 'стоя у воды, показать рукой НА воду + «Wave Attack», потом навести руку на цель', desc: 'Вода поднимается и волной накатывает на того, на кого вы покажете: смывает его на несколько метров. Не ранит.', max: '«Wave Attack Максима»: волна вдвое шире и выше, смывает дальше (усталость 18).', dmg: '—', pvp: 'смывает', cost: 8, icon: 'assets/icons/water.svg' },
    { cat: 'water', name: 'Air Bubble', say: 'в воде: обе руки к голове + «Air Bubble»', desc: 'Воздушный пузырь вокруг головы — под водой можно дышать 30 секунд. Без него воздуха хватает на 20 секунд, потом −1 HP в секунду. Чтобы плавать, двигайте ногами — иначе пойдёте ко дну.', max: '«Air Bubble Максима» (руки буквой T): большой пузырь вокруг всего тела на 90 секунд.', dmg: '—', cost: 4, icon: 'assets/icons/water.svg' },
    // ---- move & things
    { cat: 'move', name: 'Флайн', say: 'обе руки вверх + «Флайн»', desc: 'Полёт как у Супермена: рулите корпусом, приземление — направьте себя в землю. «Паузин» — парить на месте. Тратит усталость. На картах не работает. В «Свободном мире» — только после Свитка полёта из сундука.', dmg: '—', cost: 10, icon: 'assets/icons/flight.svg' },
    { cat: 'move', name: 'Акцио', say: 'поднять руку, указать на предмет + «Акцио»', desc: 'Предмет до 30 м прилетает прямо в руку.', dmg: '—', cost: 5, icon: 'assets/icons/accio.svg' },
    { cat: 'move', name: 'Атак', say: 'пока меч или топор парит («Вингардиум Левиоса») + «Атак»', desc: 'Оружие летит в ближайшее живое существо и вонзается в него (нет никого — летит туда, куда показывает рука). Раненый теряет 1 HP в секунду, течёт кровь. Вынуть оружие можно рукой, «Акцио» или «Левиоса» — кровь идёт вдвое медленнее, пока не скажут «Rescue».', dmg: '4–5 + кровь', pvp: '4–5 + 1 HP/с', icon: 'assets/icons/levitation.svg' },
    { cat: 'guard', name: 'Rescue', say: 'пальцы к своей ране + «Rescue» (или рукой на раненого)', desc: 'Останавливает кровотечение. Если оружие ещё в ране — вынимает и его.', dmg: '—', icon: 'assets/icons/shield.svg' },
    { cat: 'move', name: 'Вингардиум Левиоса', say: 'направить руку на предмет + «Вингардиум Левиоса»', desc: 'Предмет до 10 м поднимается и следует за рукой. Резкое движение — летит дальше. На существо — подбрасывает его в воздух.', dmg: '—', cost: 6, icon: 'assets/icons/levitation.svg' },
    // ---- build
    { cat: 'build', name: 'Gather', say: 'указать на дерево / камень / землю + «Gather»', desc: 'Магия разбирает то, на что указывает рука (до 10 м), и кладёт в ячейку: дерево целиком — 20 древесины своего вида.', dmg: '—', cost: 3, icon: 'assets/icons/gather.svg' },
    { cat: 'build', name: 'Create a Floor', say: 'выбрать ресурс + «Create a Floor», тянуть руку', desc: 'Пол растёт блок за блоком за рукой. С водяным шаром в руке — изо льда.', dmg: '—', cost: 4, icon: 'assets/icons/floor.svg' },
    { cat: 'build', name: 'Create a Wall', say: '«Create a Wall», вести руку вбок и вверх', desc: 'Стена растёт за рукой — в ширину и в высоту.', dmg: '—', cost: 4, icon: 'assets/icons/wall.svg' },
    { cat: 'build', name: 'Create a Ceiling', say: '«Create a Ceiling», тянуть руку', desc: 'Потолок на высоте 3 блоков растёт над вами.', dmg: '—', cost: 4, icon: 'assets/icons/ceiling.svg' },
    { cat: 'build', name: 'Build a Roof', say: '«Build a Roof», тянуть руку', desc: 'Двускатная крыша: ступени от краёв к коньку.', dmg: '—', cost: 6, icon: 'assets/icons/roof.svg' },
    { cat: 'build', name: 'Create a Door', say: 'держа дерево (≥ 12) + «Create a Door»', desc: 'Кубик дерева превращается в дверь с ручкой; отводите руку — она растёт; покажите место и скажите «Stand».', dmg: '—', cost: 6, icon: 'assets/icons/door.svg' },
    { cat: 'build', name: 'Breakthrough', say: 'обе руки чуть ниже горизонта перед собой, потом поднять их вместе (за 3 с) + «Breakthrough»', desc: 'Из земли перед вами поднимается стена из камня и земли (5 блоков в ширину, 3 в высоту) — укрытие от заклинаний и зомби. Тех, кто стоял там, отбрасывает.', max: '«Breakthrough Максима»: стена 9 × 5 (усталость 20).', dmg: '—', cost: 10, icon: 'assets/icons/wall.svg' },
    { cat: 'build', name: 'Stand', say: '«Stand»', desc: 'Закончить стройку: то, что растёт за рукой, встаёт на место.', dmg: '—', icon: 'assets/icons/stand.svg' },
    // ---- wand only
    { cat: 'wand', name: 'Раскрой свои секреты', say: 'палочку в руке навести на предмет + «Раскрой свои секреты»', desc: 'Над предметом появляется голограмма: что это и какие у него свойства (сила, направление, особое заклинание…). Без цели — рассказывает о предмете во второй руке или о самой палочке.', dmg: '—', icon: 'assets/icons/lumos.svg' },
    { cat: 'wand', name: 'Люмос', say: 'палочка в руке + «Люмос»', desc: 'На кончике палочки загорается свет (понемногу тратит силу). Резкий взмах палочкой — свет улетает вперёд и гаснет вдали. «Нокс» — погасить.', max: '«Люмос Максима» — ярче; скажите ещё раз — ещё ярче (до ×5), но и сил тратит больше.', dmg: '—', cost: 2, icon: 'assets/icons/lumos.svg' },
    { cat: 'wand', name: 'Латин Вратин', say: 'палочка в руке + «Латин Вратин»', desc: 'Рисуйте палочкой в воздухе: за кончиком остаются светящиеся линии её цвета. Рисунок держится около 10 секунд и тускнеет.', dmg: '—', icon: 'assets/icons/lumos.svg' },
];

export const ITEMS = [
    { name: 'Меч', desc: 'Берётся рукой как настоящий: сожмите пальцы на рукояти. Режет зомби на части, колющим ударом вонзается. Клинки игроков не проходят друг сквозь друга — звенят и держат удар; пробьёт только намного более сильный замах. Режущий удар оставляет порез, который заживает сам.', dmg: '2 (сильный замах — больше)', pvp: '2–3', icon: 'assets/icons/sword.png' },
    { name: 'Топор', desc: 'Тяжёлый острый топор. Из-за веса сильнее пробивает чужой блок.', dmg: '3 (сильный замах — больше)', pvp: '3–4', icon: 'assets/icons/axe.png' },
    { name: 'Волшебная палочка', desc: 'Только в сундуках в пещерах. 10 видов, у каждой свой цвет и свои тайны: все заклинания +15% сильнее и −15% усталости; направление (дуэль / разрушение / собирательство / строительство) +25%; особое заклинание +40%; своя сила 1–50%. Узнать — «Раскрой свои секреты».', dmg: '—', icon: 'assets/icons/lumos.svg' },
    { name: 'Волшебные меч и топор', desc: 'Слегка светятся. Бьют сильнее на 1–60% и разбивают обычный «Protection», которого коснутся.', dmg: 'больше на 1–60%', icon: 'assets/icons/sword.png' },
    { name: 'Свиток', desc: 'Подожгите его в руке («Инферно»): навсегда +1–5 здоровья или +1–10 силы. Свиток полёта (голубая лента) учит «Флайн» — в «Свободном мире» летать можно только так. Действует на того, кто сжёг.', dmg: '—', icon: 'assets/icons/inferno.png' },
    { name: 'Щиты', desc: 'Деревянный, железный, рыцарский; бывают волшебные. Держите в руке перед собой — заклинания и удары спереди остаются на щите. Обычный щит разбивается сильным заклинанием; у волшебного своя сила 20–50 (восстанавливается), он ломается, только когда почти выдохся. В творческом — на пьедесталах.', dmg: '—', icon: 'assets/icons/shield.svg' },
    { name: 'Лук и стрелы', desc: 'Лук в одной руке. Другой рукой потянитесь за спину через плечо — в руке стрела; поднесите её к луку, отведите руку назад (чем дальше — тем сильнее) и отпустите — резкое движение руки вперёд. С луком 10 стрел (до 25). Волшебный бьёт на 1–60% сильнее.', dmg: '2–9', pvp: '2–9', icon: 'assets/icons/sword.png' },
    { name: 'Молот Тора', desc: 'Только в грозу: поднимите молот над головой — в него ударит молния; за 5 секунд наведите его на цель. Вас не ранит никогда. 7 усталости. Удачно — можно ещё (до 3 раз за грозу); промах — ждите следующей грозы. Гроза: раз в 5 минут с шансом 17%, длится 2–3 минуты.', dmg: '20', pvp: '12', cost: 7, icon: 'assets/icons/thunder.png' },
    { name: 'Рюкзак', desc: 'Возьмите в руку и заведите обе руки за спину — рюкзак надет: +3–5 ячеек.', dmg: '—', icon: 'assets/icons/gather.svg' },
    { name: 'Золотое яблоко', desc: 'Поднесите ко рту и подержите: +10 HP. В ячейке до 10.', dmg: '—', icon: 'assets/icons/gather.svg' },
    { name: 'Как обращаться с вещами', desc: 'Коснитесь вещи пустой рукой — она в руке (и не выпадет, если разжать руку). Удар по правому карману — в ячейку. Резкий взмах и остановка руки — бросок (тяжёлое летит хуже). Поднесите вещь к руке другого игрока — она у него.', dmg: '—', icon: 'assets/icons/accio.svg' },
    { name: '🕷️ Гигантская паучиха (босс)', desc: 'Выходит из темноты раз за ночь (в «Свободном мире» и «Выживании»), на рассвете уходит. 200 HP. Каждые 15 с плюёт ядом (−7), каждые 7 с — паутиной (4 с не двинуться), раз в 30 с может схватить (44%) и кусать (−5 каждые 5 с) — освобождает только «Protection Maxima». Ветер её не сдувает, лёд не морозит, «Авада Кедавра» снимает лишь 20. Побеждённая оставляет сокровища — всегда волшебную палочку.', dmg: '—', icon: 'assets/icons/avada.svg' },
    { name: '🐄 Животные', desc: 'Коровы, свиньи, бараны, кони ходят стадами по 3–8. Ударите — защищаются (65%) или убегают; бараны заступаются друг за друга. Туша: мясо рукой или «Gather» (сырое +2 HP, жареное «Инферно» +4). Коня приручает золотое яблоко (30% за яблоко, до 90%): прыжок рядом (или клавиша J) — вы верхом, шагайте на месте — едете вдвое быстрее.', dmg: '—', icon: 'assets/icons/gather.svg' },
    { name: 'Книга заклинаний', desc: 'Падает с птицы-книги, если сбить её заклинанием. Поднимите обе руки перед собой — книга откроется; проведите рукой вбок — страница перелистнётся. Прочитанное заклинание выучено.', dmg: '—', icon: 'assets/icons/gather.svg' },
];

function card(item) {
    const el = document.createElement('div');
    el.className = 'item-card';
    el.innerHTML = `
        <img src='${item.icon}' class='item-icon' onerror="this.style.display='none'">
        <div class='item-name'>${item.name}${item.max ? ' <span class="max-badge">+ Максима</span>' : ''}</div>
        <div class='item-desc'>${item.desc}</div>
        ${item.say ? `<div class='item-desc'><b>Как:</b> ${item.say}</div>` : ''}
        ${item.max ? `<div class='item-desc item-max'><b>⚡ Максима:</b> ${item.max}</div>` : ''}
        <div class='item-stats'>
            ${item.dmg ? `<div class='stat-row'><span>Урон:</span><span class='stat-val'>${item.dmg}</span></div>` : ''}
            ${item.pvp ? `<div class='stat-row'><span>По игрокам:</span><span class='stat-val'>${item.pvp}</span></div>` : ''}
            ${item.cost ? `<div class='stat-row'><span>Усталость:</span><span class='stat-val'>${item.cost}</span></div>` : ''}
        </div>`;
    return el;
}

let currentCat = 'fight';

export function renderSpellsTab() {
    const cats = document.getElementById('spell-cats');
    const grid = document.getElementById('spells-grid');
    if (!cats || !grid) return;
    cats.innerHTML = '';
    for (const c of SPELL_CATEGORIES) {
        const b = document.createElement('button');
        b.className = 'sub-tab' + (c.id === currentCat ? ' active' : '');
        b.textContent = `${c.name} (${SPELLS.filter((s) => s.cat === c.id).length})`;
        b.onclick = () => { currentCat = c.id; renderSpellsTab(); };
        cats.appendChild(b);
    }
    grid.innerHTML = '';
    for (const s of SPELLS.filter((x) => x.cat === currentCat)) grid.appendChild(card(s));
}

export function renderItemsTab(extra = []) {
    const grid = document.getElementById('items-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const it of [...ITEMS, ...extra]) grid.appendChild(card(it));
}
