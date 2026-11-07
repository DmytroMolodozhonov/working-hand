/**
 * SchoolLesson.js — ONE engine for every lesson of «Акселдорф» (the rows: SchoolLessons.js; docs/rules/school.md).
 *   call   — the hero is told (a line on the screen + a glowing circle at the room's door); the teacher and the pupils go to the room;
 *   gather — waits for the hero in the room (he may not come: after CALL_WAIT the lesson is missed — not counted);
 *   intro  — the teacher's words (the hero in the room → the lesson is ATTENDED: counted, whatever he does next — the author);
 *   demo   — the teacher shows it; teach — the spell is given (`bonus.spells`); task — the hero tries `times` times; outro.
 * What may go wrong (handled):
 *   - the hero walks out after he came: the teacher is indignant, the lesson is still counted and ends for him (the author);
 *   - the hero never does the task: no end-less wait — after TASK_GIVE_UP the teacher ends it kindly («потренируйтесь сами»);
 *   - the teacher cannot cast (no wand, knocked down, not facing): the charge is tried again; after a while the task step is passed;
 *   - the teacher is hurt / frozen / dead: the lesson is cut short — counted if the hero came;
 *   - the hero dies / the game is left mid-lesson: the next start begins the lesson again (part 2 keeps the record).
 */
import { lessonById, SUBJECTS } from './SchoolLessons.js';

const CALL_WAIT = 240;     // (s: the room waits for the hero this long, then the lesson is missed)
const TASK_GIVE_UP = 150;  // (s: the task is not done in this long — the teacher ends it)
const LINE_S = 5.5;        // (s: one line of the teacher, then the next)

export class SchoolLesson {
    constructor(school, id) {
        this.school = school;
        this.game = school.game;
        this.L = lessonById(id);
        this.S = SUBJECTS[this.L?.subject] || null;
        this.room = this.S && school.plan.rooms[this.S.room];
        this.phase = this.L && this.room ? 'call' : 'done';
        this.t = 0;
        this.attended = false; this.left = false; this.done = this.phase === 'done';
        this.ok = 0; this.tries = 0;
        this.line = 0;
        this._bolt = null;
    }

    get teacher() { return this.school.people.get(this.S.teacher) || null; }

    /** Inside the room (its walls, a little in from them)? */
    _inRoom(p) { const R = this.room; return !!p && p.x > R.x0 && p.x < R.x1 && p.z > R.z0 && p.z < R.z1; }

    /** The places in the room: the teacher before the far wall, the hero's circle in the middle, the pupils in two rows behind. */
    _spots() {
        const R = this.room, F = this.school.plan.F + 0.5, cx = (R.x0 + R.x1) / 2;
        const front = R.z0 + 4, mid = R.z0 + 12;
        return {
            teacher: { x: cx, y: F, z: front, yaw: Math.PI }, // (facing the class: +z)
            hero: { x: cx, y: F, z: mid },
            pupils: [-6, -3, 3, 6].flatMap((dx) => [{ x: cx + dx, y: F, z: mid + 3 }, { x: cx + dx, y: F, z: mid + 6.5 }]),
        };
    }

    _hint(text) { if (text) this.game.hud?.setVoice?.(text, true); }
    _say(text, s = LINE_S) { this.school._say(this.teacher, text, s); }

    update(dt) {
        if (this.done) return;
        this.t += dt;
        const me = this.game.character.group.position, here = this._inRoom(me), tea = this.teacher;
        if (this.attended && !here && !this.left && this.phase !== 'outro') { // (walked out: indignant, still counted)
            this.left = true;
            this._say('Куда вы? Урок ещё не окончен! …Что ж, будем считать, что вы были.', 5);
            return this._finish();
        }
        if (tea?.dead && this.phase !== 'call') return this._finish();
        switch (this.phase) {
            case 'call': return this._call();
            case 'gather': return this._gather(here);
            case 'intro': return this._lines(this.L.intro, 'demo');
            case 'demo': return this._demo(dt);
            case 'task': return this._task(dt);
            case 'outro': if (this.t > LINE_S) this._finish(); return;
        }
    }

    _call() {
        const sp = this._spots(), sc = this.school;
        this._hint(`Начинается урок: ${this.S.name}. Идите в кабинет — светящийся круг покажет дорогу.`);
        const tea = sc._person(this.S.teacher, sp.teacher, sp.teacher.yaw);
        if (tea) { tea.lookAt = null; tea.goal = { ...sp.teacher }; }
        sc.pupilsOf().forEach((v, k) => { const p = sp.pupils[k % sp.pupils.length]; v.lookAt = null; v.goal = { ...p, yaw: 0 }; });
        sc._goal(this.room.door);
        this.phase = 'gather'; this.t = 0;
    }

