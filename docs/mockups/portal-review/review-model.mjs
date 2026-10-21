/** Isolated design-review model. Never imports application clients or contacts a provider. */
export const REVIEW_BASE_SHA = 'efc27e4a4ebeba09b5261e7b1c36463d01925017';
export const FIXTURE_TIME = '2026-10-20T19:30:00Z';
export const ROLE_HOME = {member:'/dashboard',counselor:'/counselor/today',employer:'/employer',partner:'/partner',admin:'/admin',shared:'/leader/dashboard',entry:'/login'};
export const ROLE_LABEL = {member:'Member',counselor:'Counselor',employer:'Employer',partner:'Partner',admin:'Admin',shared:'Group & shared',entry:'Entry & handoffs'};
export const PRIMARY_NAV = {
 member:[['Home','/dashboard','home'],['My program','/dashboard/program','book'],['Job board','/dashboard/jobs','briefcase'],['AI Career Tools','/dashboard/ai-tools','spark'],['Messages','/dashboard/messages','message']],
 counselor:[['Today','/counselor/today','home'],['My members','/counselor/students','users'],['Work queue','/counselor/queue','list'],['Lab reviews','/counselor/lab-reviews','book'],['Messages','/counselor/messages','message']],
 employer:[['Overview','/employer','home'],['Jobs','/employer/jobs','briefcase'],['Applicants','/employer/applications','users'],['Candidate pipeline','/employer/pipeline','list'],['Messages','/employer/messages','message']],
 partner:[['Overview','/partner','home'],['Referred members','/partner/referred-members','users'],['Attention queue','/partner/attention','list'],['Outcomes','/partner/outcomes','chart'],['Messages','/partner/messages','message']],
 admin:[['Today','/admin','home'],['Applications','/admin/command-center?queue=applications','list'],['Students','/admin/students','users'],['Training progress','/admin/training-progress','book'],['Reporting','/admin/reporting','chart']],
 shared:[['Group overview','/leader/dashboard','home'],['Account','/account','user'],['Resources','/resources','book'],['Help','/help','help'],['Profile','/profile','user']],
 entry:[['Sign in','/login','user'],['Apply','/apply','list'],['Application status','/apply/status','chart'],['Partner signup','/partner-signup','users'],['Mentor application','/mentor/apply','book']],
};
export const TITLE_OVERRIDES = {
 '/dashboard':'Home','/dashboard/program':'My program','/dashboard/readiness':'My progress','/dashboard/ai-tools':'AI Career Tools','/dashboard/jobs':'Job board','/dashboard/profile':'Profile & settings',
 '/dashboard/career-brief/[slug]':'Career plan detail','/dashboard/career-library/[id]':'Career resource','/dashboard/learning/labs/[labId]':'Practice lab','/dashboard/learning/modules/[courseSlug]':'Course workspace','/dashboard/mentors/[mentorId]':'Mentor profile','/dashboard/jobs/[id]':'Job details',
 '/counselor/lab-reviews/[submissionId]':'Review submitted evidence','/counselor/students/[memberId]':'Member overview','/admin/overview':'Detailed overview','/admin/partners/[id]':'Partner organization','/admin/subgroups/[id]':'Subgroup overview','/partner/members/[id]':'Referred member','/resources/[id]':'Resource detail','/admin/blog/preview/[slug]':'Article preview','/admin/email-crons':'Email & cron operations','/admin/feature-flags':'Feature flags','/admin/subgroups':'Subgroups','/admin/members':'Members','/admin/students':'Students','/admin/partners':'Partners','/admin/users':'Users','/admin/certifications':'Certificates','/leader/dashboard':'Group overview','/consent/[token]':'Consent review','/join/[code]':'Join your group','/org/[slug]/outcomes':'Organization outcomes','/enroll/[school]':'School enrollment','/q/[token]':'Screening questionnaire','/survey/placement/[token]':'Placement follow-up',
};
export function titleFor(route){return TITLE_OVERRIDES[route.route] || route.navigation?.label || String(route.title||route.route).replaceAll('&amp;','&');}
export function fixturePath(route){const id=/\/(members|students|candidates|learners)\//.test(route)?'member-001':/\/applications\//.test(route)?'application-001':'sample-001';return route.replace(/\[\.\.\.slug\]/g,'missing-route').replace(/\[([^\]]+)\]/g,(_,key)=>({id,memberId:'member-001',studentId:'member-001',userId:'member-001',submissionId:'submission-001',mentorId:'mentor-001',labId:'lab-001',courseSlug:'sample-it-support',slug:'sample-career-plan',code:'sample-group',token:'sample-token',school:'sample-school',externalEmail:'sample%40example.invalid'}[key]||'sample-001'));}
export function recordPath(template,id){return fixturePath(template.replace(/\[(id|memberId|studentId|userId)\]/,encodeURIComponent(id)));}
function safeDecode(value){try{return decodeURIComponent(value);}catch{return value;}}
export function routeParams(template,path){const keys=template.split('/');const values=path.split('?')[0].split('/');return Object.fromEntries(keys.flatMap((k,i)=>k.startsWith('[')?[[k.slice(1,-1),safeDecode(values[i]||'')]]:[]));}
export function preserveRouteParams(target,sourceTemplate,sourcePath){if(!sourceTemplate)return target;const from=sourceTemplate.split('/');const values=sourcePath.split(/[?#]/)[0].split('/');const parts=target.split('/');return parts.map((part,index)=>{if(!/^\[[^\]]+\]$/.test(part)||!from[index]?.startsWith('['))return part;const sameResource=parts.slice(0,index).every((ancestor,i)=>ancestor===from[i]||ancestor.startsWith('[')&&from[i]?.startsWith('['));return sameResource&&values[index]?values[index]:part;}).join('/');}
export function routePattern(path){return new RegExp('^'+path.split('/').map(p=>p.startsWith('[...')?'.+':p.startsWith('[')?'[^/]+':p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$');}
export function resolveRoute(path,routes){const clean=String(path||'/dashboard').split('?')[0].split('#')[0].replace(/\/$/,'')||'/';return routes.find(r=>r.route===clean)||routes.find(r=>r.dynamic && r.kind!=='not-found' && routePattern(r.route).test(clean))||null;}
export function routeHref(path){return '#'+encodeURI(path).replaceAll('[','%5B').replaceAll(']','%5D');}
export function parentFor(route,routes){const proposed=route.suggestedBack||route.parentRoute||ROLE_HOME[route.role];return resolveRoute(proposed,routes)?proposed:ROLE_HOME[route.role]||'/dashboard';}
export function recordLinks(route,routes){return routes.filter(r=>r.route!==route.route&&r.route.startsWith(route.route.replace(/\/\[[^\]]+\]$/,'')+'/')&&r.kind!=='not-found').slice(0,20);}
export function createFixture(){return {
 version:1,profile:{name:'Alex Morgan',email:'alex.morgan@example.invalid',phone:'(512) 555-0104',city:'Austin, TX',goal:'IT support specialist',version:1},
 members:[{id:'member-001',name:'Alex Morgan',email:'alex.morgan@example.invalid',program:'IT Support',progress:50,status:'In progress',counselor:'Jordan Lee',lastActive:'Oct 20 · 1:45 p.m. CT'},{id:'member-002',name:'Sam Rivera',email:'sam.rivera@example.invalid',program:'Data Analytics',progress:25,status:'Needs information',counselor:'Jordan Lee',lastActive:'Oct 19 · 10:20 a.m. CT'},{id:'member-003',name:'Taylor Chen',email:'taylor.chen@example.invalid',program:'Not assigned',progress:null,status:'Pending review',counselor:'Not assigned',lastActive:'Not recorded'}],
 modules:[{id:'module-001',title:'Computer hardware foundations',state:'Complete'},{id:'module-002',title:'Operating systems essentials',state:'Complete'},{id:'module-003',title:'Troubleshooting a support request',state:'In progress'},{id:'module-004',title:'Networking fundamentals',state:'Not started'}],
 jobs:[{id:'sample-001',title:'IT Support Specialist',company:'Example Technology Co.',location:'Austin, TX · Hybrid',type:'Full time',state:'Open',version:1},{id:'sample-002',title:'Service Desk Technician',company:'Example Technology Co.',location:'Remote · Texas',type:'Full time',state:'Open',version:1},{id:'sample-003',title:'Junior Data Analyst',company:'Example Technology Co.',location:'Austin, TX',type:'Full time',state:'Draft',version:1}],
 applications:[{id:'application-001',memberId:'member-001',jobId:'sample-001',state:'In review',version:1},{id:'application-002',memberId:'member-002',jobId:'sample-002',state:'Applied',version:1}],
 messages:[{id:'msg-001',text:'Hi Alex. Your next practice lab is ready. Send me a note if you get stuck.',from:'Jordan Lee',sender:'counselor',mine:false,createdAt:'2026-10-20T18:00:00Z',status:'Saved in demo'},{id:'msg-002',text:'Thank you. I am working through the troubleshooting steps now.',from:'Alex Morgan',sender:'member',mine:true,createdAt:'2026-10-20T18:08:00Z',status:'Saved in demo'}],
 threadMessages:{employer:[{id:'employer-msg-001',text:'The draft role is ready for your review. Please confirm the responsibilities before requesting publication.',from:'Morgan Reed',sender:'support',createdAt:'2026-10-20T18:10:00Z',status:'Saved in demo'}],partner:[{id:'partner-msg-001',text:'Your sample referral link is ready to review. We can help with the next application handoff.',from:'Maya Patel',sender:'support',createdAt:'2026-10-20T18:15:00Z',status:'Saved in demo'}],admin:[{id:'admin-msg-001',text:'The intake handoff checklist is ready for the staff review.',from:'Operations team',sender:'support',createdAt:'2026-10-20T18:20:00Z',status:'Saved in demo'}]},
 draftMessages:{},drafts:{},uiDrafts:{},draftVersions:{},resume:{state:'available',text:'Alex Morgan\nIT Support Candidate\n\nSummary\nPractical troubleshooting, customer service, and clear documentation.\n\nExperience\nHelped customers resolve technical issues and documented follow-up steps.\n\nSkills\nWindows · Networking fundamentals · Customer support',version:1},
 lab:{text:'I checked the cable and power, recorded the error message, and tested a known working connection.',version:1,submission:null,feedback:null},
 receipts:[],idempotency:{},unknown:{},settings:{},readiness:null,notifications:[],
};}
export function demoMutation(data,request){
 const {kind,key,expectedVersion,payload={}}=request;
 if(!key||typeof key!=='string')return {ok:false,error:'A stable request identifier is required.'};
 const canonical=(value)=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 const identity=JSON.stringify(canonical({kind,expectedVersion,payload}));
 if(data.idempotency[key])return data.idempotency[key].identity===identity?{...data.idempotency[key],duplicate:true}:{ok:false,conflict:true,error:'This request identifier belongs to different content. Keep the original request unchanged.'};
 if(data.unknown[key])return data.unknown[key].identity===identity?{ok:false,uncertain:true,error:'This demo result is still unconfirmed. Reconcile the original request before retrying.'}:{ok:false,conflict:true,error:'An unconfirmed request with this identifier has different content.'};
 if(request.uncertain){data.unknown[key]=JSON.parse(JSON.stringify({...request,identity,uncertain:false}));return {ok:false,uncertain:true,error:'Result not confirmed. Your draft is preserved. Check the original request before sending again.'};}
 const allowed=new Set(['profile','resume','lab-draft','lab-share','lab-review','message','job','application','settings','draft','approval']);
 if(!allowed.has(kind))return {ok:false,error:'This action is not modeled in the review.'};
 const subject=kind==='profile'?data.profile:kind==='resume'?data.resume:kind.startsWith('lab')?data.lab:kind==='job'&&payload.id?data.jobs.find(j=>j.id===payload.id):null;
 if(kind==='job'&&payload.id&&!subject)return {ok:false,error:'The selected sample job no longer exists. Return to the jobs list.'};
 if(subject&&expectedVersion!==subject.version)return {ok:false,conflict:true,error:'This record changed after you opened it. Your changes are still here. Review the latest version before saving.'};
 if(kind==='profile'){
  if(!String(payload.name||'').trim()||!/^\S+@\S+\.\S+$/.test(String(payload.email||'')))return {ok:false,error:'Enter your name and a valid example email.'};
  Object.assign(data.profile,{name:String(payload.name).trim(),email:String(payload.email).trim(),city:String(payload.city||''),goal:String(payload.goal||''),version:data.profile.version+1});
  Object.assign(data.members.find(m=>m.id==='member-001'),{name:data.profile.name,email:data.profile.email});
 }
 if(kind==='resume'){
  if(String(payload.text||'').trim().length<20)return {ok:false,error:'Add at least 20 characters to the sample résumé.'};
  Object.assign(data.resume,{text:String(payload.text),state:'available',version:data.resume.version+1});
 }
 if(kind==='lab-draft'){if(!String(payload.text||'').trim())return {ok:false,error:'Write your observations before saving.'};data.lab.text=String(payload.text);data.lab.version++;}
 if(kind==='lab-share'){
  if(!payload.confirmed)return {ok:false,error:'Review the exact evidence and explicitly confirm sharing.'};
  if(!data.lab.text.trim())return {ok:false,error:'Save your observations before sharing.'};
  data.lab.submission={id:'submission-001',text:data.lab.text,version:data.lab.version,status:'Submitted',createdAt:FIXTURE_TIME};data.lab.version++;
 }
 if(kind==='lab-review'){
  if(!data.lab.submission)return {ok:false,error:'No submitted evidence is available. Private drafts are not reviewable.'};
  if(!String(payload.feedback||'').trim())return {ok:false,error:'Add specific feedback for this submission.'};
  data.lab.feedback=String(payload.feedback);data.lab.submission.status='Revision requested';data.lab.version++;
 }
 if(kind==='message'){
  if(!String(payload.text||'').trim())return {ok:false,error:'Write a message before saving the demo send.'};
  const role=payload.role||'member';
  const target=role==='member'||role==='counselor'?data.messages:data.threadMessages[role];
  if(!target)return {ok:false,error:'No authorized sample conversation is selected.'};
  target.push({id:role+'-msg-'+(target.length+1),text:String(payload.text),from:role==='member'?data.profile.name:role==='counselor'?'Jordan Lee':'Sample '+role,sender:role,mine:true,createdAt:FIXTURE_TIME,status:'Saved in demo · delivery not attempted'});
 }
 if(kind==='job'){
  if(!String(payload.title||'').trim()||!String(payload.location||'').trim())return {ok:false,error:'Add a job title and location.'};
  const fields={title:String(payload.title),location:String(payload.location),type:payload.type||'Full time',contact:String(payload.contact||''),text:String(payload.text||'')};
  if(subject)Object.assign(subject,{...fields,version:subject.version+1});
  else data.jobs.unshift({id:'sample-'+String(data.jobs.length+1).padStart(3,'0'),...fields,company:'Example Technology Co.',state:'Draft',version:1});
 }
 if(kind==='application'){
  if(!payload.confirmed)return {ok:false,error:'Review and confirm the sample application.'};
  const job=data.jobs.find(j=>j.id===payload.jobId);
  if(!job||job.state!=='Open')return {ok:false,error:'This sample role is not open for applications.'};
  if(data.applications.some(a=>a.memberId==='member-001'&&a.jobId===payload.jobId))return {ok:false,error:'A sample application for this job already exists. Open it instead of submitting again.'};
  data.applications.push({id:'application-'+(data.applications.length+1),memberId:'member-001',jobId:payload.jobId,state:'Applied',version:1});
 }
 if(kind==='settings')Object.assign(data.settings,payload);
 if(kind==='draft')data.drafts[payload.route]=payload;
 if(kind==='approval'){if(!payload.confirmed)return {ok:false,error:'An explicit review decision is required.'};const member=data.members.find(m=>m.id===payload.memberId);if(!member)return{ok:false,error:'Sample member not found.'};member.status='Staff review recorded';}
 const receipt={id:'DEMO-'+String(data.receipts.length+1).padStart(4,'0'),kind,createdAt:FIXTURE_TIME,delivery:'Not attempted',key};
 data.receipts.push(receipt);data.version++;
 const result={ok:true,receipt,identity};data.idempotency[key]=result;return result;
}
export function reconcileDemo(data,key){const original=data.unknown[key];if(!original)return{ok:false,error:'No unconfirmed request with this identifier.'};delete data.unknown[key];return demoMutation(data,original);}
export function loadedMetrics(data){return {modulesComplete:data.modules.filter(m=>m.state==='Complete').length,modulesTotal:data.modules.length,jobsOpen:data.jobs.filter(j=>j.state==='Open').length,applications:data.applications.filter(a=>a.memberId==='member-001').length,members:data.members.length,pending:data.members.filter(m=>m.status==='Pending review'||m.status==='Needs information').length};}
export function viewKind(route){
 const p=route.route;
 if(route.kind==='not-found')return'not-found';
 if(route.kind==='redirect'||route.kind==='role-router')return'redirect';
 if(Object.values(ROLE_HOME).includes(p)||p==='/counselor/overview'||p==='/admin/overview'||p==='/admin/dashboard')return'home';
 if(/\/messages$/.test(p))return'messages';
 if(/resume-studio|\/resume$/.test(p))return'resume';
 if(p==='/dashboard/ai-tools')return'tool-hub';
 if(/\/ai-tools\//.test(p)||p==='/dashboard/counselor')return'tool';
 if(/\/lab-reviews\/\[/.test(p))return'lab-review';
 if(/\/learning\/(labs|modules)\//.test(p))return'lab';
 if(p==='/dashboard/program'||p==='/dashboard/program/start'||p==='/dashboard/learning')return'program';
 if(/\/jobs\/\[id\]$/.test(p))return'job-detail';
 if(/\/jobs$/.test(p))return'jobs';
 if(/\/readiness$|\/weekly-recap$|\/outcomes(?:\/|$)|\/board(?:\/|$)|\/reporting$|\/metrics$|\/analytics(?:\/|$)|\/growth$|\/milestones$|\/points$/.test(p))return'report';
 if(/\/profile$|\/settings$|\/account$/.test(p))return'profile';
 if(/\/new$|\/edit$|\/apply$|\/signup$|\/create-account$|\/invite$|\/walk-in$|\/run$|\/eligibility$|\/screening$|\/wioa-qualification$|\/survey$|\/consent\//.test(p)||route.role==='entry'&&!/status|outcomes|confirmation|thank-you|share/.test(p))return'form';
 if(/\/guide$|\/help$|\/resources(?:\/|$)|\/career-library|\/methodology$|\/privacy$/.test(p))return'resources';
 if(route.dynamic)return'detail';
 return'list';
}
