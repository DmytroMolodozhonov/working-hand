/** Fireball ignites on contact; it never explodes, digs or creates a beam duel. Burning owns subsequent damage/armour. */
export const FIREBALL_TARGETS={
 players:{does:'ignite',why:'victim computer; ordinary shields extinguish it, fire ward prevents ignition'},
 zombies:{does:'ignite',why:'normal Burning; frozen bodies do not catch ordinary fire'},
 castlePeople:{does:'ignite',why:'ordinary ward and existing fire marks apply; fire mages are immune'},
 animals:{does:'ignite',why:'normal Burning and water extinguishes it'},sailors:{does:'ignite',why:'normal Burning'},
 spider:{does:'none',why:'not a Burning target; no explosive damage'},livingTrees:{does:'burn',why:'wood catches ordinary fire'},
 bookBirds:{does:'none',why:'not a Burning target; this projectile has no blast'},dragon:{does:'none',why:'fireproof'},
 phoenix:{does:'none',why:'fireproof'},iceCastle:{does:'none',why:'this is ignition, not the stronger melting Fire Maxima'},
 ships:{does:'none',why:'no blast; direct wooden terrain may ignite'},items:{does:'none',why:'no blast or item destruction'},
 blocks:{does:'ignite',why:'brief supported flame; ordinary wood may ignite, no terrain destruction'},water:{does:'extinguish',why:'cannot fly through liquid water'},
 gifts:{does:'none',why:'no destructive effect'},space:{does:'ignite',why:'magical fire can be projected; normal target immunity still applies'},
};
/** Closest actual capsule at an impact, one target only. Pooled Duel bodies are never retained. */
export function fireballBody(bodies,p){
 let best=null,dist=Infinity;
 for(const b of bodies){if(b.kind==='p')continue;const dx=b.b.x-b.a.x,dy=b.b.y-b.a.y,dz=b.b.z-b.a.z,L=dx*dx+dy*dy+dz*dz;
 const u=L?Math.max(0,Math.min(1,((p.x-b.a.x)*dx+(p.y-b.a.y)*dy+(p.z-b.a.z)*dz)/L)):0;
 const d=Math.hypot(p.x-b.a.x-dx*u,p.y-b.a.y-dy*u,p.z-b.a.z-dz*u)-b.r;
 if(d<=.35&&d<dist){best=b;dist=d;}}
 return best;
}
