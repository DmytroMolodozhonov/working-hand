// The actual ground-rise geometry and actual solid edits, frozen at three moments.
export default async function (h) {
    const g = h.g, T = h.THREE;
    h.bare(); h.time(.42);
    const feet = g.character.group.position.clone(); feet.y -= 1.5;
    let at;
    for (let i=0;i<8;i++) {
        const f = { x: Math.sin(i*Math.PI/4), z: Math.cos(i*Math.PI/4) };
        const q = g.breakthrough.prepare(feet,f);
        if (q.plan) { at=q; break; }
    }
    if (!at) throw new Error('No free ground for the real wall');
    g.paused = true;
    g.breakthrough.grow(at.o,at.d,g.localId,at.plan);
    const task = g.spells.spells.at(-1), step=task.onUpdate;
    task.onUpdate=()=>{};
    const side = new T.Vector3(-at.d.z,0,at.d.x);
    const eye=at.o.clone().addScaledVector(at.d,-11).addScaledVector(side,9); eye.y+=7;
    const look=at.o.clone();look.y+=2;
    h.cam(eye.toArray(),look.toArray());
    for (const [name,dt] of [['rising-ground',.18],['half-raised',.27],['solid-wall',.6]]) {
        step(task,dt);
        await h.shot(name,{settle:0});
    }
    h.log('wall',at.plan.cols.length,'columns',at.plan.cells.length,'cells; no push or damage');
}
