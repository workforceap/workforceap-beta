'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusTag, useAnnounce } from '@/components/portal/kit';
import {
  DRAFT_FIELDS,
  type ArtifactView,
  type BillingStage,
  type Blocker,
  type ContactSource,
  type DraftField,
  type DraftFieldError,
  type DraftPatch,
  type DraftReviewDto,
  type DraftSaveDto,
  type StageVersionView,
} from '@/lib/billing/twoStage/dto';
import { twoStageApi, draftPreviewPath, type ApiFailure } from './twoStageClient';
import { CONTACT_SOURCE_LABELS, shortHash } from './twoStagePresentation';
import styles from './TwoStageBillingWorkbench.module.css';

type Values = Partial<Record<DraftField, string>>;

const FIELD_LABELS: Readonly<Record<DraftField, string>> = {
  boardName: 'Workforce Solutions board',
  'student.name': 'Student name',
  'student.email': 'Student email',
  'counselor.name': 'Counselor name',
  'counselor.email': 'Counselor email',
  'counselor.phone': 'Counselor phone',
  'finance.name': 'Board finance contact name',
  'finance.email': 'Board finance contact email',
  boardInvoiceArtifactId: 'Board invoice (optional)',
};

const FIELD_HINTS: Readonly<Partial<Record<DraftField, string>>> = {
  boardName: 'The board that issues the voucher, for example “Workforce Solutions Capital Area”.',
  'counselor.name': 'Any counselor can be entered; it does not have to be the assigned one.',
  'counselor.phone': 'Printed on the document with the counselor’s name and email.',
};

const INPUT_TYPES: Readonly<Partial<Record<DraftField, 'email' | 'tel' | 'text'>>> = {
  'student.email': 'email',
  'counselor.email': 'email',
  'finance.email': 'email',
  'counselor.phone': 'tel',
};

const REVIEW_DEBOUNCE_MS = 350;

function toPatch(stage: BillingStage, fields: readonly DraftField[], values: Values): DraftPatch<'j6'> {
  const v = (f: DraftField) => values[f] ?? '';
  const patch: DraftPatch<'j6'> = {
    boardName: v('boardName'),
    student: { name: v('student.name'), email: v('student.email') },
    counselor: { name: v('counselor.name'), email: v('counselor.email'), phone: v('counselor.phone') },
  };
  if (stage === 'j6') {
    if (fields.includes('finance.name') || fields.includes('finance.email')) patch.finance = { name: v('finance.name'), email: v('finance.email') };
    if (fields.includes('boardInvoiceArtifactId')) patch.boardInvoiceArtifactId = v('boardInvoiceArtifactId') || null;
  }
  return patch;
}

function FieldBlockers({ blockers }: { blockers: readonly Blocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <ul className={styles.blockerList} aria-label="Steps this draft still needs">
      {blockers.map((b, i) => (
        <li key={`${b.code}-${i}`} className={b.hardHold ? styles.blockerHold : styles.blocker} data-code={b.code}>
          {b.hardHold ? (
            <span className={styles.blockerTags}>
              <StatusTag tone="danger">Hold</StatusTag>
            </span>
          ) : null}
          <span className={styles.blockerMessage}>{b.message}</span>
        </li>
      ))}
    </ul>
  );
}

type TwoStageStageEditorProps = {
  memberId: string;
  caseId: string;
  stage: BillingStage;
  /** The J5 version for a J6 editor: empty counselor fields start from its recipients. */
  j5Current?: StageVersionView | null;
  /** Uploaded board invoices of this case (J6 only). */
  boardInvoices?: readonly ArtifactView[];
  /** False when the stage already has a signed or sent version (the server refuses a save). */
  canSaveDraft: boolean;
  /** Changes when a sibling evidence action refreshes the case summary. */
  reviewRevision?: number;
  /** Never accept a review while the authoritative summary is still loading. */
  summaryRefreshing?: boolean;
  onSaved: (saved: DraftSaveDto) => void;
  onClose: () => void;
};

/**
 * The reviewed draft editor. Every keystroke is checked by
 * `POST …/[stage]/draft/review` (never a write); `PUT …/[stage]/draft`
 * persists only a complete set, with the version hash the editor loaded.
 */
