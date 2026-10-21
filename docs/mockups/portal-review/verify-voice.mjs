/** Focused voice-review acceptance. All media/provider APIs are blocked and instrumented. */
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {resolveRoute,REVIEW_BASE_SHA} from './review-model.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const file=resolve(here,'index.html');
const artifactBytes=readFileSync(file);
const source=JSON.parse(readFileSync(resolve(here,'route-inventory.json'),'utf8'));
const out=resolve(process.env.WAP_VOICE_EVIDENCE_DIR||resolve(here,'evidence-voice'));
const filter=process.argv.find(value=>value.startsWith('--filter='))?.slice(9);
mkdirSync(resolve(out,'screens'),{recursive:true});
writeFileSync(resolve(out,'mockup-under-test.html'),artifactBytes);
const url=pathToFileURL(resolve(out,'mockup-under-test.html')).href;
const report={baseSha:REVIEW_BASE_SHA,artifactSha256:createHash('sha256').update(artifactBytes).digest('hex'),kind:'local-synthetic-voice-review',liveAcceptance:false,tests:[],pageErrors:[],externalRequests:[],mediaCalls:[],screenshots:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});

async function runAtWidth(width){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.__voiceForbiddenCalls=[];
    const blocked=name=>(...args)=>{window.__voiceForbiddenCalls.push(name);throw Error('Forbidden live call in mockup: '+name);};
    if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:blocked('getUserMedia'),configurable:true});
    else Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:blocked('getUserMedia')},configurable:true});
    for(const name of ['AudioContext','webkitAudioContext','SpeechRecognition','webkitSpeechRecognition','MediaRecorder','RTCPeerConnection','WebSocket']){
      Object.defineProperty(window,name,{value:blocked(name),configurable:true});
    }
    window.fetch=blocked('fetch');
    XMLHttpRequest.prototype.open=blocked('XMLHttpRequest');
  });
  await context.route('**/*',route=>{
    const u=route.request().url();
    if(!u.startsWith('file:')&&!u.startsWith('data:')){report.externalRequests.push({width,url:u});return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror',e=>report.pageErrors.push({width,url:page.url(),message:e.message}));
  async function go(path,{fresh=true}={}){
    await page.goto(url+'#'+encodeURI(path));
    if(fresh)await page.reload();
    await page.locator('main h1').waitFor({state:'visible'});
  }
  async function test(name,fn){
    if(filter&&!filter.toLowerCase().split(',').some(term=>name.toLowerCase().includes(term.trim())))return;
    try{await fn();report.tests.push({width,name,result:'pass'});}
    catch(e){report.tests.push({width,name,result:'fail',message:e.message});}
    const calls=await page.evaluate(()=>window.__voiceForbiddenCalls||[]).catch(()=>[]);
    if(calls.length)report.mediaCalls.push({width,test:name,calls});
  }
  async function shot(name,path){
    const fileName=`${name}-${width}.png`;
    await page.screenshot({path:resolve(out,'screens',fileName),fullPage:true});
    report.screenshots.push({width,path,file:'screens/'+fileName});
  }
  async function fit(){
    const shape=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      names:[...document.querySelectorAll('a,button')].filter(e=>e.getClientRects().length&&!e.textContent.trim()&&!e.getAttribute('aria-label')).length,
      links:[...document.querySelectorAll('a[href^="#/"]')].map(e=>decodeURI(e.getAttribute('href').slice(1))),
      motion:[...document.querySelectorAll('.voice-orb')].map(e=>({transform:getComputedStyle(e).transform,animation:getComputedStyle(e).animationName})),
    }));
    assert.equal(shape.overflow,false,'horizontal overflow');
    assert.equal(shape.names,0,'unnamed visible control');
    for(const path of shape.links)assert.ok(resolveRoute(path,source.routes),'Unresolved internal link: '+path);
    for(const motion of shape.motion){assert.equal(motion.transform,'none');assert.equal(motion.animation,'none');}
  }

  const session=()=>page.locator('[data-voice-session]').first();
  const act=name=>session().locator(`[data-voice-action="${name}"]`);
  async function start(){
    assert.equal(await act('start').isDisabled(),true,'Start must require acknowledgement');
    await session().locator('[data-voice-consent]').check();
    await act('start').click();
    await session().locator('.voice-stage[data-phase="speaking"],.voice-stage[data-phase="listening"]').waitFor();
  }
  async function scenario(name){
    await session().locator('.voice-scenarios summary').click();
    const options=await session().locator('[data-voice-scenario] option').evaluateAll(options=>options.map(o=>({value:o.value,text:o.textContent})));
    assert.ok(options.some(o=>o.value===name),'Missing recovery option: '+name+'; available='+JSON.stringify(options));
    await session().locator('[data-voice-scenario]').selectOption(name);
  }

  await test('Consent, keyboard start, interrupt, mute, and end form an accessible session',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');
    assert.equal(await act('start').isDisabled(),true);
    const consent=session().locator('[data-voice-consent]');
    await consent.focus();await page.keyboard.press('Space');
    assert.equal(await act('start').isEnabled(),true);
    await act('start').focus();await page.keyboard.press('Enter');
    await session().locator('.voice-stage[data-phase="speaking"]').waitFor();
    assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('[data-voice-session]'))),true,'Keyboard focus left the session');
    assert.equal(await session().locator('[data-voice-consent]').isDisabled(),true);
    await act('interrupt').click();
    assert.equal(await session().locator('.voice-stage').getAttribute('data-phase'),'listening');
    await act('mute').click();assert.equal(await act('mute').getAttribute('aria-pressed'),'true');
    assert.equal(await session().locator('[data-voice-input]').isDisabled(),true);
    await act('mute').click();assert.equal(await act('mute').getAttribute('aria-pressed'),'false');
    await act('end').click();assert.equal(await session().locator('.voice-stage').getAttribute('data-phase'),'ended');
    assert.match(await session().innerText(),/No production history, email or coach memory was created/i);
    await act('restart').click();assert.equal(await act('start').isDisabled(),true);
    await fit();
  });
  await test('Interrupted connection retains the exact draft and turns without repeating them',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');await start();
    await act('prompt').first().click();
    await session().locator('[data-voice-input]').fill('My unfinished practice draft.');
    const turns=await session().locator('.voice-turn').allTextContents();
    await scenario('disconnect');
    assert.match(await session().locator('.voice-error').innerText(),/nothing is sent or repeated automatically/i);
    assert.deepEqual(await session().locator('.voice-turn').allTextContents(),turns);
    await act('start').click();
    await session().locator('.voice-stage[data-phase="speaking"],.voice-stage[data-phase="listening"]').waitFor();
    assert.deepEqual(await session().locator('.voice-turn').allTextContents(),turns);
    assert.equal(await session().locator('[data-voice-input]').inputValue(),'My unfinished practice draft.');
  });
  await test('Permission failure supports text fallback and safely renders typed practice text',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');
    await session().locator('[data-voice-consent]').check();await scenario('permission');
    assert.match(await session().locator('.voice-error').innerText(),/No permission was requested here/i);
    await act('text-mode').click();
    assert.equal(await session().locator('.voice-stage').getAttribute('data-channel'),'text');
    const contrast=await session().locator('[data-voice-input]').evaluate(el=>{
      const text=getComputedStyle(el,'::placeholder');const field=getComputedStyle(el);
      const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
      const bg=rgb(field.backgroundColor);const alpha=Number(text.opacity);const fg=rgb(text.color).map((c,i)=>c*alpha+bg[i]*(1-alpha));
      const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,'Placeholder contrast below 4.5:1: '+contrast);
    const text='<em data-voice-injected>My typed practice</em>';
    await session().locator('[data-voice-input]').fill(text);
    await session().locator('form[data-voice-form] button[type=submit]').click();
    assert.equal(await session().locator('.voice-turn[data-speaker="you"] p').last().innerText(),text);
    assert.equal(await page.locator('[data-voice-injected]').count(),0);
    assert.equal(await act('mute').count(),0);
    await shot('text-fallback','/dashboard/ai-tools?tab=session&agent=counselor');
  });
  await test('Text fallback before consent cannot start a conversation',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=readiness');await act('text-mode').click();
    assert.equal(await act('start').isDisabled(),true);
    assert.equal(await session().locator('.voice-turn').count(),0);
    assert.equal(await session().locator('form[data-voice-form]').count(),0);
  });
  await test('Lilley context failure stays unknown until explicit recovery',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');await scenario('context');
    assert.match(await session().locator('.voice-context').innerText(),/unavailable.*not shown as empty or up to date/is);
    assert.equal(await act('start').isDisabled(),true);
    await session().locator('[data-voice-consent]').check();await act('start').click();
    await session().locator('.voice-stage[data-phase="speaking"],.voice-stage[data-phase="listening"]').waitFor();
    assert.match(await session().locator('.voice-context').innerText(),/No live sync checked/);
  });
  await test('Empty transcript does not invent a saved plan or conversation',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=mock');await scenario('empty');
    assert.equal(await session().locator('.voice-turn').count(),0);
    assert.match(await session().locator('.voice-transcript').innerText(),/No action plan or saved conversation was created/);
    assert.equal(await session().locator('.voice-stage > .voice-receipt').count(),0);
  });
  await test('Resume suggestions require explicit acceptance and preserve intervening edits',async()=>{
    await go('/dashboard/ai-tools?tab=studio&agent=resume');
    const draft=session().locator('[data-voice-draft]');const original=await draft.inputValue();
    await act('reject').click();assert.equal(await draft.inputValue(),original);
    await act('review-suggestion').click();await act('accept').click();
    const accepted=await draft.inputValue();assert.notEqual(accepted,original);assert.match(accepted,/Troubleshot customer technical issues/);
    assert.equal(await act('accept').count(),0);
    await act('save-draft').click();assert.match(await session().locator('.voice-context').innerText(),/VOICE-DRAFT-001.*local snapshot only/);
    await draft.fill('My revised sample draft keeps an entirely different and accurate example.');
    assert.doesNotMatch(await session().locator('.voice-context').innerText(),/snapshot matches this text/,'Edited draft must not retain a saved-match status');
    await act('review-suggestion').click();await act('accept').click();
    assert.equal(await draft.inputValue(),'My revised sample draft keeps an entirely different and accurate example.');
    assert.match(await session().locator('.voice-context').innerText(),/original text changed.*not applied/is);
    await go('/dashboard/resume',{fresh:false});
    assert.equal(await page.getByLabel('Résumé text',{exact:true}).inputValue(),original,'Voice draft must not overwrite the saved résumé');
  });
  await test('Interview context stays attached to the selected role and language',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=mock');
    await session().locator('[data-voice-field="role"]').fill('Service Desk Technician');
    await session().locator('[data-voice-field="interviewType"]').selectOption('Technical');
    await session().locator('[data-voice-field="language"]').selectOption('Spanish');
    await start();assert.match(await session().locator('.voice-turn').first().innerText(),/Service Desk Technician/);
    assert.equal(await session().locator('[data-voice-field="language"]').inputValue(),'Spanish');
    assert.match(await session().locator('.voice-context').innerText(),/No camera is opened/);
  });
  await test('Studio and dedicated Lilley disclose different existing retention behavior',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');await session().locator('.voice-privacy details summary').click();
    assert.match(await session().locator('.voice-privacy').innerText(),/does not save the transcript to AI history or coach memory/);
    await go('/dashboard/counselor');await session().locator('.voice-privacy details summary').click();
    assert.match(await session().locator('.voice-privacy').innerText(),/captured transcript can be saved to AI history.*emailed to configured/is);
    assert.match(await session().locator('.voice-privacy').innerText(),/does not request a microphone.*or send a transcript/is);
  });
  await test('Business is a broader Lilley entry and unknown agent keys recover safely',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=business');assert.match(await session().innerText(),/same Lilley agent/);
    await go('/dashboard/ai-tools?tab=session&agent=not-a-real-agent');
    assert.equal(await session().getAttribute('data-agent'),'counselor');
    assert.match(await page.locator('#screen-content').innerText(),/That coach is not available/);
  });
  await test('Staff, employer, and partner keep role-specific sessions and handoffs',async()=>{
    for(const [path,agent]of [['/counselor/overview','counselor_staff'],['/employer','employer'],['/partner','partner']]){
      await go(path);await page.locator('[data-voice-action="toggle-role"]').click();
      assert.equal(await session().getAttribute('data-agent'),agent);
      assert.equal(await session().locator('a[href^="#/dashboard"]').count(),0,'Role assistant handed off to member workspace');
      await shot(agent+'-expanded',path);
      if(agent==='counselor_staff'){
        await scenario('unavailable');assert.match(await session().locator('.voice-error').innerText(),/will not be replaced by a student agent/);
        assert.equal(await session().getAttribute('data-agent'),'counselor_staff');
      }
      await fit();
    }
  });
  await test('Coach selector changes the agent without mixing sessions or losing navigation',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');await start();
    await page.locator('[data-voice-agent-choice]').selectOption('resume');
    await page.locator('[data-voice-session][data-agent="resume"]').waitFor();
    assert.equal(await session().locator('.voice-turn').count(),0);
    assert.equal(await session().locator('[data-voice-consent]').isChecked(),false);
    assert.match(page.url(),/agent=resume/);
    await page.locator('[data-voice-agent-choice]').selectOption('business');
    await page.locator('[data-voice-session][data-agent="business"]').waitFor();
    assert.match(await session().innerText(),/same Lilley agent/);await fit();
  });

  // Source-grounded route contracts retain the full portal review shell.
  const entries=[
    ['/dashboard/ai-tools','voice-studio'],
    ['/dashboard/ai-tools?tab=session&agent=readiness','readiness-coach'],
    ['/dashboard/ai-tools?tab=session&agent=resume','resume-coach'],
    ['/dashboard/ai-tools?tab=session&agent=mock','mock-interview'],
    ['/dashboard/ai-tools?tab=session&agent=counselor','lilley'],
    ['/dashboard/ai-tools?tab=session&agent=business','business-lilley'],
    ['/dashboard/counselor','dedicated-lilley'],
    ['/dashboard/readiness','readiness-page'],
    ['/counselor/overview','staff-assistant'],
    ['/employer','employer-assistant'],
    ['/partner','partner-assistant'],
  ];
  for(const [path,name]of entries){
    await test(`${name} is reachable, fits, and links only to known routes`,async()=>{
      await go(path);await fit();
      assert.ok(await page.locator('.voice-workspace,.voice-entry').count()>0,'Voice entry missing');
      if(['voice-studio','resume-coach','mock-interview','staff-assistant','employer-assistant','partner-assistant'].includes(name))await shot(name,path);
    });
  }
  await test('Admin workspace does not invent an admin voice agent',async()=>{
    await go('/admin');assert.equal(await page.locator('.voice-workspace,.voice-entry').count(),0);await fit();
  });
  await test('Denied data state does not show an operable voice session',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');
    await page.getByLabel('Review data state').selectOption('denied');
    assert.equal(await page.locator('.voice-stage').count(),0);
    assert.match(await page.locator('#screen-content').innerText(),/don.t have access/i);
  });
  await test('Dark theme retains the voice workspace and responsive geometry',async()=>{
    await go('/dashboard/ai-tools?tab=session&agent=counselor');
    await page.getByLabel('Appearance',{exact:true}).selectOption('dark');
    await fit();await shot('lilley-dark','/dashboard/ai-tools?tab=session&agent=counselor');
  });
  await context.close();
}

try{for(const width of [1024,375])await runAtWidth(width);}
finally{
  await browser.close();
  report.summary={pass:report.tests.filter(t=>t.result==='pass').length,fail:report.tests.filter(t=>t.result==='fail').length,pageErrors:report.pageErrors.length,externalRequests:report.externalRequests.length,mediaCalls:report.mediaCalls.length,screenshots:report.screenshots.length};
  writeFileSync(resolve(out,'voice-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary,null,2));
  if(report.summary.fail||report.summary.pageErrors||report.summary.externalRequests||report.summary.mediaCalls){console.log(JSON.stringify({failures:report.tests.filter(t=>t.result==='fail'),pageErrors:report.pageErrors,externalRequests:report.externalRequests,mediaCalls:report.mediaCalls},null,2));process.exitCode=1;}
}
