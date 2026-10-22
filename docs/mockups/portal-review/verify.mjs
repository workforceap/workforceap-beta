/** Repeatable local review QA. No production URL, account, DB, or provider is used. */
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {fixturePath,resolveRoute,titleFor,REVIEW_BASE_SHA} from './review-model.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const source=JSON.parse(readFileSync(resolve(here,'route-inventory.json'),'utf8'));
const out=resolve(process.env.WAP_REVIEW_EVIDENCE_DIR||resolve(here,'evidence'));
mkdirSync(out,{recursive:true});mkdirSync(resolve(out,'screens'),{recursive:true});
const report={baseSha:REVIEW_BASE_SHA,artifactSha256:createHash('sha256').update(readFileSync(resolve(here,'index.html'))).digest('hex'),artifact:'standalone-synthetic-prototype',authenticatedAcceptance:false,applicationScreens:false,routeCount:source.routes.length,routeChecks:[],interactions:[],errors:[],externalRequests:[],screenshots:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const url=pathToFileURL(resolve(here,'index.html')).href;
const smoke=process.argv.includes('--smoke');
const capture=process.argv.includes('--capture');
const interactionsOnly=process.argv.includes('--interactions-only');
report.routeSweepSkipped=interactionsOnly;
const chosen=smoke?source.routes.filter(r=>['/dashboard','/counselor/today','/employer','/partner','/admin','/dashboard/ai-tools/resume-studio','/dashboard/messages','/admin/students','/leader/dashboard','/login'].includes(r.route)):source.routes;
try{
 for(const width of interactionsOnly?[]:smoke?[1440,375]:[1440,768,375])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===375?900:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await context.route('**/*',route=>{const requestURL=route.request().url();if(!requestURL.startsWith('file:')&&!requestURL.startsWith('data:')){report.externalRequests.push(requestURL);return route.abort();}return route.continue();});
  page.on('pageerror',error=>report.errors.push({width,theme,url:page.url(),message:error.message}));
  await page.goto(url);await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
  for(const r of chosen){
   try{
    await page.goto(url+'#'+encodeURI(fixturePath(r.route)));
    await page.locator('main h1').waitFor({state:'visible'});
    const got=await page.locator('main h1').innerText();
    assert.equal(got,r.kind==='not-found'?'Screen not found':titleFor(r));
    const checks=await page.evaluate(()=>({h1s:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1,unnamed:[...document.querySelectorAll('a,button')].filter(e=>e.getClientRects().length&&!e.textContent.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).length,links:[...document.querySelectorAll('a[href^="#/"]')].map(a=>a.getAttribute('href').slice(1)),content:document.getElementById('screen-content').textContent.trim().length}));
    assert.equal(checks.h1s,1);assert.equal(checks.overflow,false,'horizontal overflow');assert.equal(checks.unnamed,0,'unnamed control');assert.ok(checks.content>50,'empty mockup');
    for(const path of checks.links){let decoded;try{decoded=decodeURI(path)}catch{decoded=path}assert.ok(resolveRoute(decoded,source.routes),'broken mockup link '+decoded);}
    report.routeChecks.push({route:r.route,width,theme,result:'pass'});
    if((capture&&theme==='light'&&(width===1440||width===375))||(smoke&&['/dashboard','/admin/students','/dashboard/ai-tools/resume-studio','/counselor/today','/employer','/partner','/dashboard/messages'].includes(r.route))){
     const file=(r.route==='/'?'root':r.route.replaceAll('/','_').replaceAll('[','').replaceAll(']','').replaceAll('.',''))+`-${width}-${theme}.png`;
     await page.screenshot({path:resolve(out,'screens',file),fullPage:true});report.screenshots.push({route:r.route,width,theme,file:'screens/'+file,kind:r.kind});
    }
   }catch(error){report.routeChecks.push({route:r.route,width,theme,result:'fail',message:error.message});}
  }
  await context.close();
 }
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await ctx.newPage();
 await ctx.route('**/*',route=>{if(!route.request().url().startsWith('file:')&&!route.request().url().startsWith('data:')){report.externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 page.on('pageerror',error=>report.errors.push({lane:'interaction',message:error.message}));
 async function test(name,fn){try{await fn();report.interactions.push({name,result:'pass'});}catch(e){report.interactions.push({name,result:'fail',message:e.message});}}
 async function goto(path){await page.goto(url+'#'+encodeURI(path));await page.locator('main h1').waitFor({state:'visible'});}
 await page.goto(url);
 await test('All 266 route contracts are discoverable in the catalog',async()=>{await page.getByRole('button',{name:'All screens & journeys',exact:true}).click();assert.equal(await page.locator('#catalog-results li a').count(),source.routes.length);await page.getByRole('button',{name:'Close',exact:true}).click();});
 await test('Skip link preserves selected counselor route',async()=>{await goto('/counselor/today');await page.getByRole('link',{name:'Skip to workspace',exact:true}).focus?.();await page.locator('.skip').press('Enter');assert.ok(page.url().endsWith('#/counselor/today'));assert.equal(await page.evaluate(()=>document.activeElement?.id),'main');});
 await test('Specific job links retain selected record identity',async()=>{await goto('/dashboard/jobs');await page.getByRole('link',{name:'Service Desk Technician',exact:true}).click();assert.ok(page.url().endsWith('/sample-002'));assert.ok((await page.locator('#screen-content').innerText()).includes('Service Desk Technician'));});
 await test('Specific member links retain selected record identity',async()=>{await goto('/admin/students');await page.getByRole('link',{name:'Sam Rivera',exact:true}).click();assert.ok(page.url().endsWith('/member-002'));assert.ok((await page.locator('#screen-content').innerText()).includes('sam.rivera@example.invalid'));});
 await test('Keep editing cannot submit a profile or discard its unsaved fields',async()=>{await goto('/dashboard/profile');await page.getByLabel('Full name',{exact:true}).fill('Alex Sample Edit');await page.getByRole('button',{name:'Keep editing',exact:true}).click();assert.ok(!(await page.locator('#toast').innerText()).includes('Saved in this review'));await page.getByLabel('Appearance',{exact:true}).selectOption('dark');assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Alex Sample Edit');});
 await test('Profile updates are reflected in subsequent workspace identity',async()=>{await page.getByRole('button',{name:'Save sample profile',exact:true}).click();await goto('/dashboard');assert.ok((await page.locator('.identity').innerText()).includes('Alex Sample Edit'));});
 await test('Résumé failure state retains draft and saved preview updates',async()=>{await goto('/dashboard/resume');await page.getByLabel('Résumé text',{exact:true}).fill('Updated sample résumé with a unique troubleshooting example.');await page.getByLabel('Review data state').selectOption('unavailable');assert.ok((await page.locator('#screen-content').innerText()).includes('couldn’t check'));await page.getByRole('button',{name:'Try again',exact:true}).click();assert.equal(await page.getByLabel('Résumé text',{exact:true}).inputValue(),'Updated sample résumé with a unique troubleshooting example.');await page.getByRole('button',{name:'Save sample résumé',exact:true}).click();assert.ok((await page.locator('.document').innerText()).includes('unique troubleshooting example'));});
 await test('Empty and unavailable remain distinct and recoverable',async()=>{await goto('/admin/students');await page.getByLabel('Review data state').selectOption('empty');assert.ok((await page.locator('#screen-content').innerText()).includes('confirmed empty'));await page.getByLabel('Review data state').selectOption('unavailable');assert.ok((await page.locator('#screen-content').innerText()).includes('couldn’t check'));await page.getByRole('button',{name:'Try again',exact:true}).click();assert.ok((await page.locator('#screen-content').innerText()).includes('Sam Rivera'));});
 await test('Lab sharing requires explicit review and freezes the submitted copy',async()=>{await goto('/dashboard/learning/labs/lab-001');await page.getByLabel('Observations and next steps').fill('First immutable sample submission.');await page.getByRole('button',{name:'Save private sample draft',exact:true}).click();await page.getByRole('button',{name:'Review & share sample',exact:true}).click();assert.ok((await page.locator('#dialog-body').innerText()).includes('First immutable sample submission.'));await page.getByRole('button',{name:'Confirm sample action',exact:true}).click();await page.getByLabel('Observations and next steps').fill('A later private revision that must not replace the submitted copy.');await page.getByRole('button',{name:'Save private sample draft',exact:true}).click();await goto('/counselor/lab-reviews/submission-001');const text=await page.locator('#screen-content').innerText();assert.ok(text.includes('First immutable sample submission.'));assert.ok(!text.includes('A later private revision'));});
 await test('Unconfirmed sample send preserves draft and reconciles the original request once',async()=>{await goto('/dashboard/messages');await page.getByLabel('Review data state').selectOption('uncertain');await page.getByLabel('Message to Jordan Lee').fill('Unique uncertain sample message.');await page.getByRole('button',{name:'Simulate send',exact:true}).click();assert.equal(await page.getByLabel('Message to Jordan Lee').inputValue(),'Unique uncertain sample message.');await page.getByRole('button',{name:'Check original sample result',exact:true}).click();assert.equal(await page.locator('.bubble p').filter({hasText:'Unique uncertain sample message.'}).count(),1);});
 await test('Unknown route renders not found rather than home',async()=>{await goto('/dashboard/definitely-not-a-real-route');assert.equal(await page.locator('h1').innerText(),'Screen not found');});
 await test('All seven standard data states render without page errors',async()=>{await goto('/dashboard/resume');for(const mode of ['loading','empty','unavailable','denied','conflict','saved','ready']){await page.getByLabel('Review data state').selectOption(mode);assert.ok((await page.locator('#screen-content').innerText()).length>50);}});
 await test('Route-local record filters recover when cleared',async()=>{await goto('/admin/students');await page.getByRole('searchbox',{name:'Search sample members',exact:true}).fill('does-not-match');assert.equal(await page.locator('tbody tr:visible').count(),0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await page.locator('tbody tr:visible').count(),3);});
 await test('Nested record routes and their parent keep member-002 identity',async()=>{await goto('/admin/members/member-002');const billing=page.getByRole('link').filter({hasText:'Billing'});assert.ok(await billing.count()>0);await billing.first().click();assert.ok(page.url().includes('/member-002/billing'));await page.getByRole('link',{name:'Back',exact:true}).click();assert.ok(page.url().includes('/member-002'));});
 await test('Domain schemas retain their role and purpose',async()=>{for(const [path,expected,forbidden] of [['/employer/work-queue','Synthetic','/admin/members'],['/admin/pipeline','Synthetic','/employer/applications'],['/dashboard/job-applications','application','/employer/applications'],['/admin/coursera/learners/unmatched/sample%40example.invalid','Synthetic','alex.morgan@example.invalid']]){await goto(path);assert.ok((await page.locator('#screen-content').innerText()).toLowerCase().includes(expected.toLowerCase()));const links=await page.locator('#screen-content a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));assert.ok(links.every(x=>!x.includes(forbidden)));assert.ok(!(await page.locator('#screen-content').innerText()).includes(forbidden));}});
 await test('Staff job review does not expose member-only application navigation',async()=>{for(const role of ['admin','employer']){await goto('/'+role+'/jobs/sample-001');const links=await page.locator('#screen-content a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));assert.ok(links.every(x=>!x.startsWith('#/dashboard/')));if(role==='admin')assert.ok(links.every(x=>!x.startsWith('#/employer/')));}});
 await test('Editing a selected job retains the row and publication state',async()=>{await goto('/employer/jobs/sample-002/edit');assert.equal(await page.getByLabel('Job title',{exact:true}).inputValue(),'Service Desk Technician');await page.getByLabel('Job title',{exact:true}).fill('Updated sample service desk role');await page.getByRole('button',{name:'Save sample job draft',exact:true}).click();await goto('/employer/jobs');assert.equal(await page.locator('tbody tr').count(),3);assert.equal(await page.getByRole('link',{name:'Updated sample service desk role',exact:true}).count(),1);assert.equal(await page.locator('tbody tr').filter({hasText:'Updated sample service desk role'}).locator('.status').innerText(),'Open');});
 await test('Unconfirmed-send recovery blocks a second request and preserves newer edits',async()=>{await goto('/dashboard/messages');await page.getByLabel('Review data state').selectOption('uncertain');await page.getByLabel('Message to Jordan Lee').fill('Original immutable request.');await page.getByRole('button',{name:'Simulate send',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Simulate send',exact:true}).isDisabled(),true);await page.getByLabel('Message to Jordan Lee').fill('Newer unsent draft.');await page.getByLabel('Appearance',{exact:true}).selectOption('light');await page.getByRole('button',{name:'Check original sample result',exact:true}).click();assert.equal(await page.getByLabel('Message to Jordan Lee').inputValue(),'Newer unsent draft.');assert.equal(await page.locator('.bubble p').filter({hasText:'Original immutable request.'}).count(),1);await goto('/employer/messages');assert.ok(!(await page.locator('#screen-content').innerText()).includes('Original immutable request.'));});
 await test('Sensitive domain forms remain read-only and never collect passwords',async()=>{await goto('/apply/create-account');const passwords=page.locator('input[type=password]');assert.equal(await passwords.count(),2);for(const input of await passwords.all()){assert.equal(await input.inputValue(),'');assert.equal(await input.getAttribute('readonly'),'');}assert.equal(await page.locator('#screen-content form').count(),0);await goto('/consent/sample-token');assert.equal(await page.locator('input[type=checkbox]').isDisabled(),true);});
 await test('Malformed record links recover without crashing or revealing a draft job',async()=>{await goto('/dashboard/jobs/%E0%A4%A');assert.ok((await page.locator('#screen-content').innerText()).includes('not found'));await goto('/dashboard/jobs/sample-003');assert.ok((await page.locator('#screen-content').innerText()).includes('not found'));});
 await test('Mobile navigation dialog supports keyboard focus and Escape',async()=>{await page.setViewportSize({width:375,height:900});await goto('/dashboard');await page.getByRole('button',{name:'Open navigation',exact:true}).click();assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')!==null),true);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).evaluate(e=>e===document.activeElement),true);});
 await test('Feature catalog exposes 120 families and searches O*NET and human workspace labels',async()=>{
  await page.setViewportSize({width:1440,height:1000});await goto('/dashboard');
  await page.getByRole('button',{name:'All screens & journeys',exact:true}).click();
  await page.getByRole('button',{name:'Feature preservation',exact:true}).click();
  assert.equal(await page.locator('.feature-entry:visible').count(),120);
  assert.ok((await page.locator('.feature-intro').innerText()).includes('not a claim that every workflow runs'));
  const search=page.getByRole('searchbox',{name:'Find an existing feature',exact:true});
  await search.fill('O*NET');
  assert.ok((await page.locator('.feature-entry:visible > summary strong').allTextContents()).includes('Skill Mapper'));
  for(const [query,label,count] of [['Group','Group & shared',4],['handoffs','Entry & handoffs',10]]){
   await search.fill(query);
   const workspaces=await page.locator('.feature-entry:visible > summary span').allTextContents();
   assert.equal(workspaces.filter(text=>text.includes(label)).length,count,query+' workspace search');
  }
  await search.fill('');assert.equal(await page.locator('.feature-entry:visible').count(),120);
  await page.getByRole('button',{name:'Close',exact:true}).click();
 });
 await test('Every portal group exposes concrete feature obligations and pinned implementation links',async()=>{
  const baseline='https://github.com/workforceap/workforceap-beta/blob/f8a12f527810ba8c1e08840a762358b0fd86e4f1/';
  for(const path of ['/dashboard/ai-tools/skill-mapper','/counselor/today','/employer/jobs','/partner/attention','/admin/command-center','/leader/dashboard','/login']){
   await goto(path);await page.getByRole('button',{name:'View existing features',exact:true}).click();
   assert.equal(await page.getByRole('heading',{name:'Existing features to preserve',exact:true}).count(),1);
   assert.ok(await page.locator('.feature-obligations li:visible').count()>0,path+' has no obligations');
   assert.equal(await page.locator('#dialog-body .routecode').innerText(),path);
   await page.locator('.feature-evidence > summary').first().click();
   const links=await page.locator('.feature-evidence a:visible').evaluateAll(nodes=>nodes.map(node=>node.href));
   assert.ok(links.length>0,path+' has no implementation links');
   assert.ok(links.every(href=>href.startsWith(baseline)),path+' has an unpinned implementation link');
   assert.ok((await page.locator('#dialog-body').innerText()).includes('live integrations and authorization still need authenticated acceptance'));
   await page.getByRole('button',{name:'Close',exact:true}).click();
  }
 });
 await test('Skill Mapper occupation search renders a radar, six exact axes and a member comparison',async()=>{
  await goto('/dashboard/ai-tools/skill-mapper');
  assert.ok((await page.locator('.sm-boundary').innerText()).includes('no live O*NET'));
  await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).fill('IT support');
  await page.getByRole('button',{name:'Search occupations',exact:true}).click();
  await page.locator('.sm-search-results').getByRole('button',{name:/Computer User Support Specialists/}).click();
  assert.equal(await page.locator('#sm-occupation-title').innerText(),'Computer User Support Specialists');
  const scores=page.getByRole('table',{name:'Exact sample axis scores',exact:true});
  assert.deepEqual(await scores.locator('tbody th').allTextContents(),['Analytics','Engineering','Design','Strategy','Service','Research']);
  assert.deepEqual(await scores.locator('tbody td').allTextContents(),['66','74','34','46','82','64']);
  const radar=page.getByRole('img',{name:/Sample occupation skill emphasis/});
  assert.equal(await radar.isVisible(),true);
  assert.ok(await radar.evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)),'occupation radar is blank');
  await page.getByRole('button',{name:'Compare with sample profile',exact:true}).click();
  const comparison=page.getByRole('table',{name:'Exact sample comparison scores',exact:true});
  assert.equal(await comparison.locator('tbody tr').count(),6);
  assert.deepEqual(await comparison.locator('tbody tr').filter({hasText:'Engineering'}).locator('td').allTextContents(),['48','74','+26']);
  assert.equal(await page.getByRole('img',{name:/Sample member profile and target occupation/}).isVisible(),true);
  assert.equal(await page.getByRole('heading',{name:'Skill gaps to explore',exact:true}).count(),1);
 });
 await test('Skill Mapper retains query and target across appearance and navigation, and global reset clears both',async()=>{
  await goto('/dashboard/ai-tools/skill-mapper');
  await page.getByRole('tab',{name:'Occupation search',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).fill('security');
  await page.getByRole('button',{name:'Search occupations',exact:true}).click();
  await page.locator('.sm-search-results').getByRole('button',{name:/Information Security Analysts/}).click();
  await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).fill('Unsaved network exploration');
  for(const theme of ['light','dark']){
   await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
   assert.equal(await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).inputValue(),'Unsaved network exploration');
   assert.equal(await page.locator('#sm-occupation-title').innerText(),'Information Security Analysts');
  }
  await goto('/dashboard');await goto('/dashboard/ai-tools/skill-mapper');
  assert.equal(await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).inputValue(),'Unsaved network exploration');
  assert.equal(await page.locator('#sm-occupation-title').innerText(),'Information Security Analysts');
  assert.ok(await page.locator('.sm-history li').count()>0);
  await page.getByRole('button',{name:'Source & data',exact:true}).click();
  await page.getByRole('button',{name:'Reset all sample data',exact:true}).click();
  assert.equal(await page.getByRole('searchbox',{name:'Search sample occupations',exact:true}).inputValue(),'');
  assert.equal(await page.locator('#sm-occupation-title').count(),0);
  assert.equal(await page.locator('.sm-history li').count(),0);
  assert.equal(await page.getByRole('button',{name:'Try IT support',exact:true}).isVisible(),true);
 });
 await ctx.close();
}finally{await browser.close();report.summary={routePass:report.routeChecks.filter(x=>x.result==='pass').length,routeFail:report.routeChecks.filter(x=>x.result==='fail').length,interactionPass:report.interactions.filter(x=>x.result==='pass').length,interactionFail:report.interactions.filter(x=>x.result==='fail').length,pageErrors:report.errors.length,externalRequests:report.externalRequests.length,screenshots:report.screenshots.length};writeFileSync(resolve(out,'review-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));if(report.summary.routeFail||report.summary.interactionFail||report.errors.length||report.externalRequests.length){console.log(JSON.stringify({routes:report.routeChecks.filter(x=>x.result==='fail').slice(0,20),interactions:report.interactions.filter(x=>x.result==='fail'),errors:report.errors.slice(0,10)},null,2));process.exitCode=1;}}
