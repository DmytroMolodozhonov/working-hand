/**
 * FastMath.js — `Math.hypot` without the garbage. The built-in one is ~4× slower than this and, called from code
 * that is not yet optimized, makes heap numbers on every call: the people's walking, the sea, the ships and the
 * crowd call it thousands of times a frame — a good part of the game's garbage, and so of the browser's clean-ups
 * (a short freeze now and then).
 *
 * The numbers are EXACTLY the built-in's (V8 scales by the biggest and sums the squares with a running
 * compensation; this is the same arithmetic, step for step): the worlds made before come out the same to the last
 * bit (tests/unit/sea.test.js keeps old worlds exact). Two and three numbers only; anything else — one number,
 * four or more, zero, NaN, infinity — goes to the built-in one.
 * Imported by the world (Terrain.js: the main thread and the workers get the very same numbers).
 */
const hypot = Math.hypot;

if (!Math.hypot.fast) {
    const fast = function (a, b, c, d) {
        if (b !== undefined && d === undefined) {
            a = a < 0 ? -a : a;
            b = b < 0 ? -b : b;
            let max = a > b ? a : b;
            if (c === undefined) {
                if (max > 0 && max < Infinity) {
                    const n1 = a / max, n2 = b / max;
                    let sum = n1 * n1, comp = 0, s = n2 * n2 - comp, p = sum + s;
                    comp = (p - sum) - s; sum = p;
                    return Math.sqrt(sum) * max;
                }
            } else {
                c = c < 0 ? -c : c;
                if (c > max) max = c;
                if (max > 0 && max < Infinity) {
                    const n1 = a / max, n2 = b / max, n3 = c / max;
                    let sum = n1 * n1, comp = 0, s = n2 * n2 - comp, p = sum + s;
                    comp = (p - sum) - s; sum = p;
                    s = n3 * n3 - comp; p = sum + s; sum = p;
                    return Math.sqrt(sum) * max;
                }
            }
        }
        return hypot.apply(Math, arguments);
    };
    fast.fast = true;
    Math.hypot = fast;
}
