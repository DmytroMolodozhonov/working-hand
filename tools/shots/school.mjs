// «Школа Акселдорф» (SchoolLand.js): the castle from the road, from the air, the courtyard, the great hall inside, a classroom.
//   node tools/shot.mjs school --mode school
export default async function (h) {
    const g = h.g;
    h.log('school', !!g.school, 'hero', [g.character.group.position.x, g.character.group.position.z].map(Math.round));
    const shots = [
        ['1-road', [0, 30, 200], [0, 40, 40]],
        ['2-air', [-170, 150, 210], [0, 30, -10]],
        ['3-air-north', [150, 120, -230], [0, 30, -10]],
        ['4-courtyard', [0, 26, 44], [0, 32, -20]],
        ['5-hall', [0, 27, -32], [0, 26, -72]],
        ['6-hall-dais', [8, 30, -60], [0, 24, -76]],
        ['7-lake', [160, 40, 140], [0, 35, -10]],
    ];
    for (const [n, cam, at] of shots) {
        await h.go(cam[0], cam[1], cam[2]);
        h.cam(cam, at);
        await h.shot(n, { settle: 40 });
    }
}
