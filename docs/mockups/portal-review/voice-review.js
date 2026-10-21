/* Offline voice design review. Source: VoiceStudioKit, PortalVoiceSession,
 * ResumeCoachWorkspace, agentRegistry and voiceAgentSurfaces. No device,
 * provider, storage, email or application API is used by this simulation. */
const VOICE_REVIEW_AGENTS = {
  counselor: {name:'Lilley Career Coach',registry:'counselor',identity:'Lilley — WorkforceAP Student Career Coach',tone:'blue',icon:'headphones',eyebrow:'Your plan & progress',description:'Talk through your next step, training, and job search with Lilley.',prompt:'What should I focus on this week?',reply:'Start with the next activity in your training plan. Then bring one concrete troubleshooting example into your résumé. If the plan does not match your situation, open a conversation with your counselor.',prompts:['What should I focus on this week?','Help me prepare a question for my counselor.','How do I connect my training to a job?']},
  readiness: {name:'Readiness Coach',registry:'readiness',identity:'WorkforceAP Career Readiness Coach',tone:'gold',icon:'target',eyebrow:'One clear next step',description:'Turn your résumé, training, and interview goals into a manageable next step.',prompt:'I have 30 minutes. Where should I start?',reply:'Choose one task you can finish today: improve the troubleshooting example in your résumé. Keep the example accurate, then review your readiness checklist for the next milestone.',prompts:['I have 30 minutes. Where should I start?','Help me get ready for an interview.','What should I ask about my next milestone?']},
  resume: {name:'Resume Coach',registry:'resume_coach',identity:'WorkforceAP Student Resume Coach',tone:'crimson',icon:'file',eyebrow:'Your experience, clearly written',description:'Work through your draft line by line. You decide which changes belong in your résumé.',prompt:'Make my troubleshooting example clearer without adding claims.',reply:'Keep the action specific and the result honest. The example rewrite is ready in the draft panel. Compare it with your experience, then accept or reject it; nothing changes automatically.',prompts:['Make my troubleshooting example clearer without adding claims.','Help me explain a gap honestly.','Which skills need a supporting example?']},
  mock: {name:'Mock Interview',registry:'interview',identity:'WorkforceAP Interview Coach',tone:'deep',icon:'audio',eyebrow:'Practice the conversation',description:'Rehearse for the role you name, then review the clarity and evidence in your answer.',prompt:'I helped a customer work through a connection problem.',reply:'Tell me what you checked first, what you did next, and what changed for the customer. Use a real example; if you do not know a result, say what you learned instead.',prompts:['I helped a customer work through a connection problem.','Can we practice a behavioral question?','Help me make this answer more concise.']},
  business: {name:'Career & Business Coach',registry:'career_business',identity:'Lilley — broader career & business coaching',tone:'crimson',icon:'briefcase',eyebrow:'Lilley, in a wider lane',description:'Talk through project management, sales, marketing, or workplace communication with Lilley.',prompt:'Help me explain a project delay to my team.',reply:'Name the goal, the current blocker, and the next decision. Explain what you know, what remains uncertain, and when you will update the team. Keep the message grounded in your actual project.',prompts:['Help me explain a project delay to my team.','Help me prepare for a sales conversation.','How can I frame a marketing idea clearly?']},
  counselor_staff: {name:'Counselor voice assistant',registry:'counselor_staff',identity:'WorkforceAP Counselor Assistant',tone:'blue',icon:'message',eyebrow:'Staff workspace',description:'Talk through member support, outreach, and using the counselor workspace.',prompt:'Help me prepare for a member check-in.',reply:'Open the assigned member record and review its current status. Prepare one question about the next step and one about a blocker. Record any follow-up through the existing counselor workflow.',prompts:['Help me prepare for a member check-in.','Where do I review member progress?','Help me plan an outreach conversation.']},
  employer: {name:'Employer assistant',registry:'employer',identity:'WorkforceAP Employer Concierge',tone:'crimson',icon:'briefcase',eyebrow:'Your hiring workspace',description:'Get help with job postings, applicants, and navigating your employer portal.',prompt:'Help me prepare a clear job description.',reply:'Separate the essential responsibilities from skills someone can learn. Review the job draft in your employer workspace and confirm the details there before making a posting available.',prompts:['Help me prepare a clear job description.','Where can I review my applicants?','Help me describe the interview process.']},
  partner: {name:'Partner assistant',registry:'partner',identity:'WorkforceAP Partner Concierge',tone:'gold',icon:'users',eyebrow:'Your referral workspace',description:'Ask about referrals, member progress, or using the partner portal.',prompt:'Where should I look for a referral update?',reply:'Open your referred members and select the member you are authorized to view. Use the recorded status and date; if the information is missing, ask for a staff update instead of assuming an outcome.',prompts:['Where should I look for a referral update?','Help me explain the referral process.','How do I find partner resources?']},
  wioa: {name:'WIOA Pre-Qualification Guide',registry:'wioa_prequal',identity:'WorkforceAP WIOA Pre-Qualification Guide',tone:'gold',icon:'help',eyebrow:'Understand the questions',description:'Talk through the pre-qualification process and prepare questions for a human reviewer.',prompt:'What should I do if I am unsure about an answer?',reply:'Use the answer you can support and ask staff when you are unsure. This guide does not determine eligibility, approve funding, or replace a review of your circumstances.',prompts:['What should I do if I am unsure about an answer?','How do I prepare for a staff review?','What does pre-qualification mean?']}
};
const voiceReviewState = {sessions:new Map(),expanded:new Set(),fixture:null,path:'',installed:false,receipt:0};
const VOICE_HUB_KEYS = ['counselor','readiness','resume','mock','business'];
const VOICE_ORIGINAL_BULLET = 'Helped customers resolve technical issues and documented follow-up steps.';
const VOICE_REVISED_BULLET = 'Troubleshot customer technical issues, explained the next steps, and documented follow-up actions.';
function voiceEnsureFixture(){
  if(voiceReviewState.fixture===data)return;
  for(const s of voiceReviewState.sessions.values())s.transition++;
  voiceReviewState.sessions.clear();voiceReviewState.expanded.clear();voiceReviewState.fixture=data;voiceReviewState.receipt=0;
}
function voiceSession(agent,scope='hub'){
  voiceEnsureFixture();
  if(voiceReviewState.path!==currentPath){for(const prior of voiceReviewState.sessions.values())if(['connecting','listening','speaking'].includes(prior.phase)){prior.transition++;prior.phase='ended';prior.muted=false;}voiceReviewState.path=currentPath;}
  const key=scope+'-'+agent;
  if(!voiceReviewState.sessions.has(key))voiceReviewState.sessions.set(key,{key,agent,scope,phase:'idle',consent:false,muted:false,textMode:false,text:'',turns:[],error:'',errorKind:'',transition:0,seconds:0,draft:data.resume?.text||VOICE_ORIGINAL_BULLET,suggestion:'pending',savedDraft:null,receipt:'',role:data.profile?.goal||'IT support specialist',interviewType:'Behavioral',language:'English',topic:'Workplace communication',contextMissing:false});
  return voiceReviewState.sessions.get(key);
}
function voiceButton(label,name,extra='',cls='button',ico=''){
  return `<button type="button" class="${cls}" data-voice-action="${name}" ${extra}>${ico?icon(ico):''}<span>${esc(label)}</span></button>`;
}
function voiceHubLink(agent,tab='session',label='Open coach',cls='button'){
  return link('/dashboard/ai-tools?tab='+tab+'&agent='+agent,label,cls,'arrow');
}
function voiceSessionQuery(){
  const query=new URLSearchParams((currentPath.split('?')[1]||'').split('#')[0]);
  const raw=query.get('agent');const requested=query.get('tab')||'coaches';
  return {agent:VOICE_HUB_KEYS.includes(raw)?raw:'counselor',unknown:Boolean(raw&&!VOICE_HUB_KEYS.includes(raw)),tab:['coaches','session','studio','toolkit'].includes(requested)?requested:'coaches'};
}
function voiceTabs(tab,agent){
  return `<nav class="voice-tabs" aria-label="AI Career Tools views">${[['coaches','Coaches'],['session','Practice'],['studio','Resume'],['toolkit','All Tools']].map(([key,label])=>`<a class="voice-tab" href="${routeHref('/dashboard/ai-tools?tab='+key+'&agent='+agent)}"${key===tab?' aria-current="page"':''}>${esc(label)}</a>`).join('')}</nav>`;
}
function voiceCoachGrid(selected){
  return `<section aria-labelledby="voice-coaches-title"><div class="voice-title-row"><div><p class="voice-eyebrow">Choose your conversation</p><h2 id="voice-coaches-title">A coach for the next step</h2></div><p class="voice-meta">Five coaching experiences · your pace</p></div><div class="voice-coaches">${VOICE_HUB_KEYS.map(key=>{const a=VOICE_REVIEW_AGENTS[key];return `<a class="voice-coach" data-tone="${a.tone}" data-selected="${selected===key}" href="${routeHref('/dashboard/ai-tools?tab=session&agent='+key)}"${selected===key?' aria-current="true"':''}>${icon(a.icon)}<span class="voice-eyebrow">${esc(a.eyebrow)}</span><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p><span class="voice-meta">${key==='business'?'Same Lilley · broader topics':'Open practice workspace'} ${icon('arrow')}</span></a>`;}).join('')}</div></section>`;
}
function voiceStudio(){
  if(current?.role!=='member')return '';
  const q=voiceSessionQuery();const agent=q.tab==='studio'?'resume':q.agent;
  return `<div class="voice-workspace" data-tone="${VOICE_REVIEW_AGENTS[agent].tone}"><header class="voice-hero"><div><p class="voice-eyebrow">A conversation can move you forward</p><h2>Find your next step. Talk it through.</h2><p class="voice-description">Practice an interview, strengthen your résumé, or make a plan with Lilley. Your voice belongs at the center of your career journey.</p></div><span class="voice-demo">${icon('shield')} Simulated session · no microphone or provider connection</span></header>${voiceTabs(q.tab,agent)}<div class="voice-agent-choice"><label for="voice-agent-choice">Choose your coach</label><select id="voice-agent-choice" data-voice-agent-choice>${VOICE_HUB_KEYS.map(key=>`<option value="${key}" ${key===agent?'selected':''}>${esc(key==='business'?'Lilley · broader career & business':VOICE_REVIEW_AGENTS[key].name)}</option>`).join('')}</select></div>${q.unknown?'<p class="voice-tip">That coach is not available in this review. Lilley is selected; you can choose another coach below.</p>':''}${q.tab==='toolkit'?legacyToolHub():`${voiceSessionView(agent,'hub')}${q.tab==='coaches'||q.tab==='session'?voiceCoachGrid(agent):''}`}</div>`;
}
function voiceRetention(s){
  if(s.scope==='hub')return 'In the existing AI Career Tools practice tab, WorkforceAP does not save the transcript to AI history or coach memory.';
  if(s.scope==='member-lilley'||s.scope==='member-business')return 'In this existing dedicated coach flow, a captured transcript can be saved to AI history, used to update coach memory, and emailed to configured WorkforceAP support recipients.';
  if(s.scope==='readiness')return 'The existing readiness flow can checkpoint a captured transcript and submit it for counselor feedback.';
  if(s.scope==='interview')return 'The existing interview flow can submit a captured transcript for review. Camera recording is a separate, optional experience; this preview never opens a camera.';
  if(s.agent==='resume')return 'The existing résumé coach shares the résumé context needed for coaching. Draft changes remain subject to your review and acceptance.';
  return 'The existing voice service processes audio and the live transcript. This review does not establish a provider retention setting or a saved transcript history.';
}
function voicePrivacy(s){
  const lilley=['counselor','business'].includes(s.agent);
  const context=lilley?'Lilley may receive saved next-step, program, and progress facts through approved read-only tools.':s.agent==='resume'?'The existing résumé flow can share extracted résumé text, the live draft, profile/program context, skills, eligibility context and prior coach-memory summary.':s.agent==='counselor_staff'?'The staff assistant is separate from student Lilley. An unavailable staff assistant does not fall back to a student agent.':s.agent==='wioa'?'This guide cannot approve eligibility or funding. Use sample information in this preview.':'Stay within the records and actions available in your workspace.';
  const active=['connecting','listening','speaking'].includes(s.phase);
  return `<div class="voice-privacy"><div class="voice-title-row"><strong>${icon('shield')} Before you begin</strong><span class="voice-meta">Your choice, your context</span></div><p>This preview uses example replies and keeps typed text only in this open review. It does not request a microphone, connect to a voice provider, or send a transcript.</p><details><summary id="voice-policy-${s.key}">How this entry works in the existing app</summary><p>ElevenLabs processes microphone audio and the live transcript in an actual voice session. ${esc(context)}</p><p>${esc(voiceRetention(s))}</p><p>Do not include passwords, Social Security numbers, or financial account details.</p></details><label class="voice-consent" for="voice-consent-${s.key}"><input id="voice-consent-${s.key}" type="checkbox" data-voice-consent ${s.consent?'checked':''} ${active?'disabled':''}><span>I understand this is a simulation and want to try the session preview.</span></label></div>`;
}
function voiceStatus(s){
  if(s.phase==='error')return s.errorKind==='permission'?'Microphone unavailable · preview':s.errorKind==='disconnect'?'Connection interrupted · preview':'Session unavailable · preview';
  if(s.phase==='connecting')return 'Connecting to the simulated session…';
  if(s.phase==='ended')return 'Session ended · local review only';
  if(s.textMode&&s.phase==='listening')return 'Text mode · ready for your reply';
  if(s.muted&&['listening','speaking'].includes(s.phase))return 'Muted · nothing is being heard';
  if(s.phase==='speaking')return 'Coach response · simulated';
  if(s.phase==='listening')return 'Your turn · simulated listening';
  return 'Ready when you are';
}
function voiceTranscript(s,a){
  return `<section class="voice-transcript" aria-label="Local sample transcript"><div class="voice-title-row"><h3>Conversation</h3><span class="voice-meta">${s.turns.length?`${s.turns.length} example turns`:'No recording'}</span></div><div class="voice-transcript-scroll" id="voice-log-${s.key}" tabindex="0" aria-label="Read conversation">${s.turns.length?s.turns.map(t=>`<div class="voice-turn" data-speaker="${t.who}"><strong>${t.who==='you'?'You':esc(a.name)}</strong><p>${esc(t.text)}</p>${t.who==='coach'?'<span class="voice-meta">Illustrative response · not generated by AI</span>':''}</div>`).join(''):`<div class="voice-transcript-empty">${icon('message')}<p>${s.phase==='ended'?'No transcript was captured. No action plan or saved conversation was created.':'Your conversation will appear here after you explicitly start the preview.'}</p></div>`}</div></section>`;
}
function voiceSessionView(agent,scope){
  const a=VOICE_REVIEW_AGENTS[agent];const s=voiceSession(agent,scope);const live=['listening','speaking'].includes(s.phase);const phase=s.muted&&live?'muted':s.phase;
  let controls='';
  if(s.phase==='idle'||s.phase==='error')controls=voiceButton(s.phase==='error'?'Try connection again':s.textMode?'Start text preview':'Start voice preview','start',`${s.consent?'':'disabled'} id="voice-start-${s.key}"`,'button primary','mic');
  if(s.phase==='connecting')controls=voiceButton('Cancel connection','cancel','','button','close');
  if(live)controls=(s.textMode?'':voiceButton(s.muted?'Unmute':'Mute','mute',`aria-pressed="${s.muted}" id="voice-mute-${s.key}"`,'button',s.muted?'mic-off':'mic'))+voiceButton('Interrupt coach','interrupt',`${s.phase==='speaking'?'':'disabled'}`,'button','pause')+voiceButton('End preview','end','','button','close');
  if(s.phase==='ended')controls=voiceButton('Start another preview','restart','','button primary','refresh');
  if(!s.textMode&&s.phase!=='connecting'&&s.phase!=='ended')controls+=voiceButton('Use text instead','text-mode','','button','message');
  return `<section class="voice-session" data-voice-session="${s.key}" data-agent="${agent}" aria-label="${esc(a.name)} session preview"><div class="voice-title-row"><div><p class="voice-eyebrow">${esc(a.eyebrow)}</p><h2>${esc(a.name)}</h2><p class="voice-meta">${esc(a.identity)}${agent==='business'?' · same Lilley agent':''}</p></div><span class="voice-demo">Simulated session · no microphone or provider connection</span></div><div class="voice-stage-grid"><div class="voice-stage" data-tone="${a.tone}" data-phase="${phase}" data-channel="${s.textMode?'text':'voice'}"><div class="voice-orb" data-state="${s.textMode?'idle':phase}" aria-hidden="true"><span></span><span></span><span></span>${icon(s.muted?'mic-off':a.icon)}</div><p class="voice-status" id="voice-status-${s.key}" tabindex="-1" role="status" aria-atomic="true">${esc(voiceStatus(s))}</p><p class="voice-meta">${s.seconds?String(Math.floor(s.seconds/60)).padStart(2,'0')+':'+String(s.seconds%60).padStart(2,'0')+' example duration · ':''}${s.textMode?'Typed practice':'No live audio'} · ${esc(a.name)}</p>${s.error?`<div class="voice-error" role="alert" tabindex="-1" id="voice-error-${s.key}"><strong>${esc(s.errorKind==='permission'?'Permission-denied example':s.errorKind==='context'?'Context is unavailable':'Session recovery')}</strong><p>${esc(s.error)}</p></div>`:''}${voicePrivacy(s)}<div class="voice-controls">${controls}</div>${voiceTranscript(s,a)}${live?`<div class="voice-chips" aria-label="Example replies">${a.prompts.map((p,i)=>voiceButton(p,'prompt',`data-voice-prompt="${i}" ${s.muted&&!s.textMode?'disabled':''}`,'voice-prompt')).join('')}</div><form class="voice-text-form" data-voice-form><label for="voice-text-${s.key}">${s.textMode?'Type your practice reply':'Type a reply or choose an example'}</label><textarea id="voice-text-${s.key}" data-voice-input maxlength="800" rows="3" placeholder="Use a sample or your own non-sensitive practice example." ${s.muted&&!s.textMode?'disabled':''}>${esc(s.text)}</textarea><p class="voice-meta">Local preview only. Replies below are fixed examples, not an AI assessment.</p><button class="button primary" type="submit" ${s.muted&&!s.textMode?'disabled':''}>${icon('send')} Add practice reply</button></form>`:''}${s.phase==='ended'&&s.turns.length?`<div class="voice-receipt"><strong>Conversation preview complete</strong><p>${s.turns.length} example turns remain in this open review. No production history, email or coach memory was created.</p></div>`:''}${voiceScenarios(s)}</div><aside class="voice-context" aria-label="${esc(a.name)} context and next steps">${voiceContext(s)}</aside></div></section>`;
}
function voiceContextItem(title,value,detail=''){
  return `<div class="voice-context-item"><span class="voice-meta">${esc(title)}</span><strong>${esc(value)}</strong>${detail?`<p>${esc(detail)}</p>`:''}</div>`;
}
function voiceContext(s){
  const panel=(title,body)=>`<section class="voice-panel"><h3>${esc(title)}</h3>${body}</section>`;
  if(s.agent==='resume')return panel('Your live résumé draft',`<p class="voice-meta">Private example draft · no upload or provider connection</p><label for="voice-draft-${s.key}">Review and edit your experience</label><textarea id="voice-draft-${s.key}" data-voice-draft rows="10" maxlength="12000">${esc(s.draft)}</textarea><p class="voice-meta" data-voice-draft-status>${s.savedDraft===s.draft?'Local draft snapshot matches this text.':'Changes are in this preview draft.'}</p>${voiceButton('Store local draft','save-draft','','button','file')}${s.receipt?`<p class="voice-receipt">${esc(s.receipt)} · local snapshot only</p>`:''}`)+panel('Review one suggested change',`<p>Nothing is inserted until you accept. Keep only claims you can support.</p><div class="voice-diff"><span class="voice-meta">Original</span><del>${esc(VOICE_ORIGINAL_BULLET)}</del><span class="voice-meta">Suggested</span><ins>${esc(VOICE_REVISED_BULLET)}</ins></div>${s.suggestion==='pending'?`<div class="voice-controls">${voiceButton('Accept change','accept','','button primary','check')}${voiceButton('Reject change','reject','','button','close')}</div>`:`<p class="voice-receipt" role="status">${s.suggestion==='accepted'?'Accepted into this local draft.':s.suggestion==='rejected'?'Rejected. Your draft is unchanged.':'Your original text changed. The suggestion was not applied.'}</p>${voiceButton('Review example again','review-suggestion','','button small')}`}`)+panel('Next step',voiceHubLink('resume','studio','Open Resume view')+'<p class="voice-meta">Accepting a suggestion does not submit or publish a résumé.</p>');
  if(s.agent==='mock')return panel('Set the interview',`<div class="field"><label for="voice-role-${s.key}">Target role</label><input id="voice-role-${s.key}" data-voice-field="role" maxlength="120" value="${esc(s.role)}"></div><div class="field"><label for="voice-type-${s.key}">Interview type</label><select id="voice-type-${s.key}" data-voice-field="interviewType">${['Behavioral','Technical','General'].map(x=>`<option ${x===s.interviewType?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label for="voice-language-${s.key}">Language</label><select id="voice-language-${s.key}" data-voice-field="language">${['English','Spanish'].map(x=>`<option ${x===s.language?'selected':''}>${x}</option>`).join('')}</select></div><p class="voice-meta">Setup preview; example replies remain in English. No camera is opened.</p>`)+panel('A stronger answer',`<ol class="voice-context-list"><li><strong>Situation</strong><p>Set the scene without unnecessary detail.</p></li><li><strong>Action</strong><p>Explain what you personally did.</p></li><li><strong>Result</strong><p>Use an outcome you can support.</p></li></ol><p class="voice-tip">${s.turns.some(t=>t.who==='you')?'Illustrative feedback: name the first troubleshooting step and explain the outcome. This is not an AI score.':'Add an example answer to preview coaching feedback.'}</p>`)+panel('Review after practice',link('/dashboard/ai-tools/interview-prep','Open interview preparation','button','arrow'));
  if(s.agent==='counselor'||s.agent==='business')return (s.agent==='business'?panel('Bring one real challenge',`<label for="voice-topic-${s.key}">Conversation focus</label><select id="voice-topic-${s.key}" data-voice-field="topic">${['Workplace communication','Project management','Sales','Marketing'].map(x=>`<option ${x===s.topic?'selected':''}>${x}</option>`).join('')}</select><p class="voice-tip">This is Lilley’s broader coaching entry, using the same student career coach identity.</p>`):'')+panel('Context Lilley can use',s.contextMissing?'<p class="voice-error">Saved context is unavailable in this example. It is not shown as empty or up to date.</p>':`<p class="voice-meta">Synthetic fixture · read-only examples</p><div class="voice-context-list">${voiceContextItem('Next step','Continue your training activity','Open the saved plan before changing direction.')}${voiceContextItem('Program','IT Support','The example member is assigned to this program.')}${voiceContextItem('Coursera progress','No live sync checked','Freshness is unknown in this offline review.')}</div><p class="voice-tip">Only next-step, training, and Coursera-progress tools are represented here. This conversation cannot enroll you or change a record.</p>`)+panel('Bring the next step with you',`<div class="voice-controls">${link('/dashboard/program','Open my program','button','book')}${link('/dashboard/messages','Ask my counselor','button','message')}</div><p class="voice-meta">These links open existing review screens. They do not send a message.</p>`);
  if(s.agent==='readiness')return panel('One task at a time',`<ol class="voice-context-list"><li><strong>Strengthen one résumé example</strong><p>Describe the troubleshooting steps you actually took.</p></li><li><strong>Continue your training</strong><p>Use the assigned program’s next activity.</p></li><li><strong>Practice one interview answer</strong><p>Speak about an experience you can explain clearly.</p></li></ol><p class="voice-tip">Illustrative checklist. No readiness score, credential, or interview eligibility is awarded.</p>`)+panel('Take your next step',`<div class="voice-controls">${voiceHubLink('resume','studio','Work on my résumé')}${link('/dashboard/readiness','Open my progress','button','arrow')}</div>`);
  if(s.agent==='counselor_staff')return panel('Staff context stays separate',`<p>The WorkforceAP Counselor Assistant supports the staff workflow. It is not the student Lilley session.</p><div class="voice-context-list">${voiceContextItem('Workspace','Counselor','Use existing assigned-member records for details.')}${voiceContextItem('Agent unavailable','Keep the staff boundary','Do not substitute a student agent.')}</div>`)+panel('Continue in your workspace',`<div class="voice-controls">${link('/counselor/students','Open assigned members','button','users')}${link('/counselor/messages','Open messages','button','message')}</div>`);
  if(s.agent==='employer')return panel('Prepare a useful job brief',`<ol class="voice-context-list"><li>Describe the responsibilities.</li><li>Separate required skills from trainable skills.</li><li>Explain the interview process.</li></ol><p class="voice-tip">The concierge does not post a job, contact an applicant, or make a hiring decision in this review.</p>`)+panel('Your hiring workflow',`<div class="voice-controls">${link('/employer/jobs/new','Prepare a job draft','button','briefcase')}${link('/employer','Return to employer workspace','button','arrow')}</div>`);
  if(s.agent==='partner')return panel('Keep the referral in context',`<div class="voice-context-list">${voiceContextItem('Scope','Your referred members','The assistant is not a directory of all participants.')}${voiceContextItem('Progress','Use recorded status and date','Missing information stays unknown.')}</div>`)+panel('Partner next steps',`<div class="voice-controls">${link('/partner/members','Open referred members','button','users')}${link('/partner/guide','Open partner guide','button','book')}</div>`);
  return panel('Guidance, then staff review',`<ol class="voice-context-list"><li>Understand the question before answering.</li><li>Use information you can support.</li><li>Ask a reviewer when you are unsure.</li></ol><p class="voice-tip">A conversation does not approve eligibility, funding, enrollment, or benefits.</p>`);
}
function voiceScenarios(s){
  return `<details class="voice-scenarios"><summary id="voice-recovery-${s.key}">Preview recovery states</summary><label for="voice-scenario-${s.key}">Choose a simulated issue</label><select id="voice-scenario-${s.key}" data-voice-scenario><option value="">Choose an example…</option><option value="permission">Microphone permission denied</option><option value="unavailable">Voice service unavailable</option><option value="disconnect">Connection interrupted</option><option value="context">Context could not load</option><option value="empty">Ended without a transcript</option></select><p class="voice-meta">These controls simulate a failure locally; they do not test a live service.</p></details>`;
}
function voiceHomeEntry(){
  return `<section class="voice-entry" data-tone="blue" aria-label="Your voice coach"><div class="voice-orb" data-state="idle" aria-hidden="true"><span></span><span></span><span></span>${icon('headphones')}</div><div><p class="voice-eyebrow">Support starts with a conversation</p><h2>Talk it through with Lilley.</h2><p>Your next step, training, or job search. Open a coach workspace and practice at your pace.</p><div class="voice-controls">${voiceHubLink('counselor','session','Meet Lilley','button primary')}${voiceHubLink('readiness','session','Explore Readiness Coach')}</div><p class="voice-meta">Interactive voice mockup · no microphone or provider connection</p></div></section>`;
}
function voicePortalEntry(){
  voiceEnsureFixture();
  const agent={counselor:'counselor_staff',employer:'employer',partner:'partner'}[current?.role];
  if(!agent)return '';
  const a=VOICE_REVIEW_AGENTS[agent];const scope='portal-'+current.role;
  if(current.role==='counselor'&&current.route!=='/counselor/overview')return `<section class="voice-entry" data-tone="blue"><div>${icon('headphones')}<p class="voice-eyebrow">Staff voice support</p><h2>${esc(a.name)}</h2><p>${esc(a.description)}</p>${link('/counselor/overview','Open counselor voice workspace','button','arrow')}</div></section>`;
  return `<section class="voice-entry" data-tone="${a.tone}"><div class="voice-orb" data-state="idle" aria-hidden="true"><span></span><span></span><span></span>${icon(a.icon)}</div><div><p class="voice-eyebrow">${esc(a.eyebrow)}</p><h2>${esc(a.name)}</h2><p>${esc(a.description)}</p>${voiceButton(voiceReviewState.expanded.has(scope)?'Close voice workspace':'Open voice workspace','toggle-role',`data-voice-scope="${scope}" aria-expanded="${voiceReviewState.expanded.has(scope)}" aria-controls="voice-portal-${scope}"`,'button primary','headphones')}<p class="voice-meta">Simulated session · no microphone or provider connection</p></div></section><div id="voice-portal-${scope}">${voiceReviewState.expanded.has(scope)?voiceSessionView(agent,scope):''}</div>`;
}
function voiceResumeEntry(){
  return `<section class="voice-entry" data-tone="crimson"><div>${icon('file')}<p class="voice-eyebrow">Review changes together</p><h2>A résumé coach beside your draft.</h2><p>Talk through a bullet, compare a suggested change, and accept only what represents your experience.</p>${voiceHubLink('resume','studio','Open voice résumé workspace','button primary')}</div></section>`;
}
function voiceRouteView(){
  if(!current||!['ready','saved','uncertain'].includes(mode)||current.kind==='redirect')return null;
  if(current.route==='/dashboard/ai-tools')return voiceStudio();
  const pages={'/dashboard/counselor':['counselor','member-lilley'],'/dashboard/ai-tools/career-business-coach':['business','member-business'],'/dashboard/ai-tools/voice-interview':['mock','interview'],'/dashboard/ai-tools/resume-studio':['resume','resume-workspace']};
  if(current.role==='member'&&pages[current.route]){const [agent,scope]=pages[current.route];return `<div class="voice-workspace">${voiceSessionView(agent,scope)}${voiceHubLink(agent,'coaches','Explore all coaches')}</div>`;}
  if(current.role==='member'&&current.route==='/dashboard/readiness')return `<div class="voice-workspace">${voiceSessionView('readiness','readiness')}</div>${report()}`;
  if(['/wioa-qualification','/dashboard/learning/wioa-qualification'].includes(current.route))return `<div class="voice-workspace">${voiceSessionView('wioa',current.role==='member'?'wioa-member':'wioa-public')}</div>${genericForm()}`;
  return null;
}
function voiceRepaint(focusId,wholePage=false){
  const active=document.activeElement;const id=focusId||active?.id;const start=active?.selectionStart;const end=active?.selectionEnd;
  const focusedKey=active?.closest('[data-voice-session]')?.dataset.voiceSession;const focusedAction=active?.closest('[data-voice-action]')?.dataset.voiceAction;const focusedPrompt=active?.dataset.voicePrompt;const focusedScope=active?.dataset.voiceScope;
  const hosts=[...document.querySelectorAll('[data-voice-session]')];
  if(!wholePage&&hosts.length){for(const host of hosts){const s=voiceReviewState.sessions.get(host.dataset.voiceSession);if(!s)continue;const disclosures=[...host.querySelectorAll('details')].map(d=>d.open);const wrapper=document.createElement('div');wrapper.innerHTML=voiceSessionView(s.agent,s.scope);const replacement=wrapper.firstElementChild;replacement.querySelectorAll('details').forEach((d,i)=>{d.open=Boolean(disclosures[i]);});host.replaceWith(replacement);}}
  else renderShell();
  voiceAfterRender();
  let target=id?document.getElementById(id):null;
  const host=focusedKey?document.querySelector('[data-voice-session="'+focusedKey+'"]'):null;
  if((!target||target.disabled)&&host&&focusedAction){target=host.querySelector('[data-voice-action="'+focusedAction+'"]'+(focusedPrompt!==undefined?'[data-voice-prompt="'+focusedPrompt+'"]':''));if(!target||target.disabled)target=host.querySelector('.voice-controls button:not(:disabled)');}
  if(!target&&wholePage&&focusedScope)target=document.querySelector('[data-voice-action="toggle-role"][data-voice-scope="'+focusedScope+'"]');
  if(target&&!target.disabled){target.focus({preventScroll:true});if(typeof start==='number'&&target.setSelectionRange)try{target.setSelectionRange(start,end);}catch{}}
}
function voiceAnnounce(text){const live=document.getElementById('announcer');if(live)live.textContent=text;}
function voiceLater(s,callback,delay){
  const token=s.transition;
  setTimeout(()=>{if(s.transition!==token||voiceReviewState.sessions.get(s.key)!==s||!document.querySelector('[data-voice-session="'+s.key+'"]'))return;callback();voiceRepaint();},delay);
}
function voiceBegin(s){
  if(['connecting','listening','speaking'].includes(s.phase))return;
  if(!s.consent){s.error='Acknowledge the preview notice before starting.';s.errorKind='consent';voiceRepaint('voice-consent-'+s.key);return;}
  s.transition++;s.error='';s.errorKind='';s.phase='connecting';s.muted=false;
  voiceRepaint();
  voiceLater(s,()=>{s.contextMissing=false;s.phase=s.textMode?'listening':'speaking';if(!s.turns.length)s.turns.push({who:'coach',text:s.agent==='mock'?`Let’s practice for ${s.role}. Tell me about a time you helped someone solve a problem.`:`Let’s work through one useful next step. ${VOICE_REVIEW_AGENTS[s.agent].prompt}`});s.seconds+=6;voiceAnnounce(voiceStatus(s));if(!s.textMode)voiceLater(s,()=>{s.phase='listening';},1300);},650);
}
function voiceReply(s,text){
  if(!['listening','speaking'].includes(s.phase)||s.muted&&!s.textMode)return;
  const clean=String(text||'').trim().slice(0,800);
  if(!clean){voiceAnnounce('Type a practice reply or choose an example.');document.getElementById('voice-text-'+s.key)?.focus();return;}
  s.transition++;s.turns.push({who:'you',text:clean},{who:'coach',text:VOICE_REVIEW_AGENTS[s.agent].reply});s.text='';s.seconds+=24;s.phase=s.textMode?'listening':'speaking';s.error='';
  voiceRepaint('voice-text-'+s.key);voiceAnnounce('Practice reply added. An illustrative coach response is available.');
  if(!s.textMode)voiceLater(s,()=>{s.phase='listening';},1600);
}
function voiceFailure(s,kind){
  s.transition++;s.muted=false;s.errorKind=kind;s.phase=kind==='empty'?'ended':'error';
  const messages={permission:'In this example, microphone access is denied. Check browser permissions in a real session, or continue with the text preview. No permission was requested here.',unavailable:s.agent==='counselor_staff'?'The staff assistant is unavailable in this example. Keep your place and try again; it will not be replaced by a student agent.':'The voice service is unavailable in this example. Keep your draft and try again, or use the local text preview.',disconnect:'The connection stopped in this example. Existing preview turns stay visible. Reconnect explicitly; nothing is sent or repeated automatically.',context:'Saved context could not load in this example. Do not treat it as empty or current. Retry the connection before continuing with that context.'};
  s.error=messages[kind]||'';s.contextMissing=kind==='context';
  if(kind==='empty'){s.turns=[];s.seconds=0;}
  voiceRepaint(kind==='empty'?'voice-status-'+s.key:'voice-error-'+s.key);
}
function voiceAfterRender(){
  voiceEnsureFixture();
  for(const s of voiceReviewState.sessions.values())if(['connecting','listening','speaking'].includes(s.phase)&&!document.querySelector('[data-voice-session="'+s.key+'"]')){s.transition++;s.phase='ended';s.muted=false;}
  voiceReviewState.path=currentPath;
}
function installVoiceReview(root=document){
  if(voiceReviewState.installed)return;voiceReviewState.installed=true;
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-voice-action]');if(!button||button.disabled)return;
    event.preventDefault();const act=button.dataset.voiceAction;
    if(act==='toggle-role'){
      const scope=button.dataset.voiceScope;const allowed={counselor:'portal-counselor',employer:'portal-employer',partner:'portal-partner'}[current?.role];if(scope!==allowed)return;
      if(voiceReviewState.expanded.has(scope)){voiceReviewState.expanded.delete(scope);for(const s of voiceReviewState.sessions.values())if(s.scope===scope){s.transition++;if(['connecting','listening','speaking'].includes(s.phase))s.phase='ended';}}
      else voiceReviewState.expanded.add(scope);voiceRepaint(undefined,true);return;
    }
    const host=button.closest('[data-voice-session]');const s=voiceReviewState.sessions.get(host?.dataset.voiceSession);if(!s)return;
    if(act==='start'){voiceBegin(s);return;}
    if(act==='prompt'){voiceReply(s,VOICE_REVIEW_AGENTS[s.agent].prompts[Number(button.dataset.voicePrompt)]);return;}
    if(act==='cancel'){s.transition++;s.phase='idle';s.error='';}
    if(act==='mute'){s.muted=!s.muted;voiceAnnounce(s.muted?'Preview muted.':'Preview unmuted.');}
    if(act==='interrupt'){s.transition++;s.phase='listening';voiceAnnounce('Coach interrupted. Your turn.');}
    if(act==='end'){s.transition++;s.phase='ended';s.muted=false;s.error='';voiceAnnounce('Preview ended. No transcript was sent.');}
    if(act==='restart'){s.transition++;s.phase='idle';s.consent=false;s.muted=false;s.text='';s.turns=[];s.error='';s.seconds=0;}
    if(act==='text-mode'){if(s.contextMissing){s.error='The saved context is still unavailable. Retry the connection before continuing; the preview will not silently drop that context.';voiceRepaint('voice-error-'+s.key);return;}s.transition++;s.textMode=true;s.muted=false;s.error='';s.errorKind='';if(s.consent){s.phase='listening';if(!s.turns.length)s.turns.push({who:'coach',text:VOICE_REVIEW_AGENTS[s.agent].prompt});}else s.phase='idle';voiceAnnounce('Text preview selected. No microphone is used.');}
    if(act==='accept'&&s.agent==='resume'&&s.suggestion==='pending'){if(s.draft.includes(VOICE_ORIGINAL_BULLET)){s.draft=s.draft.replace(VOICE_ORIGINAL_BULLET,VOICE_REVISED_BULLET);s.suggestion='accepted';voiceAnnounce('Suggestion accepted into the local draft.');}else{s.suggestion='stale';voiceAnnounce('The original text changed. Your draft was preserved.');}}
    if(act==='reject'&&s.agent==='resume'&&s.suggestion==='pending'){s.suggestion='rejected';voiceAnnounce('Suggestion rejected. Your draft is unchanged.');}
    if(act==='review-suggestion'&&s.agent==='resume')s.suggestion='pending';
    if(act==='save-draft'&&s.agent==='resume'){s.savedDraft=s.draft;s.receipt='VOICE-DRAFT-'+String(++voiceReviewState.receipt).padStart(3,'0');voiceAnnounce('Local draft snapshot stored in this open review.');}
    voiceRepaint(act==='text-mode'&&s.consent?'voice-text-'+s.key:undefined);
  });
  root.addEventListener('input',event=>{
    const node=event.target;const s=voiceReviewState.sessions.get(node.closest('[data-voice-session]')?.dataset.voiceSession);if(!s)return;
    if(node.matches('[data-voice-input]'))s.text=node.value;
    if(node.matches('[data-voice-draft]')){s.draft=node.value;const status=node.closest('[data-voice-session]')?.querySelector('[data-voice-draft-status]');if(status)status.textContent=s.savedDraft===s.draft?'Local draft snapshot matches this text.':'Changes are in this preview draft.';}
    if(node.matches('[data-voice-field]')&&['role','interviewType','language','topic'].includes(node.dataset.voiceField))s[node.dataset.voiceField]=node.value;
  });
  root.addEventListener('change',event=>{
    const node=event.target;
    if(node.matches('[data-voice-agent-choice]')){const agent=VOICE_HUB_KEYS.includes(node.value)?node.value:'counselor';const q=voiceSessionQuery();const tab=q.tab==='studio'&&agent!=='resume'?'session':q.tab;location.hash=routeHref('/dashboard/ai-tools?tab='+tab+'&agent='+agent).slice(1);return;}
    const s=voiceReviewState.sessions.get(node.closest('[data-voice-session]')?.dataset.voiceSession);if(!s)return;
    if(node.matches('[data-voice-consent]')){s.consent=node.checked;const button=document.getElementById('voice-start-'+s.key);if(button)button.disabled=!s.consent;}
    if(node.matches('[data-voice-field]')&&['role','interviewType','language','topic'].includes(node.dataset.voiceField))s[node.dataset.voiceField]=node.value;
    if(node.matches('[data-voice-scenario]')&&node.value)voiceFailure(s,node.value);
  });
  root.addEventListener('submit',event=>{const form=event.target.closest('form[data-voice-form]');if(!form)return;event.preventDefault();const s=voiceReviewState.sessions.get(form.closest('[data-voice-session]')?.dataset.voiceSession);if(s)voiceReply(s,form.querySelector('[data-voice-input]').value);});
  voiceAfterRender();
}
