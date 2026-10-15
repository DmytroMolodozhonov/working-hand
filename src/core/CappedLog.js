/**
 * CappedLog.js — a «what happened» list (the systems keep one for the tests and the hand recording)
 * that keeps only its last `max` entries: played for hours, such a list must not grow without end.
 * An ordinary array otherwise (filter/map/slice give ordinary arrays).
 */
export class CappedLog extends Array {
    static get [Symbol.species]() { return Array; }

    constructor(max = 200) {
        super();
        this.max = max;
    }

    push(...items) {
        super.push(...items);
        if (this.length > this.max) this.splice(0, this.length - this.max);
        return this.length;
    }
}
