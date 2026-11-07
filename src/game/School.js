/**
 * School.js — the mode «Школа Акселдорф» (docs/rules/school.md): a year at the school of magic. Built part by part.
 *
 * Part 1 (now) — the ARRIVAL:
 *   1. the hero rides up the road to the gates in a carriage (Carriages.js — real horses), his father driving, his mother beside;
 *   2. at the gates they stop, the hero gets down; the parents say goodbye and drive back down the road (gone far away);
 *   3. a teacher waits at the gates with the other new pupils: «Добро пожаловать в Акселдорф!»; she leads them across the courtyard
 *      (round the fountain) into the great hall; the hero follows on his own feet (a glowing circle shows where to come);
 *   4. in the hall the pupils stand along the tables, the teachers on the dais, the Director — Дардолус Пантифус Мудрый — speaks.
 * The school's people are CastleLife villagers of one place of its own (`SCHOOL_SITE`), led by this scene while `v.scripted`
 * (CastleLife._think → School.drive); a fright or a fight is still their own (a spell at them — they answer as always).
 *
 * What may go wrong (handled): the hero jumps off the carriage (he is kept on its seat until the gates — frozen); the horses are
 * hurt / the carriage breaks (it is let go — the hero is put at the gates); the hero runs off instead of following (the teacher waits
 * at the hall's door; the speech begins only when he is in the hall); a pupil is pushed / frozen (it walks on when it can); the game
 * is left (nothing is saved yet — part 2 keeps the year's record).
 * Next parts: the dormitory, the schedule scroll, days and sleep; the lessons; the leaving feast and the way to Survival.
 */
import * as THREE from 'three';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { SchoolDecor } from '../fx/SchoolDecor.js';
import { SchoolCoach } from '../fx/SchoolCoach.js';
import { makeRobe } from './ArmorTypes.js';
import { SchoolLesson } from './SchoolLesson.js';
import { lessonById } from './SchoolLessons.js';
import { lessonOfDay, yearLength, newRecord, loadRecord, saveRecord, YEAR, SCHEDULE } from './SchoolYear.js';
import { newUid } from './ItemTypes.js';

export const SCHOOL_SITE = 'akseldorf';
const SUBJECTS_NAME = { defence: 'защита от тёмных искусств', potions: 'зельеварение', pentagrams: 'пентаграммы', history: 'основы мира' };

/** The people of the school (idx → who): the teachers, the Director, the new pupils (ordinary and remarkable). */
export const SCHOOL_PEOPLE = [
    { idx: 20, role: 'teacher', rank: 'master', female: false, name: 'Дардолус Пантифус Мудрый', title: 'Директор', seed: 70120, mana: 2000, outfit: 'astrologer', look: { beard: 'long', hairColor: 0xeeeeee, hair: 'long', female: false } },
    { idx: 21, role: 'teacher', female: false, name: 'Профессор Корвин Страйд', title: 'Защита от тёмных искусств', seed: 70121, outfit: 'fire' },
    { idx: 22, role: 'teacher', female: true, name: 'Профессор Ирма Вельтон', title: 'Зельеварение', seed: 70122, outfit: 'druid' },
    { idx: 23, role: 'teacher', female: false, name: 'Профессор Аларик Морн', title: 'Пентаграммы', seed: 70123, outfit: 'archmage' },
    { idx: 24, role: 'teacher', female: true, name: 'Профессор Фелиция Грау', title: 'Основы мира', seed: 70124, outfit: 'frost' },
    // the new pupils: most ordinary, a few remarkable (a look of their own — the author: «сразу видно, что интересный ученик»)
    ...[
        ['Тим', false], ['Ника', true], ['Лев', false], ['Мира', true], ['Сева', false], ['Ада', true],
        ['Вилмер', false, { hairColor: 0xb03ad8, hat: 'wizardTall' }], ['Ульяна', true, { hairColor: 0xf2f2ff }], ['Гордей', false, { beard: 'none', hairColor: 0xff5a1f }],
    ].map(([name, female, look], k) => ({ idx: 30 + k, role: 'student', rank: 'novice', female, name, seed: 70130 + k * 7, ...(look ? { look, remarkable: true } : {}) })),
    // the training dummy of the defence room (the author: «магическая конструкция в виде человека, не робот»): pale enchanted stone,
    // no hair, a wand; never dies, never starts a fight, a little slow; picks its wand up after «Экспеллиармус» (School.drive)
    { idx: 40, role: 'student', rank: 'novice', female: false, name: 'Учебный манекен', title: 'Магическая конструкция', seed: 70140, dummy: true,
        look: { skin: 0xa9b3c4, hair: 'bald', beard: 'none', hat: null, hairColor: 0xa9b3c4, shirt: 0x6d7686, pants: 0x5b6474, boots: 0x4a515e, accent: 0x7fd8ff, mouth: 'calm' } },
];
/** Teachers' mana cells: 300…700, by each one's seed (the author: «от 300 до 700 рандомно»); the Director's — 2000. */
for (const p of SCHOOL_PEOPLE) if (p.role === 'teacher' && !p.mana) p.mana = 300 + ((p.seed * 2654435761) >>> 0) % 401;

