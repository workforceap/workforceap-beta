import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const patchDirectory = join(process.cwd(), 'scripts/elevenlabs/patches');
const agents = {
  lilley: 'agent_1101kqfjfm8retm8j6md467wzxdb',
  partner: 'agent_3701kqfjfxxjfm88pgh40h2ca4bs',
  interview: 'agent_4601kqfjaz5rf09bya66s9gg1wvc',
  business: 'agent_5701kqfjg48rf30a8a0gehze8war',
  employer: 'agent_6301kqfjfpexew9bnd64vs8nr7ak',
  wioa: 'agent_7801kqfjg0qwfy68btrqh6jg87kf',
  resume: 'agent_9101kqfjg2z8ew5r3ad4fz6323yr',
  readiness: 'agent_9201kqfjfrkyex086d2cb706xsb0',
} as const;
const supportContext =
  'Nonprofit workforce development: practical, respectful career coaching. No medical, legal, immigration, tax, or financial advice.';
const englishGreeting =
  'Hi - I am your WorkforceAP interview coach. Tell me when you are ready, and I will start your mock interview at the right level for this role.';
const spanishGreeting =
  'Hola. Soy tu coach de entrevistas de WorkforceAP. Dime cuando estés listo y comenzaré tu entrevista simulada al nivel adecuado para este puesto.';

type Variables = Record<string, string | number | boolean>;
type Agent = {
  first_message: string;
  prompt: { prompt: string };
  dynamic_variables: { dynamic_variable_placeholders: Record<string, string> };
};

function readAgent(id: string): Agent {
  return JSON.parse(readFileSync(join(patchDirectory, `${id}.patch.json`), 'utf8'))
    .conversation_config.agent;
}

function templateReferences(agent: Agent): Set<string> {
  const template = `${agent.prompt.prompt}\n${agent.first_message}`;
  const references = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    references.add(match[1]);
  }
  // Include prompt context guards, even if their variable is not separately
  // interpolated. First messages use ordinary {{variable}} substitution.
  for (const match of template.matchAll(/\{%\s*(?:if|elif)\s+(\w+)\b[^%]*%\}/g)) {
    references.add(match[1]);
  }
  return references;
}

function resolveReferences(agent: Agent, runtime: Variables): Variables {
  const resolved = { ...agent.dynamic_variables.dynamic_variable_placeholders, ...runtime };
  for (const variable of templateReferences(agent)) {
    assert.ok(Object.hasOwn(resolved, variable), `Missing template variable: ${variable}`);
    assert.ok(
      ['string', 'number', 'boolean'].includes(typeof resolved[variable]),
      `Invalid template variable: ${variable}`,
    );
  }
  return resolved;
}

test('patch inventory contains only the eight reviewed agents, excluding archived agents', () => {
  assert.deepEqual(
    readdirSync(patchDirectory).filter((file) => file.endsWith('.patch.json')).sort(),
    Object.values(agents).map((id) => `${id}.patch.json`).sort(),
  );
});

test('all ordinary prompts and first messages resolve even when context lookup returns nothing', () => {
  for (const [role, id] of Object.entries(agents)) {
    if (role === 'lilley') continue;
    const agent = readAgent(id);
    const defaults = agent.dynamic_variables.dynamic_variable_placeholders;
    assert.deepEqual(Object.keys(defaults).sort(), [...templateReferences(agent)].sort(), role);
    assert.ok(Object.keys(defaults).every((key) => !key.startsWith('secret__')), role);
    resolveReferences(agent, {});
  }
});

test('Readiness tolerates its intentional omission of member_name and retains supplied context', () => {
  // app/api/member/readiness/voice-session/route.ts strips member_name before
  // returning the member context to the browser.
  const runtime = { program_title: 'IT support', interview_eligible: 'true' };
  assert.equal(Object.hasOwn(runtime, 'member_name'), false);
  const resolved = resolveReferences(readAgent(agents.readiness), runtime);
  assert.equal(resolved.member_name, '');
  assert.equal(resolved.program_title, 'IT support');
  assert.equal(resolved.interview_eligible, 'true');
  assert.equal(resolved.organization_name, '');
  assert.equal(resolved.coach_memory_summary, '');
});

