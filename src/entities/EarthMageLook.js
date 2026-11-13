/** Layered mineral/olive travelling clothes; box details merge into the existing GPU-skinned villager parts. */
const add=(B,w,h,d,x,y,z,c,rx=0,ry=0,rz=0)=>B.push(w,h,d,x,y,z,c,rx,ry,rz);
export function earthBodyBoxes(L,B){
 const olive=L.dressColor,ochre=0xc39a55,dark=0x343b2a,stone=0x686858,leather=0x55402c;
 add(B,1.25,1.4,.86,0,.05,0,olive);
 add(B,.5,1.35,.045,-.18,.02,-.46,dark,0,0,.14);
 add(B,.16,1.48,.05,.05,.04,-.5,ochre,0,0,.44); // overlapping wrap edge
 add(B,1.34,.19,.95,0,-.62,0,leather);
 add(B,.28,.25,.06,.13,-.6,-.51,ochre);add(B,.15,.12,.07,.13,-.6,-.55,stone);
 for(const x of [-.42,.42]){add(B,.4,.65,.1,x,-.98,-.38,olive);add(B,.41,.045,.12,x,-1.29,-.39,ochre);}
 // Broad segmented rock shoulder, a spiral/diamond stone emblem, stitched front seams.
 for(let i=0;i<3;i++)add(B,.33,.17,.95,-.45+i*.29,.71-i*.035,0,stone,0,0,-.07);
 add(B,.31,.31,.07,.32,.32,-.49,ochre,0,0,Math.PI/4);
 add(B,.18,.18,.08,.32,.32,-.54,dark,0,0,Math.PI/4);
 add(B,.055,.16,.09,.32,.33,-.59,ochre);
 for(let i=0;i<8;i++)add(B,.045,.075,.025,-.34+i*.055,.53-i*.115,-.52,0xd0bb82,0,0,.44);
 // Speckled mineral insets and worn edges are geometry baked into the same draw, not extra meshes.
 for(let i=0;i<9;i++)add(B,.035,.025,.015,-.68+(i%3)*.28,.71-Math.floor(i/3)*.025,-.49,0x9c9b83);
}
export function earthArmBoxes(L,lower){
 const B=[];
 if(!lower){add(B,.43,.72,.43,0,-.14,0,L.shirt);add(B,.46,.12,.46,0,-.45,0,0x3e4730);}
 else {
  add(B,.35,.45,.35,0,-.2,0,L.skin);
  add(B,.43,.32,.44,0,-.22,0,0x55402c);
  for(let i=0;i<3;i++)add(B,.46,.07,.46,0,-.12-i*.105,0,0x747361);
  add(B,.29,.29,.25,0,-.56,0,L.skin);
  for(let i=0;i<4;i++)add(B,.055,.12,.12,-.105+i*.07,-.74,-.03,L.skin);
 }
 return B;
}
export function earthHeadBoxes(){const B=[];add(B,.98,.13,.94,0,.16,0,0x55402c);add(B,.22,.2,.05,0,.16,-.49,0xc39a55,0,0,Math.PI/4);return B;}