const SPEECH = [
    'Добро пожаловать в Акселдорф, дорогие ученики!',
    'Я — Дардолус Пантифус, директор этой школы. Целый год вы будете учиться здесь магии.',
    'Вас ждут четыре предмета: защита от тёмных искусств, зельеварение, пентаграммы и основы мира.',
    'Расписание вам выдадут свитком. Не опаздывайте — учителя этого не любят.',
    'Помните: магия — это не только сила, но и ответственность. Берегите друг друга.',
    'А теперь — ужин, и отдыхайте. Завтра начинается учёба.',
];

export class School {
    constructor(game) {
        this.game = game;
        this.plan = game.world?.terrain?.data?.school?.plan || game.terrain?.data?.school?.plan || null; // (the world's own land — Terrain's SchoolSite)
        this.phase = 'ride';
        this.t = 0;
        this.people = new Map(); // idx → villager
        this._quiet();
        if (!this.plan) return;
        // the year: from the record kept («Продолжить учёбу») or a new one — then the arrival first
        const kept = game.config?.schoolContinue ? loadRecord(this._store()) : null;
        this._rec = kept && kept.arrived ? kept : newRecord();
        if (this._rec.eve) this._rec.eve = false; // (left on the arrival's evening: the morning of day 1)
        this._site();
        this.decor = new SchoolDecor(game, this.plan); // (the Great Hall's floating candles and candelabras — SchoolDecor.js)
        this._beds();
        if (this._rec.arrived) { this.phase = 'free'; this.t = 0; this._morning(true); }
        else this._placeHero(this.plan.arrive);
    }

    _store() { try { return globalThis.localStorage || null; } catch { return null; } }
    _save() { saveRecord(this._store(), this.record); }

    /**
     * The gift of the school (the author: «подарок магических мантий»): every pupil wears a magic robe — «Фрозен» and the simplest magic
     * do nothing on it (Duel: ROBE_BLOCKS), so nobody is hurt by the lessons; the hero's lies by his bed — he puts it on himself.
     */
    _robes() {
        const g = this.game, r = this.record;
        r.robes = true; this._save();
        for (const p of SCHOOL_PEOPLE) if (p.role === 'student' && !p.dummy) { const v = this.people.get(p.idx); if (v) v.robe = true; }
        if (this.def) for (const e of this.def.people) if (e.role === 'student' && !e.dummy) e.robe = true;
        const b = this.myBed && g.beds?.list?.get(this.myBed);
        if (b && g.items?.spawnLoose) g.items.spawnLoose(makeRobe(true), new THREE.Vector3(b.x, b.y + 2.2, b.z), { hover: true, broadcast: false });
        g.hud?.toast?.('🎁 Подарок школы — волшебные мантии!', 4000);
        setTimeout(() => g.hud?.setVoice?.('🎁 Школа дарит всем ученикам волшебные мантии: они отбивают «Фрозен» и простые заклинания. Ваша мантия парит над кроватью — возьмите её и наденьте.', true), 3500);
    }

    /**
     * The schedule scroll (the author: a real thing, and the pupil is helped to read it): it hangs before the hero; how to open it is said.
     * Its lines are today's (SchoolYear.scheduleLines — read when it is opened).
     */
    _giveSchedule(teach = false) {
        const g = this.game, me = g.character?.group?.position;
        if (this._scheduled || !me || !g.items?.spawnLoose) return;
        this._scheduled = true;
        const yaw = g.character.group.rotation.y, at = new THREE.Vector3(me.x - Math.sin(yaw) * 1.6, me.y + 0.6, me.z - Math.cos(yaw) * 1.6);
        g.items.spawnLoose({ kind: 'scroll', uid: newUid(), stat: 'schedule' }, at, { hover: true, broadcast: false });
        g.hud?.setVoice?.(teach
            ? '📜 Вот ваше расписание уроков. Возьмите свиток одной рукой, другой рукой возьмитесь за второй конец и разведите руки — он раскроется. Там написано, какой урок сегодня и что дальше.'
            : '📜 Ваше расписание уроков парит перед вами: возьмите его и раскройте двумя руками.', true);
    }

    /** The pupil's mana and spells from the record: 5 cells at the start (the author) + what the school grew; the lessons' spells. */
    _applyRecord() {
        const g = this.game, c = g.combat, r = this.record;
        if (c) { c.maxFatigue = YEAR.START_CELLS + (r.cells || 0); c.fatigue = Math.min(c.fatigue ?? c.maxFatigue, c.maxFatigue); c._hudKey = ''; c._manaKey = ''; }
        g.bonus = g.bonus || {};
        const sp = { ...(g.bonus.spells || {}) };
        for (const k of r.spells) sp[k] = true;
        g.bonus.spells = sp;
    }

    /** The dormitory's beds (the game's real beds: lie down — sleep): two rows along the long walls, headboards at the wall. */
    _beds() {
        const B = this.game.beds, R = this.plan.rooms.dormitory, F = this.plan.F + 0.5;
        if (!B?.spawnBed) return;
        this.bedIds = [];
        const n = 6, z0 = R.z0 + 6, step = Math.min(6, (R.z1 - R.z0 - 10) / (n - 1));
        for (let i = 0; i < n; i++) for (const side of [0, 1]) {
            const x = side ? R.x1 - 3.2 : R.x0 + 3.2, z = z0 + i * step;
            const b = B.spawnBed({ x, y: F, z }, side ? -Math.PI / 2 : Math.PI / 2, side ? 'blue' : 'red', { id: `school-bed-${side}-${i}`, broadcast: false });
            if (b) this.bedIds.push(b.id);
        }
        this.myBed = this.bedIds[0] || null;
    }

