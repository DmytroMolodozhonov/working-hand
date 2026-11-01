/**
 * Когда существо нельзя убирать из мира (чистые правила, без THREE).
 * Жалоба автора: «поговорил со странником, через пару фраз он пропал». Убрать «по политике» (ушёл далеко, дошёл до дома,
 * дорожная компания вышла из поля зрения) нельзя, пока с ним говорят, и пока игрок рядом и его видит: уйти он может
 * только пешком вдаль. Не вечно: после `WAIT_MS` ожидания — убирается, чтобы мир не копил застрявших.
 */
export const VANISH = {
    TALK_KEEP_MS: 90000, // m: поговорили — это время не убираем
    NOTICED_MS: 5000, // заметил игрока и повернулся к нему
    SEE: 35, // м: ближе этого и на виду — не убираем
    WAIT_MS: 60000, // …но не дольше
};

/** С ним говорят (или говорили только что)? `v.talking` (секунды, ставит CastleTalk), `v.talkedAt`/`v.noticedAt` (мс). */
export function inTalkWith(v, now = performance.now()) {
    return !!v && (v.talking > 0 || now - (v.talkedAt || -1e9) < VANISH.TALK_KEEP_MS || now - (v.noticedAt || -1e9) < VANISH.NOTICED_MS);
}

/**
 * Решение «убирать ли»: `held` — причина, по которой нельзя (или null); `since` — когда началось ожидание.
 * → { go: true|false, held, since }
 */
export function vanishVerdict(v, { watched = false, now = performance.now(), since = null } = {}) {
    const held = inTalkWith(v, now) ? 'с ним говорят' : watched ? 'игрок видит его рядом' : null;
    if (!held) return { go: true, held: null, since: null };
    const s = since ?? now;
    return now - s < VANISH.WAIT_MS ? { go: false, held, since: s } : { go: true, held, since: null };
}
