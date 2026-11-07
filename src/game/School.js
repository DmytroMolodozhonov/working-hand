/**
 * School.js — the mode «Школа Акселдорф» (docs/rules/school.md): a year at the school of magic. Built part by part:
 *   part 1 (now): the valley and the castle (SchoolLand.js), the hero arrives on the road before the gates; nothing else wanders in.
 * Next parts: the arrival in the carriage, the teacher at the gates, the new pupils, the Director's speech in the great hall; the
 * dormitory, the schedule scroll, days and sleep; the lessons of the four subjects; the leaving feast and the way to Survival.
 */
import { SCHOOL, schoolPlan } from '../world/SchoolLand.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

export class School {
    constructor(game) {
        this.game = game;
        this.plan = schoolPlan();
        this._quiet();
        this._placeHero(this.plan.arrive);
    }

    /** Nothing but the school: no herds, wild plants, birds, book-birds or bosses wander in. */
    _quiet() {
        const g = this.game;
        for (const k of ['animals', 'flora', 'canaries', 'owls', 'phoenixes', 'spencers', 'dragons', 'plants', 'gargoyles', 'spiders', 'tarons', 'hellPatrol', 'crystals']) if (g[k] && 'enabled' in g[k]) g[k].enabled = false;
        if (g.books) g.books._spawnT = Infinity;
    }

    _placeHero(p, yaw = 0) {
        const g = this.game, me = g.character.group.position;
        me.set(p.x, SCHOOL.G + 0.5 + PLAYER_GROUND_OFFSET + 0.2, p.z);
        g.faceYaw?.(yaw); // (yaw 0: looking north — up the road to the gates)
        g.character.verticalVelocity = 0;
    }

    update(dt) { void dt; }
    dispose() {}
}