    /** Morning: the hero up beside his bed (the first time — a word on the day). */
    _morning(first = false) {
        const g = this.game, r = this.record;
        const b = this.myBed && g.beds?.list?.get(this.myBed);
        if (g.beds?.lying) g.beds.standUp();
        else if (b) { const sp = g.beds._standSpot?.(b); if (sp) this._placeHero({ x: sp.x, y: sp.y, z: sp.z }, sp.ry); }
        this._applyRecord();
        this._sky(0.14); // (the morning: daylight)
        const L = lessonOfDay(r.day);
        SCHEDULE.day = r.day; // (the schedule scroll reads today from here)
        if (first) setTimeout(() => this._giveSchedule(), 2500); // (a game going on: the scroll again — things are not kept between games)
        if (L && L.month >= 5 && !r.robes) this._robes(); // (the author: before «Фрозен» — the gift of magic robes that turn it away)
        this.dayT = 0; this._dayLesson = L ? L.id : null; this._freeSaid = false; this._sleepT = 0;
        g.hud?.setVoice?.(L ? `☀️ День ${r.day}. Сегодня урок: ${SUBJECTS_NAME[L.subject] || ''}. Вас позовут.` : '🎓 Учебный год окончен!', true);
        if (first) g.hud?.toast?.(`Школа Акселдорф — день ${r.day}`, 3000);
    }

    /** No creatures wander in (no herds, wild plants, birds, book-birds, bosses) — the horses of the carriage still go. */
    _quiet() {
        const g = this.game;
        for (const k of ['flora', 'canaries', 'owls', 'phoenixes', 'spencers', 'dragons', 'plants', 'gargoyles', 'spiders', 'tarons', 'hellPatrol', 'crystals']) if (g[k] && 'enabled' in g[k]) g[k].enabled = false;
        if (g.animals) { g.animals._lookFar = () => {}; g.animals._treesAround = () => {}; } // (no herds about: only the carriage's horses)
        if (g.books) g.books._spawnT = Infinity;
    }

    _placeHero(p, yaw = 0) {
        const g = this.game, me = g.character.group.position;
        me.set(p.x, p.y + PLAYER_GROUND_OFFSET + 0.2, p.z);
        g.faceYaw?.(yaw);
        g.character.verticalVelocity = 0;
    }

    /** The school's people as one place of CastleLife (made by the scene, not by the land). */
    _site() {
        const P = this.plan, life = this.game.castleLife;
        if (!life) return;
        const def = {
            id: SCHOOL_SITE, kind: 'wander', name: 'Акселдорф', x: P.centre.x, z: P.centre.z, F: P.F + 0.5, zone: 150, gx: 0, gz: 0,
            knights: 0, king: '', population: SCHOOL_PEOPLE.length, color: 0x4a3a8a,
            people: SCHOOL_PEOPLE.map((p) => ({ ...p, home: -1, stall: -1, brave: 0.4, ...(this._rec?.robes && p.role === 'student' && !p.dummy ? { robe: true } : {}) })),
            houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
            nodes: [{ id: 0, x: P.gate.x, y: P.F + 0.5, z: P.gate.z, tag: 'gate' }], edges: [],
        };
        life.addSite(def);
        this.def = def;
    }

    /** A person of the school made (once), standing at `at`, led by the scene. */
    _person(idx, at, yaw = 0) {
        const life = this.game.castleLife, cs = life?.castles?.get(SCHOOL_SITE);
        if (!cs?.awake) return null;
        let v = cs.active.get(idx);
        if (!v) {
            life.state?.(SCHOOL_SITE)?.killed?.delete?.(idx);
            v = life._activate(cs, idx, { x: at.x, y: at.y, z: at.z, yaw }, 'stall', { post: { x: at.x, y: at.y, z: at.z, yaw } });
            if (!v) return null;
        }
        v.scripted = true;
        this.people.set(idx, v);
        return v;
    }

