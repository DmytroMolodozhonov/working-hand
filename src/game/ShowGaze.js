// ShowGaze.js — I show something with my leading hand, and the people near look that way (the author 19.11, «я показываю основной рукой, и житель смотрит
// в ту сторону… к любому человекоподобному NPC»). No command, no words: a hand held up and pointing steadily is a gesture people understand.
//
//   the hand   the LEADING hand (g.dom: the wand's hand of a right-hander) raised and held steady — the direction within STEADY rad for HOLD_S s —
//              and pointing at the ground or the horizon, not into the sky. Not while I cast (a spell just said, a held spell, a fight): then the hand
//              is a weapon, not a finger.
//   who        the people of the settlements round me (villagers, knights, wizards, the king…): awake, alive, not fighting, not fleeing, not lifted,
//              within NEAR m — the nearest MAX_VIEWERS. Each turns after his own little pause (REACT_MIN…REACT_MIN+SPAN): the head first (a glance
//              TravelerGaze-style: CastleLife draws `v.glance`), the body after, when he is not busy walking on an order.
//   how long   while I keep pointing it is held; after the hand drops he looks a moment more (GLANCE_S), then goes back to his business.
// A picture on MY computer only (every computer draws its own people's heads: nothing goes over the net — like TravelerGaze). Commands («иди туда»)
// work as before and set their own glance (CommandTalk._begin).
export const SHOW = {
    NEAR: 26, // m: a person this near notices the hand
    HOLD_S: 0.6, // s the hand must be held steady before they look
    STEADY: 0.13, // rad (~7.5°): the direction may drift this much
    GLANCE_S: 2.2, // s a glance lasts after the last refresh (while I keep pointing it is refreshed)
    MAX_VIEWERS: 4,
    REACT_MIN: 0.2, REACT_SPAN: 0.8, // s: each person's own pause before he turns
    LOOK_D: 40, // m: how far along the hand's line the point he looks at is (or the ground, if nearer)
    SKY: 0.6, // a hand pointing higher than this (d.y) points at the sky: nothing to look at
    QUIET_S: 2.5, // s after a spell: the hand is not a pointing finger
    ASSESS_AFTER: 1.2, // s after they looked (the hand still held): the nearest one says what he makes of the place
    ASSESS_R: 11, // m round the point: what he sees there
    SAY_COOL_S: 8, // s: one person does not comment twice that soon
};

const hash = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** Is this direction (unit {x,y,z}) the same as the reference within STEADY rad? */
export function steady(a, b) {
    if (!a || !b) return false;
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    return Math.acos(Math.max(-1, Math.min(1, dot))) <= SHOW.STEADY;
}

/** May this person notice and look (pure)? v: a villager record {dead, sleep, foe, fleeT, lev, seated?, x, z, wizard?}. */
export function canNotice(v, me) {
    if (!v || v.dead || v.sleep || v.foe || v.fleeT > 0 || v.lev || v.climb) return false;
    if (v.savior != null && v.foe) return false;
    const dx = v.x - me.x, dz = v.z - me.z;
    return dx * dx + dz * dz <= SHOW.NEAR * SHOW.NEAR;
}

/** The nearest MAX_VIEWERS people who may notice, with each one's pause. → [{v, delay}] */
export function viewers(list, me) {
    const out = [];
    for (const v of list) if (canNotice(v, me)) out.push({ v, d: (v.x - me.x) ** 2 + (v.z - me.z) ** 2 });
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, SHOW.MAX_VIEWERS).map((o) => ({ v: o.v, delay: SHOW.REACT_MIN + SHOW.REACT_SPAN * hash(o.v.id) }));
}

/** Where they look: along the hand's line SHOW.LOOK_D m (level), or the ground point if that is nearer. → {x, z} */
export function lookPoint(ray, ground = null) {
    const h = Math.hypot(ray.d.x, ray.d.z) || 1;
    const far = { x: ray.o.x + ray.d.x / h * SHOW.LOOK_D, z: ray.o.z + ray.d.z / h * SHOW.LOOK_D };
    if (!ground) return far;
    return Math.hypot(ground.x - ray.o.x, ground.z - ray.o.z) < SHOW.LOOK_D ? { x: ground.x, z: ground.z } : far;
}

