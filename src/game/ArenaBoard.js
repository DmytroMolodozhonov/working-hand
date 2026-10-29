/**
 * ArenaBoard.js — the magic board of the duel arena (pure: ArenaDuels.js fills it, src/fx/ArenaBoardFx.js draws it, the tests read it).
 *
 * The author: «магическое табло — голографическая панель в колизее: сейчас идёт бой такой-то, продлится столько-то, очередь следующих;
 * когда твоя очередь — подсвечивается место, куда встать, идёт отсчёт, потом бой, потом результат (победа / проигрыш и выплата)».
 *
 * `st` — what the host knows (it goes to every computer in the arena's 'st' message, a few numbers and names):
 *   ph   the phase of the duel now: 'idle' | 'enter' | 'bow' | 'marks' | 'call' | 'count' | 'fight' | 'over'
 *   pn   the name of the player fighting (null — two wizards of the arena)
 *   fn   the name of the wizard against him (or the first of the two)
 *   fn2  the second wizard's name (a bots' duel)
 *   tr   the tier of the player's duel ('novice' | 'adept' | 'teacher')
 *   go   seconds the fight has gone (at `at`, the moment of the message; the board counts on)
 *   maxT how long a duel may go (s)
 *   q    the queue: [{n: name, tr}] in order (the next first)
 *   res  how the last duel ended ('win' | 'lose' | 'draw' | 'other'), co — the coins paid out for it (win: the stake and as much again)
 *   night  no duels now
 */
import { TIERS } from './ArenaSteward.js';

export const BOARD = {
    QUEUE_SHOWN: 4, // lines of the queue on the board (the rest — «и ещё N»)
    W: 6.4, H: 4.0, // m: the panel's size over the road (a market stall's counter is 5 m long)
    UP: 6.5, // m above the ground
    SEE_R: 70, // m: it is drawn when the hero is this near
};

export const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const tierName = (tr) => TIERS[tr]?.ru || '';

/**
 * What the board says now → { title, head: [{text, color}], queue: [text], foot }.
 * `elapsed` — seconds since the message with `st.go` (the board counts the fight's minutes on its own).
 */
export function boardView(st, elapsed = 0) {
    const s = st || {};
    const out = { title: 'АРЕНА ДУЭЛЕЙ', head: [], queue: [], foot: '' };
    const q = Array.isArray(s.q) ? s.q : [];
    const who = s.pn ? `${s.pn} против ${s.fn || 'волшебника'}${s.tr ? ` (${tierName(s.tr)})` : ''}` : s.fn ? `${s.fn} и ${s.fn2 || 'волшебник'}` : 'волшебники';
    const left = Math.max(0, (s.maxT || 300) - ((s.go || 0) + elapsed));
    switch (s.ph) {
        case 'enter': case 'bow': case 'marks':
            out.head.push({ text: s.pn ? `Выходит ${s.fn || 'волшебник'} — ждёт ${s.pn}` : `Выходят на арену: ${who}`, color: 'gold' });
            break;
        case 'call':
            out.head.push({ text: `${s.pn || 'Игрок'}, ваш черёд!`, color: 'gold' }, { text: 'Встаньте на светящееся место на арене', color: 'white' });
            break;
        case 'count':
            out.head.push({ text: `Бой: ${who}`, color: 'gold' }, { text: 'Отсчёт… приготовьтесь!', color: 'white' });
            break;
        case 'fight':
            out.head.push({ text: `Идёт бой: ${who}`, color: 'gold' }, { text: `Продлится не дольше ${fmtTime(left)}`, color: 'white' });
            break;
        case 'over': {
            const r = s.res;
            if (r === 'win') out.head.push({ text: `Победил ${s.pn || 'игрок'}!`, color: 'green' }, { text: `Выплата: ${s.co || 0} монет`, color: 'gold' });
            else if (r === 'lose') out.head.push({ text: `Победил волшебник ${s.fn || ''}`.trim(), color: 'red' }, { text: 'Ставка проиграна', color: 'white' });
            else if (r === 'draw') out.head.push({ text: 'Время вышло — ничья', color: 'white' }, { text: s.co ? `Ставка возвращена: ${s.co} монет` : '', color: 'gold' });
            else out.head.push({ text: 'Бой окончен', color: 'white' });
            break;
        }
        default:
            out.head.push(s.night ? { text: 'Ночью дуэлей нет', color: 'white' } : { text: 'Арена свободна', color: 'green' });
            if (!s.night && q.length) out.head.push({ text: `Скоро позовут: ${q[0].n}`, color: 'white' });
    }
    q.slice(0, BOARD.QUEUE_SHOWN).forEach((e, i) => out.queue.push(`${i + 1}. ${e.n} — ${tierName(e.tr)}`));
    if (q.length > BOARD.QUEUE_SHOWN) out.queue.push(`и ещё ${q.length - BOARD.QUEUE_SHOWN}`);
    out.foot = q.length ? 'Хотите в очередь? Выберите фигурку на прилавке' : 'Хотите сразиться? Выберите фигурку на прилавке';
    return out;
}

/** A key that changes whenever the picture must be drawn again (the board is drawn on a texture only then; the minutes — once a second). */
export function boardKey(st, elapsed = 0) {
    const v = boardView(st, elapsed);
    return v.title + '|' + v.head.map((h) => h.text + h.color).join('|') + '|' + v.queue.join('|') + '|' + v.foot;
}
