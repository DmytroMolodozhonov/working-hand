/**
 * SchoolLessons.js — the lessons of «Акселдорф» as ONE table (the author 07.11: «прорабатываем один тип урока, дальше он повторяется»;
 * docs/rules/school.md). A lesson is a row, not code of its own; SchoolLesson.js runs any row the same way:
 *   call → (the hero comes into the room: ATTENDED — counted) → intro (the teacher speaks) → demo (the teacher shows it) →
 *   teach (the spell is given) → task (the hero tries, `times` successes) → outro.
 * Kinds of the demo / the task (more come with the next lessons — a new kind is one case in SchoolLesson.js, never a new engine):
 *   demo 'shield'  — the teacher raises his shield;           task 'block' — the teacher sends weak charges, the hero holds them on the shield;
 *   demo 'cast'    — the teacher casts `spell` at the dummy;  task 'cast'  — the hero casts `spell` (at the dummy) `times` times;
 *   demo 'talk'    — words only (history);                    task 'listen' — nothing to do: listened → done.
 * Pure: no THREE, no game.
 */

export const SUBJECTS = {
    defence: { name: 'Защита от тёмных искусств', room: 'defence', teacher: 21 },
    potions: { name: 'Зельеварение', room: 'potions', teacher: 22 },
    pentagrams: { name: 'Пентаграммы', room: 'pentagrams', teacher: 23 },
    history: { name: 'Основы мира', room: 'history', teacher: 24 },
};

/** The rows. `month` 1…12; `spell` — what the lesson gives (the hero knows it after the «teach» step). */
export const LESSONS = [
    {
        id: 'def1', subject: 'defence', month: 1, spell: 'Protection',
        intro: [
            'Садитесь. Я — профессор Корвин Страйд, и я научу вас защищаться.',
            'Есть магия, которая убивает, и магия, которая защищает. Мы начнём со второй — она важнее.',
            'Первое, что должен уметь волшебник, — щит. «Protection». Он закрывает от заклинаний и ударов.',
        ],
        demo: { kind: 'shield', say: 'Смотрите: скрещиваю руки на груди — и щит уже стоит. Можно и словом: «Protection!»' },
        teach: 'Теперь попробуйте вы. Скрестите руки на груди — или скажите «Protection».',
        task: {
            kind: 'block', spell: 'SandsDuel', word: 'Даст!', times: 3, // (a sandy charge: it only slows for a moment — a «Джолт» threw the pupil out of the room)
            say: 'Я пошлю в вас слабый заряд песка. Закройтесь щитом, прежде чем он долетит.',
            hint: 'Скрестите предплечья перед грудью, крест-накрест, или скажите «Protection» — до того, как заряд долетит.',
            good: ['Хорошо!', 'Отлично, ещё раз.', 'Превосходно.'],
            miss: ['Не успели. Ещё раз — щит раньше!', 'Поздно! Поднимайте щит, как только я взмахну палочкой.'],
        },
        outro: 'Прекрасно. Щит — ваш первый друг. Тренируйтесь. Урок окончен!',
    },
    // ---- the rest of the year's defence: the same three steps on the training dummy (a cast at it, `times` times)
    dummyLesson('def2', 2, ['Jolt'], 'Jolt', 'Джолт',
        ['Сегодня — «Джолт». Он ничего не ломает, но отбрасывает противника далеко назад.', 'Когда враг слишком близко — это ваш лучший друг.'],
        'Направьте палочку на манекен и скажите «Джолт».', 'Хорошо. Отбросить — не значит ранить. Помните это. Урок окончен!'),
    dummyLesson('def3', 3, ['Sands'], 'SandsDuel', 'Даст',
        ['«Даст» — песок в глаза и в суставы. Противник надолго становится медленным.', 'От медленного врага легко уйти — или успеть защититься.'],
        'Направьте палочку на манекен и скажите «Даст».', 'Отлично. Медленный враг — уже не страшный враг. Урок окончен!'),
    dummyLesson('def4', 4, ['Expelliarmus'], 'Expelliarmus', 'Экспеллиармус',
        ['Самое благородное заклинание защиты — «Экспеллиармус». Оно выбивает палочку из руки.', 'Волшебник без палочки почти беззащитен. Никого не нужно ранить, чтобы победить.'],
        'Направьте палочку на манекен и скажите «Экспеллиармус». Он поднимет свою палочку сам.', 'Прекрасно. Запомните: побеждает не тот, кто сильнее бьёт. Урок окончен!'),
    dummyLesson('def5', 5, ['Ice', 'Frozen'], 'IceDuel', 'Фрозен',
        ['Теперь, когда на вас мантии, которые отбивают «Фрозен», можно учить и его.', '«Фрозен» замораживает: противник целиком во льду и не может пошевелиться.'],
        'Направьте палочку на манекен и скажите «Фрозен» (или «Айс»).', 'Хорошо. Лёд держит недолго — используйте это время с умом. Урок окончен!'),
    dummyLesson('def6', 6, ['Stupefy'], 'Stupefy', 'Остолбеней',
        ['«Остолбеней» — красный заряд. Попавший падает и надолго замирает.', 'Это время, чтобы уйти или позвать на помощь.'],
        'Направьте палочку на манекен и скажите «Остолбеней».', 'Отлично. Урок окончен!'),
    dummyLesson('def7', 7, ['Groundprud'], null, null,
        ['Иногда лучшая защита — стена. «Граундпруд» за секунду поднимает её из земли.', 'Укрылись — и заклинание врага разбилось о камень.'],
        'Направьте палочку в пол перед собой и скажите «Граундпруд».', 'Хорошо. Стена спасла не одного волшебника. Урок окончен!', 2),
    dummyLesson('def8', 8, ['Sapira'], 'SapiraDuel', 'Сапира',
        ['«Сапира» — медленный тяжёлый сгусток, он сбивает с ног.', 'Он медленный — значит, от него можно закрыться щитом. И вы это уже умеете.'],
        'Направьте палочку на манекен и скажите «Сапира».', 'Хорошо. Урок окончен!'),
    dummyLesson('def9', 9, ['ProtectionMaxima'], null, null,
        ['Обычный щит закрывает спереди. «Протекшн Максима» — со всех сторон и даже от взрыва.', 'Он стоит дорого. Поднимайте его, только когда это действительно нужно.'],
        'Скажите «Протекшн Максима» — вокруг вас встанет купол.', 'Превосходно. Теперь вас не возьмёт и взрыв. Урок окончен!', 1),
    dummyLesson('def11', 11, ['Nihilis'], null, null,
        ['Есть чёрная магия, и есть свет, который её рассеивает: «Нихилис Атра».', 'Тёмный туман, проклятые твари — всё это боится его.'],
        'Направьте палочку на манекен и скажите «Нихилис Атра».', 'Хорошо. Свет сильнее тьмы — если не бояться. Урок окончен!', 2),
    dummyLesson('def12', 12, ['Electrum', 'Caligo'], null, null,
        ['Последний урок года. «Электром» — настоящая молния, которая тянется за рукой, пока вы держите.', 'И ещё одно: «Калиго», тёмный туман. Это чёрная магия — я покажу её, чтобы вы знали врага в лицо. Не злоупотребляйте.'],
        'Направьте палочку на манекен и скажите «Электром». Потом — «Калиго».', 'Вот и всё. Вы готовы защищать себя и других. Год окончен — я горжусь вами!', 2, ['Electrum', 'Caligo']),
];

