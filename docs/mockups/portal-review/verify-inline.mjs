/** Verify the actual sandboxed conversation presentation, not only the standalone page. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {fixturePath} from './review-model.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const wrapper=process.argv.find(a=>a.startsWith('--wrapper='))?.slice(10);
if(!wrapper)throw Error('Pass --wrapper=<rendered inline HTML>.');
const out=resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'/tmp/wap-inline-evidence');
const runtimeCache=process.argv.find(a=>a.startsWith('--runtime-cache='))?.slice(16);
mkdirSync(out,{recursive:true});
const html=readFileSync(wrapper);
const inventory=JSON.parse(readFileSync(resolve(here,'route-inventory.json')));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const report={inlineSha256:createHash('sha256').update(readFileSync(resolve(here,'inline.html'))).digest('hex'),routeCount:inventory.routes.length,routeChecks:[],screenChecks:[],interactions:[],pageErrors:[],hostRuntimeRequests:[],externalRequests:[],failures:[],screenshots:[]};
// These exact scripts belong to the supplied conversation wrapper, not the prototype.
const hostRuntime=new Set(['https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js','https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js','https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js']);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1056,height:900},reducedMotion:'reduce',colorScheme:'light'});
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('response',response=>{if(hostRuntime.has(response.url()))report.hostRuntimeResponses=(report.hostRuntimeResponses||[]).concat([{url:response.url(),status:response.status()}]);});
page.on('requestfailed',request=>{if(hostRuntime.has(request.url()))report.hostRuntimeFailures=(report.hostRuntimeFailures||[]).concat([{url:request.url(),failure:request.failure()}]);});
await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith('http://127.0.0.1:'+port)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
 if(hostRuntime.has(url)){
  report.hostRuntimeRequests.push(url);
  if(runtimeCache){
   const name=url.includes('/lucide@')?'lucide.js':url.includes('/core@')?'floating-core.js':'floating-dom.js';
   const body=readFileSync(resolve(runtimeCache,name));
   report.cachedRuntime=Object.assign(report.cachedRuntime||{},{[name]:createHash('sha256').update(body).digest('hex')});
   return route.fulfill({status:200,contentType:'application/javascript',body});
  }
  return route.continue();
 }
 report.externalRequests.push(url);return route.abort();
});
try{
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'load'});
 const frame=page.frames().find(f=>f.parentFrame());
 if(!frame)throw Error('Conversation wrapper frame missing.');
 await frame.locator('#wap-voice-review[data-path]').waitFor();
 report.iconRuntime=await frame.evaluate(()=>({type:typeof lucide,globalType:typeof globalThis.lucide,create:typeof lucide==='undefined'?null:typeof lucide.createIcons,initialIcons:document.querySelectorAll('#wap-voice-review svg').length}));
 const go=async path=>{
  await frame.evaluate(p=>{location.hash='#'+encodeURI(p);},path);
  await frame.waitForFunction(p=>document.getElementById('wap-voice-review').dataset.path===p,path);
 };
 for(const route of (process.argv.includes('--focus')?[]:inventory.routes)){
  const path=fixturePath(route.route);
  await go(path);
  const state=await frame.evaluate(()=>({heading:document.querySelector('#main h1')?.textContent,content:document.querySelector('#screen-content')?.textContent?.trim().length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}));
  const ok=Boolean(state.heading&&state.content)&&!state.overflow;
  report.routeChecks.push({path,ok,...state});
  if(!ok)report.failures.push('Route render '+path+': '+JSON.stringify(state));
 }
 const selected=['/dashboard','/dashboard/ai-tools','/dashboard/ai-tools?tab=session&agent=resume','/dashboard/ai-tools?tab=session&agent=mock','/counselor/overview','/employer','/partner','/admin'];
 for(const width of [1056,407]){
  await page.setViewportSize({width,height:900});
  for(const path of selected){
   await go(path);
   const state=await frame.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+2,heading:document.querySelector('#main h1')?.textContent}));
   report.screenChecks.push({path,width,...state});
   if(state.overflow)report.failures.push('Responsive overflow '+width+' '+path);
   const file=resolve(out,path.replaceAll(/[^a-zA-Z0-9]+/g,'_')+'-'+state.width+'.png');
   await frame.locator('#wap-voice-review').screenshot({path:file});
   report.screenshots.push(file);
  }
 }
 await go('/dashboard/ai-tools');
 await frame.locator('[data-voice-agent-choice]').selectOption('resume');
 await frame.locator('[data-voice-session="hub-resume"]').waitFor();
 const resumeDraft=frame.locator('[data-voice-draft]');
 const before=await resumeDraft.inputValue();
 await frame.locator('[data-voice-action="accept"]').click();
 if((await resumeDraft.inputValue())===before)throw Error('Inline résumé acceptance did not update its local draft');
 report.interactions.push('Coach picker and explicit local résumé acceptance');
 await frame.locator('[data-voice-agent-choice]').selectOption('mock');
 await frame.locator('[data-voice-session="hub-mock"]').waitFor();
 if(!(await frame.locator('[data-voice-action="start"]').isDisabled()))throw Error('Voice start bypassed acknowledgment');
 await frame.locator('[data-voice-consent]').check();
 await frame.locator('[data-voice-action="start"]').click();
 await frame.locator('[data-voice-action="mute"]').waitFor();
 await frame.locator('[data-voice-action="mute"]').click();
 if(await frame.locator('[data-voice-action="mute"]').getAttribute('aria-pressed')!=='true')throw Error('Mute state was not reflected');
 await frame.locator('[data-voice-action="mute"]').click();
 await frame.locator('[data-voice-action="prompt"]').first().click();
 await frame.locator('[data-voice-action="interrupt"]').click();
 if(await frame.locator('.voice-stage').getAttribute('data-phase')!=='listening')throw Error('Interrupt did not return the turn');
 if(await frame.locator('.voice-controls svg').count()===0)throw Error('Voice control icons missing after session replacement');
 await frame.locator('[data-voice-action="end"]').click();
 if(await frame.locator('.voice-stage').getAttribute('data-phase')!=='ended')throw Error('End session failed');
 report.interactions.push('Consent, start, mute, reply, interrupt, dynamic icons and end in the conversation iframe');
 await go('/dashboard/ai-tools');
 await frame.getByRole('button',{name:'All 266 screens',exact:true}).click();
 await frame.locator('#catalog-results').waitFor({state:'visible'});
 const catalog=await frame.locator('#catalog-count').textContent();
 if(!catalog.includes('266 of 266'))report.failures.push('Catalog count '+catalog);
 const visible=await frame.locator('#catalog-results > li:visible').count();
 if(visible!==18)report.failures.push('Inline catalog page count '+visible);
 await frame.getByRole('button',{name:'Next screens',exact:true}).click();
 if(!(await frame.locator('#inline-catalog-pages').textContent()).includes('Page 2'))report.failures.push('Catalog paging did not advance');
 await frame.getByRole('button',{name:'Close',exact:true}).click();
 await frame.locator('#main').waitFor({state:'visible'});
 await frame.getByRole('combobox',{name:'Review workspace',exact:true}).selectOption('employer');
 await frame.waitForFunction(()=>document.getElementById('wap-voice-review').dataset.path==='/employer');
 report.catalog={count:catalog,visiblePerPage:visible,paging:true,close:true,workspaceSwitch:true};
 report.interactions.push('Complete paged route catalog and workspace switching');
}catch(error){report.failures.push(error.stack||String(error));}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
if(report.pageErrors.length)report.failures.push('JavaScript errors: '+report.pageErrors.join('; '));
if(report.externalRequests.length)report.failures.push('External requests: '+report.externalRequests.join('; '));
report.passed=report.failures.length===0;
writeFileSync(resolve(out,'inline-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,routes:report.routeChecks.length,responsiveScreens:report.screenChecks.length,interactions:report.interactions,pageErrors:report.pageErrors,hostRuntimeRequests:report.hostRuntimeRequests,externalRequests:report.externalRequests,failures:report.failures,report:resolve(out,'inline-verification.json')},null,2));
if(!report.passed)process.exitCode=1;
