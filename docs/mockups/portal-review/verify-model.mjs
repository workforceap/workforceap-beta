import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(`${root}/review-model.mjs`,'utf8');
const model=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const inventory=JSON.parse(readFileSync(`${root}/route-inventory.json`,'utf8'));
const results=[];
function check(name,fn){try{fn();results.push({name,result:'pass'});}catch(error){results.push({name,result:'fail',error:error.message});}}

check('all proposed primary navigation destinations resolve',()=>{
 const missing=Object.entries(model.PRIMARY_NAV).flatMap(([role,items])=>items.filter(([,path])=>!model.resolveRoute(path,inventory.routes)).map(([,path])=>({role,path})));
 assert.deepEqual(missing,[]);
});
check('all non-not-found fixture paths resolve to their own route template',()=>{
 const mismatched=inventory.routes.filter(r=>r.kind!=='not-found').filter(r=>model.resolveRoute(model.fixturePath(r.route),inventory.routes)?.route!==r.route).map(r=>({source:r.route,resolved:model.resolveRoute(model.fixturePath(r.route),inventory.routes)?.route}));
 assert.deepEqual(mismatched,[]);
});
check('unknown dashboard route is not treated as a loaded page',()=>assert.equal(model.resolveRoute('/dashboard/no-such-screen-review',inventory.routes),null));
check('known job detail retains a specific source route',()=>assert.equal(model.resolveRoute('/dashboard/jobs/sample-002',inventory.routes)?.route,'/dashboard/jobs/[id]'));
check('identical request key does not duplicate a sample message',()=>{
 const d=model.createFixture(); const r={kind:'message',key:'same-request',payload:{text:'Sample message'}};
 assert.equal(model.demoMutation(d,r).ok,true); assert.equal(model.demoMutation(d,r).duplicate,true); assert.equal(d.messages.length,3); assert.equal(d.receipts.length,1);
});
check('same key with different payload is rejected as a mismatch',()=>{
 const d=model.createFixture();model.demoMutation(d,{kind:'message',key:'same-request',payload:{text:'Original message'}});
 const changed=model.demoMutation(d,{kind:'message',key:'same-request',payload:{text:'Different message'}});
 assert.equal(changed.ok,false,'A changed request must not look like successful replay of its own payload.');
});
check('stale profile version preserves the saved profile',()=>{
 const d=model.createFixture(); const before=JSON.stringify(d.profile);
 const r=model.demoMutation(d,{kind:'profile',key:'stale',expectedVersion:0,payload:{name:'Edited',email:'edited@example.invalid'}});
 assert.equal(r.conflict,true); assert.equal(JSON.stringify(d.profile),before);
});
check('staff cannot review private lab draft before submission',()=>{
 const d=model.createFixture(); const r=model.demoMutation(d,{kind:'lab-review',key:'private-review',expectedVersion:1,payload:{feedback:'Please revise'}});
 assert.equal(r.ok,false);assert.equal(d.lab.feedback,null);
});
check('submitted lab copy survives subsequent private edits',()=>{
 const d=model.createFixture(); const original=d.lab.text;
 assert.equal(model.demoMutation(d,{kind:'lab-share',key:'share',expectedVersion:1,payload:{confirmed:true}}).ok,true);
 assert.equal(model.demoMutation(d,{kind:'lab-draft',key:'edit',expectedVersion:2,payload:{text:'A different private draft'}}).ok,true);
 assert.equal(d.lab.submission.text,original);assert.notEqual(d.lab.text,original);
});
check('uncertain sample request reconciles without duplicate persistence',()=>{
 const d=model.createFixture(); const r={kind:'message',key:'uncertain-request',payload:{text:'Original uncertain message'},uncertain:true};
 assert.equal(model.demoMutation(d,r).uncertain,true);assert.equal(d.messages.length,2);
 assert.equal(model.demoMutation(d,{...r,uncertain:false}).uncertain,true);assert.equal(d.messages.length,2);
 assert.equal(model.reconcileDemo(d,'uncertain-request').ok,true);assert.equal(d.messages.length,3);
 assert.equal(model.demoMutation(d,{...r,uncertain:false}).duplicate,true);assert.equal(d.messages.length,3);
});
check('duplicate application for the same member and job is refused',()=>{
 const d=model.createFixture();const r=model.demoMutation(d,{kind:'application',key:'duplicate-job',payload:{jobId:'sample-001',confirmed:true}});
 assert.equal(r.ok,false);assert.equal(d.applications.length,2);
});
check('application for an unknown job is refused',()=>{
 const d=model.createFixture();const r=model.demoMutation(d,{kind:'application',key:'unknown-job',payload:{jobId:'does-not-exist',confirmed:true}});
 assert.equal(r.ok,false,'Unknown job IDs must not create apparently valid application receipts.');
});
check('application for a draft job is refused',()=>{
 const d=model.createFixture();const r=model.demoMutation(d,{kind:'application',key:'draft-job',payload:{jobId:'sample-003',confirmed:true}});
 assert.equal(r.ok,false,'Draft jobs must not accept a member application.');
});

check('editing a job preserves its identity and publication state',()=>{
 const d=model.createFixture();const count=d.jobs.length;const id='sample-001';const before=d.jobs.find(j=>j.id===id);
 const state=before.state;
 const r=model.demoMutation(d,{kind:'job',key:'job-edit',expectedVersion:before.version,payload:{id,title:'Edited synthetic role',location:'Synthetic location'}});
 assert.equal(r.ok,true);assert.equal(d.jobs.length,count);assert.equal(d.jobs.find(j=>j.id===id).state,state);assert.equal(d.jobs.find(j=>j.id===id).title,'Edited synthetic role');
});
check('stale job edit does not replace a newer version',()=>{
 const d=model.createFixture();const before=JSON.stringify(d.jobs);
 const r=model.demoMutation(d,{kind:'job',key:'job-stale',expectedVersion:0,payload:{id:'sample-001',title:'Stale title',location:'Synthetic location'}});
 assert.equal(r.conflict,true);assert.equal(JSON.stringify(d.jobs),before);
});
check('malformed encoded route parameter does not crash navigation',()=>{
 assert.doesNotThrow(()=>model.routeParams('/dashboard/jobs/[id]','/dashboard/jobs/%E0%A4%A'));
});

const receipt={kind:'independent-standalone-model-review',modelSha256:createHash('sha256').update(source).digest('hex'),node:process.version,passed:results.filter(r=>r.result==='pass').length,failed:results.filter(r=>r.result==='fail').length,applicationTests:false,browserTests:false,liveAcceptance:false,results};
const evidence=resolve(process.env.WAP_REVIEW_EVIDENCE_DIR||root);
mkdirSync(evidence,{recursive:true});
writeFileSync(resolve(evidence,'model-results.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
process.exitCode=receipt.failed?1:0;
