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
            kind: 'block', spell: 'Jolt', times: 3,
            say: 'Я пошлю в вас слабый заряд. Закройтесь щитом, прежде чем он долетит.',
            hint: 'Скрестите предплечья перед грудью, крест-накрест, или скажите «Protection» — до того, как заряд долетит.',
            good: ['Хорошо!', 'Отлично, ещё раз.', 'Превосходно.'],
            miss: ['Не успели. Ещё раз — щит раньше!', 'Поздно! Поднимайте щит, как только я взмахну палочкой.'],
        },
        outro: 'Прекрасно. Щит — ваш первый друг. Тренируйтесь. Урок окончен!',
    },
];

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
