// Замер зоны перекрёстного кармана: левая рука к правому бедру со смещением кисти.
// node tools/pocketsweep.mjs
import { bodyPlaces } from '../src/input/PoseInterpreter.js';
import { frame } from '../tests/e2e/poses.mjs';
const run = (dx, dy, curl) => {
    const f = frame({ arms: 'hang', pocket: 'cross' });
    const lm = f.poseLandmarks;
    lm[15] = { ...lm[15], x: lm[15].x + dx, y: lm[15].y + dy };
    const hand = (l) => f.hands.find((h) => h.label === l)?.landmarks;
    return bodyPlaces(lm, curl ? null : hand('Right'), null, 4 / 3, false).pocket.off;
};
for (const curl of [false, true]) {
    console.log(curl ? 'руки не видно (в кармане):' : 'кисть видна:');
    for (let dy = -0.12; dy <= 0.121; dy += 0.04) {
        let row = (dy >= 0 ? '+' : '') + dy.toFixed(2) + ' | ';
        for (let dx = -0.12; dx <= 0.121; dx += 0.03) row += run(dx, dy, curl) ? '#' : '.';
        console.log(row);
    }
}
