/**
 * OffHandRelease.js — letting go with the OFF hand (the one that is not the leading one), anywhere, as easy as
 * over a buyer's counter (BuyerDeal.BuyerGate). The author: «у друга в правой щит, а в левой он пытался разжать
 * кисть — палочка не выпадала… взять функцию от торговца». Any thing (a wand too) in that hand falls when the hand
 * is held out, the fingers are really open, the hand is still, for a moment — and only if the fingers were SEEN
 * closed on it a moment before (a pinch the camera keeps seeing open lets nothing go). Pure logic.
 */

export const OFF_DROP = {
    OPEN: 0.4, // fingers this open (tracked curl) …
    WAND_OPEN: 0.3, // … a wand (held in a pinch): really open
    HOLD_MS: 300, // … for this long
    REACH: 0.6, // the hand this far from the shoulder (× the arm's length)
    FORWARD: 0.25, // cos of the arm to the body's front
    LEVEL: -0.7, // not a hanging arm (sin of the elevation)
    STILL: 2.5, // m/s against the body (not in a swing)
    HELD_MS: 600, // in the hand at least this long
    CLOSED: 0.5, // the fingers seen closed this far …
    CLOSED_MS: 1500, // … this soon before they opened
    LOG_MS: 2500, // a refusal is written to the journal this seldom
};

export class OffGate {
    constructor() { this.reset(); }
    reset() { this.since = -1; this.closedAt = -1e9; this.logAt = -1e9; }

    /**
     * @param {object} s  now (ms), curl, tracked, reach, forward, up, speed, heldMs, wand (bool)
     * @returns {{drop:boolean, why:string|null}} drop now; why — the reason it did not (only when the fingers ARE open)
     */
    update({ now, curl, tracked, reach, forward, up = 0, speed = 0, heldMs = 1e9, wand = false }) {
        if (!tracked) { this.since = -1; return { drop: false, why: null }; }
        if (curl > OFF_DROP.CLOSED) this.closedAt = now;
        const open = curl < (wand ? OFF_DROP.WAND_OPEN : OFF_DROP.OPEN);
        if (!open) { this.since = -1; return { drop: false, why: null }; }
        let why = null;
        if (heldMs <= OFF_DROP.HELD_MS) why = 'вещь только что взята';
        else if (reach <= OFF_DROP.REACH) why = `рука не вытянута (${reach.toFixed(2)} < ${OFF_DROP.REACH})`;
        else if (forward <= OFF_DROP.FORWARD) why = `рука не вперёд (${forward.toFixed(2)} < ${OFF_DROP.FORWARD})`;
        else if (up <= OFF_DROP.LEVEL) why = 'рука висит вниз';
        else if (speed >= OFF_DROP.STILL) why = `рука в движении (${speed.toFixed(1)} м/с)`;
        else if (now - this.closedAt > OFF_DROP.CLOSED_MS) why = 'не видно, чтобы пальцы были сжаты на вещи до разжатия';
        if (why) { this.since = -1; return { drop: false, why }; }
        if (this.since < 0) this.since = now;
        return { drop: now - this.since >= OFF_DROP.HOLD_MS, why: null };
    }

    /** May a refusal be written now (throttled)? */
    mayLog(now) { if (now - this.logAt < OFF_DROP.LOG_MS) return false; this.logAt = now; return true; }
}
