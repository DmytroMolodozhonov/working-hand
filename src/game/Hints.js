/**
 * Hints.js — the player is always told WHAT happened and WHY, in one short line.
 *
 * Only words: nothing here changes a rule of the game, it only explains it.
 *   knockCause(kind)    why I am lying on the ground (a blast, a push, «Сапира», a knight, a fall…)
 *   knockMessage(…)     the line shown when I am thrown off my feet
 *   lyingMessage(…)     the line while I lie and may get up
 *   refusal(code, d)    why a recognized spell did not work (hand down, too fast, «Максима» alone…)
 *   HintGate            the same hint at most once every couple of seconds (the recognizer
 *                       repeats an unfinished phrase many times)
 */

/** Why I fell, by the kind of the blow (BodyImpact / Knockdown `kind`). */
const CAUSES = [
    [/^cannon$/, '💣 Вас отбросило взрывом пушечного ядра'],
    [/^BombardoMaxima$/, '💥 Вас отбросило взрывом «Бомбардо Максима»'],
    [/^Bombardo$/, '💥 Вас отбросило взрывом «Бомбардо»'],
    [/^Sapira/, '💨 Вас сбило заклинанием «Сапира»'],
    [/^Sands/, '🏜️ Вас сбило песком «Даст»'],
    [/^WindImpulse/, '💨 Вас отбросило волной воздуха «Wind Impulse»'],
    [/^Liquidation/, '🫧 В вас попал всплеск «Liquidation»'],
    [/^Wind/, '🌬️ Вас сдуло ветром «Вайнд»'],
    [/^Overgrown/, '🌿 Вас отбросило заклинанием «Overgrown»'],
    [/^WaveAttack/, '🌊 Вас сбило волной'],
    [/^(WaterHit|Waterball)/, '💧 Вас сбило ударом воды'],
    [/^(vortex|WaterVortex)/, '🌀 Вас сбило водоворотом'],
    [/^Thunderwave/, '⚡ Вас сбило громовой волной'],
    [/^(Lightning|LightningStrike)$/, '⚡ Вас сбило молнией'],
    [/^Ward$/, '🛡️ Вас отбросил барьер защиты дома'],
    [/^Expelliarmus$/, '🪄 Вас толкнуло заклинанием «Экспеллиармус»'],
    [/^JoltMaxima$/, '💨 Вас отбросило заклинанием «Джолт Максима»'],
    [/^Jolt$/, '💨 Вас отбросило заклинанием «Джолт»'],
    [/^Stupefy$/, '💫 Вас сбило заклинанием «Остолбеней»'],
    [/^(avada|AvadaKedavra)$/i, '💚 Вас отбросило «Авадой Кедаврой»'],
    [/^Earthquake/, '🌋 Вас сбило землетрясением — земля ушла из-под ног'],
    [/^TotalDestruction/, '🏚️ Вас сбило «Total Destruction» — земля ушла из-под ног'],
    [/^CircleAttack/, '🌟 Вас отбросило волной «Circle Attack»'],
    [/^Inspirius/, '⚡ Вас отбросило взрывом «Inspirius»'],
    [/^(Breakthrough|WallRise)/, '🪨 Вас подбросило каменной стеной'],
    [/^Attack$/, '🗡️ Вас сбил летящий предмет («Атак»)'],
    [/^(IceBall|IceBallBig)$/, '🧊 Вас сбило ледяным шаром'],
    [/^(Inferno|Fire|Hellfire)$/, '🔥 Вас сбило огнём'],
    [/^phoenix$/, '🔥 Вас сбил огненный феникс'],
    [/^knight$/, '⚔️ Вас сбил с ног рыцарь'],
    [/^butt$/, '🐏 Вас боднуло животное'],
    [/^(punch|slap)$/, '👊 Вас сбили с ног ударом'],
    [/^(guard|push)$/, '🤚 Вас толкнули — вы не удержались на ногах'],
    [/^fall$/, '🦵 Вы упали с высоты'],
];

/** The cause of a fall in words (`kind` from the blow; unknown → a plain «сбили с ног»). */
export function knockCause(kind) {
    const k = String(kind || '');
    for (const [re, text] of CAUSES) if (re.test(k)) return text;
    return '💥 Вас сбили с ног';
}

