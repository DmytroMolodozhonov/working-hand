export default async function(h){
 const g=h.g;g.paused=true;g._prewarmed=false;
 const r=g.renderer,render=r.render,compile=r.compile;
 let passes=0;r.render=()=>passes++;r.compile=()=>passes++;
 try{g.prewarm();h.log('prewarm construction complete',{passes,programs:r.info.programs.length});}
 finally{r.render=render;r.compile=compile;}
}