/** A defence lesson on the training dummy: the teacher casts `duelSpell` at it (or only tells, when null), the pupil casts `spells` `times` times. */
function dummyLesson(id, month, spells, duelSpell, word, intro, hint, outro, times = 3, castOf = null) {
    return {
        id, subject: 'defence', month, spells,
        intro,
        demo: duelSpell ? { kind: 'cast', spell: duelSpell, say: `Смотрите на манекен. «${word}!»` } : { kind: 'talk', say: 'Смотрите и слушайте внимательно.' },
        teach: 'Теперь вы. ' + hint,
        task: { kind: 'cast', spells: castOf || spells, times, hint, good: ['Хорошо!', 'Ещё раз!', 'Отлично!'] },
        outro,
    };
}

export const lessonById = (id) => LESSONS.find((l) => l.id === id) || null;
/** The lessons of a month, in the order of the days (defence, potions, pentagrams, history — the order of SUBJECTS). */
export function lessonsOfMonth(m) {
    const order = Object.keys(SUBJECTS);
    return LESSONS.filter((l) => l.month === m).sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject));
}
/** Every row is whole (a test): a known subject, a month 1…12, the steps the engine knows. */
export const DEMO_KINDS = new Set(['shield', 'cast', 'talk']);
export const TASK_KINDS = new Set(['block', 'cast', 'listen']);
export function lessonOk(l) {
    return !!(l && SUBJECTS[l.subject] && l.month >= 1 && l.month <= 12 && l.intro?.length && DEMO_KINDS.has(l.demo?.kind) && TASK_KINDS.has(l.task?.kind)
        && (l.task.kind === 'listen' || l.task.times >= 1) && l.outro);
}
