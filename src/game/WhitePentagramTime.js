/** Drawings expire; an already acquired ritual mark on a person does not. */
export const WHITE_PENTAGRAM_SECONDS=12*60;
export function stampWhitePentagram(mark,expiresAt=null,now=Date.now()){
 if(mark.dark)return mark;
 mark.whiteExpiresAt=Math.min(Number.isFinite(expiresAt)&&expiresAt>0?expiresAt:now+WHITE_PENTAGRAM_SECONDS*1000,now+WHITE_PENTAGRAM_SECONDS*1000);
 mark.life=Math.min(mark.life??Infinity,Math.max(0,(mark.whiteExpiresAt-now)/1000));return mark;
}