/**
 * What the place I show is, as a person sees it (pure over the game's lists). → { kind, n?, pos } with kind: 'zombie' | 'fire' | 'corpse' | 'animal' | 'people' | 'item' | 'house' | 'nothing'.
 * The most important first: a danger before a thing, a thing before an empty place.
 */
export function assessPlace(g, pt, speaker = null, R = SHOW.ASSESS_R) {
    const near = (x, z, r = R) => (x - pt.x) ** 2 + (z - pt.z) ** 2 <= r * r;
    const z = (g.zombies || []).filter((q) => !q.isDead && !q.dummy && q.group && near(q.group.position.x, q.group.position.z));
    if (z.length) return { kind: 'zombie', n: z.length, pos: z[0].group.position };
    const y = g.y ?? 0;
    if (g.fire?.burningAt?.({ x: pt.x, y, z: pt.z }, R) || g.burning?.me?.left > 0 && near(g.character.group.position.x, g.character.group.position.z)) return { kind: 'fire', pos: { x: pt.x, y, z: pt.z } };
    const c = [...(g.death?.bodies?.values?.() || [])].filter((b) => near(b.x, b.z));
    if (c.length) return { kind: 'corpse', n: c.length, pos: { x: c[0].x, y: c[0].y, z: c[0].z } };
    const a = (g.animals?.list || []).filter((q) => !q.dead && q.group?.position && near(q.group.position.x, q.group.position.z));
    if (a.length) return { kind: 'animal', n: a.length, pos: a[0].group.position };
    const people = [...(g.castleLife?.byId?.values?.() || [])].filter((q) => q !== speaker && !q.dead && near(q.x, q.z));
    for (const [, r] of g.remotes || []) if (!r.dead && r.position && near(r.position.x, r.position.z)) people.push(r);
    if (people.length) return { kind: 'people', n: people.length, pos: { x: pt.x, y, z: pt.z } };
    let item = 0;
    for (const L of g.items?.loose?.values?.() || []) { const p = L.model?.position; if (p && !L.item?.shop && near(p.x, p.z, 5)) item++; }
    if (item) return { kind: 'item', n: item, pos: { x: pt.x, y, z: pt.z } };
    for (const cs of g.castleLife?.castles?.values?.() || []) for (const h of cs.def?.houses || []) if (h.c && near(h.c.x, h.c.z, 9)) return { kind: 'house', pos: { x: pt.x, y, z: pt.z } };
    return { kind: 'nothing', pos: { x: pt.x, y, z: pt.z } };
}

/** What he says about it (the words of a villager; one of a few, by his id). `armed`: a knight / a guard. */
export const COMMENTS = {
    zombie: ['Зомби! Там зомби — держитесь от них подальше!', 'Там бродят зомби. Лучше туда не ходить.'],
    fire: ['Там огонь! Надо бы потушить!', 'Горит… Беда, если ветер подует сюда.'],
    corpse: ['Ох… там лежит тело. Не к добру.', 'Там кто-то погиб. Мне тревожно.'],
    animal: ['А, там какая-то скотина. Ничего страшного.', 'Вижу зверя вдали. Пускай себе ходит.'],
    people: ['Там люди — вроде мирные.', 'Вижу кого-то вдалеке, спокойно стоят.'],
    item: ['Там что-то лежит, кажется. Можно подобрать.', 'Вижу какую-то вещь на земле.'],
    house: ['Да, там дом. Ничего необычного.', 'Там строение — крыша видна.'],
    nothing: ['Не вижу там ничего особенного.', 'Там пусто, насколько я вижу.'],
};
export const commentOf = (kind, id) => { const l = COMMENTS[kind] || COMMENTS.nothing; return l[Math.floor(hash('c' + id) * l.length) % l.length]; };