    _gather(here) {
        if (here) { // (came: the lesson is his — counted)
            this.attended = true;
            const sp = this._spots();
            this.school._goal(sp.hero);
            const tea = this.teacher; if (tea) tea.lookAt = 'hero';
            for (const v of this.school.pupilsOf()) v.lookAt = sp.teacher;
            this.phase = 'intro'; this.t = 0; this.line = 0;
            return;
        }
        if (this.t > CALL_WAIT) { this._hint('Вы пропустили урок.'); this._finish(); }
    }

    /** The teacher says `lines` one after another, then `next`. */
    _lines(lines, next) {
        if (this.t < 1.5) return;
        const k = Math.floor((this.t - 1.5) / LINE_S);
        if (k >= this.line && this.line < lines.length) this._say(lines[this.line++]);
        if (this.line >= lines.length && this.t > 1.5 + lines.length * LINE_S) { this.phase = next; this.t = 0; this.line = 0; }
    }

    _demo() {
        const D = this.L.demo, tea = this.teacher;
        if (this.t < 0.5) return;
        if (!this._shown) {
            this._shown = true;
            if (D.say) this._say(D.say, 6);
            if (D.kind === 'shield' && tea) { tea.shieldT = Math.max(tea.shieldT || 0, 5); tea.fx = (tea.fx || 0) | 1; } // (FX.SHIELD: the shield on his arm — WizardFight)
            if (D.kind === 'cast' && tea) this.school.castAt?.(tea, D.spell, D.at);
        }
        if (this.t > 6.5) {
            if (this.L.spell) this._give(this.L.spell);
            this._say(this.L.teach || this.L.task.say, 6);
            this._hint(this.L.task.hint);
            this.phase = 'task'; this.t = 0;
        }
    }

    /** The spell is the hero's now (as from a scroll: bonus.spells). */
    _give(spell) {
        const g = this.game;
        g.bonus = g.bonus || {};
        if (!g.bonus.spells?.[spell]) g.bonus.spells = { ...(g.bonus.spells || {}), [spell]: true };
    }

    _task(dt) {
        const T = this.L.task, g = this.game;
        if (this.t > TASK_GIVE_UP) { this._say('Ничего, потренируйтесь сами — у вас получится.', 5); return this._outro(); }
        if (T.kind === 'listen') return this._outro();
        if (T.kind === 'cast') { if (this.ok >= T.times) this._outro(); return; } // (counted by onCast)
        if (T.kind === 'block') {
            if (this.t < 6) return; // (his words first: «Я пошлю в вас слабый заряд…»)
            if (this._bolt) { // (a charge in the air: where did it end?)
                const b = this._bolt, gone = !g.duel?.bolts?.has?.(b.id) || b.state !== 'flying';
                if (b.state === 'flying' && g.combat?.shield) b.shielded = true;
                if (!gone && this.t - this._boltAt < 6) return;
                const held = !!b.shielded; // (the shield up while it flew — a shield raised after the blow does not count)
                this._bolt = null; this._next = this.t + 3.5;
                if (held) { this.ok++; this._say(T.good[(this.ok - 1) % T.good.length], 2.5); } else { this._say(T.miss[this.tries % T.miss.length], 3.5); this._hint(T.hint); }
                this.tries++;
                if (this.ok >= T.times) { this._next = Infinity; this._outroAt = this.t + 2.5; }
                return;
            }
            if (this._outroAt && this.t > this._outroAt) return this._outro();
            if (this.t < (this._next || 0)) return;
            const tea = this.teacher;
            if (!tea || tea.dead || tea.noWand) { if (this.t > 40) this._outro(); return; }
            this._say(T.spell === 'Jolt' ? 'Джолт!' : T.spell, 1.5);
            const b = this.school.castAtHero?.(tea, T.spell);
            if (b) { this._bolt = b; this._boltAt = this.t; } else this._next = this.t + 1.5; // (not facing yet / no clear line: a moment later)
        }
    }

    /** The hero cast a spell (Game → School.onCast). */
    onCast(name) {
        if (this.phase !== 'task' || this.L.task.kind !== 'cast') return;
        if (name === this.L.task.spell) { this.ok++; const T = this.L.task; this._say(T.good?.[(this.ok - 1) % (T.good?.length || 1)] || 'Хорошо!', 2.5); }
    }

    _outro() { if (this.phase === 'outro') return; this._say(this.L.outro, 6); this.phase = 'outro'; this.t = 0; }

    _finish() {
        this.done = true; this.phase = 'done';
        this.school._goal(null);
        const tea = this.teacher; if (tea) tea.lookAt = null;
        if (this.attended) this._hint(`Урок засчитан: ${this.S.name}.`);
    }
}