/** The line when I am thrown off my feet: the cause, who did it (a player's name), how long. */
export function knockMessage(kind, { by = '', down = 0 } = {}) {
    let s = knockCause(kind);
    if (by && kind !== 'fall') s += ` (${by})`;
    if (down >= 2) s += ` — лежите ещё ${Math.ceil(down)} с`;
    return s;
}

/** While I lie and may get up: the cause again (the line may have been replaced) and how to get up. */
export function lyingMessage(kind) {
    return `🧍 ${knockCause(kind).replace(/^\S+\s/, '')}. Чтобы встать — присядьте и выпрямитесь`;
}

/**
 * Why a recognized spell did not work (the cases the spell itself does not explain).
 * code: 'handDown' | 'cooldown' | 'maximaAlone' | 'busy' | 'dead' | 'ward…' (the house's protection) | 'lev…' (Leviosa on a wizard)
 */
export function refusal(code, d = {}) {
    const name = d.name ? `«${d.name}»` : 'заклинание';
    switch (code) {
        case 'handDown': return `✋ Не сработало ${name}: рука опущена. Поднимите руку и направьте её на цель`;
        case 'cooldown': return '⏳ Слишком быстро — подождите секунду и скажите ещё раз';
        case 'maximaAlone': return '✨ «Максима» говорится вместе с заклинанием, например «Бомбардо Максима»';
        case 'busy': return `⏳ Уже действует ${name} — сначала скажите «Стоп»`;
        // «Защита дома» (HouseWards.js)
        case 'wardUnknown': return `📘 ${name} — из книги защиты. Сбейте тёмно-синюю книгу-птицу с серебряным щитом огнём («Инферно») или ледяным шаром и прочитайте её`;
        case 'wardNoHand': return `✋ Не сработало ${name}: поднимите руку (или палочку) и направьте её на дом`;
        case 'wardNoHouse': return '🛡️ «Protection House»: направьте руку на то, что хотите защитить, — на дом, сундук, дерево или землю (не дальше 40 м)';
        case 'wardNotYours': return `🛡️ Это не ваш дом — его защита принадлежит игроку ${d.owner || 'другому'}`;
        case 'wardMax': return `🛡️ Сфера уже самая большая (${d.r} м) — скажите «стоп»`;
        case 'wardNoMana': return `😮‍💨 Мана кончилась — сфера осталась ${d.r} м`;
        case 'wardInvNone': return '🛡️ «Protection Invisible» работает только на доме с защитой: сначала «Protection House»';
        case 'wardVisible': return '👁️ Дом снова виден издалека';
        case 'wardBarrier': return '🛡️ Дом защищён — вас не пускает барьер';
        case 'wardBroken': return '🛡️ Защита дома разрушена!';
        case 'wardGrantFar': return '🛡️ «Protection House Grant»: встаньте у своего защищённого дома (или внутри него)';
        case 'wardGrantAim': return '🛡️ «Protection House Grant»: направьте руку на игрока, которого пускаете в дом';
        case 'wardGrantDone': return `🛡️ ${d.who || 'Этот игрок'} уже может входить в ваш дом`;
        // «Вингардиум Левиоса» on another wizard (Levitation.js)
        case 'levMiss': return `🪶 Левиоса не долетела до ${d.who || 'волшебника'} — держите руку (палочку) на нём и скажите ещё раз`;
        case 'levShield': return `🛡️ ${d.who || 'Волшебник'} закрыт щитом «Protection» (или защитой дома) — Левиоса отскочила`;
        case 'levWard': return '🛡️ Левиоса разбилась о защиту дома';
        case 'levHeld': return `🪶 ${d.who || 'Этого волшебника'} уже держит в воздухе другой`;
        case 'levBlocked': return `🪶 Левиоса попала не в ${d.who || 'волшебника'}: на пути был кто-то другой`;
        default: return '';
    }
}

/** One hint at most once per `gap` ms for the same key (an unfinished phrase is heard many times). */
export class HintGate {
    constructor(gap = 2000, now = () => performance.now()) { this.gap = gap; this.now = now; this._at = new Map(); }

    /** True when this hint may be shown now (and remembers that it was). */
    pass(key) {
        const t = this.now(), last = this._at.get(key);
        if (last != null && t - last < this.gap) return false;
        this._at.set(key, t);
        return true;
    }
}