export class ShowGaze {
    /** `game`: the game; `rayOf(side, o, d)`: fills the hand's ray (Duel._myRay); `groundOf(ray)`: the ground point of a ray or null (CommandTalk._ground). */
    constructor(game, rayOf = null, groundOf = null, sayIt = null) {
        this.game = game; this.rayOf = rayOf; this.groundOf = groundOf; this.sayIt = sayIt; // sayIt(person, assessment): his remark (and fear)
        this.ref = null; this.held = 0; this.pending = []; this.on = false; this._t = 0; this.shown = new Set(); this.assessed = false; this.said = new Map();
        this._o = { x: 0, y: 0, z: 0 }; this._d = { x: 0, y: 0, z: 1 };
    }

    /** Why the hand is NOT a pointing finger now (null: it may be). */
    busy() {
        const g = this.game, now = performance.now();
        if (g.isDeadLocal || g.combat?.dead || g.combat?.immobile) return 'не может';
        if (now - (g._castAt || -1e9) < SHOW.QUIET_S * 1000) return 'только что колдовал';
        if (g.focus?.held?.()) return 'держит заклинание';
        if (g.inFight?.()) return 'бой';
        if (g.tutorial?.active && g.tutorial.frozen) return 'обучение';
        return null;
    }

    update(dt) {
        const g = this.game, ch = g.character;
        this._t += dt;
        // (pending turns run every frame: each person's own pause)
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const p = this.pending[i]; p.wait -= dt;
            if (p.wait > 0) continue;
            this.pending.splice(i, 1);
            if (canNotice(p.v, g.character.group.position)) p.v.glance = { x: p.x, z: p.z, t: SHOW.GLANCE_S, show: true };
        }
        if (this._look > 0) { this._look -= dt; if (this._look > 0) return; }
        this._look = 0.1;
        const side = g.dom || 'right';
        if (!ch?.isArmRaised?.(side) || this.busy() || !this.rayOf) { this._reset(); return; }
        this.rayOf(side, this._o, this._d);
        const d = this._d, l = Math.hypot(d.x, d.y, d.z);
        if (!(l > 0.01) || d.y / l > SHOW.SKY) { this._reset(); return; }
        const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
        if (!steady(this.ref, dir)) { this.ref = dir; this.held = 0; this.on = false; this.assessed = false; return; }
        this.held += 0.1;
        if (this.held < SHOW.HOLD_S) return;
        // (held: they look; while I keep it up the glance is refreshed — the point is where the hand points NOW)
        const ray = { o: { x: this._o.x, y: this._o.y, z: this._o.z }, d: dir };
        const pt = lookPoint(ray, this.groundOf ? this.groundOf({ ...ray, hand: true }) : null);
        const list = [...(g.castleLife?.byId?.values?.() || [])];
        const me = ch.group.position;
        for (const { v, delay } of viewers(list, me)) {
            if (v.glance && v.glance.show) { v.glance.x = pt.x; v.glance.z = pt.z; v.glance.t = SHOW.GLANCE_S; continue; } // (already looking: where the hand is now, and held)
            if (v.glance || this.pending.some((p) => p.v === v)) continue; // (a command's glance / his turn is coming)
            this.pending.push({ v, wait: this.on ? 0.05 : delay, x: pt.x, z: pt.z });
        }
        this.on = true;
        // (they looked, the hand is still held: the nearest one says what he makes of the place — once for this pointing)
        if (!this.assessed && this.held >= SHOW.HOLD_S + SHOW.ASSESS_AFTER && this.sayIt) {
            const who = viewers(list, me).map((o) => o.v).find((v) => v.glance?.show && !this.pending.some((p) => p.v === v));
            if (who && (performance.now() - (this.said.get(who.id) || -1e9)) / 1000 > SHOW.SAY_COOL_S) {
                this.assessed = true;
                this.said.set(who.id, performance.now());
                const a = assessPlace(g, pt, who);
                this.sayIt(who, a);
            }
        }
    }

    _reset() { this.ref = null; this.held = 0; this.on = false; this.assessed = false; }
}