test('Interview substitutes a fixed greeting without unsupported first-message conditionals', () => {
  // app/api/interview/session/route.ts provides role/type/greeting but does not
  // set experience_level; member context can independently fail to load.
  const agent = readAgent(agents.interview);
  const runtime = { target_role: 'Support specialist', interview_type: 'behavioral' };
  const resolved = resolveReferences(agent, runtime);
  assert.equal(resolved.experience_level, '');
  assert.equal(resolved.member_name, '');
  assert.equal(resolved.interview_eligible, '');
  assert.equal(resolved.target_role, runtime.target_role);
  assert.equal(agent.first_message, '{{interview_greeting}}');
  assert.doesNotMatch(agent.first_message, /\{%|%\}/);
  assert.equal(Object.hasOwn(agent.dynamic_variables.dynamic_variable_placeholders, 'response_language'), false);
  assert.equal(resolved.response_language_instruction, '');
  assert.equal(resolved.interview_greeting, englishGreeting);
  const renderGreeting = (variables: Variables) => agent.first_message.replace(
    /\{\{(\w+)\}\}/g,
    (_match, variable: string) => String(variables[variable]),
  );
  assert.equal(renderGreeting(resolved), englishGreeting);
  const spanish = resolveReferences(agent, { ...runtime, interview_greeting: spanishGreeting });
  assert.equal(renderGreeting(spanish), spanishGreeting);

  const missingGreeting = structuredClone(agent);
  delete missingGreeting.dynamic_variables.dynamic_variable_placeholders.interview_greeting;
  assert.throws(() => resolveReferences(missingGreeting, runtime), /Missing template variable: interview_greeting/);
});

test('public WIOA subset resolves without inventing missing screening answers or outcomes', () => {
  // Representative buildPublicWioaPortalDynamicVariables output: the public
  // form hands the vendor a first name only (no email, phone or county), not
  // a completed screening snapshot; the agent's own defaults cover the rest.
  const runtime = {
    member_name: 'Jamie',
    wioa_public_screening: 'true',
    wioa_program_name: 'Workforce Innovation and Opportunity Act (WIOA)',
    wioa_pronunciation: 'W. I. O. A.',
  };
  const resolved = resolveReferences(readAgent(agents.wioa), runtime);
  assert.equal(resolved.member_name, 'Jamie');
  for (const key of [
    'wioa_county_or_zip', 'wioa_age_bracket', 'wioa_primary_barrier',
    'wioa_dislocated_worker', 'wioa_low_income_self_report',
    'wioa_training_interest', 'wioa_completed_intake_self_report', 'wioa_signal',
  ]) {
    assert.equal(resolved[key], '', key);
  }
});

test('new defaults provide site framing and a fixed greeting without fabricating identity or status', () => {
  for (const [role, id] of Object.entries(agents)) {
    if (role === 'lilley' || role === 'resume') continue;
    const defaults = readAgent(id).dynamic_variables.dynamic_variable_placeholders;
    assert.equal(defaults.site_name, 'WorkforceAP', role);
    assert.equal(defaults.support_context, supportContext, role);
    for (const [key, value] of Object.entries(defaults)) {
      if (key === 'site_name' || key === 'support_context') continue;
      assert.equal(value, role === 'interview' && key === 'interview_greeting' ? englishGreeting : '', `${role}.${key}`);
    }
  }
});

test('Resume preserves its established eleven defaults and accepts supplied resume state', () => {
  const agent = readAgent(agents.resume);
  assert.deepEqual(agent.dynamic_variables.dynamic_variable_placeholders, {
    site_name: 'WorkforceAP',
    support_context: supportContext,
    member_name: '',
    program_title: '',
    program_skills: '',
    organization_name: '',
    coach_memory_summary: '',
    resume_text: '',
    live_resume_draft: '',
    has_resume: 'false',
    resume_file_on_profile: 'false',
  });
  const resolved = resolveReferences(agent, {
    has_resume: 'true',
    resume_file_on_profile: 'true',
    resume_text: 'Example resume content',
    live_resume_draft: 'Example updated draft',
  });
  assert.equal(resolved.has_resume, 'true');
  assert.equal(resolved.resume_file_on_profile, 'true');
  assert.equal(resolved.resume_text, 'Example resume content');
  assert.equal(resolved.live_resume_draft, 'Example updated draft');
});

test('Lilley keeps only its existing empty secret placeholder', () => {
  assert.deepEqual(readAgent(agents.lilley).dynamic_variables.dynamic_variable_placeholders, {
    secret__agent_gateway_token: '',
  });
});
