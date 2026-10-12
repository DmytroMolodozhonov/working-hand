/**
 * WizardTactics.js — how the wizards of a tower fight one foe together (pure, Node-testable).
 *
 * The wizards after one foe are a circle; its leader (the Master, else the eldest) picks a PLAN
 * the same way the knights' captain does (KnightTactics: choosePlan / reviewPlan / remember —
 * a plan that fails against this foe is not tried again for a while), but the wizards' plans are
 * their own — they fight with duel spells, shields and the Master's dome, never in a crowd:
 *   duel        — each at his range, spells in his own rhythm (the opening);
 *   crossfire   — spread round him, spells from all sides (a hand shield covers only one);
 *   volley      — all cast on one count («раз, два, три!»): one shield can't take them all;
 *   pin         — one binds him («Stupefy», «Ice»), the others strike while he can't move;
 *   ground      — he flies / stands high: stun and freeze him so he falls;
 *   screen      — the students hold shields in front, the Master and teachers cast from behind;
 *   kite        — he comes with a blade: keep away (the Master blinks), strike from range;
 *   height      — up to the tower's galleries and balconies, spells from above;
 *   punish      — his hands are busy with a held spell / no mana: everybody, the strongest spells;
 *   regroup     — losing: back into the tower behind the Master's dome, mana and health back;
 *   guardMaster — he goes for the Master: shields round the Master.
 *
 * `sit`: n, start, lost, lostRecent, hpK, manaK (their mean mana share), dist, air, high, water,
 * lying, busy, noMana, shield, melee (a blade in his hand and near), masterAlive, masterThreat,
 * upper (the tower has places above him to cast from), t.
 */

import { fail, done } from './KnightTactics.js';

const far = (s) => !!(s.air || s.high);

export const WIZ_PLANS = {
    duel: {
        score: (s) => (s.t < 6 ? 1.6 : 1.0) - (far(s) ? 0.5 : 0),
        review: (s, p) => {
            if (p.t > 12 && p.hurt <= 0 && p.casts >= 4) return fail('blocked');
            if (p.lost >= 2 && p.hurt <= 0) return fail('losing');
            return null;
        },
    },
    crossfire: {
        score: (s) => (s.n < 2 ? 0 : 1.1 + (s.shield ? 1.0 : 0)),
        review: (s, p) => (p.t > 14 && p.hurt <= 0 && p.casts >= 4 ? fail('blocked') : p.lost >= 2 && p.hurt <= 0 ? fail('losing') : null),
    },
    volley: {
        score: (s) => (s.n < 3 || s.manaK < 0.3 ? 0 : 0.9 + (s.shield ? 0.7 : 0)),
        review: (s, p) => (p.t > 12 && p.hurt <= 0 && p.casts >= 4 ? fail('blocked') : null),
    },
    pin: {
        score: (s) => (s.n < 2 || far(s) ? 0 : 1.0 + (s.lying ? 1.2 : 0)),
        review: (s, p) => (p.t > 12 && p.binds === 0 ? fail('nobind') : p.t > 14 && p.hurt <= 0 ? fail('blocked') : null),
    },
    ground: {
        score: (s) => (far(s) ? 2.0 + (s.air ? 0.3 : 0) : 0),
        review: (s, p) => (p.t > 15 && p.hurt <= 0 && p.binds === 0 ? fail('miss') : null),
    },
    screen: {
        score: (s) => (s.n < 3 ? 0 : 0.7 + (s.lostRecent > 0 ? 0.9 : 0) + (s.hpK < 0.6 ? 0.4 : 0)),
        review: (s, p) => (p.lost >= 2 ? fail('losing') : p.t > 15 && p.hurt <= 0 ? fail('blocked') : null),
    },
    kite: {
        score: (s) => (s.melee ? 2.3 : 0),
        review: (s, p) => (p.lost >= 1 && p.t > 8 ? fail('caught') : null),
    },
    height: {
        score: (s) => (s.upper && !far(s) && !s.melee ? 0.8 + (s.lostRecent > 0 ? 0.4 : 0) : 0),
        review: (s, p) => (p.t > 18 && p.hurt <= 0 ? fail('cover') : null),
    },
    punish: {
        score: (s) => ((s.busy || s.noMana) && s.manaK > 0.15 ? 3.0 : 0),
        review: (s, p) => (p.t > 6 || (p.t > 2.5 && !s.busy && !s.noMana) ? done('over') : null),
    },
    regroup: {
        keep: true,
        score: (s) => (s.start >= 2 && (s.n <= s.start * 0.5 || s.hpK < 0.35 || s.manaK < 0.15) && !s.noFallback ? 2.5 : 0),
        review: (s, p) => (p.t > 12 ? done('regrouped') : null),
    },
    guardMaster: {
        score: (s) => (s.masterAlive && s.masterThreat && s.n >= 3 ? 2.1 : 0),
        review: (s, p) => (p.t > 6 && !s.masterThreat ? done('safe') : null),
    },
};

