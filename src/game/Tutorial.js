/**
 * Tutorial.js — «Обучение» (the author 07.11): a small bounded map (TutorialLand.js) where the hero learns the game step by step.
 *
 * On the screen: the list of the stages (1, 2, 3…; the one going on lit, the done ones ticked) and the narrator's words (spoken by the
 * game's voice and written under it at once). Every step is checked by what the player really does (never a timer — the idea file's
 * rule): the step's words, then the game waits for the deed; no deed for a while — a hint. Something goes wrong (the wand dropped where
 * it must not be, the thing lost, the hero falls in the fight) — that part begins again from its start, with everything put back.
 * The hero stands frozen (can't walk) all the time but the walking stage — «наша задача контролировать игрока»; only the spells the step
 * teaches work (and «стоп»): nothing else can be done by chance.
 *
 *   1 Камера, микрофон и свет   2 Как смотреть   3 Руки и палочка   4 Предметы   5 Люмос и Нокс   6 Интерфейс и мана   7 Защита
 *   8 Ходьба и бег   9 Покупка   10 Дуэль с волшебником   11 Бой с зомби   12 Цель игры
 *
 * What may go wrong (handled): the hero dies (Combat.die → `intercept`: health back, the stage again); the wand / a thing falls on the
 * ground (the step again, the thing given back); the player says other words (only the step's spell works — the rest is told «сейчас
 * нужно…»); the camera is lost a while (the steps wait; the camera stage says what is wrong); leaves to the menu (nothing is saved —
 * the next time it starts anew); the voice of the game is off (the words are still written); a left-hander (said by voice: the setting
 * changes at once — the hands are mirrored); the zombies or the wizard far away or stuck (they are put back at the stage's start).
 */
import * as THREE from 'three';
import { TUTORIAL } from '../world/TutorialLand.js';
import { BLOCK } from '../world/Terrain.js';
import { starterWand, rollWand, newUid } from './ItemTypes.js';
import { makePiece } from './ArmorTypes.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { marketDef, buildMarketStall } from './CreativeMarket.js';

const _v = new THREE.Vector3();

export const TUT = {
    HINT_AFTER: 22, // s without the deed — the hint
    VOICE_KEY: 'tutorial-narrator',
    HILL_HIT: 4, // blocks: one «Бомбардо» that knocks this much off the hill counts (the author: the first one was not counted — a quarter of the hill was asked)
    ZOMBIE_HP_FLOOR: 4, // the hero below this in the fight — the stage again
    WIZ_SITE: 'tutorial-wizard',
    MARKET: { id: 'tutorial-market', at: { x: 20, z: 0 }, coins: 150 }, // (the stall right of the hero: its buyer's place ~(20, 3.5))
    SAY_MAX: 110, // chars: a longer line is told in pieces (the voice gets lost in long ones — the author)
};

/** The stages (for the list on the screen); the steps of each are made by the Tutorial (they need the game). */
export const STAGE_TITLES = ['Камера, микрофон и свет', 'Как смотреть', 'Руки и палочка', 'Предметы', 'Люмос и Нокс', 'Интерфейс и мана', 'Защита', 'Ходьба и бег', 'Покупка', 'Дуэль с волшебником', 'Бой с зомби', 'Цель игры'];

/** Words the narrator understands as «правша» / «левша». */
export function heardHand(text) {
    const t = String(text || '').toLowerCase();
    if (/левш|левая|левой|левую/.test(t)) return 'left';
    if (/правш|правая|правой|правую/.test(t)) return 'right';
    return null;
}

