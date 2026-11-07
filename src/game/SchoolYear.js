/**
 * SchoolYear.js — the year of «Акселдорф» (docs/rules/school.md, part 2): days, the record, what is kept between games. Pure (no THREE).
 *   - A day has ONE lesson: the lessons of the table (SchoolLessons.js) in the order of the months and the subjects; a new row in the
 *     table becomes a day by itself. After the lesson — free time; lying down in the dormitory's bed — the next day.
 *   - The record: the day, the lessons seen and attended, the spells the lessons gave, the mana grown at the school. Kept in the
 *     browser (localStorage `zns-school:<world id>`) after every day and every lesson; the world «Школа Акселдорф» in the menu's list goes on from it.
 */
import { LESSONS, SUBJECTS } from './SchoolLessons.js';

export const SCHOOL_SAVE_KEY = 'zns-school';
export const YEAR = {
    START_CELLS: 5,      // (the author: a new pupil has 5 mana cells, not 30)
    LESSON_CELLS: 3,     // (a lesson's task done: the mana grows — so the hard spells of the year's end can be cast: «Электром» 50)
    SLEEP_S: 3,          // (s lying still in the bed: the night passes)
};

/** The lessons of the year, a day each: by month, then by the subjects' order. */
export function yearDays() {
    const order = Object.keys(SUBJECTS);
    return [...LESSONS].sort((a, b) => a.month - b.month || order.indexOf(a.subject) - order.indexOf(b.subject));
}
/** The lesson of day `d` (1…) or null (the year is over). */
export const lessonOfDay = (d) => yearDays()[d - 1] || null;
export const yearLength = () => yearDays().length;

export function newRecord() { return { v: 1, day: 1, arrived: false, seen: [], attended: [], spells: [], cells: 0, done: false }; }

/** The record kept (or null): `store` — localStorage or a stand-in. A broken / foreign one is forgotten. */
export function loadRecord(store, key = SCHOOL_SAVE_KEY) {
    try {
        const r = JSON.parse(store?.getItem?.(key) || 'null');
        if (!r || r.v !== 1 || !(r.day >= 1)) return null;
        return { ...newRecord(), ...r, seen: [...(r.seen || [])], attended: [...(r.attended || [])], spells: [...(r.spells || [])] };
    } catch { return null; }
}
export function saveRecord(store, r, key = SCHOOL_SAVE_KEY) { try { store?.setItem?.(key, JSON.stringify(r)); } catch { /* (private window: nothing kept) */ } }
export function forgetRecord(store, key = SCHOOL_SAVE_KEY) { try { store?.removeItem?.(key); } catch { /* */ } }

/** The schedule scroll's day (School sets it every morning): what the scroll shows when read (ItemTypes.describeItem → scheduleLines). */
export const SCHEDULE = { day: 1 };
/**
 * The lines of the schedule scroll (the author: «свиток расписания — настоящий предмет»): today, the next days, where things are.
 * `label(spell)` — the spell's name for people.
 */
export function scheduleLines(day = SCHEDULE.day, label = (s) => s) {
    const days = yearDays(), out = [];
    const what = (L) => `${SUBJECTS[L.subject]?.name || ''}${(L.spells || (L.spell ? [L.spell] : [])).length ? ' — «' + (L.spells || [L.spell]).map(label).join('», «') + '»' : ''}`;
    const L = days[day - 1];
    out.push(L ? `<b>Сегодня, день ${day} (месяц ${L.month}):</b> ${what(L)}` : '<b>Учебный год окончен</b>');
    for (let d = day + 1; d <= Math.min(days.length, day + 3); d++) out.push(`День ${d} (месяц ${days[d - 1].month}): ${what(days[d - 1])}`);
    out.push('В первый день месяца — сбор в большом зале. Позовут — идите на светящийся круг.');
    out.push('Спальня — южное крыло, справа от ворот: легли на кровать — наступит следующий день.');
    return out;
}
