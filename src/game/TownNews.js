/**
 * TownNews.js — what a town knows has happened in it lately (the author: «жители должны знать контекст своего
 * города, недавние события: если кто-то что-то взорвал — они знают и говорят об этом»).
 *
 * Every castle / village / tower keeps a short list of its own news: a blast, a fire, a quake, a monster at the
 * walls, somebody killed (and by whom, if seen), the king fallen and who took the castle, a traveller who struck
 * one of them. Its villagers' net reads the newest few with every question (TalkMind.persona → «В городе
 * недавно: …»), so they talk about what really happened, and know whether the one talking to them did it.
 *
 * Pure (no THREE / DOM): CastleLife tells it what happens (host — it runs the people); the clock is given.
 */

const KEEP = 10; // news kept per town
const SAME = 90e3; // ms: the same kind of thing again this soon is one piece of news («взрывы», «трижды»)
const FORGET = 30 * 60e3; // ms: older news is not told any more

/** How each kind of thing is told (what happened; the place and who come after). */
export const NEWS_RU = {
    blast: ['прогремел взрыв', 'прогремело несколько взрывов'],
    ruin: ['земля задрожала и всё вокруг обрушилось («Тотальное разрушение»)', 'несколько раз всё рушилось от страшной магии'],
    circle: ['золотая волна магии обрушила землю кругами', 'золотые волны магии рушили землю'],
    inspirius: ['светящийся шар взорвался и оставил огромную яму', 'страшные взрывы оставили огромные ямы'],
    boom: ['всё затряслось и разорвалось изнутри — остался огромный кратер', 'земля рвалась изнутри — огромные кратеры'],
    quake: ['земля треснула и встала стеной', 'земля трескалась и вставала стенами'],
    fire: ['был пожар', 'горело в нескольких местах'],
    fall: ['обрушилась крыша, падали камни', 'рушились крыши и стены'],
    spider: ['у города был гигантский паук', 'гигантский паук нападал не раз'],
    zombie: ['к стенам подходили зомби', 'зомби лезли к стенам'],
    attacker: ['кто-то бил и убивал людей', 'кто-то нападал на людей'],
    uproot: ['магия вырвала из земли дом или дерево и подняла в воздух', 'магия вырывала и поднимала в воздух дома и деревья'],
    wreck: ['кто-то ломал стены и дома', 'кто-то ломал стены и дома'],
    hit: ['путник ударил человека', 'путник бил людей'],
    death: ['погиб человек', 'погибли люди'],
    captured: ['король пал — замок захвачен', 'король пал — замок захвачен'],
};

/** «N минут назад» in plain words. */
export function agoRu(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return 'только что';
    const m = Math.round(s / 60);
    if (m < 2) return 'минуту назад';
    if (m < 5) return `${m} минуты назад`;
    if (m < 21) return `${m} минут назад`;
    return 'с полчаса назад';
}

export class TownNews {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.sites = new Map(); // site id → [{kind, at, n, by, byName, seen, who, place}]
    }

    /**
     * Something happened in a town.
     * @param {string} site the town's id
     * @param {string} kind a NEWS_RU key
     * @param {{by?:string|null, byName?:string|null, seen?:boolean, who?:string|null, place?:string|null}} [o]
     *   by: who did it (a player id; only kept with `seen` — nobody knows otherwise); who: whom it befell («стражник Еремей»)
     */
    add(site, kind, { by = null, byName = null, seen = false, who = null, place = null } = {}) {
        if (!site || !NEWS_RU[kind]) return;
        const now = this.now();
        let list = this.sites.get(site);
        if (!list) { list = []; this.sites.set(site, list); }
        // (the same thing again, by the same one, a moment later: one piece of news, told as «several»)
        const last = list.find((e) => e.kind === kind && now - e.at < SAME && (e.seen ? e.by : null) === (seen ? by : null) && (kind !== 'death' || !who || !e.who));
        if (last) { last.n++; last.at = now; if (who && !(last.who || '').split(', ').includes(who)) last.who = last.who ? `${last.who}, ${who}` : who; return; }
        list.push({ kind, at: now, n: 1, by: seen ? by : null, byName: seen ? byName : null, seen: !!seen, who, place });
        while (list.length > KEEP) list.shift();
    }

    /** The newest news of a town, oldest first (forgotten ones dropped). */
    list(site) {
        const list = this.sites.get(site);
        if (!list) return [];
        const now = this.now();
        while (list.length && now - list[0].at > FORGET) list.shift();
        if (!list.length) this.sites.delete(site);
        return list;
    }

    /**
     * The news as the villagers would tell it — for the net. `me`: the player talking (he did it, if seen: «это
     * сделал твой собеседник»). Newest last, at most `n`.
     */
    told(site, me = null, n = 5) {
        const now = this.now();
        return this.list(site).slice(-n).map((e) => {
            const what = NEWS_RU[e.kind][e.n > 1 ? 1 : 0];
            const who = e.who ? ` (${e.kind === 'death' ? 'погиб' + (e.who.includes(',') ? 'ли' : '') + ': ' : ''}${e.who})` : '';
            const by = e.seen ? (e.by && e.by === me ? ' — и это сделал твой собеседник, все видели' : e.byName ? ` — это сделал ${e.byName}` : '') : e.kind === 'captured' ? '' : ' — кто это сделал, никто не видел';
            return `${agoRu(now - e.at)} ${what}${e.place ? ' ' + e.place : ''}${who}${by}`;
        });
    }

    /** A town forgotten (unloaded far away is fine — news is kept; this is for tests and a new world). */
    clear() { this.sites.clear(); }
}
