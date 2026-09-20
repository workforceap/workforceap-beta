'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import LocalizedLink from '@/components/LocalizedLink';
import { DesignSurface } from '@/components/portal/kit/DesignSurface';
import { FormField } from '@/components/portal/kit/FormField';
import { PageOpener } from '@/components/portal/kit/PageOpener';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import { formatWioaReasons, parseWioaQualificationSnapshot, type WioaBarrier, type WioaQualificationAnswers, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { PUBLIC_ASSISTANCE_PROGRAM_VALUES, normalizePublicAssistancePrograms, type PublicAssistanceProgram } from '@/lib/apply/publicAssistance';
import styles from './WioaQualificationClient.module.css';

const BARRIERS: WioaBarrier[] = ['none', 'basic_skills', 'english_language', 'criminal_record', 'transportation', 'childcare', 'housing', 'other'];
const ERROR_CODES = ['contact', 'invalid_answers', 'invalid_json', 'unauthorized', 'rate_limited', 'save_failed', 'conflict', 'assistance_programs'] as const;

export default function WioaQualificationClient({
  initialSnapshot,
  mode = 'member',
  submitEndpoint = mode === 'public' ? '/api/public/wioa-qualification' : '/api/member/wioa-qualification',
  voiceSessionEndpoint = mode === 'public' ? '/api/public/wioa-qualification/voice-session' : '/api/member/wioa-qualification/voice-session',
}: {
  initialSnapshot: WioaQualificationSnapshot | null;
  mode?: 'member' | 'public';
  submitEndpoint?: string;
  voiceSessionEndpoint?: string;
}) {
  const t = useTranslations('wioa');
  const format = useFormatter();
  const isPublic = mode === 'public';
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [entryMode, setEntryMode] = useState<'voice' | 'form'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [staffNotificationSent, setStaffNotificationSent] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<WioaQualificationAnswers>(() => initialSnapshot?.answers ?? {
    ageBracket: '25_54', countyOrZip: '', primaryBarrier: 'none', dislocatedWorker: false,
    lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: false,
    publicAssistanceSelfReport: null,
  });
  const updateAnswer = <K extends keyof WioaQualificationAnswers>(key: K, value: WioaQualificationAnswers[K]) =>
    setAnswers((current) => ({ ...current, [key]: value }));
  // WAP-53 follow-ups: only asked after a Yes; cleared when the answer flips to No.
  const receivesAssistance = answers.publicAssistanceSelfReport === true;
  const selectedPrograms = normalizePublicAssistancePrograms(answers.publicAssistancePrograms);
  const programLabelKey: Record<PublicAssistanceProgram, string> = { tanf: 'programTanf', wic: 'programWic', snap: 'programSnap', other_unsure: 'programOtherUnsure' };
  const setAssistance = (value: string) => setAnswers((current) => (
    value === 'yes'
      ? { ...current, publicAssistanceSelfReport: true }
      : { ...current, publicAssistanceSelfReport: false, publicAssistancePrograms: [], publicAssistanceHelpRequested: null }
  ));
  const toggleProgram = (program: PublicAssistanceProgram, checked: boolean) => setAnswers((current) => ({
    ...current,
    publicAssistancePrograms: normalizePublicAssistancePrograms(
      checked ? [...(current.publicAssistancePrograms ?? []), program] : (current.publicAssistancePrograms ?? []).filter((item) => item !== program),
    ),
  }));
  const followUpIncomplete = receivesAssistance && selectedPrograms.length === 0;
  const voicePayload = useMemo(() => ({
    fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), countyOrZip: answers.countyOrZip.trim(),
    screeningSource: isPublic ? 'public_page' : 'member_portal', wioaPronunciation: 'W. I. O. A.',
  }), [answers.countyOrZip, email, fullName, isPublic, phone]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorKey('');
    if (followUpIncomplete) {
      setErrorKey('assistance_programs');
      return;
    }
    if (isPublic && (fullName.trim().length < 2 || !email.trim())) {
      setErrorKey('contact');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(submitEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...answers, countyOrZip: answers.countyOrZip.trim(),
          ...(isPublic ? { contact: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim() } } : {}),
        }),
      });
      const data = await res.json().catch(() => null) as { snapshot?: unknown; emailSent?: boolean; errorCode?: string } | null;
      if (!res.ok) {
        const code = ERROR_CODES.find((key) => key === data?.errorCode);
        setErrorKey(code ?? (res.status === 401 ? 'unauthorized' : res.status === 429 ? 'rate_limited' : 'save_failed'));
        return;
      }
      const saved = parseWioaQualificationSnapshot(data?.snapshot);
      if (!saved) {
        setErrorKey('unknown');
        return;
      }
      setSnapshot(saved);
      setStaffNotificationSent(data?.emailSent === true);
      setEntryMode('form');
    } catch {
      setErrorKey('network');
    } finally {
      setSubmitting(false);
    }
  }

  const content = <>
    {isPublic ? <header><p className={styles.kicker}>{t('kicker')}</p><h1>{t('title')}</h1><p>{t('publicIntro')}</p></header>
      : <PageOpener kicker={t('kicker')} title={t('title')} lede={t('memberIntro')} />}
    <p className={styles.disclaimer}>{t('disclaimer')}</p>
    {snapshot ? <Card padding={6}>
      <section aria-labelledby="wioa-result-title" className={styles.stack}>
        <h2 id="wioa-result-title">{t(isPublic ? 'resultPublic' : 'resultMember')}</h2>
        {Number.isFinite(Date.parse(snapshot.submittedAt)) ? <p className={styles.meta}>{t('savedOn', { date: format.dateTime(new Date(snapshot.submittedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p> : null}
        <h3>{t(`signals.${snapshot.signal}.title`)}</h3>
        <p>{t(`signals.${snapshot.signal}.body`)}</p>
        <ul>{formatWioaReasons(snapshot, t).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        {staffNotificationSent !== null ? <p role={staffNotificationSent ? 'status' : 'alert'} className={staffNotificationSent ? styles.success : styles.warning}>{t(staffNotificationSent ? 'savedNotified' : 'savedNoEmail')}</p> : null}
        <div className={styles.actions}>
          <LocalizedLink href={isPublic ? '/apply' : '/dashboard/messages'}>{t(isPublic ? 'startApplication' : 'messageCounselor')}</LocalizedLink>
          <LocalizedLink href={isPublic ? '/contact?topic=wioa' : '/dashboard/learning'}>{t(isPublic ? 'contact' : 'backToLearning')}</LocalizedLink>
        </div>
      </section>
    </Card> : null}
    <Card padding={6}>
      <section className={styles.stack} aria-labelledby="wioa-form-title">
        <h2 id="wioa-form-title">{t('chooseMode')}</h2>
        <SegmentedControl label={t('modeLabel')} value={entryMode} onChange={(value) => setEntryMode(value === 'voice' ? 'voice' : 'form')} size="lg" layout="fill" isDisabled={submitting}>
          <SegmentedControlItem value="form" label={t('formMode')} />
          <SegmentedControlItem value="voice" label={t('voiceMode')} />
        </SegmentedControl>
        <p>{t(isPublic ? 'publicModeHelp' : 'memberModeHelp')}</p>
        {entryMode === 'voice' ? <div className={styles.stack}>
          {isPublic ? <div className={styles.fields}>
            <FormField label={t('voiceName')} type="text" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            <FormField label={t('voiceEmail')} type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div> : null}
          <PortalVoiceSessionLazy sessionEndpoint={voiceSessionEndpoint} sessionPayload={voicePayload}
            title={t('voiceTitle')} description={t('voiceDescription')} dataUseNotice={t('voiceDataUse')}
            fallbackAgentNotice={t('voiceFallback')} speakingLabel={t('speaking')} listeningLabel={t('listening')}
            liveTranscriptCoachLabel={t('coach')} liveTranscriptYouLabel={t('you')} />
        </div> : <form onSubmit={onSubmit} className={styles.stack} aria-busy={submitting}>
          <div className={styles.fields}>
            {isPublic ? <>
              <FormField label={t('fullName')} type="text" minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              <FormField label={t('email')} type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              <FormField label={t('phone')} type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </> : null}
            <FormField label={t('age')} id="wioa-age"><select id="wioa-age" className={styles.control} value={answers.ageBracket} onChange={(e) => updateAnswer('ageBracket', e.target.value as WioaQualificationAnswers['ageBracket'])}>
              <option value="under18">{t('under18')}</option><option value="18_24">18–24</option><option value="25_54">25–54</option><option value="55_plus">55+</option>
            </select></FormField>
            <FormField label={t('county')} type="text" maxLength={120} value={answers.countyOrZip} onChange={(e) => updateAnswer('countyOrZip', e.target.value)} placeholder={t('countyPlaceholder')} autoComplete="postal-code" />
            <FormField label={t('barrier')} id="wioa-barrier"><select id="wioa-barrier" className={styles.control} value={answers.primaryBarrier} onChange={(e) => updateAnswer('primaryBarrier', e.target.value as WioaBarrier)}>
              {BARRIERS.map((barrier) => <option key={barrier} value={barrier}>{t(`barriers.${barrier}`)}</option>)}
            </select></FormField>
          </div>
          <fieldset className={styles.group}><legend>{t('workSituation')}</legend>
            <CheckboxInput label={t('unemployed')} description={t('unemployedHelp')} value={answers.dislocatedWorker} onChange={(value) => updateAnswer('dislocatedWorker', value)} />
            <CheckboxInput label={t('lowIncome')} description={t('lowIncomeHelp')} value={answers.lowIncomeSelfReport} onChange={(value) => updateAnswer('lowIncomeSelfReport', value)} />
          </fieldset>
          <RadioList label={t('assistance')} value={answers.publicAssistanceSelfReport === true ? 'yes' : answers.publicAssistanceSelfReport === false ? 'no' : ''} onChange={setAssistance} orientation="horizontal">
            <RadioListItem value="yes" label={t('yes')} /><RadioListItem value="no" label={t('no')} />
          </RadioList>
          {receivesAssistance ? <>
            <fieldset className={styles.group} aria-invalid={followUpIncomplete || undefined}><legend>{t('assistancePrograms')}</legend>
              {PUBLIC_ASSISTANCE_PROGRAM_VALUES.map((program) => (
                <CheckboxInput key={program} label={t(programLabelKey[program])} value={selectedPrograms.includes(program)} onChange={(checked) => toggleProgram(program, checked)} />
              ))}
              <p className={styles.meta}>{t('assistanceProgramsHelp')}</p>
            </fieldset>
            <RadioList label={t('assistanceHelp')} value={answers.publicAssistanceHelpRequested === true ? 'yes' : answers.publicAssistanceHelpRequested === false ? 'no' : ''} onChange={(value) => updateAnswer('publicAssistanceHelpRequested', value === 'yes')} orientation="horizontal">
              <RadioListItem value="yes" label={t('yes')} /><RadioListItem value="no" label={t('no')} />
            </RadioList>
          </> : null}
          <fieldset className={styles.group}><legend>{t('trainingHeading')}</legend>
            <CheckboxInput label={t('training')} value={answers.trainingInterest} onChange={(value) => updateAnswer('trainingInterest', value)} />
            <CheckboxInput label={t('intake')} value={answers.completedIntakeSelfReport} onChange={(value) => updateAnswer('completedIntakeSelfReport', value)} />
          </fieldset>
          {errorKey ? <p role="alert" className={styles.error}>{t(`errors.${errorKey}`)}</p> : null}
          <div><Button type="submit" variant="primary" size="lg" isDisabled={submitting} label={t(submitting ? (isPublic ? 'sending' : 'saving') : isPublic ? 'send' : snapshot ? 'update' : 'save')} /></div>
        </form>}
      </section>
    </Card>
    <section className={styles.stack} aria-labelledby="wioa-next-steps"><h2 id="wioa-next-steps">{t('nextSteps')}</h2><ol><li>{t('bring')}</li><li>{t('counselor')}</li><li>{t('say')}</li></ol></section>
  </>;
  return isPublic ? <div className={`${styles.root} ${styles.public}`}>{content}</div> : <DesignSurface surface="warm" className={styles.root}>{content}</DesignSurface>;
}
