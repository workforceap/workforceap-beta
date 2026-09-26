'use client';

import { useMemo, useState } from 'react';
import SignaturePad, { type SignatureValue } from '@/components/admin/SignaturePad';
import BillingPacketList from '@/components/billing/BillingPacketList';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';
import { postSignCue } from '@/lib/billing/sendResultCopy';
import type { DefaultLineItem } from '@/lib/billing/packetDefaults';
import {
  attestationFingerprint,
  buildJ6Facts,
  defaultCoverLetterNarrative,
  formatMoney,
  fundingReviewWarnings,
  isoDateInPortalTz,
  narrativeFactHints,
  narrativeMoneyViolations,
  totalContactHours,
  type FundingBasis,
  type ReviewedValues,
} from '@/lib/billing/packetText';

export type BillingProgramOption = {
  slug: string;
  title: string;
  /** Default rows; tuition amounts are null when no price is on file. */
  lineItems: DefaultLineItem[];
  pricingSource: 'organization_catalog' | 'syllabus' | 'price_list_default';
  /** Price-list maximum shown as a reference only (never prefilled). */
  priceListMaximum: number | null;
  isPrimary: boolean;
  /** Set when the program cannot be billed (e.g. a draft curriculum), with the reason. */
  unavailableReason: string | null;
};

type BillingPacketClientProps = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  programs: BillingProgramOption[];
  billTo: { name: string; attention: string; address: string };
  signer: { name: string; title: string };
  providerName: string;
  counselorLabel: string | null;
  initialPackets: BillingPacketSummary[];
};

const PRICING_SOURCE_LABEL: Record<BillingProgramOption['pricingSource'], string> = {
  organization_catalog: 'prices from your program catalog (/admin/programs)',
  syllabus: 'tuition from the approved TWC syllabus',
  price_list_default: 'class rows only: no catalog or syllabus price is on file, so tuition is left empty',
};

type Draft = {
  programSlug: string;
  invoiceDate: string;
  dueDate: string;
  billToName: string;
  billToAttention: string;
  billToAddress: string;
  billToEmail: string;
  referenceNumber: string;
  lineItems: DefaultLineItem[];
  /** J6 narrative only; the facts block is generated from the rows. */
  coverLetterBody: string;
  signerName: string;
  signerTitle: string;
  /** Staff-recorded funding attestation: never prefilled. */
  fundingBasis: '' | FundingBasis;
  approvedAmount: string;
  fundingReference: string;
  exceptionNote: string;
};

/** Confirmations record the fingerprint of the values they were ticked for. */
type Confirmations = { funding: string | null; tuition: string | null; facts: string | null };

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '0.5rem 0.65rem',
  border: '1px solid var(--outline-variant, #cbd5e1)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: '#fff',
};
const labelStyle: React.CSSProperties = { display: 'grid', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 };

function normalizedRows(rows: DefaultLineItem[]) {
  return rows.map((row) => ({
    description: row.description,
    hours: row.hours == null || Number.isNaN(row.hours) ? null : row.hours,
    amount: row.amount == null || !Number.isFinite(row.amount) ? null : row.amount,
  }));
}

