/** Startup diagnostics survive a page reload; they never contain or modify world saves. */
export const STARTUP_FAILURE_KEY='zns-last-startup-failure';
export function rememberStartupFailure(storage,error,config={},now=Date.now()){
 const report={at:now,message:String(error?.message||error||'Неизвестная ошибка').slice(0,1500),stack:String(error?.stack||'').slice(0,5000),mode:config.mode||'',gen:config.gen??null,spawn:config.hero?.spawn||'start'};
 try{storage?.setItem(STARTUP_FAILURE_KEY,JSON.stringify(report));}catch{/* Diagnostics must never prevent a fallback. */}return report;
}
export function readStartupFailure(storage){try{const r=JSON.parse(storage?.getItem(STARTUP_FAILURE_KEY)||'null');return r&&typeof r.message==='string'&&Number.isFinite(new Date(r.at).getTime())?r:null;}catch{return null;}}
export function clearStartupFailure(storage){try{storage?.removeItem(STARTUP_FAILURE_KEY);}catch{}}
export function startupFailureText(r){return `${new Date(r.at).toISOString()}\nРежим: ${r.mode||'—'}, поколение: ${r.gen??'—'}, место: ${r.spawn||'start'}\n${r.message}\n${r.stack||''}`;}
export function showStartupFailure(root,report,{back=null,compact=false}={}){
 if(!root||!report)return null;
 document.getElementById('startup-failure')?.remove();
 const box=document.createElement('section');box.id='startup-failure';box.style.cssText='position:relative;z-index:1200;margin:12px auto;padding:16px;max-width:640px;max-height:60vh;overflow:auto;border:1px solid #dc9274;border-radius:12px;background:#231d25;color:#fff3e8;text-align:left;font:15px/1.5 system-ui;pointer-events:auto';
 const title=document.createElement('strong');title.textContent=compact?'Последний вход завершился ошибкой':'Не удалось войти в мир';box.appendChild(title);
 const message=document.createElement('p');message.textContent=report.message;box.appendChild(message);
 const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Подробности ошибки';pre.textContent=startupFailureText(report);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';details.append(summary,pre);box.appendChild(details);
 const copy=document.createElement('button');copy.textContent='Скопировать ошибку';copy.style.cssText='margin:12px 8px 0 0;padding:8px 12px;cursor:pointer';copy.onclick=async()=>{try{await navigator.clipboard.writeText(startupFailureText(report));copy.textContent='Скопировано';}catch{details.open=true;const range=document.createRange();range.selectNodeContents(pre);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}};box.appendChild(copy);
 if(back){const menu=document.createElement('button');menu.textContent='Вернуться в меню';menu.style.cssText=copy.style.cssText;menu.onclick=back;box.appendChild(menu);}
 root.appendChild(box);return box;
}
