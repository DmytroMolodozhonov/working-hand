/**
 * ActionLog.js — a full journal of what the people the hero deals with do and why (the author: «в журнал записать все действия, позы, куда
 * смотрит, что делает рыцарь, как думает… максимально весь лог взаимодействия, чтобы я потом мог кидать тебе»).
 * Lines go to the game's journal (settings → «Журнал», tag «Жители») with the prefix «действие:» / «решение:»:
 *   – a person is «in dealings» while he has a command / an order / a companion / a glance / a talk, and for 25 s after;
 *   – a line when his state changes (what he does, his mode, feeling, gesture, where he looks) and a heartbeat every 4 s;
 *   – each line says: what (cmd kind / stage / aim and the metres left), the body (mode, speed, where the body faces and where the head looks —
 *     in degrees from the hero and from the aim), the feeling and gesture, the bars to the hero, and what stops him (sleep, door, stuck).
 * `decision(v, text)` is for the «why» of the rules (CommandTalk, VillagerCommands, JusticeLife…). Cheap: ≤ 2 checks a second, ≤ 10 lines a second.
 */

const DEG = 180 / Math.PI;
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const r1 = (x) => Math.round(x * 10) / 10;

export class ActionLog {
    constructor(life, sink) {
        this.life = life;
        this.sink = sink || (() => {});
        this.t = 0;
        this.mem = new Map(); // id → { sig, at, until }
        this.walk = new Map(); // id → { x, z, t, said } — to see who walks on the spot
        this.stuckBudget = 0;
        this.budget = 10;
        this.on = true;
        this.now = () => performance.now(); // (a test may give its own clock)
    }

    /** The «why»: a decision of the rules, written down at once (and the person is in dealings for a while). */
    decision(v, text) {
        if (!this.on || !v) return;
        this._touch(v);
        this._emit(`решение: ${this._who(v)} — ${text}`);
    }

    /** Something to write that is not a person's (the pointing hand, a refusal…). */
    note(text) { if (this.on) this._emit(`решение: ${text}`); }

