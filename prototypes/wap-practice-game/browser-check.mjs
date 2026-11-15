import {createRequire} from 'node:module';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const {chromium}=require('C:/Users/mabro/.claude/skills/gstack/node_modules/playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript'};
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404).end();return}r.writeHead(200,{'content-type':mime[path.extname(f)]||'text/plain'});fs.createReadStream(f).pipe(r)}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/`;
const results={url,errors:[],asserts:[]};
const ok=(c,m)=>{results.asserts.push(`${c?'PASS':'FAIL'}: ${m}`);if(!c)results.failed=true};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--window-size=1400,1000']});
const ov=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const tabTo=async(p,id)=>{for(let i=0;i<80;i++){await p.keyboard.press('Tab');if(await p.evaluate(()=>document.activeElement.id)===id)return true}return false};
const center=(p,sel)=>p.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]},sel);
const open=async(name,w,h,extra={})=>{const ctx=await browser.newContext({viewport:{width:w,height:h},...extra});const p=await ctx.newPage();p.on('pageerror',e=>results.errors.push(`${name}: ${e.message}`));p.on('console',m=>{if(m.type()==='error')results.errors.push(`${name}: ${m.text()}`)});await p.goto(url);return [ctx,p]};
const txt=(p,s)=>p.textContent(s);
const routeIds=async(p,ids)=>{for(const id of ids)await p.click(`#${id}`)};
try{
for(const [name,w,h] of [['1280',1280,900],['390',390,844]]){
 const [ctx,p]=await open(name,w,h,name==='1280'?{recordVideo:{dir:out,size:{width:1280,height:900}}}:{});
 await p.screenshot({path:`${out}/title-${name}.png`});ok(await ov(p)<=0,`${name} title no overflow`);
 await p.click('#s0');await p.waitForTimeout(200);
 ok((await txt(p,'#goals')).includes('TODO: Plug in the switch cable'),`${name} stage1 shows a TODO goal`);
 ok((await txt(p,'#switch')).includes('PORT UNPLUGGED'),`${name} stage1 switch shows fault`);
 const pk=await center(p,'#packet'),cl=await center(p,'#client');
 ok(Math.abs(pk[0]-cl[0])<5,`${name} packet x sits on client before launch`);
 ok(!(await txt(p,'#brief')).includes('No router needed'),`${name} no contradictory hint`);
 ok(!(await txt(p,'footer')).includes('providerLessonId'),`${name} footer has no internal field`);
 await p.screenshot({path:`${out}/stage1-${name}.png`});
 if(name==='1280'){
  await p.keyboard.press('w');ok(await tabTo(p,'switch'),'tab reaches switch');await p.keyboard.press('Enter');
  ok(!(await txt(p,'#switch')).includes('UNPLUGGED'),'keyboard repair fixes switch');
  await p.keyboard.press('w');
  for(const id of ['client','switch','server']){ok(await tabTo(p,id),`tab reaches ${id}`);await p.keyboard.press('Enter')}
  ok(await tabTo(p,'launch'),'tab reaches launch');await p.keyboard.press('Enter');
  await p.waitForTimeout(700);await p.screenshot({path:`${out}/packet-frame-1.png`});
  for(let i=2;i<=6;i++){await p.waitForTimeout(250);await p.screenshot({path:`${out}/packet-frame-${i}.png`})}
  await p.waitForSelector('#next');ok(true,'keyboard-only stage 1 win overlay');
  ok((await txt(p,'#overlayText')).includes('What you learned'),'win shows what you learned');
  ok(await p.evaluate(()=>document.activeElement.id)==='next','focus moves to Next in overlay');
 }else{
  await p.click('#repair');await p.click('#switch');await p.click('#repair');
  await routeIds(p,['client','switch','server']);await p.click('#launch');await p.waitForSelector('#next');
 }
 await p.screenshot({path:`${out}/win-${name}.png`});ok(await ov(p)<=0,`${name} win no overflow`);
 await p.click('#next');
 await p.screenshot({path:`${out}/stage2-${name}.png`});ok(await ov(p)<=0,`${name} stage2 no overflow`);
 ok(await p.locator('.tag.dns').count()===1,`${name} DNS drawn as separate lookup link`);
 await routeIds(p,['client','router','router','router']);
 await p.waitForSelector('#again');ok((await txt(p,'#overlayTitle'))==='SIGNAL LOST',`${name} lose screen`);await p.screenshot({path:`${out}/lose-${name}.png`});
 await p.click('#again');ok((await txt(p,'#lives')).includes('(3)'),`${name} retry restores 3 lives`);
 await p.click('#repair');await p.click('#dns');await p.click('#repair');
 await routeIds(p,['client','switch','dns']);await p.click('#launch');
 await p.waitForFunction(()=>document.querySelector('#log').textContent.includes('DNS response'));
 await routeIds(p,['client','switch','router','server']);await p.screenshot({path:`${out}/stage2-ready-${name}.png`});await p.click('#launch');await p.waitForSelector('#next');
 await p.click('#next');
 await p.screenshot({path:`${out}/stage3-${name}.png`});ok(await ov(p)<=0,`${name} stage3 no overflow`);
 const g=await txt(p,'#goals');ok(g.includes('Fix the gateway')&&g.includes('Restart the web service')&&g.includes('Verify'),`${name} boss checklist visible`);
 ok((await txt(p,'#tip')).includes('ROUTE tool'),`${name} tool explained on screen`);
 await p.waitForTimeout(700);const pk3=await center(p,'#packet'),cl3=await center(p,'#client');ok(Math.abs(pk3[0]-cl3[0])<5&&Math.abs(pk3[1]-cl3[1])<80,`${pk3} vs ${cl3} ${name} stage3 packet at client before launch`);
 await p.click('#repair');await p.click('#router');await p.click('#repair');await p.click('[data-purpose=ping]');
 await routeIds(p,['client','switch','router','server']);await p.click('#launch');
 await p.waitForFunction(()=>document.querySelector('#log').textContent.includes('HTTP has NOT'));
 await p.click('#repair');await p.click('#server');await p.click('#repair');await p.click('[data-purpose=page]');
 await routeIds(p,['client','switch','router','server']);await p.click('#launch');await p.waitForSelector('#again');
 ok((await txt(p,'#overlayTitle'))==='BOSS CLEARED',`${name} boss cleared`);await p.screenshot({path:`${out}/boss-win-${name}.png`});
 await p.click('#review');await p.click('#textMode');
 await p.screenshot({path:`${out}/text-mode-${name}.png`});ok(await ov(p)<=0,`${name} text mode no overflow`);
 ok(!(await txt(p,'#stars')).includes('Best — —'),`${name} no placeholder dashes`);
 await ctx.close();
}
for(const n of [0,1,2]){const [ctx,p]=await open(`text${n}`,1280,900);await p.click(`#s${n}`);await p.click('#textMode');
 const items=await p.locator('#listMode button').count();ok(items===(n===0?3:5),`text mode stage ${n+1} lists ${items} devices`);
 ok(!(await p.isVisible('#map')),`text mode hides map stage ${n+1}`);
 if(n===0){await p.click('#repair');await p.click('[data-list=switch]');await p.click('#repair');for(const id of ['client','switch','server'])await p.click(`[data-list=${id}]`);await p.click('#launch');await p.waitForSelector('#next');ok(true,'stage 1 won in text mode')}
 if(n===1){await p.click('#repair');await p.click('[data-list=dns]');await p.click('#repair');for(const id of ['client','switch','dns'])await p.click(`[data-list=${id}]`);await p.click('#launch');await p.waitForFunction(()=>document.querySelector('#log').textContent.includes('DNS response'));ok(true,'stage 2 DNS lookup done in text mode')}
 if(n===2){await p.click('#repair');await p.click('[data-list=router]');await p.click('[data-list=server]');await p.click('#repair');await p.click('[data-list=server]');ok(!(await txt(p,'#listMode')).includes('WEB DOWN'),'stage 3 repairs via text mode')}
 await p.screenshot({path:`${out}/text-stage${n+1}.png`});await ctx.close()}
{const [ctx,p]=await open('reduced',1280,900,{reducedMotion:'reduce'});await p.click('#s2');
 const anim=await p.evaluate(()=>getComputedStyle(document.querySelector('#router')).animationName);ok(anim==='none',`reduced motion: fault glitch off (${anim})`);
 const tr=await p.evaluate(()=>getComputedStyle(document.querySelector('#packet')).transitionDuration);ok(/^0s/.test(tr),`reduced motion: packet transition off (${tr})`);
 await p.screenshot({path:`${out}/reduced-motion.png`});await ctx.close()}
for(const [w,h] of [[640,450],[320,450]]){const [ctx,p]=await open(`zoom${w}`,w,h);ok(await ov(p)<=0,`200%-zoom equivalent ${w}px title no overflow`);await p.click('#s1');ok(await ov(p)<=0,`200%-zoom equivalent ${w}px stage2 no overflow`);await p.screenshot({path:`${out}/zoom200-${w}.png`});await ctx.close()}
{const [ctx,p]=await open('save',1280,900);await p.evaluate(()=>localStorage.setItem('packet-quest-v1','{"version":1,"best":[9,9,9],"evidence":[]}'));await p.reload();await p.click('#s0');ok((await txt(p,'#stars')).includes('not cleared'),'corrupt save ignored');await ctx.close()}
}finally{await browser.close();server.close()}
ok(results.errors.length===0,`no page errors (${results.errors.length})`);
fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(results,null,2));console.log(results.asserts.join('\n'),results.errors);
process.exit(results.failed?1:0);