    /** (CastleLife._think) a scripted person: walks to its goal, stands facing where it is told. True — handled. */
    drive(v, dt) {
        const life = this.game.castleLife;
        if (!v.scripted || v.dead) return false;
        if (v.seatedOn) { // (riding: on its seat of the carriage)
            const c = this.cart, sp = c && this.game.carriages?.seatPos(c, v.seatedOn - 1, this._sp || (this._sp = {})); // (seatedOn: the seat's number + 1 — 0 is «not riding»)
            if (!sp) { v.seatedOn = 0; return false; }
            v.x = sp.x; v.y = sp.y - 0.6; v.z = sp.z; v.yaw = sp.yaw; v.seated = true; v.speed = 0; v.mode = 'idle';
            return true;
        }
        v.seated = false;
        if (v.entry?.dummy && this._dummyWand(v, dt)) { life._ground?.(v); return true; }
        const goal = v.goal;
        if (goal) {
            const there = life._goSpot(v, goal.x, goal.z, goal.run ? 4.2 : 2.6, dt, 0.7, goal.y);
            v.mode = there ? 'idle' : v.speed > 0 ? 'walk' : 'idle';
            if (there) { if (goal.next?.length) v.goal = { ...goal.next[0], next: goal.next.slice(1) }; else { v.goal = null; v.post = { x: goal.x, y: goal.y, z: goal.z, yaw: goal.yaw ?? v.yaw }; } }
        } else {
            v.speed = 0; v.mode = 'idle';
            const look = v.lookAt === 'hero' ? this.game.character.group.position : v.lookAt;
            if (look) { const a = Math.atan2(-(look.x - v.x), -(look.z - v.z)); let d = a - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); v.yaw += d * Math.min(1, dt * 4); }
            else if (v.post?.yaw != null) v.yaw = v.post.yaw;
        }
        life._ground?.(v);
        return true;
    }

    /** The dummy's wand was knocked out: a moment of standing still, then it walks to it and picks it up (as the arena's wizards). */
    _dummyWand(v, dt) {
        if (!v.noWand) return false;
        const g = this.game, it = v.lostWand && g.items?.loose?.get(v.lostWand.uid);
        if (!it) { if ((v._wandT = (v._wandT || 0) + dt) > 6) { v.noWand = false; v.lostWand = null; v._wandT = 0; v.model?.setHeldTool?.('wand'); } v.speed = 0; v.mode = 'idle'; return true; } // (taken by somebody: a new one «grows» in its hand after a while)
        if ((v.lostWand.t = (v.lostWand.t || 0) + dt) < 2.5) { v.speed = 0; v.mode = 'stagger'; return true; }
        const p = it.model.position, life = g.castleLife;
        if (life._goSpot(v, p.x, p.z, 1.6, dt, 0.8) || Math.hypot(p.x - v.x, p.z - v.z) < 1.1) {
            g.items.pickUp(v.lostWand.uid, '#' + v.id, 'right');
            v.noWand = false; v.lostWand = null;
            v.model?.setHeldTool?.('wand');
            if (v.post) v.goal = { ...v.post }; // (back to its place)
        } else v.mode = 'walk';
        return true;
    }

    /** The dummy of the defence room (made once, standing at its place). */
    dummy() {
        const R = this.plan.rooms.defence, F = this.plan.F + 0.5;
        const at = { x: (R.x0 + R.x1) / 2 + 5, y: F, z: R.z0 + 5, yaw: Math.PI };
        const v = this.people.get(40) || this._person(40, at, at.yaw);
        if (v && !v.post) v.post = at;
        return v;
    }

    /** (a lesson) `v` casts `spell` at the dummy; true when the charge flew. */
    castAtDummy(v, spell) {
        const d = this.dummy(), F = this.game.castleLife?.wizards?.fight;
        if (!d || !F || !v || v.dead || v.noWand) return false;
        v.yaw = Math.atan2(-(d.x - v.x), -(d.z - v.z));
        try { return !!F._cast(v, spell, null, { x: d.x, y: d.y + 2.6, z: d.z }, null, { k: 'v', id: d.id }); } catch (e) { console.warn('school cast', e); return false; }
    }

    /** A line said by a person (its voice, its bubble). */
    _say(v, text, s = 5) { if (v && !v.dead) this.game.castleLife?._say?.(v, text, s, true, true); }

    /** Is the hero held still (in the coach, in a cut-scene, listening to the Director)? */
    get frozen() { return this.phase === 'intro' || this.phase === 'speech' || !!this.game.cine?.active; }
    /** The school's people never answer a bump or a blow during the scenes (the author: «меня ударил фермер») — CastleLife.hit. */
    get calm() { return this.phase !== 'free'; }

    // ------------------------------------------------------------------ the scene
    update(dt) {
        if (!this.plan || !(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        this.t += dt;
        this.decor?.update(dt, this.t);
        this._wandLight(dt);
        switch (this.phase) {
            case 'ride': case 'intro': return this._intro(dt);
            case 'bridge': return this._bridge(dt);
            case 'speech': return this._speech(dt);
            case 'free': return this._free(dt);
        }
    }

    /** The hour of the day (World.setDayPhase): the arrival at dusk, darkening to night; the school's days by day. */
    _sky(phase) { this._phase = phase; this.game.world?.setDayPhase?.(phase); }

    /**
     * THE OPENING (the author 07.11: «кат-сцены — самое главное»; «начинается немножко в темноте, приглушённо, фонари»): dusk; the magic coach
     * drives itself up the road through the meadows, over the headland to the bridge's head; cut-scene shots — the castle on its hill with
     * the title, the coach on the road, the bridge over the gorge, the coach arriving, the teacher waiting with a lit wand; the door opens,
     * the pupils get out — then the hero walks.
     */
    _intro(dt) {
        const g = this.game, P = this.plan;
        if (this.phase === 'ride') {
            this._sky(0.492);
            const d = g.world?.terrain?.data;
            const ready = !d?.landMade || (d.landMade(P.coachFrom.x, P.coachFrom.z) && d.landMade(P.arrive.x, P.arrive.z) && d.landMade(P.centre.x, P.centre.z));
            this._hideHero(true, P.coachFrom);
            if (!ready && this.t < 40) return; // (the land under the road first — the hero waits in the dark coach)
            this.phase = 'intro'; this.t = 0;
            this.coach = new SchoolCoach(g.scene);
            this._coachZ = P.coachFrom.z; this._coachStop = P.arrive.z + 9; this._coachV = 0;
            this._people();
            this._shots();
        }
        // the coach on its road (it slows to a stop at the headland's square)
        const C = this.coach;
        if (C) {
            const left = this._coachZ - this._coachStop, want = left > 30 ? 7 : left > 0.2 ? Math.max(1, left * 0.25) : 0;
            this._coachV += (want - this._coachV) * Math.min(1, dt * 1.2);
            this._coachZ = Math.max(this._coachStop, this._coachZ - this._coachV * dt);
            const y = g.collision?.groundY?.(P.centre.x, this._coachZ) ?? P.F;
            C.set(P.centre.x, y, this._coachZ, 0, this._coachV, dt);
            if (this.phase === 'intro' && !this._out) this._hideHero(true, { x: P.centre.x, y, z: this._coachZ });
        }
        this._sky(0.492 + Math.min(1, this.t / 60) * 0.02);
    }

    /** The hero rides inside (not seen, held still) or stands out. */
    _hideHero(inside, at) {
        const g = this.game, ch = g.character;
        ch.group.visible = !inside;
        if (inside && at) { ch.group.position.set(at.x, (at.y ?? this.plan.F) + PLAYER_GROUND_OFFSET + 1.8, at.z); ch.verticalVelocity = 0; }
    }

    /** The people of the opening: the teacher at the bridge's head with her lit wand; the teachers and the Director in the hall. */
    _people() {
        const P = this.plan, F = P.F + 0.5, b0 = P.bridge.v1 + 3;
        const tea = this._person(22, { x: P.centre.x - 3, y: F, z: b0 }, Math.PI);
        if (tea) { tea.lookAt = { x: P.centre.x, z: P.arrive.z + 30 }; this._lit = tea; }
        const D = P.hall.dais;
        const dir = this._person(20, { x: D.x, y: P.F + 2.5, z: D.z - 1 }, 0); if (dir) dir.lookAt = { x: D.x, z: D.z + 40 };
        [21, 23, 24].forEach((i, k) => { const v = this._person(i, { x: D.x + (k - 1) * 4 + (k >= 1 ? 4 : 0), y: P.F + 2.5, z: D.z + 1 }, 0); if (v) v.lookAt = { x: D.x, z: D.z + 40 }; });
    }

    /** The cut-scene's shots (Cine.js). */
    _shots() {
        const g = this.game, P = this.plan, X = P.centre.x, Z = P.centre.z, F = P.F, M = P.M;
        const coach = () => { const c = this.coach?.group.position; return c ? [c.x, c.y, c.z] : [X, F, P.arrive.z]; };
        const rel = (dx, dy, dz) => () => { const c = coach(); return [c[0] + dx, c[1] + dy, c[2] + dz]; };
        const tea = () => { const v = this.people.get(22); return v ? [v.x, v.y + 2.6, v.z] : [X, F + 3, P.bridge.v1]; };
        const by = 'Профессор Ирма Вельтон';
        g.cine.play([
            { dur: 1.2, black: true, pos: [X - 230, M + 22, Z + 300], look: [X, F + 26, Z] },
            { dur: 9, fadeIn: true, from: { pos: [X - 230, M + 22, Z + 300], look: [X, F + 26, Z] }, to: { pos: [X - 150, M + 30, Z + 250], look: [X, F + 30, Z - 10] }, title: 'Акселдорф<small>школа волшебства</small>' },
            { dur: 8, from: { pos: rel(9, 4, 6), look: rel(0, 2.5, 0) }, to: { pos: rel(7, 3, -8), look: rel(0, 2.5, -6) }, sub: 'Волшебная карета везла новых учеников всё выше — туда, где над ущельем стоит Акселдорф.' },
            { dur: 7, from: { pos: [X + 70, M - 8, Z + 84], look: [X, F, Z + 84] }, to: { pos: [X + 55, M - 4, Z + 92], look: [X, F + 18, Z + 40] }, sub: 'Говорят, мост через ущелье построили сами основатели школы — и с тех пор из него не выпал ни один камень.' },
            { dur: 7, from: { pos: [X - 14, F + 6, P.arrive.z - 14], look: rel(0, 2, 0) }, to: { pos: [X - 12, F + 5, P.arrive.z - 10], look: rel(0, 2, 0) } },
            { dur: 7, from: { pos: () => { const t = tea(); return [t[0] + 2.5, t[1] + 0.4, t[2] + 5]; }, look: tea }, who: by, sub: 'Добро пожаловать в Акселдорф! Выходите — не бойтесь, здесь вас никто не обидит.',
                start: () => { const v = this.people.get(22); if (v) v.lookAt = { x: X, z: this._coachStop }; this._say(v, 'Добро пожаловать в Акселдорф! Выходите — не бойтесь, здесь вас никто не обидит.', 6); } },
            { dur: 5, from: { pos: rel(9, 3, 3), look: rel(1.6, 2, -0.6) }, to: { pos: rel(8, 2.8, 1), look: rel(2, 2, -0.6) }, start: () => this._getOut() },
        ], { onEnd: () => this._startBridge() });
    }

    /** The coach's door opens, the new pupils get out and stand about on the square. */
    _getOut() {
        if (this._outDone) return; this._outDone = true;
        const P = this.plan, F = P.F + 0.5, C = this.coach;
        C?.openDoor(true);
        const ex = C ? C.exitAt() : new THREE.Vector3(P.centre.x + 3, F, this._coachStop);
        const pupils = SCHOOL_PEOPLE.filter((p) => p.role === 'student' && !p.dummy);
        pupils.forEach((p, k) => {
            const v = this._person(p.idx, { x: ex.x + 0.5, y: F, z: ex.z }, 0);
            if (!v) return;
            const a = -0.9 + (k / Math.max(1, pupils.length - 1)) * 1.8;
            v.x = ex.x; v.z = ex.z; v.goal = { x: P.centre.x + Math.sin(a) * 6, y: F, z: P.bridge.v1 + 9 + Math.cos(a) * 3, yaw: 0 };
            v.lookAt = this.people.get(22) || null;
        });
    }

    /** The hero out: he walks behind the teacher over the bridge to the gate (a circle shows where). */
    _startBridge() {
        const g = this.game, P = this.plan, F = P.F + 0.5;
        this._getOut();
        this._out = true;
        const C = this.coach, ex = C ? C.exitAt() : new THREE.Vector3(P.centre.x + 3, F, this._coachStop);
        this._hideHero(false);
        this._placeHero({ x: ex.x, y: F, z: ex.z }, 0);
        this.phase = 'bridge'; this.t = 0; this._step = 0;
        g.hud?.setVoice?.('Идите за профессором через мост — к воротам замка.', true);
    }

    _bridge(dt) {
        const g = this.game, P = this.plan, F = P.F + 0.5, X = P.centre.x, me = g.character.group.position;
        const tea = this.people.get(22), pupils = this.pupilsOf();
        if (this._step === 0 && this.t > 1.5) {
            this._step = 1; this._say(tea, 'Держитесь вместе! За мной — через мост. Он старый, но крепче любой скалы.', 6);
            const way = [{ x: X, y: F, z: P.bridge.v1 }, { x: X, y: F, z: P.bridge.v0 }, { x: X, y: F, z: P.gate.z + 2 }];
            if (tea) { tea.lookAt = null; tea.goal = { ...way[0], next: way.slice(1) }; }
            pupils.forEach((v, k) => { const dx = (k % 2 ? -1.2 : 1.2); v.lookAt = null; v.goal = { x: X + dx, y: F, z: P.bridge.v1 + 3 + k * 1.6, next: [{ x: X + dx, y: F, z: P.bridge.v0 + 2 + k * 1.6 }, { x: X + dx * 3, y: F, z: P.gate.z + 5 + k }] }; });
            this._goal(P.gate);
        }
        // the coach drives away down the road, its lantern going off into the dusk
        const C = this.coach;
        if (C && this.t > 6) {
            this._coachZ += Math.min(7, (this.t - 6) * 2) * dt;
            const y = g.collision?.groundY?.(X, this._coachZ) ?? P.F;
            C.openDoor(false); C.set(X, y, this._coachZ, Math.PI, Math.min(7, (this.t - 6) * 2), dt);
            if (this._coachZ > P.coachFrom.z) { C.dispose(); this.coach = null; }
        }
        this._sky(0.512 + Math.min(1, this.t / 90) * 0.02);
        // at the gate: the teacher leads on through the courtyard into the hall
        if (this._step === 1 && Math.hypot(me.x - P.gate.x, me.z - P.gate.z) < 9) {
            this._step = 2; this._say(tea, 'А вот и он — Акселдорф. Большой зал прямо впереди: директор ждёт.', 6);
            const door = P.hall.door, fx = P.fountain.x, fz = P.fountain.z;
            const way = (dx) => [{ x: fx + dx, y: F, z: fz + 4 }, { x: fx + dx * 0.6, y: F, z: door.z + 1 }, { x: door.x, y: F, z: door.z - 4 }];
            if (tea) { const w = way(-9); tea.goal = { ...w[0], next: [...w.slice(1), { x: P.hall.dais.x - 5, y: P.F + 2.5, z: P.hall.dais.z + 1, yaw: 0 }] }; }
            const T = P.hall.tables;
            pupils.forEach((v, k) => { const tb = T[k % T.length], w = way(k % 2 ? -9 : 9); v.goal = { ...w[0], next: [...w.slice(1), { x: tb.x + (k % 2 ? -1.5 : 1.5), y: F, z: tb.z0 + 4 + Math.floor(k / T.length) * 5, yaw: 0 }] }; });
            this._goal(door);
        }
        const H = P.hall;
        if (this._step === 2 && me.x > H.x0 && me.x < H.x1 && me.z > H.z0 && me.z < H.z1) { this._goal(null); this._startSpeech(); }
    }

    /** The Director's speech — a cut-scene in the hall: the candles, the dais, the Director; his words line by line. */
    _startSpeech() {
        const g = this.game, P = this.plan, H = P.hall, X = P.centre.x, F = P.F;
        this.phase = 'speech'; this.t = 0;
        // the pupils who have not got there yet are put at their places (no waiting on a slow walker)
        const T = H.tables;
        this.pupilsOf().forEach((v, k) => { const tb = T[k % T.length], at = { x: tb.x + (k % 2 ? -1.5 : 1.5), y: F + 0.5, z: tb.z0 + 4 + Math.floor(k / T.length) * 5, yaw: 0 }; v.x = at.x; v.y = at.y; v.z = at.z; v.yaw = 0; v.goal = null; v.post = at; v.lookAt = { x: X, z: H.z0 }; });
        const tea = this.people.get(22); if (tea) { tea.x = H.dais.x - 5; tea.y = F + 2.5; tea.z = H.dais.z + 1; tea.goal = null; tea.yaw = 0; tea.lookAt = { x: X, z: H.z1 }; }
        const dir = () => { const v = this.people.get(20); return v ? [v.x, v.y + 3.2, v.z] : [X, F + 6, H.z0 + 6]; };
        const mz = (H.z0 + H.z1) / 2, who = 'Директор Дардолус Пантифус Мудрый';
        const line = (i, extra = {}) => ({ dur: 6.5, who, sub: SPEECH[i], start: () => this._say(this.people.get(20), SPEECH[i], 6), ...extra });
        g.cine.play([
            { dur: 7, from: { pos: [X + 10, F + 6, H.z1 - 4], look: [X, F + 14, mz] }, to: { pos: [X + 4, F + 9, mz + 6], look: [X, F + 15, H.z0 + 6] } },
            line(0, { from: { pos: () => { const d = dir(); return [d[0] + 3, d[1] + 0.5, d[2] + 9]; }, look: dir } }),
            line(1, { from: { pos: () => { const d = dir(); return [d[0] - 4, d[1] + 0.3, d[2] + 8]; }, look: dir } }),
            line(2, { from: { pos: [X - 12, F + 5, mz + 4], look: [X, F + 4, H.z0 + 6] }, to: { pos: [X - 10, F + 5, mz - 2], look: [X, F + 4, H.z0 + 6] } }),
            line(3, { from: { pos: () => { const d = dir(); return [d[0] + 5, d[1] + 1, d[2] + 11]; }, look: dir } }),
            line(4, { from: { pos: [X, F + 18, mz + 10], look: [X, F + 13, H.z0 + 4] }, to: { pos: [X, F + 16, mz], look: [X, F + 12, H.z0 + 4] } }),
            line(5, { from: { pos: () => { const d = dir(); return [d[0] + 2, d[1] + 0.2, d[2] + 7]; }, look: dir }, fadeOut: true }),
        ], { onEnd: () => { this.phase = 'free'; this.t = 0; this._sky(0.6); } });
    }

    _speech() { /* (the cut-scene plays it — _startSpeech) */ }

    /** The teacher's lit wand (a warm light at its tip) while she leads them in the dusk. */
    _wandLight() {
        const v = this._lit, g = this.game;
        if (!v || v.dead || this.phase === 'free') { if (this._glow) this._glow.visible = false; return; }
        if (!this._glow) {
            const c = document.createElement('canvas'); c.width = c.height = 64;
            const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
            gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,236,190,0.7)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
            x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
            this._glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            this._glow.scale.set(1.3, 1.3, 1);
            g.scene.add(this._glow);
        }
        this._glow.visible = true;
        const tip = this._tip || (this._tip = new THREE.Vector3());
        if (v.group?.visible && v.model?.getWandTip) v.model.getWandTip(tip); else tip.set(v.x, v.y + 3, v.z);
        this._glow.position.copy(tip);
        const k = 1.2 + Math.sin(this.t * 6) * 0.08; this._glow.scale.set(k, k, 1);
    }

    /**
     * Free time and the lessons. Part 2 (days, sleep, the schedule) will say WHEN; for now the month's lessons follow one another
     * a little after the speech / the last lesson (the engine is one for all — SchoolLesson.js).
     */
    _free(dt) {
        const r = this.record, g = this.game;
        if (!r.arrived) { // (after the Director's speech: the evening of the arrival — the first lesson is tomorrow, «Завтра начинается учёба»)
            r.arrived = true; r.eve = true; this._applyRecord(); this._dayLesson = null; this.dayT = 0; this._save();
            SCHEDULE.day = r.day; setTimeout(() => this._giveSchedule(true), 9000);
            g.hud?.setVoice?.('🌙 Вечер первого дня. Ваша спальня — в южном крыле, справа от ворот: выберите кровать и ложитесь спать — утром первый урок.', true);
            this._freeSaid = true;
        }
        this.dayT = (this.dayT || 0) + dt;
        if (this.lesson && !this.lesson.done) return this.lesson.update(dt);
        if (this.lesson?.done) {
            if (this.lesson.attended && !r.attended.includes(this.lesson.L.id)) r.attended.push(this.lesson.L.id);
            if (this.lesson.passed) { r.cells = (r.cells || 0) + YEAR.LESSON_CELLS; g.mana?.grow?.(YEAR.LESSON_CELLS, 'lesson', this.lesson.L.id); g.hud?.toast?.(`🔷 Урок пройден: +${YEAR.LESSON_CELLS} ячейки маны`, 3500); }
            for (const sp of this.lesson.given) if (!r.spells.includes(sp)) r.spells.push(sp);
            this.lesson = null; this._save();
        }
        // the first day of a month: the Director's gathering in the Great Hall first (SchoolLessons.HALL_TALKS)
        const m = lessonOfDay(r.day)?.month, hall = m && m > 1 && !r.eve ? 'hall' + m : null;
        if (hall && this._dayLesson && !r.seen.includes(this._dayLesson) && !r.seen.includes(hall) && lessonById(hall)) {
            if (this.dayT > 6) { r.seen.push(hall); this._save(); this.lesson = new SchoolLesson(this, hall); this.dayT = 0; }
            return;
        }
        // the day's lesson: called a little after the morning
        const id = this._dayLesson;
        if (id && !r.seen.includes(id)) { if (this.dayT > 10) { r.seen.push(id); this._save(); this.lesson = new SchoolLesson(this, id); } return; }
        // free time; the bed — the next day
        if (!this._freeSaid && this.dayT > 2) { this._freeSaid = true; g.hud?.setVoice?.(r.day >= yearLength() ? '🎓 Это был последний урок года! Ложитесь спать — утром выпускной.' : '🕊️ Уроки на сегодня окончены — свободное время. Когда захотите, ложитесь спать в спальне (южное крыло, справа от ворот): наступит следующий день.', true); }
        const lying = g.beds?.lying, mine = lying && this.bedIds?.includes(lying);
        this._sleepT = mine ? (this._sleepT || 0) + dt : 0;
        if (mine && lying !== this.myBed) this.myBed = lying; // (the bed he chose is his)
        if (this._sleepT > YEAR.SLEEP_S) this._nextDay();
    }

    /** The night passes: the next day (or the year's end). */
    _nextDay() {
        const r = this.record;
        if (r.eve) { r.eve = false; this._save(); this.game.hud?.toast?.('🌙 Ночь прошла…', 2500); this._morning(); return; } // (the arrival's night: day 1 begins)
        if (r.day >= yearLength()) { r.done = true; this._save(); this.game.hud?.setVoice?.('🎓 Учебный год окончен! Выпускной и путь в новый мир — скоро.', true); this._sleepT = -1e9; return; }
        r.day++;
        this._save();
        this.game.hud?.toast?.('🌙 Ночь прошла…', 2500);
        this._morning();
    }
    get month() { return lessonOfDay(this.record.day)?.month || 12; }
    get record() { return this._rec || (this._rec = newRecord()); }

    /** The pupils of the school (made ones). */
    pupilsOf() { return SCHOOL_PEOPLE.filter((p) => p.role === 'student' && !p.dummy).map((p) => this.people.get(p.idx)).filter((v) => v && !v.dead); }

    /** (a lesson) The teacher `v` sends `spell` at the hero — turned to him first; the charge (Duel's bolt) or null. */
    castAtHero(v, spell) {
        const g = this.game, life = g.castleLife, fp = life?._playerPos?.(g.localId), F = life?.wizards?.fight;
        if (!fp || !F || !v || v.dead || v.noWand) return null;
        v.yaw = Math.atan2(-(fp.x - v.x), -(fp.z - v.z));
        const before = new Set(g.duel?.bolts?.keys?.() || []);
        try { if (!F._cast(v, spell, g.localId, fp)) return null; } catch (e) { console.warn('school cast', e); return null; }
        for (const [k, b] of g.duel.bolts) if (!before.has(k) && b.by === v.id) return b;
        return null;
    }

    /** The hero cast a spell (Game). */
    onCast(name) { this.lesson?.onCast?.(name); }
    /** A spell / a blow reached a person kept safe by the school (the dummy, a lesson's duellist) — CastleLife.hit. */
    onHit(v, by) { this.lesson?.onHit?.(v, by); }

    /** The glowing circle where the hero should come (null: none) — the same as the tutorial's. */
    _goal(at) {
        const g = this.game;
        if (!this._goalObj && at) {
            const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
            const grp = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 48), mat(0xffd76a, 0.95)); ring.rotation.x = -Math.PI / 2;
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 9, 32, 1, true), mat(0xffe39a, 0.12)); beam.position.y = 4.5;
            grp.add(ring, beam);
            g.scene.add(grp);
            this._goalObj = grp;
        }
        if (!this._goalObj) return;
        this._goalObj.visible = !!at;
        if (at) this._goalObj.position.set(at.x, at.y + 0.05, at.z);
    }

    dispose() {
        this.decor?.dispose(); this.decor = null; this.lesson = null;
        if (this._goalObj) { this.game.scene?.remove(this._goalObj); this._goalObj.traverse((m) => { m.geometry?.dispose?.(); m.material?.dispose?.(); }); this._goalObj = null; }
        this.coach?.dispose(); this.coach = null;
        if (this._glow) { this.game.scene?.remove(this._glow); this._glow.material.map?.dispose(); this._glow.material.dispose(); this._glow = null; }
    }
}
