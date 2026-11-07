// «Школа Акселдорф» (SchoolLand.js): the castle on its terrace in the world's own land — from the road, the air, the courtyard, the hall.
//   node tools/shot.mjs school --mode school
export default async function (h) {
    const g = h.g;
    const P = g.terrain?.data?.school?.plan;
    h.log('school', !!g.school, 'plan', !!P, P && JSON.stringify({ c: P.centre, F: P.F, arrive: P.arrive }));
    if (!P) return;
    const X = P.centre.x, Z = P.centre.z, F = P.F;
    const shots = [
        ['1-road', [X, F + 12, Z + 150], [X, F + 22, Z]],
        ['2-air', [X - 190, F + 130, Z + 230], [X, F + 10, Z - 10]],
        ['3-air-north', [X + 170, F + 110, Z - 250], [X, F + 10, Z - 10]],
        ['4-courtyard', [X, F + 6, Z + 44], [X, F + 12, Z - 20]],
        ['5-hall', [X, F + 7, Z - 32], [X, F + 6, Z - 72]],
        ['6-side', [X + 260, F + 60, Z + 40], [X, F + 15, Z - 10]],
    ];
    for (const [n, cam, at] of shots) {
        await h.go(cam[0], cam[1], cam[2]);
        h.cam(cam, at);
        await h.shot(n, { settle: 40 });
    }
}