    /**
     * Who is «walking on the spot» (the author's journal: knights with the mode «run» at the same coordinates for minutes): a person who means to
     * go (mode walk/run, speed > 0.5) and has not moved 0.6 m in 4 s, within 80 m of the hero. The line says where he stands, where he goes, what is
     * round him (the walls on 8 sides, the bodies within 3 m) — so the cause can be read from it.
     */
    _stuck(life, me, now) {
        this.stuckBudget = Math.min(3, this.stuckBudget + 0.5);
        for (const v of life.byId.values()) {
            if (v.dead || v.sleep || v.seated || v.climb) { this.walk.delete(v.id); continue; }
            if (me && Math.hypot(v.x - me.x, v.z - me.z) > 80) continue;
            const going = (v.mode === 'walk' || v.mode === 'run') && (v.speed > 0.5 || v.cmd || v.order || v.follow);
            let w = this.walk.get(v.id);
            if (!going) { if (w) this.walk.delete(v.id); continue; }
            if (!w) { this.walk.set(v.id, { x: v.x, z: v.z, t: now, said: -1e9 }); continue; }
            if (Math.hypot(v.x - w.x, v.z - w.z) > 0.6) { w.x = v.x; w.z = v.z; w.t = now; continue; }
            if (now - w.t < 4000 || now - w.said < 15000 || this.stuckBudget < 1) continue;
            w.said = now; this.stuckBudget -= 1;
            let goal = '';
            const c = v.cmd, o = v.order;
            if (c && c.tx != null) goal = `цель приказа (${r1(c.tx)}, ${r1(c.tz)}) в ${r1(Math.hypot(c.tx - v.x, c.tz - v.z))} м`;
            else if (o?.dest) goal = `цель приказа «${o.kind}» (${r1(o.dest.x)}, ${r1(o.dest.z)}) в ${r1(Math.hypot(o.dest.x - v.x, o.dest.z - v.z))} м${o.direct ? ' напрямик' : ' по тропам'}`;
            else if (v.follow) goal = 'идёт за игроком';
            else goal = 'цель своя (дела дня)';
            const walls = [];
            const names = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4, x = v.x + Math.sin(a) * 0.9, z = v.z - Math.cos(a) * 0.9;
                try { if (!life._walkable(x, z, v.y)) walls.push(names[k]); } catch (_) { /* ignore */ }
            }
            const near = [];
            for (const q of life.byId.values()) {
                if (q === v || q.dead) continue;
                const d = Math.hypot(q.x - v.x, q.z - v.z);
                if (d < 3 && Math.abs(q.y - v.y) < 2.5) near.push(`${q.name || q.id} ${r1(d)} м${q.sleep ? ' (спит)' : q.talking > 0 ? ' (говорит)' : q.speed > 0.3 ? ' (идёт)' : ' (стоит)'}`);
            }
            const path = v.path ? `тропа из ${v.path.length ?? '?'} точек` : 'без тропы';
            this._emit(`застрял: ${this._who(v)} в (${r1(v.x)}, ${r1(v.z)}) режим=${v.mode} скорость=${r1(v.speed || 0)} уже ${Math.round((now - w.t) / 1000)} с на месте | ${goal} | ${path}${v.wallW ? `, стена: ${v.wallW.noWay > 0 ? 'пути нет' : v.wallW.way ? 'обход по блокам' : 'ищет'}` : ''} | непроходимо в 0,9 м: ${walls.join(' ') || 'нигде'} | рядом: ${near.join('; ') || 'никого'}`);
        }
    }

    _touch(v) { v.alogUntil = performance.now() + 25000; }
    _who(v) { return `${v.title || ''} ${v.name || '?'} (${v.role}${v.wizard ? '/маг' : ''} #${v.id})`.replace(/\s+/g, ' '); }
    _emit(line) {
        if (this.budget < 1) return;
        this.budget -= 1;
        try { this.sink(line); } catch (_) { /* ignore */ }
    }

    /** Degrees from the body's facing to a point (+ left, − right), or null. */
    _off(v, x, z) { return Math.round(norm(Math.atan2(-(x - v.x), -(z - v.z)) - v.yaw) * DEG); }

    update(dt) {
        if (!this.on) return;
        this.budget = Math.min(10, this.budget + dt * 10);
        this.t -= dt;
        if (this.t > 0) return;
        this.t = 0.5;
        const life = this.life, now = this.now();
        const me = life._playerPos?.(life.game.localId);
        this._stuck(life, me, now);
        for (const v of life.byId.values()) {
            if (v.dead || v.sleep && !v.cmd && !(v.alogUntil > now)) continue;
            const c = v.cmd;
            // (a standing «leave»/«door» order of long ago is not «dealings» — only what the hero is doing now)
            const busy = c || (v.order && v.order.kind !== 'leave' && v.order.kind !== 'door') || v.follow || v.companion || v.glance || v.talking > 0 || v.foe && v.foe.isPlayer;
            if (busy) v.alogUntil = now + 25000;
            else if (!(v.alogUntil > now)) { if (this.mem.has(v.id)) this.mem.delete(v.id); continue; }
            const m = v.model;
            const gest = m?._gest?.id || '';
            const look = m?._lookYaw != null ? Math.round(m._lookYaw * DEG) : null;
            const sig = [c ? `${c.kind}/${c.id || ''}/${c.stage || ''}` : '', v.order?.kind || '', v.follow ? 'follow' : '', v.mode, v.emoEvName || '', gest, v.glance ? 'glance' : '', v.sleep ? 'sleep' : '', v.talking > 0 ? 'talk' : '', v.fear ? 'fear' : '', v.foe ? 'foe' : ''].join('|');
            let rec = this.mem.get(v.id);
            if (!rec) this.mem.set(v.id, (rec = { sig: '', at: 0 }));
            if (rec.sig === sig && now - rec.at < 10000) continue;
            const changed = rec.sig !== sig;
            rec.sig = sig; rec.at = now;
            const parts = [];
            if (c) {
                const aim = c.tx != null ? ` цель=(${r1(c.tx)}, ${r1(c.tz)}) осталось ${r1(Math.hypot(c.tx - v.x, c.tz - v.z))} м, повернут к цели на ${this._off(v, c.tx, c.tz)}°` : '';
                parts.push(`приказ=${c.id || c.kind}/${c.kind}${c.stage ? '/' + c.stage : ''}${aim} время ${r1(c.t)} с, шёл ${r1(c.walkT || 0)} с${v.wallW?.noWay > 0 ? ', УПЁРСЯ В ЗАКРЫТОЕ' : ''}`);
            }
            if (v.order) parts.push(`приказ короля=${v.order.kind}`);
            if (v.follow) parts.push(`идёт за ${v.follow}${v.followFar ? ' (далеко)' : ' (только в своих землях)'}, осталось ${me ? r1(Math.hypot(me.x - v.x, me.z - v.z)) : '?'} м`);
            if (v.companion) parts.push('спутник');
            if (v.foe) parts.push(`враг=${v.foe.id ?? v.foe}`);
            if (v.sleep) parts.push(`СПИТ (${v.sleep.phase})`);
            if (v.fear) parts.push(`страх ${v.fear.level ?? 1}`);
            const dist = me ? ` до героя ${r1(Math.hypot(me.x - v.x, me.z - v.z))} м` : '';
            const face = me ? `, тело ${this._off(v, me.x, me.z)}° от героя` : '';
            const gl = v.glance ? `, ему показали точку (${r1(v.glance.x)}, ${r1(v.glance.z)}): тело ${this._off(v, v.glance.x, v.glance.z)}° от неё` : '';
            const hd = look != null ? `, голова ${look}° от тела` : ', голова прямо';
            let bars = '';
            try { const e = life.rel?.eff?.(v); if (e) bars = ` | подчинение ${Math.round(e.sub)} дружба ${Math.round(e.fr)} любовь ${Math.round(e.lv)}`; } catch (_) { /* ignore */ }
            parts.push(`режим=${v.mode} скорость=${r1(v.speed || 0)}${v.talking > 0 ? ' говорит с героем' : ''}`);
            this._emit(`действие${changed ? '' : ' (всё ещё)'}: ${this._who(v)} в (${r1(v.x)}, ${r1(v.z)})${dist}${face}${gl}${hd} | ${parts.join('; ')} | чувство=${v.emoNow || '-'} жест=${gest || '-'} реплика=${v.gctx || '-'}${bars}`);
        }
        if (this.mem.size > 80) for (const [id, r] of this.mem) if (now - r.at > 60000) this.mem.delete(id);
    }
}
