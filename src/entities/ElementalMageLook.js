/** Costume details are merged into the villager's existing GPU skin; no extra draw per ornament. */
const b=(B,w,h,d,x,y,z,c,rx=0,ry=0,rz=0)=>B.push(w,h,d,x,y,z,c,rx,ry,rz);
export function elementalBodyBoxes(L,B){
 const c=L.dressColor,tr=L.accent,d=L.pants;
 b(B,1.27,1.45,.87,0,.03,0,c);b(B,1.34,.19,.95,0,-.62,0,d);
 b(B,.15,1.45,.06,.08,.05,-.48,tr,0,0,.24);b(B,.3,.24,.07,0,-.6,-.52,tr);
 for(const x of [-.43,.43]){b(B,.43,.7,.12,x,-1.02,-.37,c);b(B,.44,.08,.14,x,-1.31,-.38,tr);}
 if(L.element==='water'){
  b(B,1.28,.2,.95,0,.68,0,tr);for(const x of [-.55,.55])b(B,.22,1.2,.05,x,.04,-.48,tr);
  for(let i=0;i<3;i++)b(B,.28,.05,.06,.3,.32-i*.1,-.51,tr,0,0,.15*Math.sin(i));
  if(L.tank){ // Only travellers carry this open water vat; residents use their canals.
   b(B,.85,1.3,.65,0,.1,.69,d);b(B,.95,.12,.75,0,.77,.69,tr);
   b(B,.67,.08,.49,0,.79,.69,0x6cbed6);b(B,.36,.35,.34,0,.95,.69,0x8dd8eb,0,0,Math.PI/4);
   for(const x of [-.42,.42])b(B,.1,1.35,.07,x,.13,-.48,d);
  }
 }else if(L.element==='air'){
  b(B,1.32,.35,.95,0,.57,0,c);b(B,.68,1.25,.06,-.24,.05,-.49,tr,0,0,-.18);
  b(B,.34,.34,.07,.32,.3,-.5,tr,0,0,Math.PI/4);
  // Folded cloth streamers, distinct from the earth shoulder armour.
  for(const x of [-.5,.5])b(B,.18,1.55,.08,x,-.35,.49,c,0,0,x*.22);
 }else{
  for(const x of [-.55,.55]){b(B,.4,.22,1,x,.65,0,d,0,0,-x*.2);b(B,.25,.08,1.02,x,.74,0,tr);}
  for(let i=0;i<3;i++)b(B,.24-i*.05,.2,.07,.3,.3+i*.15,-.5,tr,0,0,Math.PI/4);
  b(B,.14,1.4,.07,-.36,.03,-.5,d,0,0,-.3);
 }
}
export function elementalArmBoxes(L,lower){
 const B=[];if(!lower){b(B,.44,.72,.44,0,-.14,0,L.shirt);b(B,.46,.12,.46,0,-.45,0,L.accent);}
 else{b(B,.35,.45,.35,0,-.2,0,L.skin);b(B,.4,.2,.4,0,-.3,0,L.pants);b(B,.41,.05,.41,0,-.2,0,L.accent);b(B,.29,.29,.25,0,-.56,0,L.skin);for(let i=0;i<4;i++)b(B,.055,.12,.12,-.105+i*.07,-.74,-.03,L.skin);}
 return B;
}
