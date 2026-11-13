/** An entry error stays visible and survives a reload; it must not auto-reload away. */
import {startServer,launch,openPage} from '../tests/e2e/harness.mjs';
const srv=await startServer(8932),browser=await launch();
try{
 const {page}=await openPage(browser,srv.url,{noCamera:true});
 await page.evaluate(async()=>{
  localStorage.setItem('zns-tutorial-asked','1');window.__ZNS_NO_FULLSCREEN__=true;
  const {Game}=await import('/src/game/Game.js');Game.prototype.init=async()=>{throw Error('startup regression sentinel');};
  const z=window.__zns;await z.startGame({...z.readConfig(),mode:'creative',map:null});
 });
 await page.waitForSelector('#startup-failure');
 await page.waitForTimeout(4500); // The former handler reloaded the page after four seconds.
 const result=await page.evaluate(()=>({message:document.querySelector('#startup-failure p')?.textContent,saved:JSON.parse(localStorage.getItem('zns-last-startup-failure')||'null'),failed:window.__startupFailed,active:window.__zns.game?.active}));
 if(result.message!=='startup regression sentinel'||!result.failed||result.active)throw Error('Startup error vanished / partial game remained active');
 await page.reload();await page.waitForSelector('#startup-failure');
 const text=await page.locator('#startup-failure').innerText();if(!text.includes('startup regression sentinel'))throw Error('Error did not survive reload');
 console.log('PASS: entry error stays visible, survives reload, leaves the failed world inactive');
}finally{await browser.close();srv.stop();}
