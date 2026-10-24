/**
 * DuelReport.js — the duel journal's lines (pure: tests): who fights the hero at the arena, with what numbers, what each cast, how every
 * beam clash went and why one of them won. The author: «Нужны дуэльные логи: кто со мной сражается, какие заклинания, какая у него сила,
 * какая у палочки — чтобы всё сравнить: почему кто победил».
 */
const n1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '?');
const n2 = (x) => (Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : '?');
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const wandText = (w) => (w ? `палочка: +${w.power || 0}%${w.fav ? `, любимое «${w.fav}»` : ''}${w.dir ? `, вид ${w.dir}` : ''}` : 'без палочки');
const spells = (t) => Object.entries(t || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || 'ничего';
const RANK = { novice: 'начинающий', adept: 'продвинутый', teacher: 'преподаватель', master: 'мастер башни', elder: 'сильный волшебник', student: 'ученик' };
const WHY = { wand: 'у проигравшего забрали палочку', dead: 'герой погиб', kill: 'соперник убит', time: 'вышло время (ничья)', off: 'герой сошёл с арены', accident: 'несчастный случай', gone: 'соперник ушёл', noshow: 'герой не встал на место', foul: 'нарушение' };

export const duelReport = {
    start({ foe, hero }) {
        const f = foe, h = hero;
        return `⚔️ Дуэль: против вас — ${f.name || 'волшебник'} (${RANK[f.rank] || f.rank}): мана ${n1(f.mana)}/${n1(f.maxMana)}, здоровье ${n1(f.hp)}/${n1(f.maxHp)}, меткость ${n2(f.skill)}, `
            + `дуэльная сила ${n2(f.power)}, ${wandText(f.wand)} (×${n2(f.wandK)} к силе луча). `
            + `Вы: мана ${n1(h.mana)}/${n1(h.maxMana)}, здоровье ${n1(h.hp)}/${n1(h.maxHp)}, дуэльная сила ${n2(h.power)}${h.setPower != null ? ` (вы задали ${n2(h.setPower)}: в Творческом сила не зависит от вашей маны)` : h.finite ? ' (мана конечная: сила считается по вашей мане сейчас, мастерству и здоровью, как в Выживании)' : h.creative ? ' (бесконечная мана: по мане вы равны сопернику)' : ''}, ${wandText(h.wand)} (×${n2(h.wandK)}).`;
    },
    clash(r) {
        return `⚡ Столкновение лучей (${n1(r.secs)} с): ваш «${r.mySpell}» против его «${r.foeSpell}». Средний напор: ваш ${n2(r.myPush)}, его ${n2(r.foePush)}. `
            + `Ваша рука была на нём ${pct(r.myContact)} времени, его — ${pct(r.foeContact)}. Выкриков «Максима»: ваших ${r.myShouts ?? 0}, его ${r.foeShouts ?? 0} (каждый толкает 3 с, потом сгорает). Шкала в конце: ${pct(r.share)} в вашу пользу. ${r.lost === 'me' ? 'Уступили вы.' : r.lost === 'foe' ? 'Уступил соперник.' : 'Луч просто убрали.'}`;
    },
    end({ who, why, secs, casts, clashes, foe, hero }) {
        const res = who === 'p' ? 'победили вы' : who === 'a' ? 'победил соперник' : 'никто не победил';
        let cause = '';
        if (who === 'a' && clashes.length) {
            const low = clashes.filter((c) => c.lost === 'me');
            const weak = low.filter((c) => c.myPush < c.foePush).length, off = low.filter((c) => c.myContact < 0.7).length;
            if (low.length) cause = ` Проигранных столкновений: ${low.length} (из них ваш напор слабее — ${weak}, рука сходила с него — ${off}).`;
        }
        return `🏁 Итог дуэли: ${res} (${WHY[why] || why}), длилась ${Math.round(secs)} с. Вы кидали: ${spells(casts.me)}. Соперник кидал: ${spells(casts.foe)}. `
            + `Сила: ваша ${n2(hero.power)} против ${n2(foe.power)}; палочки: ваша ×${n2(hero.wandK)}, его ×${n2(foe.wandK)}.${cause}`;
    },
};