/**
 * Roles for a plan. men: [{id, idx, role ('student'|'teacher'|'master'|…), d, dm (m to the Master)}].
 * → Map id → 'caster' | 'binder' | 'shield' | 'snipe' | 'retreat' | 'guard'. opts.leader gets the leader's id
 * (the Master if he fights, else the eldest — the lowest number).
 */
export function wizardRoles(plan, men, opts = {}) {
    const out = new Map();
    if (!men.length) return out;
    const lead = men.find((m) => m.role === 'master') || [...men].sort((a, b) => a.idx - b.idx)[0];
    if (opts.leader) opts.leader.id = lead.id;
    const rank = (m) => (m.role === 'master' ? 0 : m.role === 'student' ? 2 : 1);
    for (const m of men) out.set(m.id, 'caster');
    switch (plan) {
        case 'pin': {
            // the best binder: a teacher (Ice), else anybody but the Master
            const b = [...men].sort((a, c) => (a.role === 'teacher' ? 0 : a.role === 'master' ? 2 : 1) - (c.role === 'teacher' ? 0 : c.role === 'master' ? 2 : 1) || a.d - c.d)[0];
            out.set(b.id, 'binder');
            break;
        }
        case 'screen': {
            // the young ones (students first) shield; the strongest cast
            const order = [...men].sort((a, b) => rank(b) - rank(a) || a.d - b.d);
            order.slice(0, Math.max(1, Math.floor(men.length / 2))).forEach((m) => { if (m.role !== 'master') out.set(m.id, 'shield'); });
            break;
        }
        case 'height': for (const m of men) if (m.role !== 'master') out.set(m.id, 'snipe'); break;
        case 'regroup': for (const m of men) out.set(m.id, 'retreat'); break;
        case 'guardMaster': for (const m of [...men].sort((a, b) => a.dm - b.dm).slice(0, Math.ceil(men.length / 2))) if (m.role !== 'master') out.set(m.id, 'guard'); break;
        default: break;
    }
    return out;
}

/** Which spell a wizard casts under a plan (rng 0..1). */
export function planSpell(plan, role, wizRole, rng = Math.random) {
    const ice = wizRole !== 'student';
    if (role === 'binder' || plan === 'ground') return ice && rng() < 0.4 ? 'IceDuel' : 'Stupefy';
    if (plan === 'pin') return 'SapiraDuel';
    if (plan === 'punish' || plan === 'volley') return wizRole === 'student' ? 'Stupefy' : 'SapiraDuel';
    return null; // (their own choice: WizardAI.pickSpell)
}

/** How fast they cast under a plan (× their usual pause). */
export const CAST_PACE = { punish: 0.5, volley: 1, kite: 0.8, screen: 1.1, regroup: 3 };

/** What they shout. */
export const WIZ_LINES = {
    plan: {
        duel: ['К бою! Палочки наизготовку!', 'Дуэль так дуэль!', 'Защищайте академию!'],
        crossfire: ['Расходитесь! Бейте с разных сторон!', 'Он прикрывается щитом — заходите сбоку!', 'Перекрёстный огонь!'],
        volley: ['Все разом, по моему знаку!', 'Залп! Один щит всех не удержит!', 'Ждём… все вместе!'],
        pin: ['Остолбеней на него — остальные бейте!', 'Сковать его! Потом добьём!', 'Держите его льдом!'],
        ground: ['Он в воздухе! Сбить его!', 'Спустить его на землю!', 'Лёд на него — пусть падает!'],
        screen: ['Ученики — щиты! Наставники — бейте из-за них!', 'Щиты вперёд! Прикрыть Мастера!'],
        kite: ['Не подпускать! Держать дистанцию!', 'Назад! Он с клинком!', 'Отходим и бьём издалека!'],
        height: ['На галереи! Бьём сверху!', 'Наверх! Оттуда виднее!'],
        punish: ['Он занят заклинанием — бейте!', 'Он без маны — сейчас!', 'Пока он колдует — все разом!'],
        regroup: ['Отходим в башню! Восстановить силы!', 'За купол Мастера! Перегруппироваться!'],
        guardMaster: ['Защищайте Мастера!', 'К Мастеру! Щиты!'],
    },
    fail: {
        blocked: ['Он всё отбивает!', 'Щит держит!'],
        losing: ['Он сильнее, чем кажется!', 'Так он нас всех одолеет!'],
        nobind: ['Не сковать его!', 'Остолбеней не берёт!'],
        miss: ['Не попасть!', 'Слишком высоко!'],
        caught: ['Не уйти от него!'],
        cover: ['Не видно его оттуда!'],
    },
    seen: {
        air: ['Он летит!'], high: ['Он наверху!'], shield: ['У него щит!'], melee: ['Он с клинком — не подпускайте!'],
        noMana: ['Он выдохся!'], busy: ['Он колдует!'],
    },
    count: ['Раз… два… три!'],
    shield: ['Щит!', 'Протего!'],
    blink: ['Не достанешь!'],
};
