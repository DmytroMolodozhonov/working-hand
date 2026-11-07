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
import { SchoolLesson } from './SchoolLesson.js';
import { lessonsOfMonth } from './SchoolLessons.js';

export const SCHOOL_SITE = 'akseldorf';

/** The people of the school (idx → who): the parents, the teachers, the Director, the new pupils (ordinary and remarkable). */
export const SCHOOL_PEOPLE = [
    { idx: 1, role: 'farmer', female: false, name: 'Отец', seed: 70101 },
    { idx: 2, role: 'farmer', female: true, name: 'Мама', seed: 70102 },
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
        this._site();
        this.decor = new SchoolDecor(game, this.plan); // (the Great Hall's floating candles and candelabras — SchoolDecor.js)
        this._placeHero(this.plan.arrive);
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
            people: SCHOOL_PEOPLE.map((p) => ({ ...p, home: -1, stall: -1, brave: 0.4 })),
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

    /** A line said by a person (its voice, its bubble). */
    _say(v, text, s = 5) { if (v && !v.dead) this.game.castleLife?._say?.(v, text, s, true, true); }

    /** Is the hero held still (riding, listening to the Director)? */
    get frozen() { return this.phase === 'ride' || this.phase === 'speech'; }

    // ------------------------------------------------------------------ the scene
    update(dt) {
        if (!this.plan || !(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        this.t += dt;
        this.decor?.update(dt, this.t);
        const g = this.game, P = this.plan;
        switch (this.phase) {
            case 'ride': return this._ride(dt);
            case 'gate': return this._gate(dt);
            case 'walk': return this._walk(dt);
            case 'speech': return this._speech(dt);
            case 'free': return this._free(dt);
            default: void g; void P;
        }
    }

    /** The carriage up the road; the hero on its front bench, the parents beside. */
    _ride(dt) {
        const g = this.game, P = this.plan, C = g.carriages;
        if (!C) { this._toGate(); return; }
        if (!this.cart) {
            if (this.t < 0.5) return; // (the land under the road first)
            const a = P.arrive;
            this.cart = C.spawn(false, a.x, a.z + 4, 0, { id: 'school-cart' });
            this.cart.chest?.mesh && (this.cart.chest.mesh.visible = false); // (no treasure chest: a family's cart)
            this.t = 0;
        }
        const c = this.cart;
        // the parents on their seats (when the place has woken and they are made)
        const dad = this.people.get(1) || this._person(1, P.arrive), mum = this.people.get(2) || this._person(2, P.arrive);
        if (dad && !dad.rode) { dad.rode = true; dad.seatedOn = 1; } // (the driver's place)
        if (mum && !mum.rode) { mum.rode = true; mum.seatedOn = 4; } // (a side bench)
        // the hero on the front bench (kept there: he rides)
        const sp = C.seatPos(c, 1, this._hs || (this._hs = {}));
        const me = g.character.group.position;
        me.set(sp.x, sp.y + PLAYER_GROUND_OFFSET - 0.55, sp.z);
        g.character.verticalVelocity = 0;
        if (!this._saidStart && this.t > 2 && mum) { this._saidStart = true; this._say(mum, 'Смотри, вот он — Акселдорф! Ты будешь здесь учиться целый год.', 6); }
        if (!this._saidMid && this.t > 12 && dad) { this._saidMid = true; this._say(dad, 'Слушайся учителей и не бойся. Мы тобой гордимся.', 6); }
        const gx = P.gate.x, gz = P.gate.z + 9;
        const left = C.drive(c, gx, gz, c.wreck ? 0 : 4.5, dt);
        if (left < 2.5 || c.wreck || this.t > 90) this._toGate();
    }

    /** At the gates: the hero gets down, the parents say goodbye; the teacher and the pupils wait there. */
    _toGate() {
        const g = this.game, P = this.plan, C = g.carriages, c = this.cart;
        this.phase = 'gate'; this.t = 0;
        const ex = c ? C.exitPos(c, 1, {}) : { x: P.gate.x + 2, y: P.F, z: P.gate.z + 6 };
        this._placeHero({ x: ex.x, y: (ex.y ?? P.F) + 0.5, z: ex.z }, 0);
        const G = P.gate, F = P.F + 0.5;
        // the teacher of potions meets them; the new pupils stand in a loose half-ring inside the gates
        const tea = this._person(22, { x: G.x, y: F, z: G.z - 6 }, Math.PI);
        if (tea) tea.lookAt = 'hero';
        const pupils = SCHOOL_PEOPLE.filter((p) => p.role === 'student');
        pupils.forEach((p, k) => {
            const a = -1.1 + (k / (pupils.length - 1)) * 2.2;
            const v = this._person(p.idx, { x: G.x + Math.sin(a) * 9, y: F, z: G.z - 10 - Math.cos(a) * 3 }, Math.PI);
            if (v) v.lookAt = tea || 'hero';
        });
        for (const i of [1, 2]) { const v = this.people.get(i); if (v) { v.seatedOn = 0; v.lookAt = 'hero'; } }
    }

    _gate(dt) {
        const g = this.game, P = this.plan, C = g.carriages, c = this.cart;
        const dad = this.people.get(1), mum = this.people.get(2), tea = this.people.get(22);
        if (this.t > 1 && !this._bye) { this._bye = true; this._say(mum, 'Ну вот, приехали. Учись хорошо и пиши нам!', 5); }
        if (this.t > 6 && !this._bye2) { this._bye2 = true; this._say(dad, 'До встречи, волшебник! Мы приедем за тобой через год.', 5); }
        // the parents back on the carriage and away down the road
        if (this.t > 10 && c && !this._away) { this._away = true; if (dad) dad.seatedOn = 1; if (mum) mum.seatedOn = 4; }
        if (this._away && c) {
            const back = P.arrive;
            const left = C.drive(c, back.x, back.z + 160, 4.5, dt, {});
            if (left < 10 || this.t > 70) { for (const v of [dad, mum]) if (v) { v.scripted = false; try { g.castleLife._deactivate(v); } catch { /* gone */ } } C.remove(c); this.cart = null; }
        }
        if (this.t > 11 && !this._welcome && tea) { this._welcome = true; this._say(tea, 'Добро пожаловать в Акселдорф! Я — профессор Ирма Вельтон. Теперь ты наш ученик. Идём, все в большой зал!', 8); }
        if (this.t > 18 && this._welcome) this._startWalk();
    }

    /** The teacher leads the pupils round the fountain into the hall; a glowing circle at its door for the hero. */
    _startWalk() {
        const P = this.plan, F = P.F + 0.5;
        this.phase = 'walk'; this.t = 0;
        const door = P.hall.door, fx = P.fountain.x, fz = P.fountain.z;
        const way = (dx) => [{ x: fx + dx, y: F, z: fz + 4 }, { x: fx + dx * 0.6, y: F, z: door.z + 1 }, { x: door.x, y: F, z: door.z - 4 }];
        const tea = this.people.get(22);
        if (tea) { tea.lookAt = null; const w = way(-9); tea.goal = { ...w[0], next: [...w.slice(1), { x: P.hall.dais.x - 5, y: P.F + 2.5, z: P.hall.dais.z + 1, yaw: 0 }] }; }
        // the pupils: to their places along the tables
        const pupils = SCHOOL_PEOPLE.filter((p) => p.role === 'student'), T = P.hall.tables;
        pupils.forEach((p, k) => {
            const v = this.people.get(p.idx);
            if (!v) return;
            v.lookAt = null;
            const tb = T[k % T.length], z = tb.z0 + 4 + Math.floor(k / T.length) * 5, side = (k % 2 ? -1.5 : 1.5);
            const w = way(k % 2 ? -9 : 9);
            v.goal = { ...w[0], next: [...w.slice(1), { x: tb.x + side, y: F, z, yaw: 0 }] };
        });
        this._goal(door);
        // the teachers and the Director on the dais (they are there already: in the hall all the time)
        const D = P.hall.dais;
        const dir = this._person(20, { x: D.x, y: P.F + 2.5, z: D.z - 1 }, 0); if (dir) dir.lookAt = { x: D.x, z: D.z + 40 };
        [21, 23, 24].forEach((i, k) => { const v = this._person(i, { x: D.x + (k - 1) * 4 + (k >= 1 ? 4 : 0), y: P.F + 2.5, z: D.z + 1 }, 0); if (v) v.lookAt = { x: D.x, z: D.z + 40 }; });
    }

    _walk() {
        const P = this.plan, me = this.game.character.group.position;
        const H = P.hall;
        const inHall = me.x > H.x0 && me.x < H.x1 && me.z > H.z0 && me.z < H.z1;
        if (inHall && this.t > 3) { this._goal(null); this.phase = 'speech'; this.t = 0; this._line = 0; }
    }

    /** The Director's speech: line by line; the pupils listen facing the dais. */
    _speech() {
        const dir = this.people.get(20);
        if (this.t < 2) return;
        const k = Math.floor((this.t - 2) / 6.5);
        if (k > this._line - 1 && this._line < SPEECH.length && k >= this._line) { this._say(dir, SPEECH[this._line], 6); this._line++; }
        if (this._line >= SPEECH.length && this.t > 2 + SPEECH.length * 6.5 + 3) this.phase = 'free'; // (part 2: the dormitory, the schedule)
    }

    /**
     * Free time and the lessons. Part 2 (days, sleep, the schedule) will say WHEN; for now the month's lessons follow one another
     * a little after the speech / the last lesson (the engine is one for all — SchoolLesson.js).
     */
    _free(dt) {
        if (this.lesson && !this.lesson.done) return this.lesson.update(dt);
        if (this.lesson?.done) { (this.record.attended ||= []); if (this.lesson.attended) this.record.attended.push(this.lesson.L.id); this.lesson = null; this.t = 0; }
        const next = lessonsOfMonth(this.month).find((l) => !this.record.seen.includes(l.id));
        if (next && this.t > 8) { this.record.seen.push(next.id); this.lesson = new SchoolLesson(this, next.id); }
    }
    get month() { return this.record.month; }
    get record() { return this._rec || (this._rec = { month: 1, seen: [], attended: [] }); }

    /** The pupils of the school (made ones). */
    pupilsOf() { return SCHOOL_PEOPLE.filter((p) => p.role === 'student').map((p) => this.people.get(p.idx)).filter((v) => v && !v.dead); }

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
        if (this.cart) { try { this.game.carriages?.remove(this.cart); } catch { /* gone */ } this.cart = null; }
    }
}