export default function TwoStageStageEditor({ memberId, caseId, stage, j5Current, boardInvoices = [], canSaveDraft, reviewRevision = 0, summaryRefreshing = false, onSaved, onClose }: TwoStageStageEditorProps) {
  const announce = useAnnounce();
  const [values, setValues] = useState<Values>({});
  const [initialSources, setInitialSources] = useState<Partial<Record<DraftField, ContactSource | 'j5'>>>({});
  const [review, setReview] = useState<DraftReviewDto | null>(null);
  const [loadError, setLoadError] = useState<ApiFailure | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewedInput, setReviewedInput] = useState<{ values: Values; revision: number } | null>(null);
  const [touched, setTouched] = useState<Partial<Record<DraftField, true>>>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Partial<Record<DraftField, DraftFieldError>>>({});
  const [saved, setSaved] = useState<DraftSaveDto | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const loaded = useRef(false);
  // Read at load only: a summary refresh must not reset what staff are typing.
  const j5CurrentRef = useRef(j5Current);
  j5CurrentRef.current = j5Current;
  const seq = useRef(0);
  const reviewAbort = useRef<AbortController | null>(null);
  const reviewRevisionRef = useRef(reviewRevision);
  reviewRevisionRef.current = reviewRevision;
  const previousReviewRevision = useRef(reviewRevision);

  const fields = useMemo(() => (review ? DRAFT_FIELDS.filter((f) => f in review.fields) : []), [review]);

  const invalidateReview = useCallback(() => {
    reviewAbort.current?.abort();
    return ++seq.current;
  }, []);

  const runReview = useCallback(
    async (next: Values, fieldList: readonly DraftField[]) => {
      reviewAbort.current?.abort();
      const controller = new AbortController();
      reviewAbort.current = controller;
      const id = ++seq.current;
      setReviewPending(true);
      setLoadError(null);
      let result;
      try {
        result = await twoStageApi.reviewDraft(memberId, caseId, stage, toPatch(stage, fieldList, next), controller.signal);
      } catch {
        if (id !== seq.current || controller.signal.aborted) return;
        setReviewPending(false);
        setLoadError({ ok: false, status: 0, body: null, message: 'The draft could not be checked. Try again before saving.', uncertain: false });
        return;
      }
      if (id !== seq.current || controller.signal.aborted) return;
      setReviewPending(false);
      if (result.ok) {
        setReview(result.data);
        setReviewedInput({ values: next, revision: reviewRevision });
        setLoadError(null);
      } else {
        setLoadError(result);
      }
    },
    [memberId, caseId, stage, reviewRevision],
  );

  // First load: an empty review returns the saved draft's inputs or the prefill.
  const load = useCallback(async () => {
    reviewAbort.current?.abort();
    const controller = new AbortController();
    reviewAbort.current = controller;
    const id = ++seq.current;
    const revision = reviewRevisionRef.current;
    loaded.current = false;
    setLoadError(null);
    setReviewPending(true);
    setReviewedInput(null);
    let result;
    try {
      result = await twoStageApi.reviewDraft(memberId, caseId, stage, {}, controller.signal);
    } catch {
      if (id !== seq.current || controller.signal.aborted) return;
      setReviewPending(false);
      setLoadError({ ok: false, status: 0, body: null, message: 'The draft could not be checked. Try again before saving.', uncertain: false });
      return;
    }
    if (id !== seq.current || controller.signal.aborted) return;
    if (!result.ok) {
      setReviewPending(false);
      setLoadError(result);
      return;
    }
    const dto = result.data;
    const next: Values = {};
    const sources: Partial<Record<DraftField, ContactSource | 'j5'>> = {};
    for (const f of DRAFT_FIELDS) {
      const field = dto.fields[f];
      if (!field) continue;
      next[f] = field.value ?? '';
      sources[f] = field.source;
    }
    // A J6 starts from the counselor printed on the J5 when nothing else is on file.
    const j5Counselor = stage === 'j6' ? j5CurrentRef.current?.recipients.find((r) => r.role === 'counselor') : undefined;
    if (j5Counselor) {
      const fill: Array<[DraftField, string | null]> = [
        ['counselor.name', j5Counselor.name],
        ['counselor.email', j5Counselor.email],
        ['counselor.phone', j5Counselor.phone],
      ];
      for (const [f, value] of fill) {
        if (value && f in dto.fields && !next[f]) {
          next[f] = value;
          sources[f] = 'j5';
        }
      }
    }
    setValues(next);
    setInitialSources(sources);
    setReview(dto);
    setReviewedInput({ values: next, revision });
    // The live-review effect checks the loaded values (including any J5 prefill) once.
    loaded.current = true;
  }, [memberId, caseId, stage]);

  useEffect(() => {
    void load();
    return () => { invalidateReview(); };
  }, [load, invalidateReview]);

  // Recheck current inputs after either typing or an evidence/summary refresh.
  // Invalidate before the debounce so late replies cannot restore an old review.
  useEffect(() => {
    if (previousReviewRevision.current !== reviewRevision) {
      previousReviewRevision.current = reviewRevision;
      setServerFieldErrors({});
      setSaveError((previous) => previous?.body?.code === 'DRAFT_INCOMPLETE' ? null : previous);
    }
    if (!loaded.current || fields.length === 0) return;
    const scheduledSequence = invalidateReview();
    setReviewPending(true);
    if (summaryRefreshing) return;
    const t = setTimeout(() => {
      // An explicit reload supersedes a queued check, even before its values arrive.
      if (loaded.current && seq.current === scheduledSequence) void runReview(values, fields);
    }, REVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      // A later explicit load owns the controller until it replaces the inputs.
      if (loaded.current) invalidateReview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recheck inputs/evidence, not each resulting review's recomputed field list
  }, [values, reviewRevision, summaryRefreshing]);

  const setField = (f: DraftField, value: string) => {
    setValues((prev) => ({ ...prev, [f]: value }));
    setServerFieldErrors((prev) => {
      if (!prev[f]) return prev;
      const { [f]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const expectedVersionHash = saved?.versionHash ?? review?.current?.versionHash ?? null;
  const current = saved?.record ?? review?.current ?? null;

  const save = async () => {
    setAttempted(true);
    setSaveError(null);
    setSaving(true);
    const result = await twoStageApi.saveDraft(memberId, caseId, stage, { ...toPatch(stage, fields, values), expectedVersionHash });
    setSaving(false);
    if (result.ok) {
      setSaved(result.data);
      setServerFieldErrors({});
      announce(`${stage.toUpperCase()} draft saved as version ${result.data.record.version}.`);
      onSaved(result.data);
      void runReview(values, fields);
      return;
    }
    setSaveError(result);
    if (result.body?.code === 'DRAFT_INCOMPLETE' && result.body.fields) setServerFieldErrors(result.body.fields);
  };

  const errorFor = (f: DraftField): DraftFieldError | null => {
    if (serverFieldErrors[f]) return serverFieldErrors[f];
    return touched[f] || attempted ? review?.fields[f]?.error ?? null : null;
  };

  const reviewIsCurrent = reviewedInput?.values === values && reviewedInput.revision === reviewRevision;
  const saveBlocked = !canSaveDraft
    ? 'This stage already has a signed or sent version. Void or supersede it before saving a new draft.'
    : summaryRefreshing
      ? 'Checking the latest case details…'
      : loadError
        ? 'The draft could not be checked. Try again before saving.'
        : reviewPending || !reviewIsCurrent || !review
          ? 'Checking the latest changes…'
          : !review.complete
            ? 'Complete the highlighted fields and the steps listed before saving. Nothing is saved until then.'
            : current && review.versionHashIfSaved === current.versionHash
              ? 'No changes to save.'
              : null;
  const saveBlockers = saveError?.body?.code === 'DRAFT_INCOMPLETE' ? saveError.body.blockers ?? [] : [];
  const reviewBlockers = reviewIsCurrent && !reviewPending && !summaryRefreshing && !loadError ? review?.blockers ?? [] : [];
  const invoiceChoices = boardInvoices.filter((a) => a.kind === 'board_invoice');

  return (
    <section className={styles.editor} aria-labelledby={`billing-${stage}-editor-heading`} data-editor={stage}>
      <div className={styles.editorHead}>
        <h3 className={styles.editorTitle} id={`billing-${stage}-editor-heading`}>
          {stage.toUpperCase()} draft
        </h3>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>
          Close editor
        </button>
      </div>
      <p className={styles.editorNote}>Saving creates a DRAFT version for review. It does not sign or send anything.</p>

      {loadError ? (
        <div className={styles.alert} role="alert">
          <p>{loadError.message}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void (loaded.current ? runReview(values, fields) : load())}>
            Try again
          </button>
        </div>
      ) : null}

      {review ? (
        <form
          className={styles.editorForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!saveBlocked && !saving) void save();
          }}
        >
          <div className={styles.fieldGrid}>
            {fields.map((f) => {
              const id = `billing-${stage}-${f.replace('.', '-')}`;
              const error = errorFor(f);
              const hint = FIELD_HINTS[f];
              const source = initialSources[f];
              const sourceText =
                source === 'j5' ? 'Started from the J5 quote; you can change it.' : source && source !== 'none' && source !== 'draft' ? `From the ${CONTACT_SOURCE_LABELS[source]}; you can change it.` : null;
              const describedBy = [error ? `${id}-error` : null, hint || sourceText ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
              return (
                <div key={f} className={f === 'boardName' || f === 'boardInvoiceArtifactId' ? styles.fieldFull : styles.field}>
                  <label htmlFor={id} className={styles.fieldLabel}>
                    {FIELD_LABELS[f]}
                  </label>
                  {f === 'boardInvoiceArtifactId' ? (
                    <select
                      id={id}
                      className={styles.control}
                      value={values[f] ?? ''}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy}
                      onChange={(e) => {
                        setField(f, e.target.value);
                        setTouched((t) => ({ ...t, [f]: true }));
                      }}
                    >
                      <option value="">No board invoice</option>
                      {invoiceChoices.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.fileName} ({shortHash(a.sha256)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      name={f}
                      className={styles.control}
                      type={INPUT_TYPES[f] ?? 'text'}
                      autoComplete="off"
                      value={values[f] ?? ''}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy}
                      onChange={(e) => setField(f, e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, [f]: true }))}
                    />
                  )}
                  {hint || sourceText ? (
                    <p id={`${id}-hint`} className={styles.fieldHint}>
                      {[sourceText, hint].filter(Boolean).join(' ')}
                    </p>
                  ) : null}
                  {error ? (
                    <p id={`${id}-error`} className={styles.fieldError} data-code={error.code}>
                      {error.message}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {reviewBlockers.length > 0 || saveBlockers.length > 0 ? (
            <div className={styles.blockers}>
              <p className={styles.sectionLabel}>Before this draft can be saved</p>
              <FieldBlockers blockers={saveBlockers.length > 0 ? saveBlockers : reviewBlockers} />
            </div>
          ) : null}
          {review.holds.length > 0 ? <p className={styles.holdNote}>This J6 would be saved on hold. A held J6 cannot be previewed or signed until the evidence is corrected.</p> : null}

          {saveError ? (
            <div className={styles.alert} role="alert" data-code={saveError.body?.code}>
              <p>{saveError.message}</p>
              {saveError.body?.code === 'DRAFT_CONFLICT' || saveError.uncertain ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSaveError(null);
                    setSaved(null);
                    void load();
                  }}
                >
                  Reload the draft
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={styles.editorActions}>
            <button type="submit" className={styles.primaryButton} disabled={Boolean(saveBlocked) || saving} aria-describedby={`billing-${stage}-save-reason`}>
              {saving ? 'Saving…' : current ? 'Save draft changes' : 'Save draft'}
            </button>
            <p id={`billing-${stage}-save-reason`} className={styles.reason} aria-live="off">
              {saveBlocked ?? (reviewPending ? 'Checking the latest changes…' : review.versionHashIfSaved ? `Ready to save (version ${shortHash(review.versionHashIfSaved)}).` : 'Ready to save.')}
            </p>
          </div>
        </form>
      ) : !loadError ? (
        <p className={styles.muted}>Loading the draft…</p>
      ) : null}

      {current ? (
        <div className={styles.savedDraft} data-saved-version={current.version}>
          <p className={styles.savedLine}>
            <StatusTag tone="info">Draft saved</StatusTag> v{current.version} · {current.documentNumber} · version {shortHash(current.versionHash)}
          </p>
          <div className={styles.previewActions}>
            <a className={styles.secondaryButton} href={draftPreviewPath(memberId, caseId, stage, current.recordId, current.versionHash)} target="_blank" rel="noopener noreferrer">
              Open DRAFT PDF
            </a>
            <button type="button" className={styles.secondaryButton} aria-expanded={showPreview} onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? 'Hide preview' : 'Show preview here'}
            </button>
          </div>
          {showPreview ? (
            <iframe
              className={styles.previewFrame}
              title={`${stage.toUpperCase()} DRAFT PDF preview`}
              src={draftPreviewPath(memberId, caseId, stage, current.recordId, current.versionHash)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
