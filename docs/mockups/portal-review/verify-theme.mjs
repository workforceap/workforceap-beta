/** Actual rendered appearance checks. All records and sessions remain offline fixtures. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(process.env.WAP_THEME_EVIDENCE_DIR||resolve(here,'evidence-theme'));
mkdirSync(out,{recursive:true});
const artifacts={standalone:readFileSync(resolve(here,'index.html'),'utf8'),inline:readFileSync(resolve(here,'inline.html'),'utf8')};
const storageKey='wap-portal-review-appearance';
const report={kind:'offline-appearance-review',liveAcceptance:false,inlineHarness:'Same-document scope isolation; host icon runtime is not loaded.',artifacts:Object.fromEntries(Object.entries(artifacts).map(([key,html])=>[key,createHash('sha256').update(html).digest('hex')])),tests:[],contrast:[],pageErrors:[],externalRequests:[],mediaCalls:[],screenshots:[]};
const inlineHost='<!doctype html><html lang="en" data-theme="host-light" style="color-scheme:light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; form-action \'none\'"><title>Scoped appearance test</title></head><body style="margin:0"><select id="theme-select" aria-label="Host appearance"><option>Host light</option></select>'+artifacts.inline+'</body></html>';
const server=createServer((req,res)=>{
  if(req.url.split('?')[0]==='/favicon.ico'){res.writeHead(204);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(req.url.startsWith('/inline')?inlineHost:artifacts.standalone);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});

async function run(variant,width){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:'dark',reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.__themeForbiddenCalls=[];
    const blocked=name=>()=>{window.__themeForbiddenCalls.push(name);throw Error('Unexpected live call: '+name);};
    if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:blocked('getUserMedia'),configurable:true});
    for(const name of ['AudioContext','webkitAudioContext','SpeechRecognition','webkitSpeechRecognition','MediaRecorder','RTCPeerConnection','WebSocket'])Object.defineProperty(window,name,{value:blocked(name),configurable:true});
    window.fetch=blocked('fetch');
    XMLHttpRequest.prototype.open=blocked('XMLHttpRequest');
    localStorage.setItem('wap-theme','light');
  });
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();
    report.externalRequests.push({variant,width,url});return route.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror',error=>report.pageErrors.push({variant,width,message:error.message}));
  const base=origin+'/'+variant+'.html';
  const rootSelector=variant==='inline'?'#wap-voice-review':'html';
  const root=page.locator(rootSelector);
  const appearance=root.getByLabel('Appearance',{exact:true});
  async function go(path){await page.goto(base+'#'+encodeURI(path));await root.locator('main h1').waitFor();}
  async function resolved(mode){await page.waitForFunction(({selector,mode})=>document.querySelector(selector)?.dataset.theme===mode,{selector:rootSelector,mode});}
  async function test(name,fn){
    try{await fn();report.tests.push({variant,width,name,result:'pass'});}
    catch(error){report.tests.push({variant,width,name,result:'fail',message:error.message});}
  }
  await go('/dashboard');
  await test('System is the initial preference and tracks OS changes',async()=>{
    assert.equal(await appearance.inputValue(),'system');await resolved('dark');
    await page.emulateMedia({colorScheme:'light'});await resolved('light');
    await page.emulateMedia({colorScheme:'dark'});await resolved('dark');
  });
  await test('Explicit modes persist and are independent of OS and the real app preference',async()=>{
    await appearance.selectOption('light');await resolved('light');
    await page.emulateMedia({colorScheme:'dark'});await resolved('light');
    await page.reload();await resolved('light');assert.equal(await appearance.inputValue(),'light');
    await appearance.selectOption('dark');await page.reload();await resolved('dark');
    assert.equal(await appearance.inputValue(),'dark');
    assert.equal(await page.evaluate(()=>localStorage.getItem('wap-theme')),'light');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),'dark');
    await appearance.selectOption('system');await page.reload();
    assert.equal(await appearance.inputValue(),'system');await resolved('dark');
    if(variant==='inline'){
      assert.equal(await page.locator('html').getAttribute('data-theme'),'host-light');
      assert.equal(await page.getByLabel('Host appearance').inputValue(),'Host light');
    }
  });
  await test('Changing appearance preserves the actual unsaved form node and text selection',async()=>{
    await go('/dashboard/profile');
    const input=root.getByLabel('Full name',{exact:true});await input.fill('Unsaved appearance review');
    await input.evaluate(el=>{el.dataset.appearanceProbe='same-node';el.focus();el.setSelectionRange(2,10);});
    await appearance.selectOption('light');await appearance.selectOption('dark');
    assert.equal(await input.inputValue(),'Unsaved appearance review');
    assert.equal(await input.getAttribute('data-appearance-probe'),'same-node');
    assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd]),[2,10]);
  });
  await test('Active voice session, mute, transcript and unsaved résumé survive the palette change',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=resume');
    const session=root.locator('[data-voice-session]').first();
    await session.locator('[data-voice-consent]').check();await session.locator('[data-voice-action="start"]').click();
    await session.locator('.voice-stage[data-phase="listening"]').waitFor();
    await session.locator('[data-voice-action="mute"]').click();
    const phase=await session.locator('.voice-stage').getAttribute('data-phase');
    const draft=session.locator('[data-voice-draft]');await draft.fill('An unsaved résumé draft stays exactly here.');
    const turns=await session.locator('.voice-turn').allTextContents();
    await session.evaluate(el=>{el.dataset.appearanceProbe='same-session';});
    await draft.evaluate(el=>{el.dataset.appearanceProbe='same-draft';});
    await appearance.selectOption('light');await appearance.selectOption('dark');
    assert.equal(await session.getAttribute('data-appearance-probe'),'same-session');
    assert.equal(await draft.getAttribute('data-appearance-probe'),'same-draft');
    assert.equal(await draft.inputValue(),'An unsaved résumé draft stays exactly here.');
    assert.equal(await session.locator('.voice-stage').getAttribute('data-phase'),phase);
    assert.equal(await session.locator('[data-voice-action="mute"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await session.locator('.voice-turn').allTextContents(),turns);
  });
  await test('A second open review synchronizes appearance without replacing the session',async()=>{
    const other=await context.newPage();await other.goto(base+'#/dashboard');
    await other.locator(rootSelector).getByLabel('Appearance',{exact:true}).selectOption('light');await resolved('light');
    assert.equal(await appearance.inputValue(),'light');
    assert.equal(await root.locator('[data-voice-session]').first().getAttribute('data-appearance-probe'),'same-session');
    await other.close();
  });
  await test('Both palettes retain readable controls, calm disabled states and contained mobile geometry',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=resume');
    for(const mode of ['light','dark']){
      await appearance.selectOption(mode);await resolved(mode);
      const geometry=await root.evaluate(el=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,picker:el.querySelector('#theme-select').getBoundingClientRect().height}));
      assert.ok(geometry.scrollWidth<=geometry.width+2,'Horizontal overflow: '+JSON.stringify(geometry));
      assert.ok(geometry.picker>=44,'Appearance target is smaller than 44px');
      const disabledPrimary=root.locator('.voice-stage .button.primary:disabled').first();
      await disabledPrimary.hover({force:true});
      assert.equal(await disabledPrimary.evaluate(node=>getComputedStyle(node).filter),'none','A disabled voice action must not brighten on hover');
      await page.mouse.move(0,0);
      const pairs=await root.evaluate(el=>{
        const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
        const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);};
        const over=(front,back)=>front.slice(0,3).map((value,i)=>value*front[3]/255+back[i]*(1-front[3]/255)).concat(255);
        const background=node=>{const stack=[];for(let n=node;n;n=n.parentElement)stack.unshift(getComputedStyle(n).backgroundColor);return stack.reduce((bg,color)=>over(rgb(color),bg),[255,255,255,255]);};
        const luminance=rgba=>rgba.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
        const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
        const required=selector=>{const node=el.querySelector(selector);if(!node)throw Error('Missing required contrast target: '+selector);return node;};
        const pairs=[];
        for(const [selector,label]of [['#theme-select','Appearance label'],['.voice-panel textarea','Editable résumé text'],['.voice-hero .voice-description','Voice description'],['.voice-stage .voice-privacy','Session privacy text']]){
          const node=required(selector);const bg=background(node);pairs.push({label,ratio:contrast(over(rgb(getComputedStyle(node).color),bg),bg),minimum:4.5});
        }
        for(const selector of ['.voice-panel textarea','.voice-agent-choice select']){
          const node=required(selector);const bg=background(node);pairs.push({label:selector+' boundary',ratio:contrast(over(rgb(getComputedStyle(node).borderTopColor),bg),bg),minimum:3});
        }
        return pairs;
      });
      report.contrast.push({variant,width,mode,pairs});
      for(const pair of pairs)assert.ok(pair.ratio>=pair.minimum,`${mode} ${pair.label}: ${pair.ratio.toFixed(2)} < ${pair.minimum}`);
      if(process.argv.includes('--capture')){
        const path=resolve(out,`${variant}-${width}-${mode}.png`);await page.screenshot({path,fullPage:true});report.screenshots.push(path);
      }
    }
  });
  const calls=await page.evaluate(()=>window.__themeForbiddenCalls);
  if(calls.length)report.mediaCalls.push({variant,width,calls});
  await context.close();
}

async function blockedStorage(variant){
  const context=await browser.newContext({viewport:{width:375,height:900},colorScheme:'dark'});
  await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}});});
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({variant,storage:'blocked',message:error.message}));
  try{
    await page.goto(origin+'/'+variant+'.html#/dashboard');
    const root=page.locator(variant==='inline'?'#wap-voice-review':'html');
    assert.equal(await root.getAttribute('data-theme'),'dark');
    await root.getByLabel('Appearance',{exact:true}).selectOption('light');
    assert.equal(await root.getAttribute('data-theme'),'light');
    await page.emulateMedia({colorScheme:'dark'});assert.equal(await root.getAttribute('data-theme'),'light');
    report.tests.push({variant,name:'Blocked storage retains working system and explicit modes',result:'pass'});
  }catch(error){report.tests.push({variant,name:'Blocked storage retains working system and explicit modes',result:'fail',message:error.message});}
  finally{await context.close();}
}

try{
  for(const variant of ['standalone','inline']){for(const width of [1440,375])await run(variant,width);await blockedStorage(variant);}
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  report.summary={passed:report.tests.filter(t=>t.result==='pass').length,failed:report.tests.filter(t=>t.result==='fail').length,pageErrors:report.pageErrors.length,externalRequests:report.externalRequests.length,mediaCalls:report.mediaCalls.length};
  writeFileSync(resolve(out,'theme-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report.summary,report:resolve(out,'theme-results.json'),failures:report.tests.filter(t=>t.result==='fail')},null,2));
  if(report.summary.failed||report.summary.pageErrors||report.summary.externalRequests||report.summary.mediaCalls)process.exitCode=1;
}
