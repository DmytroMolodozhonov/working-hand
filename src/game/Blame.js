/**
 * Blame.js — who do the people (villagers, knights, the king, wizards, sailors…) think did it?
 * (pure logic: CastleLife and WizardLife ask it.)
 *
 * Nobody reads minds. A person knows the culprit only if he saw it:
 *   - a direct deed (a blow, a charge from the hand, a blast whose charge flew from the hand, a fire
 *     beam): he sees the player — in his sight (the day far, the night near; a wizard sees farther);
 *   - harm through something else (a tree come alive, a servant, a thing thrown by «Левиоса», a
 *     spreading fire, the ground torn by «Drawdown»): only if he saw the cast itself (witnessCast),
 *     or it is plain before his eyes — the player stands right by the thing, steering it with his hand
 *     (OBVIOUS: how near; a wizard understands magic a little better, nobody guesses from afar).
 * Who doesn't know defends himself from the thing itself (the tree, the fire, the flying thing) — and
 * the hidden wanted level (Wanted.js) grows only for what somebody saw.
 *
 * An UNSEEN blast (e.g. «Бомбардо» thrown from a mountain 200 m away, even if it breaks walls): the
 * people panic, the knights go to LOOK AT THE PLACE (`investigate.by` is null — no culprit named, none
 * hunted by position), nobody is wanted, nobody attacks. Builders put the walls back (Rebuild). Suspicion
 * is born only when a knight on the way actually SEES a player near the place (CastleLife._investigate,
 * by sightRange). `by` goes on only to those who `_knows` it (witnesses). Tests: blame-unseen.test.js.
 */

/** Sight (m): how far a person makes out who is there. */
export const SIGHT = { day: 32, night: 14, wizDay: 42, wizNight: 22 };

/**
 * Harm through something else: how near the player must be seen to the thing doing it for it to be
 * plain that it is his (m). 0 — never plain (only a seen cast tells).
 */
export const OBVIOUS = {
    alive: { people: 0, wizard: 8 }, // (a tree attacking: the people think the tree went mad; a wizard sees the one commanding it close by)
    servant: { people: 0, wizard: 6 }, // («Брейнрот»: a friend gone mad)
    leviosa: { people: 10, wizard: 25 }, // (a man with his hand on a flying thing: plain enough near)
    fire: { people: 0, wizard: 0 }, // (a fire that spread: who lit it — only who saw the cast)
    quake: { people: 6, wizard: 18 }, // (the ground torn under a man's pressing hand)
    wind: { people: 12, wizard: 25 }, // (a gust from his hand)
    ritual: { people: 18, wizard: 40 }, // (the pentagram of the gargoyles: the one standing at its circle is plainly the summoner; run away — only a seen ritual names him)
};

/** The family of a spell for the witnesses' memory (a seen «Inferno» explains a fire later). */
export function spellFamily(name) {
    const n = String(name || '');
    if (/^Alive/.test(n)) return 'alive';
    if (/^(Inferno|Fire|Hellfire)/.test(n)) return 'fire';
    if (/^(Drawdown|Earthquake|Breakthrough)/.test(n)) return 'quake';
    if (/Levi/.test(n)) return 'leviosa';
    if (/^Wind/.test(n)) return 'wind';
    if (/^(Brainrot|Imperius)/.test(n)) return 'servant'; // («Империус»: a creature gone mad — its master only a seen cast names)
    return n;
}

/** Sight of a person by day / night. */
export function sightRange(wizard, night) {
    return wizard ? (night ? SIGHT.wizNight : SIGHT.wizDay) : (night ? SIGHT.night : SIGHT.day);
}

/**
 * Does this person know the player did it?
 *   seesPlayer   a free line from his eyes to the player;  dPlayer  how far the player is from him
 *   via          null — direct; else the family of the thing that did it (OBVIOUS)
 *   dSource      how far the player stands from that thing;  sawCast  he saw the player cast it
 */
export function knowsCulprit({ wizard = false, night = false, seesPlayer = false, dPlayer = Infinity, via = null, dSource = Infinity, sawCast = false }) {
    if (via && sawCast) return true;
    if (!seesPlayer || dPlayer > sightRange(wizard, night)) return false;
    if (!via) return true;
    const ob = OBVIOUS[via]?.[wizard ? 'wizard' : 'people'] ?? 0;
    return ob > 0 && dSource <= ob;
}