/** A narrator's line in pieces of whole sentences, each at most TUT.SAY_MAX long (a lone longer sentence — split at its commas). */
export function splitSay(text, max = TUT.SAY_MAX) {
    const sent = String(text || '').match(/[^.!?…]+[.!?…]+[»"]?\s*|[^.!?…]+$/g) || [];
    const out = [];
    let cur = '';
    const push = (x) => { x = x.trim(); if (x) out.push(x); };
    for (let t of sent) {
        t = t.trim();
        if (t.length > max) { push(cur); cur = ''; let part = ''; for (const c of t.split(/(?<=,)\s+/)) { if (part && (part + ' ' + c).length > max) { push(part); part = c; } else part = part ? part + ' ' + c : c; } push(part); continue; }
        if (cur && (cur + ' ' + t).length > max) { push(cur); cur = t; } else cur = cur ? cur + ' ' + t : t;
    }
    push(cur);
    return out;
}

export class Tutorial {
    constructor(game) {
        this.game = game;
        this.stage = 0; this.step = 0;
        this.t = 0; // s in this step
        this.frozen = true;
        this.allowed = new Set();
        this.done = false;
        this.ctx = {}; // the step's own state
        this.heard = []; // the player's phrases this step
        this.events = []; // (cast names this step)
        this.spawned = []; // uids of things given this stage
        this._said = '';
        this._quiet();
        this.stages = this._makeStages();
        this._ui();
        this._start(0);
    }

    /** Nothing but the lesson on the meadow: no herds, wild plants, birds, book-birds or bosses wander in (the author: «максимально убираем всё лишнее»). */
    _quiet() {
        const g = this.game;
        for (const k of ['animals', 'flora', 'canaries', 'owls', 'phoenixes', 'spencers', 'dragons', 'plants', 'gargoyles', 'spiders', 'tarons', 'hellPatrol', 'crystals']) if (g[k] && 'enabled' in g[k]) g[k].enabled = false;
        if (g.books) g.books._spawnT = Infinity; // (book-birds: never come)
    }

    // ------------------------------------------------------------------ the place
    get spawn() { const S = TUTORIAL.SPAWN; return { x: S.x, z: S.z }; }
    _placeHero() {
        const g = this.game, me = g.character.group.position, S = this.spawn;
        me.set(S.x, TUTORIAL.G + 0.5 + PLAYER_GROUND_OFFSET + 0.2, S.z);
        g.faceYaw?.(0);
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
    }
    /** Where the hero looks, flat (the camera's way; north at the start). */
    _viewDir() {
        const cam = this.game.camera, d = new THREE.Vector3(0, 0, -1);
        if (cam?.getWorldDirection) { cam.getWorldDirection(d); d.y = 0; if (d.lengthSq() < 1e-4) d.set(0, 0, -1); }
        return d.normalize();
    }
    /** A point `d` m before the hero where he looks now (`side` to his right), at hand's height. */
    _frontOfView(d, side = 0) {
        const p = this.game.character?.group?.position, f = this._viewDir();
        const x = (p?.x ?? this.spawn.x) + f.x * d - f.z * side, z = (p?.z ?? this.spawn.z) + f.z * d + f.x * side;
        return new THREE.Vector3(x, TUTORIAL.G + 1.6, z);
    }
    /** A point `d` m behind the hero's place (he faces north there: south of him). */
    _behind(d) { const S = this.spawn; return new THREE.Vector3(S.x, TUTORIAL.G + 1.6, S.z + d); }
    /** Has the hero turned to the apple behind him (it straight before his eyes)? */
    _facingBack() {
        const L = this.game.items?.loose?.get?.(this.ctx.apple), p = this.game.character?.group?.position;
        const at = L?.model?.position || this._behind(8), f = this._viewDir();
        const dx = at.x - (p?.x ?? 0), dz = at.z - (p?.z ?? 0), n = Math.hypot(dx, dz) || 1;
        return (f.x * dx + f.z * dz) / n > 0.85;
    }
    /** A point `d` m before the hero (north, towards the hill), on the ground. */
    _front(d, side = 0) { const S = this.spawn; return new THREE.Vector3(S.x + side, TUTORIAL.G + 1.6, S.z - d); }

    // ------------------------------------------------------------------ things
    _give(item, at) {
        const g = this.game;
        this.spawned.push(item.uid);
        const L = g.items?.spawnLoose?.(item, at, { broadcast: false, hover: true });
        return L;
    }
    _isLoose(uid) { return !!this.game.items?.loose?.has?.(uid); }
    _heldUid(uid) { const h = this.game.items?.held; return !!(h && (h.left?.item.uid === uid || h.right?.item.uid === uid)); }
    _held(kind) { return this.game.items?.heldOf?.(kind) || null; }
    _inPocket(uid) { return !!this.game.inventory?.slots?.some((s) => s?.uid === uid); }
    _clearGiven() {
        const it = this.game.items;
        for (const uid of this.spawned) if (it?.loose?.has?.(uid)) it.removeLoose(uid);
        this.spawned.length = 0;
    }
    /** The wand in a pocket (not in a hand, not on the ground): the hero's first one. */
    _wandToPocket() {
        const g = this.game, inv = g.inventory, it = g.items;
        for (const side of ['left', 'right']) if (it?.held?.[side]?.item.kind === 'wand') it.releaseHand(side);
        for (const [uid, L] of it?.loose || []) if (L.item?.kind === 'wand') it.removeLoose(uid);
        if (!inv.slots.some((s) => s?.kind === 'wand')) { const i = inv.slots.findIndex((s) => !s); if (i >= 0) inv.slots[i] = { ...starterWand() }; }
        inv._render?.();
    }
    _wandInHand() { return this.game.items?.held?.[this.game.dom]?.item.kind === 'wand'; }

    // ------------------------------------------------------------------ the stages and their steps
    _makeStages() {
        const g = this.game, T = this;
        const say = (text, extra = {}) => ({ say: text, ...extra });
        const wait = (s) => ({ done: () => T.t > s });
        const ask = (text, done, extra = {}) => ({ say: text, done, act: true, ...extra }); // (act: the player's turn — «✋ Ваш ход» once the narrator is done)
        const W = { show: 'wand', point: 'wand' }; // (the wand's cell lit, the red arrow at the belt in the camera's window)
        const P = { show: 'pocket', point: 'pocket' }; // (the pockets lit, the arrow at the pocket)
        return [
            { title: STAGE_TITLES[0], steps: [
                { ...say('Добро пожаловать! Это обучение. Здесь вы научитесь всему, что нужно в игре. Слушайте и делайте, что я говорю. Не торопитесь.'), ...wait(8) },
                ask('Встаньте перед камерой так, чтобы она видела вас хотя бы по пояс. Камера должна стоять на уровне груди, прямо перед вами.', () => T._seenFor('body', 2.5), { hint: 'Камера вас пока не видит. Отойдите на шаг-два назад и встаньте прямо перед ней. Проверьте, что камера включена.' }),
                ask('Теперь поднимите обе руки перед собой, ладонями к камере, и подержите их так.', () => T._handsFor(3), { hint: 'Я плохо вижу ваши руки. Чаще всего мешает свет. Включите яркий свет: пусть он падает на вас спереди, а не из окна за спиной.', check: () => T._lightCheck() }),
                ask('Хорошо видно! Теперь проверим микрофон. Скажите вслух: «Меня хорошо слышно».', () => T.heard.length > 0, { hint: 'Я вас не слышу. Проверьте, что микрофон включён и выбран в настройках. Скажите чуть громче.' }),
                { ...say('Отлично: и видно, и слышно. Играйте при хорошем свете — тогда игра лучше понимает ваши руки.'), ...wait(6) },
            ] },
            { title: STAGE_TITLES[1], steps: [
                { ...say('Смотреть по сторонам нужно только головой. Плечи и туловище держите прямо, лицом к камере.'), ...wait(6) },
                ask('Медленно поверните голову влево, а потом вправо.', () => T._looked('side'), { hint: 'Поворачивайте именно голову, как будто смотрите через плечо. Туловище не двигайте.' }),
                ask('Теперь посмотрите вверх, а потом вниз.', () => T._looked('up'), { hint: 'Поднимите подбородок, потом опустите его к груди.' }),
                { ...say('Прекрасно. Если долго смотреть в одну сторону, мир сам плавно повернётся туда.'), ...wait(5) },
            ] },
            { title: STAGE_TITLES[2], steps: [
                ask('Скажите, вы правша или левша? Скажите вслух: «Я правша» или «Я левша».', () => !!T.ctx.hand, { hint: 'Просто скажите: «Я правша» — или «Я левша».', hear: (t) => T._setHand(t) }),
                ask('Поднимите руки перед собой и пошевелите пальцами. Руки в игре повторяют ваши настоящие руки — каждый палец.', () => T._handsFor(4), { hint: 'Держите руки перед камерой, на уровне груди.' }),
                { ...say('Основная рука держит палочку. Вторая рука — дочерняя: она берёт и кладёт вещи.'), ...wait(5) },
                ask('Достаньте палочку. Она заткнута за пояс спереди, ближе к дочерней руке. Посмотрите вниз. Основной рукой дотянитесь через живот до другой стороны пояса и сожмите пальцы на палочке.', () => T._wandInHand(), { setup: () => T._wandToPocket(), ...W, hint: 'Смотрите вниз, на пояс. В окне камеры справа внизу красная стрелка показывает, куда тянуть основную руку. Дотянитесь и сожмите пальцы.' }),
                ask('Перед вами — небольшая горка. Вытяните руку с палочкой прямо на неё и скажите: «Бомбардо».', () => T._hillBlown(), { allow: ['Bombardo'], setup: () => T._hillCount(), hint: 'Рука с палочкой должна смотреть на горку. Скажите чётко: «Бом-бар-до».', fail: () => (!T._wandHeldOrPocket() ? 'Палочка выпала из руки' : null) }),
                ask('Получилось! Теперь уберите палочку. Посмотрите вниз и поднесите её к поясу, туда же, откуда взяли, кончиком вниз. Подержите секунду.', () => !T._held('wand') && T.game.inventory.slots.some((s) => s?.kind === 'wand'), { ...W, hint: 'Смотрите вниз. Палочка — к поясу спереди, кончиком вниз, и подержите там секунду.', fail: () => (T._wandOnGround() ? 'Палочка упала на землю' : null) }),
            ], onFail: () => T._wandToPocket() },
            { title: STAGE_TITLES[3], steps: [
                ask('Достаньте палочку, как раньше: посмотрите вниз и возьмите её основной рукой с пояса.', () => T._wandInHand(), { setup: () => T._wandToPocket(), ...W, hint: 'Основная рука — через живот к другой стороне пояса, и сожмите пальцы.' }),
                ask('Повернитесь кругом: за вашей спиной лежит яблоко. Поворачивайте голову и смотрите в ту сторону, пока не увидите его прямо перед собой.', () => T._facingBack(), { setup: () => { T.ctx.apple = T._give({ kind: 'redApple', uid: newUid(), count: 1 }, T._behind(8))?.item?.uid; }, hint: 'Посмотрите через плечо и подержите голову повёрнутой — мир сам повернётся. Яблоко сзади.', fail: () => T._lost(T.ctx.apple) }),
                ask('Вот яблоко. Поднимите основную руку с палочкой — из неё летит заклинание. Дочернюю руку тоже поднимите и раскройте ладонь — в неё прилетит вещь. Скажите: «Акцио».', () => !!T._heldUid(T.ctx.apple), { allow: ['Accio'], hint: 'Обе руки подняты, ладонь дочерней руки раскрыта. Скажите: «Акцио».', fail: () => T._lost(T.ctx.apple), redo: 1 }),
                ask('Яблоко у вас. Зажмите кисть, чтобы его держать, и поднесите ко рту. Подержите у рта — вы его съедите.', () => T.ctx.ate, { setup: () => { T._hurtABit(); T.ctx.hp0 = T._hp(); }, tick: () => { if (!T._heldUid(T.ctx.apple) && !T._isLoose(T.ctx.apple) && T._hp() > T.ctx.hp0) T.ctx.ate = true; }, hint: 'Кулак с яблоком — к самому рту, и подождите секунду.', fail: () => (T._isLoose(T.ctx.apple) ? 'Яблоко упало' : null), redo: 2 }),
                ask('Теперь притяните хлеб: «Акцио».', () => T._heldUid(T.ctx.bread) || T._inPocket(T.ctx.bread), { allow: ['Accio'], setup: () => { T.ctx.bread = T._give({ kind: 'bread', uid: newUid(), count: 1 }, T._frontOfView(8, -2))?.item?.uid; }, hint: 'Рука с палочкой — на хлеб, дочерняя ладонь раскрыта. «Акцио».', fail: () => T._lost(T.ctx.bread) }),
                ask('Положите хлеб в карман. Карман — на поясе со стороны основной руки. Посмотрите вниз, дотянитесь туда дочерней рукой с хлебом и разожмите кисть.', () => T._inPocket(T.ctx.bread), { ...P, hint: 'Смотрите вниз. Дочерняя рука — к другому боку пояса, туда, где красная стрелка в окне камеры. Разожмите кисть.', fail: () => T._lost(T.ctx.bread) }),
                { ...say('Так же вещи достают из кармана: пустая дочерняя рука — к карману, и вещь окажется в руке.'), ...wait(6), ...P },
                ask('Это шлем. Притяните его: «Акцио». Чтобы надеть, НЕ разжимая кисть, прикоснитесь шлемом к голове.', () => T.game.armor?.worn?.helmet?.uid === T.ctx.helm, { allow: ['Accio'], setup: () => { T.ctx.helm = T._give(makePiece('helmet'), T._frontOfView(8, 2))?.item?.uid; }, hint: 'Кулак со шлемом — к макушке, и подержите. Кисть не разжимайте, иначе шлем упадёт.', fail: () => T._lost(T.ctx.helm) }),
                ask('Это рюкзак. Притяните его: «Акцио». Рюкзак надевается за спину: заведите руку с ним за плечо и подержите там.', () => T.game.items?.worn?.backpack?.item?.uid === T.ctx.pack || T.game.inventory?.back?.some((s) => s?.uid === T.ctx.pack), { allow: ['Accio'], setup: () => { T.ctx.pack = T._give({ kind: 'backpack', uid: newUid(), slots: 3, color: 0x7a4a24 }, T._frontOfView(8, -2))?.item?.uid; }, hint: 'Рука с рюкзаком — через плечо назад, за голову, и подержите там секунду.', fail: () => T._lost(T.ctx.pack) }),
                { ...say('За спину кладутся и другие большие вещи: лук, стрелы, меч, щит, топор. Для них за спиной две ячейки. Вот они.'), ...wait(7), show: 'back-cells' },
                ask('Теперь научимся выбрасывать вещь. Притяните сыр: «Акцио». Потом бросьте его: замахнитесь и киньте. Или просто вытяните руку вперёд и разожмите кисть.', () => T.ctx.cheeseHeld && T._isLoose(T.ctx.cheese), { allow: ['Accio'], setup: () => { T.ctx.cheeseHeld = false; T.ctx.cheese = T._give({ kind: 'cheese', uid: newUid(), count: 1 }, T._frontOfView(8, 2))?.item?.uid; }, tick: () => { if (T._heldUid(T.ctx.cheese)) T.ctx.cheeseHeld = true; }, hint: 'Сначала поймайте сыр. Потом киньте его, как мяч. Или вытяните руку вперёд и раскройте ладонь.' }),
                ask('Вот вторая палочка. Притяните её в дочернюю руку: «Акцио».', () => T._held('wand') && T._twoWands(), { allow: ['Accio'], setup: () => { if (!T._wandInHand()) T._wandToPocket(); T.ctx.wand2 = T._give({ ...rollWand(), uid: newUid() }, T._frontOfView(8))?.item?.uid; }, hint: 'Основная рука с первой палочкой поднята, дочерняя раскрыта. «Акцио».', fail: () => T._lost(T.ctx.wand2) }),
                ask('Теперь поменяем палочки руками. Сведите их так, чтобы они коснулись друг друга. В месте касания посыплются искры, как песок. Держите палочки вместе, пока они не поменяются.', () => T.game.items?.held?.[T.game.dom]?.item.uid === T.ctx.wand2, { hint: 'Палочки должны именно касаться друг друга, а не просто скреститься в воздухе. Когда посыплются искры — не двигайте руками полторы секунды.' }),
                { ...say('Палочки поменялись. Так можно быстро взять более сильную палочку для боя.'), ...wait(5) },
            ], onFail: () => T._clearGiven() },
            { title: STAGE_TITLES[4], steps: [
                ask('Поднимите руку с палочкой и скажите: «Люмос». На кончике палочки загорится свет.', () => !!T.game.wandMagic?.light, { allow: ['Lumos', 'LumosMaxima'], setup: () => { if (!T._held('wand')) T._wandToPocket(); }, hint: 'Палочка в руке, рука поднята. Скажите: «Лю-мос». Если палочки нет в руке — возьмите её с пояса.' }),
                ask('Свет горит. Он нужен в пещерах и ночью. Чтобы погасить, скажите: «Нокс».', () => !T.game.wandMagic?.light, { allow: ['Nox', 'Lumos', 'LumosMaxima'], hint: 'Скажите: «Нокс».' }),
            ] },
            { title: STAGE_TITLES[5], steps: [
                { ...say('Посмотрите вниз экрана. Это ваши карманы: в них лежат вещи.'), ...wait(6), show: 'hotbar' },
                { ...say('А это ячейки за спиной — для больших вещей.'), ...wait(5), show: 'back-cells' },
                { ...say('Синяя полоса — мана. Каждое заклинание тратит ману. Потом она понемногу восстанавливается сама.'), ...wait(8), show: ['fatigue-container', 'mana-cur'] },
                { ...say('Главное в игре — ячейки маны. Это вторая цифра: сколько маны у вас всего. Чем больше ячеек, тем сильнее заклинания вам доступны.'), ...wait(10), show: 'mana-max' },
                { ...say('За каждое новое заклинание, которое вы произнесёте впервые, дают ячейки маны. Поэтому пробуйте все заклинания, которые знаете.'), ...wait(9), show: 'mana-max' },
                { ...say('Красная полоса — здоровье. Еда возвращает его.'), ...wait(5), show: 'hp-container' },
                { ...say('Справа вверху — ваши монеты. Их находят в пещерах и сундуках. На них покупают вещи и свитки у торговцев.'), ...wait(8), show: 'coin-counter' },
                ask('Ещё одно полезное заклинание. Перед вами свиток. Направьте на него палочку и скажите: «Раскрой свои секреты». Вы узнаете, что это за вещь.', () => T.events.includes('Reveal'), { allow: ['Reveal'], setup: () => { if (!T._held('wand')) T._wandToPocket(); T.ctx.scroll = T._give({ kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Fireworks' }, T._frontOfView(7))?.item?.uid; }, hint: 'Палочка смотрит на свиток. Скажите: «Раскрой свои секреты».' }),
                { ...say('Так можно узнать, что за вещь перед вами, прежде чем её взять. Остальное о мире можно прочитать в главном меню, во вкладке «Механика игры».'), ...wait(9) },
            ], onFail: () => T._clearGiven() },
            { title: STAGE_TITLES[6], steps: [
                ask('Теперь защита. Скрестите руки на груди — появится щит «Protection». Он закрывает вас от заклинаний и ударов.', () => !!T.game.combat?.shield, { allow: ['Protection'], hint: 'Скрестите предплечья перед грудью, крест-накрест, и подержите. Руки должны быть видны камере.' }),
                { ...say('Щит держится, пока есть мана: он тратит её каждую секунду. Каждое отбитое заклинание отнимает ещё. Кончится мана — щит разобьётся.'), ...wait(9), allow: ['Protection'] },
                { ...say('Поэтому поднимайте щит, когда в вас летит заклинание, а не держите его всё время.'), ...wait(5), allow: ['Protection'] },
                ask('Снимите щит: опустите руки или скажите «стоп».', () => !T.game.combat?.shield, { allow: ['Protection'], hint: 'Разведите руки в стороны и опустите их. Или скажите: «Стоп».' }),
            ] },
            { title: STAGE_TITLES[7], steps: [
                ask('Теперь вы можете ходить. Шагайте на месте, поднимая колени, — герой пойдёт туда, куда вы смотрите. Пройдите немного вперёд.', () => T._walked(12), { unfreeze: true, setup: () => { T.ctx.from = T.game.character.group.position.clone(); }, hint: 'Шагайте на месте, как будто идёте: колени поднимаются, руки двигаются.' }),
                ask('А теперь бегите: шагайте быстрее и активно машите руками.', () => T.ctx.runT > 1.5, { unfreeze: true, tick: (dt) => { const ch = T.game.character; T.ctx.runT = ch?.isRunning && (T._speed() > 6) ? (T.ctx.runT || 0) + dt : Math.max(0, (T.ctx.runT || 0) - dt); }, hint: 'Чаще шаги и широкие махи руками — герой побежит.' }),
                { ...say('Отлично! Если кто-то идёт на вас, а вы стоите к нему лицом и шагаете, герой будет отходить назад, не поворачиваясь спиной.'), ...wait(8), unfreeze: true },
            ], onStart: () => T._placeHero() },
            { title: STAGE_TITLES[8], steps: [
                ask('Теперь — покупка. Справа от вас стоит прилавок торговца. Подойдите к нему.', () => T._atStall(), { unfreeze: true, setup: () => { T._market(); T._giveCoins(); }, hint: 'Повернитесь направо и шагайте к прилавку с полосатым навесом. Встаньте прямо перед ним.' }),
                ask('Достаньте мешочек с монетами. Он висит на поясе там же, где карман. Посмотрите вниз, дотянитесь туда дочерней рукой и сожмите кулак.', () => !!T._pouchHeld() || T._pouchOnCounter(), { unfreeze: true, ...P, hint: 'Монеты достаются только рядом с торговцем. Смотрите вниз, дочерняя рука — к карману, и сожмите кулак, а не раскрытую ладонь.' }),
                ask('Положите мешочек на прилавок: вытяните над ним руку и разожмите кисть.', () => T._pouchOnCounter() || T._bought(), { unfreeze: true, hint: 'Рука с мешочком — над прилавком, и раскройте ладонь.' }),
                ask('Теперь скажите вслух, что хотите купить. Например: «хлеб» или «яблоко». Цена написана на карточке у товара.', () => T._bought(), { unfreeze: true, hint: 'Назовите товар, который лежит на прилавке. Торговец возьмёт плату и положит сдачу.' }),
                ask('Покупка ваша! Возьмите её с прилавка рукой. Сдачу тоже заберите.', () => T._boughtTaken(), { unfreeze: true, hint: 'Протяните руку к купленной вещи на краю прилавка и сожмите кисть.' }),
                { ...say('Так покупают всё: еду, зелья, свитки, оружие. А ненужные вещи можно продать торговцу.'), ...wait(6), unfreeze: true },
            ] },
            { title: STAGE_TITLES[9], steps: [
                { ...say('Теперь — дуэль. Перед вами появится волшебник-ученик. Он не опасен, но будет бросать в вас заклинания.'), ...wait(6), setup: () => T._placeHero() },
                { ...say('Выучим главное дуэльное заклинание — «Экспеллиармус». Оно выбивает палочку из рук врага.'), ...wait(5), setup: () => { if (!T._held('wand')) T._wandToPocket(); T._spawnWizard(); }, tick: () => T._wizardKeep() },
                ask('Поднимите руку с палочкой на волшебника и скажите: «Экспеллиармус». Когда ваш луч столкнётся с его лучом, держите руку на нём и давите, пока не победите.', () => T._wizardBeaten(), { allow: ['Expelliarmus', 'Stupefy', 'Ice', 'Frozen', 'Protection', 'Stand'], setup: () => { if (!T._held('wand')) T._wandToPocket(); T._spawnWizard(); }, tick: () => T._wizardKeep(), hint: 'Рука с палочкой смотрит на волшебника. «Экс-пел-ли-ар-мус». В столкновении лучей держите руку ровно на нём.', fail: () => (T._hp() <= TUT.ZOMBIE_HP_FLOOR ? 'Волшебник оказался сильнее' : null) }),
                { ...say('Победа! Волшебник побеждён. В настоящих дуэлях противники сильнее — тренируйтесь.'), ...wait(6), setup: () => T._wizardGone() },
            ], onFail: () => { T._wizardGone(); T._heal(); } },
            { title: STAGE_TITLES[10], steps: [
                { ...say('Последнее испытание — зомби. Они медленные, но опасны вблизи.'), ...wait(5), setup: () => { T._placeHero(); T._heal(); } },
                ask('Зомби идут к вам! Поднимите руку с палочкой на зомби и скажите: «Фрозен». Заклинание заморозит его. Заморозьте всех.', () => T._zombiesDone(), { allow: ['Frozen', 'Ice', 'IceMaxima', 'Protection', 'Stand'], setup: () => { if (!T._held('wand')) T._wandToPocket(); T._spawnZombies(); }, hint: 'Рука на ближайшего зомби, скажите: «Фро-зен». Если подошли близко — скрестите руки, это щит.', fail: () => (T._hp() <= TUT.ZOMBIE_HP_FLOOR ? 'Зомби подошли слишком близко' : null) }),
                { ...say('Все зомби заморожены. Вы справились!'), ...wait(4) },
            ], onFail: () => { T._clearZombies(); T._heal(); } },
            { title: STAGE_TITLES[11], steps: [
                { ...say('Обучение почти закончено. Цель игры — победить боссов.'), ...wait(4), show: 'bosses' },
                { ...say('Есть боссы земного уровня: король, глава башни волшебников, гигантская паучиха, дракон, Ледяная Королева, капитан Чёрные Усы и другие.'), ...wait(9), show: 'bosses' },
                { ...say('А есть боссы божественного уровня — титаны на других планетах.'), ...wait(5), show: 'bosses' },
                { ...say('Главный совет: не бросайтесь в бой сломя голову. Сначала учите заклинания. Свитки с ними находят в пещерах и в сундуках, а ещё покупают на рынке за монеты.'), ...wait(11), show: 'bosses' },
                { ...say('Перед каждым боем и каждой встречей продумайте план.'), ...wait(4), show: 'bosses' },
                { ...say('Обучение пройдено. Удачи, волшебник!'), ...wait(4), show: 'finish' },
            ] },
        ];
    }

    // ------------------------------------------------------------------ checks
    _pose() { return this.game.currentPose || null; }
    _results() { return this.game.poseService?.lastResults || null; }
    _seenFor(what, s) {
        const r = this._results(), ok = !!(r?.poseLandmarks?.length || this._pose());
        this.ctx.seen = ok ? (this.ctx.seen || 0) + this._dt : 0;
        return this.ctx.seen >= s;
    }
    _handsFor(s) {
        const r = this._results();
        const both = !!(r?.leftHandLandmarks?.length && r?.rightHandLandmarks?.length);
        this.ctx.handsT = (this.ctx.handsT || 0) + (both ? this._dt : -this._dt * 0.3);
        this.ctx.handsT = Math.max(0, this.ctx.handsT);
        return this.ctx.handsT >= s;
    }
    /** The camera's picture brightness (0…255) from its video, if the game has it; null when it has none (the native camera). */
    _brightness() {
        const v = this.game.poseService?.videoElement;
        if (!v || !(v.videoWidth > 0) || typeof document === 'undefined') return null;
        try {
            const c = this._cv || (this._cv = Object.assign(document.createElement('canvas'), { width: 16, height: 12 }));
            const x = c.getContext('2d', { willReadFrequently: true });
            x.drawImage(v, 0, 0, 16, 12);
            const d = x.getImageData(0, 0, 16, 12).data;
            let s = 0;
            for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            return s / (d.length / 4);
        } catch { return null; }
    }
    _lightCheck() {
        this.ctx.lightT = (this.ctx.lightT || 0) - this._dt;
        if (this.ctx.lightT > 0) return;
        this.ctx.lightT = 2;
        const b = this._brightness();
        if (b != null && b < 55 && !this.ctx.toldDark) { this.ctx.toldDark = true; this._narrate('Слишком темно: камера плохо видит. Включите свет. Лучше, чтобы он падал на вас спереди, а не из окна за спиной.'); }
    }
    _looked(kind) {
        const h = this.game.smoothHead;
        if (!h) return false;
        const c = this.ctx;
        c.min = Math.min(c.min ?? 0, kind === 'side' ? h.yaw : h.pitch);
        c.max = Math.max(c.max ?? 0, kind === 'side' ? h.yaw : h.pitch);
        // (the body turned instead of the head: told once)
        const body = this._pose()?.bodyRotation;
        if (Number.isFinite(body)) { c.body0 ??= body; if (Math.abs(body - c.body0) > 0.45 && !c.toldBody) { c.toldBody = true; this._narrate('Не поворачивайте туловище — только голову.'); } }
        return kind === 'side' ? c.max > 0.4 && c.min < -0.4 : c.max > 0.3 && c.min < -0.25;
    }
    _setHand(text) {
        const h = heardHand(text);
        if (!h) return false;
        this.ctx.hand = h;
        if (typeof document !== 'undefined') { const el = document.getElementById('handedness'); if (el) { el.value = h; el.dispatchEvent(new Event('change')); } }
        if (this.game.settings) this.game.settings.leftHanded = h === 'left';
        this._narrate(h === 'left' ? 'Запомнила: вы левша. Основная рука — левая.' : 'Запомнила: вы правша. Основная рука — правая.');
        return true;
    }
    _hillCells() {
        const d = this.game.terrain?.data, H = TUTORIAL.HILL, out = [];
        if (!d?.get) return out;
        for (let x = Math.floor(H.x - H.r); x <= Math.ceil(H.x + H.r); x++) for (let z = Math.floor(H.z - H.r); z <= Math.ceil(H.z + H.r); z++) for (let L = TUTORIAL.G + 1; L <= TUTORIAL.G + H.h + 1; L++) out.push([x, L, z]);
        return out;
    }
    _hillSolid() { const d = this.game.terrain?.data; let n = 0; for (const [x, L, z] of this._hillCells()) if (d.get(x, L, z) && d.get(x, L, z) !== BLOCK.WATER) n++; return n; }
    _hillCount() { this.ctx.hill0 = this._hillSolid(); }
    /** One «Бомбардо» that hit the hill (a few blocks off it) is enough. */
    _hillBlown() {
        if (!(this.ctx.hill0 > 0)) { this._hillCount(); return false; } // (the land was not there yet at the step's start: counted now)
        return this.ctx.hill0 - this._hillSolid() >= TUT.HILL_HIT;
    }
    _wandOnGround() { for (const L of this.game.items?.loose?.values?.() || []) if (L.item?.kind === 'wand') return true; return false; }
    _wandHeldOrPocket() { return !!this._held('wand') || this.game.inventory.slots.some((s) => s?.kind === 'wand'); }
    _twoWands() { const h = this.game.items?.held; return h?.left?.item.kind === 'wand' && h?.right?.item.kind === 'wand'; }
    /** A thing given for this step is gone (fell and rolled off, lost): → why (the step again) or null. */
    _lost(uid) { if (!uid) return null; const g = this.game; if (this._heldUid(uid) || this._isLoose(uid) || this._inPocket(uid) || g.armor?.worn?.helmet?.uid === uid || g.items?.worn?.backpack?.item?.uid === uid || g.inventory?.back?.some?.((s) => s?.uid === uid)) return null; return 'Вещь пропала'; }
    _hp() { const c = this.game.combat; return c?.enabled ? c.hp : this.game.playerHP; }
    _hurtABit() { const c = this.game.combat; if (c?.enabled) { c.hp = Math.max(1, (c.maxHp || 20) - 6); c._hudKey = ''; this.game.playerHP = c.hp; } else this.game.playerHP = Math.max(1, (this.game.maxHP || 20) - 6); }
    _heal() { const c = this.game.combat; if (c) { c.hp = c.maxHp || c.hp; c.dead = false; c._hudKey = ''; c.fatigue = c.maxFatigue; } this.game.playerHP = this.game.maxHP; }
    _speed() { const v = this.game.character?.velocity; return v ? Math.hypot(v.x || 0, v.z || 0) : 0; }
    _walked(m) { const f = this.ctx.from, p = this.game.character.group.position; return !!f && Math.hypot(p.x - f.x, p.z - f.z) >= m; }

    // ------------------------------------------------------------------ the market (CreativeMarket's stall, the city merchant's own deal)
    _marketDef() { return this.game.castleLife?.castles?.get?.(TUT.MARKET.id)?.def || this._mdef || null; }
    _market() {
        const g = this.game, M = TUT.MARKET;
        if (this._mdef || !g.castleLife) return;
        const F = g.collision?.groundY ? g.collision.groundY(M.at.x, M.at.z) : TUTORIAL.G + 0.5;
        this._mdef = marketDef(F, { at: M.at, id: M.id });
        try { buildMarketStall(g, this._mdef); } catch (e) { console.warn('tutorial market', e); }
        g.castleLife.addSite(this._mdef);
    }
    /** Coins in the pouch on the belt for the purchase (never less than M.coins). */
    _giveCoins() {
        const P = this.game.inventory?.purse;
        if (!P) return;
        P.ensure?.();
        if (P.magic && P.count < TUT.MARKET.coins) P.add(TUT.MARKET.coins - P.count);
        this.game.inventory?._render?.();
    }
    _atStall() {
        const st = this._mdef?.stalls?.[0], p = this.game.character?.group?.position;
        return !!(st && p) && Math.hypot(p.x - st.front.x, p.z - st.front.z) < 4;
    }
    _pouchHeld() { const h = this.game.items?.held; return h?.left?.item.kind === 'coins' ? h.left : h?.right?.item.kind === 'coins' ? h.right : null; }
    _pouchOnCounter() { const d = this._marketDef(), t = this.game.castleLife?.talk; try { return !!(d && t?._counterCoins?.(d, 0)?.length); } catch { return false; } }
    /** A good of the tutorial's stall paid (its uid kept: the step after waits for it to be taken). */
    _bought() {
        if (this.ctx.bought) return true;
        const it = this.game.items, key = TUT.MARKET.id + ':s';
        const paid = (x) => x?.shop?.paid && String(x.shop.stall || '').startsWith(key);
        for (const L of it?.loose?.values?.() || []) if (paid(L.item)) { this.ctx.bought = L.item.uid; return true; }
        for (const side of ['left', 'right']) if (paid(it?.held?.[side]?.item)) { this.ctx.bought = it.held[side].item.uid; return true; }
        return false;
    }
    _boughtTaken() { const u = this.ctx.bought; return !!u && (this._heldUid(u) || this._inPocket(u) || !this._isLoose(u)); }

    // ------------------------------------------------------------------ the wizard and the zombies
    _wizDef() {
        const G = TUTORIAL.G + 0.5, at = { x: -14, z: -10 }; // (beside the hill, ~26 m before the hero)
        const spot = { x: at.x, y: G, z: at.z, yaw: Math.PI };
        return {
            id: TUT.WIZ_SITE, kind: 'guest', name: 'Обучение', x: at.x, z: at.z, F: G, zone: 12, gx: 0, gz: 0,
            knights: 0, king: '', population: 1, color: 0x3a3a7a, spot,
            people: [{ idx: 1, role: 'student', female: false, name: 'Ученик Тим', home: -1, stall: -1, seed: 20261107, rank: 'novice', brave: 1, mana: 60 }],
            houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
            nodes: [{ id: 0, x: at.x, y: G, z: at.z, tag: 'guest' }], edges: [],
        };
    }
    _spawnWizard() {
        const life = this.game.castleLife;
        if (!life) return;
        if (!life.extra?.has(TUT.WIZ_SITE)) life.addSite(this._wizDef());
        this.ctx.wizWait = 0;
    }
    /** (each frame) the wizard seated and set on the hero; the fight's end read. */
    _wizardKeep() {
        const g = this.game, life = g.castleLife, cs = life?.castles?.get(TUT.WIZ_SITE);
        if (!cs?.awake) return;
        let v = cs.active.get(1);
        if (!v && !this.ctx.wizMade) {
            this.ctx.wizMade = true;
            life.state?.(TUT.WIZ_SITE)?.killed?.delete?.(1);
            v = life._activate(cs, 1, cs.def.spot, 'stall', { post: cs.def.spot, hp: 14 });
        }
        if (!v) return;
        this.ctx.wiz = v;
        if (v.dead || v.hp <= 0 || v.disarmed || (v.W && v.wandLost)) this.ctx.wizDown = true;
        if (!v.dead && !this.ctx.wizDown) { cs.hostile.set(g.localId, Date.now() + 60000); v.foe = g.localId; }
    }
    _wizardBeaten() { const v = this.ctx.wiz; return !!this.ctx.wizDown || !!(v && (v.dead || v.hp <= 0 || !v.model?.heldTool)); }
    _wizardGone() {
        const life = this.game.castleLife, cs = life?.castles?.get(TUT.WIZ_SITE);
        if (cs) { cs.hostile.clear?.(); const v = cs.active.get(1); if (v) { v.foe = null; try { life._deactivate(v); } catch { /* gone */ } } }
        life?.extra?.delete?.(TUT.WIZ_SITE);
        this.ctx.wiz = null; this.ctx.wizMade = false; this.ctx.wizDown = false;
    }
    _spawnZombies() {
        const g = this.game, Z = TUTORIAL.ZOMBIES;
        this._clearZombies();
        this.zombies = [];
        for (let i = 0; i < Z.n; i++) {
            const a = -Math.PI / 2 + (i - (Z.n - 1) / 2) * 0.35;
            const p = new THREE.Vector3(Math.cos(a) * Z.r, TUTORIAL.G + 1, Math.sin(a) * Z.r);
            const z = g._createZombie?.(p);
            if (z) { z.hunting = true; this.zombies.push(z); }
        }
    }
    _clearZombies() { for (const z of this.zombies || []) if (this.game.zombies.includes(z)) this.game.removeZombie(z); this.zombies = []; }
    _zombiesDone() { return (this.zombies || []).length > 0 && this.zombies.every((z) => z.isDead || z.isFrozen || !this.game.zombies.includes(z)); }

    // ------------------------------------------------------------------ the game asks
    /** May this spell be said now? (only what the step teaches, and «стоп») */
    allows(name) {
        if (this.done) return true;
        if (name === 'Stand' || name === 'Stop') return true;
        return this.allowed.has(name);
    }
    /** A spell was cast. */
    onCast(name) { this.events.push(name); }
    /** A phrase heard (final): true if it was the tutorial's own (not a spell). */
    hear(text) {
        if (this.done) return false;
        this.heard.push(text);
        const st = this._cur();
        if (st?.hear) return !!st.hear(text);
        return false;
    }
    /** The hero would die: health back, the stage again (never a death in the tutorial). */
    intercept() { this._fail('Вы упали без сил'); return true; }

    // ------------------------------------------------------------------ the flow
    _cur() { return this.stages[this.stage]?.steps[this.step] || null; }
    _start(stage) {
        this.stage = stage; this.step = -1;
        this.ctx = { hand: this.ctx?.hand };
        this.spawned.length = 0;
        this.stages[stage]?.onStart?.();
        this._next();
    }
    _next() {
        this.step++;
        const S = this.stages[this.stage];
        if (!S) return;
        if (this.step >= S.steps.length) {
            if (this.stage + 1 >= this.stages.length) { this._finish(); return; }
            this._start(this.stage + 1);
            return;
        }
        this._enter();
    }
    _enter() {
        const st = this._cur();
        this.t = 0; for (const k of ['seen', 'handsT', 'min', 'max', 'body0', 'toldBody', 'runT', 'lightT', 'toldDark']) delete this.ctx[k]; this.heard.length = 0; this.events.length = 0; this.hinted = false; // (the stage's things — the apple, the wand — stay known through its steps)
        this.allowed = new Set(st.allow || []);
        this.frozen = !st.unfreeze;
        this.point = st.point || null; // (the red arrow in the camera's window: 'wand' / 'pocket' — PocketHintsDraw.pointArrow)
        try { st.setup?.(); } catch (e) { console.warn('tutorial setup', e); }
        if (st.say) this._narrate(st.say);
        this._show(st.show || null);
        this._render();
    }
    _fail(why) {
        const S = this.stages[this.stage], st = this._cur();
        try { S.onFail?.(); } catch (e) { console.warn('tutorial fail', e); }
        this._heal();
        this._narrate(`${why}. Ничего страшного — начнём этот шаг сначала.`);
        // (a step that needs the one before (the apple must be caught to be eaten): back that many)
        this.step = Math.max(-1, this.step - 1 - (st?.redo || 0));
        this._failT = 3.5;
    }
    _finish() {
        this.done = true; this.frozen = false; this.allowed = new Set(); this.point = null;
        try { localStorage.setItem('zns-tutorial-done', '1'); } catch { /* private mode */ }
        this._render();
    }

    update(dt) {
        if (!(dt > 0)) return;
        this._dt = dt;
        if (this._failT > 0) { this._failT -= dt; if (this._failT <= 0) this._next(); return; }
        if (this.done) return;
        const st = this._cur();
        if (!st) return;
        this.t += dt;
        this._placeT = (this._placeT || 0) - dt;
        if (this._placeT <= 0) { this._placeT = 0.3; this._place(); }
        this._modeT = (this._modeT || 0) - dt;
        if (this._modeT <= 0) { this._modeT = 0.15; this._mode(); }
        try { st.tick?.(dt); st.check?.(); } catch (e) { console.warn('tutorial tick', e); }
        // (done first: a helmet put on is no longer «in a hand, on the ground or in a pocket» — it is not lost)
        let ok = false;
        try { ok = !!st.done?.(); } catch { ok = false; }
        if (ok) { this.game.sound?.playMagic?.(null, 0.6); this._next(); return; }
        let why = null;
        try { why = st.fail?.() || null; } catch { why = null; }
        if (why) { this._fail(why); return; }
        if (st.hint && !this.hinted && this.t > TUT.HINT_AFTER) { this.hinted = true; this._narrate(st.hint); }
        if (st.hint && this.hinted && this.t > TUT.HINT_AFTER * 2.5) { this.t = TUT.HINT_AFTER; this._narrate(st.hint); } // (again, now and then)
    }

    // ------------------------------------------------------------------ the narrator and the screen
    _narrate(text) {
        const g = this.game;
        if (this._sub) {
            this._sub.innerHTML = '<span class="tut-badge"></span><span class="tut-text"></span>';
            this._sub.querySelector('.tut-text').textContent = text;
            this._sub.classList.remove('tut-in'); void this._sub.offsetWidth; this._sub.classList.add('tut-in');
        }
        this._narrAt = typeof performance !== 'undefined' ? performance.now() : 0;
        this._talkUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + 600 + text.length * 70; // (no voice: as long as it takes to read it out)
        this._mode(true);
        this._said = text;
        const talk = g.castleLife?.talk, sp = talk?.speech;
        try {
            if (sp?.supported) {
                if (!sp.neural?.ready) sp.preload?.();
                // (a long line in pieces of whole sentences: the voice gets lost in a long one — the author)
                splitSay(text).forEach((piece, i) => sp.say(piece, { voiceKey: TUT.VOICE_KEY, role: 'narrator', female: true, volume: 1, reply: true, append: i > 0 }));
            }
        } catch (e) { /* the words are written anyway */ }
    }

    /** The narrator's words: «🔊 Слушайте» while he speaks, «✋ Ваш ход» (green) when the step waits for the player's deed. */
    _mode(force = false) {
        if (!this._sub) return;
        const sp = this.game.castleLife?.talk?.speech, now = performance.now();
        const voice = !!(sp && ((sp._current && sp._current.voiceKey === TUT.VOICE_KEY) || sp._pending?.opts?.voiceKey === TUT.VOICE_KEY));
        // (the voice is being made the first moments; a voice heard before is trusted — else the time to read it out)
        const talking = voice || now < (this._narrAt || 0) + 1500 || (now < (this._talkUntil || 0) && !(sp?.supported && this._heardVoice));
        if (voice) this._heardVoice = true;
        const act = !talking && !!this._cur()?.act && !this.done && !(this._failT > 0);
        const m = act ? 'act' : 'listen';
        if (!force && m === this._m) return;
        this._m = m;
        this._sub.classList.toggle('act', act); this._sub.classList.toggle('listen', !act);
        const b = this._sub.querySelector('.tut-badge');
        if (b) b.textContent = act ? '✋ Ваш ход' : '🔊 Слушайте';
    }

    _ui() {
        if (typeof document === 'undefined') return;
        if (!document.getElementById('tut-style')) {
            const s = document.createElement('style');
            s.id = 'tut-style';
            s.textContent = `
#tut-panel{position:fixed;left:16px;top:96px;z-index:60;width:min(380px,44vw);padding:16px 16px 14px;border-radius:16px;background:linear-gradient(160deg,rgba(26,20,52,.92),rgba(16,12,34,.88));border:1px solid rgba(201,166,74,.45);box-shadow:0 8px 30px rgba(0,0,0,.45);color:#efe6ff;font:17px/1.35 system-ui,sans-serif;pointer-events:none}
#tut-panel h3{margin:0 0 10px;font-size:19px;letter-spacing:.04em;color:#f3d98a}
#tut-panel ol{margin:0;padding:0;list-style:none;counter-reset:s}
#tut-panel li{counter-increment:s;display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:9px;color:rgba(239,230,255,.55)}
#tut-panel li::before{content:counter(s);flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:14px;background:rgba(255,255,255,.08)}
#tut-panel li.done{color:rgba(190,240,200,.8)}#tut-panel li.done::before{content:'✓';background:rgba(90,190,120,.35)}
#tut-panel li.cur{color:#fff;font-weight:700;background:rgba(201,166,74,.22)}#tut-panel li.cur::before{background:#c9a64a;color:#1a1434}
#tut-sub{position:fixed;left:50%;top:max(118px,14vh);transform:translateX(-50%);z-index:61;max-width:min(860px,90vw);padding:12px 18px;border-radius:12px;background:rgba(10,8,24,.78);color:#fff;font:600 19px/1.4 system-ui,sans-serif;text-align:center;text-shadow:0 1px 2px #000;pointer-events:none}
#tut-sub .tut-badge{display:block;width:max-content;margin:0 auto 6px;padding:3px 12px;border-radius:999px;font:800 15px/1.3 system-ui,sans-serif;letter-spacing:.04em}
#tut-sub.listen .tut-badge{background:rgba(120,150,255,.25);color:#cfd9ff}
#tut-sub.act{background:rgba(14,40,20,.86);box-shadow:0 0 0 3px rgba(110,230,140,.85),0 0 24px rgba(110,230,140,.45);animation:tutAct 1s ease-in-out infinite alternate}
#tut-sub.act .tut-badge{background:#5fd27f;color:#06200e}
@keyframes tutAct{from{box-shadow:0 0 0 2px rgba(110,230,140,.5),0 0 10px rgba(110,230,140,.25)}to{box-shadow:0 0 0 4px rgba(110,230,140,1),0 0 30px rgba(110,230,140,.6)}}
#tut-sub.tut-in{animation:tutIn .35s ease-out}@keyframes tutIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.tut-glow{outline:3px solid #f3d98a!important;outline-offset:4px;border-radius:8px;animation:tutGlow 1.2s ease-in-out infinite alternate}@keyframes tutGlow{from{outline-color:rgba(243,217,138,.35)}to{outline-color:rgba(243,217,138,1)}}
#tut-bosses{position:fixed;inset:0;z-index:59;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(8,6,20,.72);pointer-events:none}
#tut-bosses h4{margin:6px 0 2px;color:#f3d98a;font:700 16px system-ui,sans-serif;letter-spacing:.05em}
#tut-bosses .row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:94vw}
#tut-bosses img{width:min(130px,13vw);aspect-ratio:16/10;object-fit:cover;border-radius:8px;border:1px solid rgba(201,166,74,.5);box-shadow:0 4px 14px rgba(0,0,0,.5)}
#tut-finish{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:62;padding:22px 26px;border-radius:16px;background:linear-gradient(160deg,#2a1f55,#16102e);border:1px solid #c9a64a;color:#fff;text-align:center;font:16px system-ui,sans-serif;pointer-events:auto}
#tut-finish h2{margin:0 0 12px;color:#f3d98a}#tut-finish button{margin-top:8px;padding:10px 20px;border-radius:10px;border:0;background:#c9a64a;color:#1a1434;font-weight:700;font-size:15px;cursor:pointer}
@media (max-width:900px){#tut-panel{top:70px;width:46vw;font-size:13px}#tut-panel li::before{flex-basis:22px;height:22px;font-size:12px}}
@media (max-width:640px){#tut-sub{font-size:16px}}
body.tutorial-on #voice-debug.hint{top:calc(max(118px,14vh) + 120px)!important}
.tut-arrow{position:fixed;z-index:63;width:34px;height:46px;pointer-events:none;filter:drop-shadow(0 0 6px rgba(255,40,40,.85)) drop-shadow(0 2px 2px #000);animation:tutBob .7s ease-in-out infinite alternate}
.tut-arrow svg{width:100%;height:100%}.tut-arrow.up{transform:rotate(180deg)}
@keyframes tutBob{from{translate:0 -6px}to{translate:0 4px}}`;
            document.head.appendChild(s);
        }
        const p = document.createElement('div');
        p.id = 'tut-panel';
        p.innerHTML = `<h3>🎓 Обучение</h3><ol>${this.stages.map((s) => `<li>${s.title}</li>`).join('')}</ol>`;
        document.body.appendChild(p);
        const sub = document.createElement('div');
        sub.id = 'tut-sub';
        document.body.appendChild(sub);
        document.body.classList.add('tutorial-on'); // (the game's own hints go a little lower, under the narrator's words)
        this._panel = p; this._sub = sub;
    }
    _render() {
        if (!this._panel) return;
        this._panel.querySelectorAll('li').forEach((li, i) => { li.className = i < this.stage || this.done ? 'done' : i === this.stage ? 'cur' : ''; });
    }
    /** Lights an element of the screen (the pockets, the mana…) with a red arrow at it, the bosses' pictures, the end's window. */
    _show(what) {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
        document.querySelectorAll('.tut-arrow').forEach((e) => e.remove());
        document.getElementById('tut-bosses')?.remove();
        this._shown = [];
        if (!what) return;
        if (what === 'bosses' || what === 'finish') {
            const earth = ['king', 'master', 'spider', 'dragon', 'ice-queen', 'blackbeard'], gods = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
            const b = document.createElement('div');
            b.id = 'tut-bosses';
            b.innerHTML = `<h4>Боссы земного уровня</h4><div class="row">${earth.map((n) => `<img src="assets/bosses/${n}.webp" alt="" onerror="this.remove()">`).join('')}</div>`
                + `<h4>Боссы божественного уровня — титаны</h4><div class="row">${gods.map((n) => `<img src="assets/bosses/titan-${n}.webp" alt="" onerror="this.remove()">`).join('')}</div>`;
            document.body.appendChild(b);
            if (what === 'finish' && !document.getElementById('tut-finish')) {
                const f = document.createElement('div');
                f.id = 'tut-finish';
                f.innerHTML = '<h2>🎓 Обучение пройдено!</h2><div>Теперь вы готовы к настоящей игре.</div><button type="button">В главное меню</button>';
                f.querySelector('button').onclick = () => { this.dispose(); window.__zns?.exitToMenu?.(); };
                document.body.appendChild(f);
            }
            return;
        }
        this._shown = Array.isArray(what) ? what : [what];
        this._place();
    }
    /** The elements a name means: 'wand' — the pocket cell with the wand; 'pocket' — the pockets; else an id. */
    _els(name) {
        const inv = this.game.inventory;
        if (name === 'wand') { const i = inv?.slots?.findIndex?.((x) => x?.kind === 'wand') ?? -1; const c = i >= 0 ? inv.cells?.[i] : null; return c ? [c] : [document.getElementById('hotbar')].filter(Boolean); }
        if (name === 'pocket') return [document.getElementById('hotbar')].filter(Boolean);
        return [document.getElementById(name)].filter(Boolean);
    }
    /** Lights the shown elements and puts a red arrow at each (again now and then: they move, the wand's cell changes). */
    _place() {
        if (typeof document === 'undefined' || !this._shown?.length) return;
        document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
        const arrows = [...document.querySelectorAll('.tut-arrow')];
        let k = 0;
        for (const name of this._shown) for (const el of this._els(name)) {
            el.classList.add('tut-glow');
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 || r.height > 0)) continue;
            const a = arrows[k] || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tut-arrow', innerHTML: '<svg viewBox="0 0 34 46"><path d="M12 0h10v26h12L17 46 0 26h12z" fill="#ff2a2a" stroke="#3a0000" stroke-width="2"/></svg>' }));
            k++;
            const low = r.top + r.height / 2 > innerHeight / 2; // (an element low on the screen: the arrow above it, pointing down)
            a.classList.toggle('up', !low);
            a.style.left = `${Math.round(r.left + r.width / 2 - 17)}px`;
            a.style.top = `${Math.round(low ? r.top - 56 : r.bottom + 10)}px`;
        }
        for (; k < arrows.length; k++) arrows[k].remove();
    }

    dispose() {
        if (typeof document === 'undefined') return;
        for (const id of ['tut-panel', 'tut-sub', 'tut-bosses', 'tut-finish']) document.getElementById(id)?.remove();
        document.querySelectorAll('.tut-arrow').forEach((e) => e.remove());
        document.body.classList.remove('tutorial-on');
        document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
        this._clearZombies?.();
    }
}