export default function BillingPacketClient(props: BillingPacketClientProps) {
  const initialProgram = props.programs.find((p) => p.isPrimary) ?? props.programs[0] ?? null;
  const [packets, setPackets] = useState<BillingPacketSummary[]>(props.initialPackets);
  const [signature, setSignature] = useState<SignatureValue>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastCreated, setLastCreated] = useState<BillingPacketSummary | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmations>({ funding: null, tuition: null, facts: null });
  /** "Supersede and re-issue": the signed packet this new one replaces, and the reason. */
  const [supersede, setSupersede] = useState<{ id: string; packetNumber: string; reason: string } | null>(null);

  const [draft, setDraft] = useState<Draft>(() => ({
    programSlug: initialProgram?.slug ?? '',
    invoiceDate: isoDateInPortalTz(0),
    dueDate: isoDateInPortalTz(30),
    billToName: props.billTo.name,
    billToAttention: props.billTo.attention,
    billToAddress: props.billTo.address,
    billToEmail: '',
    referenceNumber: '',
    lineItems: initialProgram?.lineItems ?? [],
    coverLetterBody: defaultCoverLetterNarrative(props.providerName),
    signerName: props.signer.name,
    signerTitle: props.signer.title,
    fundingBasis: '',
    approvedAmount: '',
    fundingReference: '',
    exceptionNote: '',
  }));

  const rows = useMemo(() => normalizedRows(draft.lineItems), [draft.lineItems]);
  const total = useMemo(() => rows.reduce((s, r) => s + (r.amount ?? 0), 0), [rows]);
  const hours = useMemo(() => totalContactHours(rows.map((r) => ({ ...r, amount: r.amount ?? 0 }))), [rows]);
  const selectedProgram = props.programs.find((p) => p.slug === draft.programSlug) ?? null;
  const approvedAmount = draft.approvedAmount === '' ? null : Number(draft.approvedAmount);

  // Any change to a reviewed value changes the fingerprint, so every
  // confirmation ticked for the old values reads as unticked again.
  const reviewed: ReviewedValues = {
    programSlug: draft.programSlug,
    invoiceDate: draft.invoiceDate,
    dueDate: draft.dueDate || null,
    billToName: draft.billToName,
    referenceNumber: draft.referenceNumber,
    lineItems: rows,
    fundingBasis: draft.fundingBasis,
    approvedAmount,
    fundingReference: draft.fundingReference,
    exceptionNote: draft.exceptionNote,
    narrative: draft.coverLetterBody,
  };
  const fingerprint = attestationFingerprint(reviewed);
  const isConfirmed = (key: keyof Confirmations) => confirmed[key] === fingerprint;
  const toggle = (key: keyof Confirmations, on: boolean) => setConfirmed((c) => ({ ...c, [key]: on ? fingerprint : null }));

  const facts = useMemo(
    () =>
      buildJ6Facts({
        invoiceDate: draft.invoiceDate || isoDateInPortalTz(0),
        dueDate: draft.dueDate || null,
        billToName: draft.billToName,
        referenceNumber: draft.referenceNumber || null,
        lineItems: rows.map((r) => ({ ...r, amount: r.amount ?? 0 })),
        funding:
          draft.fundingBasis && approvedAmount != null && draft.fundingReference.trim()
            ? { fundingType: draft.fundingBasis, approvedAmount, reference: draft.fundingReference.trim() }
            : null,
      }),
    [draft.invoiceDate, draft.dueDate, draft.billToName, draft.referenceNumber, rows, draft.fundingBasis, approvedAmount, draft.fundingReference],
  );
  const hints = useMemo(() => narrativeFactHints(draft.coverLetterBody), [draft.coverLetterBody]);
  const narrativeBlocks = useMemo(() => narrativeMoneyViolations(draft.coverLetterBody), [draft.coverLetterBody]);
  const warnings = fundingReviewWarnings({ fundingType: draft.fundingBasis, total });
  const missingAmount = rows.some((r) => r.amount == null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const changeProgram = (slug: string) => {
    const program = props.programs.find((p) => p.slug === slug);
    setDraft((d) => ({ ...d, programSlug: slug, lineItems: program?.lineItems ?? [] }));
  };

  const updateRow = (index: number, patch: Partial<DefaultLineItem>) =>
    setDraft((d) => ({ ...d, lineItems: d.lineItems.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  const removeRow = (index: number) => setDraft((d) => ({ ...d, lineItems: d.lineItems.filter((_, i) => i !== index) }));
  const addRow = (kind: 'class' | 'fee') =>
    setDraft((d) => ({ ...d, lineItems: [...d.lineItems, { description: '', hours: kind === 'class' ? 0 : null, amount: null }] }));
  const resetRows = () => selectedProgram && set('lineItems', selectedProgram.lineItems);
  const resetNarrative = () => set('coverLetterBody', defaultCoverLetterNarrative(props.providerName));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!signature) {
      setMsg({ type: 'err', text: 'Sign the documents first (draw your signature or type your name).' });
      return;
    }
    setSaving(true);
    try {
      const allConfirmed = isConfirmed('funding') && isConfirmed('tuition') && isConfirmed('facts');
      const res = await fetch(`/api/admin/members/${props.memberId}/billing-packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programSlug: draft.programSlug,
          invoiceDate: draft.invoiceDate,
          dueDate: draft.dueDate || null,
          billToName: draft.billToName,
          billToAttention: draft.billToAttention,
          billToAddress: draft.billToAddress,
          billToEmail: draft.billToEmail,
          referenceNumber: draft.referenceNumber,
          lineItems: rows,
          coverLetterBody: draft.coverLetterBody,
          signerName: draft.signerName,
          signerTitle: draft.signerTitle,
          signatureImage: signature.kind === 'drawn' ? signature.dataUrl : null,
          signatureTyped: signature.kind === 'typed',
          fundingAttestation: {
            fundingBasis: draft.fundingBasis || undefined,
            approvedAmount: approvedAmount ?? undefined,
            reference: draft.fundingReference,
            exceptionNote: draft.exceptionNote,
            reviewed: isConfirmed('funding'),
            tuitionMatches: isConfirmed('tuition'),
          },
          j6FactsReviewed: isConfirmed('facts'),
          ...(supersede ? { supersedesPacketId: supersede.id, supersedeReason: supersede.reason } : {}),
          reviewedFingerprint: allConfirmed ? fingerprint : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; packet?: BillingPacketSummary; warnings?: string[] };
      if (!res.ok || !data.packet) throw new Error(data.error ?? 'Could not create the documents.');
      const created = data.packet;
      setPackets((list) => [
        created,
        ...list.map((p) => (supersede && p.id === supersede.id ? { ...p, status: 'superseded', supersededByPacketId: created.id, supersededReason: supersede.reason } : p)),
      ]);
      setSupersede(null);
      setLastCreated(data.packet);
      setSignature(null);
      setConfirmed({ funding: null, tuition: null, facts: null });
      setMsg({ type: 'ok', text: `Invoice ${data.packet.packetNumber} signed. Review the PDFs below, then email them to the counselor and student.` });
      document.getElementById('billing-packet-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not create the documents.' });
    } finally {
      setSaving(false);
    }
  }

  const onPacketUpdated = (updated: BillingPacketSummary) => setPackets((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  // Follows the packet's current send state, so the "press Email" cue disappears once it is sent.
  const lastCreatedCue = lastCreated ? postSignCue(packets.find((p) => p.id === lastCreated.id) ?? lastCreated) : null;

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 900 }}>
      <section id="billing-packet-list" className="portal-profile-section-card">
        <div className="portal-profile-section-card__header">
          <h2 className="portal-profile-section-card__title">Signed packets</h2>
        </div>
        <div className="portal-profile-section-card__body">
          {lastCreatedCue ? (
            <p role="status" style={{ margin: '0 0 0.75rem', fontWeight: 600, color: 'var(--wa-success-dark)' }}>
              {lastCreatedCue}
            </p>
          ) : null}
          <BillingPacketList
            packets={packets}
            canSend
            counselorLabel={props.counselorLabel}
            memberEmail={props.memberEmail}
            onPacketUpdated={onPacketUpdated}
            onSupersede={(p) => {
              setSupersede({ id: p.id, packetNumber: p.packetNumber, reason: '' });
              document.getElementById('billing-packet-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            emptyText="No J5/J6 packets for this member yet. Create the first one below."
          />
        </div>
      </section>

      <form id="billing-packet-form" onSubmit={handleSubmit} className="portal-profile-section-card" noValidate>
        <div className="portal-profile-section-card__header">
          <h2 className="portal-profile-section-card__title">Create a new J5 invoice + J6 cover letter</h2>
        </div>
        <div className="portal-profile-section-card__body" style={{ display: 'grid', gap: '1.25rem' }}>
          {supersede ? (
            <div role="note" style={{ display: 'grid', gap: '0.4rem', padding: '0.75rem', border: '1px solid var(--color-accent, #ad2c4d)', borderRadius: 8 }}>
              <strong>Superseding invoice {supersede.packetNumber}</strong>
              <span style={{ fontSize: '0.85rem' }}>
                Signing this form marks {supersede.packetNumber} as superseded (kept for the record) and issues this packet as its replacement. All the normal checks still apply.
              </span>
              <label style={labelStyle}>
                Reason
                <input style={inputStyle} value={supersede.reason} onChange={(e) => setSupersede({ ...supersede, reason: e.target.value })} required />
              </label>
              <button type="button" className="btn btn-outline" style={{ minHeight: 36, justifySelf: 'start' }} onClick={() => setSupersede(null)}>
                Cancel supersede
              </button>
            </div>
          ) : null}
          {props.programs.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-accent, #ad2c4d)', fontWeight: 600 }}>
              This member is not enrolled in a program yet. Assign a program from the member page first.
            </p>
          ) : null}

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={labelStyle}>
              Program
              <select style={inputStyle} value={draft.programSlug} onChange={(e) => changeProgram(e.target.value)} disabled={props.programs.length === 0}>
                {props.programs.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                    {p.isPrimary ? ' (primary)' : ''}
                    {p.unavailableReason ? ' (not available for billing)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Invoice date
              <input type="date" style={inputStyle} value={draft.invoiceDate} onChange={(e) => set('invoiceDate', e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Due date
              <input type="date" style={inputStyle} value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Board / ITA / voucher reference
              <input style={inputStyle} value={draft.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Bill to (funding partner)</legend>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelStyle}>
                Organization
                <input style={inputStyle} value={draft.billToName} onChange={(e) => set('billToName', e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Attention
                <input style={inputStyle} value={draft.billToAttention} onChange={(e) => set('billToAttention', e.target.value)} placeholder="Accounts Payable" />
              </label>
              <label style={labelStyle}>
                Email (printed on invoice)
                <input type="email" style={inputStyle} value={draft.billToEmail} onChange={(e) => set('billToEmail', e.target.value)} placeholder="Optional" />
              </label>
            </div>
            <label style={labelStyle}>
              Mailing address
              <textarea style={{ ...inputStyle, minHeight: 70 }} value={draft.billToAddress} onChange={(e) => set('billToAddress', e.target.value)} placeholder={'Street\nCity, ST ZIP'} />
            </label>
          </fieldset>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>Classes and price breakdown</strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-muted, #64748b)' }}>
                {selectedProgram ? `Prefilled with ${PRICING_SOURCE_LABEL[selectedProgram.pricingSource]}. Edit any row.` : ''}
              </span>
            </div>
            {selectedProgram?.unavailableReason ? (
              <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--color-accent, #ad2c4d)' }}>{selectedProgram.unavailableReason}</p>
            ) : null}
            {selectedProgram?.pricingSource === 'price_list_default' && !selectedProgram.unavailableReason ? (
              <p role="note" style={{ margin: 0, fontWeight: 600, color: 'var(--color-accent, #ad2c4d)' }}>
                No catalog or syllabus price is on file for this program. Enter the actual approved tuition from the ITA or contract.
                {selectedProgram.priceListMaximum != null ? ` Price list maximum: ${formatMoney(selectedProgram.priceListMaximum)} (ceiling, not a charge).` : ''}
              </p>
            ) : null}
            <div role="group" aria-label="Invoice line items" style={{ display: 'grid', gap: '0.4rem' }}>
              <div
                aria-hidden="true"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                  gap: '0.5rem',
                  padding: '0 0.3rem',
                  color: 'var(--color-muted, #64748b)',
                  fontSize: '0.8125rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
                className="billing-row-head"
              >
                <span>Class / item</span>
                <span>Contact hours</span>
                <span>Amount (USD)</span>
                <span />
              </div>
              {draft.lineItems.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.15rem 0.3rem',
                  }}
                >
                  <input aria-label={`Item ${i + 1} description`} style={inputStyle} value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} required />
                  <input
                    aria-label={`Item ${i + 1} contact hours`}
                    type="number"
                    min={0}
                    step="0.5"
                    style={inputStyle}
                    value={row.hours ?? ''}
                    placeholder="n/a"
                    onChange={(e) => updateRow(i, { hours: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <input
                    aria-label={`Item ${i + 1} amount`}
                    type="number"
                    min={0}
                    step="0.01"
                    style={inputStyle}
                    value={row.amount != null && Number.isFinite(row.amount) ? row.amount : ''}
                    placeholder="Enter amount"
                    onChange={(e) => updateRow(i, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                    required
                  />
                  <button type="button" className="btn btn-outline" style={{ minHeight: 36, minWidth: 36, padding: '0 0.5rem' }} onClick={() => removeRow(i)} aria-label={`Remove item ${i + 1}`}>
                    &times;
                  </button>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                  gap: '0.5rem',
                  padding: '0.5rem 0.3rem',
                  fontWeight: 700,
                  borderTop: '1px solid var(--outline-variant, #cbd5e1)',
                }}
              >
                <span style={{ textAlign: 'right' }}>Totals</span>
                <span>{hours} hrs</span>
                <span>{formatMoney(total)}</span>
                <span />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={() => addRow('class')}>
                Add class
              </button>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={() => addRow('fee')}>
                Add fee
              </button>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={resetRows} disabled={!selectedProgram}>
                Reset to program default
              </button>
            </div>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Funding attestation (staff-recorded, required before signing)</legend>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted, #64748b)' }}>
              This records what you checked and where. It is not proof of Board or contract approval.
            </p>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelStyle}>
                Funding basis
                <select style={inputStyle} value={draft.fundingBasis} onChange={(e) => set('fundingBasis', e.target.value as Draft['fundingBasis'])} required>
                  <option value="">Select…</option>
                  <option value="wioa_ita">WIOA ITA</option>
                  <option value="separate_contract">Separate contract</option>
                </select>
              </label>
              <label style={labelStyle}>
                Approved amount (USD)
                <input type="number" min={0} step="0.01" style={inputStyle} value={draft.approvedAmount} onChange={(e) => set('approvedAmount', e.target.value)} required />
              </label>
              <label style={labelStyle}>
                ITA approval / contract reference
                <input style={inputStyle} value={draft.fundingReference} onChange={(e) => set('fundingReference', e.target.value)} required />
              </label>
            </div>
            {warnings.length > 0 ? (
              <>
                <p role="note" style={{ margin: 0, fontWeight: 600, color: 'var(--color-accent, #ad2c4d)' }}>{warnings.join(' ')}</p>
                <label style={labelStyle}>
                  Exception note (optional, staff-entered, unverified)
                  <input style={inputStyle} value={draft.exceptionNote} onChange={(e) => set('exceptionNote', e.target.value)} />
                </label>
              </>
            ) : null}
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={isConfirmed('funding')} onChange={(e) => toggle('funding', e.target.checked)} style={{ marginTop: 4 }} />
              <span>I checked the funding basis, approved amount and reference above against the Board-issued ITA or the contract.</span>
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={isConfirmed('tuition')} onChange={(e) => toggle('tuition', e.target.checked)} style={{ marginTop: 4 }} />
              <span>The tuition row amounts match the ITA or contract (not the price-list maximum).</span>
            </label>
          </fieldset>

          <label style={labelStyle}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              J6 cover letter narrative
              <button type="button" className="btn btn-outline" style={{ minHeight: 32, fontSize: '0.8125rem' }} onClick={resetNarrative}>
                Reset narrative to default
              </button>
            </span>
            <textarea
              style={{ ...inputStyle, minHeight: 160, fontFamily: 'inherit', lineHeight: 1.5 }}
              value={draft.coverLetterBody}
              onChange={(e) => set('coverLetterBody', e.target.value)}
              required
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted, #64748b)', fontWeight: 400 }}>
              Prose only. Date, addressee, RE line, the facts block below, closing and signature are added automatically. Start lines with &ldquo;- &rdquo; for bullets.
            </span>
            {narrativeBlocks.length > 0 ? (
              <span role="alert" style={{ fontSize: '0.85rem', color: 'var(--color-accent, #ad2c4d)', fontWeight: 600 }}>{narrativeBlocks.join(' ')}</span>
            ) : null}
            {hints.length > 0 ? (
              <span role="note" style={{ fontSize: '0.85rem', color: 'var(--color-muted, #64748b)' }}>{hints.join(' ')}</span>
            ) : null}
          </label>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <strong>J6 facts block (generated from the rows and funding above; not editable)</strong>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {facts.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={isConfirmed('facts')} onChange={(e) => toggle('facts', e.target.checked)} style={{ marginTop: 4 }} />
              <span>I reviewed the J6 facts block and the narrative text; the narrative is not machine-checked beyond amounts.</span>
            </label>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={labelStyle}>
              Signer name
              <input style={inputStyle} value={draft.signerName} onChange={(e) => set('signerName', e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Signer title
              <input style={inputStyle} value={draft.signerTitle} onChange={(e) => set('signerTitle', e.target.value)} required />
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <strong>Signature</strong>
            <SignaturePad signerName={draft.signerName} value={signature} onChange={setSignature} />
          </div>

          {msg ? (
            <p role="status" style={{ margin: 0, fontWeight: 600, color: msg.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--color-accent, #ad2c4d)' }}>
              {msg.text}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn" style={{ minHeight: 46, padding: '0 1.25rem' }} disabled={saving || props.programs.length === 0 || draft.lineItems.length === 0 || missingAmount || narrativeBlocks.length > 0 || Boolean(selectedProgram?.unavailableReason)}>
              {saving ? 'Creating…' : `${supersede ? `Supersede ${supersede.packetNumber} and create` : 'Create'} signed J5 + J6 (${formatMoney(total)})`}
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #64748b)' }}>
              Creates both PDFs with your signature. Emailing is a separate button so you can review first.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
